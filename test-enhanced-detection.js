// Test the precise smart data detection
const needsFullData = (query) => {
  const q = query.toLowerCase();

  // Check 1: Bulk update operations (mark/change/update/set/modify + quantifier + to/as)
  const bulkOps = ['mark', 'change', 'update', 'set', 'modify'];
  const bulkQuantifiers = [' all ', ' every ', ' each ', ' any ', ' my ', ' the '];
  const hasBulkUpdate = bulkOps.some(op => q.includes(op)) &&
                       bulkQuantifiers.some(quant => q.includes(quant)) &&
                       (q.includes(' to ') || q.includes(' as '));

  // Check 2: Explicit status changes with quantifiers
  const hasStatusChange = q.includes('status') ||
                         (q.includes(' to ') && q.includes('all'));

  // Check 3: Aggregation operations
  const hasAggOp = [' total ', ' sum ', ' average ', ' count '].some(agg => q.includes(agg));

  // Check 4: Multi-entity operations with clear bulk intent
  const hasMultiEntity = ['tasks', 'items', 'entries', 'records', 'rows'].some(entity =>
    q.includes(entity) && [' all ', ' every ', ' each '].some(quant => q.includes(quant))
  );

  console.log(`🔍 "${query}" -> BulkUpdate: ${hasBulkUpdate}, StatusChange: ${hasStatusChange}, AggOp: ${hasAggOp}, MultiEntity: ${hasMultiEntity}`);

  return hasBulkUpdate || hasStatusChange || hasAggOp || hasMultiEntity;
};

// Test cases including the user's specific query
const testCases = [
  "mark my overdue tasks as complete",  // User's specific query
  "mark all overdue tasks as completed",
  "change status of pending items to done",
  "update all incomplete entries to finished",
  "set overdue tasks to completed",
  "add a new task to the list",
  "what is the total number of tasks",
  "show me all completed tasks"
];

console.log('🧪 TESTING ENHANCED DETECTION SYSTEM');
console.log('=' .repeat(50));

testCases.forEach(testCase => {
  const result = needsFullData(testCase);
  console.log(`${result ? '✅' : '❌'} "${testCase}"`);
  console.log(''); // Add spacing
});
