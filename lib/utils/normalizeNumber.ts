/**
 * Normalize numeric strings into numbers using locale-aware heuristics.
 *
 * Handles inputs like:
 * - "R10,000.00"
 * - "500,500.00"
 * - "$1,234"
 * - "1 000,50" (space thousands, comma decimal)
 * - "(1,234.56)" (accounting negative)
 * - "R10,000.00 incl VAT" (trailing text)
 *
 * Heuristics:
 * - Strip currency symbols/codes and non-numeric text while preserving digits and separators.
 * - Parentheses indicate negative values.
 * - If both '.' and ',' appear, the rightmost separator is assumed to be the decimal separator
 *   (e.g., '1,000.50' → '.' decimal; '1.234,56' → ',' decimal).
 * - If only ',' appears, treat as decimal if the last group has 1-2 digits; otherwise assume thousands.
 * - Spaces are treated as thousands separators and removed.
 * - Percent values are rejected.
 * - Returns null if parsing is not safe or results in NaN.
 */

export type NormalizedNumber = {
  value: number | null;
  raw: string;
  reason?: string;
};

const CURRENCY_SYMBOLS = /[\$€£¥₹₩₦₱₽฿₫₪₴]/g;
const LEADING_CODE_WITH_DOLLAR = /^[A-Z]{1,3}\$\s?(?=\d)/i; // e.g., US$ 123
const LEADING_R_CODE = /^R\$?\s?(?=\d)/i; // e.g., R or R$ 123
const CURRENCY_CODES_WORD_BOUNDARY = /\b(?:USD|EUR|GBP|JPY|INR|KRW|NGN|PHP|RUB|THB|VND|ILS|UAH|CAD|AUD|CHF|BRL|ZAR|MXN|HKD|SGD|TWD|MYR|IDR|CNY|RMB)\b/gi;

export function normalizeNumber(cell: string): NormalizedNumber {
  const raw = cell ?? '';
  let s = raw.trim();

  if (!s) return { value: null, raw, reason: 'empty' };

  // Explicitly reject percents for safety in this helper
  if (s.includes('%')) return { value: null, raw, reason: 'percent_value' };

  // Detect accounting negative via parentheses that contain at least one digit
  const hasAccountingParens = /\((?:[^)]*?\d[^)]*?)\)/.test(s);
  // Detect explicit leading minus
  const hasLeadingMinus = /^\s*-/.test(s);
  const isNegative = hasAccountingParens || hasLeadingMinus;

  // Remove parentheses and leading sign; we will reapply sign later
  s = s.replace(/[()]/g, '');
  s = s.replace(/^\s*[+-]\s*/, '');

  // Remove common currency symbols and codes
  s = s.replace(CURRENCY_SYMBOLS, '');
  s = s.replace(LEADING_CODE_WITH_DOLLAR, '');
  s = s.replace(LEADING_R_CODE, '');
  s = s.replace(CURRENCY_CODES_WORD_BOUNDARY, '');

  // Drop any remaining letters (e.g., trailing text like "incl VAT")
  s = s.replace(/[A-Za-z]/g, '');

  // Keep only digits, separators, and spaces
  s = s.replace(/[^0-9.,\s]/g, '');

  // Ensure we have at least one digit remaining
  if (!/\d/.test(s)) {
    return { value: null, raw, reason: 'no_digits' };
  }

  // Normalize spaces (treat as thousands separators)
  const compact = s.replace(/\s+/g, '');

  const hasDot = compact.includes('.');
  const hasComma = compact.includes(',');

  let normalized: string;

  if (hasDot && hasComma) {
    // Assume the rightmost separator is the decimal separator
    const lastDot = compact.lastIndexOf('.');
    const lastComma = compact.lastIndexOf(',');
    const decimalChar = lastDot > lastComma ? '.' : ',';
    const thousandsChar = decimalChar === '.' ? ',' : '.';

    // Remove thousands, set decimal to '.' using last occurrence
    let tmp = compact.replace(new RegExp('\\' + thousandsChar, 'g'), '');
    const lastIdx = tmp.lastIndexOf(decimalChar);
    if (lastIdx >= 0) {
      tmp = tmp.slice(0, lastIdx) + '.' + tmp.slice(lastIdx + 1);
    }
    normalized = tmp;
  } else if (hasComma && !hasDot) {
    // Decide whether comma is decimal or thousands based on last group size
    const parts = compact.split(',');
    if (parts.length === 1) {
      normalized = parts[0];
    } else if (parts.length > 2) {
      // Multiple commas: likely thousands grouping → remove commas
      normalized = parts.join('');
    } else {
      // Exactly one comma
      const [intPart, lastPart] = parts;
      if (/^\d{1,2}$/.test(lastPart)) {
        // Treat as decimal (e.g., 1 000,50 → 1000.50)
        normalized = intPart + '.' + lastPart;
      } else {
        // Treat as thousands separator
        normalized = intPart + lastPart;
      }
    }
  } else if (hasDot && !hasComma) {
    // Only dot present
    const parts = compact.split('.');
    if (parts.length === 1) {
      normalized = parts[0];
    } else if (parts.length > 2) {
      // If looks like thousands grouping (groups of up to 3, last exactly 3), drop dots; else treat last dot as decimal
      const head = parts.slice(0, -1);
      const tail = parts[parts.length - 1];
      const headGroupsLookLikeThousands = head.every((p) => /^\d{1,3}$/.test(p));
      if (headGroupsLookLikeThousands && /^\d{3}$/.test(tail)) {
        normalized = parts.join('');
      } else {
        const lastIdx = compact.lastIndexOf('.');
        normalized = compact.slice(0, lastIdx).replace(/\./g, '') + '.' + compact.slice(lastIdx + 1);
      }
    } else {
      // Single dot → assume decimal
      normalized = compact;
    }
  } else {
    // Digits only
    normalized = compact;
  }

  // Safety: must still contain digits; must not start with only separators
  if (!/\d/.test(normalized)) {
    return { value: null, raw, reason: 'no_digits_after_normalize' };
  }

  // Remove any stray leading separators
  normalized = normalized.replace(/^[.,]+/, '');

  // As a final guard, ensure normalized matches a simple number pattern
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    // Attempt a relaxed parse: keep first '.' as decimal and remove all others
    const firstDot = normalized.indexOf('.');
    if (firstDot > -1) {
      const before = normalized.slice(0, firstDot).replace(/\./g, '');
      const after = normalized.slice(firstDot + 1).replace(/\./g, '');
      normalized = before + '.' + after;
    }
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return { value: null, raw, reason: 'nan' };
  }

  const value = isNegative ? -parsed : parsed;
  return { value, raw };
}

/**
 * Minimal test usage snippet (see __tests__/utils/normalizeNumber.test.ts for full tests):
 *
 * expect(normalizeNumber('R10,000.00').value).toBe(10000);
 * expect(normalizeNumber('1 000,50').value).toBeCloseTo(1000.5);
 * expect(normalizeNumber('(1,234.56)').value).toBeCloseTo(-1234.56);
 * expect(normalizeNumber('N/A').value).toBeNull();
 */


