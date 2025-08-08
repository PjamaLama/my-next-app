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

  // Determine expected column count by the mode of non-empty row lengths (more robust than first row)
  const nonEmptyRows = sheetData.filter(r => (r || []).some(c => String(c ?? '').trim() !== ''));
  const lengthCounts = new Map<number, number>();
  for (const r of nonEmptyRows) {
    const len = r.length;
    lengthCounts.set(len, (lengthCounts.get(len) || 0) + 1);
  }
  const expectedCols = (Array.from(lengthCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]) || (nonEmptyFirstRow.length || Math.max(...sheetData.map(r => r.length)) || 0);
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

  // How much of the expected columns are covered by header-like values
  const headerCoverage = expectedCols > 0 ? Math.min(1, headerCandidates.length / expectedCols) : 0;
  const headerScore = headerCandidates.length >= 3 ? 0.6 : headerCandidates.length === 2 ? 0.45 : headerCandidates.length === 1 ? 0.2 : 0;
  const consistencyScore = dataRows > 0 ? consistentRows / dataRows : 0;
  // Favor precision: default to unstructured unless we are reasonably sure
  const confidence = Math.max(0, Math.min(1, 0.4 * headerScore + 0.6 * consistencyScore));

  // Stricter criteria: require enough header-like cells and decent consistency
  const isStructured = headerCoverage >= 0.6 && consistencyScore >= 0.7 && confidence >= 0.6 && issues.length <= 1;

  return {
    isStructured,
    confidence,
    issues,
    detectedHeaders: headerCandidates.length > 0 ? (firstRow as string[]) : null,
    columnCount: expectedCols,
    dataRowCount: dataRows,
  };
}


