import { Context, ConversationHistoryItem, ImageData } from './types';
import { generateQuickReplies } from './quickReplies';
import { executeToolCall } from './toolExecution';
import { DataSource, SheetDataSource, FileDataSource } from '../data/source';
import { executeToolPlan } from './executionOrchestrator';
import { buildUserResponse } from './responseBuilder';
import { handleFatalError, handleHydrationError, handleGenericHydrationError, createUserFriendlyError } from './errorHandling';

// Enhanced describe_data with specific row insights for better conversationalism.
// Helper: robustly extract headers from diverse tool response shapes
function extractHeadersFromTool(toolRes: any): string[] {
  try {
    if (!toolRes) return [];
    // Direct table.headers
    const table = (toolRes as any).table || (toolRes as any).details?.table;
    if (table && Array.isArray(table.headers)) {
      return (table.headers as any[]).map((h: any) => String(h ?? ''));
    }
    // table.rows[0]
    if (table && Array.isArray(table.rows) && Array.isArray(table.rows[0])) {
      return (table.rows[0] as any[]).map((h: any) => String(h ?? ''));
    }
    // data[0].values or data[0]
    const data = (toolRes as any).data || (toolRes as any).details?.data;
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      if (first && Array.isArray((first as any).values)) {
        return ((first as any).values as any[]).map((h: any) => String(h ?? ''));
      }
      if (Array.isArray(first)) {
        return (first as any[]).map((h: any) => String(h ?? ''));
      }
    }
    // Sometimes servers return JSON in result string
    const result = (toolRes as any).result;
    if (typeof result === 'string' && result.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(result);
        return extractHeadersFromTool(parsed);
      } catch {}
    }
  } catch {}
  return [];
}

