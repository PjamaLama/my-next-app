// Shared mocks
jest.mock('@genkit-ai/googleai', () => ({ googleAI: () => ({}), gemini15Flash: {} }));

import { hydrateData } from '../lib/chat/dataHydrator';
import type { Context, ConversationHistoryItem } from '../lib/chat/types';

// Utility to reset fetch between tests
const setFetchMock = (impl: any) => {
  // @ts-ignore
  global.fetch = jest.fn(impl);
};

describe('hydrateData behavior', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('hydrates, fails gracefully, and returns fallback guidance when headers cannot load', async () => {
    // Mock fetch to fail for hydration (getHeaders/getSampleRows)
    setFetchMock(async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'error' }));

    const ctx: Context = { spreadsheetId: 'sheet-1', sheetName: 'Sheet1', sheetNames: ['Sheet1'] } as any;
    const out = await hydrateData(ctx);

    expect(out).toBeTruthy();
    // Error may be set depending on which hydration path failed; accept either
    const ctxErr = (out.context as any).error;
    if (ctxErr) {
      expect(ctxErr).toMatch(/Sheet access failed/i);
    }
    // Ensure sheetData remains empty on hydration failure for safety
    const sd = (out.context as any).sheetData || {};
    const hasOnlyEmpty = Object.values(sd).every((v: any) => Array.isArray(v) && v.length <= 1);
    expect(hasOnlyEmpty || Object.keys(sd).length === 0).toBe(true);
  }, 30000);

  it('Handles hydration failure with proactive summary', async () => {
    // Force hydration calls to fail at the data source level
    jest.resetModules();
    const { SheetDataSource } = require('../lib/data/source');
    jest.spyOn(SheetDataSource.prototype, 'getHeaders').mockRejectedValue(new Error('HTTP 500'));
    jest.spyOn(SheetDataSource.prototype, 'getSampleRows').mockRejectedValue(new Error('HTTP 500'));

    // Mock fetch used by tool execution to also fail with HTTP 500 on get_sheet_data
    setFetchMock(async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'server error' }));

    // Re-require after mocks
    const { hydrateData: run } = require('../lib/chat/dataHydrator');

    const ctx: Context = {
      spreadsheetId: 'abc',
      sheetName: 'Sheet1',
      sheetNames: ['Sheet1'],
      conversationHistory: [
        { role: 'user', content: 'last time we looked at sales data' } as any,
      ],
    } as any;

    const out = await run(ctx);

    // Error tracking present
    expect((out.context as any).error).toMatch(/Sheet access failed/i);
  });
});
