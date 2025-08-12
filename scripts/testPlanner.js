// scripts/testPlanner.js
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
try {
  require('dotenv').config({ path: '.env.local' });
  require('dotenv').config();
} catch {}

(async () => {
  try {
    const { generatePlan } = require('../lib/chat/planner');
    const plan = await generatePlan(
      'Show me total sales for Europe in June 2025',
      'sheetName: Sales'
    );
    console.log('Planner output:', JSON.stringify(plan, null, 2));
  } catch (err) {
    console.error('Planner test failed:', err);
    process.exitCode = 1;
  }
})();


