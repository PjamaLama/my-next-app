'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

// Reuse the existing ChartRenderer for actual rendering
const ChartRenderer = dynamic(() => import('./ChartRenderer'), { ssr: false });

type ChartSpec = {
  kind: 'bar' | 'line' | 'pie';
  title?: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
  options?: Record<string, unknown>;
  meta?: Record<string, unknown> & {
    sheetName?: string;
    metricHeader?: string;
    groupByHeader?: string;
    dateHeader?: string;
  };
};

type Props = {
  spec: ChartSpec;
  sheetsUsed?: string[];
  sheetDataCache: Record<string, string[][]>;
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export default function ChartExplorer({ spec, sheetsUsed = [], sheetDataCache }: Props) {
  const initialSheet = (spec.meta?.sheetName as string) || sheetsUsed[0] || Object.keys(sheetDataCache)[0];
  const [sheetName, setSheetName] = useState<string>(initialSheet);
  const [filterText, setFilterText] = useState<string>('');

  const table = sheetDataCache[sheetName] || [];
  const headers = (table[0] || []) as string[];
  const rows = table.slice(1);

  // Heuristics to detect numeric and categorical columns
  const numericHeaders = useMemo(() => {
    const out: string[] = [];
    headers.forEach((h, i) => {
      const hasNum = rows.some(r => {
        const v = String(r[i] ?? '').replace(/[\s,]/g, '');
        const n = parseFloat(v);
        return Number.isFinite(n);
      });
      if (hasNum) out.push(h);
    });
    return out;
  }, [headers, rows]);

  const categoricalHeaders = useMemo(() => {
    const out: string[] = [];
    headers.forEach((h, i) => {
      const hasText = rows.some(r => {
        const v = String(r[i] ?? '').trim();
        return v.length > 0;
      });
      const hasNum = rows.some(r => {
        const v = String(r[i] ?? '').replace(/[\s,]/g, '');
        return Number.isFinite(parseFloat(v));
      });
      if (hasText && !hasNum) out.push(h);
    });
    // Fallback: include non-empty columns if no pure categorical found
    if (out.length === 0) {
      headers.forEach((h, i) => {
        const hasAny = rows.some(r => String(r[i] ?? '').trim().length > 0);
        if (hasAny) out.push(h);
      });
    }
    return out;
  }, [headers, rows]);

  // Defaults based on incoming spec meta if available
  const defaultMetric = (spec.meta?.metricHeader as string) || numericHeaders[0];
  const defaultGroup = (spec.meta?.groupByHeader as string) || categoricalHeaders[0];
  const defaultDate = (spec.meta?.dateHeader as string) || headers.find(h => /date|timestamp|time/i.test(h)) || headers[0];

  const [metricHeader, setMetricHeader] = useState<string>(defaultMetric || '');
  const [groupByHeader, setGroupByHeader] = useState<string>(defaultGroup || '');
  const [dateHeader, setDateHeader] = useState<string>(defaultDate || '');

  const computedSpec: ChartSpec = useMemo(() => {
    if (!headers || headers.length === 0 || rows.length === 0) {
      return { ...spec, labels: [], datasets: spec.datasets || [] };
    }

    if (spec.kind === 'line') {
      // Build simple time series over dateHeader with metricHeader
      const dIdx = headers.indexOf(dateHeader);
      const mIdx = headers.indexOf(metricHeader);
      if (dIdx < 0 || mIdx < 0) return spec;
      const series = rows.map(r => ({ d: String(r[dIdx] || ''), n: parseFloat(String(r[mIdx] || '').replace(/[\s,]/g, '')) }))
        .filter(p => p.d && isFiniteNumber(p.n));
      // Keep order of appearance; could add sorting/parsing as needed
      const labels = series.map(s => s.d);
      const data = series.map(s => s.n);
      return {
        kind: 'line',
        title: spec.title || `${sheetName} · ${metricHeader} trend`,
        labels,
        datasets: [{ label: metricHeader || 'Value', data }],
        options: spec.options,
        meta: { ...spec.meta, sheetName, metricHeader, dateHeader }
      };
    }

    // Bar or Pie: group by groupByHeader and sum metricHeader
    const gIdx = headers.indexOf(groupByHeader);
    const mIdx = headers.indexOf(metricHeader);
    if (gIdx < 0 || mIdx < 0) return spec;

    const sums = new Map<string, number>();
    rows.forEach(r => {
      const keyRaw = String(r[gIdx] ?? 'Unknown');
      const key = keyRaw.trim() || 'Unknown';
      const n = parseFloat(String(r[mIdx] ?? '').replace(/[\s,]/g, ''));
      if (!Number.isFinite(n)) return;
      if (filterText && !key.toLowerCase().includes(filterText.toLowerCase())) return;
      sums.set(key, (sums.get(key) || 0) + n);
    });
    const sorted = Array.from(sums.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
    const labels = sorted.map(e => e[0]);
    const data = sorted.map(e => e[1]);
    const titleSuffix = groupByHeader ? ` by ${groupByHeader}` : '';
    return {
      kind: spec.kind,
      title: spec.title || `${sheetName} · ${metricHeader}${titleSuffix}`,
      labels,
      datasets: [{ label: `Sum(${metricHeader})`, data }],
      options: spec.options,
      meta: { ...spec.meta, sheetName, metricHeader, groupByHeader }
    };
  }, [spec, headers, rows, sheetName, groupByHeader, metricHeader, dateHeader, filterText]);

  const availableSheets = sheetsUsed.length > 0 ? sheetsUsed : Object.keys(sheetDataCache);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <label className="inline-flex items-center gap-1">
          <span className="text-white/70">Sheet</span>
          <span className="relative inline-flex">
            <select
              className="appearance-none pr-6 bg-black/40 border border-white/15 rounded px-2 py-1 text-white/90 focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={sheetName}
              onChange={e => setSheetName(e.target.value)}
            >
              {availableSheets.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/70" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd"/></svg>
          </span>
        </label>

        {(spec.kind === 'bar' || spec.kind === 'pie') && (
          <>
            <label className="inline-flex items-center gap-1">
              <span className="text-white/70">Group by</span>
              <span className="relative inline-flex">
                <select
                  className="appearance-none pr-6 bg-black/40 border border-white/15 rounded px-2 py-1 text-white/90 max-w-[220px] focus:outline-none focus:ring-1 focus:ring-sky-500"
                  value={groupByHeader}
                  onChange={e => setGroupByHeader(e.target.value)}
                >
                  {categoricalHeaders.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/70" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd"/></svg>
              </span>
            </label>

            <label className="inline-flex items-center gap-1">
              <span className="text-white/70">Metric</span>
              <span className="relative inline-flex">
                <select
                  className="appearance-none pr-6 bg-black/40 border border-white/15 rounded px-2 py-1 text-white/90 max-w-[220px] focus:outline-none focus:ring-1 focus:ring-sky-500"
                  value={metricHeader}
                  onChange={e => setMetricHeader(e.target.value)}
                >
                  {numericHeaders.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/70" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd"/></svg>
              </span>
            </label>

            <input
              placeholder="Filter category..."
              className="bg-black/40 border border-white/15 rounded px-2 py-1 text-white/90 placeholder-white/50 min-w-[160px] focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
            />
          </>
        )}

        {spec.kind === 'line' && (
          <>
            <label className="inline-flex items-center gap-1">
              <span className="text-white/70">Date</span>
              <span className="relative inline-flex">
                <select
                  className="appearance-none pr-6 bg-black/40 border border-white/15 rounded px-2 py-1 text-white/90 max-w-[220px] focus:outline-none focus:ring-1 focus:ring-sky-500"
                  value={dateHeader}
                  onChange={e => setDateHeader(e.target.value)}
                >
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/70" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd"/></svg>
              </span>
            </label>
            <label className="inline-flex items-center gap-1">
              <span className="text-white/70">Metric</span>
              <span className="relative inline-flex">
                <select
                  className="appearance-none pr-6 bg-black/40 border border-white/15 rounded px-2 py-1 text-white/90 max-w-[220px] focus:outline-none focus:ring-1 focus:ring-sky-500"
                  value={metricHeader}
                  onChange={e => setMetricHeader(e.target.value)}
                >
                  {numericHeaders.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/70" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd"/></svg>
              </span>
            </label>
          </>
        )}
      </div>

      <div className="bg-black/10 p-2 rounded-lg">
        <ChartRenderer spec={computedSpec} />
      </div>
    </div>
  );
}


