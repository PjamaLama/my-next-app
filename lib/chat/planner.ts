import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';
import { Context, ConversationHistoryItem } from './types';
import { detectIntent } from './intentDetection';

// Helper function to detect if a row likely matches existing data
function detectExistingRow(row: Record<string, unknown>, headers: string[], sheetData: string[][]): boolean {
  try {
    // Look for key identifying fields that might indicate an existing row
    const keyFields = ['Date', 'date', 'ID', 'id', 'Name', 'name', 'Client', 'client', 'Vehicle', 'vehicle', 'Reg#', 'reg#'];
    
    for (const keyField of keyFields) {
      if (row[keyField] !== undefined) {
        const value = String(row[keyField] || '').trim();
        if (value) {
          // Check if this value exists in the sheet data
          const headerIndex = headers.findIndex(h => h === keyField);
          if (headerIndex >= 0) {
            // Look through existing rows for a match
            for (let i = 1; i < sheetData.length; i++) { // Skip header row
              const existingValue = String(sheetData[i]?.[headerIndex] || '').trim();
              if (existingValue === value) {
                return true; // Found a match, this is likely an update
              }
            }
          }
        }
      }
    }
    
    return false; // No clear match found, treat as new row
  } catch {
    return false; // On error, default to new row
  }
}

export type PlannerPlan = {
  intent: 'describe_data' | 'update_data' | 'get_data' | 'other';
  reasoning: string | null;
  tools: Array<{ name: string; args: Record<string, unknown> }>;
  toolChain: Array<{ toolName: string; params: Record<string, unknown>; dependsOn?: number[] }>;
  clarifyQuestion: string | null;
  inferences: Record<string, string> | null;
};

// Lightweight planner:
// - Focus on intent detection and tool planning
// - For updates, enforce a single-path using apply_structured_rows with dryRun: true
// - No sheet-specific rules or hard-coded mappings

function buildPrompt(message: string, context: Context, history: ConversationHistoryItem[], hasFiles: boolean, detectedIntent: string): string {
  // Preserve placeholders in the template, but also include resolved context for grounding and tests
  const headers: string[] = Array.isArray((context as any)?.sheetHeaders)
    ? ((context as any).sheetHeaders as string[])
    : [];
  const headersList = headers.map((h) => JSON.stringify(String(h))).join(', ');
  const sheetData: (string | undefined)[][] = Array.isArray((context as any)?.sheetData)
    ? ((context as any).sheetData as (string | undefined)[][])
    : [];
  // Use last 10 rows for sample (or fewer if not available), formatted as CSV-like with "" for empty cells
  const sheetDataSample = sheetData.slice(-10).map(row => 
    row.map((cell: string | undefined) => cell === undefined || cell === null || cell === '' ? '""' : JSON.stringify(String(cell))).join(',')
  ).join('\n');
  const fileDataSample = Array.isArray((context as any)?.fileData)
    ? ((context as any).fileData as any[]).slice(0, 3)
    : [];
  const hydratedContextResolved = JSON.stringify({
    sheetHeaders: headers,
    spreadsheetId: (context as any)?.spreadsheetId || null,
    sheetName: (context as any)?.sheetName || null,
    sheetNames: (context as any)?.sheetNames || [],
    primarySheet: Array.isArray((context as any)?.sheetNames) && (context as any).sheetNames.length > 0 ? (context as any).sheetNames[0] : (context as any)?.sheetName || null,
    fileDataSample,
    sheetDataSample: sheetData.slice(-10), // Raw for resolved, but use formatted in prompt
  });
  // Build a compact conversation history string for grounding
  const historyText = Array.isArray(history)
    ? history
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '').slice(0, 400)}`)
        .join('\n')
    : '';

  // Updated template incorporating new inference rules for updates while preserving original structure and principles
  const template = `You are an AI planner for a Google Sheets assistant.

Your task is to analyze the user's intent and prepare actions accordingly. Always base your decisions on the provided headers and sample recent rows from the sheet.

Headers: [${headersList}]

Sample recent rows: ${sheetDataSample || 'No recent rows available'}

User query: ${JSON.stringify(message)}

IMPORTANT: Enhanced intent detection suggests the user's intent is likely: "${detectedIntent}"

Decide the user's intent from: 'update_data', 'describe_data', 'get_data', or 'other'.

