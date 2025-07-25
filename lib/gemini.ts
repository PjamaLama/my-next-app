export const sendToGemini = async ({
  transcript,
  sheetData,
  sheetName,
  geminiApiKey,
}: {
  transcript: string;
  sheetData: (string | number)[][];
  sheetName: string;
  geminiApiKey: string;
}) => {
  const nextRow = sheetData.length + 1;

  const prompt = `You are helping update a Google Sheet named "${sheetName}".

User's request:
${transcript}

Current sheet data (including headers and rows):
${sheetData.map((row) => row.join(',')).join('\n')}

---
Your task:
1. Determine the **next available empty row**.
2. Based on the user's request and the existing sheet data:
   - Identify confident values for each column.
   - For uncertain fields, use the most recent or frequent historical patterns to suggest a value, or leave blank if unsure.
3. Output your response using this **EXACT JSON format**:

{
  "row_to_update": ${nextRow},
  "cells_to_update": [
    { "column": "ColumnName1", "cell": "B${nextRow}", "value": "Some value" },
    { "column": "ColumnName2", "cell": "F${nextRow}", "value": "Another value" }
  ]
}

---
### RULES:
- DO NOT use backticks, triple quotes, or markdown.
- DO NOT include any explanation — only return the raw JSON object.
- DO match columns using headers and provide exact A1 cell references.
- DO suggest values using prior patterns. If unsure, leave "value" as an empty string "".
`.trim();

  console.log("Sending prompt to Gemini:", prompt);

  const result = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  const json = await result.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

  console.log("Raw Gemini response text:", text);

  try {
    // Remove accidental markdown or junk and parse cleanly
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    // Only return the cells_to_update array for mapping to the confirm and edit modal
    return parsed?.cells_to_update || [];
  } catch (error) {
    console.error("Failed to parse Gemini response as JSON:", error);
    return null;
  }
};

