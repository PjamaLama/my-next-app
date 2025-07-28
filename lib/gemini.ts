/**
 * Gemini API Token Optimization and Limits
 * 
 * Current Gemini Limits (as of 2024):
 * - INPUT: Up to 1 million tokens (Gemini 2.0 Flash) / 2 million tokens (Gemini 1.5 Pro)
 * - OUTPUT: Maximum 8,192 tokens (FIXED LIMIT - cannot be increased)
 * 
 * Token Efficiency Strategies Implemented:
 * 1. Enhanced pattern analysis for intelligent value suggestions
 * 2. Optimized generation config (lower temperature, focused responses)
 * 3. Structured JSON output format to maximize information density
 * 4. Confidence levels to prioritize important suggestions
 * 5. Context-aware field completion to reduce manual input
 * 
 * Performance Optimizations:
 * - maxOutputTokens: 8192 (uses full available output capacity)
 * - temperature: 0.1 (more consistent, structured responses)
 * - topP: 0.8 (focused vocabulary for better JSON structure)
 * - topK: 40 (limits token selection for consistency)
 * 
 * Note: While we cannot increase the 8K output limit, the enhanced pattern analysis
 * and intelligent suggestions should provide much better value within that constraint.
 */

export const sendToGemini = async ({
  transcript,
  sheetData,
  sheetName,
  geminiApiKey,
  images = [],
}: {
  transcript: string;
  sheetData: (string | number)[][];
  sheetName: string;
  geminiApiKey: string;
  images?: Array<{ data: string; mimeType: string; }>;
}) => {
  const nextRow = sheetData.length + 1;

  // Enhanced data analysis for pattern detection
  const headers = sheetData.length > 0 ? sheetData[0] : [];
  const dataRows = sheetData.slice(1);
  
  // Analyze patterns in existing data for better suggestions
  let patternAnalysis = "";
  if (dataRows.length > 0) {
    patternAnalysis = `\n\nDATA PATTERN ANALYSIS FOR INTELLIGENT SUGGESTIONS:`;
    
    headers.forEach((header, colIndex) => {
      const columnValues = dataRows.map(row => row[colIndex]).filter(val => val !== "" && val !== null && val !== undefined);
      
      if (columnValues.length > 0) {
        // Get the most recent values (last 3-5 entries)
        const recentValues = columnValues.slice(-3);
        
        // Get unique values and their frequency
        const valueFrequency: { [key: string]: number } = {};
        columnValues.forEach(val => {
          const strVal = String(val);
          valueFrequency[strVal] = (valueFrequency[strVal] || 0) + 1;
        });
        
        // Find the most common values
        const sortedValues = Object.entries(valueFrequency)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 3)
          .map(([value, count]) => `"${value}" (${count} times)`);
        
        // Check if it's a numeric column
        const isNumeric = columnValues.every(val => !isNaN(Number(val)));
        
        // Calculate patterns for numeric columns
        let numericPattern = "";
        if (isNumeric && columnValues.length > 1) {
          const numbers = columnValues.map(val => Number(val));
          const min = Math.min(...numbers);
          const max = Math.max(...numbers);
          const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
          const lastValue = numbers[numbers.length - 1];
          
          numericPattern = ` | Range: ${min}-${max}, Average: ${avg.toFixed(2)}, Last: ${lastValue}`;
        }
        
        // Check for date patterns
        const isDateLike = columnValues.some(val => {
          const str = String(val);
          return str.match(/\d{4}-\d{2}-\d{2}/) || str.match(/\d{1,2}\/\d{1,2}\/\d{4}/) || str.match(/\d{1,2}-\d{1,2}-\d{4}/);
        });
        
        let datePattern = "";
        if (isDateLike) {
          const lastDate = columnValues[columnValues.length - 1];
          datePattern = ` | Last date: ${lastDate}`;
        }
        
        patternAnalysis += `\n- "${header}": Recent values: [${recentValues.join(', ')}] | Most common: ${sortedValues.join(', ')}${numericPattern}${datePattern}`;
      } else {
        patternAnalysis += `\n- "${header}": No previous data available`;
      }
    });
    
    // Add special pattern detection for common field types
    patternAnalysis += `\n\nSPECIAL FIELD PATTERNS:`;
    
    // Vehicle-specific patterns
    const kmStartCol = headers.findIndex(h => String(h).toLowerCase().includes('km start') || String(h).toLowerCase().includes('start km'));
    const kmEndCol = headers.findIndex(h => String(h).toLowerCase().includes('km end') || String(h).toLowerCase().includes('end km'));
    
    if (kmStartCol >= 0 && kmEndCol >= 0 && dataRows.length > 0) {
      const lastKmEnd = dataRows[dataRows.length - 1][kmEndCol];
      if (lastKmEnd) {
        patternAnalysis += `\n- Last recorded KM End: ${lastKmEnd} (can be used as next KM Start)`;
      }
    }
    
    // Category patterns
    const categoryCol = headers.findIndex(h => String(h).toLowerCase().includes('category') || String(h).toLowerCase().includes('type'));
    if (categoryCol >= 0) {
      const categories = dataRows.map(row => row[categoryCol]).filter(val => val).slice(-5);
      patternAnalysis += `\n- Recent categories: [${categories.join(', ')}]`;
    }
    
    // Amount/Cost patterns
    const amountCol = headers.findIndex(h => String(h).toLowerCase().includes('amount') || String(h).toLowerCase().includes('cost') || String(h).toLowerCase().includes('price'));
    if (amountCol >= 0) {
      const amounts = dataRows.map(row => row[amountCol]).filter(val => val && !isNaN(Number(val))).map(val => Number(val));
      if (amounts.length > 0) {
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        patternAnalysis += `\n- Typical amount range: $${Math.min(...amounts)} - $${Math.max(...amounts)}, Average: $${avgAmount.toFixed(2)}`;
      }
    }
  }

  const prompt = `You are helping update a Google Sheet named "${sheetName}".

User's request:
${transcript}

Current sheet data (including headers and rows):
${sheetData.map((row) => row.join(',')).join('\n')}${patternAnalysis}

---
Your task:
1. Determine the **next available empty row** (${nextRow}).
2. Based on the user's request and the existing sheet data:
   - Identify confident values for each column based on user's explicit input.
   - For fields NOT explicitly mentioned by the user, analyze the pattern analysis above to suggest intelligent values:
     * Use the most recent similar entries as templates
     * Follow established patterns (e.g., if user says "fuel expense", look at previous fuel entries for category, format, etc.)
     * For vehicle logs: automatically calculate KM Start from last KM End, estimate reasonable KM End based on context
     * For dates: use current date if not specified
     * For categories: suggest based on keywords in user request and historical patterns
     * For amounts: if user mentions partial info ("expensive lunch"), estimate based on similar historical entries
     * For recurring fields: use most common historical values as defaults
   - NEVER leave important fields completely empty if patterns exist to suggest values
   - Mark suggested values clearly but provide them to give users a starting point

3. Output your response using this **EXACT JSON format**:

{
  "row_to_update": ${nextRow},
  "cells_to_update": [
    { "column": "ColumnName1", "cell": "A${nextRow}", "value": "User provided value", "confidence": "high" },
    { "column": "ColumnName2", "cell": "B${nextRow}", "value": "Pattern-suggested value", "confidence": "medium" },
    { "column": "ColumnName3", "cell": "C${nextRow}", "value": "Best guess from context", "confidence": "low" }
  ]
}

---
### ENHANCED RULES FOR INTELLIGENT SUGGESTIONS:
- DO NOT use backticks, triple quotes, or markdown.
- DO NOT include any explanation — only return the raw JSON object.
- DO match columns using headers and provide exact A1 cell references.
- CONFIDENCE LEVELS:
  * "high" = User explicitly provided this data
  * "medium" = Strong pattern match or logical inference from user input
  * "low" = Best guess based on historical patterns, user can easily modify
- INTELLIGENT VALUE SUGGESTIONS:
  * For vehicle logs: If user mentions distance, auto-calculate KM start/end using last recorded values
  * For expenses: If user mentions type (fuel, food, etc.), suggest category and estimate amount based on historical data
  * For dates: Use current date unless user specifies otherwise
  * For recurring fields: Use most frequent historical values
  * For sequential fields: Increment from last value (IDs, reference numbers, etc.)
- PATTERN-BASED FILLING:
  * Analyze similar previous entries to the user's request
  * Use format consistency (date formats, currency symbols, category naming conventions)
  * Follow established abbreviations and naming patterns
  * Maintain data type consistency (numbers as numbers, dates as dates)
- NEVER leave a field completely empty if:
  * There's a clear pattern in historical data
  * The user's request implies a value (e.g., "expensive meal" suggests higher amount)
  * It's a calculated field (like KM traveled = KM end - KM start)
  * It's a date field and current date is reasonable
`.trim();

  console.log("Sending prompt to Gemini:", prompt);

  // Prepare the content for multimodal input
  const contents = [];
  
  // Add images first if any
  if (images && images.length > 0) {
    images.forEach(image => {
      contents.push({
        parts: [{
          inline_data: {
            mime_type: image.mimeType,
            data: image.data
          }
        }]
      });
    });
  }
  
  // Add the text prompt
  contents.push({
    parts: [{ text: prompt }]
  });

  const result = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: 8192,  // Use maximum available output tokens
          temperature: 0.1,       // Lower temperature for more consistent, structured output
          topP: 0.8,             // Slightly more focused responses
          topK: 40,              // Limit vocabulary for more consistent JSON
        },
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

