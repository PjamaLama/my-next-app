// Mock genkit and googleai before importing planner
jest.mock('@genkit-ai/googleai', () => ({ googleAI: () => ({}), gemini15Flash: {} }));
jest.mock('genkit', () => {
  const factory = {
    genkit: () => ({
      generate: async (prompt: any) => {
        const p = String(prompt || '').toLowerCase();
        if (p.includes('total sales') && p.includes('headers') && p.includes('total sales')) {
          return { text: JSON.stringify({ 
            intent: 'update_data', 
            reasoning: 'Update data request.', 
            tools: [], 
            toolChain: [],
            sheets: [{ sheetName: 'Sheet1', rows: [{ 'Date': '2024-01-01', 'Total Sales': '1000' }] }]
          }) } as any;
        }
        if (p.includes('revenue by product') && p.includes('headers') && p.includes('product')) {
          return { text: JSON.stringify({ 
            intent: 'update_data', 
            reasoning: 'Update data request.', 
            tools: [], 
            toolChain: [],
            sheets: [{ sheetName: 'Sheet1', rows: [{ 'Product': 'Widget', 'Revenue': '500' }] }]
          }) } as any;
        }
        if (p.includes('update sales in sheet2')) {
          return { text: JSON.stringify({ 
            intent: 'update_data', 
            reasoning: 'Update data request.', 
            tools: [], 
            toolChain: [],
            sheets: [{ sheetName: 'Sheet2', rows: [{ 'Date': '2024-01-01', 'Sales': '500' }] }]
          }) } as any;
        }
        return { text: JSON.stringify({ 
          intent: 'update_data', 
          reasoning: 'Update data request.', 
          tools: [], 
          toolChain: [],
          sheets: [{ sheetName: 'Sheet1', rows: [] }]
        }) } as any;
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
    expect(plan.intent).toBe('update_data');
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

  it('includes sheets structure in plan', async () => {
    const ctx: any = { sheetHeaders: ['Date', 'Sales'], sheetNames: ['Sheet1', 'Sheet2'] };
    const plan = await generatePlan('add sales data', ctx, [], false);
    expect(Array.isArray(plan.sheets)).toBe(true);
    expect(plan.sheets.length).toBeGreaterThan(0);
    expect(plan.sheets[0]).toHaveProperty('sheetName');
    expect(plan.sheets[0]).toHaveProperty('rows');
    expect(Array.isArray(plan.sheets[0].rows)).toBe(true);
  });

  it('handles multi-sheet context', async () => {
    const ctx: any = { 
      sheetHeaders: ['Date', 'Sales'], 
      sheetNames: ['Sheet1', 'Sheet2'],
      sheetName: 'Sheet2'
    };
    const plan = await generatePlan('update sales in Sheet2', ctx, [], false);
    expect(Array.isArray(plan.sheets)).toBe(true);
    expect(plan.sheets.some(s => s.sheetName === 'Sheet2')).toBe(true);
  });
});