Principles:
- Use exact column headers from {hydratedContext.sheetHeaders}. Do not assume synonyms.
- For updates, plan a single tool only: { name: 'apply_structured_rows', args: { spreadsheetId, sheetName, rows, dryRun: true } }.
- For updates to existing rows, identify row by primary key or unique value (from sheetConfig). Plan as apply_structured_rows with partial rows (only changed cells), and note "updating existing row" in reasoning.
- Do not include 'resolve_column' or any other tools for updates. toolChain must be empty for updates.
- If spreadsheetId or sheetName is missing, set clarifyQuestion accordingly and do not produce rows.
- If you cannot confidently form rows from the message and context, set clarifyQuestion asking the user to specify column-value pairs.
- For describe/get requests, you may include a toolChain (e.g., get_sheet_data → aggregate), or leave it empty.
- For multi-sheet contexts (sheetNames >1), plan tools across sheets if query spans them (e.g., aggregate from all). For updates, set primarySheet to first in sheetNames, or clarifyQuestion if ambiguous.
- Infer missing values from patterns in sheetData (e.g., if recent rows have similar Driver, prefill it). Only clarify if inference confidence low (<70%). For updates, output partial rows with inferred fields marked (e.g., {column: "inferred value from pattern"}).

INTENT GUIDANCE:
- If enhanced detection suggests "update_data": Strongly consider this intent unless the message clearly contradicts it
- If enhanced detection suggests "get_data": The user likely wants to see/analyze existing data
- If enhanced detection suggests "describe_data": The user wants a general overview or explanation
- Always validate the detected intent against the actual message content

If intent is 'update_data', output structured rows that match the sheet's format. Key instructions:
- Infer column mappings, data formats, and styles from the sample recent rows. Match patterns in how data is placed (e.g., if names often go in 'Ty' for personal visits and towns in 'CLIENT SEEN', do the same; if sales are formatted as 'Rxxx.00', use that).
- For dates: Replace vague terms like 'Today' with the actual current date in the format used in samples (e.g., MM/DD/YYYY). Current date: August 17, 2025.
- For missing or unspecified fields: Leave as empty unless a clear pattern in samples suggests a default (e.g., if most rows leave 'TOWN' empty for certain types of entries, do so).
- Separate details logically: Put conversation notes in 'DETAILS OF VISIT' without duplicating sales info; put monetary values only in 'SALES MADE' in the matching format.
- Keep it simple: Only infer based on majority patterns in samples; do not overcomplicate or add unmentioned data.

For other intents, follow standard logic.

Output JSON with: intent, tools, toolChain, clarifyQuestion, reasoning, inferences: {column: 'reason'} for transparency, and rows: [array of row objects with keys matching headers] (only for 'update_data').

Conversation history: {conversationHistory}
Sheet context: {hydratedContext}`;

  // Compatibility block: include resolved values so models and tests see concrete content
  const compatibility = `

