import { ChartSpec } from './types';
import { bestHeaderIndex, normalizeToken, parseNumber, structureForDisplay } from './utils';

export function buildChartSpecs(
  message: string,
  hydratedSheetData: Record<string, string[][]>,
  selectedSheetNames: string[]
): ChartSpec[] {
  const charts: ChartSpec[] = [];
  if (!hydratedSheetData || Object.keys(hydratedSheetData).length === 0) return charts;

  const pickMetricIndex = (headers: string[], rows: string[][]): number => {
    const metricHints = ['amount', 'total', 'cost', 'expense', 'price', 'value', 'fuel', 'litre', 'liter', 'distance', 'km', 'qty', 'quantity'];
    for (const hint of metricHints) {
      const idx = bestHeaderIndex(headers, hint);
      if (idx >= 0) return idx;
    }
    const candidateIdx = headers.findIndex((_, i) => rows.some((r) => parseNumber(r[i]) != null));
    return candidateIdx >= 0 ? candidateIdx : 0;
  };

  const candidateNames = selectedSheetNames.length > 0 ? selectedSheetNames : Object.keys(hydratedSheetData);
  const sheetName = candidateNames.find((n) => message.toLowerCase().includes(normalizeToken(n))) || candidateNames[0];
  const table = hydratedSheetData[sheetName] || [];
  if (table.length === 0) return charts;
  const shaped = structureForDisplay(table);
  const headers = shaped.headers;
  const rows = shaped.rows;
  if (headers.length === 0 || rows.length === 0) return charts;

  const explicitKind: 'bar' | 'line' | 'pie' | null = /\bbar\s+chart\b/i.test(message)
    ? 'bar'
    : /\bline\s+chart\b/i.test(message) || /\btrend\b/i.test(message)
    ? 'line'
    : /\bpie\s+chart\b/i.test(message) || /\bdistribution|breakdown\b/i.test(message)
    ? 'pie'
    : null;

  const looksGrouped = /\b(by|per)\b/i.test(message) || /(total|sum|aggregate|group)/i.test(message);
  if (explicitKind === 'bar' || looksGrouped) {
    try {
      const keyIdx = headers.findIndex(h => /driver|vehicle|category|type|name/i.test(h));
      const metricIdx = pickMetricIndex(headers, rows);
      if (keyIdx >= 0) {
        const counts = new Map<string, number>();
        const sums = new Map<string, number>();
        rows.forEach(r => {
          const key = String(r[keyIdx] || 'Unknown');
          const n = parseNumber(r[metricIdx]) ?? 0;
          counts.set(key, (counts.get(key) || 0) + 1);
          sums.set(key, (sums.get(key) || 0) + n);
        });
        const sorted = Array.from(sums.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
        const labels = sorted.map(e => e[0]);
        const data = sorted.map(e => e[1]);
        charts.push({
          kind: 'bar',
          title: `${sheetName} · Aggregated`,
          labels,
          datasets: [{ label: `Sum(${headers[metricIdx]})`, data }],
          meta: { sheetName, metricHeader: headers[metricIdx], groupByHeader: headers[keyIdx] }
        });
      }
    } catch {}
  }

  const looksTrend = /(trend|over\s+time|last\s+\d+\s+days|past\s+(week|month|\d+\s+days)|today)/i.test(message);
  const dateIdx = headers.findIndex((h) => /date|timestamp|time/i.test(h));
  if (dateIdx >= 0 && (explicitKind === 'line' || looksTrend)) {
    const metricIdx = pickMetricIndex(headers, rows);
    const series = rows
      .map(r => ({ d: String(r[dateIdx] || ''), n: parseNumber(r[metricIdx]) ?? null }))
      .filter(p => p.d && p.n != null);
    const lastN = series.slice(-24);
    if (lastN.length >= 2) {
      charts.push({
        kind: 'line',
        title: `${sheetName} · ${headers[metricIdx]} trend`,
        labels: lastN.map(p => p.d),
        datasets: [{ label: headers[metricIdx], data: lastN.map(p => p.n as number) }],
        options: { tension: 0.3 },
        meta: { sheetName, metricHeader: headers[metricIdx], dateHeader: headers[dateIdx] }
      });
    }
  }

  const looksDistribution = /(distribution|breakdown|share|proportion)/i.test(message);
  if (explicitKind === 'pie' || looksDistribution) {
    const catHints = ['driver', 'vehicle', 'category', 'type', 'name'];
    let catIdx = -1;
    for (const hint of catHints) {
      const idx = bestHeaderIndex(headers, hint);
      if (idx >= 0) { catIdx = idx; break; }
    }
    if (catIdx < 0) catIdx = headers.findIndex((_, i) => rows.some(r => String(r[i] || '').trim().length > 0 && parseNumber(r[i]) == null));
    if (catIdx >= 0) {
      const counts = new Map<string, number>();
      rows.forEach(r => {
        const key = String(r[catIdx] || 'Unknown');
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
      charts.push({
        kind: 'pie',
        title: `${sheetName} · ${headers[catIdx]} distribution`,
        labels: sorted.map(e => e[0]),
        datasets: [{ label: 'Count', data: sorted.map(e => e[1]) }],
        meta: { sheetName, groupByHeader: headers[catIdx] }
      });
    }
  }

  return charts;
}


