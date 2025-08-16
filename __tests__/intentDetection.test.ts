// Shared mocks
jest.mock('@genkit-ai/googleai', () => ({ googleAI: () => ({}), gemini15Flash: {} }));

import { detectUserIntent } from '../lib/chat/intentDetection';
import type { Context, ConversationHistoryItem } from '../lib/chat/types';

// Utility to reset fetch between tests
const setFetchMock = (impl: any) => {
  // @ts-ignore
  global.fetch = jest.fn(impl);
};

describe('detectUserIntent behavior', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('clarifies aggregate without column: with headers shows options; without headers shows access error guidance', async () => {
    // Case A: headers present → suggest options
    setFetchMock(async () => ({ ok: true, status: 200, json: async () => ({ success: true }), text: async () => '' }));

    // Mock planner to request clarification explicitly
    jest.doMock('../lib/chat/planner', () => ({
      generatePlan: async () => ({ intent: 'aggregate', targetColumn: null, tools: [], toolChain: [], clarifyQuestion: 'Which column contains the amounts? Options: [Sales, Region]' }),
    }));
    let { detectUserIntent: run } = require('../lib/chat/intentDetection');
    let ctx: Context = { spreadsheetId: 'abc', sheetName: 'Sheet1', sheetNames: ['Sheet1'], sheetHeaders: ['Sales', 'Region'] } as any;
    let out = await run('sum by region', ctx, [], []);
    expect(out.response).toMatch(/Which column/i);
    expect(out.response).toMatch(/Sales, Region/);

    // Case B: no headers and access error → generic guidance
    jest.resetModules();
    // Fail hydration
    setFetchMock(async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'error' }));
    jest.doMock('../lib/chat/planner', () => ({
      generatePlan: async () => ({ intent: 'aggregate', targetColumn: null, tools: [], toolChain: [], clarifyQuestion: 'I couldn’t load column headers—please check your sheet connection or specify a column manually.' }),
    }));
    ;({ detectUserIntent: run } = require('../lib/chat/intentDetection'));
    ctx = { spreadsheetId: 'abc', sheetName: 'Sheet1', sheetNames: ['Sheet1'] } as any;
    out = await run('sum by region', ctx, [], []);
    expect(out.response).toMatch(/couldn’t load column headers/i);
  });

  it('provides proactive fallback with history inference on hydration failure', async () => {
    jest.resetModules();
    const { SheetDataSource } = require('../lib/data/source');
    jest.spyOn(SheetDataSource.prototype, 'getHeaders').mockRejectedValue(new Error('HTTP 500'));
    jest.spyOn(SheetDataSource.prototype, 'getSampleRows').mockRejectedValue(new Error('HTTP 500'));
    setFetchMock(async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'server error' }));
    jest.doMock('../lib/chat/planner', () => ({ generatePlan: async () => ({ intent: 'other', tools: [], toolChain: [] }) }));
    const { detectUserIntent: run } = require('../lib/chat/intentDetection');
    const ctx: any = { spreadsheetId: 'sheet-1', conversationHistory: [{ role: 'user', content: 'track fuel weekly totals' }] };
    const out = await run('overview please', ctx, [], []);
    expect(out.response).toMatch(/tried accessing your sheet|haven't loaded your sheet|couldn’t load your sheet data|Sheet access failed/i);
    expect(out.response.toLowerCase()).toMatch(/fuel|weekly/);
    const qr = (out.quickReplies as string[]).join(' | ');
    expect(qr).toMatch(/Try accessing sheet again/);
    expect(qr).toMatch(/Specify sheet name/);
  });

  it('reports hydration 404 with actionable quick replies for sheet "Logbook"', async () => {
    jest.resetModules();
    const { SheetDataSource } = require('../lib/data/source');
    jest.spyOn(SheetDataSource.prototype, 'getHeaders').mockRejectedValue(new Error('404 Not Found'));
    jest.spyOn(SheetDataSource.prototype, 'getSampleRows').mockRejectedValue(new Error('404 Not Found'));
    setFetchMock(async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => 'not found' }));

    jest.doMock('../lib/chat/planner', () => ({ generatePlan: async () => ({ intent: 'other', tools: [], toolChain: [] }) }));

    const { detectUserIntent: run } = require('../lib/chat/intentDetection');
    const ctx: any = { spreadsheetId: 'abc', sheetName: 'Logbook', sheetNames: ['Logbook'] };
    const out = await run('show data', ctx, [], []);
    expect(typeof out.response).toBe('string');
    expect(out.response).toMatch(/couldn’t (access your sheet|load your sheet data)|Failed to load sheet/i);
    expect(out.response).toMatch(/Logbook/i);
    expect(Array.isArray(out.quickReplies)).toBe(true);
    const qr = (out.quickReplies as string[]).join(' | ');
    expect(qr).toMatch(/Upload file|Specify sheet|Try accessing sheet again/i);
  });

  it("when cache empty and server 404, reports 'tab not found' with quick replies", async () => {
    jest.resetModules();
    const { SheetDataSource } = require('../lib/data/source');
    jest.spyOn(SheetDataSource.prototype, 'getHeaders').mockRejectedValue(new Error('404 Not Found'));
    jest.spyOn(SheetDataSource.prototype, 'getSampleRows').mockRejectedValue(new Error('404 Not Found'));
    setFetchMock(async () => ({ ok: false, status: 404, json: async () => ({ success: false }), text: async () => 'not found' }));

    jest.doMock('../lib/chat/planner', () => ({ generatePlan: async () => ({ intent: 'describe_data', tools: [{ name: 'describe_sheet', args: {} }], toolChain: [], clarifyQuestion: null }) }));
    jest.doMock('../lib/chat/toolExecution', () => ({ executeToolCall: async () => ({ success: false, error: 'HTTP 404' }) }));

    const { detectUserIntent: run } = require('../lib/chat/intentDetection');
    const ctx: any = { spreadsheetId: 'abc', sheetName: 'Fuel Weekly Repo', sheetNames: ['Fuel Weekly Repo'] };
    const out = await run('tell me about my data', ctx, [], []);
    expect(out.response.toLowerCase()).toMatch(/tab not found|404|not found/);
    expect(Array.isArray(out.quickReplies)).toBe(true);
    expect((out.quickReplies as any[]).length).toBeGreaterThan(0);
  });

  it("when cache empty and server 400, reports 'invalid sheet configuration' with quick replies", async () => {
    jest.resetModules();
    const { SheetDataSource } = require('../lib/data/source');
    jest.spyOn(SheetDataSource.prototype, 'getHeaders').mockRejectedValue(new Error('HTTP 400'));
    jest.spyOn(SheetDataSource.prototype, 'getSampleRows').mockRejectedValue(new Error('HTTP 400'));
    // Mock internal fetch used by sheet_query to return 400
    setFetchMock(async () => ({ ok: false, status: 400, json: async () => ({ success: false }), text: async () => 'bad request' }));

    // Keep planner simple
    jest.doMock('../lib/chat/planner', () => ({ generatePlan: async () => ({ intent: 'describe_data', tools: [], toolChain: [], clarifyQuestion: null }) }));

    const { detectUserIntent: run } = require('../lib/chat/intentDetection');
    const ctx: any = { spreadsheetId: 'abc', sheetName: 'Fuel Weekly Repo', sheetNames: ['Fuel Weekly Repo'] };
    const out = await run('tell me about my data', ctx, [], []);

    expect(typeof out.response).toBe('string');
    expect(out.response.toLowerCase()).toMatch(/invalid sheet configuration|400|couldn’t load data/i);
    // Quick replies should propose checking the tab and retry
    expect(Array.isArray(out.quickReplies)).toBe(true);
    const labels = (out.quickReplies as any[]).map((q: any) => (q?.text || q)).join(' | ');
    expect(labels).toMatch(/Check tab/i);
    expect(labels).toMatch(/Retry/i);
  });

  it('reports 404 clearly with quick replies', async () => {
    jest.resetModules();
    const { SheetDataSource } = require('../lib/data/source');
    jest.spyOn(SheetDataSource.prototype, 'getHeaders').mockRejectedValue(new Error('404 Not Found'));
    jest.spyOn(SheetDataSource.prototype, 'getSampleRows').mockRejectedValue(new Error('404 Not Found'));
    setFetchMock(async () => ({ ok: false, status: 404, json: async () => ({ success: false, error: 'HTTP 404', message: 'Sheet not found' }), text: async () => 'not found' }));

    jest.doMock('../lib/chat/planner', () => ({ generatePlan: async () => ({ intent: 'other', tools: [], toolChain: [] }) }));

    const { detectUserIntent: run } = require('../lib/chat/intentDetection');
    const ctx: any = { spreadsheetId: 'abc', sheetName: 'MissingTab', sheetNames: ['MissingTab'] };
    const out = await run('show overview', ctx, [], []);

    expect(out.response).toMatch(/not found/i);
    expect(Array.isArray(out.quickReplies)).toBe(true);
    const qr = (out.quickReplies as string[]).join(' | ');
    expect(qr).toMatch(/Specify sheet name/i);
    expect(qr).toMatch(/Upload file/i);
  });
});
