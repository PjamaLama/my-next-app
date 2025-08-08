export interface SheetStructureMeta {
  isStructured: boolean;
  confidence: number; // 0..1
  issues: string[];
  detectedHeaders: string[] | null;
  columnCount: number;
  dataRowCount: number;
}

function looksLikeHeaderCell(value: unknown): boolean {
  const text = String(value ?? '').trim();
  if (!text) return false;
  // Reject values that are mostly numeric
  const numeric = /^[-+]?\d*[.,]?\d+(e[-+]?\d+)?$/i.test(text.replace(/[, ]/g, ''));
  if (numeric) return false;
  // Short tokens like "x" or single punctuation are not headers
  if (text.length < 2) return false;
  return true;
}

export function analyzeSheetStructure(sheetData: string[][]): SheetStructureMeta {
  const issues: string[] = [];

  // Guard: empty sheet
  if (!sheetData || sheetData.length === 0) {
    return {
      isStructured: false,
      confidence: 0,
      issues: ['Sheet has no rows.'],
      detectedHeaders: null,
      columnCount: 0,
      dataRowCount: 0,
    };
  }

  const headerRow = (sheetData[0] || []).map(v => String(v ?? ''));

  // Determine header span: last non-empty cell in first row
  let headerLastIdx = -1;
  for (let i = headerRow.length - 1; i >= 0; i--) {
    if (headerRow[i].trim() !== '') {
      headerLastIdx = i;
      break;
    }
  }
  const headerCount = Math.max(0, headerLastIdx + 1);

  // Validate headers: all cells within header span must be non-empty and look like header text
  let headerValid = headerCount > 0;
  if (!headerValid) {
    issues.push('First row does not appear to contain headers.');
  }
  for (let i = 0; i < headerCount; i++) {
    const cell = headerRow[i];
    if (cell.trim() === '') {
      headerValid = false;
      issues.push(`Header cell at column ${i + 1} is empty.`);
    } else if (!looksLikeHeaderCell(cell)) {
      headerValid = false;
      issues.push(`Header cell at column ${i + 1} does not look like a header (likely numeric or too short).`);
    }
  }

  // Check uniformity: every non-empty data row must NOT have any non-empty cell beyond headerCount
  let dataRows = 0;
  let conformingRows = 0;
  for (let r = 1; r < sheetData.length; r++) {
    const row = sheetData[r] || [];
    const hasAnyData = (row || []).some(c => String(c ?? '').trim() !== '');
    if (!hasAnyData) continue; // ignore blank rows
    dataRows++;

    // Find last non-empty index in this row
    let lastNonEmptyIdx = -1;
    for (let c = row.length - 1; c >= 0; c--) {
      if (String(row[c] ?? '').trim() !== '') {
        lastNonEmptyIdx = c;
        break;
      }
    }

    if (lastNonEmptyIdx < headerCount) {
      // No data beyond header span → conforms (missing cells are allowed)
      conformingRows++;
    } else {
      // There is data at or beyond headerCount → violation
      issues.push(`Row ${r + 1} has data beyond header columns (column ${lastNonEmptyIdx + 1} > ${headerCount}).`);
    }
  }

  if (dataRows === 0) {
    issues.push('No data rows found.');
  }

  // Confidence as fraction of conforming rows among data rows
  const confidence = dataRows > 0 ? conformingRows / dataRows : 0;
  const isStructured = headerValid && dataRows > 0 && conformingRows === dataRows;

  return {
    isStructured,
    confidence,
    issues,
    detectedHeaders: headerCount > 0 ? (headerRow.slice(0, headerCount) as string[]) : null,
    columnCount: headerCount,
    dataRowCount: dataRows,
  };
}


