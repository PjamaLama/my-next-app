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

// Helper to parse A1 cell notation to {col: 'A', row: 27}
function parseCell(cell: string): {col: string, row: number} | null {
  const match = cell.match(/([A-Z]+)(\d+)/);
  if (!match) return null;
  return { col: match[1], row: parseInt(match[2]) };
}

// Helper to build new cell from col and row
function buildCell(col: string, row: number): string {
  return `${col}${row}`;
}

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
    console.log(`🚀 Starting multi-sheet update process for ${updates.length} updates`);
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

    // Get spreadsheet metadata for all sheets (row counts, sheetIds, etc.)
    const spreadsheetMeta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets(properties/sheetId,title,gridProperties)'
    });

    // Process each sheet's updates
    const results = [];
    for (const [sheetName, sheetUpdates] of Object.entries(updatesBySheet)) {
      try {
        console.log(`Processing ${sheetUpdates.length} updates for sheet "${sheetName}"`);
        
        // Find the sheet metadata
        const sheetMeta = spreadsheetMeta.data.sheets?.find(s => s.properties?.title === sheetName);
        if (!sheetMeta) {
          throw new Error(`Sheet "${sheetName}" not found in spreadsheet`);
        }
        const sheetId = sheetMeta.properties?.sheetId;
        let rowCount = sheetMeta.properties?.gridProperties?.rowCount || 1;
        const columnCount = sheetMeta.properties?.gridProperties?.columnCount || 26; // Default to A-Z

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

        // Parse target rows from cells
        const targetRowsSet = new Set<number>();
        sortedUpdates.forEach(update => {
          const parsed = parseCell(update.cell);
          if (parsed) {
            targetRowsSet.add(parsed.row);
          }
        });
        const targetRows = Array.from(targetRowsSet).sort((a, b) => a - b);

        if (targetRows.length === 0) {
          throw new Error('No valid cell references found in updates');
        }

        const minRow = targetRows[0];
        const maxRow = targetRows[targetRows.length - 1];
        const numRowsNeeded = maxRow - minRow + 1;

        // Check if rows are consecutive (no gaps)
        let isConsecutive = true;
        for (let i = 1; i < targetRows.length; i++) {
          if (targetRows[i] !== targetRows[i-1] + 1) {
            isConsecutive = false;
            break;
          }
        }
        if (!isConsecutive) {
          console.warn(`Warning: Non-consecutive target rows detected for "${sheetName}". Gaps will be filled with empty rows.`);
        }

        // Check if last row is a summary/totals row
        let isSummary = false;
        if (rowCount > 1) {
          const lastRowRange = `${escapeSheetName(sheetName)}!A${rowCount}:${String.fromCharCode(64 + columnCount)}${rowCount}`;
          
          // Fetch formatted values to check for "Total" or "Sum"
          const formattedRes = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: lastRowRange,
            valueRenderOption: 'FORMATTED_VALUE',
          });
          const formattedValues = formattedRes.data.values?.[0] || [];

          // Fetch formulas to check for =SUM etc.
          const formulaRes = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: lastRowRange,
            valueRenderOption: 'FORMULA',
          });
          const formulaValues = formulaRes.data.values?.[0] || [];

          isSummary = formattedValues.some(cell => {
            const str = String(cell).toLowerCase();
            return str.includes('total') || str.includes('sum');
          }) || formulaValues.some(cell => String(cell).startsWith('='));
        }

        console.log(`Sheet "${sheetName}" has ${rowCount} rows. Last row is ${isSummary ? '' : 'not '}summary. Target rows: ${targetRows.join(', ')}`);

        // Handle insertion if needed
        if (maxRow > rowCount || (isSummary && minRow === rowCount)) {
          let insertStartIndex: number;
          let insertEndIndex: number;
          let delta = 0; // Adjustment for cell rows

          if (isSummary && minRow === rowCount + 1) {
            // Insert above summary row and adjust references
            delta = -1; // e.g., shift 27 to 26
            insertStartIndex = rowCount - 1;
            insertEndIndex = insertStartIndex + numRowsNeeded;

            // Adjust all updates' rows and cells
            sortedUpdates.forEach(update => {
              const parsed = parseCell(update.cell);
              if (parsed) {
                const newRow = parsed.row + delta;
                update.cell = buildCell(parsed.col, newRow);
                update.row = newRow;
              }
            });

            console.log(`Adjusting for insertion above summary: delta=${delta}, new targets: ${minRow + delta} to ${maxRow + delta}`);
          } else {
            // Normal append or extension
            const rowsToInsert = maxRow - rowCount;
            insertStartIndex = rowCount;
            insertEndIndex = insertStartIndex + rowsToInsert;
            console.log(`Appending ${rowsToInsert} rows at end`);
          }

          // Perform the insertion
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [{
                insertDimension: {
                  range: {
                    sheetId,
                    dimension: 'ROWS',
                    startIndex: insertStartIndex,
                    endIndex: insertEndIndex
                  },
                  inheritFromBefore: false // Or true if you want to inherit formatting
                }
              }]
            }
          });

          console.log(`Inserted ${insertEndIndex - insertStartIndex} rows at startIndex ${insertStartIndex}`);
          // Update rowCount after insertion
          rowCount += (insertEndIndex - insertStartIndex);
        }

        // Create batch update data for this sheet (using possibly adjusted cells)
        const batchData = sortedUpdates.map(update => ({
          range: `${escapeSheetName(sheetName)}!${update.cell}`,
          values: [[update.value]]
        }));

        // Execute batch update for this sheet with timeout
        console.log(`📤 Executing batch update for "${sheetName}" with ${batchData.length} operations`);
        const updatePromise = sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            data: batchData,
            valueInputOption: 'USER_ENTERED'
          }
        });
        
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Batch update timeout after 15 seconds for sheet: ${sheetName}`)), 15000)
        );
        
        const batchUpdateResult = await Promise.race([updatePromise, timeoutPromise]) as any;

        const updatedCells = batchUpdateResult.data?.totalUpdatedCells || 0;
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