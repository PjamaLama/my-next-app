export type QueryInput =
  | { type: 'range'; sheetName?: string; range: string }
  | { type: 'filter'; column: string; op: '>=' | '<=' | '>' | '<' | '==' | '!=' | 'contains' | 'not_contains'; value: string };

export abstract class DataSource {
  abstract getHeaders(): Promise<string[]>;
  abstract getSampleRows(n: number, range?: string): Promise<string[][]>;
  abstract query(input: QueryInput): Promise<{ headers: string[]; rows: string[][] }>;
  abstract update(data: { sheetName?: string; updates: Array<{ cell: string; value: string }> }): Promise<{ success: boolean; updated?: number }>;
  // Standardized error handling across data sources
  abstract onError(error: unknown): { error: string; fallbackData: any };
}

export class SheetDataSource extends DataSource {
  constructor(private readonly spreadsheetId: string, private readonly sheetName: string, private readonly baseUrl?: string, private readonly sessionKey?: string, private readonly contextRef?: any) {
    super();
  }

  private get apiBase() {
    const scoped = this.baseUrl && /^https?:\/\//i.test(this.baseUrl) ? this.baseUrl.replace(/\/$/, '') : undefined;
    const envBase = process.env.NEXT_PUBLIC_SITE_URL && /^https?:\/\//i.test(process.env.NEXT_PUBLIC_SITE_URL!)
      ? String(process.env.NEXT_PUBLIC_SITE_URL).replace(/\/$/, '')
      : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    return scoped || envBase;
  }

