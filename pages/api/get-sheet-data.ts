import { getGoogleSheetsClient } from '@/lib/googleSheets';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const sheets = await getGoogleSheetsClient();
    const { spreadsheetId, sheetName, range } = req.body;

    console.log(`🔍 API Request: spreadsheet="${spreadsheetId}", sheet="${sheetName}", range="${range || 'auto'}"`);

    if (!spreadsheetId) {
      console.error('❌ Missing spreadsheetId in request');
      return res.status(400).json({ error: 'Missing spreadsheetId' });
    }

    if (!sheetName) {
      console.error('❌ Missing sheetName in request');
      return res.status(400).json({ error: 'Missing sheetName' });
    }

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
      console.log(`🎯 Using provided range: ${finalRange}`);
    } else {
      // Get the actual sheet dimensions first
      try {
        console.log(`📐 Getting sheet dimensions for: ${sheetName}`);
        
        const sheetMetadata = await sheets.spreadsheets.get({
          spreadsheetId,
          includeGridData: false
        });
        
        console.log(`📋 Available sheets in spreadsheet:`, 
          sheetMetadata.data.sheets?.map(s => s.properties?.title) || []);
        
        const sheet = sheetMetadata.data.sheets?.find(s => s.properties?.title === sheetName);
        if (!sheet?.properties?.gridProperties) {
          const availableSheets = sheetMetadata.data.sheets?.map(s => s.properties?.title).join(', ') || 'none';
          const errorMsg = `Sheet "${sheetName}" not found. Available sheets: ${availableSheets}`;
          console.error(`❌ ${errorMsg}`);
          return res.status(404).json({ error: errorMsg });
        }
        
        const gridProps = sheet.properties.gridProperties;
        const rowCount = gridProps.rowCount || 1000;
        const columnCount = gridProps.columnCount || 26;
        console.log(`📊 Sheet dimensions: ${rowCount} rows × ${columnCount} columns`);
        
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
        
        console.log(`🔄 Trying ${strategies.length} range strategies...`);
        
        for (const strategy of strategies) {
          try {
            console.log(`🔍 Trying strategy: ${strategy}`);
            
            const response = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: strategy,
              valueRenderOption: 'FORMATTED_VALUE',
              dateTimeRenderOption: 'FORMATTED_STRING',
            });
            
            console.log(`✅ Success with: ${strategy}, rows: ${response.data.values?.length || 0}`);
            return res.status(200).json({ data: response.data.values });
            
          } catch (strategyError) {
            const errorMsg = strategyError instanceof Error ? strategyError.message : String(strategyError);
            console.log(`❌ Failed strategy: ${strategy} - ${errorMsg}`);
            continue;
          }
        }
        
        const errorMsg = `All range strategies failed for sheet "${sheetName}"`;
        console.error(`❌ ${errorMsg}`);
        return res.status(500).json({ error: errorMsg });
        
      } catch (metadataError) {
        const metaErrorMsg = metadataError instanceof Error ? metadataError.message : String(metadataError);
        console.warn(`⚠️ Could not get sheet metadata: ${metaErrorMsg}`);
        
        // Fallback to very conservative ranges
        const escapedSheetName = escapeSheetName(sheetName);
        const fallbackRanges = [
          `${escapedSheetName}!A1:T50`,
          `${escapedSheetName}!A1:Z100`,
          `${escapedSheetName}!A:T`,
          `${sheetName}!A1:T50` // Try without escaping as last resort
        ];
        
        console.log(`🔄 Trying ${fallbackRanges.length} fallback ranges...`);
        
        for (const fallback of fallbackRanges) {
          try {
            console.log(`🔄 Fallback attempt: ${fallback}`);
            
            const response = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: fallback,
              valueRenderOption: 'FORMATTED_VALUE',
              dateTimeRenderOption: 'FORMATTED_STRING',
            });
            
            console.log(`✅ Fallback success: ${fallback}, rows: ${response.data.values?.length || 0}`);
            return res.status(200).json({ data: response.data.values });
            
          } catch (fallbackError) {
            const fbErrorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            console.log(`❌ Fallback failed: ${fallback} - ${fbErrorMsg}`);
            continue;
          }
        }
        
        const errorMsg = `All fallback ranges failed for sheet "${sheetName}". Metadata error: ${metaErrorMsg}`;
        console.error(`❌ ${errorMsg}`);
        return res.status(500).json({ error: errorMsg });
      }
    }

    // This should not be reached due to early returns above, but kept for explicit range case
    console.log(`🎯 Final attempt with explicit range: ${finalRange}`);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: finalRange,
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });

    console.log(`✅ Final success: ${finalRange}, rows: ${response.data.values?.length || 0}`);
    res.status(200).json({ data: response.data.values });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    
    console.error('❌ Sheet fetch error:', {
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
      sheetName: req.body?.sheetName
    });
  }
} 