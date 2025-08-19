import { getGoogleSheetsClient } from '@/lib/googleSheets';
import { escapeSheetName } from '@/lib/sheetUtils';

type RowObject = Record<string, unknown>;

export type IngestResult = {
  success: boolean;
  inserts: number;
  updates: number;
  details?: unknown;
};

/**
 * A lightweight function to append rows to a specified Google Sheet.
 * It reads the headers from the target sheet and appends the provided rows.
 * This function does not perform any deduplication or update logic.
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
    const valuesToAppend: string[][] = rows.map(obj => 
      headers.map(h => (obj[h] != null ? String(obj[h]) : ''))
    );

    console.log('🔍 [ORCHESTRATOR] Values to append:', valuesToAppend);

    if (valuesToAppend.length === 0) {
      return { success: true, inserts: 0, updates: 0, details: 'No rows to append.' };
    }

    // Execute the append operation
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${escapedName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: valuesToAppend },
    });

    const result = { success: true, inserts: valuesToAppend.length, updates: 0 };
    console.log('🔍 [ORCHESTRATOR] Final result:', result);
    return result;

  } catch (e) {
    console.error('Error in ingestRows:', e);
    return { success: false, inserts: 0, updates: 0, details: e };
  }
}


