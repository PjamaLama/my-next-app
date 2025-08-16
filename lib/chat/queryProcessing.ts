import dayjs from 'dayjs';
import { bestHeaderIndex, detectDateWindow, normalizeToken, parseNumber, structureForDisplay, normalizeDateColumns } from './utils';

const COLUMN_SYNONYMS: Record<string, string[]> = {
  amount: ['amount', 'total', 'cost', 'expense', 'price', 'value', 'fuel cost', 'rands'],
  fuel: ['fuel', 'litre', 'liter', 'liters', 'litres'],
  driver: ['driver', 'driver name', 'operator'],
  vehicle: ['vehicle', 'vehicle reg', 'reg', 'registration', 'plate', 'license'],
  town: ['town', 'city', 'location', 'destination'],
  date: ['date', 'timestamp', 'time'],
  margin: ['margin', 'profit', 'markup', 'gm', 'gross margin', 'net margin']
};

export function resolveColumnIndex(headers: string[], message: string, hints: string[] = []): number {
  for (const h of hints) {
    const idx = bestHeaderIndex(headers, h);
    if (idx >= 0) return idx;
  }
  const msg = message.toLowerCase();
  for (const synonyms of Object.values(COLUMN_SYNONYMS)) {
    for (const word of synonyms) {
      if (msg.includes(word)) {
        const idx = bestHeaderIndex(headers, word);
        if (idx >= 0) return idx;
      }
    }
  }
  let best = -1; let bestScore = 0;
  headers.forEach((h, i) => {
    const norm = normalizeToken(h);
    const score = norm && msg.includes(norm) ? norm.length : 0;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

export function parseSimpleFilter(message: string): { columnQuery: string; value: string; op: 'equals' | 'contains' } | null {
  const m1 = message.match(/\b(?:where|with|filter|only|for)\s+([a-z][a-z0-9_\s]{2,})\s*(?:=|is|equals|to|contains|has)?\s*"?([\w\-\s\.#/]+)"?/i);
  if (m1) {
    const col = m1[1].trim();
    const val = m1[2].trim();
    const hasContains = /contains|has/i.test(m1[0]);
    return { columnQuery: col, value: val, op: hasContains ? 'contains' : 'equals' };
  }
  const m2 = message.match(/\b([a-z][a-z0-9_\s]{2,})\s*:\s*"?([^\n,;]+)"?/i);
  if (m2) {
    return { columnQuery: m2[1].trim(), value: m2[2].trim(), op: 'equals' };
  }
  return null;
}

export function classifyQueryType(message: string) {
    const lower = message.toLowerCase();
    return {
        wantsSum: /(total|sum)\b/i.test(lower),
        wantsAvg: /(average|avg|mean)\b/i.test(lower),
        wantsMin: /\b(min|minimum|lowest|least)\b/i.test(lower),
        wantsMax: /\b(max|maximum|highest|most)\b/i.test(lower),
        wantsCount: /\b(count|how\s+many|number\s+of)\b/i.test(lower),
        groupMatch: lower.match(/\b(?:by|per)\s+([a-z][a-z0-9_\s]{2,})/i),
        wantsMargin: /\b(margin|profit|markup)\b/i.test(lower),
    };
}

export function resolveQueryColumns(message: string, headers: string[], rows: string[][]) {
    const metricIdx = (() => {
        const hints = ['amount', 'total', 'cost', 'expense', 'price', 'value', 'fuel', 'litre', 'liter', 'distance', 'km', 'qty', 'quantity'];
        const direct = resolveColumnIndex(headers, message, hints);
        if (direct >= 0) return direct;
        const fallback = headers.findIndex((_, i) => rows.some((r) => parseNumber(r[i]) != null));
        return fallback >= 0 ? fallback : 0;
    })();

    const productKeyIdx = (() => {
        const idx = bestHeaderIndex(headers, 'product');
        if (idx >= 0) return idx;
        const hints = ['title', 'name', 'handle'];
        for (const h of hints) { const i = bestHeaderIndex(headers, h); if (i >= 0) return i; }
        return -1;
    })();

    const dateIdx = headers.findIndex((h) => /date|timestamp|time/i.test(h));

    return { metricIdx, productKeyIdx, dateIdx };
}

export function performAggregation(rows: string[][], metricIdx: number, groupIdx: number, operation: 'sum' | 'avg' | 'min' | 'max') {
    const map = new Map<string, { sum: number; count: number; min: number; max: number }>();
    for (const r of rows) {
        const key = String(r[groupIdx] ?? 'Unknown');
        const n = parseNumber(r[metricIdx]);
        if (!map.has(key)) map.set(key, { sum: 0, count: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY });
        const rec = map.get(key)!;
        if (n != null) {
            rec.sum += n; rec.count += 1; rec.min = Math.min(rec.min, n); rec.max = Math.max(rec.max, n);
        }
    }
    const entries = Array.from(map.entries()).map(([k, v]) => ({ key: k, ...v }));
    const sortBy = operation === 'avg' ? (e: any) => (e.count ? e.sum / e.count : 0)
                  : operation === 'min' ? (e: any) => e.min
                  : operation === 'max' ? (e: any) => e.max
                  : (e: any) => e.sum;
    entries.sort((a, b) => (sortBy(b) as number) - (sortBy(a) as number));
    return entries;
}

export function applyQueryFilters(rows: string[][], message: string, headers: string[]) {
    const filterSpec = parseSimpleFilter(message);
    if (filterSpec) {
        const idx = resolveColumnIndex(headers, filterSpec.columnQuery);
        if (idx >= 0) {
            return rows.filter((r) => {
                const v = String(r[idx] ?? '').toLowerCase();
                const q = filterSpec.value.toLowerCase();
                return filterSpec.op === 'contains' ? v.includes(q) : v === q;
            });
        }
    }
    return rows;
}
