import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';

export const plannerPrompt = (message: string, contextSummary: string = ''): string => `
You are a planner for a spreadsheet assistant. Input message: "${message}"
Context summary: ${contextSummary}

Return ONLY valid JSON with the following fields:
{
  "intent": "get_data|add_data|aggregate|update_sheet|other",
  "clarifyQuestion": null or "string",
  "tools": [
     { "name":"sheet_query","args": { "sheetName":"Sheet1","range": "A1:Z200", "mode": "topk|full|tail" } },
     { "name":"aggregate","args": { "groupBy":["Category"], "metrics":[{"col":"Amount","op":"sum"}], "filter": {"col":"Date","op":">=","value":"2025-01-01"} } }
  ]
}
Make decisions conservatively: if user is ambiguous return a clarifyQuestion.
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
      tools: [
        { name: 'sheet_query', args: { sheetName: (contextSummary as any)?.sheetName || 'Sheet1', range: 'A1:Z200', mode: 'topk' } }
      ]
    };
  }
}


