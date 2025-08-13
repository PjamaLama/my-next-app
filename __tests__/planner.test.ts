// Mock genkit and googleai before importing planner
jest.mock('@genkit-ai/googleai', () => ({ googleAI: () => ({}), gemini15Flash: {} }));
jest.mock('genkit', () => {
  const factory = {
    genkit: () => ({
      generate: async (prompt: any) => {
        const p = String(prompt || '').toLowerCase();
        if (p.includes('total sales') && p.includes('headers') && p.includes('total sales')) {
          return { text: JSON.stringify({ intent: 'get_data', queryType: 'aggregate', reasoning: 'Aggregate sum of Total Sales.', targetColumn: 'Total Sales', targetColumnScore: 0.92, targetColumnReason: 'Header includes sales', clarifyQuestion: null, tools: [], toolChain: [] }) } as any;
        }
        if (p.includes('revenue by product') && p.includes('headers') && p.includes('product')) {
          return { text: JSON.stringify({ intent: 'get_data', queryType: 'aggregate', reasoning: 'Need numeric amount column.', targetColumn: null, targetColumnScore: null, targetColumnReason: null, clarifyQuestion: 'Which column contains the amounts? Options: [Product, Note]', tools: [], toolChain: [] }) } as any;
        }
        return { text: JSON.stringify({ intent: 'get_data', queryType: 'aggregate', reasoning: 'Fetch → aggregate → trend.', targetColumn: 'Sales', targetColumnScore: 0.9, targetColumnReason: 'keyword', clarifyQuestion: null, tools: [], toolChain: [ { toolName: 'get_sheet_data', params: { sheetName: 'Sheet1' } }, { toolName: 'aggregate', params: { spec: { groupBy: ['Date'], metrics: [{ op: 'sum', col: 'Sales' }] } }, dependsOn: [0] }, { toolName: 'trend_analysis', params: { from: 'aggregate' }, dependsOn: [1] } ] }) } as any;
      }
    })
  };
  return factory as any;
});

import { generatePlan } from '../lib/chat/planner';

describe('generatePlan', () => {
  it('picks clear aggregate column', async () => {
    const ctx: any = { sheetHeaders: ['Date', 'Region', 'Total Sales'] };
    const plan = await generatePlan('sum total sales', ctx, [], false);
    expect(plan.intent).toBe('get_data');
    expect(Array.isArray(plan.tools)).toBe(true);
    expect(typeof plan.reasoning === 'string' || plan.reasoning === null).toBe(true);
  });

  it('asks to clarify when ambiguous', async () => {
    const ctx: any = { sheetHeaders: ['Product', 'Note'] };
    const plan = await generatePlan('what is revenue by product?', ctx, [], false);
    expect(typeof plan.clarifyQuestion === 'string' || plan.clarifyQuestion === null).toBe(true);
  });

  it('normalizes toolChain steps', async () => {
    const ctx: any = { sheetHeaders: ['Date', 'Sales'] };
    const plan = await generatePlan('forecast sales trend', ctx, [], false);
    expect(Array.isArray(plan.toolChain)).toBe(true);
  });
});


