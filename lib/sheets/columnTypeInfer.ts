/**
 * Column type inference utilities for sheet-like tabular data.
 *
 * Heuristics:
 * - If >60% of non-empty cells parse as a valid number/currency → inferred as 'number' or 'currency'
 *   (we prefer 'currency' if a meaningful share look like currency, score is the valid fraction).
 * - If values match common date formats → 'date' (score is the valid fraction).
 * - If mixed numeric and non-numeric but many numeric-like → 'maybe_number' (score is the numeric-like fraction).
 * - Otherwise → 'string' (score is the non-empty, non-numeric, non-date fraction).
 *
 * Examples capture up to the first 5 non-empty cells for each column.
 */

export type InferredType = 'number' | 'currency' | 'date' | 'string' | 'maybe_number';

export type ColumnType = {
  header: string;
  index: number;
  inferredType: InferredType;
  score: number; // 0..1
  examples: string[];
};

/**
 * Infer column types given headers and sample rows.
 *
 * @param headers - Column headers
 * @param sampleRows - A sample of rows; each row is an array of cell strings aligned to headers
 * @returns An array of inferred column types, one per header
 */
export function inferColumnTypes(headers: string[], sampleRows: string[][]): ColumnType[] {
  const columnCount = headers.length;

  const results: ColumnType[] = [];

  for (let colIndex = 0; colIndex < columnCount; colIndex++) {
    const header = headers[colIndex] ?? '';

    let nonEmptyCount = 0;
    let numericCount = 0;
    let currencyCount = 0;
    let dateCount = 0;

    const examples: string[] = [];

    for (const row of sampleRows) {
      const value = (row?.[colIndex] ?? '').toString().trim();
      if (value.length === 0) continue;

      nonEmptyCount++;

      // Gather examples (first 5)
      if (examples.length < 5) {
        examples.push(value);
      }

      // Date detection
      if (isDateLike(value)) {
        dateCount++;
        continue;
      }

      // Numeric / Currency detection
      const parsed = parseCurrencyOrNumber(value);
      if (parsed.isNumeric) {
        numericCount++;
        if (parsed.isCurrency) {
          currencyCount++;
        }
      }
    }

    let inferredType: InferredType = 'string';
    let score = 0;

    if (nonEmptyCount === 0) {
      inferredType = 'string';
      score = 0;
    } else {
      const pctNumeric = numericCount / nonEmptyCount;
      const pctDate = dateCount / nonEmptyCount;
      const pctCurrencyOfNumeric = numericCount > 0 ? currencyCount / numericCount : 0;

      // Date has priority if strong enough, to avoid numeric-like dates being misclassified
      if (pctDate >= 0.6) {
        inferredType = 'date';
        score = clamp01(pctDate);
      } else if (pctNumeric >= 0.6) {
        // Distinguish currency from number if a meaningful portion looks like currency
        if (pctCurrencyOfNumeric >= 0.3) {
          inferredType = 'currency';
        } else {
          inferredType = 'number';
        }
        score = clamp01(pctNumeric);
      } else if (pctNumeric >= 0.3) {
        inferredType = 'maybe_number';
        score = clamp01(pctNumeric);
      } else {
        inferredType = 'string';
        // Score reflects the share that is neither date nor numeric-like
        score = clamp01((nonEmptyCount - numericCount - dateCount) / nonEmptyCount);
      }
    }

    results.push({
      header,
      index: colIndex,
      inferredType,
      score,
      examples,
    });
  }

  return results;
}

/**
 * Pick the "best" numeric-like column index using heuristics and optional header hint keywords.
 *
 * - Prefers columns inferred as 'currency' or 'number' with higher scores.
 * - Considers 'maybe_number' if its score is reasonably high.
 * - Applies a small boost when the header includes a hint keyword.
 *
 * @param headers - Column headers
 * @param sampleRows - Sample rows for inference
 * @param hintKeywords - Case-insensitive keywords to boost relevant headers
 * @returns Best column index or null if none is suitable
 */
export function pickBestNumericColumn(
  headers: string[],
  sampleRows: string[][],
  hintKeywords: string[] = ['sale', 'sales', 'amount', 'total'],
): number | null {
  const inferred = inferColumnTypes(headers, sampleRows);

  let bestIndex: number | null = null;
  let bestScore = -Infinity;

  for (const col of inferred) {
    let base = 0;

    if (col.inferredType === 'currency') base = 1.0 * col.score;
    else if (col.inferredType === 'number') base = 0.95 * col.score;
    else if (col.inferredType === 'maybe_number' && col.score >= 0.4) base = 0.7 * col.score;
    else continue; // skip string/date

    // Header keyword boost
    const headerLower = (col.header || '').toLowerCase();
    const hasHint = hintKeywords.some((kw) => headerLower.includes(kw.toLowerCase()));
    const boost = hasHint ? 0.1 : 0;

    const finalScore = base + boost;

    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestIndex = col.index;
    }
  }

  return bestIndex;
}

/* ------------------------------ internals ------------------------------ */

