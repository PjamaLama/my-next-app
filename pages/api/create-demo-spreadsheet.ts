import { google } from 'googleapis';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '@/lib/googleSheets';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sheets = await getGoogleSheetsClient();

    // Create a new spreadsheet
    const createResponse = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: 'SheetyAI Demo Spreadsheet',
          locale: 'en_US',
        },
        sheets: [
          {
            properties: {
              title: 'Demo Data',
              sheetType: 'GRID',
              gridProperties: {
                rowCount: 100,
                columnCount: 26,
              },
            },
          },
        ],
      },
    });

    const spreadsheetId = createResponse.data.spreadsheetId;
    const spreadsheetUrl = createResponse.data.spreadsheetUrl;

    if (!spreadsheetId) {
      throw new Error('Failed to create spreadsheet - no ID returned');
    }

    // Add some demo data to the spreadsheet
    const demoData = [
      ['Name', 'Product', 'Quantity', 'Price', 'Date'],
      ['John Doe', 'Laptop', '2', '$2500', '2024-01-15'],
      ['Jane Smith', 'Phone', '1', '$800', '2024-01-16'],
      ['Bob Johnson', 'Tablet', '3', '$1200', '2024-01-17'],
      ['Alice Brown', 'Headphones', '5', '$500', '2024-01-18']
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Demo Data!A1:E5',
      valueInputOption: 'RAW',
      requestBody: {
        values: demoData,
      },
    });

    return res.status(200).json({
      success: true,
      spreadsheetId,
      spreadsheetUrl,
      title: 'SheetyAI Demo Spreadsheet',
      sheetNames: ['Demo Data'],
      message: 'Demo spreadsheet created successfully with sample data!'
    });

  } catch (error: any) {
    console.error('Error creating demo spreadsheet:', error);
    const message = error?.message || 'Failed to create demo spreadsheet';

    return res.status(500).json({
      error: message,
      details: 'Unable to create demo spreadsheet. Please try again or contact support.'
    });
  }
}
