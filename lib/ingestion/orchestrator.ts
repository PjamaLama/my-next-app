import { getGoogleSheetsClient } from '@/lib/googleSheets';
import { getCachedHeaders } from '@/lib/sheetHeaderCache';
import { suggestHeaderMapping, parseDateFlexible, parseDecimal } from '@/lib/mapping';
import { buildExistingKeySet, stableRowKey } from '@/lib/dedupe';
import { getSheetConfig } from '@/lib/sheetConfig';

type RowObject = Record<string, unknown>;

export type IngestResult = {
  success: boolean;
  inserts: number;
  updates: number;
  actions: Array<{ type: 'insertRow' | 'updateCell'; sheet: string; row: number; column?: string; value?: string }>
  preview?: Array<{ sheet: string; row: number; updates: Record<string, string> }>;
  deduped?: number;
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

function matchRowByConfig(headers: string[], rows: string[][], candidate: Record<string, string>, keySets?: Array<{ headers: string[]; fuzzy?: boolean }>): number {
  if (!Array.isArray(rows) || rows.length <= 1) return -1;
  if (!keySets || keySets.length === 0) return -1;
  const headerIndex: Record<string, number> = {};
  headers.forEach((h, i) => (headerIndex[h] = i));

  const scoreRow = (row: string[], keys: { headers: string[]; fuzzy?: boolean }): number => {
    let score = 0;
    for (const h of keys.headers) {
      const idx = headerIndex[h];
      const cand = candidate[h];
      const cur = idx != null ? row[idx] : '';
      if (!cand || !cur) continue;
      const lcA = String(cand).trim().toLowerCase();
      const lcB = String(cur).trim().toLowerCase();
      if (/date/i.test(h)) {
        const a = parseDateFlexible(cand) || lcA;
        const b = parseDateFlexible(cur) || lcB;
        if (a && b && a === b) score += 1.0;
      } else if (/amount|total|cost|price|incl/i.test(h)) {
        const a = parseDecimal(cand);
        const b = parseDecimal(cur);
        if (a != null && b != null && Math.abs(a - b) < 0.01) score += 0.6;
      } else if (keys.fuzzy) {
        if (lcA === lcB) score += 0.8;
        else if (lcA && lcB && (lcA.includes(lcB) || lcB.includes(lcA))) score += 0.4;
      } else {
        if (lcA === lcB) score += 1.0;
      }
    }
    return score;
  };

  let bestRow = -1; let bestScore = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    for (const ks of keySets) {
      const s = scoreRow(row, ks);
      if (s > bestScore) { bestScore = s; bestRow = r; }
    }
  }
  return bestScore >= 1.4 ? bestRow : -1;
}

function buildDefaultKeySets(headers: string[]): Array<{ headers: string[]; fuzzy?: boolean }> {
  const present = (h: string) => headers.includes(h);
  const sets: Array<{ headers: string[]; fuzzy?: boolean }> = [];
  const pairs: Array<[string, string]> = [
    ['Date', 'Reg#'],
    ['Date', 'Vehicle'],
    ['Date', 'Fuel Cost in Rands'],
  ];
  for (const [a, b] of pairs) {
    if (present(a) && present(b)) sets.push({ headers: [a, b], fuzzy: /Vehicle/i.test(b) });
  }
  return sets;
}

