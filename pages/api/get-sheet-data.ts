import { getGoogleSheetsClient } from '@/lib/googleSheets';
import { findLastDataRow } from '@/lib/sheetUtils';
import { getCachedHeaders, setCachedHeaders } from '@/lib/sheetHeaderCache';
import { analyzeSheetStructure, detectHeaderRow, detectTableBlocks } from '@/lib/sheetStructure';
import { ensureHeaderVectors } from '@/lib/sheetVectorIndex';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createLogger } from '@/lib/logger';

// Lightweight in-memory response cache to reduce duplicate fetches
const RESPONSE_TTL_MS = 30 * 1000; // 30s cache to coalesce rapid requests
type CacheEntry = { at: number; payload: { data: unknown; structure: unknown } };
const responseCache = new Map<string, CacheEntry>();
const cacheKey = (spreadsheetId: string, sheetName: string, range?: string) => `${spreadsheetId}::${sheetName}::${range || 'auto'}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestId = Math.random().toString(36).substr(2, 9);
  const log = createLogger(`api/get-sheet-data:${requestId}`);
  log.debug('Start');
  log.debug('Headers', req.method, req.headers);
  log.debug('Body', req.body);
  
  try {
    const sheets = await getGoogleSheetsClient();
    const { spreadsheetId, sheetName, range } = req.body;

    // Serve from cache if fresh
    const key = cacheKey(spreadsheetId, sheetName, range);
    const cached = responseCache.get(key);
    if (cached && Date.now() - cached.at < RESPONSE_TTL_MS) {
      log.debug('Cache hit', key);
      return res.status(200).json(cached.payload);
    }

    log.debug('Params', { spreadsheetId, sheetName, range: range || 'auto' });

    if (!spreadsheetId) {
      log.warn('Missing spreadsheetId');
      return res.status(400).json({ error: 'Missing spreadsheetId', requestId });
    }

    if (!sheetName) {
      log.warn('Missing sheetName');
      return res.status(400).json({ error: 'Missing sheetName', requestId });
    }

    // Helper function to get available sheet names for better error messaging
    const getAvailableSheetNames = async (spreadsheetId: string) => {
      try {
        const sheetMetadata = await sheets.spreadsheets.get({
          spreadsheetId,
          includeGridData: false
        });
        return sheetMetadata.data.sheets?.map(s => s.properties?.title).filter(Boolean) || [];
      } catch (error) {
        log.warn('Could not fetch available sheet names', error);
        return [];
      }
    };

    // Helper function to escape sheet names for Google Sheets API
    const escapeSheetName = (name: string) => {
      // If the sheet name contains spaces, special characters, or starts with a digit,
      // wrap it in single quotes and escape any existing single quotes
      if (/[^A-Za-z0-9_]/.test(name) || /^[0-9]/.test(name)) {
        return `'${name.replace(/'/g, "''")}'`;
      }
      return name;
    };

    let finalRange: string;
    
    if (range) {
      // If a specific range is provided, use it
      finalRange = `${escapeSheetName(sheetName)}!${range}`;
      log.debug('Using provided range', finalRange);
    } else {
      // Get the actual sheet dimensions first
      try {
        log.debug('Getting sheet dimensions for', sheetName);
        
        const sheetMetadata = await sheets.spreadsheets.get({
          spreadsheetId,
          includeGridData: false
        });
        
        log.debug('Available sheets', sheetMetadata.data.sheets?.map(s => s.properties?.title) || []);
        
        const sheet = sheetMetadata.data.sheets?.find(s => s.properties?.title === sheetName);
        if (!sheet?.properties?.gridProperties) {
          const availableSheets = sheetMetadata.data.sheets?.map(s => s.properties?.title).filter(Boolean) || [];
          const errorMsg = `Sheet "${sheetName}" not found. Available sheets: ${availableSheets.join(', ')}`;
          log.warn(errorMsg);
          
                      // Return detailed error information to help the frontend handle this
            return res.status(404).json({ 
              error: errorMsg,
              availableSheets: availableSheets,
              requestedSheet: sheetName,
              suggestion: availableSheets.length > 0 ? `Try using "${availableSheets[0]}" instead` : 'No sheets available',
              requestId
            });
        }
        
        const gridProps = sheet.properties.gridProperties;
        const rowCount = gridProps.rowCount || 1000;
        const columnCount = gridProps.columnCount || 26;
        log.debug('Sheet dimensions', { rowCount, columnCount });
        
        // Convert column count to letter (A, B, C, ... Z, AA, AB, etc.)
        const getColumnLetter = (num: number) => {
          let result = '';
          while (num > 0) {
            num--;
            result = String.fromCharCode(65 + (num % 26)) + result;
            num = Math.floor(num / 26);
          }
          return result;
        };
        
        const endColumn = getColumnLetter(columnCount);
        
        // Use the actual dimensions, but cap at reasonable limits
        const maxRow = Math.min(rowCount, 1000);
        const escapedSheetName = escapeSheetName(sheetName);
        
        // Try different range strategies based on sheet size
        const strategies = [
          // 1. Use actual dimensions
          `${escapedSheetName}!A1:${endColumn}${maxRow}`,
          // 2. Use just the columns with all rows
          `${escapedSheetName}!A:${endColumn}`,
          // 3. Conservative range
          `${escapedSheetName}!A1:${endColumn}100`,
          // 4. Very safe range
          `${escapedSheetName}!A1:T50`
        ];
        
        log.debug('Trying strategies', strategies.length);
        
        for (const strategy of strategies) {
          try {
            log.debug('Try strategy', strategy);
            
            const response = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: strategy,
              valueRenderOption: 'FORMATTED_VALUE',
              dateTimeRenderOption: 'FORMATTED_STRING',
            });
            
            log.debug('Strategy success', strategy, 'rows', response.data.values?.length || 0);

            // Cache headers and last data row (TTL handled by cache consumer)
            const values = response.data.values || [];
            if (values.length > 0) {
              // Detect header row and normalize headers accordingly
              const headerDetect = detectHeaderRow(values as string[][]);
              const headerRowIdx = Math.max(0, headerDetect.rowIndex);
              const headers = (values[headerRowIdx] as string[]) || [];
              const lastRow = findLastDataRow(values as string[][]);
              setCachedHeaders(spreadsheetId, sheetName, headers, lastRow);

              // Build header vectors in background (best-effort)
              try {
                const dataRows = (values as string[][]).slice(headerRowIdx + 1);
                await ensureHeaderVectors(spreadsheetId, sheetName, headers, dataRows);
              } catch {}
            }

            // Always include structure analysis so UI can flag unstructured sheets
            let structure = null;
            try {
              const table = values as string[][];
              const meta = analyzeSheetStructure(table);
              // inject detected header row info and blocks for clients
              const headerDetect = detectHeaderRow(table);
              const blocks = detectTableBlocks(table).map(b => ({
                headerRowIndex: b.headerRowIndex,
                startRowIndex: b.startRowIndex,
                endRowIndex: b.endRowIndex,
                score: b.score
              }));
              structure = { ...meta, detectedHeaderRowIndex: headerDetect.rowIndex, blocks };
            } catch (e) {
              log.warn('Structure analysis failed', e);
            }

            const payload = { data: values, structure };
            responseCache.set(key, { at: Date.now(), payload });
            return res.status(200).json(payload);
            
          } catch (strategyError: unknown) {
            const errorMsg = strategyError instanceof Error ? strategyError.message : String(strategyError);
            log.debug('Strategy failed', strategy, errorMsg);
            
            // Check if this is a "sheet not found" error and provide better feedback
            if (errorMsg.includes('Unable to parse range') || errorMsg.includes('not found')) {
                             const availableSheets = await getAvailableSheetNames(spreadsheetId);
               return res.status(404).json({ 
                 error: `Sheet "${sheetName}" not found in spreadsheet`,
                 details: errorMsg,
                 availableSheets: availableSheets,
                 requestedSheet: sheetName,
                 suggestion: availableSheets.length > 0 ? `Try using "${availableSheets[0]}" instead` : 'No sheets available',
                 requestId
               });
            }
            continue;
          }
        }
        
         const availableSheets = await getAvailableSheetNames(spreadsheetId);
         const errorMsg = `All range strategies failed for sheet "${sheetName}"`;
         log.error(errorMsg);
        return res.status(500).json({ 
          error: errorMsg,
          availableSheets: availableSheets,
          requestedSheet: sheetName,
          requestId
        });
        
      } catch (metadataError: unknown) {
        const metaErrorMsg = metadataError instanceof Error ? metadataError.message : String(metadataError);
        log.warn('Could not get sheet metadata', metaErrorMsg);
        
        // Check if this is a sheet not found error
        if (metaErrorMsg.includes('Unable to parse range') || metaErrorMsg.includes('not found')) {
          const availableSheets = await getAvailableSheetNames(spreadsheetId);
          return res.status(404).json({ 
            error: `Sheet "${sheetName}" not found in spreadsheet`,
            details: metaErrorMsg,
            availableSheets: availableSheets,
            requestedSheet: sheetName,
            suggestion: availableSheets.length > 0 ? `Try using "${availableSheets[0]}" instead` : 'No sheets available',
            requestId
          });
        }
        
        // Fallback to very conservative ranges
        const escapedSheetName = escapeSheetName(sheetName);
        const fallbackRanges = [
          `${escapedSheetName}!A1:T50`,
          `${escapedSheetName}!A1:Z100`,
          `${escapedSheetName}!A:T`,
          `${sheetName}!A1:T50` // Try without escaping as last resort
        ];
        
        log.debug('Trying fallback ranges', fallbackRanges.length);
        
        for (const fallback of fallbackRanges) {
          try {
            log.debug('Fallback attempt', fallback);
            
            const response = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: fallback,
              valueRenderOption: 'FORMATTED_VALUE',
              dateTimeRenderOption: 'FORMATTED_STRING',
            });
            
            log.debug('Fallback success', fallback, 'rows', response.data.values?.length || 0);
            const values = response.data.values || [];
            let structure = null;
            try {
              structure = analyzeSheetStructure(values as string[][]);
            } catch (e) {
              log.warn('Structure analysis failed', e);
            }
            const payload = { data: values, structure };
            responseCache.set(key, { at: Date.now(), payload });
            return res.status(200).json(payload);
            
          } catch (fallbackError: unknown) {
            const fbErrorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            log.debug('Fallback failed', fallback, fbErrorMsg);
            
            // Check if this is a sheet not found error
            if (fbErrorMsg.includes('Unable to parse range') || fbErrorMsg.includes('not found')) {
              const availableSheets = await getAvailableSheetNames(spreadsheetId);
              return res.status(404).json({ 
                error: `Sheet "${sheetName}" not found in spreadsheet`,
                details: fbErrorMsg,
                availableSheets: availableSheets,
                requestedSheet: sheetName,
                suggestion: availableSheets.length > 0 ? `Try using "${availableSheets[0]}" instead` : 'No sheets available',
                requestId
              });
            }
            continue;
          }
        }
        
        const availableSheets = await getAvailableSheetNames(spreadsheetId);
        const errorMsg = `All fallback ranges failed for sheet "${sheetName}". Metadata error: ${metaErrorMsg}`;
        log.error(errorMsg);
        return res.status(500).json({ 
          error: errorMsg,
          availableSheets: availableSheets,
          requestedSheet: sheetName,
          requestId
        });
      }
    }

    // This should not be reached due to early returns above, but kept for explicit range case
    log.debug('Final explicit range', finalRange);
    
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: finalRange,
        valueRenderOption: 'FORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
      });

      log.debug('Final success', finalRange, 'rows', response.data.values?.length || 0);
      const data = response.data.values || [];
      let structure = null;
      try {
        structure = analyzeSheetStructure(data);
      } catch (e) {
        log.warn('Structure analysis failed', e);
      }
      const payload = { data, structure };
      responseCache.set(key, { at: Date.now(), payload });
      res.status(200).json(payload);
    } catch (finalError: unknown) {
      const finalErrorMsg = finalError instanceof Error ? finalError.message : String(finalError);
      
      // Check if this is a sheet not found error
      if (finalErrorMsg.includes('Unable to parse range') || finalErrorMsg.includes('not found')) {
        const availableSheets = await getAvailableSheetNames(spreadsheetId);
        return res.status(404).json({ 
          error: `Sheet "${sheetName}" not found in spreadsheet`,
          details: finalErrorMsg,
          availableSheets: availableSheets,
          requestedSheet: sheetName,
          suggestion: availableSheets.length > 0 ? `Try using "${availableSheets[0]}" instead` : 'No sheets available',
          requestId
        });
      }
      
      throw finalError; // Re-throw if it's not a sheet not found error
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    log.error('Sheet fetch error', {
      message: errorMsg,
      stack: errorStack,
      spreadsheetId: req.body?.spreadsheetId,
      sheetName: req.body?.sheetName,
      range: req.body?.range,
    });
    
    // Return more specific error information
    res.status(500).json({ 
      error: 'Failed to fetch sheet data',
      details: errorMsg,
      spreadsheetId: req.body?.spreadsheetId,
      sheetName: req.body?.sheetName,
      requestId
    });
  }
} 