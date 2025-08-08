import { genkit } from 'genkit';
import { gemini15Flash, gemini15Pro, googleAI } from '@genkit-ai/googleai';

const aiConfigs = [
  {
    name: 'gemini-1.5-flash',
    config: genkit({ plugins: [googleAI()], model: gemini15Flash })
  },
  {
    name: 'gemini-1.5-pro',
    config: genkit({ plugins: [googleAI()], model: gemini15Pro })
  }
];

interface ConvertInput {
  sheetName: string;
  sheetCsv: string; // comma-separated rows joined by \n
}

export interface ConvertOutput {
  headers: string[];
  rows: Array<Array<string | number>>;
}

export const convertSheetFlow = aiConfigs[0].config.defineFlow(
  {
    name: 'convertSheetFlow',
    inputSchema: (z) =>
      z.object({
        sheetName: z.string(),
        sheetCsv: z.string()
      }),
    outputSchema: (z) =>
      z.object({
        headers: z.array(z.string()),
        rows: z.array(z.array(z.union([z.string(), z.number()])))
      })
  },
  async ({ sheetName, sheetCsv }: ConvertInput): Promise<ConvertOutput> => {
    const prompt = `You are converting a messy Google Sheet named "${sheetName}" into a clean tabular dataset.

The following is the raw sheet content as CSV lines (may have irregular rows, no headers, merged cells, etc.). Infer the best tabular structure:

${sheetCsv}

Return STRICT JSON with keys:
{
  "headers": ["Header A", "Header B", ...],
  "rows": [[valA, valB, ...], ...]
}
Rules:
- Pick clear, concise header names.
- Remove totals/notes/blank rows.
- Ensure all rows align to the headers length (pad with empty strings if needed).
- Use plain strings or numbers. Do not include markdown or explanations.`;

    // Try flash first, then pro
    const models = [aiConfigs[0].config, aiConfigs[1].config];
    let lastError: unknown = null;
    for (const m of models) {
      try {
        const { text } = await m.generateText(prompt);
        const cleaned = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (
          parsed &&
          Array.isArray(parsed.headers) &&
          Array.isArray(parsed.rows)
        ) {
          // Normalize rows width
          const width = parsed.headers.length;
          const rows = parsed.rows.map((r: any[]) => {
            const row = Array.isArray(r) ? r.slice(0, width) : [];
            while (row.length < width) row.push('');
            return row;
          });
          return { headers: parsed.headers, rows };
        }
      } catch (err) {
        lastError = err;
      }
    }
    console.error('convertSheetFlow failed to parse model output', lastError);
    return { headers: [], rows: [] };
  }
);


