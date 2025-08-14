import { getGoogleSheetsClient } from '@/lib/googleSheets';
import { escapeSheetName } from '@/lib/sheetUtils';

type RowObject = Record<string, unknown>;

export type IngestResult = {
  success: boolean;
  inserts: number;
  updates: number;
  actions: Array<{ type: 'insertRow' | 'updateCell'; sheet: string; row: number; column?: string; value?: string }>
  preview?: Array<{ sheet: string; row: number; updates: Record<string, string> }>;
  details?: unknown;
};

function toLetters(indexZeroBased: number): string {
  let n = indexZeroBased + 1; let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function normalizeRowValues(obj: RowObject): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const s = String(v);
    out[k] = s;
  }
  return out;
}

// Removed: cross-sheet matching, dedupe, and heuristic key sets.

export async function ingestRows(params: {
  spreadsheetId: string;
  sheetNames: string[];
  rows: Array<RowObject>;
  dryRun?: boolean;
}): Promise<IngestResult> {
  const { spreadsheetId, sheetNames, rows, dryRun } = params;
  const sheets = await getGoogleSheetsClient();

  if (!sheetNames || sheetNames.length === 0) {
    return { success: false, inserts: 0, updates: 0, actions: [], details: 'sheetNames is required' };
  }

  const targetSheet = sheetNames[0];
  const escapedName = escapeSheetName(targetSheet);

  // Load headers from the target sheet (exact-match only)
  const headerResp = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${escapedName}!A1:Z1` });
  const headers = ((headerResp.data.values?.[0] as string[]) || []).map(h => String(h));

  if (headers.length === 0) {
    return { success: false, inserts: 0, updates: 0, actions: [], details: `No headers found in sheet ${targetSheet}` };
  }

  // Prepare row arrays aligned to headers (exact header names only)
  const normalizedRows = rows.map(normalizeRowValues);
  const valuesToAppend: string[][] = normalizedRows.map(obj => headers.map(h => (obj[h] ?? '')));

  // Dry run: estimate next row and return a preview of appended rows
  if (dryRun) {
    let nextRow = 2;
    try {
      const countResp = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${escapedName}!A:A` });
      const count = Array.isArray(countResp.data.values) ? countResp.data.values.length : 1;
      nextRow = Math.max(2, count + 1);
    } catch {}

    const actions: Array<{ type: 'insertRow' | 'updateCell'; sheet: string; row: number; column?: string; value?: string }> = [];
    const preview: Array<{ sheet: string; row: number; updates: Record<string, string> }> = [];
    valuesToAppend.forEach((rowVals, i) => {
      const rowIndex = nextRow + i;
      const updatesObj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        const v = rowVals[idx];
        if (v !== '') {
          updatesObj[h] = String(v);
          actions.push({ type: 'updateCell', sheet: targetSheet, row: rowIndex, column: toLetters(idx), value: String(v) });
        }
      });
      preview.push({ sheet: targetSheet, row: rowIndex, updates: updatesObj });
    });
    return { success: true, inserts: valuesToAppend.length, updates: 0, actions, preview };
  }

  // Execute via native append (no manual row index management)
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${escapedName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: valuesToAppend },
    });
    return { success: true, inserts: valuesToAppend.length, updates: 0, actions: [] };
  } catch (e) {
    return { success: false, inserts: 0, updates: 0, actions: [], details: e };
  }
}


