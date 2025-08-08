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
  const totalRows = sheetData.length;
  const firstRow = sheetData[0] || [];

  // Basic heuristics
  const nonEmptyFirstRow = firstRow.filter(c => String(c ?? '').trim() !== '');
  const headerCandidates = nonEmptyFirstRow.filter(looksLikeHeaderCell);
  const uniqueHeaderCount = new Set(headerCandidates.map(h => String(h).toLowerCase())).size;

  if (headerCandidates.length === 0) {
    issues.push('First row does not appear to contain headers.');
  }
  if (uniqueHeaderCount !== headerCandidates.length) {
    issues.push('Duplicate-like values found in first row.');
  }

  // Check row width consistency against first non-empty row width
  const expectedCols = nonEmptyFirstRow.length || Math.max(...sheetData.map(r => r.length));
  let consistentRows = 0;
  let dataRows = 0;
  for (let i = 1; i < sheetData.length; i++) {
    const row = sheetData[i] || [];
    const nonEmpty = row.some(c => String(c ?? '').trim() !== '');
    if (!nonEmpty) continue;
    dataRows++;
    // consider consistent when row length is within +/- 1 of expected and not drastically sparse
    const width = row.length;
    const filled = row.filter(c => String(c ?? '').trim() !== '').length;
    if (Math.abs(width - expectedCols) <= 1 && filled >= Math.max(1, Math.floor(expectedCols * 0.5))) {
      consistentRows++;
    }
  }

  if (dataRows === 0) {
    issues.push('No data rows found.');
  }

  const headerScore = headerCandidates.length >= 2 ? 0.5 : headerCandidates.length === 1 ? 0.25 : 0;
  const consistencyScore = dataRows > 0 ? consistentRows / dataRows : 0;
  const confidence = Math.max(0, Math.min(1, 0.5 * headerScore + 0.5 * consistencyScore));

  const isStructured = confidence >= 0.55 && issues.length <= 1;

  return {
    isStructured,
    confidence,
    issues,
    detectedHeaders: headerCandidates.length > 0 ? (firstRow as string[]) : null,
    columnCount: expectedCols,
    dataRowCount: dataRows,
  };
}


