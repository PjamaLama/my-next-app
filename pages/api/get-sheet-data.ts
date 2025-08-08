import { getGoogleSheetsClient } from '@/lib/googleSheets';
import { findLastDataRow } from '@/lib/sheetUtils';
import { getCachedHeaders, setCachedHeaders } from '@/lib/sheetHeaderCache';
import { analyzeSheetStructure } from '@/lib/sheetStructure';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestId = Math.random().toString(36).substr(2, 9);
  console.log(`🎯 [${requestId}] GET-SHEET-DATA: Starting request processing`);
  console.log(`🎯 [${requestId}] Method: ${req.method}, Headers: ${JSON.stringify(req.headers)}`);
  console.log(`🎯 [${requestId}] Body: ${JSON.stringify(req.body)}`);
  
  try {
    const sheets = await getGoogleSheetsClient();
    const { spreadsheetId, sheetName, range } = req.body;

    console.log(`🔍 [${requestId}] API Request: spreadsheet="${spreadsheetId}", sheet="${sheetName}", range="${range || 'auto'}"`);

    if (!spreadsheetId) {
      console.error(`❌ [${requestId}] Missing spreadsheetId in request`);
      return res.status(400).json({ error: 'Missing spreadsheetId', requestId });
    }

    if (!sheetName) {
      console.error(`❌ [${requestId}] Missing sheetName in request`);
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
        console.warn(`⚠️ [${requestId}] Could not fetch available sheet names:`, error);
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
      console.log(`🎯 [${requestId}] Using provided range: ${finalRange}`);
    } else {
      // Get the actual sheet dimensions first
      try {
        console.log(`📐 [${requestId}] Getting sheet dimensions for: ${sheetName}`);
        
        const sheetMetadata = await sheets.spreadsheets.get({
          spreadsheetId,
          includeGridData: false
        });
        
        console.log(`📋 [${requestId}] Available sheets in spreadsheet:`, 
          sheetMetadata.data.sheets?.map(s => s.properties?.title) || []);
        
        const sheet = sheetMetadata.data.sheets?.find(s => s.properties?.title === sheetName);
        if (!sheet?.properties?.gridProperties) {
          const availableSheets = sheetMetadata.data.sheets?.map(s => s.properties?.title).filter(Boolean) || [];
          const errorMsg = `Sheet "${sheetName}" not found. Available sheets: ${availableSheets.join(', ')}`;
          console.error(`❌ [${requestId}] ${errorMsg}`);
          
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
        console.log(`📊 [${requestId}] Sheet dimensions: ${rowCount} rows × ${columnCount} columns`);
        
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
        
        console.log(`🔄 [${requestId}] Trying ${strategies.length} range strategies...`);
        
        for (const strategy of strategies) {
          try {
            console.log(`🔍 [${requestId}] Trying strategy: ${strategy}`);
            
            const response = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: strategy,
              valueRenderOption: 'FORMATTED_VALUE',
              dateTimeRenderOption: 'FORMATTED_STRING',
            });
            
            console.log(`✅ [${requestId}] Success with: ${strategy}, rows: ${response.data.values?.length || 0}`);

            // Cache headers and last data row (TTL handled by cache consumer)
            const values = response.data.values || [];
            if (values.length > 0) {
              const headers = values[0] as string[];
              const lastRow = findLastDataRow(values as string[][]);
              setCachedHeaders(spreadsheetId, sheetName, headers, lastRow);
            }

            return res.status(200).json({ data: values });
            
          } catch (strategyError: unknown) {
            const errorMsg = strategyError instanceof Error ? strategyError.message : String(strategyError);
            console.log(`❌ [${requestId}] Failed strategy: ${strategy} - ${errorMsg}`);
            
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
        console.error(`❌ [${requestId}] ${errorMsg}`);
        return res.status(500).json({ 
          error: errorMsg,
          availableSheets: availableSheets,
          requestedSheet: sheetName,
          requestId
        });
        
      } catch (metadataError: unknown) {
        const metaErrorMsg = metadataError instanceof Error ? metadataError.message : String(metadataError);
        console.warn(`⚠️ [${requestId}] Could not get sheet metadata: ${metaErrorMsg}`);
        
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
        
        console.log(`🔄 [${requestId}] Trying ${fallbackRanges.length} fallback ranges...`);
        
        for (const fallback of fallbackRanges) {
          try {
            console.log(`🔄 [${requestId}] Fallback attempt: ${fallback}`);
            
            const response = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: fallback,
              valueRenderOption: 'FORMATTED_VALUE',
              dateTimeRenderOption: 'FORMATTED_STRING',
            });
            
            console.log(`✅ [${requestId}] Fallback success: ${fallback}, rows: ${response.data.values?.length || 0}`);
            return res.status(200).json({ data: response.data.values });
            
          } catch (fallbackError: unknown) {
            const fbErrorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            console.log(`❌ [${requestId}] Fallback failed: ${fallback} - ${fbErrorMsg}`);
            
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
        console.error(`❌ [${requestId}] ${errorMsg}`);
        return res.status(500).json({ 
          error: errorMsg,
          availableSheets: availableSheets,
          requestedSheet: sheetName,
          requestId
        });
      }
    }

    // This should not be reached due to early returns above, but kept for explicit range case
    console.log(`🎯 [${requestId}] Final attempt with explicit range: ${finalRange}`);
    
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: finalRange,
        valueRenderOption: 'FORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
      });

      console.log(`✅ [${requestId}] Final success: ${finalRange}, rows: ${response.data.values?.length || 0}`);
      const data = response.data.values || [];
      let structure = null;
      try {
        structure = analyzeSheetStructure(data);
      } catch (e) {
        console.warn(`⚠️ [${requestId}] Structure analysis failed:`, e);
      }
      res.status(200).json({ data, structure });
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
    
    console.error(`❌ [${requestId}] Sheet fetch error:`, {
      message: errorMsg,
      stack: errorStack,
      spreadsheetId: req.body?.spreadsheetId,
      sheetName: req.body?.sheetName,
      range: req.body?.range
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