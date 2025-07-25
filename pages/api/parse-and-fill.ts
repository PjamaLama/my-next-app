import { getGoogleSheetsClient } from '@/lib/googleSheets';
import { sendToGemini } from '@/lib/gemini';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { transcript, spreadsheetId, sheetName, geminiApiKey } = req.body;

  // Check if we have a Gemini API key from the user or fallback to environment variable
  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return res.status(400).json({ error: 'Gemini API key is required. Please add it in your settings.' });
  }

  try {
    const sheets = await getGoogleSheetsClient();
    const sheetDataRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const sheetData = sheetDataRes.data.values ?? [];
    const aiResponse = await sendToGemini({ 
      transcript, 
      sheetData, 
      sheetName, 
      geminiApiKey: apiKey 
    });

    res.status(200).json({ aiResponse });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Something went wrong' });
  }
} 