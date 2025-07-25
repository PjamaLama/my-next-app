import { getGoogleSheetsClient } from '@/lib/googleSheets';
import type { NextApiRequest, NextApiResponse } from 'next';

interface UpdateItem {
  sheetName: string;
  cell: string;
  value: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { spreadsheetId, updates } = req.body;

  if (!spreadsheetId || !updates || !Array.isArray(updates)) {
    return res.status(400).json({ error: 'Missing required fields or invalid updates format' });
  }

  try {
    const sheets = await getGoogleSheetsClient();

    // Group updates by sheet name for efficient batch processing
    const updatesBySheet: { [sheetName: string]: UpdateItem[] } = {};
    updates.forEach((update: UpdateItem) => {
      if (!updatesBySheet[update.sheetName]) {
        updatesBySheet[update.sheetName] = [];
      }
      updatesBySheet[update.sheetName].push(update);
    });

    // Process each sheet's updates
    const results = [];
    for (const [sheetName, sheetUpdates] of Object.entries(updatesBySheet)) {
      try {
        // Create batch update data for this sheet
        const batchData = sheetUpdates.map(update => ({
          range: `${sheetName}!${update.cell}`,
          values: [[update.value]]
        }));

        // Execute batch update for this sheet
        const batchUpdateResult = await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            data: batchData,
            valueInputOption: 'USER_ENTERED'
          }
        });

        results.push({
          sheetName,
          success: true,
          updatedCells: batchUpdateResult.data.totalUpdatedCells || 0,
          updates: sheetUpdates.length
        });

        console.log(`Successfully updated ${batchUpdateResult.data.totalUpdatedCells} cells in sheet "${sheetName}"`);
      } catch (sheetError) {
        console.error(`Error updating sheet "${sheetName}":`, sheetError);
        results.push({
          sheetName,
          success: false,
          error: sheetError instanceof Error ? sheetError.message : 'Unknown error',
          updates: sheetUpdates.length
        });
      }
    }

    // Check if all updates were successful
    const allSuccessful = results.every(result => result.success);
    const totalUpdated = results.reduce((sum, result) => sum + (result.updatedCells || 0), 0);

    res.status(allSuccessful ? 200 : 207).json({
      success: allSuccessful,
      totalUpdated,
      sheetsProcessed: Object.keys(updatesBySheet).length,
      results
    });

  } catch (e) {
    console.error('Error in save-sheet-data-multi:', e);
    res.status(500).json({ 
      error: 'Failed to save data',
      details: e instanceof Error ? e.message : 'Unknown error'
    });
  }
} 