import { getGoogleSheetsClient } from '@/lib/googleSheets';
import { sendToGeminiMulti } from '@/lib/gemini';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { transcript, spreadsheetId, selectedSheetName, geminiApiKey } = req.body;

  // Check if we have a Gemini API key from the user or fallback to environment variable
  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return res.status(400).json({ error: 'Gemini API key is required. Please add it in your settings.' });
  }

  try {
    const sheets = await getGoogleSheetsClient();
    
    // Get spreadsheet metadata to discover all sheets
    const spreadsheetRes = await sheets.spreadsheets.get({
      spreadsheetId,
    });
    
    const allSheets = spreadsheetRes.data.sheets || [];
    const sheetNames = allSheets.map(sheet => sheet.properties?.title || 'Unknown');
    
    // Get data for all sheets (or just the selected one if specified)
    const sheetsToAnalyze = selectedSheetName ? [selectedSheetName] : sheetNames;
    const sheetsData: { [sheetName: string]: (string | number)[][] } = {};
    
    for (const sheetName of sheetsToAnalyze) {
      try {
        const sheetDataRes = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A:Z`,
          valueRenderOption: 'FORMATTED_VALUE',
        });
        sheetsData[sheetName] = sheetDataRes.data.values ?? [];
      } catch (e) {
        console.warn(`Could not fetch data for sheet: ${sheetName}`, e);
        sheetsData[sheetName] = [];
      }
    }

    // Send to enhanced Gemini function that can reason about multiple sheets
    const aiResponse = await sendToGeminiMulti({ 
      transcript, 
      sheetsData, 
      allSheetNames: sheetNames,
      selectedSheetName,
      geminiApiKey: apiKey 
    });

    res.status(200).json({ aiResponse });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Something went wrong' });
  }
} 