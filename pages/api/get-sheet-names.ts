import { getGoogleSheetsClient } from '@/lib/googleSheets';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { spreadsheetId } = req.query;

  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    return res.status(400).json({ error: 'Spreadsheet ID is required' });
  }

  try {
    const sheets = await getGoogleSheetsClient();
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheetNames = response.data.sheets?.map(sheet => sheet.properties?.title || '').filter(Boolean) || [];

    res.status(200).json({ sheetNames });
  } catch (error) {
    console.error('Error fetching sheet names:', error);
    res.status(500).json({ error: 'Failed to fetch sheet names' });
  }
}