import { getGoogleSheetsClient } from '../lib/googleSheets';
import { db } from '../app/providers/FirebaseProvider';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

// Input type for insertRow tool
interface InsertRowInput {
  sheet: string;
  row: number;
}

// Input type for updateCell tool
interface UpdateCellInput {
  sheet: string;
  row: number;
  column: string;
  value: string | number;
}

// Helper function to find the first summary row index
const findFirstSummaryRowIndex = async (sheetId: string, sheetName?: string): Promise<number> => {
  try {
    // Determine the collection path
    let firestoreCollectionPath: string;
    if (sheetName) {
      firestoreCollectionPath = `sheets/${sheetId}/tabs/${sheetName}/rows`;
    } else {
      firestoreCollectionPath = `sheets/${sheetId}/rows`;
    }
    
    const rowsCollectionRef = collection(db, firestoreCollectionPath);
    const rowsQuery = query(rowsCollectionRef, orderBy('rowIndex'));
    const rowsSnapshot = await getDocs(rowsQuery);
    
    const firestoreRows = rowsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Array<{ id: string; rowIndex: number; isSummary?: boolean; [key: string]: any }>;
    
    // Find the first row with isSummary flag
    const firstSummaryRow = firestoreRows.find(row => row.isSummary === true);
    
    if (firstSummaryRow) {
      return firstSummaryRow.rowIndex;
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
    const { sheet, row } = input;
    
    console.log(`Inserting row at position ${row} in sheet: ${sheet}`);
    
    // Extract sheet ID from sheet name (assuming format: "Sheet1" or full sheet ID)
    let sheetId: string;
    let sheetName: string;
    
    if (sheet.includes('/')) {
      // Full sheet ID provided
      const parts = sheet.split('/');
      sheetId = parts[0];
      sheetName = parts[1] || 'Sheet1';
    } else {
      // Just sheet name provided, need to get sheet ID from environment or context
      // For now, we'll assume it's a sheet name and use a default sheet ID
      // In a real implementation, you'd need to pass the sheet ID as well
      throw new Error('Sheet ID is required. Please provide full sheet reference (sheetId/sheetName)');
    }
    
    // Find the first summary row to validate insertion position
    const firstSummaryRowIndex = await findFirstSummaryRowIndex(sheetId, sheetName);
    
    // Validate that the insertion row is before the first summary row
    if (row >= firstSummaryRowIndex) {
      throw new Error(`Cannot insert row at position ${row}. Insertion must be before the first summary row (row ${firstSummaryRowIndex}).`);
    }
    
    console.log(`Validated insertion: row ${row} is before first summary row ${firstSummaryRowIndex}`);
    
    // Get Google Sheets client
    const sheets = await getGoogleSheetsClient();
    
    // Prepare the batch update request
    const request = {
      insertRange: {
        range: {
          sheetId: 0, // Default sheet ID (first sheet)
          startRowIndex: row - 1, // Convert to 0-based index
          endRowIndex: row - 1, // Insert 1 row
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
    const { sheet, row, column, value } = input;
    
    console.log(`Updating cell ${column}${row} with value "${value}" in sheet: ${sheet}`);
    
    // Get Google Sheets client
    const sheets = await getGoogleSheetsClient();
    
    // Extract sheet ID from sheet name (assuming format: "Sheet1" or full sheet ID)
    let sheetId: string;
    let sheetName: string;
    
    if (sheet.includes('/')) {
      // Full sheet ID provided
      const parts = sheet.split('/');
      sheetId = parts[0];
      sheetName = parts[1] || 'Sheet1';
    } else {
      // Just sheet name provided, need to get sheet ID from environment or context
      // For now, we'll assume it's a sheet name and use a default sheet ID
      // In a real implementation, you'd need to pass the sheet ID as well
      throw new Error('Sheet ID is required. Please provide full sheet reference (sheetId/sheetName)');
    }
    
    // Build the range string (e.g., "Sheet1!A5")
    const range = `${sheetName}!${column}${row}`;
    
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