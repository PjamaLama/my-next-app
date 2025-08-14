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

// Lightweight planner:
// - Focus on intent detection and tool planning
// - For updates, enforce a single-path using apply_structured_rows with dryRun: true
// - No sheet-specific rules or hard-coded mappings

function buildPrompt(message: string, context: Context, history: ConversationHistoryItem[], hasFiles: boolean): string {
  // Preserve placeholders in the template, but also include resolved context for grounding and tests
  const headers: string[] = Array.isArray((context as any)?.sheetHeaders)
    ? ((context as any).sheetHeaders as string[])
    : [];
  const headersList = headers.map((h) => JSON.stringify(String(h))).join(', ');
  const sheetDataSample = Array.isArray((context as any)?.sheetData)
    ? ((context as any).sheetData as any[]).slice(0, 3)
    : [];
  const fileDataSample = Array.isArray((context as any)?.fileData)
    ? ((context as any).fileData as any[]).slice(0, 3)
    : [];
  const hydratedContextResolved = JSON.stringify({
    sheetHeaders: headers,
    spreadsheetId: (context as any)?.spreadsheetId || null,
    sheetName: (context as any)?.sheetName || null,
    sheetNames: (context as any)?.sheetNames || [],
    fileDataSample,
    sheetDataSample,
  });
  // Build a compact conversation history string for grounding
  const historyText = Array.isArray(history)
    ? history
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '').slice(0, 400)}`)
        .join('\n')
    : '';

  // Lightweight prompt content focusing on intent and planning without sheet-specific rules
  const template = `You are an AI planner for a Google Sheets assistant.
  Decide the user's intent: 'update_data', 'describe_data', 'get_data', or 'other'.

  Principles:
  - Use exact column headers from {hydratedContext.sheetHeaders}. Do not assume synonyms.
  - For updates, plan a single tool only: { name: 'apply_structured_rows', args: { spreadsheetId, sheetName, rows, dryRun: true } }.
  - Do not include 'resolve_column' or any other tools for updates. toolChain must be empty for updates.
  - If spreadsheetId or sheetName is missing, set clarifyQuestion accordingly and do not produce rows.
  - If you cannot confidently form rows from the message and context, set clarifyQuestion asking the user to specify column-value pairs.
  - For describe/get requests, you may include a toolChain (e.g., get_sheet_data → aggregate), or leave it empty.

  Output JSON with: intent, tools, toolChain, clarifyQuestion, and reasoning.

  Conversation history: {conversationHistory}
  User message: {userMessage}
  Sheet context: {hydratedContext}`;

  // Compatibility block: include resolved values so models and tests see concrete content
  const compatibility = `

User message (resolved): ${JSON.stringify(message)}
Headers: [${headersList}]
Sheet context (resolved): ${hydratedContextResolved}
Conversation history (resolved): ${historyText}`;

  return template + compatibility;
}

// No hard-coded extraction helpers; rely on the model and caller context for mapping.

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
    let tools = Array.isArray(parsed.tools)
      ? parsed.tools.map((t: any) => ({
          name: String(t?.name || '').toLowerCase() === 'update_sheet' ? 'apply_structured_rows' : String(t?.name || ''),
          args: (typeof t?.args === 'object' && t?.args) ? t.args : {}
        }))
      : [];
    let toolChain = Array.isArray(parsed.toolChain)
      ? parsed.toolChain.map((s: any) => ({
          toolName: String(s?.toolName || ''),
          params: (typeof s?.params === 'object' && s?.params) ? s.params : {},
          dependsOn: Array.isArray(s?.dependsOn) ? s.dependsOn.map((i: any) => Number(i)).filter((n: number) => Number.isFinite(n) && n >= 0) : [],
        }))
      : [];
    // Enforce single-tool path + preview-first: rewrite update_sheet->apply_structured_rows and set dryRun
    // Fixed context propagation for spreadsheetId, sheetName; bypassed resolve_column for updates.
    let committedChain = toolChain.map((step: { toolName: string; params: Record<string, unknown>; dependsOn?: number[] }) => {
      const name = String(step.toolName || '').toLowerCase();
      if (name === 'update_sheet') {
        return { ...step, toolName: 'apply_structured_rows', params: { ...(step.params || {}), dryRun: true, commit: false } };
      }
      if (name === 'apply_structured_rows') {
        return { ...step, params: { ...(step.params || {}), dryRun: true, commit: false } };
      }
      return step;
    });

    // Removed resolve_column for updates to simplify flow.
    // If intent is update, do not include resolve_column and keep toolChain empty for updates
    if (intent === 'update_data') {
      committedChain = [];
    } else {
      committedChain = committedChain.map((s: any) => {
        if (String(s?.toolName || '').toLowerCase() === 'resolve_column') {
          const sheetName = String((context as any)?.sheetName || 'Sheet1');
          return { ...s, params: { ...(s.params || {}), query: `SELECT * FROM ${sheetName} LIMIT 1` } };
        }
        return s;
      });
    }

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
        clarifyQuestion = `Could not map some terms to columns: ${Array.from(invalidKeys).join(', ')}. Available: ${headers.join(', ')}. Please clarify which columns to use.`;
      }
    } catch {}

    // Ensure apply_structured_rows carries spreadsheetId and sheetName; do not synthesize rows here.
    try {
      const spreadsheetId = (context as any)?.spreadsheetId;
      const sheetName = (context as any)?.sheetName;
      const ensureParams = (params: any): any => {
        const updated: any = { ...(params || {}) };
        if (spreadsheetId) updated.spreadsheetId = spreadsheetId;
        if (sheetName) updated.sheetName = sheetName;
        updated.dryRun = true;
        return updated;
      };

      // Update tools array and filter to only apply_structured_rows for updates; synthesize if missing
      tools = tools
        .filter((t: any) => intent !== 'update_data' || String((t as any)?.name || '').toLowerCase() === 'apply_structured_rows')
        .map((t: any) => {
          if (String((t as any)?.name || '').toLowerCase() === 'apply_structured_rows') {
            (t as any).args = ensureParams((t as any).args);
          }
          // Mirror args to params for compatibility with logging and downstream expectations
          (t as any).params = (t as any).args;
          return t;
        });
      if (intent === 'update_data' && !tools.find((t: any) => String((t as any)?.name || '').toLowerCase() === 'apply_structured_rows')) {
        const synthesized = { name: 'apply_structured_rows', args: ensureParams({}) } as any;
        synthesized.params = synthesized.args;
        tools.push(synthesized);
      }
      // Update toolChain entries
      committedChain = (committedChain as any[]).map((s) => {
        if (String(s?.toolName || '').toLowerCase() === 'apply_structured_rows') {
          return { ...s, params: ensureParams(s.params) };
        }
        return s;
      });

      const firstApply = (committedChain as any[]).find((s) => String(s?.toolName || '').toLowerCase() === 'apply_structured_rows');
      const rows = firstApply?.params?.rows || (tools.find((t: any) => String(t?.name || '').toLowerCase() === 'apply_structured_rows') as any)?.args?.rows;
      // Debug log of final planner output
      // eslint-disable-next-line no-console
      console.log('Planner output:', { intent, tools, toolChain: committedChain, clarify: clarifyQuestion, rows: (tools as any)?.[0]?.params?.rows });

      // If critical context missing, ask to clarify
      if ((!spreadsheetId || !sheetName) && intent === 'update_data' && !clarifyQuestion) {
        clarifyQuestion = 'Please specify the sheet to update.';
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
