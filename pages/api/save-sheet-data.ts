import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/googleSheets';

type Data = {
  message?: string;
  error?: string;
};

// Helper function to escape sheet names for Google Sheets API
const escapeSheetName = (name: string) => {
  // If the sheet name contains spaces, special characters, or starts with a digit,
  // wrap it in single quotes and escape any existing single quotes
  if (/[^A-Za-z0-9_]/.test(name) || /^[0-9]/.test(name)) {
    return `'${name.replace(/'/g, "''")}'`;
  }
  return name;
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

// Helper function to parse cell reference (e.g., "A1" -> {column: "A", row: 1})
const parseCell = (cell: string): {column: string, row: number} | null => {
  const match = cell.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  return {
    column: match[1],
    row: parseInt(match[2], 10)
  };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { spreadsheetId, sheetName, data, updates } = req.body;

  if (!spreadsheetId || !sheetName || (!data && !updates)) {
    return res.status(400).json({ error: 'Missing spreadsheetId, sheetName, or data/updates' });
  }

  try {
    const sheets = await getGoogleSheetsClient();

    // If updates array is provided, update specific cells
    if (Array.isArray(updates) && updates.length > 0) {
      for (const update of updates) {
        if (!update.cell) continue;
        
        // Parse cell reference and ensure sheet capacity
        const cellInfo = parseCell(update.cell);
        if (cellInfo) {
          await ensureSheetCapacity(spreadsheetId, sheetName, cellInfo.row, cellInfo.column);
        }
        
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${escapeSheetName(sheetName)}!${update.cell}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[update.value ?? '']] },
        });
      }
      return res.status(200).json({ message: 'Cells updated successfully' });
    }

    // Fallback: old row append logic
    // Get existing sheet data to find the next empty row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${escapeSheetName(sheetName)}!A:Z`, // Fetch a wide range to get all headers and existing data
    });

    const rows = response.data.values || [];
    const headers = rows.length > 0 ? rows[0] : [];
    const nextRow = rows.length + 1;

    // Prepare values to write
    const valuesToAppend: string[] = [];
    for (const header of headers) {
      valuesToAppend.push(data[header] || ''); // Use header as key to get value from data
    }

    // Append the new row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${escapeSheetName(sheetName)}!A${nextRow}`, // Start from the next empty row
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [valuesToAppend],
      },
    });

    res.status(200).json({ message: 'Data saved successfully' });
  } catch (error: unknown) {
    console.error('Error saving data to sheet:', (error as Error).message, (error as Error).stack);
    res.status(500).json({ error: 'Failed to save data to sheet' });
  }
}
