export const sendToGemini = async ({ transcript, sheetData, sheetName, geminiApiKey }: { transcript: string; sheetData: (string | number)[][]; sheetName: string; geminiApiKey: string }) => {
  const prompt = `You are assisting a user in updating a Google Sheet named "${sheetName}".

User's request:
${transcript}

Current sheet data (including headers and rows):
${sheetData.map((row: (string | number)[]) => row.join(',')).join('\n')}

---
Your task:
1. Determine the **next available empty row**.
2. From the user's request and the existing sheet data:
   - Return a list of values you are confident about.
   - For fields you're not 100% confident about, suggest values based on the **most recent relevant row(s)** or **frequent historical patterns**. The \`suggested_value\` field must always be present for each missing column, even if empty.
3. Output your result in this **EXACT JSON format**:

{
  "row_to_update": <next_available_row>,
  "cells_to_update": [
    { "column": "ColumnName1", "cell": "B42", "value": "Some value" },
    { "column": "ColumnName2", "cell": "F42", "value": "Another value" }
  ],
  "missing_columns": [
    { "column": "VAT", "cell": "L42", "suggested_value": "12.00" },
    { "column": "Grand Total", "cell": "M42", "suggested_value": "84.70" }
  ]
}

---
### DO NOT:
- Use backticks, triple quotes, or markdown.
- Return any explanation — just the JSON object.

### DO:
- Accurately detect the next available row.
- Match columns using column headers.
- Return exact A1 cell references.
- Use previous rows to guess likely values for missing fields.
- Always include \`suggested_value\` for each missing column, even if it's an empty string ('').

Return only clean and valid JSON — no extra text.`;

  console.log("Prompt sent to Gemini:", prompt);
  console.log("Sheet data sent to Gemini:", sheetData);

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
  console.log("Full Gemini API response:", JSON.stringify(json, null, 2));

  // Remove any backticks or markdown, just in case
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}; 