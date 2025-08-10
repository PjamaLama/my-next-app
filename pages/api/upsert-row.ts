import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleSheetsClient } from '../../lib/googleSheets';
import { escapeSheetName, ensureSheetCapacity } from '../../lib/sheetUtils';
import { parseDateFlexible } from '../../lib/mapping';

type UpsertBody = {
  spreadsheetId: string;
  sheetName: string;
  key: { header: string; value: string };
  updates: Record<string, string | number>;
  createIfMissing?: boolean;
};

function indexToColumn(indexZeroBased: number): string {
  let n = indexZeroBased + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body as UpsertBody;
  const { spreadsheetId, sheetName, key, updates, createIfMissing = true } = body || {} as UpsertBody;

  if (!spreadsheetId || !sheetName || !key?.header || key.value == null || !updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Missing required fields: spreadsheetId, sheetName, key{header,value}, updates' });
  }

  try {
    const sheets = await getGoogleSheetsClient();
    const escaped = escapeSheetName(sheetName);
    const range = `${escaped}!A1:Z1000`;

    const getResp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const values = (getResp.data.values || []) as string[][];
    if (values.length === 0) {
      return res.status(400).json({ error: 'Sheet is empty; cannot upsert without headers' });
    }

    const headers = values[0];
    const headerIndex: Record<string, number> = {};
    headers.forEach((h, i) => (headerIndex[String(h).trim().toLowerCase()] = i));

    const keyIdx = headerIndex[String(key.header).trim().toLowerCase()];
    if (keyIdx == null) {
      return res.status(400).json({ error: `Key header not found: ${key.header}` });
    }

    // Find first matching row; handle dates flexibly
    const desiredKey = String(key.value).trim();
    const desiredKeyParsed = parseDateFlexible(desiredKey) || desiredKey;
    let targetRow = -1; // 1-based
    for (let r = 1; r < values.length; r++) {
      const raw = String((values[r] || [])[keyIdx] ?? '').trim();
      const rawParsed = parseDateFlexible(raw) || raw;
      if (rawParsed && desiredKeyParsed && String(rawParsed) === String(desiredKeyParsed)) {
        targetRow = r + 1;
        break;
      }
    }

    // If not found, optionally insert a new row
    if (targetRow < 0) {
      if (!createIfMissing) {
        return res.status(404).json({ error: 'No matching row found for key', key });
      }

      // Compute insertion row after last non-empty data row
      let lastDataRow = values.length;
      for (let i = values.length - 1; i >= 1; i--) {
        if ((values[i] || []).some(c => String(c || '').trim() !== '')) { lastDataRow = i + 1; break; }
      }
      targetRow = lastDataRow + 1;

      // Ensure capacity for the furthest target cell (key column)
      const keyColLetter = indexToColumn(keyIdx);
      await ensureSheetCapacity(spreadsheetId, sheetName, targetRow, keyColLetter);

      // Insert new row via batchUpdate (GridRange uses zero-based indexes)
      const metadata = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
      const targetSheet = metadata.data.sheets?.find(s => s.properties?.title === sheetName);
      const internalSheetId = targetSheet?.properties?.sheetId;
      if (internalSheetId == null) throw new Error(`Sheet ${sheetName} not found`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            insertRange: {
              range: { sheetId: internalSheetId, startRowIndex: targetRow - 1, endRowIndex: targetRow, startColumnIndex: 0, endColumnIndex: 0 },
              shiftDimension: 'ROWS'
            }
          }]
        }
      });

      // Set key cell value
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${escaped}!${keyColLetter}${targetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[key.value]] }
      });
    }

    // Build batch updates for provided headers
    const batchData = Object.entries(updates).map(([header, val]) => {
      const idx = headerIndex[String(header).trim().toLowerCase()];
      if (idx == null) return null;
      const colLetter = indexToColumn(idx);
      return { range: `${escaped}!${colLetter}${targetRow}`, values: [[val]] };
    }).filter(Boolean) as Array<{ range: string; values: any[][] }>;

    // Ensure capacity for the furthest column being updated
    if (batchData.length > 0) {
      const furthestCol = batchData
        .map(b => b.range.match(/!([A-Z]+)\d+$/)?.[1] || 'A')
        .reduce((m, c) => (c.length > m.length ? c : m), 'A');
      await ensureSheetCapacity(spreadsheetId, sheetName, targetRow, furthestCol);
    }

    if (batchData.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { data: batchData, valueInputOption: 'USER_ENTERED' }
      });
    }

    return res.status(200).json({ success: true, targetRow, updatedCells: batchData.length });
  } catch (error: any) {
    console.error('Error in upsert-row:', error);
    return res.status(500).json({ error: error?.message || 'Unknown error' });
  }
}