const CURRENCY_SYMBOLS = ['$', '€', '£', '¥', '₹', '₩', '₦', '₱', '₽', '฿', '₫', '₪', '₴'];
const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'KRW', 'NGN', 'PHP', 'RUB', 'THB', 'VND', 'ILS', 'UAH', 'CAD', 'AUD', 'CHF', 'BRL', 'ZAR', 'MXN'];

/**
 * Parses a string to determine if it is numeric or currency-like.
 * - Excludes percent values (contains '%').
 * - Handles parentheses as negatives, commas as thousands separators, and currency symbols/codes.
 */
function parseCurrencyOrNumber(raw: string): { isNumeric: boolean; isCurrency: boolean } {
  const value = raw.trim();

  if (value.length === 0) return { isNumeric: false, isCurrency: false };
  if (value.includes('%')) return { isNumeric: false, isCurrency: false }; // treat percents as non-numeric for these heuristics

  // Detect currency signals on the raw string
  const hasSymbol = CURRENCY_SYMBOLS.some((s) => value.includes(s));
  const hasCode =
    new RegExp(`(?:^|\\s)(?:${CURRENCY_CODES.join('|')})(?:\\s|$)`, 'i').test(value) ||
    /R\$\s?/.test(value); // simple BRL "R$" support

  const hasAccountingParens = /^\(.*\)$/.test(value);

  // Normalize for numeric parsing
  let normalized = value.replace(/[,\s]/g, ''); // remove thousands separators/spaces
  normalized = normalized.replace(/[+$]/g, ''); // remove stray plus or trailing dollar if any
  normalized = normalized.replace(/[€£¥₹₩₦₱₽฿₫₪₴]/g, ''); // remove currency symbols
  normalized = normalized.replace(/\((.*)\)/, '-$1'); // accounting negative
  normalized = normalized.replace(/\b(?:USD|EUR|GBP|JPY|INR|KRW|NGN|PHP|RUB|THB|VND|ILS|UAH|CAD|AUD|CHF|BRL|ZAR|MXN)\b/gi, '');
  normalized = normalized.trim();

  // If the value uses comma as decimal (e.g., "123,45") our removal might over-normalize; this heuristic aims for common en-US style.
  const isNumeric = /^-?\d+(\.\d+)?$/.test(normalized);

  const isCurrency = isNumeric && (hasSymbol || hasCode || hasAccountingParens);

  return { isNumeric, isCurrency };
}

/**
 * Checks whether a string looks like a date using common patterns, then validates with Date.parse.
 */
function isDateLike(value: string): boolean {
  const v = value.trim();

  if (v.length === 0) return false;

  // Common date patterns
  const patterns: RegExp[] = [
    /^\d{4}-\d{2}-\d{2}$/, // 2024-01-31
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // 01/31/2024 or 1/31/24
    /^\d{1,2}-\d{1,2}-\d{2,4}$/, // 31-01-2024
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s*\d{4}$/i, // Jan 31, 2024
    /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}$/i, // 31 Jan 2024
    /^\d{4}\/\d{1,2}\/\d{1,2}$/, // 2024/01/31
    /^\d{4}\.\d{1,2}\.\d{1,2}$/, // 2024.01.31
    /^\d{4}-\d{2}-\d{2}T.*Z?$/, // ISO datetime
  ];

  const looksLikeDate = patterns.some((re) => re.test(v));
  if (!looksLikeDate) return false;

  const parsed = Date.parse(v);
  return Number.isFinite(parsed);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/* ----------------------------------------------------------------------- */
/* -------------------------- Usage snippet (test) ------------------------ */
/* ----------------------------------------------------------------------- */
/**
 * Example (for unit tests or ad-hoc checks):
 *
 * const headers = ['Date', 'Sales', 'Region', 'Notes'];
 * const rows = [
 *   ['2024-01-01', '$123.45', 'North', 'First day'],
 *   ['2024-01-02', '€234.50', 'East', 'Promo'],
 *   ['2024-02-15', '1,000', 'West', ''],
 *   ['01/31/2024', '(2,345.67)', 'South', 'End of month'],
 *   ['', 'N/A', 'Central', 'no amount'],
 * ];
 *
 * const inferred = inferColumnTypes(headers, rows);
 * // inferred might look like:
 * // [
 * //   { header: 'Date', index: 0, inferredType: 'date', score: ~1.0, examples: ['2024-01-01', '2024-01-02', '2024-02-15', '01/31/2024'] },
 * //   { header: 'Sales', index: 1, inferredType: 'currency' | 'number', score: ~0.75+, examples: ['$123.45', '€234.50', '1,000', '(2,345.67)', 'N/A'] },
 * //   { header: 'Region', index: 2, inferredType: 'string', score: ~1.0, examples: ['North', 'East', 'West', 'South', 'Central'] },
 * //   { header: 'Notes', index: 3, inferredType: 'string', score: ~1.0, examples: ['First day', 'Promo', '', 'End of month', 'no amount'] },
 * // ]
 *
 * const bestNumericIdx = pickBestNumericColumn(headers, rows);
 * // bestNumericIdx should be 1 (the 'Sales' column)
 *
 * // In a Jest test, for example:
 * // expect(inferred[0].inferredType).toBe('date');
 * // expect(['currency', 'number']).toContain(inferred[1].inferredType);
 * // expect(bestNumericIdx).toBe(1);
 */