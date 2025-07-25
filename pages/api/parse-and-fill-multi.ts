import { getGoogleSheetsClient } from '@/lib/googleSheets';
import { sendToGeminiMulti } from '@/lib/gemini';
import type { NextApiRequest, NextApiResponse } from 'next';

// Helper function to analyze sheet content and detect common patterns
function analyzeSheetContent(sheetName: string, data: (string | number)[][]) {
  if (!data || data.length <= 1) return {};
  
  const headers = data[0];
  const dataRows = data.slice(1);
  
  // Detect common column types
  const columnTypes: {[key: string]: string} = {};
  const columnIndexes: {[key: string]: number} = {};
  
  // Map headers to common semantic types
  headers.forEach((header, index) => {
    const headerStr = String(header).toLowerCase();
    columnIndexes[headerStr] = index;
    
    // Detect date columns
    if (headerStr.includes('date') || headerStr.includes('time') || headerStr.includes('when')) {
      columnTypes[headerStr] = 'DATE';
    }
    // Detect amount/cost columns
    else if (headerStr.includes('amount') || headerStr.includes('cost') || 
             headerStr.includes('price') || headerStr.includes('total') || 
             headerStr.includes('fee') || headerStr.includes('expense')) {
      columnTypes[headerStr] = 'AMOUNT';
    }
    // Detect category columns
    else if (headerStr.includes('category') || headerStr.includes('type') || 
             headerStr.includes('kind') || headerStr.includes('classification')) {
      columnTypes[headerStr] = 'CATEGORY';
    }
    // Detect description columns
    else if (headerStr.includes('description') || headerStr.includes('notes') || 
             headerStr.includes('details') || headerStr.includes('comment')) {
      columnTypes[headerStr] = 'DESCRIPTION';
    }
    // Detect name columns
    else if (headerStr.includes('name') || headerStr.includes('title') || 
             headerStr.includes('label')) {
      columnTypes[headerStr] = 'NAME';
    }
    // Detect status columns
    else if (headerStr.includes('status') || headerStr.includes('state') || 
             headerStr.includes('condition')) {
      columnTypes[headerStr] = 'STATUS';
    }
    // Detect odometer/kilometer columns
    else if (headerStr.includes('km start') || headerStr.includes('start km') || 
             headerStr.includes('odometer start') || headerStr.includes('starting km')) {
      columnTypes[headerStr] = 'KM_START';
    }
    else if (headerStr.includes('km end') || headerStr.includes('end km') || 
             headerStr.includes('km finish') || headerStr.includes('odometer end') || 
             headerStr.includes('finishing km')) {
      columnTypes[headerStr] = 'KM_END';
    }
    else if (headerStr.includes('km traveled') || headerStr.includes('distance') || 
             headerStr.includes('kilometers') || (headerStr.includes('km') && !headerStr.includes('start') && !headerStr.includes('end'))) {
      columnTypes[headerStr] = 'KM_TRAVELED';
    }
  });
  
  // Analyze common values in category columns
  const categoryValues: {[key: string]: string[]} = {};
  const categoryColumns = Object.entries(columnTypes)
    .filter(([_, type]) => type === 'CATEGORY')
    .map(([header]) => header);
  
  categoryColumns.forEach(header => {
    const index = columnIndexes[header];
    const values = new Set<string>();
    
    dataRows.forEach(row => {
      if (row[index] && typeof row[index] === 'string') {
        values.add(String(row[index]).toLowerCase());
      }
    });
    
    categoryValues[header] = Array.from(values);
  });
  
  // Detect sheet purpose based on column headers and values
  let sheetPurpose = "";
  const allHeadersStr = headers.join(' ').toLowerCase();
  
  // Common sheet type detection
  if (allHeadersStr.includes('vehicle') || allHeadersStr.includes('mileage') || 
      allHeadersStr.includes('fuel') || allHeadersStr.includes('car')) {
    sheetPurpose = "VEHICLE_LOG";
  } 
  else if (allHeadersStr.includes('expense') || allHeadersStr.includes('cost') || 
           allHeadersStr.includes('spending')) {
    sheetPurpose = "EXPENSE_TRACKING";
  }
  else if (allHeadersStr.includes('task') || allHeadersStr.includes('todo') || 
           allHeadersStr.includes('project')) {
    sheetPurpose = "TASK_MANAGEMENT";
  }
  else if (allHeadersStr.includes('customer') || allHeadersStr.includes('client') || 
           allHeadersStr.includes('contact')) {
    sheetPurpose = "CUSTOMER_TRACKING";
  }
  
  // Look for common expense categories
  let hasExpenseCategories = false;
  Object.values(categoryValues).forEach(values => {
    const valuesStr = values.join(' ');
    if (valuesStr.includes('food') || valuesStr.includes('travel') || 
        valuesStr.includes('office') || valuesStr.includes('fuel')) {
      hasExpenseCategories = true;
    }
  });
  
  if (hasExpenseCategories && !sheetPurpose) {
    sheetPurpose = "EXPENSE_TRACKING";
  }
  
  // Get the last KM End value for vehicle logs
  let lastKmEnd = null;
  if (sheetPurpose === "VEHICLE_LOG") {
    // Find KM End column
    const kmEndIndex = headers.findIndex(h => {
      const headerStr = String(h).toLowerCase();
      return headerStr.includes('km end') || 
             headerStr.includes('end km') || 
             headerStr.includes('km finish') || 
             headerStr.includes('odometer end');
    });
    
    if (kmEndIndex >= 0 && dataRows.length > 0) {
      // Find the last non-empty KM End value
      for (let i = dataRows.length - 1; i >= 0; i--) {
        if (dataRows[i][kmEndIndex]) {
          lastKmEnd = dataRows[i][kmEndIndex];
          break;
        }
      }
    }
  }
  
  return {
    sheetPurpose,
    columnTypes,
    categoryValues,
    rowCount: dataRows.length,
    nextRow: data.length + 1,
    lastKmEnd
  };
}

