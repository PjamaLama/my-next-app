import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);
import { StructuredTable } from './types';
import { bestHeaderIndex, detectDateWindow, normalizeToken, parseNumber, structureForDisplay, normalizeDateColumns } from './utils';

function selectTableType(message: string, hydratedSheetData: Record<string, string[][]>, selectedSheetNames: string[]) {
  const msg = message.toLowerCase();

  const groupMatch = message.match(/\b(?:by|per)\s+([a-z][a-z0-9_\s]{2,})/i);

  const candidateNames = selectedSheetNames.length > 0 ? selectedSheetNames : Object.keys(hydratedSheetData);
  const sheetName = candidateNames.find((n) => msg.includes(normalizeToken(n))) || candidateNames[0];
  const table = hydratedSheetData[sheetName] || [];
  
  return { groupMatch, sheetName, table };
}

function performTableAggregation(
  filteredRows: string[][],
  headers: string[],
  metricIdx: number,
  groupIdx: number,
  message: string
): { rows: string[][]; footer: string[]; summary: string; headers: string[] } | null {
  const groupMatch = message.match(/\b(?:by|per)\s+([a-z][a-z0-9_\s]{2,})/i);
  const topNMatch = message.match(/\btop\s+(\d+)\b/i);
  const bottomNMatch = message.match(/\bbottom\s+(\d+)\b/i);
  const N = Math.min(parseInt((topNMatch?.[1] || bottomNMatch?.[1] || '20'), 10) || 20, 100);

  if (groupIdx >= 0 || /(total|sum|average|avg|count|group)/i.test(message)) {
    const keyTitle = groupIdx >= 0 ? headers[groupIdx] : 'All Rows';
    const valueTitle = `Sum(${headers[metricIdx]})`;
    const map = new Map<string, { sum: number; count: number }>();
    for (const r of filteredRows) {
      const key = groupIdx >= 0 ? String(r[groupIdx] ?? 'Unknown') : 'All';
      const n = parseNumber(r[metricIdx]) ?? 0;
      const prev = map.get(key) || { sum: 0, count: 0 };
      prev.sum += n;
      prev.count += 1;
      map.set(key, prev);
    }
    let entries = Array.from(map.entries()).map(([k, v]) => ({ key: k, sum: v.sum, count: v.count }));
    entries.sort((a, b) => b.sum - a.sum);
    if (bottomNMatch) entries = entries.reverse();
    const rowsOut = entries.slice(0, N).map((e) => [e.key, String(Number(e.sum.toFixed(2))), String(e.count)]);
    const total = entries.reduce((acc, e) => acc + e.sum, 0);
    const totalCount = entries.reduce((acc, e) => acc + e.count, 0);
    const footer = ['Total', String(Number(total.toFixed(2))), String(totalCount)];
    
    return {
      rows: rowsOut,
      footer,
      summary: `Aggregated ${totalCount} row(s). ${valueTitle} = ${Number(total.toFixed(2))}.`,
      headers: [keyTitle, valueTitle, 'Count']
    };
  }
  return null;
}

function selectTableColumns(message: string, headers: string[]): number[] | null {
  const wantsColumns = Array.from(message.matchAll(/\b(columns?|show|include)\s+([a-z0-9_,\s-]{3,})/gi)).map((m) => m[2]);
  let selectedIdxs: number[] | null = null;
  if (wantsColumns.length > 0) {
    selectedIdxs = [];
    const chunk = wantsColumns[wantsColumns.length - 1];
    const names = chunk.split(/[,]+/).map((s) => s.trim()).filter(Boolean);
    names.forEach((name) => {
      const idx = bestHeaderIndex(headers, name);
      if (idx >= 0) selectedIdxs!.push(idx);
    });
    if (selectedIdxs.length === 0) selectedIdxs = null;
  }
  return selectedIdxs;
}