// Enhanced function for multi-sheet reasoning
export const sendToGeminiMulti = async ({
  transcript,
  sheetsData,
  allSheetNames,
  selectedSheetName,
  geminiApiKey,
}: {
  transcript: string;
  sheetsData: { [sheetName: string]: (string | number)[][] };
  allSheetNames: string[];
  selectedSheetName?: string;
  geminiApiKey: string;
}) => {
  // Create a comprehensive prompt for multi-sheet reasoning with enhanced row tracking
  const sheetsInfo = Object.entries(sheetsData).map(([sheetName, data]) => {
    const headers = data.length > 0 ? data[0].join(', ') : 'No headers';
    const rowCount = data.length - 1; // Subtract header row
    const nextRow = Math.max(2, data.length + 1); // Ensure minimum row 2 (after headers), calculate next available row
    
    // Get sample data rows for better sheet context understanding
    const sampleRows = data.slice(1, Math.min(4, data.length)).map(row => row.join(', ')).join('\n');
    
    // Extract column headers for better semantic mapping
    const columnHeaders = data.length > 0 ? data[0] : [];
    
    // Try to determine sheet purpose based on column headers
    let sheetPurpose = "";
    const headerStr = columnHeaders.join(' ').toLowerCase();
    
    // Detect common sheet types based on headers
    if (headerStr.includes('expense') || headerStr.includes('cost') || headerStr.includes('price') || headerStr.includes('amount')) {
      sheetPurpose = "EXPENSE_TRACKING";
    } else if (headerStr.includes('vehicle') || headerStr.includes('car') || headerStr.includes('mileage') || headerStr.includes('fuel')) {
      sheetPurpose = "VEHICLE_LOG";
      
      // For vehicle logs, provide additional structure information
      const kmStartIndex = columnHeaders.findIndex(h => 
        String(h).toLowerCase().includes('km start') || 
        String(h).toLowerCase().includes('start km') || 
        String(h).toLowerCase().includes('odometer start') || 
        String(h).toLowerCase().includes('starting km'));
      
      const kmEndIndex = columnHeaders.findIndex(h => 
        String(h).toLowerCase().includes('km end') || 
        String(h).toLowerCase().includes('end km') || 
        String(h).toLowerCase().includes('km finish') || 
        String(h).toLowerCase().includes('odometer end') || 
        String(h).toLowerCase().includes('finishing km'));
      
      const kmTraveledIndex = columnHeaders.findIndex(h => 
        String(h).toLowerCase().includes('km traveled') || 
        String(h).toLowerCase().includes('distance') || 
        String(h).toLowerCase().includes('kilometers') || 
        String(h).toLowerCase().includes('km'));
      
      if (kmStartIndex >= 0 && kmEndIndex >= 0) {
        sheetPurpose += " (has KM start/end fields)";
      } else if (kmTraveledIndex >= 0) {
        sheetPurpose += " (has KM traveled field)";
      }
      
      // Get the last entry's KM end to use as the next entry's KM start
      let lastKmEnd = "";
      if (kmEndIndex >= 0 && data.length > 1) {
        for (let i = data.length - 1; i >= 1; i--) {
          if (data[i][kmEndIndex]) {
            lastKmEnd = String(data[i][kmEndIndex]);
            break;
          }
        }
      }
      
      if (lastKmEnd) {
        sheetPurpose += ` (last recorded KM end: ${lastKmEnd})`;
      }
    } else if (headerStr.includes('task') || headerStr.includes('todo') || headerStr.includes('project')) {
      sheetPurpose = "TASK_MANAGEMENT";
    } else if (headerStr.includes('customer') || headerStr.includes('client') || headerStr.includes('contact')) {
      sheetPurpose = "CUSTOMER_TRACKING";
    } else if (headerStr.includes('inventory') || headerStr.includes('product') || headerStr.includes('stock')) {
      sheetPurpose = "INVENTORY";
    } else if (headerStr.includes('invoice') || headerStr.includes('bill') || headerStr.includes('payment')) {
      sheetPurpose = "INVOICE_TRACKING";
    } else if (headerStr.includes('employee') || headerStr.includes('staff') || headerStr.includes('personnel')) {
      sheetPurpose = "EMPLOYEE_RECORDS";
    } else if (headerStr.includes('time') || headerStr.includes('hours') || headerStr.includes('timesheet')) {
      sheetPurpose = "TIME_TRACKING";
    }
    
    // Analyze data patterns to identify common categories used in this sheet
    let commonCategories = "";
    if (data.length > 1) {
      // Try to find category columns
      const categoryColumnIndex = columnHeaders.findIndex(header => 
        String(header).toLowerCase().includes('category') || 
        String(header).toLowerCase().includes('type'));
      
      if (categoryColumnIndex >= 0) {
        // Extract unique categories from this column
        const categories = new Set<string>();
        for (let i = 1; i < Math.min(data.length, 20); i++) {
          if (data[i][categoryColumnIndex]) {
            categories.add(String(data[i][categoryColumnIndex]).toLowerCase());
          }
        }
        if (categories.size > 0) {
          commonCategories = Array.from(categories).join(', ');
        }
      }
    }
    
    // Extract column indices for better field mapping
    const columnIndices: Record<string, number> = {};
    columnHeaders.forEach((header, index) => {
      columnIndices[String(header).toLowerCase()] = index;
    });
    
    return `Sheet: "${sheetName}"
Headers: ${headers}
Current data rows: ${rowCount} (plus 1 header row = ${data.length} total rows)
Next available row for new data: ${nextRow}
Sheet purpose: ${sheetPurpose || "GENERAL"}
${commonCategories ? `Common categories: ${commonCategories}` : ''}
Sample data rows:
${sampleRows || '(No data rows yet)'}`;
  }).join('\n\n');

  // Analyze the user's transcript for specific categories
  const transcriptLower = transcript.toLowerCase();
  
  // Detect specific expense categories in the transcript
  const detectedCategories = [];
  
  // Vehicle-related expenses
  if (transcriptLower.match(/\b(fuel|gas|petrol|diesel|mileage|car|vehicle|auto|automotive|repair|maintenance|oil change)\b/)) {
    detectedCategories.push("VEHICLE");
  }
  
  // Look for kilometer/distance information in the transcript
  let kmInfo = "";
  const kmMatch = transcriptLower.match(/\b(\d+)\s*km\b/i) || 
                 transcriptLower.match(/\bkm\s*(\d+)\b/i) ||
                 transcriptLower.match(/\b(\d+)\s*kilometers\b/i) ||
                 transcriptLower.match(/\bdistance\s*(\d+)\b/i) ||
                 transcriptLower.match(/\bdrove\s*(\d+)\b/i) ||
                 transcriptLower.match(/\bdriven\s*(\d+)\b/i);
                 
  if (kmMatch) {
    kmInfo = `\nDETECTED DISTANCE: ${kmMatch[1]} kilometers`;
  }
  
  // Look for odometer readings in the transcript
  const odometerStartMatch = transcriptLower.match(/\bodometer\s*start\s*(\d+)\b/i) || 
                           transcriptLower.match(/\bstart\s*km\s*(\d+)\b/i) ||
                           transcriptLower.match(/\bstarting\s*at\s*(\d+)\b/i);
                           
  const odometerEndMatch = transcriptLower.match(/\bodometer\s*end\s*(\d+)\b/i) || 
                         transcriptLower.match(/\bend\s*km\s*(\d+)\b/i) ||
                         transcriptLower.match(/\bending\s*at\s*(\d+)\b/i);
  
  if (odometerStartMatch) {
    kmInfo += `\nDETECTED ODOMETER START: ${odometerStartMatch[1]}`;
  }
  
  if (odometerEndMatch) {
    kmInfo += `\nDETECTED ODOMETER END: ${odometerEndMatch[1]}`;
  }
  
  // Food-related expenses
  if (transcriptLower.match(/\b(food|meal|restaurant|lunch|dinner|breakfast|cafe|coffee|snack|grocery)\b/)) {
    detectedCategories.push("FOOD");
  }
  
  // Travel-related expenses
  if (transcriptLower.match(/\b(travel|trip|hotel|flight|airfare|lodging|accommodation|taxi|uber|lyft|train|bus|transportation)\b/)) {
    detectedCategories.push("TRAVEL");
  }
  
  // Office-related expenses
  if (transcriptLower.match(/\b(office|supplies|stationery|equipment|software|hardware|computer|printer|ink|toner|subscription)\b/)) {
    detectedCategories.push("OFFICE");
  }
  
  // Entertainment-related expenses
  if (transcriptLower.match(/\b(entertainment|movie|theatre|theater|concert|event|ticket|admission)\b/)) {
    detectedCategories.push("ENTERTAINMENT");
  }
  
  // Medical-related expenses
  if (transcriptLower.match(/\b(medical|doctor|healthcare|medicine|prescription|hospital|clinic|dental|vision)\b/)) {
    detectedCategories.push("MEDICAL");
  }
  
  // Utility-related expenses
  if (transcriptLower.match(/\b(utility|utilities|electric|electricity|water|gas|internet|phone|mobile|cell|bill)\b/)) {
    detectedCategories.push("UTILITIES");
  }
  
  // Add detected categories to the prompt for better context
  const categoryContext = detectedCategories.length > 0 
    ? `\n\nDETECTED EXPENSE CATEGORIES IN USER REQUEST: ${detectedCategories.join(', ')}${kmInfo}`
    : (kmInfo ? `\n\nDETECTED VEHICLE INFORMATION: ${kmInfo}` : '');

  const prompt = `You are an intelligent assistant helping to update Google Sheets based on user requests. You can add MULTIPLE ROWS to the same sheet and update MULTIPLE SHEETS in a single operation.

SELECTED SPREADSHEET contains these sheets:
${allSheetNames.join(', ')}

${selectedSheetName ? `User's preferred sheet: "${selectedSheetName}"` : 'No specific sheet preference - analyze all available sheets.'}

DETAILED SHEET ANALYSIS:
${sheetsInfo}${categoryContext}

USER'S REQUEST:
"${transcript}"

---
ANALYSIS INSTRUCTIONS:

1. **CRITICAL: SHEET SELECTION LOGIC**:
   - MOST IMPORTANT: Match content to the CORRECT sheet based on semantic relevance
   - Look for category keywords that indicate which sheet to use:
     * Fuel, mileage, vehicle maintenance → VEHICLE_LOG sheet
     * Food, restaurant, meal → EXPENSE_TRACKING sheet
     * Tasks, assignments, todos → TASK_MANAGEMENT sheet
     * Customer details, client info → CUSTOMER_TRACKING sheet
     * Products, stock levels → INVENTORY sheet
     * Bills, payments → INVOICE_TRACKING sheet
     * Employee info, staff details → EMPLOYEE_RECORDS sheet
     * Work hours, time spent → TIME_TRACKING sheet
   - Analyze column headers to find the most appropriate sheet for each data point
   - If user mentions a specific sheet name, prioritize that sheet
   - NEVER put data in an inappropriate sheet - accuracy is critical!

2. **VEHICLE LOG SPECIAL HANDLING**:
   - CRITICAL: For vehicle logs, ALWAYS fill in BOTH "KM Start" and "KM End" fields
   - If user mentions kilometers driven (e.g., "drove 50km"), calculate:
     * KM Start = Last recorded KM End (or calculate from context)
     * KM End = KM Start + kilometers driven
   - If user provides odometer readings (e.g., "start 12500, end 12550"):
     * Use those exact values for KM Start and KM End
   - If only total distance is given, look at previous entries to determine the starting KM
   - NEVER leave KM Start or KM End empty if the sheet has these fields
   - If calculating KM Traveled field: KM Traveled = KM End - KM Start

3. **Common Data Category Mapping**:
   - VEHICLE expenses: fuel, maintenance, repairs → Vehicle Log sheet
   - FOOD expenses: meals, restaurants, groceries → Expenses sheet
   - TRAVEL: hotels, flights, transportation → Expenses or Travel sheet
   - OFFICE: supplies, software, equipment → Expenses sheet
   - PERSONAL: clothing, entertainment → Personal Expenses sheet
   - BUSINESS: client meetings, marketing → Business Expenses sheet
   - MEDICAL: doctor visits, prescriptions → Medical Expenses sheet
   - UTILITIES: electricity, water, internet → Utility Bills sheet

4. **Multi-Row Support**: 
   - If the user mentions multiple items, entries, or records, create SEPARATE rows for each
   - Each sheet maintains its own row numbering - NEVER assume sheets have the same row counts
   - For multiple rows in the same sheet: use nextRow, nextRow+1, nextRow+2, etc.

5. **Row Numbering Rules**:
   - CRITICAL: Each sheet has its own "Next available row" number shown above
   - For Sheet A with "Next available row: 5" and Sheet B with "Next available row: 12":
     - New rows in Sheet A start at row 5, 6, 7...
     - New rows in Sheet B start at row 12, 13, 14...
   - NEVER use the same row number across different sheets unless they actually have the same next available row

6. **Smart Data Population**:
   - Analyze existing data patterns to determine appropriate formats
   - Auto-fill reasonable defaults (current date, sequential IDs, default status)
   - Map user's natural language to structured data fields intelligently
   - For multiple similar items, create variations or increment values appropriately
   - ALWAYS fill in all required fields for each sheet type

7. **Output Format** - Use this **EXACT JSON structure**:

{
  "reasoning": "Explanation of which sheets to update, how many rows per sheet, and why these sheets were selected",
  "sheetsToUpdate": ["Sheet1", "Sheet2"],
  "updates": [
    {
      "sheetName": "Vehicle Log",
      "row": 5,
      "column": "Date",
      "cell": "A5",
      "value": "2023-05-15"
    },
    {
      "sheetName": "Vehicle Log", 
      "row": 5,
      "column": "KM Start",
      "cell": "B5", 
      "value": "12500"
    },
    {
      "sheetName": "Vehicle Log", 
      "row": 5,
      "column": "KM End",
      "cell": "C5", 
      "value": "12550"
    },
    {
      "sheetName": "Vehicle Log", 
      "row": 5,
      "column": "KM Traveled",
      "cell": "D5", 
      "value": "50"
    },
    {
      "sheetName": "Expenses",
      "row": 12,
      "column": "Category",
      "cell": "B12",
      "value": "Food"
    }
  ]
}

---
### CRITICAL SHEET SELECTION RULES:
- **SEMANTIC RELEVANCE**: Match data to the MOST APPROPRIATE sheet based on content
- **CONTENT CATEGORIES**: Use category detection to place data in the correct sheet (fuel→vehicle log, food→expenses)
- **COLUMN MATCHING**: Match data fields to appropriate columns in each sheet
- **RESPECT SHEET PURPOSE**: Honor the detected sheet purpose (EXPENSE_TRACKING, VEHICLE_LOG, etc.)
- **COMPREHENSIVE UPDATES**: Include ALL necessary columns for each new row (don't leave obvious fields empty)
- **LOGICAL GROUPING**: Group related fields for the same row together in the updates array
- **PRECISE CELL REFERENCES**: Calculate exact A1-style references (A5, B6, C7, etc.) based on column position and row number
- **RETURN JSON ONLY**: No explanations, markdown, or backticks - just the raw JSON object

### VEHICLE LOG SPECIFIC RULES:
- **COMPLETE ODOMETER READINGS**: ALWAYS include both KM Start and KM End for vehicle logs
- **CONSISTENT CALCULATIONS**: Ensure KM Traveled = KM End - KM Start
- **USE PREVIOUS DATA**: If available, use the last entry's KM End as the new entry's KM Start
- **HANDLE PARTIAL INFO**: If user only provides distance traveled, calculate KM End based on KM Start

EXAMPLE SCENARIOS:
- "Add fuel expense of $50 for diesel" → Updates Vehicle Log sheet with all required fields including KM Start/End
- "Log lunch expense of $20 at McDonald's" → Updates Expenses sheet with category "Food"
- "Record a trip of 50km for work purposes" → Updates Vehicle Log with KM Start, KM End, and KM Traveled
- "Add vehicle log: started at 12500km, ended at 12550km" → Updates Vehicle Log with exact odometer readings`.trim();

  console.log("Sending enhanced multi-sheet prompt to Gemini:", prompt);

  const result = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  const json = await result.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

  console.log("Raw Gemini multi-sheet response text:", text);

  try {
    // Remove accidental markdown or junk and parse cleanly
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    
    // Ensure we have the expected structure and validate row numbers
    if (parsed && parsed.updates && Array.isArray(parsed.updates)) {
      // Validate and log row number usage for debugging
      const sheetRowUsage: { [sheetName: string]: number[] } = {};
      parsed.updates.forEach((update: any) => {
        if (update.sheetName && update.row) {
          if (!sheetRowUsage[update.sheetName]) {
            sheetRowUsage[update.sheetName] = [];
          }
          sheetRowUsage[update.sheetName].push(update.row);
        }
      });
      
      console.log("AI suggested row usage by sheet:", sheetRowUsage);
      
      // Verify row numbers are reasonable
      Object.entries(sheetRowUsage).forEach(([sheetName, rows]) => {
        const sheetData = sheetsData[sheetName];
        if (sheetData) {
          const expectedNextRow = Math.max(2, sheetData.length + 1);
          const minSuggestedRow = Math.min(...rows);
          if (minSuggestedRow < expectedNextRow) {
            console.warn(`Warning: AI suggested row ${minSuggestedRow} for sheet "${sheetName}", but next available should be ${expectedNextRow}`);
          }
        }
      });
      
      // Validate vehicle log entries have both KM start and KM end
      const vehicleLogUpdates = parsed.updates.filter((update: any) => 
        update.sheetName.toLowerCase().includes('vehicle') || 
        update.sheetName.toLowerCase().includes('car') || 
        update.sheetName.toLowerCase().includes('mileage'));
      
      if (vehicleLogUpdates.length > 0) {
        // Group by row to check completeness
        const rowGroups: { [key: string]: any[] } = {};
        vehicleLogUpdates.forEach((update: any) => {
          const rowKey = `${update.sheetName}-${update.row}`;
          if (!rowGroups[rowKey]) {
            rowGroups[rowKey] = [];
          }
          rowGroups[rowKey].push(update);
        });
        
        // Check each row has both KM start and KM end
        Object.entries(rowGroups).forEach(([rowKey, updates]) => {
          const hasKmStart = updates.some((u: any) => 
            u.column.toLowerCase().includes('km start') || 
            u.column.toLowerCase().includes('start km') ||
            u.column.toLowerCase().includes('odometer start'));
          
          const hasKmEnd = updates.some((u: any) => 
            u.column.toLowerCase().includes('km end') || 
            u.column.toLowerCase().includes('end km') ||
            u.column.toLowerCase().includes('km finish') ||
            u.column.toLowerCase().includes('odometer end'));
          
          if (!hasKmStart || !hasKmEnd) {
            console.warn(`Warning: Vehicle log entry for ${rowKey} is missing ${!hasKmStart ? 'KM Start' : ''}${!hasKmStart && !hasKmEnd ? ' and ' : ''}${!hasKmEnd ? 'KM End' : ''}`);
          }
        });
      }
      
      return {
        reasoning: parsed.reasoning || "AI analysis complete",
        sheetsToUpdate: parsed.sheetsToUpdate || [],
        updates: parsed.updates
      };
    } else {
      console.error("Unexpected response structure from Gemini multi-sheet");
      return { 
        reasoning: "Failed to parse AI response", 
        sheetsToUpdate: [], 
        updates: [] 
      };
    }
  } catch (error) {
    console.error("Failed to parse Gemini multi-sheet response as JSON:", error);
    return { 
      reasoning: "Error parsing AI response", 
      sheetsToUpdate: [], 
      updates: [] 
    };
  }
};
