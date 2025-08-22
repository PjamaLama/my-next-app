import { getGoogleSheetsClient } from './googleSheets';

// Helper function to escape sheet names for Google Sheets API
export const escapeSheetName = (name: string): string => {
  // If the sheet name contains spaces, special characters, or starts with a digit,
  // wrap it in single quotes and escape any existing single quotes
  if (/[^A-Za-z0-9_]/.test(name) || /^[0-9]/.test(name)) {
    return `'${name.replace(/'/g, "''")}'`;
  }
  return name;
};

// Helper function to parse cell reference (e.g., "A1" -> {column: "A", row: 1})
export const parseCell = (cell: string): {column: string, row: number} | null => {
  const match = cell.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  return {
    column: match[1],
    row: parseInt(match[2], 10)
  };
};

// Helper function to convert column letter to index (A=0, B=1, etc.)
export const columnToIndex = (col: string): number => {
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.charCodeAt(i) - 64);
  }
  return index - 1;
};

// Helper: convert a 0-based column index to its A1 letter(s) (0 -> A)
export const indexToColumn = (idx: number): string => {
  if (idx <= 0) {
    // handle 0 explicitly; below logic expects 1-based
    return 'A';
  }
  let n = idx + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || 'A';
};

// Parse simple A1 ranges like "A2:C10", "D:D", "A2:A", "B5" into parts
export function parseA1Range(range: string): {
  startColumn: string;
  startRow?: number;
  endColumn?: string;
  endRow?: number;
} | null {
  const r = String(range || '').trim();
  if (!r) return null;
  const singleCell = r.match(/^([A-Z]+)(\d+)$/i);
  if (singleCell) {
    return { startColumn: singleCell[1].toUpperCase(), startRow: parseInt(singleCell[2], 10) };
  }
  const fullCol = r.match(/^([A-Z]+):\1$/i);
  if (fullCol) {
    return { startColumn: fullCol[1].toUpperCase() };
  }
  const colOpenEnd = r.match(/^([A-Z]+)(\d+):([A-Z]+)?$/i);
  if (colOpenEnd && colOpenEnd[1] && !colOpenEnd[3]) {
    return { startColumn: colOpenEnd[1].toUpperCase(), startRow: parseInt(colOpenEnd[2], 10) };
  }
  const openStartToRow = r.match(/^([A-Z]+):([A-Z]+)(\d+)$/i);
  if (openStartToRow) {
    return { startColumn: openStartToRow[1].toUpperCase(), endColumn: openStartToRow[2].toUpperCase(), endRow: parseInt(openStartToRow[3], 10) };
  }
  const proper = r.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (proper) {
    return {
      startColumn: proper[1].toUpperCase(),
      startRow: parseInt(proper[2], 10),
      endColumn: proper[3].toUpperCase(),
      endRow: parseInt(proper[4], 10),
    };
  }
  // A single column letter like "C"
  const singleCol = r.match(/^[A-Z]+$/i);
  if (singleCol) {
    return { startColumn: singleCol[0].toUpperCase() };
  }
  return null;
}

// Helper function to expand sheet dimensions if needed
export const ensureSheetCapacity = async (
  sheetId: string, 
  sheetName: string, 
  targetRow: number, 
  targetColumn: string
): Promise<void> => {
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
              rowCount: targetRowIndex + 1 // Expand to exactly the target row needed
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

// Function to identify and filter out total rows when processing data
export const filterOutTotalRows = (sheetData: string[][], totalRowIndex: number = 2): string[][] => {
  console.log(`🔍 [SHEET UTILS] Filtering out total row at index ${totalRowIndex}`);
  
  if (!Array.isArray(sheetData) || sheetData.length === 0) {
    return [];
  }
  
  // Filter out the total row (row 3, which is index 2 in 0-based)
  const filteredData = sheetData.filter((_, index) => index !== totalRowIndex);
  
  console.log(`🔍 [SHEET UTILS] Filtered data: ${sheetData.length} -> ${filteredData.length} rows`);
  return filteredData;
};

// Function to check if a row is a total row (contains sum formulas or total indicators)
export const isTotalRow = (row: string[], headers: string[]): boolean => {
  if (!Array.isArray(row) || !Array.isArray(headers)) {
    return false;
  }
  
  // Check for common total row indicators
  const totalIndicators = ['total', 'sum', 'grand total', 'subtotal'];
  const rowText = row.join(' ').toLowerCase();
  
  // Check if any cell contains total indicators
  const hasTotalIndicator = totalIndicators.some(indicator => 
    rowText.includes(indicator)
  );
  
  // Check if row contains sum formulas (starts with =SUM)
  const hasSumFormula = row.some(cell => 
    String(cell).startsWith('=SUM') || String(cell).startsWith('=sum')
  );
  
  // Check if row is mostly empty except for a few cells (typical for total rows)
  const nonEmptyCells = row.filter(cell => String(cell).trim() !== '').length;
  const isEmptyExceptFew = nonEmptyCells <= Math.ceil(headers.length * 0.3); // 30% or fewer cells have content
  
  return hasTotalIndicator || hasSumFormula || isEmptyExceptFew;
};

// Function to get data rows excluding headers and total rows
export const getDataRowsOnly = (sheetData: string[][], totalRowIndex: number = 2): string[][] => {
  if (!Array.isArray(sheetData) || sheetData.length === 0) {
    return [];
  }
  
  // Skip header row (index 0) and total row (index 2)
  const dataRows = sheetData.filter((_, index) => index !== 0 && index !== totalRowIndex);
  
  console.log(`🔍 [SHEET UTILS] Extracted ${dataRows.length} data rows (excluding header and total)`);
  return dataRows;
};

// Function to ensure total row is positioned at row 3 (below headers and data)
export const ensureTotalRowPosition = async (
  spreadsheetId: string, 
  sheetName: string, 
  totalRowData: string[]
): Promise<void> => {
  try {
    const sheets = await getGoogleSheetsClient();
    const escapedName = escapeSheetName(sheetName);
    
    // Check if row 3 exists and contains total data
    const row3Response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${escapedName}!A3:Z3`
    });
    
    const existingRow3 = row3Response.data.values?.[0] || [];
    const hasTotalData = existingRow3.some(cell => 
      String(cell).toLowerCase().includes('total') || 
      String(cell).startsWith('=SUM')
    );
    
    if (!hasTotalData && totalRowData.length > 0) {
      console.log('🔍 [SHEET UTILS] Setting up total row at row 3');
      
      // Insert total row data at row 3
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${escapedName}!A3`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [totalRowData] },
      });
    }
  } catch (error) {
    console.warn('Failed to ensure total row position:', error);
  }
};

// Function to get the recommended insertion row for new data
export const getInsertionRow = async (spreadsheetId: string, sheetName: string): Promise<number> => {
  try {
    const sheets = await getGoogleSheetsClient();
    const escapedName = escapeSheetName(sheetName);
    
    // Get the last row with data by checking a large range
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${escapedName}!A:Z`, // Check all columns for the last row with data
      majorDimension: 'ROWS' // Use ROWS dimension for easier processing
    });
    
    const rows = response.data.values || [];
    let lastRowWithData = 0; // Start with header row (index 0)
    
    // Find the last non-empty row
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (row && row.some(cell => cell && String(cell).trim() !== '')) {
        lastRowWithData = i;
        break;
      }
    }
    
    // Return the next row after the last row with data (convert to 1-based)
    return lastRowWithData + 2;
  } catch (error) {
    console.warn('Failed to get last row, defaulting to row 2:', error);
    return 2; // Fallback to row 2 if there's an error
  }
}; 