User message (resolved): ${JSON.stringify(message)}
Sheet context (resolved): ${hydratedContextResolved}
Conversation history (resolved): ${historyText}
${Array.isArray((context as any)?.sheetNames) && (context as any).sheetNames.length > 1 ? `Note: Multiple sheets available: ${(context as any).sheetNames.join(', ')}. Use primarySheet for updates unless specified.` : ''}`;

  return template + compatibility;
}

// No hard-coded extraction helpers; rely on the model and caller context for mapping.

export async function generatePlan(
  message: string,
  context: Context,
  conversationHistory: ConversationHistoryItem[],
  hasFiles: boolean
): Promise<PlannerPlan> {
  // Enhanced intent detection: use semantic analysis first
  let detectedIntent: string;
  try {
    detectedIntent = await detectIntent(message);
    console.log(`[Planner] Enhanced intent detection: "${detectedIntent}" for message: "${message}"`);
  } catch (error) {
    console.warn('[Planner] Enhanced intent detection failed, falling back to AI:', error);
    detectedIntent = 'unknown';
  }

  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  const ai = genkit({ plugins: [googleAI({ apiKey })], model: gemini15Flash });
  
  // Pass the detected intent to the prompt for better AI guidance
  const prompt = buildPrompt(message, context, conversationHistory || [], !!hasFiles, detectedIntent);
  const { text } = await ai.generate(prompt);
  const plannerPlan = parsePlanResponse(text, context, message, detectedIntent);
  return plannerPlan;
}

function parsePlanResponse(aiResponse: string, context: Context, message: string, detectedIntent: string): PlannerPlan {
  try {
    let cleaned = String(aiResponse || '').trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/```json\n?/, '');
    const parsed = JSON.parse(cleaned);
    
    // Use AI response intent, but fall back to detected intent if AI is unclear
    let intent: PlannerPlan['intent'];
    if (['describe_data', 'update_data', 'get_data', 'other'].includes(parsed.intent)) {
      intent = parsed.intent;
    } else if (detectedIntent !== 'unknown' && ['describe_data', 'update_data', 'get_data'].includes(detectedIntent)) {
      // Fall back to detected intent if AI response is unclear
      console.log(`[Planner] AI intent unclear, using detected intent: "${detectedIntent}"`);
      intent = detectedIntent as PlannerPlan['intent'];
    } else {
      intent = 'other';
    }
    
    // Log intent decision for debugging
    console.log(`[Planner] Final intent decision: "${intent}" (AI: "${parsed.intent}", Detected: "${detectedIntent}")`);
    
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
          dependsOn: Array.isArray(s?.dependsOn) ? s?.dependsOn.map((i: number) => Number(i)).filter((n: number) => Number.isFinite(n) && n >= 0) : [],
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
    // Also handle top-level 'rows' from parsed output and inject into apply_structured_rows args if present
    try {
      const spreadsheetId = (context as any)?.spreadsheetId;
      const sheetNames = Array.isArray((context as any)?.sheetNames) ? (context as any).sheetNames : [];
      const sheetName = (context as any)?.sheetName;
      
      // For multi-sheet contexts, use primary sheet (first in sheetNames) for updates unless specified
      let primarySheetName = sheetName;
      if (sheetNames.length > 1 && !sheetName) {
        primarySheetName = sheetNames[0];
      } else if (sheetNames.length > 1 && sheetName && !sheetNames.includes(sheetName)) {
        // If specified sheetName is not in sheetNames, use first available
        primarySheetName = sheetNames[0];
      }
      
      const ensureParams = (params: any): any => {
        const updated: any = { ...(params || {}) };
        if (spreadsheetId) updated.spreadsheetId = spreadsheetId;
        if (primarySheetName) updated.sheetName = primarySheetName;
        updated.dryRun = true;
        return updated;
      };

      // If top-level 'rows' exists in parsed (for update_data), ensure it's injected into apply_structured_rows args
      if (intent === 'update_data' && Array.isArray(parsed.rows)) {
        let applyTool = tools.find((t: any) => String(t?.name || '').toLowerCase() === 'apply_structured_rows');
        if (!applyTool) {
          applyTool = { name: 'apply_structured_rows', args: {} } as any;
          tools.push(applyTool);
        }
        applyTool.args = { ...(applyTool.args || {}), rows: parsed.rows };
      }

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
      if (intent === 'update_data' && !tools.find((t: any) => String(t?.name || '').toLowerCase() === 'apply_structured_rows')) {
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
      
      // Analyze rows to determine if they should be updates or additions
      if (intent === 'update_data' && Array.isArray(rows) && rows.length > 0) {
        try {
          const sheetData = (context as any)?.sheetData;
          const sheetHeaders = (context as any)?.sheetHeaders;
          
          if (Array.isArray(sheetData) && Array.isArray(sheetHeaders)) {
            // Mark rows as updates if they likely match existing data
            const enhancedRows = rows.map((row: any) => {
              if (typeof row === 'object' && row !== null) {
                // Check if this row likely matches an existing row
                const isUpdate = detectExistingRow(row, sheetHeaders, sheetData);
                return { ...row, operation: isUpdate ? 'update' : 'add' };
              }
              return row;
            });
            
            // Update the rows in tools and toolChain
            tools = tools.map((t: any) => {
              if (String((t as any)?.name || '').toLowerCase() === 'apply_structured_rows') {
                return { ...t, args: { ...(t as any).args, rows: enhancedRows } };
              }
              return t;
            });
            
            committedChain = (committedChain as any[]).map((s) => {
              if (String(s?.toolName || '').toLowerCase() === 'apply_structured_rows') {
                return { ...s, params: { ...s.params, rows: enhancedRows } };
              }
              return s;
            });
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('Failed to analyze rows for update/add detection:', error);
        }
      }
      
      // Debug log of final planner output
      // eslint-disable-next-line no-console
      console.log('Planner output:', { intent, tools, toolChain: committedChain, clarify: clarifyQuestion, rows: (tools as any)?.[0]?.params?.rows });

      // If critical context missing, ask to clarify
      if ((!spreadsheetId || !primarySheetName) && intent === 'update_data' && !clarifyQuestion) {
        if (sheetNames.length > 1) {
          clarifyQuestion = `Multiple sheets available: ${sheetNames.join(', ')}. Which sheet should I update?`;
        } else {
          clarifyQuestion = 'Please specify the sheet to update.';
        }
      }
    } catch {}

    return {
      intent,
      tools,
      toolChain: committedChain,
      clarifyQuestion,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : null,
      inferences: typeof parsed.inferences === 'object' && parsed.inferences ? parsed.inferences : null,
    };
  } catch {
    // Safe fallback with a best-guess tool
    const summaryLike = /tell\s+me\s+about|summariz|what\s+i\s+did|overview/i.test(message || '');
    if (summaryLike) {
      return { intent: 'describe_data', tools: [{ name: 'describe_sheet', args: {} }], toolChain: [], clarifyQuestion: null, reasoning: 'Summary-like request.', inferences: null };
    }
    return { intent: 'get_data', tools: [{ name: 'get_sheet_data', args: {} }], toolChain: [], clarifyQuestion: null, reasoning: 'Fallback planner.', inferences: null };
  }
}
