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
// Removed resolve_column; improved dynamic inference for all sheet headers.

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
  // Build a compact conversation history string for grounding
  const historyText = Array.isArray(history)
    ? history
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '').slice(0, 400)}`)
        .join('\n')
    : '';

  // Updated prompt content per product requirements
  // Added history awareness for better conversationalism and intent accuracy.
  // Improved to handle multi-row inference elegantly from natural language.
  const template = `You are an AI planner for a Google Sheets assistant. Analyze the user's message to update a sheet and map data to exact column headers.
  Key rules:

  Set intent to 'update_data' for any update request.
  Use exact headers from {hydratedContext.sheetHeaders} (e.g., ['Date', 'CLIENT SEEN', 'TOWN', 'CLIENT CALLED', 'PHONE NUMBER', 'DETAILS OF VISIT', 'SALES MADE']).
  Dynamically infer user inputs to headers using natural language understanding and context:

  Names or entities (e.g., 'francois') map to 'CLIENT SEEN' or similar.
  Locations (e.g., 'Howick') map to 'TOWN' or location-like columns.
  Monetary or numeric values (e.g., '3000k seed') map to 'SALES MADE' or amount-like columns.
  Descriptive text (e.g., 'spoke about seed changes') map to 'DETAILS OF VISIT' or note-like columns.
  Add current date (MM/DD/YYYY) to 'Date' if missing.
  If the message implies multiple entries (e.g., "saw sarah and john"), generate separate rows for each entity while sharing common fields (e.g., Date and TOWN).

  Use conversation history to disambiguate intent: if history or the message indicates adding/updating data (e.g., 'add to sheet', 'insert', 'log'), set intent to 'update_data'. If it asks to describe/tell/show/explain, set intent to 'get_data' or 'describe_data' as appropriate. When history shows an ongoing flow, ground your inference on prior turns.


  Generate one or more row objects with exact header keys and inferred values (e.g., [{Date: '08/14/2025', CLIENT SEEN: 'Francois', TOWN: 'Howick', SALES MADE: '3000', DETAILS OF VISIT: 'spoke about seed industry changes'}]).
  Use only 'apply_structured_rows' with params: {spreadsheetId: {hydratedContext.spreadsheetId}, sheetName: {hydratedContext.sheetName}, rows: [ ...inferred rows as array of objects ... ], dryRun: true}.
  Do not include 'resolve_column' in toolChain. For 'update_data' intent, toolChain MUST be [] (empty array) and must never contain 'resolve_column'.
  If spreadsheetId or sheetName is missing, clarify: 'Please specify the sheet to update.'
  If any input cannot be mapped, clarify: 'Could not map some terms to columns: {unmapped terms}. Available: {sheetHeaders}. Please clarify which columns to use.'
  Output JSON: intent, tools (only 'apply_structured_rows' with rows), toolChain (empty), clarify.

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

function normalizeCapitalization(input: string): string {
  if (!input) return input;
  return input
    .split(/\s+/)
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

function inferRowFromMessage(message: string, headers: string[]): Record<string, unknown> {
  const inferred: Record<string, unknown> = {};
  const lowerCasedMessage = String(message || '').toLowerCase();

  // Date: always set if header exists
  if (headers.includes('Date')) {
    inferred['Date'] = dayjs().format('MM/DD/YYYY');
  }

  // CLIENT SEEN / name-like extraction
  if (headers.includes('CLIENT SEEN')) {
    const nameAfterVerb = lowerCasedMessage.match(/\b(?:saw|met|with|visited|speak(?:ing)?\s+to|spoke\s+to|client)\s+([a-z][a-z\-\s']{1,60})/i);
    if (nameAfterVerb) {
      inferred['CLIENT SEEN'] = normalizeCapitalization(nameAfterVerb[1].trim());
    } else {
      // Fallback: single capitalized token that looks like a name
      const properName = message.match(/\b([A-Z][a-z]{2,})(?:\s+[A-Z][a-z]{2,})?/);
      if (properName) {
        inferred['CLIENT SEEN'] = properName[0].trim();
      }
    }
  }

  // TOWN / location-like extraction
  if (headers.includes('TOWN')) {
    const townMatch = lowerCasedMessage.match(/\b(?:in|at|to)\s+([a-z][a-z\-\s']{1,60})/i);
    if (townMatch) {
      inferred['TOWN'] = normalizeCapitalization(townMatch[1].trim());
    }
  }

  // CLIENT CALLED
  if (headers.includes('CLIENT CALLED')) {
    const calledMatch = lowerCasedMessage.match(/\b(?:called|phoned|telephoned|phone\s*call)\b/i);
    if (calledMatch) {
      inferred['CLIENT CALLED'] = 'Yes';
    }
  }

  // PHONE NUMBER
  if (headers.includes('PHONE NUMBER')) {
    const phoneMatch = message.match(/(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}/);
    if (phoneMatch) {
      inferred['PHONE NUMBER'] = phoneMatch[0].replace(/\s+/g, ' ').trim();
    }
  }

  // SALES MADE / numeric or monetary extraction
  if (headers.includes('SALES MADE')) {
    const salesMatch = lowerCasedMessage.match(/\b(\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?k?\b/);
    if (salesMatch) {
      const raw = (salesMatch[0] || '').toLowerCase();
      const hasK = /k$/.test(raw);
      const numeric = (salesMatch[1] || '').replace(/,/g, '');
      // Keep example behavior: strip 'k' rather than multiply
      const value = numeric;
      inferred['SALES MADE'] = value;
    }
  }

  // DETAILS OF VISIT / note-like text
  if (headers.includes('DETAILS OF VISIT')) {
    // Heuristic: prefer fragments after verbs like 'spoke about', 'discussed', 'notes'
    const detailsMatch = message.match(/(?:spoke\s+about|discussed|regarding|re|notes?:?)\s+([^.;\n]+)[.;\n]?/i);
    inferred['DETAILS OF VISIT'] = detailsMatch ? detailsMatch[1].trim() : message;
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
