import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient, getSheetMetadataCached, getColumnLetter } from '@/lib/googleSheets';
import { escapeSheetName } from '@/lib/sheetUtils';

type UpdateResult = {
  success: boolean;
  updatedRows: number;
  details?: unknown;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<UpdateResult>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, updatedRows: 0, details: 'Method not allowed' });
  }

  try {
    const { spreadsheetId, sheetName, rowIndex, values } = req.body || {};

    if (!spreadsheetId || !sheetName || !rowIndex || !Array.isArray(values)) {
      return res.status(400).json({ success: false, updatedRows: 0, details: 'Missing required params' });
    }

    const sheets = await getGoogleSheetsClient();
    const escapedName = escapeSheetName(sheetName);

    // Get sheet metadata to determine actual column count
    const metadata = await getSheetMetadataCached(spreadsheetId);
    const sheet = metadata.sheets.find(s => s.properties?.title === sheetName);
    const columnCount = sheet?.properties?.gridProperties?.columnCount || 26;

    // Fetch headers using dynamic range
    const headerRange = `${escapedName}!A1:${getColumnLetter(columnCount)}1`;
    const headerResp = await sheets.spreadsheets.values.get({ spreadsheetId, range: headerRange });
    const headers = ((headerResp.data.values?.[0] as string[]) || []).map(h => String(h));

    if (headers.length === 0) {
      return res.status(400).json({ success: false, updatedRows: 0, details: 'No headers found' });
    }

    // Pad values to match header length
    const paddedValues = headers.map((_, i) => (values[i] != null ? String(values[i]) : ''));

    // Update the specific row
    const endColumn = getColumnLetter(headers.length);
    const range = `${escapedName}!A${rowIndex}:${endColumn}${rowIndex}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [paddedValues] },
    });

    return res.status(200).json({ success: true, updatedRows: 1 });
  } catch (e: any) {
    console.error('Error in update-sheet-row:', e);
    return res.status(500).json({ success: false, updatedRows: 0, details: e?.message || 'Failed to update row' });
  }
}
