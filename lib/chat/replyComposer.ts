import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';

// Cleaned up; tables built in processMessage, not here.

type ComposeTable = { title?: string; headers: string[]; rows: string[][]; summary?: string };
type ComposeChart = { kind: 'bar' | 'line' | 'pie'; title?: string; labels: string[]; datasets: Array<{ label: string; data: number[] }> };

type ComposeInput = {
  userMessage: string;
  qaAnswer?: string;
  tables?: ComposeTable[];
  charts?: ComposeChart[];
  insights?: string[];
  toolSummaries?: string[];
  plan?: any;
  toolResults?: any[];
  inferences?: Record<string, string> | null;
};

export const CLARIFY_UNPARSED_TEMPLATE =
  'I found the {column} column but {unparsed} of {total} cells couldn’t be parsed as numbers (examples: {examples}). Confirm I should ignore those or edit them?';

function buildClarifyUnparsedMessage(column: string, total: number, unparsed: number, examples: string[]): string {
  const msg = CLARIFY_UNPARSED_TEMPLATE
    .replace('{column}', column)
    .replace('{unparsed}', String(unparsed))
    .replace('{total}', String(total))
    .replace('{examples}', examples.slice(0, 5).join(', '));
  // Include suggested quick reply labels inline for the client UI to optionally map to buttons
  return `${msg}\n\nOptions: [Ignore unparsed] [Show rows] [Cancel]`;
}

