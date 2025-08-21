import { getGoogleSheetsClient } from '@/lib/googleSheets';
import { escapeSheetName, getInsertionRow } from '@/lib/sheetUtils';

type RowObject = Record<string, unknown>;

export type IngestResult = {
  success: boolean;
  inserts: number;
  updates: number;
  details?: unknown;
};

/**
 * A lightweight function to insert rows at specific positions in a Google Sheet.
 * It reads the headers from the target sheet and inserts the provided rows.
 * This function targets row 2 (below headers) and preserves row 3 for totals.
 */
export async function ingestRows(params: {
  spreadsheetId: string;
  sheetName: string;
  rows: Array<RowObject>;
}): Promise<IngestResult> {
  const { spreadsheetId, sheetName, rows } = params;
  
  console.log('🔍 [ORCHESTRATOR] Received params:', { spreadsheetId, sheetName, rowsCount: rows.length, sampleRow: rows[0] });
  
  const sheets = await getGoogleSheetsClient();

  if (!sheetName) {
    return { success: false, inserts: 0, updates: 0, details: 'sheetName is required' };
  }

  const escapedName = escapeSheetName(sheetName);
  console.log('🔍 [ORCHESTRATOR] Escaped sheet name:', escapedName);

  try {
    // Load headers from the target sheet to ensure correct column order
    const headerResp = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${escapedName}!A1:Z1` });
    const headers = ((headerResp.data.values?.[0] as string[]) || []).map(h => String(h));

    console.log('🔍 [ORCHESTRATOR] Sheet headers:', headers);

    if (headers.length === 0) {
      return { success: false, inserts: 0, updates: 0, details: `No headers found in sheet ${sheetName}` };
    }

    // Prepare row arrays aligned to the sheet's headers
    const valuesToInsert: string[][] = rows.map(obj => 
      headers.map(h => (obj[h] != null ? String(obj[h]) : ''))
    );

    console.log('🔍 [ORCHESTRATOR] Values to insert:', valuesToInsert);

    if (valuesToInsert.length === 0) {
      return { success: true, inserts: 0, updates: 0, details: 'No rows to insert.' };
    }

    // Get the target insertion row (always row 2)
    const insertionRow = getInsertionRow();
    console.log(`🔍 [ORCHESTRATOR] Inserting data at row ${insertionRow}`);

    // Check if we need to preserve existing data below the insertion point
    const existingDataResp = await sheets.spreadsheets.values.get({ 
      spreadsheetId, 
      range: `${escapedName}!A${insertionRow}:Z1000` // Get data from insertion row onwards
    });
    
    const existingData = existingDataResp.data.values || [];
    const hasExistingData = existingData.length > 0;
    
    if (hasExistingData) {
      console.log('🔍 [ORCHESTRATOR] Found existing data, will shift rows down');
      
      // Insert new rows at the insertion point, shifting existing data down
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            insertDimension: {
              range: {
                sheetId: await getSheetId(spreadsheetId, sheetName),
                dimension: 'ROWS',
                startIndex: insertionRow - 1, // 0-based, so insertionRow - 1
                endIndex: insertionRow - 1 + valuesToInsert.length // Insert after the new rows
              }
            }
          }]
        }
      });
      
      // Now insert the values at the insertion row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${escapedName}!A${insertionRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: valuesToInsert },
      });
    } else {
      // No existing data, just insert at the insertion row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${escapedName}!A${insertionRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: valuesToInsert },
      });
    }

    const result = { success: true, inserts: valuesToInsert.length, updates: 0 };
    console.log('🔍 [ORCHESTRATOR] Final result:', result);
    return result;

  } catch (e) {
    console.error('Error in ingestRows:', e);
    return { success: false, inserts: 0, updates: 0, details: e };
  }
}

// Helper function to get sheet ID
async function getSheetId(spreadsheetId: string, sheetName: string): Promise<number> {
  const sheets = await getGoogleSheetsClient();
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: false
  });
  
  const sheet = metadata.data.sheets?.find(s => s.properties?.title === sheetName);
  if (!sheet?.properties?.sheetId) {
    throw new Error(`Sheet "${sheetName}" not found or has no sheet ID`);
  }
  
  return sheet.properties.sheetId;
}


