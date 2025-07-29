import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/googleSheets';

// Helper function to escape sheet names for Google Sheets API
const escapeSheetName = (name: string) => {
  if (/[^A-Za-z0-9_]/.test(name) || /^[0-9]/.test(name)) {
    return `'${name.replace(/'/g, "''")}'`;
  }
  return name;
};

function parseCell(cell: string): {col: string, row: number} | null {
  const match = cell.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  return {
    col: match[1],
    row: parseInt(match[2], 10)
  };
}

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

// Helper function to expand sheet dimensions if needed
const ensureSheetCapacity = async (sheetId: string, sheetName: string, targetRow: number, targetColumn: string): Promise<void> => {
  try {
    const sheets = await getGoogleSheetsClient();
    
    // Get current sheet metadata
    const sheetMetadata = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      includeGridData: false
    });
    
    const targetSheet = sheetMetadata.data.sheets?.find(s => s.properties?.title === sheetName);
    if (!targetSheet?.properties?.gridProperties) {
      throw new Error(`Sheet "${sheetName}" not found in spreadsheet`);
    }
    
    const currentRowCount = targetSheet.properties.gridProperties.rowCount || 1000;
    const currentColumnCount = targetSheet.properties.gridProperties.columnCount || 26;
    
    console.log(`Current sheet dimensions: ${currentRowCount} rows × ${currentColumnCount} columns`);
    console.log(`Target cell: ${targetColumn}${targetRow}`);
    
    // Convert column letter to index (A=0, B=1, etc.)
    const columnToIndex = (col: string): number => {
      let index = 0;
      for (let i = 0; i < col.length; i++) {
        index = index * 26 + (col.charCodeAt(i) - 64);
      }
      return index - 1;
    };
    
    const targetColumnIndex = columnToIndex(targetColumn);
    const targetRowIndex = targetRow - 1; // Convert to 0-based index
    
    // Check if we need to expand the sheet
    let needsExpansion = false;
    const expansionRequests = [];
    
    if (targetRowIndex >= currentRowCount) {
      console.log(`Need to expand rows: current=${currentRowCount}, target=${targetRowIndex + 1}`);
      needsExpansion = true;
      expansionRequests.push({
        updateSheetProperties: {
          properties: {
            sheetId: targetSheet.properties.sheetId,
            gridProperties: {
              rowCount: Math.max(currentRowCount, targetRowIndex + 10) // Add some buffer
            }
          },
          fields: 'gridProperties.rowCount'
        }
      });
    }
    
    if (targetColumnIndex >= currentColumnCount) {
      console.log(`Need to expand columns: current=${currentColumnCount}, target=${targetColumnIndex + 1}`);
      needsExpansion = true;
      expansionRequests.push({
        updateSheetProperties: {
          properties: {
            sheetId: targetSheet.properties.sheetId,
            gridProperties: {
              columnCount: Math.max(currentColumnCount, targetColumnIndex + 5) // Add some buffer
            }
          },
          fields: 'gridProperties.columnCount'
        }
      });
    }
    
    // Expand the sheet if needed
    if (needsExpansion) {
      console.log(`Expanding sheet with ${expansionRequests.length} requests`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: expansionRequests
        }
      });
      console.log(`Successfully expanded sheet dimensions`);
    }
    
  } catch (expansionError) {
    console.warn(`Failed to expand sheet dimensions:`, expansionError);
    // Continue anyway - the API might handle it
  }
};

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
        column: cellInfo.col
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