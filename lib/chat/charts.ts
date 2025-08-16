import { ChartSpec } from './types';
import { bestHeaderIndex, normalizeToken, parseNumber, structureForDisplay } from './utils';

function detectChartType(message: string): 'bar' | 'line' | 'pie' | 'default' {
    if (/\bbar\s+chart\b/i.test(message) || /\b(by|per)\b/i.test(message) || /(total|sum|aggregate|group)/i.test(message)) {
        return 'bar';
    }
    if (/\bline\s+chart\b/i.test(message) || /\btrend\b/i.test(message) || /(trend|over\s+time|last\s+\d+\s+days|past\s+(week|month|\d+\s+days)|today)/i.test(message)) {
        return 'line';
    }
    if (/\bpie\s+chart\b/i.test(message) || /\bdistribution|breakdown|share|proportion\b/i.test(message)) {
        return 'pie';
    }
    return 'default';
}

function prepareChartData(headers: string[], rows: string[][], chartType: 'bar' | 'line' | 'pie' | 'default', pickMetricIndex: (headers: string[], rows: string[][]) => number) {
    if (chartType === 'bar' || chartType === 'default') {
        const keyIdx = headers.findIndex(h => /driver|vehicle|category|type|name/i.test(h));
        const metricIdx = pickMetricIndex(headers, rows);
        if (keyIdx >= 0) {
            const sums = new Map<string, number>();
            rows.forEach(r => {
                const key = String(r[keyIdx] || 'Unknown');
                const n = parseNumber(r[metricIdx]) ?? 0;
                sums.set(key, (sums.get(key) || 0) + n);
            });
            const sorted = Array.from(sums.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
            return { labels: sorted.map(e => e[0]), data: sorted.map(e => e[1]), metricHeader: headers[metricIdx], groupByHeader: headers[keyIdx] };
        }
    }

    if (chartType === 'line') {
        const dateIdx = headers.findIndex((h) => /date|timestamp|time/i.test(h));
        if (dateIdx >= 0) {
            const metricIdx = pickMetricIndex(headers, rows);
            const series = rows
                .map(r => ({ d: String(r[dateIdx] || ''), n: parseNumber(r[metricIdx]) ?? null }))
                .filter(p => p.d && p.n != null);
            const lastN = series.slice(-24);
            if (lastN.length >= 2) {
                return { labels: lastN.map(p => p.d), data: lastN.map(p => p.n as number), metricHeader: headers[metricIdx], dateHeader: headers[dateIdx] };
            }
        }
    }

    if (chartType === 'pie') {
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
            return { labels: sorted.map(e => e[0]), data: sorted.map(e => e[1]), groupByHeader: headers[catIdx] };
        }
    }

    return null;
}

function generateBarChart(spec: any, sheetName: string): ChartSpec | null {
    if (!spec) return null;
    return {
        kind: 'bar',
        title: `${sheetName} · ${spec.metricHeader} by ${spec.groupByHeader}`,
        labels: spec.labels,
        datasets: [{ label: `Sum(${spec.metricHeader})`, data: spec.data }],
        meta: { sheetName, metricHeader: spec.metricHeader, groupByHeader: spec.groupByHeader }
    };
}

function generateLineChart(spec: any, sheetName: string): ChartSpec | null {
    if (!spec) return null;
    return {
        kind: 'line',
        title: `${sheetName} · ${spec.metricHeader} trend`,
        labels: spec.labels,
        datasets: [{ label: spec.metricHeader, data: spec.data }],
        options: { tension: 0.3 },
        meta: { sheetName, metricHeader: spec.metricHeader, dateHeader: spec.dateHeader }
    };
}

function generatePieChart(spec: any, sheetName: string): ChartSpec | null {
    if (!spec) return null;
    return {
        kind: 'pie',
        title: `${sheetName} · ${spec.groupByHeader} distribution`,
        labels: spec.labels,
        datasets: [{ label: 'Count', data: spec.data }],
        meta: { sheetName, groupByHeader: spec.groupByHeader }
    };
}

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

  const chartType = detectChartType(message);

  const chartData = prepareChartData(headers, rows, chartType, pickMetricIndex);

  if (chartData) {
      let chart: ChartSpec | null = null;
      if (chartType === 'bar' || chartType === 'default') {
          chart = generateBarChart(chartData, sheetName);
      } else if (chartType === 'line') {
          chart = generateLineChart(chartData, sheetName);
      } else if (chartType === 'pie') {
          chart = generatePieChart(chartData, sheetName);
      }

      if (chart) {
          charts.push(chart);
      }
  }

  // Fallback: if no chart built yet, create a sensible default bar chart
  try {
    if (charts.length === 0) {
        const fallbackData = prepareChartData(headers, rows, 'default', pickMetricIndex);
        const fallbackChart = generateBarChart(fallbackData, sheetName);
        if (fallbackChart) {
            charts.push(fallbackChart);
        }
    }
  } catch {}

  return charts;
}