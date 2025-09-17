// Test the new simplified smart data detection
const needsFullData = (query) => {
  const q = query.toLowerCase();

  // Check 1: Bulk operations (mark/change/update/set + all/every/each)
  const bulkOps = ['mark', 'change', 'update', 'set', 'modify'];
  const bulkQuantifiers = [' all ', ' every ', ' each ', ' any '];
  const hasBulkOp = bulkOps.some(op => q.includes(op)) &&
                   bulkQuantifiers.some(quant => q.includes(quant));

  // Check 2: Status transitions
  const hasStatusOp = q.includes('status') ||
                     (q.includes(' to ') &&
                      ['complete', 'done', 'finished', 'pending', 'cancelled'].some(status => q.includes(status)));

  // Check 3: Aggregation operations
  const hasAggOp = [' total ', ' sum ', ' average ', ' count '].some(agg => q.includes(agg));

  return hasBulkOp || hasStatusOp || hasAggOp;
};

// Test cases
const testCases = [
  "mark all overdue tasks as completed",
  "change status of pending items to done",
  "update all incomplete entries to finished",
  "set overdue tasks to completed",
  "add a new task to the list",
  "what is the total number of tasks",
  "show me all completed tasks"
];

console.log('🧪 TESTING SIMPLE DETECTION SYSTEM');
console.log('=' .repeat(50));

testCases.forEach(testCase => {
  const result = needsFullData(testCase);
  console.log(`${result ? '✅' : '❌'} "${testCase}"`);
});

console.log('\n🎯 EXPECTED RESULTS:');
console.log('✅ mark all overdue tasks as completed (bulk operation)');
console.log('✅ change status of pending items to done (status transition)');
console.log('✅ update all incomplete entries to finished (bulk operation)');
console.log('✅ set overdue tasks to completed (bulk operation)');
console.log('❌ add a new task to the list (simple addition)');
console.log('✅ what is the total number of tasks (aggregation)');
console.log('❌ show me all completed tasks (simple query)');