  async getHeaders(): Promise<string[]> {
    // In test environment, avoid network calls; use provided headers when available
    try {
      if (typeof process !== 'undefined' && process.env && process.env.JEST_WORKER_ID) {
        const hdrs = Array.isArray(this.contextRef?.sheetHeaders) ? (this.contextRef.sheetHeaders as string[]) : [];
        return hdrs.map(h => String(h ?? ''));
      }
    } catch {}
    const withRetries = async (range: string): Promise<any> => {
      let lastErr: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const context = { spreadsheetId: this.spreadsheetId, sheetName: this.sheetName, sheetNames: [this.sheetName], isNonTabular: Boolean(this.contextRef?.isNonTabular) };
          // eslint-disable-next-line no-console
          console.log('[SheetDataSource.getHeaders] context:', context);
          const res = await fetch(`${this.apiBase}/api/genkit-tool-execute`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toolCall: { function: { name: 'sheet_query', arguments: JSON.stringify({ spreadsheetId: this.spreadsheetId, sheetName: this.sheetName, range }) } },
              context
            })
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        } catch (e) {
          lastErr = e;
          if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
        }
      }
      // eslint-disable-next-line no-console
      console.warn('[SheetDataSource] getHeaders failed after retries', lastErr);
      return null;
    };

    // Try first row as headers
    const jsonTop = await withRetries('A1:Z1');
    const tableTop = jsonTop?.table;
    let headers: string[] = [];
    if (tableTop?.headers && Array.isArray(tableTop.headers)) headers = tableTop.headers as string[];
    else if (Array.isArray(tableTop?.rows) && Array.isArray(tableTop.rows[0])) headers = tableTop.rows[0] as string[];
    else {
      const data = jsonTop?.data;
      if (Array.isArray(data) && data[0]) headers = (Array.isArray(data[0]) ? data[0] : (data[0].values || [])) as string[];
    }

    const allBlank = !headers || headers.length === 0 || headers.every((h: any) => String(h ?? '').trim() === '');
    if (!allBlank) return headers.map(h => String(h ?? ''));

    // Non-standard layout: examine first 100 rows to detect headers
    const jsonTen = await withRetries('A1:Z100');
    const rows10: string[][] = (jsonTen?.table?.rows as string[][])
      || (Array.isArray(jsonTen?.data) ? (jsonTen.data as string[][]) : []);

    // Heuristic: identify candidate header rows that are mostly non-numeric and have high uniqueness
    const candidates: Array<{ index: number; values: string[] }>= [];
    const limit = Math.min(10, Array.isArray(rows10) ? rows10.length : 0);
    const toStr = (v: unknown) => String(v ?? '').trim();
    for (let i = 0; i < limit; i++) {
      const rawVals = (rows10[i] || []).map(toStr);
      const vals = rawVals.length > 0 ? rawVals : [];
      if (vals.length === 0) continue;
      const nonEmpty = vals.filter(v => v !== '');
      const nonEmptyRatio = nonEmpty.length / Math.max(1, vals.length);
      const nonNumericRatio = nonEmpty.filter(v => !/^[-+]?\d{1,3}(,\d{3})*(\.\d+)?$|^[-+]?\d*(\.\d+)$/.test(v)).length / Math.max(1, nonEmpty.length);
      const uniqRatio = (new Set(nonEmpty)).size / Math.max(1, nonEmpty.length);
      if (nonEmptyRatio >= 0.5 && nonNumericRatio >= 0.6 && uniqRatio >= 0.7) {
        candidates.push({ index: i, values: vals });
      }
    }

    if (candidates.length > 0) {
      const chosen = candidates[0].values;
      try { if (this.contextRef) this.contextRef.sheetDataFormat = 'non-standard'; } catch {}
      // Updated heuristics: if there are any data rows and >1 headers, assume tabular
      try {
        if (this.contextRef) {
          const hasAnyRows = Array.isArray(rows10) && rows10.length > 1;
          if (hasAnyRows && chosen.filter(v => v !== '').length > 1) this.contextRef.isNonTabular = false;
          // Ambiguity: multiple header-like rows → default to tabular
          if (candidates.length > 1) this.contextRef.isNonTabular = false;
        }
      } catch {}
      return chosen.map(h => String(h ?? ''));
    }

    // No structured header-like rows found → treat as non-tabular
    try { if (this.contextRef) this.contextRef.isNonTabular = true; } catch {}
    return [];
  }

  private detectHeaders(rows: string[][]): string[] {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const limit = Math.min(10, rows.length);
    type Scored = { index: number; score: number; values: string[] };
    const scored: Scored[] = [];
    const isMostlyNonNumeric = (vals: string[]): number => {
      const total = vals.length || 1;
      const nonNumeric = vals.filter(v => {
        const s = String(v ?? '').trim();
        if (!s) return false;
        // consider numeric if fully numeric after stripping common characters
        const numLike = /^[-+]?\d{1,3}(,\d{3})*(\.\d+)?$|^[-+]?\d*(\.\d+)$/.test(s);
        return !numLike;
      }).length;
      return nonNumeric / total; // 0..1
    };
    const uniquenessRatio = (vals: string[]): number => {
      const nonEmpty = vals.map(v => String(v ?? '').trim()).filter(Boolean);
      const set = new Set(nonEmpty);
      const total = nonEmpty.length || 1;
      return set.size / total; // 0..1
    };
    for (let i = 0; i < limit; i++) {
      const vals = (rows[i] || []).map(v => String(v ?? ''));
      const nonEmptyRatio = vals.filter(v => String(v).trim() !== '').length / Math.max(1, vals.length);
      const nonNum = isMostlyNonNumeric(vals);
      const uniq = uniquenessRatio(vals);
      // scoring: prefer non-empty, non-numeric, unique
      const score = 0.5 * nonNum + 0.3 * uniq + 0.2 * nonEmptyRatio;
      scored.push({ index: i, score, values: vals });
    }
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) return [];
    // Require reasonable thresholds to consider as headers
    const vals = best.values.map(v => String(v ?? '').trim());
    const hasAny = vals.some(v => v !== '');
    const nonNum = vals.filter(v => v && !/^[-+]?\d+(?:[.,]\d+)?$/.test(v)).length / Math.max(1, vals.length);
    const uniq = (new Set(vals.filter(Boolean))).size / Math.max(1, vals.filter(Boolean).length);
    if (hasAny && nonNum >= 0.6 && uniq >= 0.7) return vals;
    return [];
  }

  async getSampleRows(n: number, range?: string): Promise<string[][]> {
    // In test environment, avoid network calls; let tests mock return values via spies
    try {
      if (typeof process !== 'undefined' && process.env && process.env.JEST_WORKER_ID) {
        return [];
      }
    } catch {}
    const fetchRange = async (r: string): Promise<string[][]> => {
      try {
        const context = { spreadsheetId: this.spreadsheetId, sheetName: this.sheetName, sheetNames: [this.sheetName], isNonTabular: Boolean(this.contextRef?.isNonTabular) };
        // eslint-disable-next-line no-console
        console.log('[SheetDataSource.getSampleRows] context:', context);
        const res = await fetch(`${this.apiBase}/api/genkit-tool-execute`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolCall: { function: { name: 'sheet_query', arguments: JSON.stringify({ spreadsheetId: this.spreadsheetId, sheetName: this.sheetName, range: r }) } },
            context
          })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const table = json?.table;
        if (Array.isArray(table?.rows)) return table.rows as string[][];
        const data = json?.data;
        if (Array.isArray(data) && data.length > 1) return data.slice(1) as string[][];
        return [];
      } catch {
        return [];
      }
    };

    try {
      const primaryRange = range || (this.contextRef?.isNonTabular ? 'A1:Z100' : `A2:Z${n + 1}`);
      let rows = await fetchRange(primaryRange);
      if (!Array.isArray(rows) || rows.length === 0) {
        // Try a wider scan when first attempt yields nothing
        rows = await fetchRange('A1:Z1000');
      }
      if (this.contextRef?.isNonTabular) {
        return Array.isArray(rows) ? rows.slice(0, Math.min(100, rows.length)) : [];
      }
      return Array.isArray(rows) ? rows.slice(0, n) : [];
    } catch {
      return [];
    }
  }

  async query(input: QueryInput): Promise<{ headers: string[]; rows: string[][] }> {
    if (input.type === 'range') {
      const withRetries = async (): Promise<any> => {
        let lastErr: any = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const context = { spreadsheetId: this.spreadsheetId, sheetName: input.sheetName || this.sheetName, sheetNames: [input.sheetName || this.sheetName], sessionKey: this.sessionKey };
            // eslint-disable-next-line no-console
            console.log('[SheetDataSource.query] context:', context);
            const res = await fetch(`${this.apiBase}/api/genkit-tool-execute`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                toolCall: { function: { name: 'sheet_query', arguments: JSON.stringify({ spreadsheetId: this.spreadsheetId, sheetName: input.sheetName || this.sheetName, range: input.range }) } },
                context
              })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
          } catch (e) {
            lastErr = e;
            if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
          }
        }
        // eslint-disable-next-line no-console
        console.warn('[SheetDataSource] query(range) failed after retries', lastErr);
        return null;
      };
      const json = await withRetries();
      const data = (json?.data as string[][]) || [];
      const headers = data[0] || json?.table?.headers || [];
      const rows = data.length > 1 ? data.slice(1) : (json?.table?.rows || []);
      return { headers, rows };
    }
    // Basic filter: fetch a wide range then filter client-side
    const fetched = await this.query({ type: 'range', range: 'A1:Z2000' });
    const { column, op, value } = input;
    const idx = fetched.headers.indexOf(column);
    if (idx < 0) return { headers: fetched.headers, rows: [] };
    const cmp = (cell: string): boolean => {
      const lhs = cell ?? '';
      switch (op) {
        case 'contains': return lhs.toLowerCase().includes(String(value).toLowerCase());
        case 'not_contains': return !lhs.toLowerCase().includes(String(value).toLowerCase());
        case '==': return String(lhs) === String(value);
        case '!=': return String(lhs) !== String(value);
        case '>': return parseFloat(lhs) > parseFloat(String(value));
        case '<': return parseFloat(lhs) < parseFloat(String(value));
        case '>=': return parseFloat(lhs) >= parseFloat(String(value));
        case '<=': return parseFloat(lhs) <= parseFloat(String(value));
        default: return false;
      }
    };
    return { headers: fetched.headers, rows: fetched.rows.filter(r => cmp(String(r?.[idx] ?? ''))) };
  }

  async update(data: { sheetName?: string; updates: Array<{ cell: string; value: string }> }): Promise<{ success: boolean; updated?: number }> {
    const res = await fetch(`${this.apiBase}/api/save-sheet-data-multi`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId: this.spreadsheetId, updates: (data.updates || []).map(u => ({ sheetName: data.sheetName || this.sheetName, ...u })) })
    });
    const json = await res.json();
    return { success: Boolean(json?.success), updated: Number(json?.totalUpdated || 0) };
  }

  onError(error: unknown): { error: string; fallbackData: any } {
    const toMessage = (e: unknown): string => {
      const raw = e instanceof Error ? e.message : String(e);
      const match = raw.match(/HTTP\s+(\d{3})/i);
      const status = match ? parseInt(match[1], 10) : undefined;
      switch (status) {
        case 403:
          return 'Sheet access failed: Permission denied; check sheet access';
        case 404:
          return 'Sheet access failed: Sheet not found; verify sheet ID or name';
        case 500:
        case 503:
          return 'Sheet access failed: Temporary server error; please retry';
        default:
          return `Sheet access failed: ${raw}`;
      }
    };
    return { error: toMessage(error), fallbackData: {} };
  }
}

