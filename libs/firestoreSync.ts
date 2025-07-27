import { getGoogleSheetsClient } from '../lib/googleSheets';
import { db } from '../app/providers/FirebaseProvider';
import { 
  collection, 
  doc, 
  writeBatch, 
  deleteDoc, 
  getDocs,
  setDoc 
} from 'firebase/firestore';

/**
 * Syncs all data from a Google Sheet to Firestore
 * 
 * @param sheetId - The Google Sheet ID to sync
 * @returns Promise<void>
 */
export const syncSheetToFirestore = async (sheetId: string): Promise<void> => {
  try {
    console.log(`Starting sync for sheet: ${sheetId}`);
    
    // Get Google Sheets client
    const sheets = await getGoogleSheetsClient();
    
    // Fetch all data from the sheet (including headers and summary rows)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'A:ZZ', // Get all columns
      valueRenderOption: 'UNFORMATTED_VALUE', // Get raw values
      dateTimeRenderOption: 'FORMATTED_STRING', // Format dates as strings
    });
    
    const rows = response.data.values || [];
    
    if (rows.length === 0) {
      console.log(`No data found in sheet: ${sheetId}`);
      return;
    }
    
    console.log(`Found ${rows.length} rows in sheet: ${sheetId}`);
    
    // Get headers (first row)
    const headers = rows[0] || [];
    
    // Create a batch for efficient Firestore operations
    const batch = writeBatch(db);
    
    // First, delete all existing documents in the collection
    const rowsCollectionRef = collection(db, 'sheets', sheetId, 'rows');
    const existingDocs = await getDocs(rowsCollectionRef);
    
    console.log(`Deleting ${existingDocs.size} existing documents...`);
    existingDocs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    // Process each row (skip header row)
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const rowData: any = {
        rowIndex: rowIndex + 1, // 1-based index to match Google Sheets
        isSummary: false, // Default to false, will be determined below
      };
      
      // Map each column value to the corresponding header
      headers.forEach((header: string, colIndex: number) => {
        const value = row[colIndex] || '';
        
        // Clean up the header name for Firestore (remove special characters, spaces)
        const cleanHeader = header
          .toString()
          .trim()
          .replace(/[^a-zA-Z0-9_]/g, '_') // Replace special chars with underscore
          .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
          .replace(/_+/g, '_') // Replace multiple underscores with single
          .toLowerCase(); // Convert to lowercase
        
        if (cleanHeader) {
          rowData[cleanHeader] = value;
        }
      });
      
      // Determine if this is a summary row
      // Common indicators of summary rows:
      // - Contains "Total", "Sum", "Average", "Count" in any cell
      // - Row is mostly empty except for totals
      // - Contains formulas or calculated values
      const rowText = row.join(' ').toLowerCase();
      const isSummaryRow = 
        rowText.includes('total') ||
        rowText.includes('sum') ||
        rowText.includes('average') ||
        rowText.includes('count') ||
        rowText.includes('subtotal') ||
        rowText.includes('grand total') ||
        // Check if row has mostly empty cells except for totals
        (row.filter(cell => cell !== '' && cell !== null && cell !== undefined).length <= 2);
      
      rowData.isSummary = isSummaryRow;
      
      // Create document ID using row index
      const docId = `row_${rowIndex + 1}`;
      const docRef = doc(rowsCollectionRef, docId);
      
      // Add to batch
      batch.set(docRef, rowData);
    }
    
    // Commit the batch
    console.log(`Committing batch with ${rows.length - 1} new documents...`);
    await batch.commit();
    
    console.log(`Successfully synced ${rows.length - 1} rows from sheet ${sheetId} to Firestore`);
    
  } catch (error) {
    console.error(`Error syncing sheet ${sheetId} to Firestore:`, error);
    throw error;
  }
};

/**
 * Syncs a specific sheet tab to Firestore
 * 
 * @param sheetId - The Google Sheet ID
 * @param sheetName - The specific sheet tab name
 * @returns Promise<void>
 */
export const syncSheetTabToFirestore = async (sheetId: string, sheetName: string): Promise<void> => {
  try {
    console.log(`Starting sync for sheet tab: ${sheetId}/${sheetName}`);
    
    // Get Google Sheets client
    const sheets = await getGoogleSheetsClient();
    
    // Fetch all data from the specific sheet tab
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${sheetName}'!A:ZZ`, // Get all columns from specific sheet
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    
    const rows = response.data.values || [];
    
    if (rows.length === 0) {
      console.log(`No data found in sheet tab: ${sheetId}/${sheetName}`);
      return;
    }
    
    console.log(`Found ${rows.length} rows in sheet tab: ${sheetId}/${sheetName}`);
    
    // Get headers (first row)
    const headers = rows[0] || [];
    
    // Create a batch for efficient Firestore operations
    const batch = writeBatch(db);
    
    // Delete existing documents for this specific sheet tab
    const rowsCollectionRef = collection(db, 'sheets', sheetId, 'tabs', sheetName, 'rows');
    const existingDocs = await getDocs(rowsCollectionRef);
    
    console.log(`Deleting ${existingDocs.size} existing documents for tab ${sheetName}...`);
    existingDocs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    // Process each row (skip header row)
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const rowData: any = {
        rowIndex: rowIndex + 1,
        sheetName: sheetName,
        isSummary: false,
      };
      
      // Map each column value to the corresponding header
      headers.forEach((header: string, colIndex: number) => {
        const value = row[colIndex] || '';
        
        // Clean up the header name for Firestore
        const cleanHeader = header
          .toString()
          .trim()
          .replace(/[^a-zA-Z0-9_]/g, '_')
          .replace(/^_+|_+$/g, '')
          .replace(/_+/g, '_')
          .toLowerCase();
        
        if (cleanHeader) {
          rowData[cleanHeader] = value;
        }
      });
      
      // Determine if this is a summary row
      const rowText = row.join(' ').toLowerCase();
      const isSummaryRow = 
        rowText.includes('total') ||
        rowText.includes('sum') ||
        rowText.includes('average') ||
        rowText.includes('count') ||
        rowText.includes('subtotal') ||
        rowText.includes('grand total') ||
        (row.filter(cell => cell !== '' && cell !== null && cell !== undefined).length <= 2);
      
      rowData.isSummary = isSummaryRow;
      
      // Create document ID using row index
      const docId = `row_${rowIndex + 1}`;
      const docRef = doc(rowsCollectionRef, docId);
      
      // Add to batch
      batch.set(docRef, rowData);
    }
    
    // Commit the batch
    console.log(`Committing batch with ${rows.length - 1} new documents for tab ${sheetName}...`);
    await batch.commit();
    
    console.log(`Successfully synced ${rows.length - 1} rows from sheet tab ${sheetId}/${sheetName} to Firestore`);
    
  } catch (error) {
    console.error(`Error syncing sheet tab ${sheetId}/${sheetName} to Firestore:`, error);
    throw error;
  }
}; 