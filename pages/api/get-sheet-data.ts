import { getGoogleSheetsClient, normalizeSpreadsheetId } from '@/lib/googleSheets';
import { escapeSheetName } from '@/lib/sheetUtils';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createLogger } from '@/lib/logger';

// Response cache (extendable to Redis). Use 5-minute TTL and include session/user keys if provided
const RESPONSE_TTL_MS = 5 * 60 * 1000;
type CacheEntry = { at: number; payload: { data: unknown; structure?: unknown } };
const responseCache = new Map<string, CacheEntry>();
const cacheKey = (spreadsheetId: string, sheetName: string, range?: string, sessionKey?: string) => `${sessionKey || 'anon'}::${spreadsheetId}::${sheetName}::${range || 'auto'}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestId = Math.random().toString(36).substr(2, 9);
  const log = createLogger(`api/get-sheet-data:${requestId}`);
  log.debug('Start');
  log.debug('Headers', req.method, req.headers);
  log.debug('Body', req.body);
  
  try {
    const sheets = await getGoogleSheetsClient();
    const { spreadsheetId: rawSpreadsheetId, sheetName, range, tailRows, sessionKey } = req.body;
    const spreadsheetId = normalizeSpreadsheetId(rawSpreadsheetId);

    // Serve from cache if fresh
    const key = cacheKey(
      spreadsheetId,
      sheetName,
      range ? String(range) : (typeof tailRows === 'number' ? `tail:${tailRows}` : undefined),
      typeof sessionKey === 'string' ? sessionKey : undefined
    );
    const cached = responseCache.get(key);
    if (cached && Date.now() - cached.at < RESPONSE_TTL_MS) {
      log.debug('Cache hit', key);
      return res.status(200).json(cached.payload);
    }

    log.debug('Params', { spreadsheetId, sheetName, range: range || 'tail' });

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

    // Explicit range override: return exactly the requested range
    if (typeof range === 'string' && range.trim()) {
      try {
        const escaped = escapeSheetName(sheetName);
        const finalRange = `${escaped}!${range}`;
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: finalRange,
          valueRenderOption: 'FORMATTED_VALUE',
          dateTimeRenderOption: 'FORMATTED_STRING',
        });
        const payload = { data: (response.data.values || []) as string[][] };
        responseCache.set(key, { at: Date.now(), payload });
        return res.status(200).json(payload);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('Unable to parse range') || msg.includes('not found')) {
          const availableSheets = await getAvailableSheetNames(spreadsheetId);
          return res.status(404).json({
            error: `Sheet "${sheetName}" not found in spreadsheet`,
            details: msg,
            availableSheets,
            requestedSheet: sheetName,
            suggestion: availableSheets.length > 0 ? `Try using "${availableSheets[0]}" instead` : 'No sheets available',
            requestId
          });
        }
        return res.status(500).json({ error: 'Failed to fetch range', details: msg, requestId });
      }
    }

    if (!range) {
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
        const escapedSheetName = escapeSheetName(sheetName);
        
        // Bottom-biased strategies when requesting recent rows
        const tail = typeof tailRows === 'number' && tailRows > 0 ? tailRows : 0;
        const tailSizes = tail ? [Math.max(200, tail * 2), Math.max(100, tail)] : [];
        const tailStrategies = tailSizes.map(sz => {
          const start = Math.max(1, rowCount - sz + 1);
          return `${escapedSheetName}!A${start}:${endColumn}${rowCount}`;
        });

        // Try different range strategies based on sheet size
        const baseStrategies = [
          // Use just the columns with all rows as a safe fallback
          `${escapedSheetName}!A:${endColumn}`,
        ];
        const strategies = [...tailStrategies, ...baseStrategies];
        const tailSet = new Set(tailStrategies);
        
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

            // Prepare values and headers (tail-only window)
            const values = (response.data.values || []) as string[][];
            let headers: string[] = [];
            try {
              const headerResp = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${escapedSheetName}!1:1`,
                valueRenderOption: 'FORMATTED_VALUE',
                dateTimeRenderOption: 'FORMATTED_STRING',
              });
              headers = (headerResp.data.values?.[0] as string[]) || [];
            } catch {}

            const tailCount = typeof tailRows === 'number' && tailRows > 0 ? tailRows : 0;
            const sliced = tailCount > 0 ? values.slice(-tailCount) : values;

            const payload = { data: [headers, ...sliced] };
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
        if (metaErrorMsg.includes('This operation is not supported for this document')) {
          return res.status(400).json({
            error: 'The provided ID is not a Google Sheet.',
            details: metaErrorMsg,
            hint: 'Open the Google Sheet in your browser and copy the ID from the URL between /d/ and /edit. If this is an Excel file, open it in Google Sheets and save as a Google Sheet first.',
            requestId
          });
        }
        
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
            const payload = { data: values };
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

    // Unreachable: explicit range handled above
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