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

// Consolidated to single path for simplicity: apply_structured_rows only for tabular updates

// Enhanced to infer mappings from natural language to exact headers; handles invalid headers.
export const semanticMap: Record<string, string> = {
  client: 'Vendor',
  saw: 'Vendor',
  sold: 'Fuel Cost in Rands',
  amount: 'Fuel Cost in Rands',
  location: 'TOWN VISITED',
  town: 'TOWN VISITED',
  notes: 'Notes',
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
  const hydratedContextResolved = JSON.stringify({ sheetHeaders: headers, headers, sampleRows });
  const semanticMapResolved = JSON.stringify(semanticMap);

  // Enabled semantic inference for mappings; no user JSON required.
  const template = `You are an AI planner for a Google Sheets assistant. Analyze the user's message to update a sheet and map data to exact column headers.
Key rules:

- Set intent to 'update_data' for any update request.
- Fetch exact headers from {hydratedContext.sheetHeaders} (e.g., ['Date', 'Vendor', 'TOWN VISITED', 'Fuel Cost in Rands', 'Notes']).
- Infer user inputs to headers using simple rules: 'client'/'saw' → 'Vendor', 'sold'/'amount' → 'Fuel Cost in Rands', 'location'/'town' → 'TOWN VISITED', notes → 'Notes', add current date (MM/DD/YYYY) to 'Date' if missing.
- Generate a row object with exact header keys and inferred values. Do not require JSON input—map natural language internally.
- Use 'apply_structured_rows' with params: {rows: [inferred row], dryRun: true}.
- If headers are empty or invalid, clarify: 'No valid headers found. Please specify columns like Date, Vendor, etc.'
- If mapping fails, clarify: 'Could not map [unmapped terms]. Available columns: {sheetHeaders}. Please clarify.'
- Output JSON: intent, tools (with 'apply_structured_rows' and rows), toolChain, clarify.

User message: {userMessage}
Sheet context: {hydratedContext}
Semantic map: {semanticMap}`;

  // Compatibility block: include resolved values so models and tests see concrete content
  const compatibility = `

User message (resolved): ${JSON.stringify(message)}
Headers: [${headersList}]
Sheet context (resolved): ${hydratedContextResolved}
Semantic map (resolved): ${semanticMapResolved}`;

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
    // Consolidated to single path for simplicity: apply_structured_rows only for tabular updates
    const tools = Array.isArray(parsed.tools)
      ? parsed.tools.map((t: any) => ({
          name: String(t?.name || '').toLowerCase() === 'update_sheet' ? 'apply_structured_rows' : String(t?.name || ''),
          args: (typeof t?.args === 'object' && t?.args) ? t.args : {}
        }))
      : [];
    const toolChain = Array.isArray(parsed.toolChain)
      ? parsed.toolChain.map((s: any) => ({
          toolName: String(s?.toolName || ''),
          params: (typeof s?.params === 'object' && s?.params) ? s.params : {},
          dependsOn: Array.isArray(s?.dependsOn) ? s.dependsOn.map((i: any) => Number(i)).filter((n: number) => Number.isFinite(n) && n >= 0) : [],
        }))
      : [];
    // Enforce single-tool path + preview-first: rewrite update_sheet->apply_structured_rows and set dryRun
    const committedChain = toolChain.map((step: { toolName: string; params: Record<string, unknown>; dependsOn?: number[] }) => {
      const name = String(step.toolName || '').toLowerCase();
      if (name === 'update_sheet') {
        return { ...step, toolName: 'apply_structured_rows', params: { ...(step.params || {}), dryRun: true, commit: false } };
      }
      if (name === 'apply_structured_rows') {
        return { ...step, params: { ...(step.params || {}), dryRun: true, commit: false } };
      }
      return step;
    });

    // Post-parse enforcement: if apply_structured_rows contains unmapped keys (not in exact headers), request clarification
    let clarifyQuestion: string | null = typeof parsed.clarifyQuestion === 'string' ? parsed.clarifyQuestion : (typeof (parsed as any).clarify === 'string' ? (parsed as any).clarify : null);
    try {
      const headers: string[] = Array.isArray((context as any)?.sheetHeaders) ? ((context as any).sheetHeaders as string[]) : [];
      const invalidKeys = new Set<string>();
      const inspectRows = (rows: unknown) => {
        if (!Array.isArray(rows)) return;
        for (const r of rows) {
          if (r && typeof r === 'object') {
            for (const k of Object.keys(r as Record<string, unknown>)) {
              if (!headers.includes(k)) invalidKeys.add(k);
            }
          }
        }
      };
      // Inspect tools array
      for (const t of tools) {
        if (String((t as any)?.name || '').toLowerCase() === 'apply_structured_rows') {
          inspectRows((t as any)?.args?.rows);
        }
      }
      // Inspect toolChain array
      for (const step of committedChain as any[]) {
        if (String(step?.toolName || '').toLowerCase() === 'apply_structured_rows') {
          inspectRows(step?.params?.rows);
        }
      }
      if (invalidKeys.size > 0 && headers.length > 0 && !clarifyQuestion) {
        clarifyQuestion = `I could not map some fields to exact sheet columns (${Array.from(invalidKeys).join(', ')}). Please provide the update as row objects using only these exact headers: ${headers.join(', ')}.`;
      }
    } catch {}

    return {
      intent,
      tools,
      toolChain: committedChain,
      clarifyQuestion,
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