// Helper function to validate and fix vehicle log entries
function validateAndFixVehicleLogEntries(updates: any[], sheetAnalysis: any) {
  if (!updates || !Array.isArray(updates)) return updates;
  
  // Group updates by sheet and row
  const updatesBySheetAndRow: {[key: string]: any[]} = {};
  
  updates.forEach(update => {
    const key = `${update.sheetName}-${update.row}`;
    if (!updatesBySheetAndRow[key]) {
      updatesBySheetAndRow[key] = [];
    }
    updatesBySheetAndRow[key].push(update);
  });
  
  // Process each group of updates
  Object.entries(updatesBySheetAndRow).forEach(([key, rowUpdates]) => {
    const [sheetName] = key.split('-');
    const analysis = sheetAnalysis[sheetName];
    
    // Skip if not a vehicle log sheet
    if (!analysis || analysis.sheetPurpose !== "VEHICLE_LOG") return;
    
    // Check if this row has KM Start and KM End
    const hasKmStart = rowUpdates.some(u => {
      const colLower = String(u.column).toLowerCase();
      return colLower.includes('km start') || colLower.includes('start km') || colLower.includes('odometer start');
    });
    
    const hasKmEnd = rowUpdates.some(u => {
      const colLower = String(u.column).toLowerCase();
      return colLower.includes('km end') || colLower.includes('end km') || colLower.includes('km finish') || colLower.includes('odometer end');
    });
    
    // Get KM values if they exist
    let kmStart: number | null = null;
    let kmEnd: number | null = null;
    let kmTraveled: number | null = null;
    
    rowUpdates.forEach(u => {
      const colLower = String(u.column).toLowerCase();
      if (colLower.includes('km start') || colLower.includes('start km') || colLower.includes('odometer start')) {
        kmStart = parseFloat(String(u.value).replace(/[^\d.]/g, ''));
      }
      else if (colLower.includes('km end') || colLower.includes('end km') || colLower.includes('km finish') || colLower.includes('odometer end')) {
        kmEnd = parseFloat(String(u.value).replace(/[^\d.]/g, ''));
      }
      else if (colLower.includes('km traveled') || colLower.includes('distance') || 
               (colLower.includes('km') && !colLower.includes('start') && !colLower.includes('end'))) {
        kmTraveled = parseFloat(String(u.value).replace(/[^\d.]/g, ''));
      }
    });
    
    // If missing KM Start or KM End, try to calculate
    if (!hasKmStart || !hasKmEnd) {
      console.log(`Vehicle log entry missing ${!hasKmStart ? 'KM Start' : ''}${!hasKmStart && !hasKmEnd ? ' and ' : ''}${!hasKmEnd ? 'KM End' : ''}`);
      
      // Case 1: Missing KM Start but have KM End and KM Traveled
      if (!hasKmStart && hasKmEnd && kmEnd !== null && kmTraveled !== null) {
        const calculatedKmStart = kmEnd - kmTraveled;
        console.log(`Calculating KM Start: ${kmEnd} - ${kmTraveled} = ${calculatedKmStart}`);
        
        // Find column name for KM Start
        const startColumnName = Object.keys(analysis.columnTypes).find(col => 
          analysis.columnTypes[col] === 'KM_START');
        
        if (startColumnName) {
          // Add the missing KM Start update
          updates.push({
            sheetName,
            row: rowUpdates[0].row,
            column: startColumnName,
            cell: startColumnName.charAt(0).toUpperCase() + rowUpdates[0].row, // Simplified cell reference
            value: calculatedKmStart.toString()
          });
        }
      }
      // Case 2: Missing KM End but have KM Start and KM Traveled
      else if (!hasKmEnd && hasKmStart && kmStart !== null && kmTraveled !== null) {
        const calculatedKmEnd = kmStart + kmTraveled;
        console.log(`Calculating KM End: ${kmStart} + ${kmTraveled} = ${calculatedKmEnd}`);
        
        // Find column name for KM End
        const endColumnName = Object.keys(analysis.columnTypes).find(col => 
          analysis.columnTypes[col] === 'KM_END');
        
        if (endColumnName) {
          // Add the missing KM End update
          updates.push({
            sheetName,
            row: rowUpdates[0].row,
            column: endColumnName,
            cell: endColumnName.charAt(0).toUpperCase() + rowUpdates[0].row, // Simplified cell reference
            value: calculatedKmEnd.toString()
          });
        }
      }
      // Case 3: Missing KM Start but have KM End (use previous entry's KM End)
      else if (!hasKmStart && hasKmEnd && analysis.lastKmEnd !== null) {
        console.log(`Using last KM End (${analysis.lastKmEnd}) as new KM Start`);
        
        // Find column name for KM Start
        const startColumnName = Object.keys(analysis.columnTypes).find(col => 
          analysis.columnTypes[col] === 'KM_START');
        
        if (startColumnName) {
          // Add the missing KM Start update
          updates.push({
            sheetName,
            row: rowUpdates[0].row,
            column: startColumnName,
            cell: startColumnName.charAt(0).toUpperCase() + rowUpdates[0].row, // Simplified cell reference
            value: analysis.lastKmEnd.toString()
          });
          
          // If we also need to calculate KM Traveled
          if (kmEnd !== null && !kmTraveled) {
            const calculatedKmTraveled = kmEnd - parseFloat(String(analysis.lastKmEnd));
            console.log(`Calculating KM Traveled: ${kmEnd} - ${analysis.lastKmEnd} = ${calculatedKmTraveled}`);
            
            // Find column name for KM Traveled
            const traveledColumnName = Object.keys(analysis.columnTypes).find(col => 
              analysis.columnTypes[col] === 'KM_TRAVELED');
            
            if (traveledColumnName) {
              // Add the missing KM Traveled update
              updates.push({
                sheetName,
                row: rowUpdates[0].row,
                column: traveledColumnName,
                cell: traveledColumnName.charAt(0).toUpperCase() + rowUpdates[0].row, // Simplified cell reference
                value: calculatedKmTraveled.toString()
              });
            }
          }
        }
      }
      // Case 4: Missing KM End but have KM Start (assume default distance if no other info)
      else if (!hasKmEnd && hasKmStart && kmStart !== null) {
        // Default to a small distance if we can't calculate
        const defaultDistance = 10; // Default 10 km if unknown
        const calculatedKmEnd = kmStart + defaultDistance;
        console.log(`Using default distance (${defaultDistance}) to calculate KM End: ${kmStart} + ${defaultDistance} = ${calculatedKmEnd}`);
        
        // Find column name for KM End
        const endColumnName = Object.keys(analysis.columnTypes).find(col => 
          analysis.columnTypes[col] === 'KM_END');
        
        if (endColumnName) {
          // Add the missing KM End update
          updates.push({
            sheetName,
            row: rowUpdates[0].row,
            column: endColumnName,
            cell: endColumnName.charAt(0).toUpperCase() + rowUpdates[0].row, // Simplified cell reference
            value: calculatedKmEnd.toString()
          });
          
          // If we also need to calculate KM Traveled
          if (!kmTraveled) {
            // Find column name for KM Traveled
            const traveledColumnName = Object.keys(analysis.columnTypes).find(col => 
              analysis.columnTypes[col] === 'KM_TRAVELED');
            
            if (traveledColumnName) {
              // Add the missing KM Traveled update
              updates.push({
                sheetName,
                row: rowUpdates[0].row,
                column: traveledColumnName,
                cell: traveledColumnName.charAt(0).toUpperCase() + rowUpdates[0].row, // Simplified cell reference
                value: defaultDistance.toString()
              });
            }
          }
        }
      }
    }
  });
  
  return updates;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { transcript, spreadsheetId, selectedSheetName, geminiApiKey } = req.body;

  // Check if we have a Gemini API key from the user or fallback to environment variable
  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return res.status(400).json({ error: 'Gemini API key is required. Please add it in your settings.' });
  }

  try {
    const sheets = await getGoogleSheetsClient();
    
    // Get spreadsheet metadata to discover all sheets
    const spreadsheetRes = await sheets.spreadsheets.get({
      spreadsheetId,
    });
    
    const allSheets = spreadsheetRes.data.sheets || [];
    const sheetNames = allSheets.map(sheet => sheet.properties?.title || 'Unknown');
    
    // Enhanced: Get data for ALL sheets to enable better cross-sheet analysis
    // This allows the AI to understand the full context and make better decisions about which sheets to update
    const sheetsData: { [sheetName: string]: (string | number)[][] } = {};
    const sheetAnalysis: { [sheetName: string]: any } = {};
    
    // Fetch data from all available sheets for comprehensive analysis
    for (const sheetName of sheetNames) {
      try {
        const sheetDataRes = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A:Z`, // Fetch wider range to capture all data
          valueRenderOption: 'FORMATTED_VALUE',
        });
        
        const rawData = sheetDataRes.data.values ?? [];
        sheetsData[sheetName] = rawData;
        
        // Perform enhanced sheet content analysis
        const analysis = analyzeSheetContent(sheetName, rawData);
        sheetAnalysis[sheetName] = analysis;
        
        // Log sheet analysis for debugging
        const rowCount = Math.max(0, rawData.length - 1); // Subtract header row if exists
        const nextRow = Math.max(2, rawData.length + 1); // Ensure minimum row 2
        console.log(`Sheet "${sheetName}": ${rawData.length} total rows, ${rowCount} data rows, next available: ${nextRow}, purpose: ${analysis.sheetPurpose || 'GENERAL'}`);
        
        // Log additional vehicle log info if applicable
        if (analysis.sheetPurpose === "VEHICLE_LOG" && analysis.lastKmEnd !== null) {
          console.log(`  Last KM End value: ${analysis.lastKmEnd}`);
        }
        
      } catch (e) {
        console.warn(`Could not fetch data for sheet: ${sheetName}`, e);
        sheetsData[sheetName] = []; // Empty data for inaccessible sheets
        sheetAnalysis[sheetName] = { sheetPurpose: "UNKNOWN" };
      }
    }

    console.log(`Fetched data from ${Object.keys(sheetsData).length} sheets for AI analysis`);
    
    // Check if the user's transcript contains specific category keywords
    const transcriptLower = transcript.toLowerCase();
    const detectedCategories: string[] = [];
    
    if (transcriptLower.match(/\b(fuel|gas|petrol|diesel|mileage|car|vehicle|auto|automotive|repair|maintenance|oil change)\b/)) {
      detectedCategories.push('VEHICLE');
    }
    
    if (transcriptLower.match(/\b(food|meal|restaurant|lunch|dinner|breakfast|cafe|coffee|snack|grocery)\b/)) {
      detectedCategories.push('FOOD');
    }
    
    if (transcriptLower.match(/\b(travel|trip|hotel|flight|airfare|lodging|accommodation|taxi|uber|lyft|train|bus|transportation)\b/)) {
      detectedCategories.push('TRAVEL');
    }
    
    // Look for kilometer/distance information
    const kmMatch = transcriptLower.match(/\b(\d+)\s*km\b/i) || 
                  transcriptLower.match(/\bkm\s*(\d+)\b/i) ||
                  transcriptLower.match(/\b(\d+)\s*kilometers\b/i) ||
                  transcriptLower.match(/\bdistance\s*(\d+)\b/i) ||
                  transcriptLower.match(/\bdrove\s*(\d+)\b/i) ||
                  transcriptLower.match(/\bdriven\s*(\d+)\b/i);
    
    if (kmMatch) {
      console.log(`Detected distance: ${kmMatch[1]} kilometers`);
    }
    
    // Look for odometer readings
    const odometerStartMatch = transcriptLower.match(/\bodometer\s*start\s*(\d+)\b/i) || 
                             transcriptLower.match(/\bstart\s*km\s*(\d+)\b/i) ||
                             transcriptLower.match(/\bstarting\s*at\s*(\d+)\b/i);
                             
    const odometerEndMatch = transcriptLower.match(/\bodometer\s*end\s*(\d+)\b/i) || 
                           transcriptLower.match(/\bend\s*km\s*(\d+)\b/i) ||
                           transcriptLower.match(/\bending\s*at\s*(\d+)\b/i);
    
    if (odometerStartMatch) {
      console.log(`Detected odometer start: ${odometerStartMatch[1]}`);
    }
    
    if (odometerEndMatch) {
      console.log(`Detected odometer end: ${odometerEndMatch[1]}`);
    }
    
    if (detectedCategories.length > 0) {
      console.log(`Detected categories in user transcript: ${detectedCategories.join(', ')}`);
    }
    
    // Find potential target sheets based on detected categories
    const potentialTargetSheets: string[] = [];
    
    if (detectedCategories.includes('VEHICLE')) {
      // Look for vehicle log sheets
      const vehicleSheets = Object.entries(sheetAnalysis)
        .filter(([_, analysis]) => analysis.sheetPurpose === 'VEHICLE_LOG')
        .map(([name]) => name);
      
      if (vehicleSheets.length > 0) {
        potentialTargetSheets.push(...vehicleSheets);
      }
    }
    
    if (detectedCategories.includes('FOOD') || detectedCategories.includes('TRAVEL')) {
      // Look for expense sheets
      const expenseSheets = Object.entries(sheetAnalysis)
        .filter(([_, analysis]) => analysis.sheetPurpose === 'EXPENSE_TRACKING')
        .map(([name]) => name);
      
      if (expenseSheets.length > 0) {
        potentialTargetSheets.push(...expenseSheets);
      }
    }
    
    if (potentialTargetSheets.length > 0) {
      console.log(`Potential target sheets based on detected categories: ${potentialTargetSheets.join(', ')}`);
    }

    // Send to enhanced Gemini function that can reason about multiple sheets and rows
    const aiResponse = await sendToGeminiMulti({ 
      transcript, 
      sheetsData, 
      allSheetNames: sheetNames,
      selectedSheetName,
      geminiApiKey: apiKey 
    });

    // Enhanced response logging
    console.log(`AI Response: ${aiResponse.updates?.length || 0} updates across ${aiResponse.sheetsToUpdate?.length || 0} sheets`);
    
    // Validate the AI response structure
    if (!aiResponse.updates || !Array.isArray(aiResponse.updates)) {
      console.error("Invalid AI response structure:", aiResponse);
      return res.status(500).json({ error: 'AI returned invalid response structure' });
    }

    // Additional validation: check for reasonable row numbers and sheet selection
    let hasValidationErrors = false;
    const validationErrors: string[] = [];
    
    // Check if the AI selected appropriate sheets based on our analysis
    const selectedSheets = [...new Set(aiResponse.updates.map(update => update.sheetName))];
    
    // Check if the AI is using the sheets we expected based on detected categories
    if (potentialTargetSheets.length > 0) {
      const matchingSheets = selectedSheets.filter(sheet => potentialTargetSheets.includes(sheet));
      if (matchingSheets.length === 0 && selectedSheets.length > 0) {
        console.warn(`Warning: AI selected sheets (${selectedSheets.join(', ')}) don't match expected sheets based on categories (${potentialTargetSheets.join(', ')})`);
      }
    }
    
    aiResponse.updates.forEach((update, index) => {
      if (!update.sheetName || !update.cell || !update.column) {
        validationErrors.push(`Update ${index + 1}: Missing required fields (sheetName, cell, column)`);
        hasValidationErrors = true;
      }
      
      // Validate row numbers against available data
      const sheetData = sheetsData[update.sheetName];
      if (sheetData && update.row) {
        const expectedMinRow = Math.max(2, sheetData.length + 1);
        const suggestedRow = parseInt(update.row.toString());
        
        if (suggestedRow < expectedMinRow) {
          console.warn(`Update ${index + 1}: Suggested row ${suggestedRow} for "${update.sheetName}" may conflict with existing data (expected min: ${expectedMinRow})`);
          // Note: We log but don't fail, as the AI might have valid reasons for suggesting specific rows
        }
      }
    });

    if (hasValidationErrors) {
      console.error("Validation errors in AI response:", validationErrors);
      return res.status(400).json({ 
        error: 'AI response validation failed', 
        details: validationErrors,
        aiResponse: aiResponse 
      });
    }
    
    // Validate and fix vehicle log entries to ensure KM Start and KM End are populated
    const enhancedUpdates = validateAndFixVehicleLogEntries(aiResponse.updates, sheetAnalysis);
    aiResponse.updates = enhancedUpdates;
    
    // Log the final updates after validation and fixing
    console.log(`Final updates after validation: ${aiResponse.updates.length} updates`);
    
    // Group updates by sheet and row for better logging
    const updatesBySheetAndRow: {[key: string]: any[]} = {};
    aiResponse.updates.forEach((update: any) => {
      const key = `${update.sheetName}-${update.row}`;
      if (!updatesBySheetAndRow[key]) {
        updatesBySheetAndRow[key] = [];
      }
      updatesBySheetAndRow[key].push(update);
    });
    
    // Log updates by sheet and row
    Object.entries(updatesBySheetAndRow).forEach(([key, updates]) => {
      console.log(`Updates for ${key}:`);
      updates.forEach(update => {
        console.log(`  ${update.column}: ${update.value}`);
      });
    });

    res.status(200).json({ aiResponse });
  } catch (e) {
    console.error('Error in parse-and-fill-multi:', e);
    res.status(500).json({ 
      error: 'Something went wrong', 
      details: e instanceof Error ? e.message : 'Unknown error'
    });
  }
} 