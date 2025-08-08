type CachedHeaders = { headers: string[]; lastDataRow: number; ts: number };

const cache = new Map<string, CachedHeaders>();

export function getCacheKey(spreadsheetId: string, sheetName: string): string {
  return `${spreadsheetId}::${sheetName}`;
}

export function getCachedHeaders(spreadsheetId: string, sheetName: string, ttlMs: number = 60_000): CachedHeaders | null {
  const key = getCacheKey(spreadsheetId, sheetName);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) return null;
  return entry;
}

export function setCachedHeaders(spreadsheetId: string, sheetName: string, headers: string[], lastDataRow: number): void {
  const key = getCacheKey(spreadsheetId, sheetName);
  cache.set(key, { headers, lastDataRow, ts: Date.now() });
}