export async function processMessage(
  message: string,
  context: Context,
  conversationHistory: ConversationHistoryItem[],
  images: ImageData[] = []
) {
  try {
    // Provide a current date to all downstream logic and planner
    try { (context as any).currentDate = '08/13/2025'; } catch {}
    // Initialize and append current user message to in-context history (keep last 5)
    try {
      const ctxAny = context as any;
      const existing: ConversationHistoryItem[] = Array.isArray(ctxAny.conversationHistory) ? ctxAny.conversationHistory : [];
      const combined = [...existing, { role: 'user', content: String(message || ''), timestamp: Date.now() }];
      ctxAny.conversationHistory = combined.slice(-5);
    } catch {}

    // Quick helper to extract a probable sheet/tab name from free text (e.g., "fuel weekly repo")
    const extractSheetNameFromMessage = (msg: string): string | undefined => {
      try {
        const m = String(msg || '');
        // 1) Quoted names: "... \"Fuel Weekly Repo\" ..."
        const q = m.match(/\"([^\"]{2,80})\"|\'([^\']{2,80})\'/);
        if (q) return (q[1] || q[2] || '').trim();
        // 2) Patterns like: overview of X, describe X, about X
        const ofPat = m.match(/(?:overview\s+of|summary\s+of|describe|about)\s+(?:my\s+)?([a-z0-9 _\-()]{3,80})/i);
        if (ofPat) return (ofPat[1] || '').trim();
        // 3) Patterns like: my X sheet/data/repo
        const myPat = m.match(/\bmy\s+([a-z0-9 _\-()]{3,80})\s+(?:sheet|tab|data|repo|report)\b/i);
        if (myPat) return (myPat[1] || '').trim();
        // 4) After the word 'of' at end: 'summarize ... of X'
        const tailPat = m.match(/\bof\s+([a-z0-9 _\-()]{3,80})$/i);
        if (tailPat) return (tailPat[1] || '').trim();
      } catch {}
      return undefined;
    };

    // New: extract a spreadsheetId from recent conversation history (URLs or explicit mentions)
    const extractIdFromHistory = (history: ConversationHistoryItem[] | undefined): string | undefined => {
      try {
        const items = Array.isArray(history) ? history.slice().reverse() : [];
        for (const it of items) {
          const text = String(it?.content || '');
          // Match Google Sheets URL pattern
          const m1 = text.match(/https?:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
          if (m1 && m1[1]) return m1[1];
          // Match explicit key-value like: spreadsheetId: ABC123
          const m2 = text.match(/\bspreadsheetId\s*[:=]\s*([a-zA-Z0-9-_]{10,})/i);
          if (m2 && m2[1]) return m2[1];
        }
      } catch {}
      return undefined;
    };

    // New: robustly extract a sheet name from message and history; includes specific known names
    const extractSheetName = (
      msg: string,
      history: ConversationHistoryItem[] | undefined
    ): string | undefined => {
      // Try quoted and heuristic parsing first
      let name = extractSheetNameFromMessage(msg);
      if (!name && Array.isArray(history)) {
        for (const it of history.slice().reverse()) {
          name = extractSheetNameFromMessage(String(it?.content || ''));
          if (name) break;
        }
      }
      // Known names fallback
      if (!name) {
        const combined = `${String(msg || '')}\n${(Array.isArray(history) ? history.map(h => String(h.content || '')).join('\n') : '')}`;
        const m = combined.match(/(fuel\s+weekly\s+repo|logbook)/i);
        if (m && m[1]) name = m[1];
      }
      return name?.trim() || undefined;
    };

    // New: validate and infer sheet context up front so hydration has a target
    const inferSheetContext = (
      msg: string,
      ctx: any,
      history: ConversationHistoryItem[] | undefined
    ) => {
      if (!ctx.spreadsheetId) {
        ctx.spreadsheetId = extractIdFromHistory(history) || 'default-id';
      }
      if (!ctx.sheetName && Array.isArray(ctx.sheetNames) && ctx.sheetNames.length > 0) {
        ctx.sheetName = ctx.sheetNames[0];
      }
      if (!ctx.sheetName) {
        ctx.sheetName = extractSheetName(msg, history) || 'Sheet1';
      }
      if (!Array.isArray(ctx.sheetNames) || ctx.sheetNames.length === 0) {
        if (ctx.sheetName) ctx.sheetNames = [ctx.sheetName];
      }
    };

    // Invoke inference before any hydration logic
    try {
      const ctxAny = context as any;
      inferSheetContext(message, ctxAny, conversationHistory);
      
      // Ensure selected sheets are in context
      const selectedSheets = (context as any).sheetNames || []; // Assume this comes from UI chips
      if (selectedSheets.length > 0 && !context.sheetName) {
        context.sheetName = selectedSheets[0]; // Default to first selected
      }
      
      if (!ctxAny.spreadsheetId || !ctxAny.sheetName) {
        ctxAny.error = 'No valid sheet selected.';
      }
    } catch {}

    const isGreeting = /^(hi|hello|hey|yo|howdy|good\s+(morning|afternoon|evening))\b/i.test((message || '').trim());
    if (isGreeting) {
      const quickReplies = await generateQuickReplies(message, conversationHistory, context, 'chat', false);
      return {
        response: 'Hi! How can I help with your sheet or files?',
        toolCalls: [],
        pendingToolCalls: [],
        toolResults: [],
        context,
        quickReplies
      };
    }

    const hasFiles = images && images.length > 0;
    
    // Extract structured data from files if present
    if (hasFiles) {
      try {
        const ctxAny = context as any;
        ctxAny.fileData = [];
        
        for (let i = 0; i < images.length; i++) {
          const image = images[i];
          try {
            // Use the existing file analysis flow to extract structured data
            const apiKey = process.env.GOOGLE_GENAI_API_KEY;
            if (apiKey) {
              const { analyzeFileFlow } = await import('@/genkit/analyzeFileFlow');
              const flow = analyzeFileFlow(apiKey);
              const result = await flow.run({ 
                prompt: message || 'Extract all relevant data from this file that could be added to a spreadsheet', 
                files: [image] 
              });
              
              if (result && typeof result === 'object') {
                const extractedRows = (result as any).extracted_rows || [];
                const inferredHeaders = (result as any).inferredHeaders || [];
                
                ctxAny.fileData.push({
                  index: i,
                  mimeType: image.mimeType,
                  name: image.name,
                  extractedData: result,
                  rows: extractedRows,
                  headers: inferredHeaders.length > 0 ? inferredHeaders : (extractedRows.length > 0 ? Object.keys(extractedRows[0] || {}) : [])
                });
              }
            }
          } catch (error) {
            console.warn(`Failed to analyze file ${i}:`, error);
            ctxAny.fileData.push({
              index: i,
              mimeType: image.mimeType,
              name: image.name,
              error: String(error)
            });
          }
        }
        
        // Set extraction flag for planner
        ctxAny.flag = 'extraction';
      } catch (error) {
        console.warn('File analysis failed:', error);
      }
    }
    
    // Check for mapping flag from user message
    if (message && typeof message === 'string') {
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('map') || lowerMessage.includes('mapping') || lowerMessage.includes('align')) {
        try {
          const ctxAny = context as any;
          if (!ctxAny.flag) {
            ctxAny.flag = 'mapped';
          }
        } catch {}
      }
    }

    // Intercept confirmation/cancellation for pending previewed updates
    try {
      const lower = String(message || '').toLowerCase();
      // Include 'approve' as a confirmation trigger so typing "Approve" commits the pending update
      const isConfirm = /(confirm\s+update|apply\s+changes|yes,\s*apply|go\s*ahead|^apply$|^approve$|approve\s+(it|changes))$/i.test(lower.trim());
      const isEdit = /^(edit|adjust|modify)$/i.test(lower.trim());
      // Treat 'reject' as a cancellation trigger in addition to 'cancel'
      const isCancel = /^(cancel|cancel\s+update|no|nevermind|never\s+mind|reject|decline)$/i.test(lower.trim());
      const pending = (context as any)._lastUpdateToolCall as { name: string; args: any } | undefined;
      if (pending && (isConfirm || isCancel || isEdit)) {
        if (isCancel) {
          try { (context as any)._lastUpdateToolCall = undefined; } catch {}
          return {
            response: 'Canceled. No changes were applied.',
            toolCalls: [],
            pendingToolCalls: [],
            toolResults: [],
            context,
            quickReplies: ['Show current sheet data', 'Preview updates']
          };
        }
        if (isEdit) {
          return {
            response: 'Okay. What would you like to change before applying?',
            toolCalls: [],
            pendingToolCalls: [],
            toolResults: [],
            context,
            quickReplies: ['Change amount', 'Change client', 'Cancel']
          };
        }
        // Re-run the pending tool with commit=true
        const call = {
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: { name: pending.name, arguments: JSON.stringify({ ...(pending.args || {}), commit: true }) }
        } as any;
        const result = await executeToolCall(call, context, images);
        try { (context as any)._lastUpdateToolCall = undefined; } catch {}
        const success = !!result?.success;
        const msg = success ? (String(result?.result || 'Applied updates.')) : `Tool error: ${String(result?.error || result?.result || 'Failed to apply')}`;
        return {
          response: msg,
          toolCalls: [],
          pendingToolCalls: [],
          toolResults: [result],
          context,
          quickReplies: ['Show current sheet data', 'Undo (not available)', 'Add more data']
        };
      }
    } catch {}

    // Helper to hydrate sheet data early and prepare summary for planner (robust range fallback)
    const hydrateSheetData = async (ds: DataSource, ctxAny: any): Promise<void> => {
			// Prefer client-provided cache when available to avoid unnecessary server calls
			try {
				const cachedName = (ctxAny.sheetName && String(ctxAny.sheetName)) || 'Sheet1';
				const cachedTable = ctxAny?.sheetData?.[cachedName];
				if (Array.isArray(cachedTable) && cachedTable.length > 0) {
					const headers = Array.isArray(cachedTable[0]) ? cachedTable[0] : [];
					if (Array.isArray(headers) && headers.length > 0) {
						ctxAny.sheetHeaders = headers;
					}
					ctxAny._sheetHydratedAt = Date.now();
					ctxAny._hydrationSource = 'client_cache';
					return;
				}
			} catch {}
      
      try {
        // Initialize sheetData if not present
        ctxAny.sheetData = ctxAny.sheetData || {};
        
        // Get all sheet names to hydrate
        const sheetNames = Array.isArray(ctxAny.sheetNames) && ctxAny.sheetNames.length > 0 
          ? ctxAny.sheetNames 
          : [(ctxAny.sheetName && String(ctxAny.sheetName)) || 'Sheet1'];
        
        // Loop over each sheet name and load data
        const allHeaders: string[] = [];
        const allLower: string[] = [];
        const allTypes: string[] = [];
        const allSheetNames: string[] = [];
        
        for (const sheetName of sheetNames) {
          try {
            // Create a new data source for each sheet
            const scopedBase = (typeof window === 'undefined' && ctxAny._baseUrl) ? String(ctxAny._baseUrl) : undefined;
            const sessionKey = String((ctxAny.userId || ctxAny.sessionId || '') || '');
            const sheetDS = new (ds.constructor as any)(ctxAny.spreadsheetId, sheetName, scopedBase, sessionKey || undefined, ctxAny);
            
            const headers = await sheetDS.getHeaders();
            let rows = await (sheetDS as any).getSampleRows(50);
            if (!Array.isArray(rows) || rows.length === 0) {
              rows = await (sheetDS as any).getSampleRows(100, 'A1:Z100');
              if (sheetName === sheetNames[0]) { // Only set note for primary sheet
                ctxAny.hydrationNote = 'No data in standard range; scanned A1:Z100';
              }
            }
            
            if ((Array.isArray(rows) && rows.length > 0) || (Array.isArray(headers) && headers.length > 0)) {
              ctxAny.sheetData[sheetName] = [headers || [], ...(rows || [])];
              
              // Collect headers and types for combined column catalog
              if (Array.isArray(headers) && headers.length > 0) {
                const prefixedHeaders = headers.map((h: any) => `${sheetName}:${String(h ?? '')}`);
                allHeaders.push(...prefixedHeaders);
                allSheetNames.push(sheetName);
                
                // Infer types for this sheet's columns
                if (Array.isArray(rows) && rows.length > 0) {
                  for (let i = 0; i < headers.length; i++) {
                    const col = rows.map(r => r?.[i]);
                    const num = col.map(parseFloat).filter(n => Number.isFinite(n)).length;
                    const type = num / Math.max(1, col.length) > 0.5 ? 'number' : 'text';
                    allTypes.push(type);
                  }
                } else {
                  // If no rows, assume text type for all columns
                  headers.forEach(() => allTypes.push('text'));
                }
                
                // Add lowercase versions for search
                const lower = headers.map((h: any) => String(h ?? '').toLowerCase());
                allLower.push(...lower);
              }
            } else {
              ctxAny.isNonTabular = true;
            }
          } catch (e: any) {
            handleHydrationError(e, ctxAny, sheetName);
          }
        }
        
        // Set primary sheet headers for backward compatibility (first sheet)
        if (allHeaders.length > 0) {
          const primarySheet = sheetNames[0];
          const primaryHeaders = Array.isArray(ctxAny.sheetData?.[primarySheet]?.[0]) 
            ? ctxAny.sheetData[primarySheet][0] 
            : [];
          ctxAny.sheetHeaders = primaryHeaders.map((h: any) => String(h ?? ''));
        }
        
        // Create combined column catalog with all sheets
        if (allHeaders.length > 0) {
          ctxAny.columnCatalog = {
            sheets: allSheetNames,
            headers: allHeaders,
            lower: allLower,
            types: allTypes,
            primarySheet: sheetNames[0]
          };
        }
        
        ctxAny._sheetHydratedAt = Date.now();
			} catch (e: any) {
				handleGenericHydrationError(e, ctxAny);
      }
    };

    const toTitleCase = (s: string) => s.replace(/[A-Za-zÀ-ÿ][^\s-]*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

    // Infer missing sheet info from history/message, then attempt early hydration when possible
    try {
      const ctxAny = context as any;
      if (!ctxAny.sheetName || !String(ctxAny.sheetName).trim()) {
        // scan history for phrases like "sheet X"
        try {
          const items: ConversationHistoryItem[] = Array.isArray(ctxAny.conversationHistory) ? ctxAny.conversationHistory : [];
          for (const it of items.slice().reverse()) {
            const m = String(it.content || '').match(/\bsheet\s+([A-Za-z0-9 _\-()]{2,80})\b/i);
            if (m && m[1]) { ctxAny.sheetName = m[1].trim(); break; }
          }
        } catch {}
        if (!ctxAny.sheetName) {
          const guess = extractSheetNameFromMessage(message);
          if (guess) ctxAny.sheetName = guess;
        }
        if (ctxAny.sheetName && (!Array.isArray(ctxAny.sheetNames) || ctxAny.sheetNames.length === 0)) {
          ctxAny.sheetNames = [ctxAny.sheetName];
        }
      }

      if (!hasFiles && context?.spreadsheetId) {
        // Infer a likely sheet name from history or message if missing
        try {
          const ctxAny2 = context as any;
          if (!ctxAny2.sheetName || !String(ctxAny2.sheetName).trim()) {
            const guess = extractSheetNameFromMessage(message);
            if (guess) ctxAny2.sheetName = toTitleCase(guess);
          }
        } catch {}
        const sheetName = (context as any).sheetName || ((context as any).sheetNames?.[0]) || '';
        if (sheetName) {
          const scopedBase = (typeof window === 'undefined' && context && (ctxAny)._baseUrl)
            ? String((ctxAny)._baseUrl)
            : undefined;
          const sessionKey = String((ctxAny.userId || ctxAny.sessionId || '') || '');
          const earlyDS = new SheetDataSource(context.spreadsheetId, sheetName, scopedBase, sessionKey || undefined, context as any);
          const alreadyHydrated = ctxAny.sheetData && Object.keys(ctxAny.sheetData).length > 0;
          const lastAt = typeof ctxAny._sheetHydratedAt === 'number' ? ctxAny._sheetHydratedAt : 0;
          const isStale5m = Date.now() - lastAt > 5 * 60 * 1000;
          if (!alreadyHydrated || isStale5m) {
            try {
              const triggerEarly = /\b(data|sheet)\b/i.test(String(message || '')) || /^(fuel\s+weekly\s+repo|logbook)$/i.test(String(sheetName || ''));
              if (triggerEarly) {
                const headers = await earlyDS.getHeaders();
                const rows = await earlyDS.getSampleRows(50);
                const hasAny = (Array.isArray(headers) && headers.length > 0) || (Array.isArray(rows) && rows.length > 0);
                if (hasAny) {
                  const map: Record<string, string[][]> = (ctxAny.sheetData && typeof ctxAny.sheetData === 'object') ? ctxAny.sheetData : {};
                  map[sheetName] = [headers || [], ...(rows || [])];
                  ctxAny.sheetData = map;
                  ctxAny._sheetHydratedAt = Date.now();
                  if (!Array.isArray(ctxAny.sheetHeaders) || ctxAny.sheetHeaders.length === 0) {
                    ctxAny.sheetHeaders = (headers || []).map((h: any) => String(h ?? ''));
                  }
                } else {
                  // keep cached data; note that early fetch returned empty
                  ctxAny._hydrationWarning = 'Tried to refresh sheet but found no data; using cached context.';
                }
              } else {
                await hydrateSheetData(earlyDS, context as any);
              }
            } catch (e: any) {
                handleGenericHydrationError(e, context as any);
            }
          }
        }
      }
    } catch {}

    // After hydration attempts: if we captured a context error, prepare specific user guidance
    createUserFriendlyError(context as any);

    // Build an abstracted data source (sheet vs file)
    let dataSource: DataSource | null = null;
    try {
      const ctxAny = context as any;
      const scopedBase = (typeof window === 'undefined' && context && (ctxAny)._baseUrl)
        ? String((ctxAny)._baseUrl)
        : undefined;
      if (!hasFiles && context?.spreadsheetId) {
        // Prefer current sheetName or first sheetNames
        const sheetName = (ctxAny.sheetName && String(ctxAny.sheetName))
          || (Array.isArray(ctxAny.sheetNames) && ctxAny.sheetNames[0])
          || (Array.isArray(ctxAny.allSheetNames) && ctxAny.allSheetNames[0])
          || '';
        if (sheetName) {
          const sessionKey = String((ctxAny.userId || ctxAny.sessionId || '') || '');
          dataSource = new SheetDataSource(context.spreadsheetId, sheetName, scopedBase, sessionKey || undefined, context as any);
        }
      } else if (hasFiles) {
        // Build FileDataSource using any structured extractions present in tool results later
        dataSource = new FileDataSource(images as any, []);
      }
    } catch {}

    // Before planning: ensure header row is attached for planner if missing (via data source when available)
    try {
      const ctxAny = context as any;
      const hasHeaders = Array.isArray(ctxAny.sheetHeaders) && ctxAny.sheetHeaders.length > 0;
      const sheetName = typeof ctxAny.sheetName === 'string' && ctxAny.sheetName.trim() ? ctxAny.sheetName : '';
      if (!hasHeaders) {
        if (dataSource) {
          try {
            const headers = await dataSource.getHeaders();
            if (Array.isArray(headers) && headers.length > 0) {
              ctxAny.sheetHeaders = headers.map((h: any) => String(h ?? ''));
            }
          } catch {}
        } else if (context?.spreadsheetId && sheetName) {
          const toolCall = {
            id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: {
              name: 'sheet_query',
              arguments: JSON.stringify({ spreadsheetId: context.spreadsheetId, sheetName, range: 'A1:Z1' })
            }
          };
          const headerRes = await executeToolCall(toolCall as any, context, images);
          if (headerRes && headerRes.success) {
            const headers = extractHeadersFromTool(headerRes);
            if (Array.isArray(headers) && headers.length > 0) {
              ctxAny.sheetHeaders = headers.map((h: any) => String(h ?? ''));
            }
          }
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[processMessage] Header prefetch error (continuing without headers)', e);
    }

    // Proactive auto-hydration: prefer cached context.sheetData; hydrate only if missing or stale
    try {
      const now = Date.now();
      const ctxAny = context as any;
      const hasCached = ctxAny.sheetData && Object.keys(ctxAny.sheetData).length > 0;
      const lastHydration = typeof ctxAny._sheetHydratedAt === 'number' ? ctxAny._sheetHydratedAt : 0;
      const isStale = now - lastHydration > 60_000;
      const canHydrate = Boolean(dataSource);
      const shouldHydrate = Boolean(context?.spreadsheetId) && !hasCached;
      if (canHydrate && shouldHydrate && dataSource) {
        try {
          const headers = await dataSource.getHeaders();
          const rows = await dataSource.getSampleRows(800); // at least 50 samples upfront

          // Treat empty headers and rows as a failed hydration as well
          const noHeaders = !Array.isArray(headers) || headers.length === 0;
          const noRows = !Array.isArray(rows) || rows.length === 0;
          const sheetName = (context as any).sheetName || ((context as any).sheetNames?.[0]) || 'Sheet1';
          if (!(noHeaders && noRows)) {
            const map: Record<string, string[][]> = hasCached ? (ctxAny.sheetData as Record<string, string[][]>) : {};
            map[sheetName] = [headers, ...rows];
            if (Object.keys(map).length > 0) {
              ctxAny.sheetData = map;
              ctxAny._sheetHydratedAt = now;
              // Backfill sheetHeaders if not set
              if (!Array.isArray(ctxAny.sheetHeaders) || ctxAny.sheetHeaders.length === 0) {
                ctxAny.sheetHeaders = (headers || []).map((h: any) => String(h ?? ''));
              }
              // Build a lightweight column catalog for planner/QA (single sheet fallback)
              try {
                const first = Object.keys(map)[0];
                const table = map[first] || [];
                const hdrs = Array.isArray(table) && table.length > 0 ? table[0] : [];
                const lower = hdrs.map((h: string) => String(h || '').toLowerCase());
                const types = hdrs.map((_, i) => {
                  const col = (table.slice(1) as string[][]).map(r => r?.[i]);
                  const num = col.map(parseFloat).filter(n => Number.isFinite(n)).length;
                  return num / Math.max(1, col.length) > 0.5 ? 'number' : 'text';
                });
                // Use single sheet format for backward compatibility
                ctxAny.columnCatalog = { 
                  sheet: first, 
                  headers: hdrs, 
                  lower, 
                  types,
                  sheets: [first],
                  primarySheet: first
                };
              } catch {}
            }
          } else {
            ctxAny._hydrationWarning = 'Tried to refresh sheet but found no data; using cached context.';
          }
        } catch (e) {
          // Hydration failed: ensure sheetData is empty, use data source standardized error mapping, log, and enqueue a summary fallback
          try {
            if (!ctxAny.sheetData || typeof ctxAny.sheetData !== 'object') ctxAny.sheetData = {};
            else ctxAny.sheetData = {};
          } catch {}
          // eslint-disable-next-line no-console
          console.error('[processMessage] Hydration failed', e);
          try {
            const mapped = typeof (dataSource as any).onError === 'function' ? (dataSource as any).onError(e) : null;
            if (mapped && mapped.error) {
              ctxAny.error = mapped.error;
              if (mapped.fallbackData != null) ctxAny.sheetData = mapped.fallbackData;
            } else {
              const msg = e instanceof Error ? e.message : String(e);
              ctxAny.error = `Sheet access failed: ${msg}`;
            }
            ctxAny.hydrationNote = 'Failed to load data; attempting summary from available context';
          } catch {}
        }
      }
    } catch {}

    const executionResult = await executeToolPlan(message, context, conversationHistory, images, hydrateSheetData);

    if (executionResult.clarificationQuestion) {
        return {
            response: executionResult.clarificationQuestion,
            requiresClarification: true,
            plan: executionResult.plan,
            toolCalls: [],
            pendingToolCalls: [],
            toolResults: [],
            context,
            quickReplies: await generateQuickReplies(message, conversationHistory, context, executionResult.intent, hasFiles),
            dataTables: [],
            charts: [],
            insights: [],
            suppressResponseText: false
        };
    }

    return await buildUserResponse(executionResult, context, message, conversationHistory, images);

  } catch (e: any) {
    return handleFatalError(e, context);
  }
}