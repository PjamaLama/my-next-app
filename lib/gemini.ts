export const sendToGemini = async ({ transcript, sheetData, sheetName }) => {
  const prompt = `You are assisting a user in updating a Google Sheet named "${sheetName}".
User's request:
${transcript}

Current sheet data (including headers and rows):
${sheetData.map(row => row.join(',')).join('\n')}

---
Your task:
1. Determine the **next available empty row**.
2. From the user's request and the existing sheet data:
   - Return a list of values you are confident about.
   - For fields you're not 100% confident about, suggest values based on the **most recent relevant row(s)** or **frequent historical patterns**.
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

### DO NOT:
- Use backticks (```), triple quotes ("""), or markdown.
- Return any explanation — just the JSON object.

### DO:
- Accurately detect the next available row.
- Match columns using **column headers**.
- Return exact `A1` cell references.
- Use previous rows to **guess likely values** for missing fields.
- If unsure, leave `suggested_value` as an empty string ("").

Return only clean and valid JSON — no extra text.`;

  const result = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_GEMINI_API_KEY}`,
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

  return JSON.parse(text.replace(/```json|```/g, '').trim());
}; 