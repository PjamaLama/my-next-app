import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);
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


