import { getGoogleSheetsClient } from '../lib/googleSheets';
import { escapeSheetName, findLastDataRow, ensureSheetCapacity } from '../lib/sheetUtils';

// Input type for insertRow tool
interface InsertRowInput {
  sheetId: string;
  sheetName: string;
  row: number;
  lastDataRow?: number; // Add this parameter to use the lastDataRow from AI analysis
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
    const { sheetId, sheetName, row, lastDataRow: providedLastDataRow } = input;
    
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
    
    // Ensure sheet has capacity for the target row
    await ensureSheetCapacity(sheetId, sheetName, row, 'A');
    
    // Use provided lastDataRow if available, otherwise fetch it
    let lastDataRow = providedLastDataRow;
    if (lastDataRow === undefined) {
      console.log('No lastDataRow provided, fetching fresh data...');
      // Get current sheet data to find the last data row
      const currentData = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${escapedSheetName}!A1:Z1000`,
        valueRenderOption: 'FORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
      });
      
      const sheetData = currentData.data.values || [];
      lastDataRow = findLastDataRow(sheetData);
    } else {
      console.log(`Using provided lastDataRow: ${lastDataRow}`);
    }
    
    // Validate: row should be at or after the last data row
    if (row < lastDataRow) {
      throw new Error(`Cannot insert row at position ${row}. Must insert at or after the last data row (row ${lastDataRow}).`);
    }
    
    // Get sheet metadata to find the correct sheet ID
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

// New n8n integration tool
interface N8nSheetUpdateInput {
  message: string;
  sheetNames: string[];
  spreadsheetUrl?: string;
  spreadsheetId?: string;
  sessionId?: string;
  callbackUrl?: string;
}

// Export the n8n sheet update function
export const updateSheetViaN8n = async (input: N8nSheetUpdateInput): Promise<string> => {
  try {
    const { message, sheetNames, spreadsheetId, sessionId = `session-${Date.now()}` } = input;
    
    console.log(`🔗 [N8N] Triggering n8n workflow for sheet update`);
    console.log(`🔗 [N8N] Session ID: ${sessionId}`);
    console.log(`🔗 [N8N] Message: ${message}`);
    console.log(`🔗 [N8N] Sheets: ${sheetNames.join(', ')}`);
    
    // Prepare payload for n8n
    const payload = {
      sessionId,
      message,
      sheetNames,
      spreadsheetId,
      spreadsheetUrl: input.spreadsheetUrl,
      callbackUrl: input.callbackUrl || `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/n8n-callback`,
      timestamp: new Date().toISOString()
    };

    // Get n8n webhook URL from environment
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      throw new Error('N8N_WEBHOOK_URL environment variable not configured');
    }

    // Trigger the n8n workflow
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`N8N workflow failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`🔗 [N8N] Workflow triggered successfully:`, result);
    
    return `Processing sheet update via n8n... (Session: ${sessionId})`;
  } catch (error) {
    console.error('🔗 [N8N] Error triggering n8n workflow:', error);
    throw new Error(`Failed to trigger n8n workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}; 