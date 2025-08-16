// Shared mocks
jest.mock('@genkit-ai/googleai', () => ({ googleAI: () => ({}), gemini15Flash: {} }));


import { buildUserResponse } from '../lib/chat/responseBuilder';
import type { Context, ConversationHistoryItem } from '../lib/chat/types';

// Utility to reset fetch between tests
const setFetchMock = (impl: any) => {
  // @ts-ignore
  global.fetch = jest.fn(impl);
};

describe('responseBuilder behavior', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('summarizes when asked "tell me about my sheet data" with hydrated sample', async () => {
    // Simulate hydration success
    const { SheetDataSource } = require('../lib/data/source');
    jest.spyOn(SheetDataSource.prototype, 'getHeaders').mockResolvedValue(['Date', 'Fuel Type', 'Amount', 'Cost']);
    jest.spyOn(SheetDataSource.prototype, 'getSampleRows').mockResolvedValue([
      ['2024-01-01', 'Diesel', '10', '50'],
      ['2024-01-08', 'Diesel', '8', '40'],
      ['2024-01-15', 'Gas', '12', '60'],
      ['2024-01-22', 'Gas', '9', '45'],
      ['2024-01-29', 'Diesel', '11', '55'],
    ]);

    // Fetch used by some endpoints
    setFetchMock(async () => ({ ok: true, status: 200, json: async () => ({ success: true }), text: async () => '' }));

    // Plan describe for summary-like
    const plan = { intent: 'describe_data', tools: [{ name: 'describe_sheet', args: { sheetName: 'Fuel Weekly Repo' } }], toolChain: [], clarifyQuestion: null, reasoning: 'summary' };

    const toolCalls: string[] = [];
    jest.doMock('../lib/chat/toolExecution', () => ({
      executeToolCall: async (toolCall: any) => {
        const name = toolCall?.function?.name;
        toolCalls.push(name);
        if (name === 'describe_sheet') {
          return { success: true, result: 'Your sheet tracks fuel with columns Date, Fuel Type, Amount, Cost. Total cost: 250.' } as any;
        }
        if (name === 'get_sheet_data') return { success: true, data: [['Date','Fuel Type','Amount','Cost']] } as any;
        return { success: true, result: `${name} ok` } as any;
      },
    }));

    const { buildUserResponse: run } = require('../lib/chat/responseBuilder');
    const ctx: any = { spreadsheetId: 'sheet-1', sheetName: 'Fuel Weekly Repo', sheetNames: ['Fuel Weekly Repo'] };
    const out = await run(plan, ctx, [], []);

    expect(toolCalls).toContain('describe_sheet');
    expect(out.response).toMatch(/columns\s+Date,\s*Fuel Type/i);
    expect(out.response).toMatch(/Total cost:\s*250/i);
  });

  it('summarizes when asked "summarize my fuel weekly repo"', async () => {
    const { SheetDataSource } = require('../lib/data/source');
    jest.spyOn(SheetDataSource.prototype, 'getHeaders').mockResolvedValue(['Date', 'Fuel Type', 'Amount', 'Cost']);
    jest.spyOn(SheetDataSource.prototype, 'getSampleRows').mockResolvedValue([
      ['2024-01-01', 'Diesel', '10', '50'],
      ['2024-01-08', 'Diesel', '8', '40'],
      ['2024-01-15', 'Gas', '12', '60'],
      ['2024-01-22', 'Gas', '9', '45'],
      ['2024-01-29', 'Diesel', '11', '55'],
    ]);
    setFetchMock(async () => ({ ok: true, status: 200, json: async () => ({ success: true }), text: async () => '' }));
    const plan = { intent: 'describe_data', tools: [{ name: 'describe_sheet', args: { sheetName: 'Fuel Weekly Repo' } }], toolChain: [], clarifyQuestion: null, reasoning: 'summary' };
    const toolCalls: string[] = [];
    jest.doMock('../lib/chat/toolExecution', () => ({
      executeToolCall: async (toolCall: any) => {
        const name = toolCall?.function?.name;
        toolCalls.push(name);
        if (name === 'describe_sheet') return { success: true, result: 'Your sheet tracks fuel with columns Date, Fuel Type, Amount, Cost. Total cost: 250.' } as any;
        return { success: true, result: `${name} ok` } as any;
      },
    }));
    const { buildUserResponse: run } = require('../lib/chat/responseBuilder');
    const ctx: any = { spreadsheetId: 'sheet-1', sheetName: 'Fuel Weekly Repo', sheetNames: ['Fuel Weekly Repo'] };
    const out = await run(plan, ctx, [], []);
    expect(toolCalls).toContain('describe_sheet');
    expect(out.response).toMatch(/Fuel Weekly Repo|columns\s+Date,\s*Fuel Type/i);
  });

  it('describes sheet and appends total rows when hydrated (6 rows)', async () => {
    // Mock hydration with headers and 6 rows
    const { SheetDataSource } = require('../lib/data/source');
    jest.spyOn(SheetDataSource.prototype, 'getHeaders').mockResolvedValue(['Date', 'Driver', 'Amount']);
    jest.spyOn(SheetDataSource.prototype, 'getSampleRows').mockResolvedValue([
      ['2024-01-01', 'Alice', '10'],
      ['2024-01-02', 'Bob', '12'],
      ['2024-01-03', 'Chris', '8'],
      ['2024-01-04', 'Dana', '9'],
      ['2024-01-05', 'Evan', '11'],
      ['2024-01-06', 'Fran', '14'],
    ]);

    setFetchMock(async () => ({ ok: true, status: 200, json: async () => ({ success: true }), text: async () => '' }));

    // Plan describe_sheet
    const plan = { intent: 'describe_data', tools: [{ name: 'describe_sheet', args: {} }], toolChain: [], clarifyQuestion: null };

    const toolCalls: string[] = [];
    jest.doMock('../lib/chat/toolExecution', () => ({
      executeToolCall: async (toolCall: any) => {
        const name = toolCall?.function?.name;
        toolCalls.push(name);
        if (name === 'describe_sheet') {
          return { success: true, result: 'Your sheet tracks fuel data.' } as any;
        }
        return { success: true, result: `${name} ok` } as any;
      },
    }));

    const { buildUserResponse: run } = require('../lib/chat/responseBuilder');
    const ctx: any = { spreadsheetId: 'abc', sheetName: 'Fuel Weekly Repo', sheetNames: ['Fuel Weekly Repo'] };
    const out = await run(plan, ctx, [], []);

    expect(toolCalls).toContain('describe_sheet');
    expect(out.response).toMatch(/tracks fuel data/i);
    expect(out.response).toMatch(/Total rows:\s*6/i);
  });

  it('shows Total rows: 0 with quick replies when no rows', async () => {
    const { SheetDataSource } = require('../lib/data/source');
    jest.spyOn(SheetDataSource.prototype, 'getHeaders').mockResolvedValue(['Date', 'Driver', 'Amount']);
    jest.spyOn(SheetDataSource.prototype, 'getSampleRows').mockResolvedValue([]);

    setFetchMock(async () => ({ ok: true, status: 200, json: async () => ({ success: true }), text: async () => '' }));

    const plan = { intent: 'describe_data', tools: [{ name: 'describe_sheet', args: {} }], toolChain: [], clarifyQuestion: null };
    jest.doMock('../lib/chat/toolExecution', () => ({ executeToolCall: async (toolCall: any) => ({ success: true, result: 'Your sheet tracks fuel data.' }) }));

    const { buildUserResponse: run } = require('../lib/chat/responseBuilder');
    const ctx: any = { spreadsheetId: 'abc', sheetName: 'Fuel Weekly Repo', sheetNames: ['Fuel Weekly Repo'] };
    const out = await run(plan, ctx, [], []);

    expect(out.response).toMatch(/Total rows:\s*0/i);
    expect(Array.isArray(out.quickReplies)).toBe(true);
    const qr = (out.quickReplies as string[]).join(' | ');
    expect(qr).toMatch(/Show raw data|Retry loading/i);
  });

  it('uses describe_sheet in text_summary mode for non-tabular sheets', async () => {
    setFetchMock(async () => ({ ok: true, status: 200, json: async () => ({ success: true }), text: async () => '' }));

    const toolCalls: Array<{ name: string; args: any }> = [];
    jest.doMock('../lib/chat/toolExecution', () => ({
      executeToolCall: async (toolCall: any) => {
        const name = toolCall?.function?.name;
        const args = (() => { try { return JSON.parse(toolCall?.function?.arguments || '{}'); } catch { return {}; } })();
        toolCalls.push({ name, args });
        if (name === 'describe_sheet') return { success: true, result: 'Your sheet contains notes about fuel and clients.' } as any;
        return { success: true, result: `${name} ok` } as any;
      },
    }));

    // Encourage describe_sheet and include explicit text_summary arg
    const plan = { intent: 'describe_data', tools: [{ name: 'describe_sheet', args: { mode: 'text_summary' } }], toolChain: [], clarifyQuestion: null };

    const { buildUserResponse: run } = require('../lib/chat/responseBuilder');
    const ctx: any = { spreadsheetId: 'abc', sheetName: 'Notes', sheetNames: ['Notes'], isNonTabular: true };
    const out = await run(plan, ctx, [], []);

    const describe = toolCalls.find(t => t.name === 'describe_sheet');
    expect(describe).toBeTruthy();
    if (describe) expect(describe.args.mode).toBe('text_summary');
    expect(out.response).toMatch(/contains notes.*fuel.*clients/i);
  });

  it("uses cached sheetData row count for 'tell me about my data' (6 rows)", async () => {
    setFetchMock(async () => ({ ok: true, status: 200, json: async () => ({ success: true }), text: async () => '' }));

    // Encourage describe_sheet, but rely on cached sheetData for row count composition
    const plan = { intent: 'describe_data', tools: [{ name: 'describe_sheet', args: {} }], toolChain: [], clarifyQuestion: null };
    jest.doMock('../lib/chat/toolExecution', () => ({ executeToolCall: async (_toolCall: any) => ({ success: true, result: 'This sheet looks like sales data.' }) }));

    const { buildUserResponse: run } = require('../lib/chat/responseBuilder');
    const table = [
      ['Date','Client','Sales'],
      ['2024-01-01','A','100'],
      ['2024-01-02','B','200'],
      ['2024-01-03','C','300'],
      ['2024-01-04','D','400'],
      ['2024-01-05','E','500'],
      ['2024-01-06','F','600'],
    ];
    const ctx: any = { spreadsheetId: 'abc', sheetName: 'Fuel Weekly Repo', sheetNames: ['Fuel Weekly Repo'], sheetHeaders: ['Date','Client','Sales'], sheetData: { 'Fuel Weekly Repo': table } };
    const out = await run(plan, ctx, [], []);
    // Must mention sheet and either "has 6 rows" or "has total rows: 6"
    expect(out.response).toMatch(/Fuel Weekly Repo/i);
    expect(/has\s*6\s*rows/i.test(out.response) || /has\s*total\s*rows\s*:\s*6/i.test(out.response)).toBe(true);
  });

  it('non-tabular sheet uses describe_sheet with text_summary mode', async () => {
    setFetchMock(async () => ({ ok: true, status: 200, json: async () => ({ success: true }), text: async () => '' }));

    const toolCalls: Array<{ name: string; args: any }> = [];
    const plan = { intent: 'describe_data', tools: [{ name: 'describe_sheet', args: { mode: 'text_summary' } }], toolChain: [], clarifyQuestion: null };
    jest.doMock('../lib/chat/toolExecution', () => ({
      executeToolCall: async (toolCall: any) => {
        const name = toolCall?.function?.name;
        const args = (() => { try { return JSON.parse(toolCall?.function?.arguments || '{}'); } catch { return {}; } })();
        toolCalls.push({ name, args });
        if (name === 'describe_sheet') return { success: true, result: 'Free-form notes about clients and fuel sales.' } as any;
        return { success: true, result: `${name} ok` } as any;
      }
    }));

    const { buildUserResponse: run } = require('../lib/chat/responseBuilder');
    const ctx: any = { spreadsheetId: 'abc', sheetName: 'Notes', sheetNames: ['Notes'], isNonTabular: true };
    const out = await run(plan, ctx, [], []);
    const describe = toolCalls.find(t => t.name === 'describe_sheet');
    expect(describe).toBeTruthy();
    if (describe) expect(describe.args.mode).toBe('text_summary');
    expect(out.response).toMatch(/Free-form notes/i);
  });
});
