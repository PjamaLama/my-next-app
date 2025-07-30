import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/googleSheets';
import { escapeSheetName, parseCell, ensureSheetCapacity } from '../../lib/sheetUtils';

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { spreadsheetId, updates } = req.body;

  if (!spreadsheetId || !Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'Missing spreadsheetId or updates array' });
  }

  console.log(`📝 Processing ${updates.length} updates for spreadsheet: ${spreadsheetId}`);

  try {
    const sheets = await getGoogleSheetsClient();
    const results = [];

    // Group updates by sheet name for batch processing
    const updatesBySheet: { [sheetName: string]: UpdateItem[] } = {};
    
    for (const update of updates) {
      if (!update.sheetName || !update.cell || update.value === undefined) {
        console.warn(`⚠️ Skipping invalid update:`, update);
        continue;
      }
      
      // Parse cell to get row and column info
      const cellInfo = parseCell(update.cell);
      if (!cellInfo) {
        console.warn(`⚠️ Invalid cell format: ${update.cell}`);
        continue;
      }
      
      // Add parsed info to update
      const enrichedUpdate: UpdateItem = {
        ...update,
        row: cellInfo.row,
        column: cellInfo.column
      };
      
      if (!updatesBySheet[update.sheetName]) {
        updatesBySheet[update.sheetName] = [];
      }
      updatesBySheet[update.sheetName].push(enrichedUpdate);
    }

    console.log(`📊 Grouped updates into ${Object.keys(updatesBySheet).length} sheets`);

    // Process each sheet
    for (const [sheetName, sheetUpdates] of Object.entries(updatesBySheet)) {
      try {
        console.log(`📋 Processing sheet: "${sheetName}" with ${sheetUpdates.length} updates`);
        
        // Get sheet metadata to find sheet ID
        const sheetMetadata = await sheets.spreadsheets.get({
          spreadsheetId,
          includeGridData: false
        });
        
        const sheet = sheetMetadata.data.sheets?.find(s => s.properties?.title === sheetName);
        if (!sheet?.properties?.sheetId) {
          throw new Error(`Sheet "${sheetName}" not found`);
        }
        
        const sheetId = sheet.properties.sheetId;
        console.log(`🔍 Found sheet ID: ${sheetId} for "${sheetName}"`);
        
        // Sort updates by row to optimize insertion strategy
        const sortedUpdates = [...sheetUpdates].sort((a, b) => (a.row || 0) - (b.row || 0));
        
        // Check if we need to expand the sheet for any of the target cells
        for (const update of sortedUpdates) {
          if (update.row && update.column) {
            await ensureSheetCapacity(spreadsheetId, sheetName, update.row, update.column);
          }
        }
        
        // Group consecutive rows for batch insertion
        let currentGroup: UpdateItem[] = [];
        let lastRow = -1;
        const groups: UpdateItem[][] = [];
        
        for (const update of sortedUpdates) {
          if (!update.row) continue;
          
          if (lastRow === -1 || update.row === lastRow + 1) {
            // Consecutive or first row
            currentGroup.push(update);
            lastRow = update.row;
          } else {
            // Gap found, start new group
            if (currentGroup.length > 0) {
              groups.push(currentGroup);
            }
            currentGroup = [update];
            lastRow = update.row;
          }
        }
        
        // Add the last group
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        
        console.log(`📦 Created ${groups.length} row groups for insertion optimization`);
        
        // Insert rows for each group if needed
        let rowCount = 0; // Track current row count for insertion calculations
        for (const group of groups) {
          const groupStartRow = group[0].row!;
          const groupEndRow = group[group.length - 1].row!;
          
          if (groupStartRow > rowCount + 1) {
            // Need to insert rows
            const insertStartIndex = rowCount;
            const insertEndIndex = groupStartRow - 1;
            
            console.log(`➕ Inserting ${insertEndIndex - insertStartIndex} rows at position ${insertStartIndex}`);
            
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
          
          // Update rowCount to reflect the group
          rowCount = groupEndRow;
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
        
        const batchUpdateResult = await Promise.race([updatePromise, timeoutPromise]) as { data: { totalUpdatedCells: number } };

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