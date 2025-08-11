import dayjs from 'dayjs';
import { StructuredTable } from './types';
import { bestHeaderIndex, detectDateWindow, normalizeToken, parseNumber, structureForDisplay, normalizeDateColumns } from './utils';

export type QAResult = { answer: string; tables?: StructuredTable[] } | null;

const COLUMN_SYNONYMS: Record<string, string[]> = {
  amount: ['amount', 'total', 'cost', 'expense', 'price', 'value', 'fuel cost', 'rands'],
  fuel: ['fuel', 'litre', 'liter', 'liters', 'litres'],
  driver: ['driver', 'driver name', 'operator'],
  vehicle: ['vehicle', 'vehicle reg', 'reg', 'registration', 'plate', 'license'],
  town: ['town', 'city', 'location', 'destination'],
  date: ['date', 'timestamp', 'time'],
  margin: ['margin', 'profit', 'markup', 'gm', 'gross margin', 'net margin']
};

function resolveColumnIndex(headers: string[], message: string, hints: string[] = []): number {
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

function parseSimpleFilter(message: string): { columnQuery: string; value: string; op: 'equals' | 'contains' } | null {
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

export function answerQuestionFromSheets(
  message: string,
  hydratedSheetData: Record<string, string[][]>,
  selectedSheetNames: string[]
): QAResult {
  if (!hydratedSheetData || Object.keys(hydratedSheetData).length === 0) return null;

  const lower = message.toLowerCase();
  const wantsSum = /(total|sum)\b/i.test(message);
  const wantsAvg = /(average|avg|mean)\b/i.test(message);
  const wantsMin = /\b(min|minimum|lowest|least)\b/i.test(message);
  const wantsMax = /\b(max|maximum|highest|most)\b/i.test(message);
  const wantsCount = /\b(count|how\s+many|number\s+of)\b/i.test(message);
  const groupMatch = message.match(/\b(?:by|per)\s+([a-z][a-z0-9_\s]{2,})/i);

  const candidateNames = selectedSheetNames.length > 0 ? selectedSheetNames : Object.keys(hydratedSheetData);
  const sheetName = candidateNames.find((n) => lower.includes(normalizeToken(n))) || candidateNames[0];
  const table = hydratedSheetData[sheetName] || [];
  if (table.length === 0) return null;
  const shaped = structureForDisplay(table);
  const headers = shaped.headers;
  const rows = shaped.rows;
  if (headers.length === 0 || rows.length === 0) return null;

  const range = detectDateWindow(message);
  const dateIdx = headers.findIndex((h) => /date|timestamp|time/i.test(h));
  const filtered = range && dateIdx >= 0
    ? rows.filter((r) => {
        const d = dayjs(String(r[dateIdx] || ''));
        return d.isValid() && (d.isAfter(range.start) || d.isSame(range.start)) && (d.isBefore(range.end) || d.isSame(range.end));
      })
    : rows;

  const metricIdx = (() => {
    const hints = ['amount', 'total', 'cost', 'expense', 'price', 'value', 'fuel', 'litre', 'liter', 'distance', 'km', 'qty', 'quantity'];
    const direct = resolveColumnIndex(headers, message, hints);
    if (direct >= 0) return direct;
    const fallback = headers.findIndex((_, i) => filtered.some((r) => parseNumber(r[i]) != null));
    return fallback >= 0 ? fallback : 0;
  })();

  const wantsMargin = /\b(margin|profit|markup)\b/i.test(message);
  const productKeyIdx = (() => {
    const idx = bestHeaderIndex(headers, 'product');
    if (idx >= 0) return idx;
    const hints = ['title', 'name', 'handle'];
    for (const h of hints) { const i = bestHeaderIndex(headers, h); if (i >= 0) return i; }
    return -1;
  })();

  const vals = filtered.map((r) => parseNumber(r[metricIdx])).filter((n): n is number => n != null);
  if (vals.length === 0 && !wantsCount) return null;

  const aggTitle = (t: string) => `${t}(${headers[metricIdx]})${range?.label ? ` · ${range.label}` : ''}`;
  const baseTitle = `${sheetName}${range?.label ? ` · ${range.label}` : ''}`;

  const filterSpec = parseSimpleFilter(message);
  let rowsForAgg = filtered;
  if (filterSpec) {
    const idx = resolveColumnIndex(headers, filterSpec.columnQuery);
    if (idx >= 0) {
      rowsForAgg = filtered.filter((r) => {
        const v = String(r[idx] ?? '').toLowerCase();
        const q = filterSpec.value.toLowerCase();
        return filterSpec.op === 'contains' ? v.includes(q) : v === q;
      });
    }
  }

  // Pick a likely item label column for row identification in follow-ups
  const labelIdx = (() => {
    const hints = ['product', 'title', 'name', 'handle'];
    for (const h of hints) { const i = bestHeaderIndex(headers, h); if (i >= 0) return i; }
    return -1;
  })();

  // Exact numeric target lookup, e.g. "which item cost 5700"
  try {
    const numericMatch = message.match(/\b(\d+(?:\.\d+)?)\b/);
    if (numericMatch && labelIdx >= 0 && metricIdx >= 0) {
      const target = parseFloat(numericMatch[1]);
      if (Number.isFinite(target)) {
        const matches = rowsForAgg.filter(r => {
          const n = parseNumber(r[metricIdx]);
          return n != null && Math.abs(n - target) < 1e-6;
        });
        if (matches.length > 0) {
          const rowsOut = matches.slice(0, 10).map(r => [String(r[labelIdx] ?? ''), String(parseNumber(r[metricIdx]) ?? '')]);
          return {
            answer: `Item(s) with ${headers[metricIdx]} = ${target}: ${rowsOut[0][0]}${rowsOut.length > 1 ? ` (+${rowsOut.length - 1} more)` : ''}.`,
            tables: [{ title: `${sheetName} · Matches`, headers: [headers[labelIdx], headers[metricIdx]], rows: rowsOut }]
          };
        }
      }
    }
  } catch {}

  if (wantsMargin) {
    const priceIdxCandidates = ['price', 'sell price', 'list price', 'amount', 'total'];
    const costIdxCandidates = ['cost', 'cost per item', 'item cost', 'avg cost', 'average cost'];
    const priceIdx = resolveColumnIndex(headers, message, priceIdxCandidates);
    const costIdx  = resolveColumnIndex(headers, message, costIdxCandidates);

    if (priceIdx >= 0 && costIdx >= 0 && productKeyIdx >= 0) {
      const map = new Map<string, { sum: number; count: number }>();
      for (const r of rowsForAgg) {
        const key = String(r[productKeyIdx] ?? 'Unknown');
        const price = parseNumber(r[priceIdx]);
        const cost  = parseNumber(r[costIdx]);
        if (price != null && cost != null) {
          const margin = price - cost;
          const prev = map.get(key) || { sum: 0, count: 0 };
          prev.sum += margin; prev.count += 1;
          map.set(key, prev);
        }
      }
      if (map.size > 0) {
        const entries = Array.from(map.entries()).map(([k, v]) => ({ key: k, avg: v.count ? v.sum / v.count : 0, count: v.count }));
        entries.sort((a, b) => b.avg - a.avg);

        const top = entries.slice(0, 10);
        const rowsOut = top.map(e => [e.key, String(Number(e.avg.toFixed(2))), String(e.count)]);
        const tables: StructuredTable[] = [{
          title: `${sheetName} · Best avg margin by ${headers[productKeyIdx]}`,
          headers: [headers[productKeyIdx], 'Avg Margin', 'Count'],
          rows: normalizeDateColumns([headers[productKeyIdx], 'Avg Margin', 'Count'], rowsOut)
        }];
        const best = top[0];
        const answer = `Best average margin: ${best?.key ?? 'n/a'} (${best ? Number(best.avg.toFixed(2)) : 0}).`;
        return { answer, tables };
      }
    }
  }

  if (groupMatch) {
    const groupIdx = bestHeaderIndex(headers, groupMatch[1].trim());
    if (groupIdx >= 0) {
      const map = new Map<string, { sum: number; count: number; min: number; max: number }>();
      for (const r of rowsForAgg) {
        const key = String(r[groupIdx] ?? 'Unknown');
        const n = parseNumber(r[metricIdx]);
        if (!map.has(key)) map.set(key, { sum: 0, count: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY });
        const rec = map.get(key)!;
        if (n != null) {
          rec.sum += n; rec.count += 1; rec.min = Math.min(rec.min, n); rec.max = Math.max(rec.max, n);
        }
      }
      const entries = Array.from(map.entries()).map(([k, v]) => ({ key: k, ...v }));
      const sortBy = wantsAvg ? (e: any) => (e.count ? e.sum / e.count : 0)
                  : wantsMin ? (e: any) => e.min
                  : wantsMax ? (e: any) => e.max
                  : (e: any) => e.sum;
      entries.sort((a, b) => (sortBy(b) as number) - (sortBy(a) as number));
      const top = entries.slice(0, 10);
      const rowsOut = top.map(e => [e.key, String(Number(e.sum.toFixed(2))), String(e.count)]);
      const tables: StructuredTable[] = [{
        title: `${sheetName} · by ${headers[groupIdx]}${range?.label ? ` · ${range.label}` : ''}`,
        headers: [headers[groupIdx], `Sum(${headers[metricIdx]})`, 'Count'],
        rows: normalizeDateColumns([headers[groupIdx], `Sum(${headers[metricIdx]})`, 'Count'], rowsOut)
      }];
      const best = top[0];
      if (!best) return null;
      let metricValue: number;
      if (wantsAvg) metricValue = best.count ? best.sum / best.count : 0;
      else if (wantsMin) metricValue = best.min;
      else if (wantsMax) metricValue = best.max;
      else metricValue = best.sum;
      const label = wantsAvg ? 'Average' : wantsMin ? 'Min' : wantsMax ? 'Max' : 'Total';
      const answer = `${label} ${headers[metricIdx]} by ${headers[groupIdx]}: ${Number(metricValue.toFixed(2))} (top: ${best.key}).`;
      return { answer, tables };
    }
  }

  if (wantsCount) {
    const uniqueHint = /(unique|distinct)\b/i.test(message);
    const columnMatch = message.match(/\b(?:of|in|for)?\s*([a-z][a-z0-9_\s]{2,})\b(?:\s+column)?/i);
    let direct = '';
    if (columnMatch) direct = columnMatch[1].trim();
    const idx = resolveColumnIndex(headers, direct || message);
    if (idx >= 0 && (uniqueHint || /\b(products?|drivers?|vehicles?|items?)\b/i.test(message))) {
      const values = rowsForAgg.map(r => String(r[idx] ?? '')).filter(v => v.trim() !== '');
      const unique = new Set(values.map(v => v.toLowerCase())).size;
      const label = headers[idx];
      const answer = uniqueHint
        ? `Distinct ${label}${range?.label ? ` ${range.label}` : ''}: ${unique}.`
        : `Count of ${label}${range?.label ? ` ${range.label}` : ''}: ${values.length}.`;
      return { answer };
    }
    const answer = `Count${range?.label ? ` ${range.label}` : ''}: ${rowsForAgg.length} row(s) in ${baseTitle}.`;
    return { answer };
  }
  if (wantsSum || wantsAvg || wantsMin || wantsMax) {
    const vals2 = rowsForAgg.map((r) => parseNumber(r[metricIdx])).filter((n): n is number => n != null);
    const total = vals2.reduce((a, b) => a + b, 0);
    const avg = vals2.length ? total / vals2.length : 0;
    const min = vals2.length ? Math.min(...vals2) : 0;
    const max = vals2.length ? Math.max(...vals2) : 0;
    let answer = '';
    let tables: StructuredTable[] | undefined;
    if (wantsSum) answer = `${aggTitle('Sum')}: ${Number(total.toFixed(2))} across ${vals2.length} row(s) in ${baseTitle}.`;
    else if (wantsAvg) answer = `${aggTitle('Average')}: ${Number(avg.toFixed(2))} over ${vals2.length} row(s) in ${baseTitle}.`;
    else if (wantsMin || wantsMax) {
      const target = wantsMin ? min : max;
      if (labelIdx >= 0 && metricIdx >= 0 && Number.isFinite(target)) {
        const items = rowsForAgg.filter(r => {
          const n = parseNumber(r[metricIdx]);
          return n != null && Math.abs(n - target) < 1e-6;
        });
        if (items.length > 0) {
          const rowsOut = items.slice(0, 10).map(r => [String(r[labelIdx] ?? ''), String(parseNumber(r[metricIdx]) ?? '')]);
          tables = [{ title: `${sheetName} · ${wantsMin ? 'Min' : 'Max'} ${headers[metricIdx]}`, headers: [headers[labelIdx], headers[metricIdx]], rows: rowsOut }];
          answer = `${wantsMin ? 'Min' : 'Max'} ${headers[metricIdx]}: ${Number(target.toFixed(2))} — ${rowsOut[0][0]}${rowsOut.length > 1 ? ` (+${rowsOut.length - 1} more)` : ''}.`;
        } else {
          answer = `${wantsMin ? 'Min' : 'Max'} ${headers[metricIdx]}: ${Number(target.toFixed(2))} in ${baseTitle}.`;
        }
      } else {
        answer = `${wantsMin ? 'Min' : 'Max'} ${headers[metricIdx]}: ${Number(target.toFixed(2))} in ${baseTitle}.`;
      }
    }
    return tables ? { answer, tables } : { answer };
  }

  return null;
}


