// Mock LLM dependencies before importing modules that use them
jest.mock('@genkit-ai/googleai', () => ({ googleAI: () => ({}), gemini15Flash: {} }));
jest.mock('genkit', () => ({ genkit: () => ({ generate: async () => ({ text: '{}' }) }) }));
// Mock qa to avoid top-level await usage in tests
jest.mock('../lib/chat/qa', () => ({
  answerQuestionFromSheets: (message: string) => ({ answer: 'ok' })
}));

import { processMessage } from '../lib/chat/processMessage';
import { Context, ConversationHistoryItem } from '../lib/chat/types';

// Mock tool execution to avoid network calls
jest.mock('../lib/chat/toolExecution', () => ({
  executeToolCall: async (toolCall: any, context: any) => {
    const name = toolCall?.function?.name;
    if (name === 'sheet_query' || name === 'get_sheet_data') {
      return { success: true, data: [['Date', 'Sales'], ['2024-01-01', '100'], ['2024-01-02', '200'], ['2024-01-03', '50']] };
    }
    if (name === 'aggregate') {
      return { success: true, result: 'Aggregated 3 row(s) into 1 group(s).', details: {}, data: [[{ key: [], sum_Sales: 350 }]] } as any;
    }
    if (name === 'trend_analysis') {
      return { success: true, result: 'Trend increasing (slope 0.5)', details: { slope: 0.5 } } as any;
    }
    return { success: true, result: `${name} ok` } as any;
  }
}));

// Mock planner to output a minimal chain for total sales
jest.mock('../lib/chat/planner', () => ({
  generatePlan: async (message: string) => {
    if (/total\s+sales/i.test(message)) {
      return {
        intent: 'get_data',
        queryType: 'aggregate',
        clarifyQuestion: null,
        targetColumn: 'Sales',
        toolChain: [
          { toolName: 'get_sheet_data', params: { sheetName: 'Sheet1' } },
          { toolName: 'aggregate', params: { spec: { metrics: [{ op: 'sum', col: 'Sales' }] } }, dependsOn: [0] },
        ],
        tools: [],
      } as any;
    }
    return { intent: 'other', queryType: 'other', tools: [] } as any;
  }
}));

describe('processMessage integration', () => {
  it('answers total sales via aggregate chain', async () => {
    const ctx: Context = { spreadsheetId: 'abc', sheetName: 'Sheet1', sheetNames: ['Sheet1'] } as any;
    const history: ConversationHistoryItem[] = [];
    jest.setTimeout(30000);
    const out = await processMessage('total sales', ctx, history, []);
    expect(out).toBeTruthy();
    // Check that it produced a response
    expect(typeof out.response).toBe('string');
  });
});


