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
    console.log(`🔗 [N8N] Spreadsheet ID: ${spreadsheetId}`);
    
    // Prepare payload for n8n
    const payload = {
      sessionId,
      message,
      sheetNames,
      spreadsheetId,
      spreadsheetUrl: input.spreadsheetUrl,
      callbackUrl: input.callbackUrl || `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/n8n-callback`,
      timestamp: new Date().toISOString(),
      // Add additional context that n8n might need
      context: {
        source: 'genkit-chat',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      }
    };

    console.log(`🔗 [N8N] Payload being sent:`, JSON.stringify(payload, null, 2));

    // Use the provided n8n webhook URL
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || 'https://n8n.sheetyai.com/webhook-test/c6bddb96-fe3e-4314-a07d-09435faed94f';
    
    console.log(`🔗 [N8N] Using webhook URL: ${n8nWebhookUrl}`);

    // Trigger the n8n workflow
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ReportAI-Genkit/1.0.0'
      },
      body: JSON.stringify(payload),
    });

    console.log(`🔗 [N8N] Response status: ${response.status}`);
    console.log(`🔗 [N8N] Response headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`🔗 [N8N] Workflow failed with status ${response.status}:`, errorText);
      
      // Handle specific n8n production workflow not activated error
      if (response.status === 404 && errorText.includes('not registered') && errorText.includes('production')) {
        throw new Error(`N8N production workflow not activated. Please activate the workflow using the toggle in the top-right of the n8n editor, then try again.`);
      }
      
      // Handle specific n8n test mode error
      if (response.status === 404 && errorText.includes('not registered')) {
        throw new Error(`N8N webhook not activated. Please click the 'Test workflow' button in your n8n dashboard, then try again. (Test mode webhooks only work for one call after activation)`);
      }
      
      // Handle other n8n errors
      if (response.status === 404) {
        throw new Error(`N8N webhook not found. Please check your n8n workflow configuration and ensure the webhook is properly deployed.`);
      }
      
      throw new Error(`N8N workflow failed: ${response.status} - ${errorText}`);
    }

    let result;
    try {
      result = await response.json();
    } catch (parseError) {
      // If response is not JSON, treat it as success
      result = { success: true, message: 'Workflow triggered successfully' };
    }

    console.log(`🔗 [N8N] Workflow triggered successfully:`, result);
    
    return `Processing sheet update via n8n... (Session: ${sessionId})`;
  } catch (error) {
    console.error('🔗 [N8N] Error triggering n8n workflow:', error);
    
    // Provide a more helpful error message
    if (error instanceof Error && error.message.includes('N8N webhook not activated')) {
      throw error; // Re-throw the specific error
    }
    
    throw new Error(`Failed to trigger n8n workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}; 