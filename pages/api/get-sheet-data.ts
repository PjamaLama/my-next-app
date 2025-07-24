import { getGoogleSheetsClient } from '@/lib/googleSheets';

export default async function handler(req, res) {
  try {
    const sheets = await getGoogleSheetsClient();
    const { spreadsheetId, sheetName, range = 'A1:T40' } = req.body;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!${range}`,
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });

    res.status(200).json({ data: response.data.values });
  } catch (err) {
    console.error('Sheet fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch sheet data' });
  }
} 