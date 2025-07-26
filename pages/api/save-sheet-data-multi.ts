import { getGoogleSheetsClient } from '@/lib/googleSheets';
import type { NextApiRequest, NextApiResponse } from 'next';

// Helper function to escape sheet names for Google Sheets API
const escapeSheetName = (name: string) => {
  // If the sheet name contains spaces, special characters, or starts with a digit,
  // wrap it in single quotes and escape any existing single quotes
  if (/[^A-Za-z0-9_]/.test(name) || /^[0-9]/.test(name)) {
    return `'${name.replace(/'/g, "''")}'`;
  }
  return name;
};

interface UpdateItem {
  sheetName: string;
  cell: string;
  value: string;
  row?: number; // Add row tracking for better validation
  column?: string; // Add column name for better logging
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { spreadsheetId, updates } = req.body;

  if (!spreadsheetId || !updates || !Array.isArray(updates)) {
    return res.status(400).json({ error: 'Missing required fields or invalid updates format' });
  }

  console.log(`Processing ${updates.length} updates across multiple sheets`);

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

    console.log(`Updates grouped by sheet:`, Object.entries(updatesBySheet).map(([sheet, updates]) => 
      `${sheet}: ${updates.length} updates`).join(', '));

    // Process each sheet's updates
    const results = [];
    for (const [sheetName, sheetUpdates] of Object.entries(updatesBySheet)) {
      try {
        console.log(`Processing ${sheetUpdates.length} updates for sheet "${sheetName}"`);
        
        // Sort updates by row number if available (for better visual organization in logs)
        const sortedUpdates = sheetUpdates.sort((a, b) => {
          if (a.row && b.row) {
            return a.row - b.row;
          }
          return 0;
        });

        // Log the updates being made for debugging
        sortedUpdates.forEach((update, index) => {
          console.log(`  Update ${index + 1}: ${update.column || 'Unknown'} (${update.cell}) = "${update.value}"`);
        });

        // Create batch update data for this sheet
        const batchData = sortedUpdates.map(update => ({
          range: `${escapeSheetName(sheetName)}!${update.cell}`,
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

        const updatedCells = batchUpdateResult.data.totalUpdatedCells || 0;
        results.push({
          sheetName,
          success: true,
          updatedCells,
          updates: sheetUpdates.length,
          rowsAffected: [...new Set(sheetUpdates.map(u => u.row).filter(Boolean))].length || 0, // Count unique rows
        });

        console.log(`✅ Successfully updated ${updatedCells} cells in sheet "${sheetName}"`);
      } catch (sheetError) {
        console.error(`❌ Error updating sheet "${sheetName}":`, sheetError);
        results.push({
          sheetName,
          success: false,
          error: sheetError instanceof Error ? sheetError.message : 'Unknown error',
          updates: sheetUpdates.length,
          rowsAffected: 0,
        });
      }
    }

    // Check if all updates were successful
    const allSuccessful = results.every(result => result.success);
    const totalUpdated = results.reduce((sum, result) => sum + (result.updatedCells || 0), 0);
    const totalRowsAffected = results.reduce((sum, result) => sum + (result.rowsAffected || 0), 0);

    // Enhanced logging
    console.log(`📊 Multi-sheet update summary:`);
    console.log(`  - Sheets processed: ${Object.keys(updatesBySheet).length}`);
    console.log(`  - Total cells updated: ${totalUpdated}`);
    console.log(`  - Total rows affected: ${totalRowsAffected}`);
    console.log(`  - Success rate: ${results.filter(r => r.success).length}/${results.length}`);

    const responseStatus = allSuccessful ? 200 : 207; // 207 = Multi-Status for partial success
    res.status(responseStatus).json({
      success: allSuccessful,
      totalUpdated,
      totalRowsAffected,
      sheetsProcessed: Object.keys(updatesBySheet).length,
      results,
      summary: {
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        totalSheets: results.length
      }
    });

  } catch (e) {
    console.error('❌ Critical error in save-sheet-data-multi:', e);
    res.status(500).json({ 
      error: 'Failed to save data',
      details: e instanceof Error ? e.message : 'Unknown error'
    });
  }
} 