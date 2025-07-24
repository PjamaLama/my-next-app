import type { NextApiRequest, NextApiResponse } from 'next';
import { google } from 'googleapis';
import { getGoogleSheetsClient } from '../../lib/googleSheets';

type Data = {
  message?: string;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { spreadsheetId, sheetName, data, updates } = req.body;

  if (!spreadsheetId || !sheetName || (!data && !updates)) {
    return res.status(400).json({ error: 'Missing spreadsheetId, sheetName, or data/updates' });
  }

  try {
    const sheets = await getGoogleSheetsClient();

    // If updates array is provided, update specific cells
    if (Array.isArray(updates) && updates.length > 0) {
      for (const update of updates) {
        if (!update.cell) continue;
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!${update.cell}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[update.value ?? '']] },
        });
      }
      return res.status(200).json({ message: 'Cells updated successfully' });
    }

    // Fallback: old row append logic
    // Get existing sheet data to find the next empty row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:Z`, // Fetch a wide range to get all headers and existing data
    });

    const rows = response.data.values || [];
    const headers = rows.length > 0 ? rows[0] : [];
    const nextRow = rows.length + 1;

    // Prepare values to write
    const valuesToAppend: string[] = [];
    for (const header of headers) {
      valuesToAppend.push(data[header] || ''); // Use header as key to get value from data
    }

    // Append the new row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A${nextRow}`, // Start from the next empty row
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [valuesToAppend],
      },
    });

    res.status(200).json({ message: 'Data saved successfully' });
  } catch (error: any) {
    console.error('Error saving data to sheet:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to save data to sheet' });
  }
}
