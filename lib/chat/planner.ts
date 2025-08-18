import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';
import { Context, ConversationHistoryItem } from './types';
import { executeAIWithRetry } from '../aiUtils';

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
  intent: 'update_data' | 'extraction';
  reasoning: string | null;
  tools: Array<{ name: string; args: Record<string, unknown> }>;
  toolChain: Array<{ toolName: string; params: Record<string, unknown>; dependsOn?: number[] }>;
  clarifyQuestion: string | null;
  inferences: Record<string, string> | null;
  extractedData: { rows: Record<string, unknown>[]; headers: string[] } | null;
  sheets: Array<{
    sheetName: string;
    rows: Array<Record<string, unknown>>;
  }>;
};

// New planner prompt focused on updates with multi-sheet support
function buildPrompt(message: string, context: Context, history: ConversationHistoryItem[], hasFiles: boolean, isExtraction: boolean): string {
  // Get sheet context
  const headers: string[] = Array.isArray((context as any)?.sheetHeaders)
    ? ((context as any).sheetHeaders as string[])
    : [];
  const headersList = headers.map((h) => JSON.stringify(String(h))).join(', ');
  const sheetData: (string | undefined)[][] = Array.isArray((context as any)?.sheetData)
    ? ((context as any).sheetData as (string | undefined)[][])
    : [];
  const sheetDataSample = sheetData.slice(-10).map(row => 
    row.map((cell: string | undefined) => cell === undefined || cell === null || cell === '' ? '""' : JSON.stringify(String(cell))).join(',')
  ).join('\n');
  
  // Extract file data for planner context
  const fileData = hasFiles ? (context as any)?.fileData || [] : [];
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
    fileData,
    sheetDataSample: sheetData.slice(-10),
  });
  
  // Build conversation history
  const historyText = Array.isArray(history)
    ? history
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '').slice(0, 400)}`)
        .join('\n')
    : '';

  // New simplified update planner prompt
  const template = `You are a Google Sheets update planner. Your job is to analyze user requests and create structured data updates.\n\nIMPORTANT: Always return intent: "update_data" - the user wants to add or modify data.\n\nCONTEXT:\n- Headers: [${headersList}]\n- Sample recent rows: ${sheetDataSample || 'No recent rows available'}\n- User query: ${JSON.stringify(message)}\n- Available sheets: ${Array.isArray((context as any)?.sheetNames) ? (context as any).sheetNames.join(', ') : 'Single sheet'}\n\nTASK: Create a structured update plan that maps user input to exact column names.\n\nREQUIREMENTS:\n1. Use EXACT column headers from the headers list above - no synonyms or fuzzy matching.\n2. If you cannot confidently map user input to exact column names, set clarifyQuestion.\n3. Always use the apply_structured_rows tool with dryRun: true for preview.\n4. If the user's request is unclear, ask for clarification.\n\nOUTPUT FORMAT:\nReturn a JSON object with this EXACT structure. Do not add any extra text or formatting.\n{\n  "intent": "update_data",\n  "reasoning": "Brief explanation of what you're doing",\n  "tools": [{"name": "apply_structured_rows", "args": {"rows": [{"Column1": "value1"}]}}],\n  "toolChain": [],\n  "clarifyQuestion": null,\n  "inferences": null,\n  "extractedData": null,\n  "sheets": [\n    {\n      "sheetName": "Sheet1",\n      "rows": [\n        {"Column1": "value1", "Column2": "value2"}\n      ]\n    }\n  ]\n}\n\nIf you make a mistake, please correct it and return the valid JSON.`

  // Compatibility block with resolved values
  const compatibility = `\n\nUser message (resolved): ${JSON.stringify(message)}\nSheet context (resolved): ${hydratedContextResolved}\nConversation history (resolved): ${historyText}\n${Array.isArray((context as any)?.sheetNames) && (context as any).sheetNames.length > 1 ? `Note: Multiple sheets available: ${(context as any).sheetNames.join(', ')}. Use primarySheet for updates unless specified.` : ''}`;

  return template + compatibility;
}

