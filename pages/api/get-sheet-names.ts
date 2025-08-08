import { getGoogleSheetsClient } from '@/lib/googleSheets';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Support both GET (?spreadsheetId=) and POST ({ spreadsheetId })
  const spreadsheetIdParam =
    (req.method === 'GET' ? req.query.spreadsheetId : (req.body?.spreadsheetId as string | undefined)) ||
    (req.query.spreadsheetId as string | undefined);

  if (!spreadsheetIdParam || typeof spreadsheetIdParam !== 'string') {
    return res.status(400).json({ error: 'Spreadsheet ID is required' });
  }

  try {
    const sheets = await getGoogleSheetsClient();
    const response = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetIdParam,
    });

    const sheetNames = response.data.sheets?.map(sheet => sheet.properties?.title || '').filter(Boolean) || [];
    const spreadsheetTitle = response.data.properties?.title || null;

    res.status(200).json({ sheetNames, spreadsheetTitle });
  } catch (error) {
    console.error('Error fetching sheet names:', error);
    res.status(500).json({ error: 'Failed to fetch sheet names' });
  }
}