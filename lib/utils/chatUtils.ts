// Consolidated utilities using comprehensive number parsing

import { normalizeNumber } from './normalizeNumber';

export function bestHeaderIndex(headers: string[], target: string): number {
  if (!Array.isArray(headers) || !target) return -1;

  // Exact match first
  const exact = headers.findIndex(h => h === target);
  if (exact >= 0) return exact;

  // Case-insensitive match
  const lowerTarget = target.toLowerCase();
  const caseInsensitive = headers.findIndex(h => h.toLowerCase() === lowerTarget);
  if (caseInsensitive >= 0) return caseInsensitive;

  // Partial match
  const partial = headers.findIndex(h =>
    h.toLowerCase().includes(lowerTarget) ||
    lowerTarget.includes(h.toLowerCase())
  );
  if (partial >= 0) return partial;

  return -1;
}

// Wrapper around the more comprehensive normalizeNumber function
export function parseNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;

  // Use the comprehensive normalizeNumber function
  const normalized = normalizeNumber(String(value));
  return normalized.value;
}

export function structureForDisplay(table: string[][]): { headers: string[]; rows: string[][] } {
  if (!Array.isArray(table) || table.length === 0) {
    return { headers: [], rows: [] };
  }
  
  const headers = Array.isArray(table[0]) ? table[0] : [];
  const rows = table.slice(1).filter(row => Array.isArray(row));
  
  return { headers, rows };
}
