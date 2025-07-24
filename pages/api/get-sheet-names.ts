import { getGoogleSheetsClient } from '@/lib/googleSheets';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { spreadsheetId } = req.body;
  if (!spreadsheetId) {
    return res.status(400).json({ error: 'Missing spreadsheetId' });
  }
  // Debug logs for environment
  console.log('NODE_OPTIONS:', process.env.NODE_OPTIONS);
  console.log('GOOGLE_PRIVATE_KEY (first 40):', (process.env.GOOGLE_PRIVATE_KEY || '').slice(0, 40));
  try {
    const sheets = await getGoogleSheetsClient();
    const response = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetNames = response.data.sheets?.map(sheet => sheet.properties?.title).filter(Boolean) || [];
    const spreadsheetTitle = response.data.properties?.title || spreadsheetId;
    res.status(200).json({ sheetNames, spreadsheetTitle });
  } catch (err) {
    console.error('Error fetching sheet names:', err);
    res.status(500).json({ error: 'Failed to fetch sheet names' });
  }
} 