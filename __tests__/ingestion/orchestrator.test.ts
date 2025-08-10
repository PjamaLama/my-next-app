// Basic shape test to ensure module loads. Full integration depends on Sheets client.
describe('ingestion orchestrator module', () => {
  it('loads without throwing', async () => {
    const mod = await import('../../lib/ingestion/orchestrator');
    expect(typeof mod.ingestRows).toBe('function');
  });
});


