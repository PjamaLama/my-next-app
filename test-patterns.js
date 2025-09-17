// Test script to verify enhanced query pattern detection
const cellOperationPatterns = [
  // Direct cell references
  /\b(update|put|set)\b.*\b(cell|cells?|a\d+|b\d+|c\d+)\b/i,
  /\b(formula|function|calculation)\b.*\b(cell|range|column|row)\b/i,
  /\b(sum|average|count|max|min|if|vlookup|index|match)\b/i,
  /\b(a\d+|b\d+|c\d+|d\d+|e\d+|f\d+|g\d+|h\d+|i\d+|j\d+)\b.*\b(=|\+|\-|\/|\*)\b/i,

  // Bulk update patterns - CRITICAL for "mark all X as Y"
  /\b(mark|change|modify|update|set)\b.*\b(all|every|each|any)\b.*\b(as|to|with)\b/i,
  /\b(mark|change|modify|update|set)\b.*\b(that|which|where)\b.*\b(as|to|with)\b/i,
  /\b(set|change|update)\b.*\b(status|state|condition|value)\b.*\b(to|as)\b/i,

  // Status-based operations (overdue, completed, pending, etc.)
  /\b(overdue|completed|pending|incomplete|finished|done)\b.*\b(tasks?|items?|entries?)\b/i,
  /\b(tasks?|items?|entries?)\b.*\b(overdue|completed|pending|incomplete|finished|done)\b/i,

  // Conditional updates
  /\b(if|when|where)\b.*\b(is|=|equals|contains)\b.*\b(then|set|mark|change)\b/i,
  /\b(conditional|condition)\b.*\b(update|change|modification)\b/i,

  // Multi-cell operations
  /\b(multiple|several|many)\b.*\b(cells?|rows?|entries?)\b/i,
  /\b(bulk|batch)\b.*\b(update|change|modification)\b/i,

  // Specific status transitions
  /\b(mark|set|change)\b.*\b(overdue|pending|incomplete)\b.*\b(to|as)\b.*\b(complete|done|finished)\b/i,
  /\b(update|modify)\b.*\b(status)\b.*\b(from|to)\b/i
];

const testQueries = [
  "mark all overdue tasks as completed",
  "change status of pending items to done",
  "update all incomplete entries to finished",
  "set overdue tasks to completed",
  "mark that which is pending as done",
  "change all overdue to completed",
  "update status of every task that is overdue",
  "add a new task to the list",
  "what is the total number of tasks"
];

console.log('🧪 PATTERN DETECTION TEST');
console.log('=' .repeat(50));

testQueries.forEach((query, index) => {
  const matches = cellOperationPatterns.map(pattern => pattern.test(query));
  const hasMatch = matches.some(match => match);
  const matchedPatterns = matches.map((match, i) => match ? i + 1 : null).filter(x => x !== null);

  console.log(`Query ${index + 1}: "${query}"`);
  console.log(`  Result: ${hasMatch ? '✅ CELL OPERATION DETECTED' : '❌ NOT DETECTED'}`);
  if (matchedPatterns.length > 0) {
    console.log(`  Patterns: ${matchedPatterns.join(', ')}`);
  }
  console.log('');
});

console.log('🎯 KEY PATTERNS FOR "mark all overdue tasks as completed":');
const keyQuery = "mark all overdue tasks as completed";
cellOperationPatterns.forEach((pattern, index) => {
  const matches = pattern.test(keyQuery);
  if (matches) {
    console.log(`  Pattern ${index + 1}: ${pattern} ✅`);
  }
});