// Type definitions for multi-sheet processing
interface ParsedUpdate {
  sheetName: string;
  row: number;
  column: string;
  value: string | number;
  [key: string]: unknown;
}

// Enhanced function for multi-sheet reasoning
export const sendToGeminiMulti = async ({
  transcript,
  sheetsData,
  allSheetNames,
  selectedSheetName,
  geminiApiKey,
  images = [],
}: {
  transcript: string;
  sheetsData: { [sheetName: string]: (string | number)[][] };
  allSheetNames: string[];
  selectedSheetName?: string;
  geminiApiKey: string;
  images?: Array<{ data: string; mimeType: string; }>;
}) => {
  // Create a comprehensive prompt for multi-sheet reasoning with enhanced row tracking and pattern analysis
  const sheetsInfo = Object.entries(sheetsData).map(([sheetName, data]) => {
    const headers = data.length > 0 ? data[0].join(', ') : 'No headers';
    const rowCount = data.length - 1; // Subtract header row
    const nextRow = Math.max(2, data.length + 1); // Ensure minimum row 2 (after headers), calculate next available row
    
    // Get sample data rows for better sheet context understanding
    const sampleRows = data.slice(1, Math.min(4, data.length)).map(row => row.join(', ')).join('\n');
    
    // Extract column headers for better semantic mapping
    const columnHeaders = data.length > 0 ? data[0] : [];
    const dataRows = data.slice(1);
    
    // Enhanced pattern analysis for each sheet
    let sheetPatternAnalysis = "";
    if (dataRows.length > 0) {
      sheetPatternAnalysis = `\nPattern Analysis:`;
      
      columnHeaders.forEach((header, colIndex) => {
        const columnValues = dataRows.map(row => row[colIndex]).filter(val => val !== "" && val !== null && val !== undefined);
        
        if (columnValues.length > 0) {
          const recentValues = columnValues.slice(-2); // Last 2 values for multi-sheet context
          const valueFrequency: { [key: string]: number } = {};
          columnValues.forEach(val => {
            const strVal = String(val);
            valueFrequency[strVal] = (valueFrequency[strVal] || 0) + 1;
          });
          
          const mostCommon = Object.entries(valueFrequency)
            .sort(([,a], [,b]) => b - a)[0];
          
          // Check if numeric for pattern detection
          const isNumeric = columnValues.every(val => !isNaN(Number(val)));
          let pattern = "";
          
          if (isNumeric && columnValues.length > 1) {
            const numbers = columnValues.map(val => Number(val));
            const lastValue = numbers[numbers.length - 1];
            const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
            pattern = ` (avg: ${avg.toFixed(1)}, last: ${lastValue})`;
          }
          
          sheetPatternAnalysis += `\n  - ${header}: Recent [${recentValues.join(', ')}], Common "${mostCommon[0]}"${pattern}`;
        }
      });
      
      // Special field detection for this sheet
      const kmStartCol = columnHeaders.findIndex(h => String(h).toLowerCase().includes('km start') || String(h).toLowerCase().includes('start km'));
      const kmEndCol = columnHeaders.findIndex(h => String(h).toLowerCase().includes('km end') || String(h).toLowerCase().includes('end km'));
      
      if (kmStartCol >= 0 && kmEndCol >= 0 && dataRows.length > 0) {
        const lastKmEnd = dataRows[dataRows.length - 1][kmEndCol];
        if (lastKmEnd) {
          sheetPatternAnalysis += `\n  - VEHICLE LOG: Last KM End = ${lastKmEnd} (use as next KM Start)`;
        }
      }
      
      // Category pattern detection
      const categoryCol = columnHeaders.findIndex(h => String(h).toLowerCase().includes('category') || String(h).toLowerCase().includes('type'));
      if (categoryCol >= 0) {
        const recentCategories = dataRows.map(row => row[categoryCol]).filter(val => val).slice(-3);
        sheetPatternAnalysis += `\n  - Categories: [${recentCategories.join(', ')}]`;
      }
    }
    
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
Next available row for new data: ${nextRow} ${data.length > 0 && data[data.length - 1].some(val => val === 'Summary') ? '(insert above summary row at ' + (data.length - 1) + ')' : '(append at end)'}
Sheet purpose: ${sheetPurpose || "GENERAL"}
${commonCategories ? `Common categories: ${commonCategories}` : ''}${sheetPatternAnalysis}
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

6. **Smart Data Population with Pattern Analysis**:
   - Analyze existing data patterns from the "Pattern Analysis" sections above for each sheet
   - Use recent values and common patterns to suggest intelligent defaults for fields not explicitly provided by user
   - Auto-fill reasonable defaults based on historical data:
     * Current date for date fields (unless user specifies otherwise)
     * Most common category for expense type based on user's keywords
     * Sequential IDs or reference numbers (increment from last value)
     * Calculated fields (KM Traveled = KM End - KM Start)
   - For missing but important fields, use pattern-based suggestions:
     * If user says "fuel expense" but doesn't specify amount, use average of previous fuel expenses
     * If user mentions distance traveled, calculate KM Start from last KM End
     * For recurring fields (payment method, vendor, etc.), use most frequent historical values
   - Map user's natural language to structured data fields intelligently
   - For multiple similar items, create variations or increment values appropriately
   - NEVER leave critical fields empty if historical patterns can provide reasonable suggestions
   - Mark confidence level of each suggested value

7. **Output Format** - Use this **EXACT JSON structure**:

{
  "reasoning": "Explanation of which sheets to update, pattern-based suggestions made, and confidence levels used",
  "sheetsToUpdate": ["Sheet1", "Sheet2"],
  "updates": [
    {
      "sheetName": "Vehicle Log",
      "row": 5,
      "column": "Date",
      "cell": "A5",
      "value": "2023-05-15",
      "confidence": "medium"
    },
    {
      "sheetName": "Vehicle Log", 
      "row": 5,
      "column": "KM Start",
      "cell": "B5", 
      "value": "12500",
      "confidence": "high"
    },
    {
      "sheetName": "Vehicle Log", 
      "row": 5,
      "column": "KM End",
      "cell": "C5", 
      "value": "12550",
      "confidence": "high"
    },
    {
      "sheetName": "Vehicle Log", 
      "row": 5,
      "column": "KM Traveled",
      "cell": "D5", 
      "value": "50",
      "confidence": "high"
    },
    {
      "sheetName": "Expenses",
      "row": 12,
      "column": "Category",
      "cell": "B12",
      "value": "Food",
      "confidence": "medium"
    }
  ]
}

---
### CRITICAL SHEET SELECTION RULES:
- **SEMANTIC RELEVANCE**: Match data to the MOST APPROPRIATE sheet based on content
- **CONTENT CATEGORIES**: Use category detection to place data in the correct sheet (fuel→vehicle log, food→expenses)
- **COLUMN MATCHING**: Match data fields to appropriate columns in each sheet
- **RESPECT SHEET PURPOSE**: Honor the detected sheet purpose (EXPENSE_TRACKING, VEHICLE_LOG, etc.)
- **COMPREHENSIVE UPDATES**: Include ALL necessary columns for each new row using pattern analysis for missing data
- **LOGICAL GROUPING**: Group related fields for the same row together in the updates array
- **PRECISE CELL REFERENCES**: Calculate exact A1-style references (A5, B6, C7, etc.) based on column position and row number
- **CONFIDENCE LEVELS**: Include confidence for each field:
  * "high" = User explicitly provided or calculated from user data
  * "medium" = Strong pattern match or logical inference from context
  * "low" = Best guess from historical patterns
- **PATTERN-BASED INTELLIGENCE**: Use the Pattern Analysis data above to:
  * Fill missing fields with most common/recent values
  * Maintain data consistency (formats, abbreviations, etc.)
  * Calculate derived fields (distances, totals, etc.)
  * Suggest reasonable estimates based on similar historical entries
- **RETURN JSON ONLY**: No explanations, markdown, or backticks - just the raw JSON object

### VEHICLE LOG SPECIFIC RULES:
- **COMPLETE ODOMETER READINGS**: ALWAYS include both KM Start and KM End for vehicle logs
- **CONSISTENT CALCULATIONS**: Ensure KM Traveled = KM End - KM Start
- **USE PREVIOUS DATA**: If available, use the last entry's KM End as the new entry's KM Start
- **HANDLE PARTIAL INFO**: If user only provides distance traveled, calculate KM End based on KM Start

EXAMPLE SCENARIOS WITH PATTERN-BASED SUGGESTIONS:
- "Add fuel expense of $50 for diesel" → Updates Vehicle Log with:
  * Amount: $50 (high confidence - user provided)
  * Category: "Fuel" (high confidence - inferred from "fuel")
  * Date: current date (medium confidence - auto-fill)
  * KM Start: last recorded KM End from patterns (medium confidence)
  * Vendor: most common fuel vendor from patterns (low confidence)
- "Log expensive lunch" → Updates Expenses sheet with:
  * Category: "Food" (high confidence - inferred from "lunch")
  * Amount: estimated from average lunch expenses in pattern data (low confidence)
  * Date: current date (medium confidence)
  * Description: "Lunch" (medium confidence)
- "Record a trip of 50km for work" → Updates Vehicle Log with:
  * KM Start: last KM End from pattern analysis (high confidence)
  * KM End: KM Start + 50 (high confidence - calculated)
  * KM Traveled: 50 (high confidence - user provided)
  * Purpose: "Work" (medium confidence - user mentioned)
  * Date: current date (medium confidence)`.trim();

  console.log("Sending enhanced multi-sheet prompt to Gemini:", prompt);

  // Prepare the content for multimodal input
  const contents = [];
  
  // Add images first if any
  if (images && images.length > 0) {
    images.forEach(image => {
      contents.push({
        parts: [{
          inline_data: {
            mime_type: image.mimeType,
            data: image.data
          }
        }]
      });
    });
  }
  
  // Add the text prompt
  contents.push({
    parts: [{ text: prompt }]
  });

  const result = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: 8192,  // Use maximum available output tokens
          temperature: 0.1,       // Lower temperature for more consistent, structured output  
          topP: 0.8,             // Slightly more focused responses
          topK: 40,              // Limit vocabulary for more consistent JSON
        },
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
      parsed.updates.forEach((update: ParsedUpdate) => {
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
      const vehicleLogUpdates = parsed.updates.filter((update: ParsedUpdate) => 
        update.sheetName && typeof update.sheetName === 'string' && (
          update.sheetName.toLowerCase().includes('vehicle') || 
          update.sheetName.toLowerCase().includes('car') || 
          update.sheetName.toLowerCase().includes('mileage')));
      
      if (vehicleLogUpdates.length > 0) {
        // Group by row to check completeness
        const rowGroups: { [key: string]: ParsedUpdate[] } = {};
        vehicleLogUpdates.forEach((update: ParsedUpdate) => {
          const rowKey = `${update.sheetName}-${update.row}`;
          if (!rowGroups[rowKey]) {
            rowGroups[rowKey] = [];
          }
          rowGroups[rowKey].push(update);
        });
        
        // Check each row has both KM start and KM end
        Object.entries(rowGroups).forEach(([rowKey, updates]) => {
          const hasKmStart = updates.some((u: ParsedUpdate) => 
            u.column && typeof u.column === 'string' && (
              u.column.toLowerCase().includes('km start') || 
              u.column.toLowerCase().includes('start km') ||
              u.column.toLowerCase().includes('odometer start')));
          
          const hasKmEnd = updates.some((u: ParsedUpdate) => 
            u.column && typeof u.column === 'string' && (
              u.column.toLowerCase().includes('km end') || 
              u.column.toLowerCase().includes('end km') ||
              u.column.toLowerCase().includes('km finish') ||
              u.column.toLowerCase().includes('odometer end')));
          
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
