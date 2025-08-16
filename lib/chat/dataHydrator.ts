import { ConversationHistoryItem } from './types';
import { DataSource, SheetDataSource } from '../data/source';
import { extractSheetNameFromMessage, extractIdFromHistory, extractSheetName } from './extractor';

// Validate and infer sheet context up front so hydration has a target
export function inferSheetContext(
  msg: string,
  ctx: any,
  history: ConversationHistoryItem[] | undefined
) {
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
}

// Helper to hydrate sheet data early and prepare summary for planner (robust range fallback)
export async function hydrateSheetContext(context: any, dataSource: DataSource): Promise<void> {
  // Prefer client-provided cache when available to avoid unnecessary server calls
  try {
    const cachedName = (context.sheetName && String(context.sheetName)) || 'Sheet1';
    const cachedTable = context?.sheetData?.[cachedName];
    if (Array.isArray(cachedTable) && cachedTable.length > 0) {
      const headers = Array.isArray(cachedTable[0]) ? cachedTable[0] : [];
      if (Array.isArray(headers) && headers.length > 0) {
        context.sheetHeaders = headers;
      }
      context._sheetHydratedAt = Date.now();
      context._hydrationSource = 'client_cache';
      return;
    }
  } catch {}
  
  try {
    // Initialize sheetData if not present
    context.sheetData = context.sheetData || {};
    
    // Get all sheet names to hydrate
    const sheetNames = Array.isArray(context.sheetNames) && context.sheetNames.length > 0 
      ? context.sheetNames 
      : [(context.sheetName && String(context.sheetName)) || 'Sheet1'];
    
    // Loop over each sheet name and load data
    const allHeaders: string[] = [];
    const allLower: string[] = [];
    const allTypes: string[] = [];
    const allSheetNames: string[] = [];
    
    for (const sheetName of sheetNames) {
      try {
        // Create a new data source for each sheet
        const scopedBase = (typeof window === 'undefined' && context._baseUrl) ? String(context._baseUrl) : undefined;
        const sessionKey = String((context.userId || context.sessionId || '') || '');
        const sheetDS = new (dataSource.constructor as any)(context.spreadsheetId, sheetName, scopedBase, sessionKey || undefined, context);
        
        const headers = await sheetDS.getHeaders();
        let rows = await (sheetDS as any).getSampleRows(50);
        if (!Array.isArray(rows) || rows.length === 0) {
          rows = await (sheetDS as any).getSampleRows(100, 'A1:Z100');
          if (sheetName === sheetNames[0]) { // Only set note for primary sheet
            context.hydrationNote = 'No data in standard range; scanned A1:Z100';
          }
        }
        
        if ((Array.isArray(rows) && rows.length > 0) || (Array.isArray(headers) && headers.length > 0)) {
          context.sheetData[sheetName] = [headers || [], ...(rows || [])];
          
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
          context.isNonTabular = true;
        }
      } catch (e: any) {
        const msg = String(e?.message || e || 'Unknown error');
        const errorMsg = `Failed to load '${sheetName}': ${msg}`;
        
        // Accumulate errors for multiple sheets
        if (!Array.isArray(context.errors)) context.errors = [];
        context.errors.push(errorMsg);
        
        // Set primary error for backward compatibility
        if (sheetName === sheetNames[0]) {
          context.error = errorMsg;
          if (msg.includes('400')) context.error += ' (invalid sheet configuration)';
          else if (msg.includes('403')) context.error += ' (check service account permissions)';
          else if (msg.includes('404')) context.error += ' (tab not found)';
        }
      }
    }
    
    // Set primary sheet headers for backward compatibility (first sheet)
    if (allHeaders.length > 0) {
      const primarySheet = sheetNames[0];
      const primaryHeaders = Array.isArray(context.sheetData?.[primarySheet]?.[0]) 
        ? context.sheetData[primarySheet][0] 
        : [];
      context.sheetHeaders = primaryHeaders.map((h: any) => String(h ?? ''));
    }
    
    // Create combined column catalog with all sheets
    if (allHeaders.length > 0) {
      context.columnCatalog = {
        sheets: allSheetNames,
        headers: allHeaders,
        lower: allLower,
        types: allTypes,
        primarySheet: sheetNames[0]
      };
    }
    
    context._sheetHydratedAt = Date.now();
  } catch (e: any) {
    const name = String((context && context.sheetName) || '');
    const msg = String(e?.message || e || 'Unknown error');
    context.error = `Failed to load '${name}': ${msg}`;
    if (msg.includes('400')) context.error += ' (invalid sheet configuration)';
    else if (msg.includes('403')) context.error += ' (check service account permissions)';
    else if (msg.includes('404')) context.error += ' (tab not found)';
    context.sheetData = context.sheetData || {};
    context.quickReplies = [
      { text: `Check tab: ${name}`, action: 'clarify_sheet' },
      { text: 'Retry', action: 'retry_hydration' }
    ];
  }
}
