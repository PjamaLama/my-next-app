import { getGoogleSheetsClient } from '@/lib/googleSheets';
import { sendToGemini } from '@/lib/gemini';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { transcript, spreadsheetId, sheetName, geminiApiKey } = req.body;

  try {
    const sheets = await getGoogleSheetsClient();
    const sheetDataRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const sheetData = sheetDataRes.data.values;
    const aiResponse = await sendToGemini({ transcript, sheetData, sheetName, geminiApiKey });

    res.status(200).json({ aiResponse });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Something went wrong' });
  }
} 