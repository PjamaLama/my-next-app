import { getGoogleSheetsClient } from '../lib/googleSheets';
import { escapeSheetName, ensureSheetCapacity, findFirstSummaryRowIndex } from '../lib/sheetUtils';

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