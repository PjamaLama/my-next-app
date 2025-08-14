import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';
import dayjs from 'dayjs';
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
  const hydratedContextResolved = JSON.stringify({
    sheetHeaders: headers,
    spreadsheetId: (context as any)?.spreadsheetId || null,
    sheetName: (context as any)?.sheetName || null,
  });
  const semanticMapResolved = JSON.stringify(semanticMap);

  // Enhanced prompt per user request to ensure spreadsheetId/sheetName propagation and direct row inference
  const template = `You are an AI planner for a Google Sheets assistant. Analyze the user's message to update a sheet and map data to exact column headers.
Key rules:

Set intent to 'update_data' for any update request.
Fetch exact headers from {hydratedContext.sheetHeaders} (e.g., ['Date', 'Vendor', 'TOWN VISITED', 'Fuel Cost in Rands', 'Notes']).
Infer user inputs to headers: 'client'/'saw' → 'Vendor', 'sold'/'amount' → 'Fuel Cost in Rands', 'location'/'town' → 'TOWN VISITED', notes → 'Notes', add current date (MM/DD/YYYY) to 'Date' if missing.
Generate a row object with exact header keys and inferred values from {userMessage} (e.g., 'saw francois in Howick, sold 3000k seed' → {Date: '08/14/2025', Vendor: 'Francois', TOWN VISITED: 'Howick', Fuel Cost in Rands: '3000', Notes: 'spoke about seed industry changes'}).
Use 'apply_structured_rows' with params: {spreadsheetId: {hydratedContext.spreadsheetId}, sheetName: {hydratedContext.sheetName}, rows: [inferred row], dryRun: true}.
Do not include 'resolve_column' in the toolChain unless querying existing sheet data is needed. If used, set query to select headers and sample rows (e.g., 'SELECT * FROM {sheetName} LIMIT 1').
If context is missing (e.g., no spreadsheetId or sheetName), clarify: 'Please specify the sheet to update.'
If mapping fails, clarify: 'Could not map [unmapped terms]. Available columns: {sheetHeaders}.'

Output JSON: intent, tools (with 'apply_structured_rows' and rows), toolChain, clarify.
User message: {userMessage}
Sheet context: {hydratedContext}`;

  // Compatibility block: include resolved values so models and tests see concrete content
  const compatibility = `

User message (resolved): ${JSON.stringify(message)}
Headers: [${headersList}]
Sheet context (resolved): ${hydratedContextResolved}
Semantic map (resolved): ${semanticMapResolved}`;

  return template + compatibility;
}

function normalizeCapitalization(input: string): string {
  if (!input) return input;
  return input
    .split(/\s+/)
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

function inferRowFromMessage(message: string, headers: string[]): Record<string, unknown> {
  const inferred: Record<string, unknown> = {};
  const lc = String(message || '').toLowerCase();

  // Date: always set if header exists
  if (headers.includes('Date')) {
    inferred['Date'] = dayjs().format('MM/DD/YYYY');
  }

  // Vendor extraction
  if (headers.includes('Vendor')) {
    const sawMatch = lc.match(/\b(?:saw|met|client)\s+([a-z][a-z\-\s']{1,40})/i);
    if (sawMatch) {
      inferred['Vendor'] = normalizeCapitalization(sawMatch[1].trim());
    }
  }

  // Town/location extraction
  if (headers.includes('TOWN VISITED')) {
    const inMatch = lc.match(/\b(?:in|at|to)\s+([a-z][a-z\-\s']{1,40})/i);
    if (inMatch) {
      inferred['TOWN VISITED'] = normalizeCapitalization(inMatch[1].trim());
    }
  }

  // Amount extraction for Fuel Cost in Rands
  if (headers.includes('Fuel Cost in Rands')) {
    // Find first numeric token; handle commas and simple trailing 'k' by stripping
    const numMatch = lc.match(/\b(\d{1,3}(?:,\d{3})*|\d+)(?:\.?\d+)?k?\b/);
    if (numMatch) {
      const digits = (numMatch[1] || '').replace(/,/g, '');
      inferred['Fuel Cost in Rands'] = digits;
    }
  }

  // Notes: fallback to original message if header present and not all other fields could be extracted
  if (headers.includes('Notes')) {
    inferred['Notes'] = message;
  }

  return inferred;
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

    // If intent is update, drop resolve_column steps from chain/tools; if any remain, ensure a safe query
    if (intent === 'update_data') {
      committedChain = committedChain.filter((s: any) => String(s?.toolName || '').toLowerCase() !== 'resolve_column');
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
        clarifyQuestion = `Could not map ${Array.from(invalidKeys).join(', ')}. Available columns: ${headers.join(', ')}.`;
      }
    } catch {}

    // Ensure apply_structured_rows carries spreadsheetId, sheetName, and rows. If missing rows, infer best-effort from message.
    try {
      const spreadsheetId = (context as any)?.spreadsheetId;
      const sheetName = (context as any)?.sheetName;
      const headers: string[] = Array.isArray((context as any)?.sheetHeaders) ? ((context as any).sheetHeaders as string[]) : [];

      const ensureParams = (params: any): any => {
        const updated: any = { ...(params || {}) };
        if (spreadsheetId) updated.spreadsheetId = spreadsheetId;
        if (sheetName) updated.sheetName = sheetName;
        // rows handling
        if (!Array.isArray(updated.rows) || updated.rows.length === 0) {
          const inferred = inferRowFromMessage(message, headers);
          if (Object.keys(inferred).length > 0) {
            updated.rows = [inferred];
          }
        }
        updated.dryRun = true;
        return updated;
      };

      // Update tools array
      for (const t of tools) {
        if (String((t as any)?.name || '').toLowerCase() === 'apply_structured_rows') {
          (t as any).args = ensureParams((t as any).args);
        }
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
      // Debug log of final planner params
      // eslint-disable-next-line no-console
      console.log('Planner params:', { spreadsheetId, sheetName, rows });

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
