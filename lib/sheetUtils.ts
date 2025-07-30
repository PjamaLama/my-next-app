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

// Helper function to find the first summary row index from real Google Sheets data
export const findFirstSummaryRowIndex = async (sheetId: string, sheetName: string): Promise<number> => {
  try {
    console.log(`Finding summary row for sheet: ${sheetId}, ${sheetName}`);
    
    const sheets = await getGoogleSheetsClient();
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