export async function generatePlan(
  message: string,
  context: Context,
  conversationHistory: ConversationHistoryItem[],
  hasFiles: boolean
): Promise<PlannerPlan> {
  const startTime = Date.now();
  
  try {
    // Check for extraction flag
    const ctxAny = context as any;
    const isExtraction = ctxAny?.flag === 'extraction';
    
    // Set intent based on flag
    const detectedIntent = isExtraction ? 'extraction' : 'update_data';
    
    // Log context and operation details
    console.log(`[Planner] Generating plan with intent: "${detectedIntent}" for message: "${message}"`);

    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_GENAI_API_KEY not configured');
    }
    
    const ai = genkit({ plugins: [googleAI({ apiKey })], model: gemini15Flash });
    
    const prompt = buildPrompt(message, context, conversationHistory || [], !!hasFiles, isExtraction);
    
    // Use aiUtils retry for the LLM call
    const { text } = await executeAIWithRetry(
      async () => ai.generate(prompt),
      'Plan generation'
    );
    
    const plannerPlan = parsePlanResponse(text, context, message, detectedIntent);
    
    // Log successful plan generation
    const duration = Date.now() - startTime;
    console.log(`[Planner] Plan generated successfully with ${plannerPlan.sheets?.length || 0} sheets in ${duration}ms`);
    
    return plannerPlan;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorObj = error instanceof Error ? error : new Error(String(error));
    console.error(`[Planner] Error generating plan after ${duration}ms:`, errorObj);
    throw errorObj;
  }
}

function parsePlanResponse(aiResponse: string, context: Context, message: string, detectedIntent: string): PlannerPlan {
  try {
    let cleaned = String(aiResponse || '').trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/```json\n?|```/g, '');
    const parsed = JSON.parse(cleaned);
    
    // Use the detected intent from the flag
    const intent: PlannerPlan['intent'] = detectedIntent as 'update_data' | 'extraction';
    
    // Log intent decision for debugging
    console.log(`[Planner] Final intent decision: "${intent}"`);
    
    // Extract sheets data - this is now mandatory
    const sheets = Array.isArray(parsed.sheets) ? parsed.sheets : [];
    
    // Validate sheets structure
    if (sheets.length === 0) {
      // Fallback: create a default sheet structure if none provided
      const sheetName = (context as any)?.sheetName || (Array.isArray((context as any)?.sheetNames) ? (context as any).sheetNames[0] : 'Sheet1');
      sheets.push({
        sheetName,
        rows: []
      });
    }
    
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

    // For update_data intent, do not include resolve_column and keep toolChain empty for updates
    if (intent === 'update_data') {
      committedChain = [];
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
      
      // Inspect sheets for invalid keys
      for (const sheet of sheets) {
        if (Array.isArray(sheet.rows)) {
          inspectRows(sheet.rows);
        }
      }
      
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

      // Analyze rows in sheets to determine if they should be updates or additions
      if (intent === 'update_data' && sheets.length > 0) {
        try {
          const sheetData = (context as any)?.sheetData;
          const sheetHeaders = (context as any)?.sheetHeaders;
          
          if (Array.isArray(sheetData) && Array.isArray(sheetHeaders)) {
            // Process each sheet's rows
            for (const sheet of sheets) {
              if (Array.isArray(sheet.rows)) {
                const enhancedRows = sheet.rows.map((row: any) => {
                  if (typeof row === 'object' && row !== null) {
                    // Check if this row likely matches an existing row
                    const isUpdate = detectExistingRow(row, sheetHeaders, sheetData);
                    return { ...row, operation: isUpdate ? 'update' : 'add' };
                  }
                  return row;
                });
                sheet.rows = enhancedRows;
              }
            }
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('Failed to analyze rows for update/add detection:', error);
        }
      }
      
      // Debug log of final planner output
      // eslint-disable-next-line no-console
      console.log('Planner output:', { intent, tools, toolChain: committedChain, clarify: clarifyQuestion, sheets });

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
      extractedData: typeof parsed.extractedData === 'object' && parsed.extractedData ? parsed.extractedData : null,
      sheets,
    };
  } catch (e) {
    console.error("Failed to parse AI plan:", aiResponse, e);
    // Safe fallback for update_data intent
    const sheetName = (context as any)?.sheetName || (Array.isArray((context as any)?.sheetNames) ? (context as any).sheetNames[0] : 'Sheet1');
    return { 
      intent: 'update_data', 
      tools: [{ name: 'apply_structured_rows', args: {} }], 
      toolChain: [], 
      clarifyQuestion: 'Failed to parse plan. Please try again.', 
      reasoning: 'Fallback planner.', 
      inferences: null, 
      extractedData: null,
      sheets: [{ sheetName, rows: [] }]
    };
  }
}
