import { genkit } from 'genkit';
import { z } from 'zod';
import { gemini15Flash, gemini15Pro, googleAI } from '@genkit-ai/googleai';
import { analyzeSheetStructure } from '../lib/sheetStructure';

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
    inputSchema: z.object({
      sheetName: z.string(),
      sheetCsv: z.string()
    }),
    outputSchema: z.object({
      headers: z.array(z.string()),
      rows: z.array(z.array(z.union([z.string(), z.number()])))
    })
  },
  async ({ sheetName, sheetCsv }: ConvertInput): Promise<ConvertOutput> => {
    // Basic CSV parsing (non-quoted values). If quoted CSV is present, the downstream
    // AI still receives the raw CSV block below, so imperfect parsing only affects profiling.
    const csvToRows = (csv: string): string[][] => {
      return csv
        .split(/\r?\n/)
        .map(line => line.split(',').map(v => v.trim()))
        .filter(r => r.length > 0);
    };

    const rows = csvToRows(sheetCsv);

    // Build a lightweight profile to help the model reason about structure
    const profile = (() => {
      let detectedHeaders: string[] = [];
      let width = 0;
      try {
        const meta = analyzeSheetStructure(rows);
        if (meta.detectedHeaders && meta.columnCount > 0) {
          detectedHeaders = meta.detectedHeaders;
          width = meta.columnCount;
        }
      } catch {}

      const sampleRows = rows.slice(1, Math.min(rows.length, 25));
      const maxCols = Math.max(width, ...rows.map(r => r.length));

      const isNumber = (s: string) => /^[-+]?\d{1,3}(?:[\s,]?\d{3})*(?:\.\d+)?$/.test(s.replace(/\s/g, ''));
      const isCurrency = (s: string) => /^[£$€R]\s?\d/.test(s) || /\d\s?(USD|ZAR|EUR|GBP)$/i.test(s);
      const isPercent = (s: string) => /^[-+]?\d+(?:\.\d+)?%$/.test(s.trim());
      const isDate = (s: string) => /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\-]\d{1,2}[\-]\d{1,2})\b/.test(s);

      const colProfiles = Array.from({ length: maxCols }, (_, colIdx) => {
        const values = sampleRows.map(r => String(r[colIdx] ?? '')).filter(v => v !== '');
        const counts: Record<string, number> = {};
        for (const v of values) counts[v] = (counts[v] || 0) + 1;
        const topValues = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([v, c]) => `${v} (${c})`);
        const typeGuess = (() => {
          const n = values.length;
          if (n === 0) return 'string';
          const numNum = values.filter(isNumber).length;
          const curNum = values.filter(isCurrency).length;
          const pctNum = values.filter(isPercent).length;
          const dateNum = values.filter(isDate).length;
          if (dateNum / n > 0.5) return 'date';
          if (pctNum / n > 0.5) return 'percent';
          if (curNum / n > 0.5) return 'currency';
          if (numNum / n > 0.6) return 'number';
          return 'string';
        })();
        return {
          index: colIdx,
          headerHint: detectedHeaders[colIdx] || '',
          typeGuess,
          examples: topValues,
        };
      });

      return { detectedHeaders, colProfiles };
    })();

    const profileText = `STRUCTURING PROFILE\n` +
      `Detected header candidates: ${profile.detectedHeaders.length > 0 ? JSON.stringify(profile.detectedHeaders) : 'none'}\n` +
      `Column profiles:\n` +
      profile.colProfiles
        .map(p => `- Col ${p.index + 1}${p.headerHint ? ` (hint: "${p.headerHint}")` : ''}: type=${p.typeGuess}; examples=[${p.examples.join(', ')}]`)
        .join('\n');

    const prompt = `You are converting a messy Google Sheet named "${sheetName}" into a clean tabular dataset.

Use the raw CSV content and the structuring profile to infer the best headers and align rows. Remove totals/notes, blank separators, and non-data lines. Prefer concise, human-friendly header names (Title Case, singular nouns). If existing header hints look valid, prefer them; otherwise propose clearer names. Keep column order consistent with the data.

${profileText}

RAW CSV (may include irregular rows, merged headers, notes):
${sheetCsv}

Return STRICT JSON only:
{
  "headers": ["Header A", "Header B", ...],
  "rows": [[valA, valB, ...], ...]
}
Rules:
- Choose clear, non-empty, unique headers (no duplicates). Title Case, no units in the header name.
- Remove totals/subtotals/summary rows (e.g., rows containing only a label like "Total" or aggregates).
- Remove notes or merged header spacer rows.
- If a column is often numeric/date/currency/percent, align values consistently but still output plain values.
- All rows must exactly match headers length. Pad missing cells with empty strings.
- Values are plain strings or numbers. Do not include markdown or explanations.`;

    // Try flash first, then pro
    const models = [aiConfigs[0].config, aiConfigs[1].config];
    let lastError: unknown = null;
    for (const m of models) {
      try {
        const { text } = await m.generate(prompt);
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


