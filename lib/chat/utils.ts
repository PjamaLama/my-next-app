import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import customParseFormat from 'dayjs/plugin/customParseFormat';
dayjs.extend(relativeTime);
dayjs.extend(customParseFormat);
import { analyzeSheetStructure } from '@/lib/sheetStructure';

export function normalizeToken(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function bestHeaderIndex(headers: string[], query: string): number {
  const q = normalizeToken(query);
  const qParts = q.split(' ').filter(Boolean);
  let bestIdx = -1;
  let bestScore = 0;
  headers.forEach((h, i) => {
    const hNorm = normalizeToken(h);
    let score = 0;
    if (hNorm === q) score += 4;
    qParts.forEach((p) => {
      if (p.length >= 3 && hNorm.includes(p)) score += 1;
    });
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });
  return bestIdx;
}

export function detectDateWindow(message: string) {
  const mDays = message.match(/(?:past|last)\s+(\d+)\s+days?/i);
  const mWeek = /(?:past|last)\s+(?:week|7\s*days)/i.test(message);
  const mMonth = /(?:past|last)\s+(?:30\s*days|month)/i.test(message);
  const mRange = message.match(/from\s+([0-9\-\/.\s]+)\s+(?:to|until|through)\s+([0-9\-\/.\s]+)/i);
  const wantToday = /\btoday\b/i.test(message);
  if (mRange) {
    return { start: dayjs(mRange[1]).startOf('day'), end: dayjs(mRange[2]).endOf('day'), label: `Range ${mRange[1]} → ${mRange[2]}` };
  }
  if (wantToday) return { start: dayjs().startOf('day'), end: dayjs().endOf('day'), label: 'Today' };
  if (mDays) {
    const n = parseInt(mDays[1], 10);
    return { start: dayjs().subtract(n, 'day').startOf('day'), end: dayjs().endOf('day'), label: `Last ${n} days` };
  }
  if (mWeek) return { start: dayjs().subtract(7, 'day').startOf('day'), end: dayjs().endOf('day'), label: 'Last 7 days' };
  if (mMonth) return { start: dayjs().subtract(30, 'day').startOf('day'), end: dayjs().endOf('day'), label: 'Last 30 days' };
  return null;
}

export function parseNumber(value: unknown): number | null {
  if (value == null) return null;
  const s = String(value).replace(/[\,\s]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// Reshape messy/unstructured tables into headers + uniform rows for display
export function structureForDisplay(rawTable: string[][]): { headers: string[]; rows: string[][] } {
  const safe: string[][] = Array.isArray(rawTable) ? rawTable.map(r => Array.isArray(r) ? r.map(v => String(v ?? '')) : []) : [];
  if (!safe || safe.length === 0) return { headers: [], rows: [] };
  try {
    const meta = analyzeSheetStructure(safe);
    if (meta && meta.columnCount > 0 && meta.detectedHeaders && (meta.isStructured || meta.confidence >= 0.5)) {
      const width = meta.columnCount;
      const headers = meta.detectedHeaders.slice(0, width).map(h => String(h ?? ''));
      const rows = safe.slice(1).map(r => {
        const shaped = r.slice(0, width).map(v => String(v ?? ''));
        while (shaped.length < width) shaped.push('');
        return shaped;
      }).filter(r => r.some(c => String(c).trim() !== ''));
      return { headers, rows };
    }
  } catch {}
  // Fallback: synthesize headers from first non-empty row, pad rows to width
  const firstNonEmpty = safe.find(r => (r || []).some(v => String(v ?? '').trim() !== '')) || [];
  const width = Math.max(1, firstNonEmpty.length);
  const toLetters = (n: number) => { let s = '', x = n; while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); } return s || 'A'; };
  const headers = Array.from({ length: width }, (_, i) => String(firstNonEmpty[i] ?? '').trim() || `Column ${toLetters(i + 1)}`);
  const rows = safe.slice(1).map(r => {
    const shaped = r.slice(0, width).map(v => String(v ?? ''));
    while (shaped.length < width) shaped.push('');
    return shaped;
  }).filter(r => r.some(c => String(c).trim() !== ''));
  return { headers, rows };
}

// Try to parse a variety of common date/time formats and emit a unified format
const CANDIDATE_DATE_FORMATS: string[] = [
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'DD-MM-YYYY',
  'MM-DD-YYYY',
  'D/M/YYYY',
  'M/D/YYYY',
  'DD MMM YYYY',
  'D MMM YYYY',
  'MMM D, YYYY',
  'YYYY-MM-DDTHH:mm:ss[Z]',
  'YYYY-MM-DDTHH:mm:ssZ',
  'YYYY-MM-DDTHH:mm:ss.SSS[Z]',
  'YYYY-MM-DDTHH:mm:ss.SSSZ',
  'YYYY-MM-DD HH:mm:ss',
  'YYYY/MM/DD HH:mm',
  'YYYY-MM-DDTHH:mm',
];

/**
 * Format a single value into the unified date string if it looks like a date; otherwise return original string.
 * When withTime is true and the parsed value contains time, returns YYYY-MM-DD HH:mm; else returns YYYY-MM-DD.
 */
export function formatUnifiedDate(value: unknown, withTime = false): string {
  const raw = String(value ?? '').trim();
  if (!raw) return raw;
  // Quick ISO/epoch checks
  let d = dayjs(raw);
  if (!d.isValid()) {
    for (const fmt of CANDIDATE_DATE_FORMATS) {
      d = dayjs(raw, fmt, true);
      if (d.isValid()) break;
    }
  }
  if (!d.isValid()) return raw;
  // Decide whether to include time
  const hasTime = !(d.hour() === 0 && d.minute() === 0 && d.second() === 0 && raw.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/));
  const target = withTime && hasTime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD';
  return d.format(target);
}

/**
 * Normalize all date-like columns in a table to the unified format.
 * Heuristics:
 * - Columns with header matching /(date|timestamp|time)/i are normalized.
 * - Additionally, any column where >= 60% of non-empty cells parse as dates is normalized.
 */
export function normalizeDateColumns(headers: string[], rows: string[][]): string[][] {
  if (!Array.isArray(headers) || !Array.isArray(rows) || headers.length === 0 || rows.length === 0) return rows;
  const lowerHeaders = headers.map(h => String(h || '').toLowerCase());
  const candidateIdxs = new Set<number>();
  lowerHeaders.forEach((h, i) => {
    if (/(^|\b)(date|timestamp|time)($|\b)/i.test(h)) candidateIdxs.add(i);
  });
  const width = headers.length;
  for (let c = 0; c < width; c++) {
    if (candidateIdxs.has(c)) continue;
    let total = 0;
    let parsed = 0;
    for (const r of rows) {
      const v = String((r || [])[c] ?? '').trim();
      if (!v) continue;
      total += 1;
      let d = dayjs(v);
      if (!d.isValid()) {
        for (const fmt of CANDIDATE_DATE_FORMATS) {
          d = dayjs(v, fmt, true);
          if (d.isValid()) break;
        }
      }
      if (d.isValid()) parsed += 1;
    }
    if (total > 0 && parsed / total >= 0.6) candidateIdxs.add(c);
  }

  if (candidateIdxs.size === 0) return rows;
  const includeTime = (idx: number) => /(timestamp|time)/i.test(lowerHeaders[idx] || '');
  return rows.map(row => row.map((cell, i) => (candidateIdxs.has(i) ? formatUnifiedDate(cell, includeTime(i)) : cell)));
}