export function buildSmartTables(
  message: string,
  hydratedSheetData: Record<string, string[][]>,
  selectedSheetNames: string[],
  intent?: string
): StructuredTable[] {
  if (!hydratedSheetData || Object.keys(hydratedSheetData).length === 0) return [];

  // If intent is explicitly update_data, force editable table mode (no aggregation)
  const { groupMatch, sheetName, table } = intent === 'update_data' 
    ? { 
        groupMatch: null, 
        sheetName: selectedSheetNames.length > 0 ? selectedSheetNames[0] : Object.keys(hydratedSheetData)[0],
        table: hydratedSheetData[selectedSheetNames.length > 0 ? selectedSheetNames[0] : Object.keys(hydratedSheetData)[0]] || []
      }
    : selectTableType(message, hydratedSheetData, selectedSheetNames);
    
  if (table.length === 0) return [];
  
  const shaped = structureForDisplay(table);
  const headers = shaped.headers;
  const rows = shaped.rows;
  if (headers.length === 0 || rows.length === 0) return [];

  // For update_data intent, show raw data without analysis
  if (intent === 'update_data') {
    const selectedIdxs = headers.map((_, i) => i).slice(0, 10); // Show first 10 columns
    const outHeaders = selectedIdxs.map((i) => headers[i]);
    const body = rows.slice(-20).map((r) => selectedIdxs.map((i) => String(r[i] ?? ''))); // Show last 20 rows
    
    return [{
      title: `${sheetName} · Raw Data`,
      headers: outHeaders,
      rows: normalizeDateColumns(outHeaders, body),
      summary: `Showing ${body.length} of ${rows.length} row(s) for editing.`
    }];
  }

  const dateIdx = headers.findIndex((h) => /date|timestamp|time/i.test(h));
  const range = detectDateWindow(message);
  const filtered = range && dateIdx >= 0
    ? rows.filter((r) => {
        const d = dayjs(String(r[dateIdx] || ''));
        return d.isValid() && (d.isAfter(range.start) || d.isSame(range.start)) && (d.isBefore(range.end) || d.isSame(range.end));
      })
    : rows;

  const metricHints = ['amount', 'total', 'cost', 'expense', 'price', 'value', 'fuel', 'litre', 'liter', 'distance', 'km', 'qty', 'quantity'];
  let metricIdx = -1;
  for (const hint of metricHints) {
    const idx = bestHeaderIndex(headers, hint);
    if (idx >= 0) { metricIdx = idx; break; }
  }
  if (metricIdx < 0) {
    const candidateIdx = headers.findIndex((_, i) => filtered.some((r) => parseNumber(r[i]) != null));
    metricIdx = candidateIdx >= 0 ? candidateIdx : 0;
  }

  let groupIdx = -1;
  if (groupMatch) {
    groupIdx = bestHeaderIndex(headers, groupMatch[1].trim());
  }

  // Support explicit metric selection and top/bottom N
  const explicitMetricMatch = message.match(/\bby\s+(sum|avg|average|min|max)\s+of\s+([a-z0-9_\s-]{3,})/i);
  if (explicitMetricMatch) {
    const metricHeaderQuery = explicitMetricMatch[2].trim();
    const idx = bestHeaderIndex(headers, metricHeaderQuery);
    if (idx >= 0) metricIdx = idx;
  }

  const tables: StructuredTable[] = [];



  const selectedIdxs = selectTableColumns(message, headers);
  const idxs = selectedIdxs || headers.map((_, i) => i).slice(0, 5);
  const outHeaders = idxs.map((i) => headers[i]);

  let avg: number | null = null;
  if (metricIdx >= 0) {
    const nums = filtered.map(r => parseNumber(r[metricIdx])).filter((n): n is number => n != null);
    if (nums.length > 0) avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  const dateIdx2 = headers.findIndex((h) => /date|timestamp|time/i.test(h));

  const derivedHeaders: string[] = [];
  if (avg != null) derivedHeaders.push(`Δ vs Avg(${headers[metricIdx]})`);
  if (dateIdx2 >= 0) derivedHeaders.push('When');
  derivedHeaders.push('AI Insight');

  const body = filtered.slice(-10).map((r) => {
    const base = idxs.map((i) => String(r[i] ?? ''));
    const derived: string[] = [];
    if (avg != null) {
      const n = parseNumber(r[metricIdx]);
      const delta = n != null ? n - avg : null;
      derived.push(delta != null ? `${delta >= 0 ? '+' : ''}${Number(delta.toFixed(2))}` : 'n/a');
    }
    if (dateIdx2 >= 0) {
      const d = dayjs(String(r[dateIdx2] || ''));
      derived.push(d.isValid() ? d.fromNow() : 'n/a');
    }
    let insight = '';
    if (avg != null) {
      const n = parseNumber(r[metricIdx]);
      if (n != null) insight = n > avg ? 'Above average' : n < avg ? 'Below average' : 'At average';
    }
    if (!insight && dateIdx2 >= 0) {
      const d = dayjs(String(r[dateIdx2] || ''));
      if (d.isValid()) {
        if (d.isAfter(dayjs().subtract(1, 'day'))) insight = 'Recent';
        else if (d.isBefore(dayjs().subtract(30, 'day'))) insight = 'Older';
      }
    }
    derived.push(insight || '—');
    return [...base, ...derived];
  });

  tables.push({
    title: `${sheetName}${range?.label ? ` · ${range.label}` : ''}`,
    headers: [...outHeaders, ...derivedHeaders],
    rows: normalizeDateColumns([...outHeaders, ...derivedHeaders], body),
    summary: `Showing ${body.length} of ${filtered.length} row(s).`
  });
  return tables;
}