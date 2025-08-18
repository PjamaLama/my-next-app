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
    'INFERENCE RULES FOR UNSPECIFIED FIELDS:',    `For updates from files or text, infer all values (e.g., repeat patterns like Driver 'Neville Young', Vehicle 'TOYOTA HILUX', KM Start = previous KM End). If multi-sheet, generate actions per sheet.\n- Preview as tables first (dry run).\n- Use history for defaults: ${sheetDataCsv}.\n- Standardize: Dates as 'MM/DD/YYYY', currency as 'R-amount.00'.\nOutput JSON actions only after preview confirmation: { "sheets": [ { "sheetName": "Logbook", "actions": [ {"type": "insertRow", "row": ${insertionRow}}, {"type": "updateCell", "row": <target_row_index>, "column": "A", "value": "07/25/2025", "confidence": "high"} ] } ] }\nWhy Simple: Builds on your existing prompt, adds multi-sheet grouping without complexity. Focuses on inference to avoid questions.`
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