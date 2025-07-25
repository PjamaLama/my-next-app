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
  // Create a comprehensive prompt for multi-sheet reasoning
  const sheetsInfo = Object.entries(sheetsData).map(([sheetName, data]) => {
    const headers = data.length > 0 ? data[0].join(', ') : 'No headers';
    const rowCount = data.length - 1; // Subtract header row
    const nextRow = data.length + 1; // Calculate next available row
    const sampleRows = data.slice(1, 4).map(row => row.join(', ')).join('\n');
    
    return `Sheet: "${sheetName}"
Headers: ${headers}
Current row count: ${rowCount}
Next available row: ${nextRow}
Sample data:
${sampleRows}`;
  }).join('\n\n');

  const prompt = `You are an intelligent assistant helping to update Google Sheets based on user requests. You must work WITHIN the selected spreadsheet and intelligently determine which specific sheets and rows to update.

SELECTED SPREADSHEET contains these sheets:
${allSheetNames.join(', ')}

${selectedSheetName ? `User's preferred sheet: "${selectedSheetName}"` : 'No specific sheet preference - analyze all available sheets.'}

SHEET DATA ANALYSIS:
${sheetsInfo}

USER'S REQUEST:
"${transcript}"

---
ANALYSIS INSTRUCTIONS:
1. **Understand the Request Context**: 
   - What type of data is the user trying to add/update?
   - What business process or workflow does this relate to?
   - Are there keywords that hint at specific sheet types?

2. **Sheet Selection Logic**:
   - Match the request content to the most appropriate sheet(s) based on column headers
   - Consider semantic meaning (e.g., "expense" → expense tracking sheet, "customer" → customer sheet)
   - If user specified a preferred sheet and it's appropriate, prioritize it
   - Can update multiple sheets if the request logically spans multiple areas

3. **Smart Data Population**:
   - Use the provided "Next available row" number for each sheet when adding new rows
   - IMPORTANT: Each sheet has its own next available row number - do not assume they are the same
   - Analyze existing data patterns to determine appropriate formats
   - Auto-fill reasonable defaults (dates, IDs, status fields)
   - Map user's natural language to structured data fields
   - When adding new rows, ALWAYS use the exact "Next available row" number provided for that sheet

4. **Output Format** - Use this **EXACT JSON structure**:

{
  "reasoning": "Brief explanation of which sheets to update and why",
  "sheetsToUpdate": ["Sheet1", "Sheet2"],
  "updates": [
    {
      "sheetName": "Sheet1",
      "row": <use Next available row number for Sheet1>,
      "column": "Name",
      "cell": "A<row>",
      "value": "John Doe"
    },
    {
      "sheetName": "Sheet2",
      "row": <use Next available row number for Sheet2>,
      "column": "Status",
      "cell": "C<row>", 
      "value": "Updated"
    }
  ]
}

---
### CRITICAL RULES:
- WORK WITHIN THE SELECTED SPREADSHEET ONLY - never suggest creating new spreadsheets
- USE CORRECT ROW NUMBERS: Always use the provided "Next available row" number for each sheet
- ANALYZE SHEET CONTEXT: Match user request to appropriate sheet(s) based on column headers and existing data
- SMART DEFAULTS: Use patterns from existing data to suggest realistic values
- EXACT REFERENCES: Provide precise A1-style cell references (A1, B2, C3, etc.)
- NEW VS UPDATE: For new rows, use the next available row number provided for each sheet
- MULTI-SHEET LOGIC: Can update multiple sheets if the request spans different data areas
- RETURN JSON ONLY: No explanations, markdown, or backticks - just the raw JSON object
- SEMANTIC MAPPING: Match natural language to appropriate database fields intelligently
`.trim();

  console.log("Sending multi-sheet prompt to Gemini:", prompt);

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
    
    // Ensure we have the expected structure
    if (parsed && parsed.updates && Array.isArray(parsed.updates)) {
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
