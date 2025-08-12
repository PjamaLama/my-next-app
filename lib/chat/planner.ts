import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';

export const plannerPrompt = (message: string, contextSummary: string = ''): string => `
You are a planner for a spreadsheet assistant. Input message: "${message}"
Context summary: ${contextSummary}

You MUST return ONLY valid JSON with the following fields:
{
  "intent": "get_data|add_data|aggregate|update_sheet|other",
  "clarifyQuestion": null | string,
  "targetColumn": string | null,
  "tools": Array<{ name: string; args: object }>
}

Strict rules:
- If the plan includes tool "aggregate", you MUST include "targetColumn" as either the exact header name to aggregate (string) or null.
- If you cannot confidently map a numeric target column from the context, set:
  - "clarifyQuestion": "Which column contains the sales amounts? Options: [col1, col2, ...]" (fill the options with the column headers you see),
  - "tools": [],
  - "targetColumn": null,
  - and set "intent" to "aggregate".
- Otherwise, when confident, include the aggregate tool and set both the plan-level "targetColumn" and the tool args consistently.
- Return ONLY the JSON object. Do not explain.

Short examples:

Example A (confident mapping):
{
  "intent": "aggregate",
  "clarifyQuestion": null,
  "targetColumn": "SALES MADE",
  "tools": [
    {
      "name": "aggregate",
      "args": {
        "groupBy": ["Month"],
        "metrics": [{ "col": "SALES MADE", "op": "sum" }],
        "targetColumn": "SALES MADE"
      }
    }
  ]
}

Example B (needs clarification):
{
  "intent": "aggregate",
  "clarifyQuestion": "Which column contains the sales amounts? Options: [Amount, Revenue, Sales, Total]",
  "targetColumn": null,
  "tools": []
}
`;

export async function generatePlan(message: string, contextSummary: string = ''): Promise<any> {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  const ai = genkit({ plugins: [googleAI({ apiKey })], model: gemini15Flash });
  const prompt = plannerPrompt(message, contextSummary);
  const { text } = await ai.generate(prompt);
  try {
    let cleaned = (text || '').trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch (e) {
    return {
      intent: 'get_data',
      clarifyQuestion: null,
      targetColumn: null,
      tools: [
        { name: 'sheet_query', args: { sheetName: (contextSummary as any)?.sheetName || 'Sheet1', range: 'A1:Z200', mode: 'topk' } }
      ]
    };
  }
}


