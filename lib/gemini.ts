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

  const prompt = `
You are helping update a Google Sheet named "${sheetName}".

User's request:
${transcript}

Current sheet data (including headers and rows):
${sheetData.map((row) => row.join(',')).join('\n')}

---
Your task:
1. Determine the **next available empty row**.
2. Based on the user's request and the existing sheet data:
   - Identify confident values.
   - For uncertain fields, use the most recent or frequent historical patterns to suggest a value.
3. Output your response using this **EXACT JSON format**:

{
  "row_to_update": ${nextRow},
  "cells_to_update": [
    { "column": "ColumnName1", "cell": "B${nextRow}", "value": "Some value" },
    { "column": "ColumnName2", "cell": "F${nextRow}", "value": "Another value" }
  ],
  "missing_columns": [
    { "column": "VAT", "cell": "L${nextRow}", "suggested_value": "12.00" },
    { "column": "Grand Total", "cell": "M${nextRow}", "suggested_value": "84.70" }
  ]
}

---
### RULES:
- DO NOT use backticks (\`\`\`), triple quotes, or markdown.
- DO NOT include any explanation — only return the raw JSON object.
- DO match columns using headers and provide exact A1 cell references.
- DO suggest values using prior patterns. If unsure, leave "suggested_value" as an empty string "".
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
    return parsed;
  } catch (error) {
    console.error("Failed to parse Gemini response as JSON:", error);
    return null;
  }
};
