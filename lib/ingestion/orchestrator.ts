import { getGoogleSheetsClient, getSheetMetadataCached, getColumnLetter } from '@/lib/googleSheets';
import { escapeSheetName } from '@/lib/sheetUtils';

type RowObject = Record<string, unknown>;

export type IngestResult = {
  success: boolean;
  inserts: number;
  updates: number;
  details?: unknown;
};

/**
 * A lightweight function to append rows to the end of a Google Sheet.
 * It reads the headers from the target sheet and appends the provided rows
 * after the last row with data, preserving all existing content.
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
    // Get sheet metadata to determine actual column count
    const metadata = await getSheetMetadataCached(spreadsheetId);
    const sheet = metadata.sheets.find(s => s.properties?.title === sheetName);
    const columnCount = sheet?.properties?.gridProperties?.columnCount || 26;

    // Load headers from the target sheet to ensure correct column order
    const headerRange = `${escapedName}!A1:${getColumnLetter(columnCount)}1`;
    const headerResp = await sheets.spreadsheets.values.get({ spreadsheetId, range: headerRange });
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

    // Use append method which automatically expands the sheet
    console.log(`🔍 [ORCHESTRATOR] Appending data to sheet`);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${escapedName}!A:A`, // Append to column A (will automatically find the next empty row)
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS', // This ensures new rows are inserted
      requestBody: { values: valuesToInsert },
    });

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