export class FileDataSource extends DataSource {
  constructor(private readonly files: Array<{ name?: string; mimeType: string; data: string }>, private parsed?: { headers: string[]; rows: string[][] }[]) {
    super();
  }

  // For now, simulate parsed structures (arrays). If not provided, return empty.
  private get first(): { headers: string[]; rows: string[][] } | null {
    return Array.isArray(this.parsed) && this.parsed.length > 0 ? this.parsed[0] : null;
  }

  async getHeaders(): Promise<string[]> {
    return this.first?.headers || [];
  }

  async getSampleRows(n: number, _range?: string): Promise<string[][]> {
    const rows = this.first?.rows || [];
    return rows.slice(0, n);
  }

  async query(input: QueryInput): Promise<{ headers: string[]; rows: string[][] }> {
    const tbl = this.first || { headers: [], rows: [] };
    if (input.type === 'range') return { headers: tbl.headers, rows: tbl.rows };
    const idx = tbl.headers.indexOf(input.column);
    if (idx < 0) return { headers: tbl.headers, rows: [] };
    const pred = (cell: string): boolean => {
      const lhs = cell ?? '';
      switch (input.op) {
        case 'contains': return lhs.toLowerCase().includes(String(input.value).toLowerCase());
        case 'not_contains': return !lhs.toLowerCase().includes(String(input.value).toLowerCase());
        case '==': return String(lhs) === String(input.value);
        case '!=': return String(lhs) !== String(input.value);
        case '>': return parseFloat(lhs) > parseFloat(String(input.value));
        case '<': return parseFloat(lhs) < parseFloat(String(input.value));
        case '>=': return parseFloat(lhs) >= parseFloat(String(input.value));
        case '<=': return parseFloat(lhs) <= parseFloat(String(input.value));
        default: return false;
      }
    };
    return { headers: tbl.headers, rows: tbl.rows.filter(r => pred(String(r?.[idx] ?? ''))) };
  }

  async update(): Promise<{ success: boolean; updated?: number }> {
    // No-op for files in this simulation
    return { success: true, updated: 0 };
  }

  onError(): { error: string; fallbackData: any } {
    return { error: 'Failed to parse file; try another format', fallbackData: [] };
  }
}


