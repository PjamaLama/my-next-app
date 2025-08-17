export type SheetUpdatePromptVars = {
  transcript: string;
  sheetName: string;
  lastDataRow: number;
  insertionRow: number;
  headers: string; // comma separated
  detectedHeaderRowIndex?: number;
  headerMappingHints?: string; // JSON string canonical->columnLetter
  identityHints?: string; // JSON string describing row identity columns
  patternAnalysis: string;
  currentDate: string;
  currentTime: string;
  currentDateTime: string;
  isoDateTime: string;
  timezone: string;
  matchingRowForToday: number;
  sheetDataCsv: string; // CSV lines
};

export function buildSheetUpdatePrompt(vars: SheetUpdatePromptVars): string {
  const {
    transcript,
    sheetName,
    lastDataRow,
    insertionRow,
    headers,
    detectedHeaderRowIndex,
    headerMappingHints,
    identityHints,
    patternAnalysis,
    currentDate,
    currentTime,
    currentDateTime,
    isoDateTime,
    timezone,
    matchingRowForToday,
    sheetDataCsv,
  } = vars;

  return [
    `You are helping update a Google Sheet named "${sheetName}".`,
    '',
    'SHEET ANALYSIS:',
    `- Last data row: ${lastDataRow}`,
    `- Insertion row: ${insertionRow} (insert after last data row, before any formulas)`,
    typeof detectedHeaderRowIndex === 'number' ? `- Detected header row index (0-based): ${detectedHeaderRowIndex}` : '',
    headerMappingHints ? `- Column mapping hints (canonical -> column letter): ${headerMappingHints}` : '',
    identityHints ? `- Row identity hints: ${identityHints}` : '',
    '',
    'CURRENT DATE/TIME CONTEXT:',
    `- Today (YYYY-MM-DD): ${currentDate}`,
    `- Current time (HH:mm): ${currentTime}`,
    `- Current local datetime (YYYY-MM-DD HH:mm): ${currentDateTime}`,
    `- ISO datetime: ${isoDateTime}`,
    `- Timezone: ${timezone}`,
    '',
    'MATCHING ROW CONTEXT:',
    `- Matching row for today (if detected): ${matchingRowForToday}`,
    '',
    `User's request: ${transcript}`,
    '',
    'Current sheet data:',
    `Headers: ${headers}`,
    sheetDataCsv,
    '',
    'DATA PATTERN ANALYSIS:',
    patternAnalysis,
    '',
    'INFERENCE RULES FOR UNSPECIFIED FIELDS:',
    'For each column in the new or updated row:',
    '1. If the user explicitly provides a value (even "null"), use it with "high" confidence.',
    '2. If unspecified or "null", infer from patterns:',
    '   - Check the last 5 rows for the most common value in that column (e.g., if "Vkb" appears 3/5 times in CLIENT SEEN, use "Vkb").',
    '   - If no clear majority (less than 50% frequency), check the immediate previous row and repeat its value if it matches a trend (e.g., repeating empty or a name).',
    '   - For dates: Always use ' + currentDate + ' if omitted and column is date-like.',
    '   - For numbers/currency (e.g., SALES MADE): Standardize format to match patterns (e.g., convert "200 rand" to "R200.00" if previous rows use "Rxx.xx").',
    '   - For text/details: Leave blank only if 80%+ of recent rows are blank; otherwise, infer a placeholder like "N/A" or most common phrase.',
    '3. Assign confidence: "high" for user data, "medium" for majority pattern, "low" for previous-row repeat or guess.',
    '4. NEVER leave inferred fields as "null" – convert to empty string "" or inferred value.',
    '',
    'CRITICAL RULES:',
    '0. Do not assume headers are in row 1. Use the detectedHeaderRowIndex when reasoning about row numbers.',
    '1. If a matching row exists for the user\'s intent (e.g., a row for "today"), DO NOT insert a new row. Emit ONLY updateCell actions targeting the matched row.',
    '2. Only insert a new row when there is no suitable existing row to update. When inserting, use the insertionRow or higher and keep formula/summary rows intact.',
    '3. For multiple entries, increment row numbers starting from insertionRow when inserting.',
    '4. When updating, target the exact row index determined by the match (e.g., matchingRowForToday).',
    '5. Base suggested values on the user\'s request and existing data patterns.',
    '6. If the extracted data contains multiple entries, create a separate row for EACH entry only when there is no existing matching row for each entry.',
    '7. When the user indicates "today", "now", or omits a date for a date/time column, use the CURRENT DATE/TIME CONTEXT above. Prefer ' + currentDate + ' for date-only columns and ' + currentDateTime + ' for timestamp columns.',
    '8. ALWAYS infer unspecified fields from data patterns before outputting. For each action, fill EVERY column in new/updated rows unless user overrides. Use last 5 rows for frequency analysis (e.g., count occurrences and pick the top one). Avoid blanks unless pattern shows 100% blanks.',
    '',
    'Output your response in this EXACT JSON format:',
    '{',
    '  "actions": [',
    '    {',
    '      "type": "insertRow",',
    `      "sheet": "${sheetName}",`,
    '      "row": ' + insertionRow + ' + (entry_index - 1)',
    '    },',
    '    {',
    '      "type": "updateCell",',
    `      "sheet": "${sheetName}",`,
    '      "row": <target_row_index>,',
    '      "column": "ColumnLetter",',
    '      "value": "suggested value",',
    '      "confidence": "high|medium|low"',
    '    }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- Use "high" confidence for user-provided data',
    '- Use "medium" confidence for strong pattern matches',
    '- Use "low" confidence for best guesses from historical patterns',
    '- When updating, set <target_row_index> to the matched row (e.g., ' + matchingRowForToday + '); when inserting, set it to ' + insertionRow + ' + (entry_index - 1)',
    '- ALWAYS generate insertRow actions FIRST (only if needed), then updateCell actions',
    '- Return ONLY the JSON object, no explanations or markdown',
    '- Standardize values: Format currency as "R-amount.00" (e.g., "200 rand" -> "R200.00"), dates as YYYY-MM-DD, and clean "null" to "" or inferred value.',
  ].join('\n');
}