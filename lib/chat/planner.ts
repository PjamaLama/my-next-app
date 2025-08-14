import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';
import { Context, ConversationHistoryItem } from './types';

export type PlannerPlan = {
  intent: 'describe_data' | 'update_data' | 'get_data' | 'other';
  reasoning: string | null;
  tools: Array<{ name: string; args: Record<string, unknown> }>;
  toolChain: Array<{ toolName: string; params: Record<string, unknown>; dependsOn?: number[] }>;
  clarifyQuestion: string | null;
};

function buildPrompt(message: string, context: Context, history: ConversationHistoryItem[], hasFiles: boolean): string {
  // Preserve placeholders in the template, but also include resolved context for grounding and tests
  const headers: string[] = Array.isArray((context as any)?.sheetHeaders)
    ? ((context as any).sheetHeaders as string[])
    : [];
  const headersList = headers.map((h) => JSON.stringify(String(h))).join(', ');
  const sampleRows = Array.isArray((context as any)?.sheetRows)
    ? ((context as any).sheetRows as unknown[]).slice(0, 3)
    : Array.isArray((context as any)?.sheetData)
      ? ((context as any).sheetData as unknown[]).slice(0, 3)
      : [];
  const hydratedContextResolved = JSON.stringify({ headers, sampleRows });

  const template = `You are an AI planner for a Google Sheets assistant. Analyze the user's message and plan the best actions.
Key rules:

For any request involving updating, editing, adding, or modifying sheet data (e.g., add rows, update cells, change values), set intent to 'update_data'.
Always prioritize structured, tabular outputs: If the update can be represented as rows with keys matching sheet columns exactly, use the 'apply_structured_rows' tool. This tool generates previews as row objects that must map perfectly to existing sheet headers (use synonyms from sheetConfig if needed, but aim for exact matches).
Do not use 'update_sheet' unless the update is purely free-text or non-tabular (e.g., no clear row/column structure). Even then, attempt to structure it as rows.
For all updates, enforce a preview-first flow: Set tool parameters to include 'dryRun: true' or equivalent to generate a proposed data table without committing changes.
Ensure the plan includes dependency on hydrating full sheet context first (via SheetDataSource) to get exact headers and current data for accurate mapping and deduplication.
If the update data isn't fully specified, add a 'clarify' prompt to ask for missing details before proceeding.
Output format: JSON with keys: intent (update_data for edits), tools (array with 'apply_structured_rows' preferred), toolChain (for dependencies like sheet_query first), clarify (optional prompts).

User message: {userMessage}
Sheet context: {hydratedContext}  // Include current headers and sample rows for grounding`;

  // Compatibility block: include resolved values so models and tests see concrete content
  const compatibility = `

User message (resolved): ${JSON.stringify(message)}
Headers: [${headersList}]
Sheet context (resolved): ${hydratedContextResolved}`;

  return template + compatibility;
}

export async function generatePlan(
  message: string,
  context: Context,
  conversationHistory: ConversationHistoryItem[],
  hasFiles: boolean
): Promise<PlannerPlan> {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  const ai = genkit({ plugins: [googleAI({ apiKey })], model: gemini15Flash });
  const prompt = buildPrompt(message, context, conversationHistory || [], !!hasFiles);
  const { text } = await ai.generate(prompt);
  try {
    let cleaned = String(text || '').trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const intent: PlannerPlan['intent'] = ['describe_data', 'update_data', 'get_data', 'other'].includes(parsed.intent)
      ? parsed.intent
      : 'other';
    const tools = Array.isArray(parsed.tools) ? parsed.tools : [];
    const toolChain = Array.isArray(parsed.toolChain)
      ? parsed.toolChain.map((s: any) => ({
          toolName: String(s?.toolName || ''),
          params: (typeof s?.params === 'object' && s?.params) ? s.params : {},
          dependsOn: Array.isArray(s?.dependsOn) ? s.dependsOn.map((i: any) => Number(i)).filter((n: number) => Number.isFinite(n) && n >= 0) : [],
        }))
      : [];
    // Enforce preview-first: prefer dryRun: true; do NOT auto-commit
    const committedChain = toolChain.map((step: { toolName: string; params: Record<string, unknown>; dependsOn?: number[] }) => {
      const name = String(step.toolName || '').toLowerCase();
      if (name === 'update_sheet' || name === 'apply_structured_rows') {
        return { ...step, params: { ...(step.params || {}), dryRun: true, commit: false } };
      }
      return step;
    });

    return {
      intent,
      tools,
      toolChain: committedChain,
      clarifyQuestion: typeof parsed.clarifyQuestion === 'string' ? parsed.clarifyQuestion : (typeof (parsed as any).clarify === 'string' ? (parsed as any).clarify : null),
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : null,
    };
  } catch {
    // Safe fallback with a best-guess tool
    const summaryLike = /tell\s+me\s+about|summariz|what\s+i\s+did|overview/i.test(message || '');
    if (summaryLike) {
      return { intent: 'describe_data', tools: [{ name: 'describe_sheet', args: {} }], toolChain: [], clarifyQuestion: null, reasoning: 'Summary-like request.' };
    }
    return { intent: 'get_data', tools: [{ name: 'get_sheet_data', args: {} }], toolChain: [], clarifyQuestion: null, reasoning: 'Fallback planner.' };
  }
}