export async function ingestRows(params: {
  spreadsheetId: string;
  sheetNames: string[];
  rows: Array<RowObject>;
  dryRun?: boolean;
}): Promise<IngestResult> {
  const { spreadsheetId, sheetNames, rows, dryRun } = params;
  const sheets = await getGoogleSheetsClient();

  // Load headers and values for each target sheet
  const meta: Record<string, { headers: string[]; values: string[][]; nextRow: number } > = {};
  for (const sn of sheetNames) {
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sn}!A1:T2000` });
    const values = (resp.data.values || []) as string[][];
    const headers = (values[0] || []) as string[];
    const cached = getCachedHeaders(spreadsheetId, sn);
    const last = Math.max(1, (cached?.lastDataRow || (values.length > 1 ? values.length - 1 : 1)));
    meta[sn] = { headers, values, nextRow: last + 1 };
  }

  // Build a simple cross-sheet existing key index (idempotency)
  const defaultKeyCandidates = ['Date', 'Reg#', 'Vehicle', 'TOWN VISITED', 'Fuel in liters', 'Fuel Cost in Rands', 'Total Incl'];
  const keyHeaders: string[] = defaultKeyCandidates.filter(h => sheetNames.some(sn => meta[sn].headers.includes(h)));
  const existingKeys = new Set<string>();
  if (keyHeaders.length > 0) {
    for (const sn of sheetNames) {
      const { headers, values } = meta[sn];
      const usable = keyHeaders.every(h => headers.includes(h));
      if (!usable) continue;
      const set = buildExistingKeySet(values, headers, keyHeaders);
      set.forEach(k => existingKeys.add(k));
    }
  }

  const actions: Array<{ type: 'insertRow' | 'updateCell'; sheet: string; row: number; column?: string; value?: string }> = [];
  let inserts = 0, updates = 0, deduped = 0;

  for (const rowObj of rows) {
    const normalized = normalizeRowValues(rowObj);
    const incomingKeys = Object.keys(normalized);
    // Choose best target sheet by mapping coverage
    let bestSheet = sheetNames[0];
    let bestScore = -1;
    let bestMapped: Record<string, string> = {};
    for (const sn of sheetNames) {
      const { headers } = meta[sn];
      const suggestions = suggestHeaderMapping(incomingKeys, headers, getSheetConfig(spreadsheetId, sn)?.synonyms);
      const keyToHeader: Record<string, string> = {};
      let score = 0;
      suggestions.forEach(s => { if (s.targetHeader && s.confidence >= 0.5) { keyToHeader[s.incomingKey] = s.targetHeader; score += s.confidence; } });
      const mapped: Record<string, string> = {};
      headers.forEach(h => {
        let val: unknown = undefined;
        if (Object.prototype.hasOwnProperty.call(normalized, h)) val = (normalized as any)[h];
        else {
          const fromKey = Object.entries(keyToHeader).find(([, t]) => t === h)?.[0];
          if (fromKey) val = (normalized as any)[fromKey];
        }
        if (val != null && String(val).trim() !== '') mapped[h] = String(val);
      });
      const mappedCount = Object.keys(mapped).length;
      const finalScore = mappedCount >= 2 ? score + mappedCount * 0.1 : score * 0.5;
      if (finalScore > bestScore) { bestScore = finalScore; bestSheet = sn; bestMapped = mapped; }
    }

    const { headers, values } = meta[bestSheet];
    const conf = getSheetConfig(spreadsheetId, bestSheet) || undefined;

    // Idempotency: skip exact duplicate by key when possible
    let isDuplicate = false;
    if (keyHeaders.length > 0) {
      const keyObj: Record<string, string> = {};
      keyHeaders.forEach(h => { if (bestMapped[h] != null) keyObj[h] = String(bestMapped[h]); });
      const key = stableRowKey(keyObj, keyHeaders);
      if (existingKeys.has(key)) {
        isDuplicate = true;
        deduped++;
      }
    }

    const defaultKeySets = buildDefaultKeySets(headers);
    const matchIdx = isDuplicate ? (()=>{
      // Try to locate the actual target row by strict key equality for update
      const headerIndex: Record<string, number> = {}; headers.forEach((h,i)=>headerIndex[h]=i);
      const allKeyHeadersPresent = keyHeaders.every(h => headerIndex[h] != null);
      if (!allKeyHeadersPresent) return matchRowByConfig(headers, values, bestMapped, conf?.primaryKeys || defaultKeySets);
      let best = -1;
      for (let r=1; r<values.length; r++){
        const row = values[r] || [];
        let ok = true;
        for (const h of keyHeaders){
          const idx = headerIndex[h]!;
          const a = String(bestMapped[h] ?? '').trim();
          const b = String(row[idx] ?? '').trim();
          if (/date/i.test(h)) {
            const aa = parseDateFlexible(a) || a; const bb = parseDateFlexible(b) || b; if (aa !== bb) { ok = false; break; }
          } else if (/(amount|total|cost|price|incl)/i.test(h)) {
            const aa = parseDecimal(a); const bb = parseDecimal(b); if (!(aa != null && bb != null && Math.abs(aa - bb) < 0.01)) { ok = false; break; }
          } else if (a.toLowerCase() !== b.toLowerCase()) { ok = false; break; }
        }
        if (ok) { best = r; break; }
      }
      return best >= 0 ? best : matchRowByConfig(headers, values, bestMapped, conf?.primaryKeys || defaultKeySets);
    })() : matchRowByConfig(headers, values, bestMapped, conf?.primaryKeys || defaultKeySets);
    if (matchIdx >= 0) {
      const targetRow = matchIdx + 1;
      headers.forEach((h, idx) => {
        const val = bestMapped[h];
        if (val != null && String(val).trim() !== '') {
          actions.push({ type: 'updateCell', sheet: bestSheet, row: targetRow, column: toLetters(idx), value: String(val) });
          updates++;
        }
      });
    } else {
      const rowIndex = meta[bestSheet].nextRow++;
      actions.push({ type: 'insertRow', sheet: bestSheet, row: rowIndex });
      headers.forEach((h, idx) => {
        const val = bestMapped[h];
        if (val != null && String(val).trim() !== '') {
          actions.push({ type: 'updateCell', sheet: bestSheet, row: rowIndex, column: toLetters(idx), value: String(val) });
          inserts++;
        }
      });
    }
  }

  if (dryRun) {
    const previewMap = new Map<string, Map<number, Record<string, string>>>();
    for (const a of actions) {
      if (a.type !== 'updateCell') continue;
      const bySheet = previewMap.get(a.sheet) || new Map<number, Record<string, string>>();
      const obj = bySheet.get(a.row) || {};
      const idx = (a.column || 'A').split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
      const hdr = meta[a.sheet].headers[idx] || `Column ${idx + 1}`;
      obj[hdr] = String(a.value ?? '');
      bySheet.set(a.row, obj);
      previewMap.set(a.sheet, bySheet);
    }
    const preview: Array<{ sheet: string; row: number; updates: Record<string, string> }> = [];
    for (const [sn, map] of previewMap.entries()) {
      for (const [row, obj] of map.entries()) preview.push({ sheet: sn, row, updates: obj });
    }
    return { success: true, inserts, updates, actions, preview, deduped };
  }

  // Execute: inserts first per sheet, then updates via batch values API
  try {
    const sheetMetadata = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
    const groupedInserts: Record<string, number[]> = {};
    const groupedUpdates: Record<string, Array<{ cell: string; value: string }>> = {};
    for (const a of actions) {
      if (a.type === 'insertRow') {
        (groupedInserts[a.sheet] ||= []).push(a.row);
      } else {
        const cell = `${a.column}${a.row}`;
        (groupedUpdates[a.sheet] ||= []).push({ cell, value: String(a.value ?? '') });
      }
    }
    // Inserts
    for (const [sheetName, rowsToInsert] of Object.entries(groupedInserts)) {
      const target = sheetMetadata.data.sheets?.find(s => s.properties?.title === sheetName);
      if (!target?.properties?.sheetId) continue;
      const internalSheetId = target.properties.sheetId;
      const sorted = [...rowsToInsert].sort((a, b) => a - b);
      const requests = sorted.map(r => ({ insertRange: { range: { sheetId: internalSheetId, startRowIndex: r - 1, endRowIndex: r, startColumnIndex: 0, endColumnIndex: 0 }, shiftDimension: 'ROWS' } }));
      if (requests.length > 0) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    }
    // Updates
    for (const [sheetName, ups] of Object.entries(groupedUpdates)) {
      if (ups.length === 0) continue;
      const data = ups.map(u => ({ range: `${sheetName.includes(' ')? `'${sheetName.replace(/'/g, "''")}'`: sheetName}!${u.cell}`, values: [[u.value]] }));
      await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { data, valueInputOption: 'USER_ENTERED' } });
    }
  } catch (e) {
    return { success: false, inserts: 0, updates: 0, actions: [], details: e };
  }

  return { success: true, inserts, updates, actions, deduped };
}


