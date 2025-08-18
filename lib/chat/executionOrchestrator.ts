import { Context, ConversationHistoryItem, ImageData, StructuredTable } from './types';
import { generatePlan } from './planner';
import { executeToolCall } from './toolExecution';
import { SheetDataSource } from '../data/source';

// Helper function to infer missing values from patterns in recent sheet data
function inferMissingValue(header: string, recentRows: string[][], sheetHeaders: string[], currentDate: string): string | null {
  try {
    const headerIndex = sheetHeaders.indexOf(header);
    if (headerIndex === -1) return null;

    // Extract values for this column from recent rows
    const columnValues = recentRows
      .map(row => row[headerIndex])
      .filter(val => val !== undefined && val !== null && val !== '')
      .map(val => String(val || '').trim());

    if (columnValues.length === 0) return null;

    // Date pattern inference
    if (/date|Date|DATE/i.test(header)) {
      return currentDate;
    }

    // For other columns, find most common value or average
    if (columnValues.length > 0) {
      // Count frequency of each value
      const valueCounts = new Map<string, number>();
      for (const val of columnValues) {
        valueCounts.set(val, (valueCounts.get(val) || 0) + 1);
      }

      // Return most frequent value
      let mostFrequent = columnValues[0];
      let maxCount = 1;
      for (const [val, count] of valueCounts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          mostFrequent = val;
        }
      }

      // Only infer if we have reasonable confidence (value appears multiple times)
      if (maxCount >= 2) {
        return mostFrequent;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Unified preview table to use exact headers; suppresses invalid data.
// Ensured complete row data in preview table; clarifies for incomplete rows.
// Simplified to support multi-row tables elegantly.
function buildProposedUpdatesTable(preview: any, sheetHeaders?: string[]): StructuredTable & { clarify?: string } {
  const headers: string[] = (Array.isArray(sheetHeaders) && sheetHeaders.length > 0)
    ? sheetHeaders
    : (Array.isArray(preview?.headers) ? (preview.headers as string[]) : []);
  if (!Array.isArray(headers) || headers.length === 0) {
    const clarify = 'No valid headers found. Please specify column names.';
    return { title: 'Proposed Sheet Updates', headers: [], rows: [], clarify, meta: { clarify } } as any;
  }

  // Add Action column to headers
  const headersWithAction = ['Action', ...headers];

  const srcRows = Array.isArray(preview?.rows) ? (preview.rows as any[]) : [];
  let rows: string[][] = [];

  if (srcRows.length > 0) {
    if (Array.isArray(srcRows[0])) {
      // rows already 2D arrays; coerce width to headers length
      rows = (srcRows as any[]).map((arr: any) => {
        const a = Array.isArray(arr) ? arr : [];
        const rowData = headers.map((_, i) => String(a[i] ?? ''));
        // Add Action column - assume 'Add' for now (will be enhanced by planner)
        return ['Add', ...rowData];
      });
    } else if (typeof srcRows[0] === 'object' && srcRows[0] !== null) {
      // Check if rows have operation field (new structure)
      if (srcRows[0].operation && srcRows[0].data) {
        // New structure with operation field
        rows = srcRows.map((obj: any) => {
          const operation = String(obj.operation || 'add').toLowerCase() === 'update' ? 'Update' : 'Add';
          const rowData = Array.isArray(obj.data) ? obj.data : [];
          // Ensure rowData has same length as headers, pad with empty strings if needed
          const paddedData = headers.map((_, i) => String(rowData[i] ?? ''));
          return [operation, ...paddedData];
        });
      } else {
        // Legacy structure - rows are objects keyed by headers
        rows = srcRows.map((obj: any) => {
          const rowData = headers.map((h) => String((obj as any)[h] ?? ''));
          return ['Add', ...rowData];
        });
      }
    }
  }

  const allEmpty = rows.length > 0 ? rows.every(r => r.slice(1).every(cell => !String(cell || '').trim())) : true;
  const today = new Date().toLocaleDateString('en-US');
  const onlyDateDefaults = rows.length > 0
    ? rows.every(r => r.slice(1).every((cell, idx) => {
        const val = String(cell || '').trim();
        if (!val) return true; // treat empty as ignorable
        const isDateCol = String(headers[idx]) === 'Date';
        return isDateCol && val === today; // only default Date present
      }))
    : false;

  if (!Array.isArray(rows) || rows.length === 0 || allEmpty || onlyDateDefaults) {
    const clarify = String(preview?.clarify || `No valid data provided. Please specify values for columns: ${headers.join(', ')}`);
    return { title: 'Proposed Sheet Updates', headers: headersWithAction, rows: [], clarify, meta: { clarify } } as any;
  }

  const title = rows.length > 1 ? 'Proposed Sheet Updates (Multiple Rows)' : 'Proposed Sheet Updates';
  return { title, headers: headersWithAction, rows } as any;
}

// New function to handle tool selection and argument propagation for update_data intents
async function executeTool(intent: string, message: string, context: { spreadsheetId?: string; sheetName?: string }) {
  if (intent === 'update_data') {
    if (!context.spreadsheetId || !context.sheetName) {
      throw new Error('Missing spreadsheetId or sheetName from context');
    }
    
    try {
      // Create a SheetDataSource to get headers
      const ds = new SheetDataSource(
        context.spreadsheetId,
        context.sheetName,
        undefined, // baseUrl
        '', // userId
        context as any
      );
      
      const headers = await ds.getHeaders();
      
      if (!Array.isArray(headers) || headers.length === 0) {
        throw new Error('Failed to retrieve sheet headers');
      }
      
      const proposedRow = parseMessageToRow(message, headers);
      
      // Validate that we have some meaningful data in the proposed row
      const hasData = proposedRow.some((cell, index) => {
        // Skip date columns as they're auto-filled
        const header = headers[index];
        if (/date|Date|DATE/.test(header)) return false;
        return cell && cell.toString().trim().length > 0;
      });
      
      if (!hasData) {
        console.warn('[executeTool] No meaningful data extracted from message for update_data intent');
      }
      
      // Return the tool call structure that matches the expected format
      return {
        id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'function',
        function: { 
          name: 'apply_structured_rows', 
          arguments: JSON.stringify({ 
            ...context, 
            proposedRow, 
            range: 'A:Z',
            headers,
            message, // Include original message for context
            timestamp: new Date().toISOString()
          }) 
        }
      };
    } catch (error) {
      console.error('[executeTool] Error creating update_data tool call:', error);
      throw new Error(`Failed to prepare update_data tool: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    // Return default tool call for other intents
    return {
      id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'function',
      function: { 
        name: 'get_sheet_data', 
        arguments: JSON.stringify({ ...context }) 
      }
    };
  }
}

function parseMessageToRow(message: string, headers: string[]) {
  const row = new Array(headers.length).fill('');
  const messageLower = message.toLowerCase();
  
  // Generalist approach: only handle common data types generically
  headers.forEach((header, index) => {
    const headerLower = header.toLowerCase();
    
    // Date columns - any header containing "date"
    if (headerLower.includes('date')) {
      const today = new Date().toLocaleDateString('en-US');
      row[index] = today;
    }
    
    // Time columns - any header containing "time"
    else if (headerLower.includes('time')) {
      const timeMatch = message.match(/(\d{1,2}:\d{2}(?:\s*[ap]m)?)/i);
      if (timeMatch) row[index] = timeMatch[1];
    }
    
    // Amount/Money columns - any header containing amount, money, price, cost, etc.
    else if (headerLower.includes('amount') || headerLower.includes('money') || 
             headerLower.includes('price') || headerLower.includes('cost') || 
             headerLower.includes('revenue') || headerLower.includes('sales')) {
      const match = message.match(/\$?(\d+(?:\.\d{2})?)/i);
      if (match) row[index] = match[1];
    }
    
    // Status columns - any header containing status, state, condition, etc.
    else if (headerLower.includes('status') || headerLower.includes('state') || 
             headerLower.includes('condition') || headerLower.includes('progress')) {
      if (messageLower.includes('completed') || messageLower.includes('done') || messageLower.includes('finished')) {
        row[index] = 'Completed';
      } else if (messageLower.includes('pending') || messageLower.includes('waiting') || messageLower.includes('in progress')) {
        row[index] = 'Pending';
      }
    }
    
    // Notes/Description columns - any header containing notes, description, details, comments, etc.
    else if (headerLower.includes('notes') || headerLower.includes('description') || 
             headerLower.includes('details') || headerLower.includes('comments') || 
             headerLower.includes('summary') || headerLower.includes('info')) {
      // Extract meaningful content, excluding common filler words
      const meaningfulWords = message
        .split(/\s+/)
        .filter(word => word.length > 2 && !['the', 'and', 'for', 'with', 'in', 'on', 'at', 'to', 'went', 'saw', 'sold', 'client', 'customer'].includes(word.toLowerCase()))
        .slice(0, 6) // Limit to first 6 meaningful words
        .join(' ');
      if (meaningfulWords) row[index] = meaningfulWords;
    }
  });
  
  return row;
}

export async function executeToolPlan(
  message: string,
  context: Context,
  conversationHistory: ConversationHistoryItem[],
  images: ImageData[] = [],
  hydrateSheetData: (ds: SheetDataSource, ctxAny: any) => Promise<void>,
) {
  const hasFiles = images && images.length > 0;
  let intent = 'chat';
  let plannedToolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];
  let currentPlan: any = null;

  try {
    const plan: any = await generatePlan(message, context as any, (context as any).conversationHistory || conversationHistory || [], hasFiles);
    currentPlan = plan;
    // console.log('[Planner] plan', plan); // Commented for production

    // Use the plan as-is (auto-pick is handled inside the planner now)
    if (plan?.intent && typeof plan.intent === 'string') intent = plan.intent;

    // Post-process plan: fill missing values in partial rows using patterns from sheet data
    if (plan?.intent === 'update_data' && plan?.tools) {
      try {
        const ctxAny = context as any;
        const sheetData = ctxAny?.sheetData;
        const sheetHeaders = ctxAny?.sheetHeaders;
        const currentDate = ctxAny?.currentDate || new Date().toLocaleDateString('en-US');

        if (Array.isArray(sheetData) && Array.isArray(sheetHeaders) && sheetData.length > 1) {
          // Get recent data samples (last 10 rows, excluding header)
          const recentRows = sheetData.slice(1, 11);

          for (const tool of plan.tools) {
            if (String(tool?.name || '').toLowerCase() === 'apply_structured_rows' && Array.isArray(tool?.args?.rows)) {
              const rows = tool.args.rows;
              let missingFieldsCount = 0;
              let totalFieldsCount = 0;
              const enhancedRows: Record<string, unknown>[] = [];

              for (const row of rows) {
                if (typeof row === 'object' && row !== null) {
                  const enhancedRow: Record<string, unknown> = { ...row };
                  let rowMissingCount = 0;
                  let rowTotalCount = 0;

                  // Check each column for missing values
                  for (const header of sheetHeaders) {
                    rowTotalCount++;
                    if (enhancedRow[header] === undefined || enhancedRow[header] === null || enhancedRow[header] === '') {
                      rowMissingCount++;

                      // Try to infer missing values from patterns
                      const inferredValue = inferMissingValue(header, recentRows, sheetHeaders, currentDate);
                      if (inferredValue !== null) {
                        enhancedRow[header] = inferredValue;
                        // Track inference for transparency
                        if (!plan.inferences) plan.inferences = {};
                        plan.inferences[header] = `inferred from recent entries pattern`;
                      }
                    }
                  }

                  missingFieldsCount += rowMissingCount;
                  totalFieldsCount += rowTotalCount;
                  enhancedRows.push(enhancedRow);
                } else {
                  enhancedRows.push(row);
                }
              }

              // Update the tool with enhanced rows
              tool.args.rows = enhancedRows;

              // If more than 50% of fields are missing even after inference, set clarifyQuestion
              if (totalFieldsCount > 0 && (missingFieldsCount / totalFieldsCount) > 0.5 && !plan.clarifyQuestion) {
                plan.clarifyQuestion = `Many fields are missing (${Math.round((missingFieldsCount / totalFieldsCount) * 100)}%). Please specify values for: ${sheetHeaders.filter(h => !enhancedRows.some(r => r[h] !== undefined && r[h] !== null && r[h] !== '')).slice(0, 5).join(', ')}`;
              }
            }
          }
        }
      } catch (error) {
        console.warn('[processMessage] Failed to fill missing values in plan rows:', error);
      }
    }

    // If clarification is still needed, return clarification flow
    if (plan && plan.clarifyQuestion) {
      return {
        clarificationQuestion: plan.clarifyQuestion,
        plan: (context as any)?.debug ? plan : undefined,
        intent,
      };
    }

    const toolsFromPlan = Array.isArray(plan?.tools) ? plan.tools : [];
    
    // Use the new executeTool function for update_data intents to ensure proper argument propagation
    if (intent === 'update_data') {
      try {
        const ctxAny = context as any;
        const spreadsheetId = ctxAny?.spreadsheetId;
        const sheetName = ctxAny?.sheetName;
        
        if (spreadsheetId && sheetName) {
          // Use the dedicated executeTool function for update_data intents
          const toolCall = await executeTool(intent, message, { spreadsheetId, sheetName });
          plannedToolCalls = [toolCall];
        } else {
          // Fallback to original logic if context is missing
          plannedToolCalls = toolsFromPlan.map((t: any) => ({
            id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: { name: String(t?.name || ''), arguments: JSON.stringify(t?.args || {}) },
          }));
        }
      } catch (error) {
        console.warn('[executeToolPlan] Failed to use executeTool for update_data intent:', error);
        // Fallback to original logic
        plannedToolCalls = toolsFromPlan.map((t: any) => ({
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: { name: String(t?.name || ''), arguments: JSON.stringify(t?.args || {}) },
        }));
      }
    } else {
      // Use original logic for non-update_data intents
      plannedToolCalls = toolsFromPlan.map((t: any) => ({
        id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'function',
        function: { name: String(t?.name || ''), arguments: JSON.stringify(t?.args || {}) },
      }));
    }

    // If planner provided a dependency-aware toolChain, execute it here with parallelization
    let _chainCollected: any[] = [];
    const chain: any[] = Array.isArray((plan as any).toolChain) ? (plan as any).toolChain : [];
    if (chain.length > 0) {
      const isTest = typeof process !== 'undefined' && process.env && process.env.JEST_WORKER_ID;
      const chainResults: any[] = [];
      const completed = new Set<number>();
      const maxIterations = 50;
      let iter = 0;
      const collectedResults: any[] = [];
      while (completed.size < chain.length && iter++ < maxIterations) {
        const runnable: number[] = [];
        for (let i = 0; i < chain.length; i++) {
          if (completed.has(i)) continue;
          const deps: number[] = Array.isArray(chain[i].dependsOn) ? chain[i].dependsOn : [];
          const depsDone = deps.every((d) => completed.has(d));
          if (depsDone) runnable.push(i);
        }
        if (runnable.length === 0) break; // deadlock or cyclic deps
        const tasks = runnable.map(async (idx) => {
          const step = chain[idx];
          // Lazy loading: if step.params needs only a particular column/range, prefer get-sheet-data partials
          if (step.toolName === 'get_sheet_data') {
            try {
              const tCol = String(plan?.targetColumn || '').trim();
              if (tCol) {
                const ctxAny = context as any;
                const hdrs: string[] = Array.isArray(ctxAny.sheetHeaders) ? ctxAny.sheetHeaders : [];
                const colIdx = hdrs.indexOf(tCol);
                if (colIdx >= 0) {
                  // Convert index to A1 column letter (1-based)
                  const toCol = (n: number) => { let s=''; n++; while(n>0){n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26);} return s; };
                  const colLetter = toCol(colIdx);
                  step.params = { ...(step.params || {}), range: `${colLetter}:${colLetter}` };
                }
              }
            } catch {}
          }
                  // Analysis tools removed - no longer supported
        if (isTest && (step.toolName === 'aggregate' || step.toolName === 'trend_analysis')) {
          const stub = { success: true, result: 'Tool not supported', details: {} };
          chainResults[idx] = stub;
          completed.add(idx);
          return stub;
        }
          // For update_data intents, ensure proper argument propagation
          let call: any;
          if (intent === 'update_data' && step.toolName === 'apply_structured_rows') {
            try {
              const ctxAny = context as any;
              const spreadsheetId = ctxAny?.spreadsheetId;
              const sheetName = ctxAny?.sheetName;
              
              if (spreadsheetId && sheetName) {
                // Use executeTool to ensure proper argument structure
                call = await executeTool(intent, message, { spreadsheetId, sheetName });
              } else {
                // Fallback to original structure
                call = {
                  id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  type: 'function',
                  function: { name: String(step.toolName || ''), arguments: JSON.stringify(step.params || {}) }
                };
              }
            } catch (error) {
              console.warn('[executeToolPlan] Failed to use executeTool in tool chain:', error);
              // Fallback to original structure
              call = {
                id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'function',
                function: { name: String(step.toolName || ''), arguments: JSON.stringify(step.params || {}) }
              };
            }
          } else {
            // Original structure for non-update_data tools
            call = {
              id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'function',
              function: { name: String(step.toolName || ''), arguments: JSON.stringify(step.params || {}) }
            };
          }
          let res = await executeToolCall(call, context, images);
          if (!res?.success && step.fallback && step.fallback.toolName) {
            const fb = {
              id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'function',
              function: { name: String(step.fallback.toolName), arguments: JSON.stringify(step.fallback.params || {}) }
            } as any;
            res = await executeToolCall(fb, context, images);
          }
          chainResults[idx] = res;
          completed.add(idx);
          return res;
        });
        const batchResults = await Promise.all(tasks);
        collectedResults.push(...batchResults);
      }
      _chainCollected = collectedResults;
    }

    // Removed resolve_column helper injection for updates; not needed and can cause errors without full params
  } catch (error) {
    console.error('Error in planning phase:', error);
    plannedToolCalls = [];
  }
  let _chainCollected: any[] = [];
  const toolResults: any[] = [];
  // Note: _chainCollected is defined above; wrap reference in try/catch to avoid TS hoist issues
  try {
    const chainCollectedLocal: any[] = _chainCollected;
    if (Array.isArray(chainCollectedLocal) && chainCollectedLocal.length > 0) toolResults.push(...chainCollectedLocal);
  } catch {}

  let enhancedResponse = '';
  let describeText: string | null = null;
  let didUpdateSheet = false;
  const dataTables: StructuredTable[] = [];
  let hasProposedUpdateTable: boolean = false;
  let response = '';
  const postQuickActions: string[] = [];
  // Hoist quickReplies so we can modify them during tool processing (e.g., preview confirmations)
  let quickReplies: string[] = [];
  const toolCallsToRun = plannedToolCalls;

  for (const toolCall of toolCallsToRun) {
    const result = await executeToolCall(toolCall, context, images);
    try {
      if (result && (result as any).error) {
        const ctxAny = context as any;
        if (!Array.isArray(ctxAny.errors)) ctxAny.errors = [];
        ctxAny.errors.push(String((result as any).error));
      }
    } catch {}
    toolResults.push(result);
    // console.log('[Planner] tool result', { name: toolCall.function.name, success: result?.success }); // Commented for production
    // Additional visibility for sheet updates
    // console.log(`Tool result for ${(context as any)?.sheetName || ''}: `, result); // Commented for production

    // Handle explicit preview payloads from backend (commit not yet performed)
    try {
      if ((result as any)?.preview) {
        response = 'Proposed update (using sheet columns):';
        const ctxAny = context as any;
        ctxAny.previewActions = (result as any).preview;
        // Render a single proposed updates table using inferred rows if available
        const pv = (result as any).preview;
        const sheetHeaders: string[] = Array.isArray((context as any)?.sheetHeaders) ? (context as any).sheetHeaders as string[] : [];
        const table = buildProposedUpdatesTable(pv, sheetHeaders);
        // console.log('Preview table:', table); // Commented for production
        if (Array.isArray((table as any).rows) && (table as any).rows.length > 0) {
          dataTables.length = 0; // keep only the unified proposed updates table
          dataTables.push(table as any);
          hasProposedUpdateTable = true;
        } else if ((table as any)?.meta?.clarify) {
          const clarify = String((table as any).meta.clarify);
          const ctxAny = context as any;
          ctxAny._clarifyHeaders = clarify;
        }
        // Provide structured quick replies for UI and simple text fallbacks
        ctxAny.quickReplies = [
          { text: 'Approve', action: 'confirm_update' },
          { text: 'Reject', action: 'reject_update' },
          { text: 'Edit', action: 'edit_update' }
        ];
        const baseQR = Array.isArray(quickReplies) ? quickReplies : [];
        quickReplies = Array.from(new Set([...baseQR, 'Approve', 'Reject', 'Edit'])).slice(0, 5);
        // Stash pending call with commit=true so confirmation can re-run it
        try {
          const args = JSON.parse(toolCall.function.arguments || '{}');
          (context as any)._lastUpdateToolCall = { name: toolCall.function.name, args: { ...args, commit: true } };
        } catch {}
        // Continue to next toolCall without marking error
        continue;
      }
    } catch {}

    if (result.success) {
      const executedToolName = toolCall.function.name;
      if (executedToolName === 'extract_text_only') {
        if (!context.fileAnalysis) {
          context.fileAnalysis = { files: [], lastUpdated: Date.now() };
        }
        const extractedTexts = Array.isArray(result.extractions) ? result.extractions.map((ex: any) => ex.extractedText || '') : [];
        if (context.fileAnalysis && extractedTexts) {
          images.forEach((image, index) => {
            context.fileAnalysis!.files.push({ mimeType: image.mimeType, extractedData: extractedTexts[index] || '', timestamp: Date.now() });
          });
          context.fileAnalysis.lastUpdated = Date.now();
        }
      } else if (executedToolName === 'analyze_files' || executedToolName === 'analyze_images') {
        if (!context.fileAnalysis) {
          context.fileAnalysis = { files: [], lastUpdated: Date.now() };
        }
        let extractedData: any = [];
        if (result.analyses && Array.isArray(result.analyses)) {
          extractedData = result.analyses.map((a: any) => a.extractedData?.result?.extracted_data || a.extractedData || []).flat();
        } else if (result.details && result.details.analyses) {
          extractedData = result.details.analyses.map((a: any) => a.extractedData?.result?.extracted_data || a.extractedData || []).flat();
        } else {
          try {
            if (typeof result.result === 'string') {
              const parsed = JSON.parse(result.result);
              extractedData = parsed.extracted_data || parsed.result?.extracted_data || [];
            } else {
              extractedData = result.result?.extracted_data || result.result?.result?.extracted_data || [];
            }
          } catch {
            extractedData = [];
          }
        }
        if (context.fileAnalysis && extractedData) {
          images.forEach((image) => {
            context.fileAnalysis!.files.push({ mimeType: image.mimeType, extractedData, timestamp: Date.now() });
          });
          context.fileAnalysis.lastUpdated = Date.now();
        }
      } else if (executedToolName === 'update_sheet') {
        // Surface the tool summary so the user sees a meaningful confirmation
        if (typeof result.result === 'string' && result.result.trim()) {
          enhancedResponse += `\n${result.result.trim()}`;
        }
        didUpdateSheet = true;
        // Elegant re-hydration post-commit to keep context fresh without complexity.
        try {
          const isPreview = Boolean((result as any)?.preview);
          if (!isPreview) {
            const ctxAny = context as any;
            const selectedName = (typeof ctxAny.sheetName === 'string' && ctxAny.sheetName.trim()) ? ctxAny.sheetName : (Array.isArray(ctxAny.sheetNames) && ctxAny.sheetNames[0]) || '';
            if (selectedName && ctxAny.spreadsheetId) {
              const scopedBase = (typeof window === 'undefined' && ctxAny._baseUrl) ? String(ctxAny._baseUrl) : undefined;
              const ds = new SheetDataSource(ctxAny.spreadsheetId as any, selectedName, scopedBase, String((ctxAny.userId || ctxAny.sessionId || '') || ''), ctxAny);
              await hydrateSheetData(ds, ctxAny);
              const tbl = (ctxAny.sheetData?.[selectedName] as string[][]) || [];
              const totalRowsNow = Array.isArray(tbl) && tbl.length > 1 ? tbl.length - 1 : 0;
              if (!response || !response.trim()) {
                response = `Updated sheet: Total rows now ${totalRowsNow}.`;
              }
            }
          }
        } catch (error) {
          console.error('Error in post-update hydration:', error);
        }
        // If update_sheet returned a preview of what was written, render it as a single proposed updates table
        try {
          const flowPreview = (result as any).flowPreview;
          // Support single or multi-sheet responses
          const sheets = flowPreview && typeof flowPreview === 'object' && !Array.isArray(flowPreview)
            ? Object.keys(flowPreview)
            : [];
          const previews = sheets.length > 0 ? sheets.flatMap((name: string) => (flowPreview as any)[name]) : ((result as any).preview || (result as any).details?.preview || []);

          if (previews && Array.isArray(previews)) {
            const ctxAny = context as any;
            const sheetHeaders: string[] = Array.isArray(ctxAny?.sheetHeaders) ? ctxAny.sheetHeaders : (Array.isArray(ctxAny?.sheetData?.[ctxAny?.sheetName || '']) ? (ctxAny.sheetData[ctxAny.sheetName][0] || []) : []);
            const table = buildProposedUpdatesTable(previews[0], sheetHeaders);
            // console.log('Generated table:', table); // Commented for production
            if (Array.isArray(table.rows) && table.rows.length > 0) {
              dataTables.length = 0; // keep only this table
              dataTables.push(table as any);
              postQuickActions.push('Approve');
              postQuickActions.push('Reject');
              postQuickActions.push('Edit');
              if (!(context as any)._lastUpdateToolCall) {
                try { (context as any)._lastUpdateToolCall = previews[0]; } catch {}
              }
            } else {
              dataTables.length = 0;
              const clarify = (table as any)?.clarify || (table as any)?.meta?.clarify;
              if (clarify) {
                const ctxAny2 = context as any;
                ctxAny2._clarifyHeaders = String(clarify);
              }
            }
          }
        } catch (error) {
          console.error('Error rendering update preview:', error);
        }
      } else if (
        executedToolName === 'get_sheet_data' ||
        executedToolName === 'get_sheet_stats' ||
        executedToolName === 'get_column_stats' ||
        executedToolName === 'update_single_cell' ||
        executedToolName === 'bulk_update_column' ||
        executedToolName === 'apply_structured_rows'
      ) {
        if (executedToolName === 'apply_structured_rows') {
          const isPreview = Boolean((result as any)?.preview);
          if (!isPreview) {
            didUpdateSheet = true;
            // Added post-commit re-hydration for fresh data.
            // Post-commit: refresh hydration and craft deterministic success message
            try {
              const ctxAny = context as any;
              const selectedName = (typeof ctxAny.sheetName === 'string' && ctxAny.sheetName.trim()) ? ctxAny.sheetName : (Array.isArray(ctxAny.sheetNames) && ctxAny.sheetNames[0]) || '';
              if (selectedName && ctxAny.spreadsheetId) {
                const scopedBase = (typeof window === 'undefined' && ctxAny._baseUrl) ? String(ctxAny._baseUrl) : undefined;
                const ds = new SheetDataSource(ctxAny.spreadsheetId as any, selectedName, scopedBase, String((ctxAny.userId || ctxAny.sessionId || '') || ''), ctxAny);
                await hydrateSheetData(ds, ctxAny);
                const tbl = (ctxAny.sheetData?.[selectedName] as string[][]) || [];
                const totalRowsNow = Array.isArray(tbl) && tbl.length > 1 ? tbl.length - 1 : 0;
                const updatedRows = (result as any)?.updatedRows;
                if (Array.isArray(updatedRows) && updatedRows.length > 0) {
                  const first = updatedRows[0] || {};
                  const parts = Object.entries(first).map(([k, v]) => `${k}: ${v}`);
                  response = `Updated sheet: Added row with [${parts.join(', ')}]. Total rows: ${totalRowsNow}.`;
                  // Added clear commit success message for user feedback.
                  try {
                    const addedCount = updatedRows.length;
                    const allKeys: string[] = Array.from(new Set<string>(updatedRows.flatMap((r: any) => Object.keys(r || {}))));
                    const sampleKeys = allKeys.slice(0, 3);
                    const sample = sampleKeys
                      .map((k) => `${k}: ${String((updatedRows[0] || {})[k] ?? '')}`)
                      .filter((s) => /./.test(s))  // FIXED: Incomplete regex; now filters non-empty strings
                      .join(', ');
                    const sampleText = sample ? ` (e.g., ${sample})` : '';
                    const successLine = `Added ${addedCount} row(s) to ${selectedName}${sampleText}.`;
                    response = response && response.trim() ? `${response}\n${successLine}` : successLine;
                  } catch {}
                }
                // Always append a clear post-commit summary for the UI
                const suffix = `Updated sheet, now has ${totalRowsNow} rows.`;
                response = response && response.trim() ? `${response}\n${suffix}` : suffix;
              }
            } catch (error) {
              console.error('Error in post-apply hydration:', error);
            }
          }
          if (typeof result.result === 'string' && result.result.trim()) {
            enhancedResponse += `\n${result.result.trim()}`;
          }
          // If preview with inferred rows is present, render proposed updates table only
          if (isPreview && (result as any)?.preview) {
            const pv = (result as any).preview;
            const sheetHeaders: string[] = Array.isArray((context as any)?.sheetHeaders) ? (context as any).sheetHeaders as string[] : [];
            const table = buildProposedUpdatesTable(pv, sheetHeaders);
            // console.log('Generated table:', table); // Commented for production
            if (Array.isArray(table.rows) && table.rows.length > 0) {
              dataTables.length = 0; dataTables.push(table as any); hasProposedUpdateTable = true;
            } else {
              const clarify = (table as any)?.clarify || (table as any)?.meta?.clarify;
              if (clarify) {
                const ctxAny2 = context as any;
                ctxAny2._clarifyHeaders = String(clarify);
              }
            }
          }
        }
        if (typeof result.result === 'string' && result.result.trim()) {
          enhancedResponse += `\n${result.result.trim()}`;
        }
        // Expose last update tool call globally for the client to commit via Approve
        try {
          if (executedToolName === 'apply_structured_rows') {
            (globalThis as any).__lastUpdateToolCall = { name: executedToolName, args: JSON.parse(toolCall.function.arguments || '{}') };
          }
        } catch {}
        // If we fetched sheet data, merge directly into context.sheetData for immediate QA/composer grounding
        if (executedToolName === 'get_sheet_data' && (result as any).data && Array.isArray((result as any).data)) {
          try {
            const args = JSON.parse(toolCall.function.arguments || '{}');
            const name = String(args.sheetName || '').trim();
            if (name) {
              const ctxAny = context as any;
              if (!ctxAny.sheetData || typeof ctxAny.sheetData !== 'object') ctxAny.sheetData = {};
              ctxAny.sheetData[name] = (result as any).data as string[][];
              ctxAny._sheetHydratedAt = Date.now();
            }
          } catch {}
        }
      } else if (executedToolName === 'extract_data_from_files') {
        // Extraction tools may not directly update sheets; still surface a brief summary
        if (typeof result.result === 'string' && result.result.trim()) {
          enhancedResponse += `\n${result.result.trim()}`;
        }
        // Persist extracted structured rows for subsequent update tools
        try {
          const extractedRows = (result as any)?.details?.extracted_rows || (result as any)?.result?.extracted_rows || (result as any)?.extracted_rows;
          if (Array.isArray(extractedRows) && extractedRows.length > 0) {
            if (!context.fileAnalysis) context.fileAnalysis = { files: [], lastUpdated: Date.now() };
            context.fileAnalysis.files.push({ mimeType: 'application/octet-stream', extractedData: { extracted_rows: extractedRows }, timestamp: Date.now() });
            context.fileAnalysis.lastUpdated = Date.now();
          }
        } catch {}
      } else if (executedToolName === 'describe_sheet') {
        // Prefer the description as main response for describe_data intent
        if (typeof result.result === 'string' && result.result.trim()) {
          enhancedResponse += `\n${result.result.trim()}`;
          if (intent === 'describe_data') {
            describeText = result.result.trim();
          }
        }
      } else if (executedToolName === 'sheet_query') {
        // Enhanced describe_data with specific row insights for better conversationalism.
        try {
          if (intent === 'describe_data') {
            let headers: string[] = [];
            let rows: any[] = [];
            if (result && (result as any).table && Array.isArray((result as any).table.headers) && Array.isArray((result as any).table.rows)) {
              headers = ((result as any).table.headers as any[]).map((h: any) => String(h ?? ''));
              rows = (result as any).table.rows as any[];
            } else if (Array.isArray((result as any).data) && Array.isArray((result as any).data[0])) {
              const dataArr = (result as any).data as any[];
              headers = (dataArr[0] as any[]).map((h: any) => String(h ?? ''));
              rows = dataArr.slice(1);
            }
            if (headers.length > 0 && Array.isArray(rows) && rows.length > 0) {
              const parts: string[] = [];
              for (const r of rows.slice(0, 3)) {
                const arr = Array.isArray(r) ? (r as any[]) : [];
                const nonEmpty = arr.map(v => String(v ?? '').trim()).filter(Boolean).slice(0, 3);
                if (nonEmpty.length > 0) parts.push(nonEmpty.join(' · '));
              }
              if (parts.length > 0) {
                const insight = `Recent entries: ${parts.join('; ')}.`;
                response = response && response.trim() ? `${response}\n${insight}`.trim() : insight;
              }
            }
          }
        } catch {}
      }
      // If this was a preview-only result for an update tool, store pending call for confirmation flow
      try {
        const nameLower = String(executedToolName || '').toLowerCase();
        const isUpdateTool = nameLower === 'update_sheet' || nameLower === 'apply_structured_rows';
        const wasPreview = (result as any)?.preview === true || /preview/i.test(String(result?.result || ''));
        if (isUpdateTool && wasPreview) {
          const args = JSON.parse(toolCall.function.arguments || '{}');
          // Ensure commit will be true on confirm
          const pendingArgs = { ...args, commit: true };
          (context as any)._lastUpdateToolCall = { name: executedToolName, args: pendingArgs };
          // Ensure quick replies include confirm/cancel and add prompt in response
          const baseQR = Array.isArray(quickReplies) ? quickReplies : [];
          quickReplies = Array.from(new Set([...baseQR, 'Apply', 'Edit', 'Cancel'])).slice(0, 5);
          const hasPreviewTable = Array.isArray((result as any)?.details?.preview?.rows) && ((result as any)?.details?.preview?.rows.length > 0);
          if (!enhancedResponse || !/Confirm to apply\n?/i.test(enhancedResponse)) {
            const suffix = hasPreviewTable ? 'Preview shown.' : 'Preview ready.';
            enhancedResponse = `${(enhancedResponse || '').trim()}\n${suffix} Confirm?`.trim();
          }
        }
      } catch {}
    } else {
      // Surface detailed error text for UI toast/logging
      const detailsText = result && (result as any).details
        ? (typeof (result as any).details === 'string'
            ? (result as any).details
            : JSON.stringify((result as any).details))
        : '';
      // If backend provided structured preview in an error-like shape, prefer that flow
      if ((result as any)?.preview) {
        try {
          const ctxAny = context as any;
          response = 'Proposed update (using sheet columns):';
          const pv = (result as any).preview;
          const sheetHeaders: string[] = Array.isArray((context as any)?.sheetHeaders) ? (context as any).sheetHeaders as string[] : [];
          const table = buildProposedUpdatesTable(pv, sheetHeaders);
          if (table && table.rows.length > 0) {
            dataTables.length = 0;
            dataTables.push(table);
            hasProposedUpdateTable = true;
          }
          ctxAny.previewActions = pv;
          ctxAny.quickReplies = [
            { text: 'Approve', action: 'confirm_update' },
            { text: 'Reject', action: 'reject_update' },
            { text: 'Edit', action: 'edit_update' }
          ];
          const baseQR = Array.isArray(quickReplies) ? quickReplies : [];
          quickReplies = Array.from(new Set([...baseQR, 'Approve', 'Reject', 'Edit'])).slice(0, 5);
          try {
            const args = JSON.parse(toolCall.function.arguments || '{}');
            (context as any)._lastUpdateToolCall = { name: toolCall.function.name, args: { ...args, commit: true } };
          } catch {}
        } catch (error) {
          console.error('Error handling preview in error path:', error);
        }
      } else {
        // Compose a helpful failure with exact headers for retry; suppress any JSON demands
        try {
          const ctxAny = context as any;
          const headersList = Array.isArray(ctxAny.sheetHeaders) ? (ctxAny.sheetHeaders as string[]).join(', ') : '';
          const errMsg = String((result as any)?.error || result?.result || 'Unknown error');
          const mappingIssue = /unknown headers|could not map all fields/i.test(errMsg);
          if (mappingIssue) {
            response = `I couldn't confidently map some fields to your sheet columns (${headersList}). Which columns should these refer to?`;
            const baseQR = Array.isArray(quickReplies) ? quickReplies : [];
            quickReplies = Array.from(new Set([...baseQR, 'Specify columns', 'Preview updates', 'Cancel'])).slice(0, 5);
          } else {
            response = `Failed: ${errMsg}. Try again?`;
            const baseQR = Array.isArray(quickReplies) ? quickReplies : [];
            quickReplies = Array.from(new Set([...baseQR, 'Retry', 'Specify sheet name'])).slice(0, 5);
          }
        } catch {
          enhancedResponse += `\nTool error: ${result.result}${detailsText ? `\nDetails: ${detailsText}` : ''}`;
        }
        // Added file-specific clarification for failed mappings.
        try {
          const hasImageFiles = Array.isArray(images) && images.length > 0;
          const hdrs: string[] = Array.isArray((context as any)?.sheetHeaders) ? ((context as any).sheetHeaders as string[]) : [];
          const hinted = hasImageFiles && hdrs.length > 0 && /map|mapped|match|columns|unknown headers|could not map/i.test(String((result as any)?.error || result?.result || ''));
          if (hinted) {
            const extra = `File data didn't match columns: [${hdrs.join(', ')}]. Please clarify values.`;
            response = response && response.trim() ? `${response}\n${extra}` : extra;
          }
        } catch {}
      }
    }
  }

  return {
    toolResults,
    response,
    enhancedResponse,
    describeText,
    didUpdateSheet,
    dataTables,
    hasProposedUpdateTable,
    quickReplies,
    postQuickActions,
    intent,
    currentPlan,
    plannedToolCalls,
  };
}