export async function composeGroundedReply(input: ComposeInput): Promise<string> {
  const { userMessage, qaAnswer, tables = [], charts = [], insights = [], toolSummaries = [], plan, toolResults, inferences } = input;

  // Prefer QA summary if available
  try {
    if (typeof qaAnswer === 'string' && qaAnswer.trim()) {
      return qaAnswer.trim();
    }
  } catch {}

  // Pre-answer validation for aggregate provenance
  try {
    if (plan && plan.intent === 'aggregate') {
      const aggResult = Array.isArray(toolResults)
        ? toolResults.find((r: any) => r && r.provenance)
        : undefined;
      const prov = aggResult?.provenance as undefined | { rowsExamined: number; parsedCount: number; unparsedCount: number; sampleUnparsed?: Array<{ rowIndex: number; rawValue: string }> };
      const numeric = aggResult?.numeric as undefined | { column?: string; sum?: number };
      const columnLabel = String(numeric?.column || plan?.targetColumn || 'selected column');

      if (!prov || !(prov.parsedCount > 0)) {
        const examples = prov?.sampleUnparsed?.map((x) => x.rawValue) || [];
        return buildClarifyUnparsedMessage(columnLabel, prov?.rowsExamined || 0, prov?.unparsedCount || 0, examples);
      }

      const ratio = prov.rowsExamined > 0 ? prov.parsedCount / prov.rowsExamined : 0;
      if (prov.unparsedCount > 0 && ratio < 0.8) {
        const examples = (prov.sampleUnparsed || []).map((x) => x.rawValue);
        return buildClarifyUnparsedMessage(columnLabel, prov.rowsExamined, prov.unparsedCount, examples);
      }

      // Ratio OK → include explicit provenance in a concise deterministic reply
      if (typeof numeric?.sum === 'number') {
        const sampleUnparsed = (prov.sampleUnparsed || []).slice(0, 3).map((x) => x.rawValue);
        const provenanceBits = [`computed from ${prov.parsedCount} row(s)`];
        if (prov.unparsedCount > 0 && sampleUnparsed.length > 0) provenanceBits.push(`had ${prov.unparsedCount} unparsed (e.g., ${sampleUnparsed.join(', ')})`);
        return `Total ${columnLabel} = ${Number(numeric.sum.toFixed(2))} (${provenanceBits.join('; ')})`;
      }
    }
  } catch {}

  // Clarification polish: if plan requests clarification, generate a natural prompt
  try {
    if (plan && typeof plan.clarifyQuestion === 'string' && plan.clarifyQuestion.trim()) {
      const options = Array.isArray(plan?.headers) ? (plan.headers as string[]) : [];
      const optsText = options.length ? ` Options: [Use the ColumnChooser to select: ${options.join(', ')}].` : '';
      const preface = /which column/i.test(plan.clarifyQuestion)
        ? 'To compute totals, which column has the values?'
        : plan.clarifyQuestion;
      const quick = ['Show chart', 'Update values', 'Preview updates'];
      return `${preface}${optsText}\nQuick replies: [${quick.join('] [')}]`;
    }
  } catch {}

  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  const ai = genkit({ plugins: [googleAI({ apiKey })], model: gemini15Flash });

  // Determine if a preview exists (by title only; table rendering handled elsewhere)
  const hasPreview = Array.isArray(tables) && tables.some(t => /Proposed Sheet Updates/i.test(String(t.title)));

  const contextBits: string[] = [];
  if (Array.isArray(toolSummaries) && toolSummaries.length > 0) {
    contextBits.push(`Tool results: ${toolSummaries.slice(0, 5).join('; ')}`);
  }
  if (Array.isArray(insights) && insights.length > 0) {
    contextBits.push(`Include novel insights from: ${insights.slice(0, 3).join('; ')}`);
  }
  if (Array.isArray(charts) && charts.length > 0) {
    const chartNotes = charts.map(chart => `Visualizing with a ${chart.kind} chart: ${chart.title || 'Data visualization'}`).join('; ');
    contextBits.push(chartNotes);
  }
  if (inferences && typeof inferences === 'object' && Object.keys(inferences).length > 0) {
    const inferenceNotes = Object.entries(inferences).map(([column, reason]) => `Inferred ${column} from ${reason}`).join('; ');
    contextBits.push(inferenceNotes);
  }

  // Attempt to derive a minimal sheet context for grounding (headers of preview table if present)
  const previewTable = Array.isArray(tables) ? tables.find(t => /Proposed Sheet Updates/i.test(String(t.title))) : undefined;
  const sheetContext = previewTable ? `Headers: ${previewTable.headers.join(', ')}` : '';

  const prefix = qaAnswer && qaAnswer.trim() ? `Base answer: ${qaAnswer.trim()}` : '';
  // Updated to support inferred mappings; no JSON demands in replies.
  const previewHint = hasPreview
    ? `\nBased on your request, I've mapped it to the sheet like this. Approve, edit, or reject?\nHere's the proposed updates (adds/updates) in a table. Review and click 'Approve' to apply, 'Edit' to modify, or 'Reject' to cancel.\n\nNote: The Action column shows whether each row will be added as new or updated if it matches an existing row. Updated cells are highlighted in bold.`
    : '';

  const prompt = [
    'Compose a helpful assistant reply based on tool results, QA, tables, and charts. Be concise and grounded; do not fabricate.',
    'Key instructions for updates:',
    '- For previews, briefly explain the inferred mappings (e.g., "Mapped \"client Francois\" to Vendor, \"sold 3000k\" to Fuel Cost in Rands, \"Howick\" to TOWN VISITED, notes to Notes").',
    "- Do not ask for JSON or exact formats—assume inference worked.",
    "- If mapping was ambiguous, include clarification questions.",
    "- Include this instructional text when a preview exists: Here's the proposed updates in a table. Review and click 'Approve' to add, 'Edit' to modify, or 'Reject' to cancel.",
    '- Include novel insights when provided to enhance the response.',
    '- If charts are mentioned, note that visualizations are available via the UI ChartRenderer.',
    '- When inferences are present, mention them naturally (e.g., "I filled in the Date field with today\'s date and Driver from recent entries"). Include in preview table as bold/italic for inferred cells.',
    'Ground on context for accuracy.',
    prefix,
    contextBits.join('\n'),
    (sheetContext ? `Context: ${sheetContext}` : ''),
    `User: ${userMessage}`
  ].filter(Boolean).join('\n\n');

  const { text } = await ai.generate(prompt);
  const out = (text || '').trim();
  return (out + previewHint).trim() || 'I analyzed your data.';
}


