// Load env vars from .env.local or .env
try {
  require('dotenv').config({ path: '.env.local' });
  require('dotenv').config();
} catch {}
// scripts/testVectors.js
// Enable requiring TypeScript modules in this test script with CommonJS output
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', moduleResolution: 'node' },
});

const {
  ensureHeaderVectors,
  ensureRowVectors,
  getHeaderVectors,
  queryRowVectors,
} = require('../lib/sheetVectorStore');

(async () => {
  try {
    await ensureHeaderVectors('testSheet', 'Sheet1', ['Name', 'Price'], ['Alice, 10', 'Bob, 20']);
    await ensureRowVectors('testSheet', 'Sheet1', [
      ['Alice', '10'],
      ['Bob', '20'],
    ], 2);

    const headers = await getHeaderVectors('testSheet');
    console.log('Headers:', headers);

    const { embedTexts } = require('../lib/embeddings');
    const [queryVec] = await embedTexts(['Alice 10']);
    const results = await queryRowVectors('testSheet', queryVec, 2);
    console.log('Row query results:', results);
  } catch (err) {
    console.error('Test failed:', err);
    process.exitCode = 1;
  }
})();


