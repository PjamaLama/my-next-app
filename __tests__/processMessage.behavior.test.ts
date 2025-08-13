// Shared mocks
jest.mock('@genkit-ai/googleai', () => ({ googleAI: () => ({}), gemini15Flash: {} }));

import { processMessage } from '../lib/chat/processMessage';
import type { Context, ConversationHistoryItem } from '../lib/chat/types';

// Utility to reset fetch between tests
const setFetchMock = (impl: any) => {
  // @ts-ignore
  global.fetch = jest.fn(impl);
};

describe('processMessage behavior', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('hydrates, fails gracefully, and returns fallback guidance when headers cannot load', async () => {
    // Mock fetch to fail for hydration (getHeaders/getSampleRows)
    setFetchMock(async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'error' }));

    // Mock planner to be neutral
    jest.doMock('../lib/chat/planner', () => ({
      generatePlan: async () => ({ intent: 'other', tools: [], toolChain: [] }),
    }));

    const ctx: Context = { spreadsheetId: 'sheet-1', sheetName: 'Sheet1', sheetNames: ['Sheet1'] } as any;
    const history: ConversationHistoryItem[] = [];
    const out = await processMessage('please check data', ctx, history, []);

    expect(out).toBeTruthy();
    expect(typeof out.response).toBe('string');
    // Accept either user-facing fallback guidance or a surfaced tool error.
    // This flexibility allows graceful degradation while still ensuring error tracking.
    expect(out.response).toMatch(/No sheet data loaded yet|Tool error/i);
    // Error should be marked in context and include sheet access failure
    expect((out.context as any).error).toMatch(/Sheet access failed/);
    // Ensure sheetData remains empty on hydration failure for safety
    expect((out.context as any).sheetData).toEqual({});
  });

  it("handles vague 'tell me about sheet' via describe_sheet tool and returns summary", async () => {
    // Allow fetch to succeed for unrelated calls, but we won't rely on it
    setFetchMock(async () => ({ ok: true, status: 200, json: async () => ({ success: true }), text: async () => '' }));

    // Capture tool calls and return synthetic responses
    const toolCalls: string[] = [];
    jest.doMock('../lib/chat/toolExecution', () => ({
      executeToolCall: async (toolCall: any) => {
        const name = toolCall?.function?.name;
        toolCalls.push(name);
        if (name === 'describe_sheet') {
          return { success: true, result: 'This sheet has columns Date, Client, Sales. About 100 rows.' } as any;
        }
        return { success: true, result: `${name} ok` } as any;
      },
    }));

    // Keep planner neutral so heuristics suggest describe_sheet
    jest.doMock('../lib/chat/planner', () => ({
      generatePlan: async () => ({ intent: 'other', tools: [], toolChain: [] }),
    }));

    // Re-require after jest.doMock
    const { processMessage: run } = require('../lib/chat/processMessage');

    const ctx: Context = { spreadsheetId: 'abc', sheetName: 'Sheet1', sheetNames: ['Sheet1'] } as any;
    const out = await run('tell me about sheet', ctx, [], []);

    expect(toolCalls).toContain('describe_sheet');
    expect(out.response).toMatch(/columns/i);
    expect(out.response).toMatch(/rows/i);
  });

  it('clarifies aggregate without column: with headers shows options; without headers shows access error guidance', async () => {
    // Case A: headers present → suggest options
    setFetchMock(async () => ({ ok: true, status: 200, json: async () => ({ success: true }), text: async () => '' }));

    // Mock planner to request clarification explicitly
    jest.doMock('../lib/chat/planner', () => ({
      generatePlan: async () => ({ intent: 'aggregate', targetColumn: null, tools: [], toolChain: [], clarifyQuestion: 'Which column contains the amounts? Options: [Sales, Region]' }),
    }));
    let { processMessage: run } = require('../lib/chat/processMessage');
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
    ;({ processMessage: run } = require('../lib/chat/processMessage'));
    ctx = { spreadsheetId: 'abc', sheetName: 'Sheet1', sheetNames: ['Sheet1'] } as any;
    out = await run('sum by region', ctx, [], []);
    expect(out.response).toMatch(/couldn’t load column headers/i);
  });
});


