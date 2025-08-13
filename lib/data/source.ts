export type QueryInput =
  | { type: 'range'; sheetName?: string; range: string }
  | { type: 'filter'; column: string; op: '>=' | '<=' | '>' | '<' | '==' | '!=' | 'contains' | 'not_contains'; value: string };

export abstract class DataSource {
  abstract getHeaders(): Promise<string[]>;
  abstract getSampleRows(n: number): Promise<string[][]>;
  abstract query(input: QueryInput): Promise<{ headers: string[]; rows: string[][] }>;
  abstract update(data: { sheetName?: string; updates: Array<{ cell: string; value: string }> }): Promise<{ success: boolean; updated?: number }>;
}

export class SheetDataSource extends DataSource {
  constructor(private readonly spreadsheetId: string, private readonly sheetName: string, private readonly baseUrl?: string, private readonly sessionKey?: string) {
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
    const withRetries = async (): Promise<any> => {
      let lastErr: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(`${this.apiBase}/api/genkit-tool-execute`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toolCall: { function: { name: 'sheet_query', arguments: JSON.stringify({ spreadsheetId: this.spreadsheetId, sheetName: this.sheetName, range: 'A1:Z1' }) } },
              context: { spreadsheetId: this.spreadsheetId, sheetName: this.sheetName }
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

    const json = await withRetries();
    const table = json?.table;
    if (table?.headers && Array.isArray(table.headers)) return table.headers as string[];
    if (Array.isArray(table?.rows) && Array.isArray(table.rows[0])) return table.rows[0] as string[];
    const data = json?.data;
    if (Array.isArray(data) && data[0]) return (Array.isArray(data[0]) ? data[0] : (data[0].values || [])) as string[];
    return [];
  }

  async getSampleRows(n: number): Promise<string[][]> {
    const withRetries = async (): Promise<any> => {
      let lastErr: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(`${this.apiBase}/api/genkit-tool-execute`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toolCall: { function: { name: 'sheet_query', arguments: JSON.stringify({ spreadsheetId: this.spreadsheetId, sheetName: this.sheetName, range: `A2:Z${Math.max(2 + n, 50)}` }) } },
              context: { spreadsheetId: this.spreadsheetId, sheetName: this.sheetName }
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
      console.warn('[SheetDataSource] getSampleRows failed after retries', lastErr);
      return null;
    };

    const json = await withRetries();
    const table = json?.table;
    if (Array.isArray(table?.rows)) return table.rows as string[][];
    const data = json?.data;
    if (Array.isArray(data) && data.length > 1) return data.slice(1) as string[][];
    return [];
  }

  async query(input: QueryInput): Promise<{ headers: string[]; rows: string[][] }> {
    if (input.type === 'range') {
      const withRetries = async (): Promise<any> => {
        let lastErr: any = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const res = await fetch(`${this.apiBase}/api/genkit-tool-execute`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                toolCall: { function: { name: 'sheet_query', arguments: JSON.stringify({ spreadsheetId: this.spreadsheetId, sheetName: input.sheetName || this.sheetName, range: input.range }) } },
                context: { spreadsheetId: this.spreadsheetId, sheetName: input.sheetName || this.sheetName, sessionKey: this.sessionKey }
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

  async getSampleRows(n: number): Promise<string[][]> {
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
}


