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

// Export the insertRow function
export const insertRow = async (input: InsertRowInput): Promise<string> => {
  try {
    const { sheetId, sheetName, row } = input;
    
    console.log(`Inserting row at position ${row} in sheet: ${sheetId}/${sheetName}`);
    
    // Find the first summary row to validate insertion position
    const firstSummaryRowIndex = await findFirstSummaryRowIndex(sheetId, sheetName);
    
    // Validate that the insertion row is before the first summary row
    if (row >= firstSummaryRowIndex) {
      throw new Error(`Cannot insert row at position ${row}. Insertion must be before the first summary row (row ${firstSummaryRowIndex}).`);
    }
    
    console.log(`Validated insertion: row ${row} is before first summary row ${firstSummaryRowIndex}`);
    
    // Get Google Sheets client
    const sheets = await getGoogleSheetsClient();
    
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
    
    console.log(`Successfully inserted row at position ${row}`);
    
    return `Successfully inserted row at position ${row} in sheet "${sheetName}". Rows below have been shifted down.`;
    
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