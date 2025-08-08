import crypto from 'crypto';

export type RowObject = Record<string, string | number | null | undefined>;

export function stableRowKey(row: RowObject, headerFields: string[]): string {
  const keyFields = headerFields
    .map(h => String(row[h] ?? '').trim().toLowerCase())
    .join('|');
  return crypto.createHash('sha1').update(keyFields).digest('hex');
}

export function buildExistingKeySet(
  existingRows: string[][],
  headers: string[],
  keyHeaders: string[]
): Set<string> {
  const headerIndex: Record<string, number> = {};
  headers.forEach((h, i) => (headerIndex[h] = i));
  const keys = new Set<string>();
  for (let i = 1; i < existingRows.length; i++) {
    const row = existingRows[i];
    const obj: RowObject = {};
    keyHeaders.forEach(h => {
      const idx = headerIndex[h];
      obj[h] = idx != null ? row[idx] : '';
    });
    keys.add(stableRowKey(obj, keyHeaders));
  }
  return keys;
}

export function filterNewRows(
  candidateRows: Array<RowObject>,
  existingKeys: Set<string>,
  keyHeaders: string[]
): Array<RowObject> {
  const unique: Array<RowObject> = [];
  for (const row of candidateRows) {
    const key = stableRowKey(row, keyHeaders);
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      unique.push(row);
    }
  }
  return unique;
}


