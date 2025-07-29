import { getGoogleSheetsClient } from '../lib/googleSheets';

// Input type for insertRow tool
interface InsertRowInput {
  sheetId: string;
  sheetName: string;
  row: number;
}

// Input type for updateCell tool
interface UpdateCellInput {
  sheetId: string;
  sheetName: string;
  row: number;
  column: string;
  value: string | number;
}

// Helper function to find the first summary row index from real Google Sheets data
const findFirstSummaryRowIndex = async (sheetId: string, sheetName: string): Promise<number> => {
  try {
    console.log(`Finding summary row for sheet: ${sheetId}, ${sheetName}`);
    
    const sheets = await getGoogleSheetsClient();
    
    // Helper function to escape sheet names for Google Sheets API
    const escapeSheetName = (name: string) => {
      if (/[^A-Za-z0-9_]/.test(name) || /^[0-9]/.test(name)) {
        return `'${name.replace(/'/g, "''")}'`;
      }
      return name;
    };
    
    const escapedSheetName = escapeSheetName(sheetName);
    
    // Try to get sheet data
    const strategies = [
      `${escapedSheetName}!A1:Z1000`,
      `${escapedSheetName}!A:Z`,
      `${escapedSheetName}!A1:T100`,
      `${sheetName}!A1:T100`
    ];
    
    for (const range of strategies) {
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: range,
          valueRenderOption: 'FORMATTED_VALUE',
          dateTimeRenderOption: 'FORMATTED_STRING',
        });
        
        if (response.data.values && response.data.values.length > 0) {
          const rows = response.data.values;
          
          // Skip the header row (row 1) and look for patterns that indicate summary rows
          for (let i = 1; i < rows.length; i++) {
            const rowString = rows[i].join(',').toLowerCase();
            if (rowString.includes('total') || rowString.includes('sum') || rowString.includes('subtotal') || 
                rowString.includes('summary') || rowString.includes('balance')) {
              console.log(`Found potential summary row at index ${i + 1}: ${rows[i].join(',')}`);
              return i + 1; // Convert to 1-based index
            }
          }
          
          break; // Successfully got data, stop trying strategies
        }
      } catch (rangeError) {
        console.log(`Range strategy failed: ${range}, trying next...`);
        continue;
      }
    }
    
    // If no summary row found, return a high number to allow insertion anywhere
    return 999999;
  } catch (error) {
    console.error('Error finding first summary row:', error);
    // Return a high number to allow insertion if we can't determine summary rows
    return 999999;
  }
};

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

// Export the insertRow function
export const insertRow = async (input: InsertRowInput): Promise<string> => {
  try {
    const { sheetId, sheetName, row } = input;
    
    console.log(`Inserting row at position ${row} in sheet: ${sheetId}/${sheetName}`);
    
    // Get Google Sheets client
    const sheets = await getGoogleSheetsClient();
    
    // Helper function to escape sheet names for Google Sheets API
    const escapeSheetName = (name: string) => {
      if (/[^A-Za-z0-9_]/.test(name) || /^[0-9]/.test(name)) {
        return `'${name.replace(/'/g, "''")}'`;
      }
      return name;
    };
    
    const escapedSheetName = escapeSheetName(sheetName);
    
    // Get current sheet data to check if we're inserting above a function row
    const currentData = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${escapedSheetName}!A1:Z1000`,
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    
    const sheetData = currentData.data.values || [];
    const isInsertingAboveFunctionRow = row === sheetData.length && 
      sheetData[sheetData.length - 1]?.some(cell => {
        const cellStr = String(cell);
        return cellStr.startsWith('=') || 
               cellStr.includes('=SUM') || 
               cellStr.includes('=TOTAL') ||
               cellStr.includes('=COUNT') ||
               cellStr.includes('=AVERAGE') ||
               cellStr.includes('=IF(') ||
               cellStr.toUpperCase().includes('FUNCTION');
      });
    
    if (isInsertingAboveFunctionRow) {
      console.log(`Inserting row above function row at position ${row}`);
    } else {
      // Find the first summary row to validate insertion position (existing logic)
      const firstSummaryRowIndex = await findFirstSummaryRowIndex(sheetId, sheetName);
      
      // Validate that the insertion row is before the first summary row
      if (row >= firstSummaryRowIndex) {
        throw new Error(`Cannot insert row at position ${row}. Insertion must be before the first summary row (row ${firstSummaryRowIndex}).`);
      }
      
      console.log(`Validated insertion: row ${row} is before first summary row ${firstSummaryRowIndex}`);
    }
    
    // First, get sheet metadata to find the correct sheet ID
    const sheetMetadata = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      includeGridData: false
    });
    
    const targetSheet = sheetMetadata.data.sheets?.find(s => s.properties?.title === sheetName);
    if (!targetSheet?.properties?.sheetId) {
      throw new Error(`Sheet "${sheetName}" not found in spreadsheet`);
    }
    
    const internalSheetId = targetSheet.properties.sheetId;
    
    // Prepare the batch update request
    const request = {
      insertRange: {
        range: {
          sheetId: internalSheetId,
          startRowIndex: row - 1, // Convert to 0-based index
          endRowIndex: row, // Insert 1 row
          startColumnIndex: 0,
          endColumnIndex: 0
        },
        shiftDimension: 'ROWS'
      }
    };
    
    // Execute the batch update
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [request]
      }
    });
    
    const message = isInsertingAboveFunctionRow 
      ? `Successfully inserted row above function row at position ${row}`
      : `Successfully inserted row at position ${row}`;
    
    console.log(message);
    
    return `${message} in sheet "${sheetName}". Rows below have been shifted down.`;
    
  } catch (error) {
    console.error('Error inserting row:', error);
    throw new Error(`Failed to insert row: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Export the updateCell function
export const updateCell = async (input: UpdateCellInput): Promise<string> => {
  try {
    const { sheetId, sheetName, row, column, value } = input;
    
    console.log(`Updating cell ${column}${row} with value "${value}" in sheet: ${sheetId}/${sheetName}`);
    
    // Get Google Sheets client
    const sheets = await getGoogleSheetsClient();
    
    // Helper function to escape sheet names for Google Sheets API
    const escapeSheetName = (name: string) => {
      if (/[^A-Za-z0-9_]/.test(name) || /^[0-9]/.test(name)) {
        return `'${name.replace(/'/g, "''")}'`;
      }
      return name;
    };
    
    const escapedSheetName = escapeSheetName(sheetName);
    
    // Ensure sheet has capacity for the target cell
    await ensureSheetCapacity(sheetId, sheetName, row, column);
    
    // Build the range string (e.g., "Sheet1!A5" or "'Sheet 1'!A5")
    const range = `${escapedSheetName}!${column}${row}`;
    
    // Execute the values update
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[value]]
      }
    });
    
    console.log(`Successfully updated cell ${column}${row} with value "${value}"`);
    
    return `Successfully updated cell ${column}${row} with value "${value}" in sheet "${sheetName}".`;
    
  } catch (error) {
    console.error('Error updating cell:', error);
    throw new Error(`Failed to update cell: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}; 