export interface SheetStructureMeta {
  isStructured: boolean;
  confidence: number; // 0..1
  issues: string[];
  detectedHeaders: string[] | null;
  columnCount: number;
  dataRowCount: number;
  detectedHeaderRowIndex?: number; // 0-based index of header row when not first
}

function looksLikeHeaderCell(value: unknown): boolean {
  // Relaxed per spec: any non-empty string counts as a header label.
  const text = String(value ?? '').trim();
  return text.length > 0;
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

  // Relaxed header validation: first row is a header row if it has at least one non-empty cell.
  const nonEmptyHeaderCells = headerRow.filter(c => String(c ?? '').trim() !== '');
  const headerCount = nonEmptyHeaderCells.length;
  const headerValid = headerCount > 0;
  if (!headerValid) {
    issues.push('First row does not appear to contain headers.');
  }

  // Count data rows: any non-empty row below the header counts as data.
  // We intentionally do NOT penalize rows that have values beyond the header span;
  // sheets are considered structured if the first row is headers and there are data rows,
  // even when later rows have empty cells or extra cells populated.
  let dataRows = 0;
  for (let r = 1; r < sheetData.length; r++) {
    const row = sheetData[r] || [];
    const hasAnyData = (row || []).some(c => String(c ?? '').trim() !== '');
    if (!hasAnyData) continue; // ignore blank rows
    dataRows++;
  }

  if (dataRows === 0) {
    issues.push('No data rows found.');
  }

  // Confidence: with the relaxed definition, treat valid headers + presence of data as high confidence
  const confidence = headerValid && dataRows > 0 ? 1 : 0;
  const isStructured = headerValid && dataRows > 0;

  return {
    isStructured,
    confidence,
    issues,
    detectedHeaders: headerCount > 0 ? (nonEmptyHeaderCells as string[]) : null,
    columnCount: headerCount,
    dataRowCount: dataRows,
    detectedHeaderRowIndex: 0,
  };
}

// Heuristic header-row detection for messy sheets: scans the first N rows and picks the best candidate.
export function detectHeaderRow(sheetData: string[][], maxScanRows: number = 10): { rowIndex: number; confidence: number } {
  if (!sheetData || sheetData.length === 0) return { rowIndex: 0, confidence: 0 };
  const limit = Math.min(maxScanRows, sheetData.length);
  let bestIdx = 0;
  let bestScore = -Infinity;

  for (let r = 0; r < limit; r++) {
    const row = (sheetData[r] || []).map(v => String(v ?? ''));
    const width = row.length;
    if (width === 0) continue;

    // features
    let nonEmpty = 0;
    let numericLike = 0;
    let shortTokens = 0;
    const tokenSet = new Set<string>();
    for (const cell of row) {
      const s = cell.trim();
      if (!s) continue;
      nonEmpty++;
      if (/^[-+]?\d+[\d,\.]*$/.test(s)) numericLike++;
      const toks = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);
      toks.forEach(t => tokenSet.add(t));
      shortTokens += toks.filter(t => t.length < 2).length;
    }

    const density = nonEmpty / Math.max(1, width); // prefer more filled header rows
    const numericPenalty = numericLike / Math.max(1, nonEmpty); // headers should not be mostly numbers
    const diversity = tokenSet.size / Math.max(1, nonEmpty); // prefer diverse tokens
    const shortPenalty = shortTokens / Math.max(1, nonEmpty);

    // score: higher density + diversity, lower numeric and short token ratios
    const score = 1.5 * density + 1.2 * diversity - 1.0 * numericPenalty - 0.5 * shortPenalty - 0.02 * r; // slight bias for earlier rows
    if (score > bestScore) {
      bestScore = score;
      bestIdx = r;
    }
  }

  // crude normalization to 0..1
  const confidence = Math.max(0, Math.min(1, 0.5 + bestScore / 3));
  return { rowIndex: bestIdx, confidence };
}

// Detect multiple table blocks in a single sheet by scanning for header-like rows,
// then extending a block until a strong break (two blank rows) or next header.
export function detectTableBlocks(
  sheetData: string[][],
  options: { maxScanRows?: number; minHeaderNonEmptyRatio?: number } = {}
): Array<{ headerRowIndex: number; startRowIndex: number; endRowIndex: number; score: number }> {
  if (!sheetData || sheetData.length === 0) return [];
  const maxScan = options.maxScanRows ?? Math.min(50, sheetData.length);
  const minRatio = options.minHeaderNonEmptyRatio ?? 0.3;

  const isHeaderLike = (row: string[]): { ok: boolean; score: number } => {
    const cells = (row || []).map(v => String(v ?? ''));
    const width = cells.length || 1;
    let nonEmpty = 0, numeric = 0;
    const tokenSet = new Set<string>();
    for (const c of cells) {
      const s = c.trim();
      if (!s) continue;
      nonEmpty++;
      if (/^[-+]?\d+[\d,\.]*$/.test(s)) numeric++;
      s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean).forEach(t => tokenSet.add(t));
    }
    const density = nonEmpty / width;
    const numericPenalty = numeric / Math.max(1, nonEmpty);
    const diversity = tokenSet.size / Math.max(1, nonEmpty);
    const score = 1.2 * density + 1.0 * diversity - numericPenalty;
    return { ok: density >= minRatio && numericPenalty < 0.5, score };
  };

  const blocks: Array<{ headerRowIndex: number; startRowIndex: number; endRowIndex: number; score: number }> = [];
  let r = 0;
  while (r < maxScan) {
    const row = sheetData[r] || [];
    const hdr = isHeaderLike(row);
    if (hdr.ok) {
      const headerRowIndex = r;
      // extend down until two consecutive blank rows or another header-like row
      let end = Math.min(sheetData.length - 1, headerRowIndex + 1);
      let blankRun = 0;
      for (let i = headerRowIndex + 1; i < sheetData.length; i++) {
        const cells = sheetData[i] || [];
        const hasAny = cells.some(c => String(c ?? '').trim() !== '');
        const nextIsHeader = i < maxScan && isHeaderLike(cells).ok;
        if (!hasAny) blankRun++;
        else blankRun = 0;
        if (blankRun >= 2 || nextIsHeader) { end = i - 1; break; }
        end = i;
      }
      blocks.push({ headerRowIndex, startRowIndex: headerRowIndex, endRowIndex: end, score: hdr.score });
      r = end + 1;
    } else {
      r++;
    }
  }
  return blocks;
}


