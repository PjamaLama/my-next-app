import http from 'http';
import { AddressInfo } from 'net';
import fetch from 'node-fetch';

// Minimal bootstrap of the Next API handler under test by importing and wiring to a local server
// We simulate the Google Sheets client and the required imports via jest mocks.

jest.mock('../lib/googleSheets', () => ({
  getGoogleSheetsClient: async () => ({
    spreadsheets: {
      values: {
        get: async () => ({
          data: {
            values: [
              ['Date', 'SALES MADE', 'Region'],
              ['2024-01-01', 'R10,000.00', 'North'],
              ['2024-01-02', '2,500.50', 'East'],
              ['2024-01-03', 'abc', 'West'],
              ['2024-01-04', '$1,234', 'South'],
            ],
          },
        }),
      },
    },
  }),
}));

// Patch module path used in the handler
jest.mock('../lib/utils/normalizeNumber', () => require('../lib/utils/normalizeNumber'));
jest.mock('../lib/sheets/columnTypeInfer', () => require('../lib/sheets/columnTypeInfer'));
jest.mock('../lib/analytics/simpleAnalytics', () => require('../lib/analytics/simpleAnalytics'));

describe('aggregate handler end-to-end', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const handler = require('../pages/api/genkit-tool-execute').default;
    server = http.createServer((req, res) => {
      if (!req.url || req.method !== 'POST') { res.statusCode = 404; return res.end(); }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        const url = new URL(req.url!, 'http://localhost');
        if (url.pathname !== '/api/genkit-tool-execute') { res.statusCode = 404; return res.end(); }
        try {
          const json = JSON.parse(body || '{}');
          // Build minimal req/res mocks
          const mockReq: any = { method: 'POST', body: json };
          const chunks: any[] = [];
          const mockRes: any = {
            status: (code: number) => { (mockRes as any).statusCode = code; return mockRes; },
            json: (obj: any) => { res.statusCode = (mockRes as any).statusCode || 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); },
          };
          await handler(mockReq, mockRes);
        } catch (e) {
          res.statusCode = 500; res.end(String(e));
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('auto-picks numeric column, aggregates and returns provenance', async () => {
    const resp = await fetch(`${baseUrl}/api/genkit-tool-execute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'aggregate',
        args: { sheetName: 'Sheet1', range: 'A1:C10', spec: { groupBy: ['Region'], metrics: [{ op: 'sum' }] } },
        context: { spreadsheetId: 'abc', sheetNames: ['Sheet1'] },
      }),
    });
    expect(resp.status).toBe(200);
    const json: any = await resp.json();
    expect(json.success).toBe(true);
    // Sum: 10000 + 2500.50 + 1234 = 13734.5
    expect(json.numeric?.sum).toBeCloseTo(13734.5, 6);
    expect(json.provenance).toBeDefined();
    expect(json.provenance.parsedCount).toBeGreaterThan(0);
    expect(Array.isArray(json.provenanceRows)).toBe(true);
    expect(json.provenanceRows.length).toBeGreaterThan(0);
    expect(json.provenanceRows[0]).toHaveProperty('rowIndex');
    expect(json.provenanceRows[0]).toHaveProperty('values');
    expect(json.provenanceRows[0]).toHaveProperty('parsedValue');
  });
});


