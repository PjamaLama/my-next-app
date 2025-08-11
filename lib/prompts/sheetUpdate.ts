export type SheetUpdatePromptVars = {
  transcript: string;
  sheetName: string;
  lastDataRow: number;
  insertionRow: number;
  headers: string; // comma separated
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
    'CRITICAL RULES:',
    '1. If a matching row exists for the user\'s intent (e.g., a row for "today"), DO NOT insert a new row. Emit ONLY updateCell actions targeting the matched row.',
    '2. Only insert a new row when there is no suitable existing row to update. When inserting, use the insertionRow or higher and keep formula/summary rows intact.',
    '3. For multiple entries, increment row numbers starting from insertionRow when inserting.',
    '4. When updating, target the exact row index determined by the match (e.g., matchingRowForToday).',
    '5. Base suggested values on the user\'s request and existing data patterns.',
    '6. If the extracted data contains multiple entries, create a separate row for EACH entry only when there is no existing matching row for each entry.',
    '7. When the user indicates "today", "now", or omits a date for a date/time column, use the CURRENT DATE/TIME CONTEXT above.',
    '',
    'Output your response in this EXACT JSON format:',
    '{',
    '  "actions": [',
    '    {',
    '      "type": "insertRow",',
    `      "sheet": "${sheetName}",`,
    '      "row": <insertion_row_or_higher>',
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
  ].join('\n');
}


