import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';

type ComposeTable = { title?: string; headers: string[]; rows: string[][]; summary?: string };
type ComposeChart = { kind: 'bar' | 'line' | 'pie'; title?: string; labels: string[]; datasets: Array<{ label: string; data: number[] }> };

type ComposeInput = {
  userMessage: string;
  qaAnswer?: string;
  tables?: ComposeTable[];
  charts?: ComposeChart[];
  insights?: string[];
  toolSummaries?: string[];
  // Optional planning and results context for pre-answer validation
  plan?: any;
  toolResults?: any[];
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
  const { userMessage, qaAnswer, tables = [], charts = [], insights = [], toolSummaries = [], plan, toolResults } = input;

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
      if (prov.unparsedCount > 0 && ratio < 0.7) {
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

  const compactTables = tables.slice(0, 2).map(t => ({
    title: t.title || 'Table',
    headers: (t.headers || []).slice(0, 6),
    rows: (t.rows || []).slice(0, 5).map(r => (r || []).slice(0, 6)),
    summary: t.summary || ''
  }));
  const compactCharts = charts.slice(0, 2).map(c => ({
    kind: c.kind,
    title: c.title || '',
    labels: (c.labels || []).slice(0, 8),
    datasets: (c.datasets || []).map(d => ({ label: d.label, data: (d.data || []).slice(0, 8) }))
  }));

  const system = [
    'You are a helpful spreadsheet assistant.',
    'Ground your answer ONLY in the provided context (tables, charts, insights, tool summaries).',
    'If information is missing from the context, say you do not have enough information.',
    'Keep it concise, conversational, and specific. Avoid markdown tables unless asked.',
    'If the user intent suggests data updates, suggest "Preview updates" or "Apply changes" as next steps.'
  ].join(' ');

  const contextJson = JSON.stringify({
    qaAnswer: qaAnswer || null,
    toolSummaries,
    tables: compactTables,
    charts: compactCharts,
    insights: insights.slice(0, 5)
  });

  // If charts are present, prioritize visuals and suggest interactivity
  const visualsHint = (compactCharts && compactCharts.length > 0)
    ? '\nPrioritize the charts in your answer. Suggest interactive options like zoom or filter. Keep text minimal; if visuals suffice, keep the answer to one sentence.'
    : '';

  const prompt = `${system}${visualsHint}

User message:
${userMessage}

Context (ground truth JSON):
${contextJson}

Write a short, friendly answer grounded in the context.`;

  const { text } = await ai.generate(prompt);
  const out = (text || '').trim();
  if (compactCharts.length > 0) {
    // If visuals suffice, we keep this succinct
    return out.split('\n').slice(0, 2).join('\n') || 'See the chart above.';
  }
  return out || 'I analyzed your data.';
}


