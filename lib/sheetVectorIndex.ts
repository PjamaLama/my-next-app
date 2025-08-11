import { embedTexts } from './embeddings';

export type HeaderVector = {
  header: string;
  vector: number[];
  examples: string[];
  ts: number;
};

const headerIndex = new Map<string, HeaderVector[]>(); // key = spreadsheetId::sheetName

export function getKey(spreadsheetId: string, sheetName: string): string {
  return `${spreadsheetId}::${sheetName}`;
}

export function getHeaderVectors(spreadsheetId: string, sheetName: string): HeaderVector[] | null {
  return headerIndex.get(getKey(spreadsheetId, sheetName)) || null;
}

export async function ensureHeaderVectors(
  spreadsheetId: string,
  sheetName: string,
  headers: string[],
  rows: string[][],
  opts: { rebuild?: boolean; maxExamplesPerCol?: number } = {}
): Promise<HeaderVector[]> {
  const key = getKey(spreadsheetId, sheetName);
  const existing = headerIndex.get(key);
  if (existing && !opts.rebuild) return existing;

  const maxExamples = opts.maxExamplesPerCol ?? 5;
  const columnExamples = headers.map((_, col) => {
    const values = rows.map(r => String((r || [])[col] ?? ''))
      .filter(v => v.trim() !== '')
      .slice(-50);
    // pick representative examples by uniqueness
    const uniq = Array.from(new Set(values));
    return uniq.slice(0, maxExamples);
  });

  const texts = headers.map((h, i) => {
    const examples = columnExamples[i];
    const examplesBlock = examples.length > 0 ? `\nExamples:\n- ${examples.join('\n- ')}` : '';
    return `Column: ${String(h)}${examplesBlock}`;
  });

  const vectors = await embedTexts(texts);
  const result: HeaderVector[] = headers.map((h, i) => ({
    header: h,
    vector: vectors[i] || [],
    examples: columnExamples[i],
    ts: Date.now(),
  }));

  headerIndex.set(key, result);
  return result;
}


