import { getGoogleSheetsClient, normalizeSpreadsheetId, getSheetDataEfficiently } from '@/lib/googleSheets';
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
      // Use the optimized efficient approach
      try {
        log.debug('Fetching sheet data efficiently for', sheetName);

        const result = await getSheetDataEfficiently(spreadsheetId, sheetName, {
          maxRows: 1000, // Limit to prevent excessive data
          includeHeaders: true,
          tailRows: typeof tailRows === 'number' && tailRows > 0 ? tailRows : undefined
        });

        let finalData = result.data;

        // Filter out total rows (row 3) when processing data
        if (finalData.length > 2) {
          // Check if row 3 (index 2) is a total row and filter it out
          const totalRowIndex = 2; // 0-based index for row 3
          if (totalRowIndex < finalData.length) {
            const totalRow = finalData[totalRowIndex];
            const isTotalRow = totalRow.some(cell =>
              String(cell).toLowerCase().includes('total') ||
              String(cell).startsWith('=SUM') ||
              String(cell).startsWith('=sum')
            );

            if (isTotalRow) {
              log.debug('Filtering out total row at index 2');
              finalData = finalData.filter((_, index) => index !== totalRowIndex);
            }
          }
        }

        const payload = { data: finalData };
        responseCache.set(key, { at: Date.now(), payload });
        return res.status(200).json(payload);

      } catch (efficientError: unknown) {
        const errorMsg = efficientError instanceof Error ? efficientError.message : String(efficientError);
        log.warn('Efficient fetch failed, falling back to legacy approach', errorMsg);

        // Check if it's a sheet not found error
        if (errorMsg.includes('not found')) {
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

        // If it's a different error, return generic error
        return res.status(500).json({
          error: 'Failed to fetch sheet data',
          details: errorMsg,
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