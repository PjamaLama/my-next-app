import { NextApiRequest, NextApiResponse } from 'next';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);
import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';

// Configure API to handle larger file uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Allow up to 10MB for file uploads
    },
  },
};

// Define proper types for the function parameters
interface Context {
  spreadsheetId?: string;
  sheetName?: string;
  sheetNames?: string[];
  spreadsheetUrl?: string;
  sheetData?: any; // Add sheet data to context
  fileAnalysis?: {
    files: Array<{
      mimeType: string;
      extractedData?: unknown;
      timestamp: number;
    }>;
    lastUpdated: number;
  };
  [key: string]: unknown;
}

interface ConversationHistoryItem {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

interface ImageData {
  data: string;
  mimeType: string;
}

// ---- Smart table utilities -------------------------------------------------
type StructuredTable = { title?: string; headers: string[]; rows: string[][]; footer?: string[]; summary?: string };

// Minimal chart spec shared to clients
type ChartSpec = {
  kind: 'bar' | 'line' | 'pie';
  title?: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
  options?: Record<string, unknown>;
};

function normalizeToken(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function bestHeaderIndex(headers: string[], query: string): number {
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

function detectDateWindow(message: string) {
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

function parseNumber(value: unknown): number | null {
  if (value == null) return null;
  const s = String(value).replace(/[,\s]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function buildSmartTables(
  message: string,
  hydratedSheetData: Record<string, string[][]>,
  selectedSheetNames: string[]
): StructuredTable[] {
  if (!hydratedSheetData || Object.keys(hydratedSheetData).length === 0) return [];

  const msg = message.toLowerCase();
  const wantAggregate = /(total|sum|average|avg|count|group)/i.test(message);
  const groupMatch = message.match(/\b(?:by|per)\s+([a-z][a-z0-9_\s]{2,})/i);
  const wantsColumns = Array.from(message.matchAll(/\b(columns?|show|include)\s+([a-z0-9_,\s-]{3,})/gi)).map((m) => m[2]);

  // Choose sheet
  const candidateNames = selectedSheetNames.length > 0 ? selectedSheetNames : Object.keys(hydratedSheetData);
  const sheetName = candidateNames.find((n) => msg.includes(normalizeToken(n))) || candidateNames[0];
  const table = hydratedSheetData[sheetName] || [];
  if (table.length <= 1) return [];

  const headers = table[0];
  const rows = table.slice(1);

  // Filter by date window if a date column exists
  const dateIdx = headers.findIndex((h) => /date|timestamp|time/i.test(h));
  const range = detectDateWindow(message);
  const filtered = range && dateIdx >= 0
    ? rows.filter((r) => {
        const d = dayjs(String(r[dateIdx] || ''));
        return d.isValid() && (d.isAfter(range.start) || d.isSame(range.start)) && (d.isBefore(range.end) || d.isSame(range.end));
      })
    : rows;

  // Pick metric column
  const metricHints = ['amount', 'total', 'cost', 'expense', 'price', 'value', 'fuel', 'litre', 'liter', 'distance', 'km', 'qty', 'quantity'];
  let metricIdx = -1;
  for (const hint of metricHints) {
    const idx = bestHeaderIndex(headers, hint);
    if (idx >= 0) { metricIdx = idx; break; }
  }
  if (metricIdx < 0) {
    // fallback to first numeric-looking column
    const candidateIdx = headers.findIndex((_, i) => filtered.some((r) => parseNumber(r[i]) != null));
    metricIdx = candidateIdx >= 0 ? candidateIdx : 0;
  }

  // Group by column if requested
  let groupIdx = -1;
  if (groupMatch) {
    groupIdx = bestHeaderIndex(headers, groupMatch[1].trim());
  }

  // Column selection parsing
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

  const tables: StructuredTable[] = [];

  if (wantAggregate || groupIdx >= 0) {
    // Aggregated view
    const keyTitle = groupIdx >= 0 ? headers[groupIdx] : 'All Rows';
    const valueTitle = `Sum(${headers[metricIdx]})`;
    const map = new Map<string, { sum: number; count: number }>();
    for (const r of filtered) {
      const key = groupIdx >= 0 ? String(r[groupIdx] ?? 'Unknown') : 'All';
      const n = parseNumber(r[metricIdx]) ?? 0;
      const prev = map.get(key) || { sum: 0, count: 0 };
      prev.sum += n;
      prev.count += 1;
      map.set(key, prev);
    }
    const entries = Array.from(map.entries()).map(([k, v]) => ({ key: k, sum: v.sum, count: v.count }));
    entries.sort((a, b) => b.sum - a.sum);
    const rowsOut = entries.slice(0, 20).map((e) => [e.key, String(Number(e.sum.toFixed(2))), String(e.count)]);
    const total = entries.reduce((acc, e) => acc + e.sum, 0);
    const totalCount = entries.reduce((acc, e) => acc + e.count, 0);
    const footer = ['Total', String(Number(total.toFixed(2))), String(totalCount)];
    const when = range?.label ? ` · ${range.label}` : '';
    tables.push({
      title: `${sheetName} · ${groupIdx >= 0 ? `by ${keyTitle}` : 'aggregate'}${when}`,
      headers: [keyTitle, valueTitle, 'Count'],
      rows: rowsOut,
      footer,
      summary: `Aggregated ${totalCount} row(s). ${valueTitle} = ${Number(total.toFixed(2))}.`
    });
    return tables;
  }

  // Simple selected columns view (non-aggregated) with lightweight AI-derived columns
  const idxs = selectedIdxs || headers.map((_, i) => i).slice(0, 5);
  const outHeaders = idxs.map((i) => headers[i]);

  // Compute average for metric if available
  let avg: number | null = null;
  if (metricIdx >= 0) {
    const nums = filtered.map(r => parseNumber(r[metricIdx])).filter((n): n is number => n != null);
    if (nums.length > 0) avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  // Detect date column for timeliness hints
  const dateIdx2 = headers.findIndex((h) => /date|timestamp|time/i.test(h));

  // Append derived columns
  const derivedHeaders: string[] = [];
  if (avg != null) derivedHeaders.push(`Δ vs Avg(${headers[metricIdx]})`);
  if (dateIdx2 >= 0) derivedHeaders.push('When');
  derivedHeaders.push('AI Insight');

  const body = filtered.slice(-10).map((r) => {
    const base = idxs.map((i) => String(r[i] ?? ''));
    const derived: string[] = [];
    // Δ vs Avg
    if (avg != null) {
      const n = parseNumber(r[metricIdx]);
      const delta = n != null ? n - avg : null;
      derived.push(delta != null ? `${delta >= 0 ? '+' : ''}${Number(delta.toFixed(2))}` : 'n/a');
    }
    // When
    if (dateIdx2 >= 0) {
      const d = dayjs(String(r[dateIdx2] || ''));
      derived.push(d.isValid() ? d.fromNow() : 'n/a');
    }
    // AI Insight
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
    rows: body,
    summary: `Showing ${body.length} of ${filtered.length} row(s).`
  });
  return tables;
}

// ---- Lightweight Q&A over sheet data ---------------------------------------
type QAResult = { answer: string; tables?: StructuredTable[] } | null;

const COLUMN_SYNONYMS: Record<string, string[]> = {
  amount: ['amount', 'total', 'cost', 'expense', 'price', 'value', 'fuel cost', 'rands'],
  fuel: ['fuel', 'litre', 'liter', 'liters', 'litres'],
  driver: ['driver', 'driver name', 'operator'],
  vehicle: ['vehicle', 'vehicle reg', 'reg', 'registration', 'plate', 'license'],
  town: ['town', 'city', 'location', 'destination'],
  date: ['date', 'timestamp', 'time']
};

function resolveColumnIndex(headers: string[], message: string, hints: string[] = []): number {
  // 1) direct hints
  for (const h of hints) {
    const idx = bestHeaderIndex(headers, h);
    if (idx >= 0) return idx;
  }
  // 2) try match using synonyms embedded in message
  const msg = message.toLowerCase();
  for (const synonyms of Object.values(COLUMN_SYNONYMS)) {
    for (const word of synonyms) {
      if (msg.includes(word)) {
        const idx = bestHeaderIndex(headers, word);
        if (idx >= 0) return idx;
      }
    }
  }
  // 3) try exact header name mentions
  let best = -1; let bestScore = 0;
  headers.forEach((h, i) => {
    const norm = normalizeToken(h);
    const score = norm && msg.includes(norm) ? norm.length : 0;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

function parseSimpleFilter(message: string): { columnQuery: string; value: string; op: 'equals' | 'contains' } | null {
  // where/with/filter <column> (=|is|equals|to|contains|has) <value>
  const m1 = message.match(/\b(?:where|with|filter|only|for)\s+([a-z][a-z0-9_\s]{2,})\s*(?:=|is|equals|to|contains|has)?\s*"?([\w\-\s\.#/]+)"?/i);
  if (m1) {
    const col = m1[1].trim();
    const val = m1[2].trim();
    const hasContains = /contains|has/i.test(m1[0]);
    return { columnQuery: col, value: val, op: hasContains ? 'contains' : 'equals' };
  }
  // <column>: <value>
  const m2 = message.match(/\b([a-z][a-z0-9_\s]{2,})\s*:\s*"?([^\n,;]+)"?/i);
  if (m2) {
    return { columnQuery: m2[1].trim(), value: m2[2].trim(), op: 'equals' };
  }
  return null;
}

function answerQuestionFromSheets(
  message: string,
  hydratedSheetData: Record<string, string[][]>,
  selectedSheetNames: string[]
): QAResult {
  if (!hydratedSheetData || Object.keys(hydratedSheetData).length === 0) return null;

  const lower = message.toLowerCase();
  const wantsSum = /(total|sum)/i.test(message);
  const wantsAvg = /(average|avg|mean)\b/i.test(message);
  const wantsMin = /\b(min|minimum|lowest|least)\b/i.test(message);
  const wantsMax = /\b(max|maximum|highest|most)\b/i.test(message);
  const wantsCount = /\b(count|how\s+many|number\s+of)\b/i.test(message);
  const groupMatch = message.match(/\b(?:by|per)\s+([a-z][a-z0-9_\s]{2,})/i);

  const candidateNames = selectedSheetNames.length > 0 ? selectedSheetNames : Object.keys(hydratedSheetData);
  const sheetName = candidateNames.find((n) => lower.includes(normalizeToken(n))) || candidateNames[0];
  const table = hydratedSheetData[sheetName] || [];
  if (table.length <= 1) return null;

  const headers = table[0];
  const rows = table.slice(1);

  const range = detectDateWindow(message);
  const dateIdx = headers.findIndex((h) => /date|timestamp|time/i.test(h));
  const filtered = range && dateIdx >= 0
    ? rows.filter((r) => {
        const d = dayjs(String(r[dateIdx] || ''));
        return d.isValid() && (d.isAfter(range.start) || d.isSame(range.start)) && (d.isBefore(range.end) || d.isSame(range.end));
      })
    : rows;

  // Determine metric column
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

  const vals = filtered.map((r) => parseNumber(r[metricIdx])).filter((n): n is number => n != null);
  if (vals.length === 0 && !wantsCount) return null;

  const aggTitle = (t: string) => `${t}(${headers[metricIdx]})${range?.label ? ` · ${range.label}` : ''}`;
  const baseTitle = `${sheetName}${range?.label ? ` · ${range.label}` : ''}`;

  // Grouped aggregates if requested
  if (groupMatch) {
    const groupIdx = bestHeaderIndex(headers, groupMatch[1].trim());
    if (groupIdx >= 0) {
      const map = new Map<string, { sum: number; count: number; min: number; max: number }>();
      for (const r of filtered) {
        const key = String(r[groupIdx] ?? 'Unknown');
        const n = parseNumber(r[metricIdx]);
        if (!map.has(key)) map.set(key, { sum: 0, count: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY });
        const rec = map.get(key)!;
        if (n != null) {
          rec.sum += n; rec.count += 1; rec.min = Math.min(rec.min, n); rec.max = Math.max(rec.max, n);
        }
      }
      const entries = Array.from(map.entries()).map(([k, v]) => ({ key: k, ...v }));
      // Choose appropriate sort
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
        rows: rowsOut
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

  // Ungrouped aggregates
  if (wantsCount) {
    const answer = `Count${range?.label ? ` ${range.label}` : ''}: ${filtered.length} row(s) in ${baseTitle}.`;
    return { answer };
  }
  if (wantsSum || wantsAvg || wantsMin || wantsMax) {
    const total = vals.reduce((a, b) => a + b, 0);
    const avg = vals.length ? total / vals.length : 0;
    const min = vals.length ? Math.min(...vals) : 0;
    const max = vals.length ? Math.max(...vals) : 0;
    let answer = '';
    if (wantsSum) answer = `${aggTitle('Sum')}: ${Number(total.toFixed(2))} across ${vals.length} row(s) in ${baseTitle}.`;
    else if (wantsAvg) answer = `${aggTitle('Average')}: ${Number(avg.toFixed(2))} over ${vals.length} row(s) in ${baseTitle}.`;
    else if (wantsMin) answer = `${aggTitle('Min')}: ${Number(min.toFixed(2))} in ${baseTitle}.`;
    else if (wantsMax) answer = `${aggTitle('Max')}: ${Number(max.toFixed(2))} in ${baseTitle}.`;
    return { answer };
  }

  return null;
}

// Build simple chart specs from hydrated data using the same heuristics as tables
function buildChartSpecs(
  message: string,
  hydratedSheetData: Record<string, string[][]>,
  selectedSheetNames: string[]
): ChartSpec[] {
  const charts: ChartSpec[] = [];
  if (!hydratedSheetData || Object.keys(hydratedSheetData).length === 0) return charts;

  // Helper to find a likely metric column
  const pickMetricIndex = (headers: string[], rows: string[][]): number => {
    const metricHints = ['amount', 'total', 'cost', 'expense', 'price', 'value', 'fuel', 'litre', 'liter', 'distance', 'km', 'qty', 'quantity'];
    for (const hint of metricHints) {
      const idx = bestHeaderIndex(headers, hint);
      if (idx >= 0) return idx;
    }
    const candidateIdx = headers.findIndex((_, i) => rows.some((r) => parseNumber(r[i]) != null));
    return candidateIdx >= 0 ? candidateIdx : 0;
  };

  // Prefer the table(s) referenced by selection
  const candidateNames = selectedSheetNames.length > 0 ? selectedSheetNames : Object.keys(hydratedSheetData);
  const sheetName = candidateNames.find((n) => message.toLowerCase().includes(normalizeToken(n))) || candidateNames[0];
  const table = hydratedSheetData[sheetName] || [];
  if (table.length <= 1) return charts;

  const headers = table[0];
  const rows = table.slice(1);

  // 1) Aggregated/group-by ask → Bar chart using smart table aggregation when possible
  const looksGrouped = /\b(by|per)\b/i.test(message) || /(total|sum|aggregate|group)/i.test(message);
  if (looksGrouped) {
    try {
      const smart = buildSmartTables(message, hydratedSheetData, selectedSheetNames);
      const agg = smart.find(t => t.headers.length >= 2 && /sum\(|count\)/i.test(t.headers.slice(1).join(' ')));
      if (agg) {
        const labels = agg.rows.map(r => String(r[0])).slice(0, 12);
        const data = agg.rows.map(r => parseNumber(r[1]) ?? 0).slice(0, 12);
        charts.push({
          kind: 'bar',
          title: agg.title || `${sheetName} · Aggregated`,
          labels,
          datasets: [{ label: agg.headers[1] || 'Value', data }]
        });
      }
    } catch {}
  }

  // 2) Date trend ask → Line chart over time
  const looksTrend = /(trend|over\s+time|last\s+\d+\s+days|past\s+(week|month|\d+\s+days)|today)/i.test(message);
  const dateIdx = headers.findIndex((h) => /date|timestamp|time/i.test(h));
  if (dateIdx >= 0 && looksTrend) {
    const metricIdx = pickMetricIndex(headers, rows);
    // Build simple chronological series; try to parse dates
    const series = rows
      .map(r => ({
        d: String(r[dateIdx] || ''),
        n: parseNumber(r[metricIdx]) ?? null
      }))
      .filter(p => p.d && p.n != null);
    // Keep last N points for readability
    const lastN = series.slice(-24);
    if (lastN.length >= 2) {
      charts.push({
        kind: 'line',
        title: `${sheetName} · ${headers[metricIdx]} trend`,
        labels: lastN.map(p => p.d),
        datasets: [{ label: headers[metricIdx], data: lastN.map(p => p.n as number) }],
        options: { tension: 0.3 }
      });
    }
  }

  // 3) Distribution ask → Pie chart of a categorical column
  const looksDistribution = /(distribution|breakdown|share|proportion)/i.test(message);
  if (looksDistribution) {
    // Pick a likely categorical column: prefer driver/vehicle-like
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
        datasets: [{ label: 'Count', data: sorted.map(e => e[1]) }]
      });
    }
  }

  return charts;
}

// Generate lightweight quick replies using AI (fallback to heuristics if unavailable)
async function generateQuickReplies(
  message: string,
  conversationHistory: ConversationHistoryItem[],
  context: Context,
  intent: string,
  hasFiles: boolean
): Promise<string[]> {
  // Heuristic fallback used if AI not configured or errors occur
  const buildHeuristic = (): string[] => {
    const suggestions: string[] = [];
    const hasSpreadsheet = !!(context?.spreadsheetId && (context?.sheetName || context?.sheetNames?.length));
    const hydratedSheetData = (context as any).sheetData as Record<string, string[][]> | undefined;
    const selectedSheetNames = Array.isArray((context as any).sheetNames) ? (context as any).sheetNames as string[] : [];
    const primarySheet = hydratedSheetData
      ? (selectedSheetNames.find(n => hydratedSheetData[n]) || Object.keys(hydratedSheetData)[0])
      : undefined;
    const table = primarySheet ? hydratedSheetData?.[primarySheet] : undefined;
    const headers: string[] = table?.[0] || [];
    const lastRow: string[] | undefined = table && table.length > 1 ? table[table.length - 1] : undefined;
    const hasDate = headers.some(h => /date/i.test(h));

    if (hasFiles) {
      suggestions.push('Extract text from files');
      if (hasSpreadsheet) suggestions.push('Add extracted data to sheet');
      suggestions.push('Summarize the files');
      return suggestions.slice(0, 3);
    }

    if (intent === 'add_data' || intent === 'update_data') {
      suggestions.push('Preview updates');
      suggestions.push('Apply changes');
      if (hasSpreadsheet) suggestions.push('Show current sheet data');
      return suggestions.slice(0, 3);
    }

    if (intent === 'get_data') {
      if (hydratedSheetData && primarySheet) {
        if (hasDate) suggestions.push("Today’s entries");
        if (hasDate) suggestions.push('Past 7 days');
        suggestions.push('Last 3 rows');
        // Propose a column-specific quick filter if we can find a likely column and a value
        const driverLikeIdx = headers.findIndex(h => /driver/i.test(h));
        if (driverLikeIdx >= 0 && lastRow && lastRow[driverLikeIdx]) {
          const name = String(lastRow[driverLikeIdx]).trim().slice(0, 18);
          suggestions.unshift(`Filter driver ${name}`);
        }
      } else {
        suggestions.push('Show latest rows');
        suggestions.push('Summarize this sheet');
        suggestions.push('Filter by date');
      }
      return suggestions.slice(0, 3);
    }

    // General
    if (hydratedSheetData && primarySheet) {
      suggestions.push('Show this sheet');
      if (hasDate) suggestions.push('Today’s entries');
      suggestions.push('Unique values');
    } else {
      suggestions.push('Add a new row');
      if (hasSpreadsheet) suggestions.push('Show current sheet');
    }
    suggestions.push('Help me get started');
    return suggestions.slice(0, 3);
  };

  try {
    // Avoid token-heavy context: keep only the last 3 messages and truncate
    const recent = [...(conversationHistory || [])].slice(-3).map((m) => ({
      role: m.role,
      content: (m.content || '').slice(0, 200)
    }));
    recent.push({ role: 'user', content: (message || '').slice(0, 200) });

    // If no API key, return heuristic suggestions
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) return buildHeuristic();

    const ai = genkit({ plugins: [googleAI({ apiKey })], model: gemini15Flash });
    const historyText = recent
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    // Provide a minimal sheet context to help generation stay specific but cheap
    const hydratedSheetData = (context as any).sheetData as Record<string, string[][]> | undefined;
    const selectedSheetNames = Array.isArray((context as any).sheetNames) ? (context as any).sheetNames as string[] : [];
    const primarySheet = hydratedSheetData
      ? (selectedSheetNames.find(n => hydratedSheetData[n]) || Object.keys(hydratedSheetData)[0])
      : undefined;
    const table = primarySheet ? hydratedSheetData?.[primarySheet] : undefined;
    const headers = table?.[0]?.slice(0, 6) || [];
    const last = table && table.length > 1 ? table[table.length - 1]?.slice(0, 6) : undefined;
    const sheetContext = primarySheet ? `Sheet: ${primarySheet}\nHeaders: ${headers.join(', ')}${last ? `\nLatest: ${last.join(' | ')}` : ''}` : '';

    const prompt = `You generate at most 3 short, tap-friendly quick replies to help the user continue.
Rules:
- Each reply <= 6 words
- Be context-aware and helpful
- Return ONLY a JSON array of strings

Conversation:
${historyText}

Data context (if any):
${sheetContext}

JSON only:`;

    const { text } = await ai.generate(prompt);
    if (!text) return buildHeuristic();

    let cleaned = text.trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/```json|```/g, '').trim();

    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.filter((s) => typeof s === 'string').slice(0, 3);
    }
    return buildHeuristic();
  } catch {
    return buildHeuristic();
  }
}

// Function to execute a tool call
async function executeToolCall(
  toolCall: {
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  },
  context: Context,
  images: ImageData[] = []
) {
  try {
    console.log(`🔍 [AUTO_EXECUTE] Executing tool: ${toolCall.function.name}`);
    
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/genkit-tool-execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolCall,
        context,
        images
      }),
    });

    if (!response.ok) {
      // Check if the response is JSON or HTML
      const contentType = response.headers.get('content-type');
      let errorMessage = `Tool execution failed: ${response.status}`;
      
      if (contentType && contentType.includes('application/json')) {
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (parseError) {
          console.error('Failed to parse error response as JSON:', parseError);
        }
      } else {
        // Handle HTML error responses
        try {
          const errorText = await response.text();
          if (errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
            errorMessage = `Server error (${response.status}): Received HTML error page`;
          } else {
            errorMessage = `Server error (${response.status}): ${errorText}`;
          }
        } catch (textError) {
          console.error('Failed to read error response text:', textError);
        }
      }
      
      throw new Error(errorMessage);
    }

    let data;
    try {
      data = await response.json();
      console.log(`🔍 [AUTO_EXECUTE] Tool execution result:`, data);
    } catch (parseError) {
      console.error('Failed to parse successful response as JSON:', parseError);
      throw new Error('Invalid JSON response from tool execution');
    }
    
    return {
      success: data.success,
      result: data.result,
      details: data.details,
      analyses: data.analyses, // Pass through the analyses field
      extractions: data.extractions, // Pass through the extractions field
      toolId: toolCall.id
    };
  } catch (error) {
    console.error(`🔍 [AUTO_EXECUTE] Tool execution error:`, error);
    return {
      success: false,
      result: `Error executing ${toolCall.function.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: null,
      toolId: toolCall.id
    };
  }
}

// Function to handle follow-up actions based on user responses
function generateFollowUpActions(message: string, context: Context): Array<{
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}> {
  const lowerMessage = message.toLowerCase();
  const actions: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }> = [];

  // Check if user wants to add data to spreadsheet
  if (lowerMessage.includes('add') || lowerMessage.includes('1') || lowerMessage.includes('spreadsheet')) {
    if (context.fileAnalysis && context.fileAnalysis.files.length > 0) {
      const latestAnalysis = context.fileAnalysis.files[context.fileAnalysis.files.length - 1];
      if (latestAnalysis.extractedData && Array.isArray(latestAnalysis.extractedData) && latestAnalysis.extractedData.length > 0) {
        // Note: Sheet operations are now handled by n8n, not through extract_data_from_files
        console.log(`🔍 [FOLLOW_UP] User wants to add data to spreadsheet - this will be handled by n8n`);
      }
    }
  }

  // Check if user wants to extract more information
  if (lowerMessage.includes('extract') || lowerMessage.includes('2') || lowerMessage.includes('more')) {
    actions.push({
      id: `tool_${Date.now()}_extract_more`,
      type: 'function',
      function: {
        name: 'analyze_files',
        arguments: JSON.stringify({
          transcript: 'Extract additional information from the files',
          fileCount: context.fileAnalysis?.files.length || 1
        })
      }
    });
  }

  // Check if user wants to generate a report
  if (lowerMessage.includes('report') || lowerMessage.includes('3') || lowerMessage.includes('summary')) {
    actions.push({
      id: `tool_${Date.now()}_generate_report`,
      type: 'function',
      function: {
        name: 'analyze_files',
        arguments: JSON.stringify({
          transcript: 'Generate a comprehensive summary report of the file content',
          fileCount: context.fileAnalysis?.files.length || 1
        })
      }
    });
  }

  return actions;
}

// Update the processMessage function to perform sheet operations via Genkit tools (no n8n)
async function processMessage(
  message: string, 
  context: Context, 
  conversationHistory: ConversationHistoryItem[], 
  images: ImageData[] = []
) {
  try {
    // Analyze the message for intent
    const lowerMessage = message.toLowerCase();
    let intent = 'chat';
    const suggestedTools: Array<{
      id: string;
      type: string;
      function: {
        name: string;
        arguments: string;
      };
    }> = [];

    // Fast-path greeting/small talk: no tools or sheet calls
    const isGreeting = /^(hi|hello|hey|yo|howdy|good\s+(morning|afternoon|evening))\b/i.test(message.trim());
    if (isGreeting) {
      const greetingResponse = `Hi! I'm here to help. You can:
 - Add or update rows in your Google Sheet
 - Fetch and summarize current sheet data
 - Extract data from images/PDFs and insert into the sheet
 
 What would you like to do?`;
      const quickReplies = await generateQuickReplies(message, conversationHistory, context, intent, false);
      return {
        response: greetingResponse,
        toolCalls: [],
        pendingToolCalls: [],
        toolResults: [],
        context,
        quickReplies
      };
    }

    // Enhanced intent detection with file consideration (images and PDFs)
    const hasFiles = images && images.length > 0;
    const hasPDFs = hasFiles && images.some(img => img.mimeType === 'application/pdf');
    const hasImages = hasFiles && images.some(img => img.mimeType.startsWith('image/'));
    
    // Check for follow-up actions if we have recent analysis
    if (context.fileAnalysis && context.fileAnalysis.files.length > 0) {
      const timeSinceAnalysis = Date.now() - (context.fileAnalysis.lastUpdated || 0);
      if (timeSinceAnalysis < 5 * 60 * 1000) { // Within 5 minutes
        const followUpActions = generateFollowUpActions(message, context);
        if (followUpActions.length > 0) {
          suggestedTools.push(...followUpActions);
        }
      }
    }
    
    if (hasFiles) {
      // If the user's intent is sheet-related, run an end-to-end Genkit flow that extracts and updates the sheet
      const isSheetRelated = lowerMessage.includes('add') || 
                             lowerMessage.includes('update') || 
                             lowerMessage.includes('insert') || 
                             lowerMessage.includes('sheet') ||
                             lowerMessage.includes('spreadsheet');

      if (isSheetRelated) {
        suggestedTools.push({
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: {
            name: 'extract_data_from_files',
            arguments: JSON.stringify({ 
              transcript: message,
              fileCount: images.length,
              fileTypes: images.map(img => img.mimeType)
            })
          }
        });
      } else {
        // Otherwise, prefer a fast text-only extraction
        suggestedTools.push({
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: {
            name: hasPDFs ? 'analyze_files' : 'analyze_images',
            arguments: JSON.stringify({ 
              transcript: message,
              fileCount: images.length,
              fileTypes: images.map(img => img.mimeType)
            })
          }
        });
      }
    } else {
      // Original intent detection for text-only messages
      if (lowerMessage.includes('add') || lowerMessage.includes('insert') || lowerMessage.includes('new')) {
        intent = 'add_data';
        suggestedTools.push({
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: {
            name: 'update_sheet',
            arguments: JSON.stringify({ transcript: message })
          }
        });
      } else if (/\b[A-Z]{1,3}\d+\b/.test(message) && (lowerMessage.includes('set') || lowerMessage.includes('change') || lowerMessage.includes('update'))) {
        // Detect direct cell update like "set B12 to 123"
        const cellMatch = message.match(/\b([A-Z]{1,3}\d+)\b/);
        const valueMatch = message.match(/to\s+(.+)$/i);
        if (cellMatch && context?.spreadsheetId && context?.sheetNames?.length) {
          suggestedTools.push({
            id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: {
              name: 'update_single_cell',
              arguments: JSON.stringify({
                spreadsheetId: context.spreadsheetId,
                sheetName: context.sheetNames[0],
                cell: cellMatch[1],
                value: valueMatch ? valueMatch[1].trim() : ''
              })
            }
          });
        }
      } else if (lowerMessage.includes('update') || lowerMessage.includes('change') || lowerMessage.includes('edit')) {
        intent = 'update_data';
        suggestedTools.push({
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: {
            name: 'update_sheet',
            arguments: JSON.stringify({ transcript: message })
          }
        });
      } else if (lowerMessage.includes('show') || lowerMessage.includes('get') || lowerMessage.includes('display') || lowerMessage.includes('data')) {
        intent = 'get_data';
        const sheetNamesList = Array.isArray(context?.sheetNames) ? (context.sheetNames as string[]) : [];
        const targetSheet = (context?.sheetName as string) || (sheetNamesList.length > 0 ? sheetNamesList[0] : undefined);
        if (context?.spreadsheetId && targetSheet) {
          suggestedTools.push({
            id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: {
              name: 'get_sheet_data',
              arguments: JSON.stringify({ 
                spreadsheetId: context.spreadsheetId, 
                sheetName: targetSheet 
              })
            }
          });
        }
      }
    }

    // Auto-execute all suggested tools FIRST (including file analysis)
    const toolResults = [];
    let enhancedResponse = '';
    
    for (const toolCall of suggestedTools) {
      console.log(`🔍 [AUTO_EXECUTE] Auto-executing tool: ${toolCall.function.name}`);
      
      let result;
      
      // Use extract_text_only instead of analyze_files/analyze_images for faster processing when just analyzing
      if (toolCall.function.name === 'analyze_files' || toolCall.function.name === 'analyze_images') {
        // Replace with extract_text_only for faster processing
        const extractToolCall = {
          ...toolCall,
          function: {
            ...toolCall.function,
            name: 'extract_text_only',
            arguments: JSON.stringify({
              transcript: toolCall.function.arguments ? JSON.parse(toolCall.function.arguments).transcript || 'Extract text from files' : 'Extract text from files',
              fileCount: images.length,
              fileTypes: images.map(img => img.mimeType)
            })
          }
        };
        
        console.log(`🔍 [AUTO_EXECUTE] Replaced ${toolCall.function.name} with extract_text_only for faster processing`);
        result = await executeToolCall(extractToolCall, context, images);
      } else {
        result = await executeToolCall(toolCall, context, images);
      }
      
      toolResults.push(result);
      
      // Store analysis results in context for future reference
      if (result.success) {
        // Check the actual tool that was executed (not the original tool name)
        const executedToolName = toolCall.function.name === 'analyze_files' || toolCall.function.name === 'analyze_images' 
          ? 'extract_text_only' 
          : toolCall.function.name;
          
        if (executedToolName === 'extract_text_only') {
          // Store extracted text results
          if (!context.fileAnalysis) {
            context.fileAnalysis = {
              files: [],
              lastUpdated: Date.now()
            };
          }
          
          // Get the extracted text directly from the result
          let extractedTexts = null;
          if (result.extractions && Array.isArray(result.extractions)) {
            // Use the extractions array directly
            extractedTexts = result.extractions.map((extraction: any) => 
              extraction.extractedText || ''
            );
            console.log(`🔍 [CONTEXT] Found extracted texts:`, extractedTexts.length, 'files');
          } else {
            extractedTexts = [];
          }
          
          // Store extracted text for each file
          if (context.fileAnalysis && extractedTexts) {
            images.forEach((image, index) => {
              context.fileAnalysis!.files.push({
                mimeType: image.mimeType,
                extractedData: extractedTexts[index] || '',
                timestamp: Date.now()
              });
            });
            
            context.fileAnalysis.lastUpdated = Date.now();
            console.log(`🔍 [CONTEXT] Stored extracted text for ${images.length} files, total files in context: ${context.fileAnalysis.files.length}`);
          }
          
          enhancedResponse += `\n\n📄 **Text Extraction Complete:**\n${result.result}`;
        } else if (executedToolName === 'analyze_files' || executedToolName === 'analyze_images') {
          // Store file analysis results (keeping this for backward compatibility)
          if (!context.fileAnalysis) {
            context.fileAnalysis = {
              files: [],
              lastUpdated: Date.now()
            };
          }
          
          // Get the extracted data directly from the result
          let extractedData = null;
          if (result.analyses && Array.isArray(result.analyses)) {
            // Use the analyses array directly
            extractedData = result.analyses.map((analysis: any) => 
              analysis.extractedData?.result?.extracted_data || analysis.extractedData || []
            ).flat();
            console.log(`🔍 [CONTEXT] Found analyses data:`, extractedData);
          } else if (result.details && result.details.analyses) {
            // Fallback: use the analyses data from details
            extractedData = result.details.analyses.map((analysis: any) => 
              analysis.extractedData?.result?.extracted_data || analysis.extractedData || []
            ).flat();
            console.log(`🔍 [CONTEXT] Found analyses data in details:`, extractedData);
          } else {
            // Fallback: try to parse the result as JSON
            try {
              if (typeof result.result === 'string') {
                const parsed = JSON.parse(result.result);
                extractedData = parsed.extracted_data || parsed.result?.extracted_data || [];
              } else {
                extractedData = result.result?.extracted_data || result.result?.result?.extracted_data || [];
              }
            } catch {
              extractedData = [];
            }
          }
          
          // Store extracted data for each file
          if (context.fileAnalysis && extractedData) {
            images.forEach((image) => {
              context.fileAnalysis!.files.push({
                mimeType: image.mimeType,
                extractedData: extractedData,
                timestamp: Date.now()
              });
            });
            
            context.fileAnalysis.lastUpdated = Date.now();
            console.log(`🔍 [CONTEXT] Stored extracted data for ${images.length} files, total files in context: ${context.fileAnalysis.files.length}`);
          }
          
          enhancedResponse += `\n\n📄 **File Analysis Complete:**\n${result.result}`;
        } else if (toolCall.function.name === 'update_sheet') {
          enhancedResponse += `\n\n✅ **Spreadsheet Updated:**\n${result.result}`;
        } else if (toolCall.function.name === 'get_sheet_data') {
          enhancedResponse += `\n\n📋 **Sheet Data Retrieved:**\n${result.result}`;
        } else if (toolCall.function.name === 'extract_data_from_files') {
          enhancedResponse += `\n\n✅ **Data Extracted and Sheet Updated:**\n${result.result}`;
        }
      } else {
        enhancedResponse += `\n\n❌ **Tool Execution Failed:**\n${result.result}`;
      }
    }

    // Generate intelligent conversational response based on analysis results
    let response = '';
    const fileInfo = hasFiles ? ` along with ${images.length} ${images.length === 1 ? 'file' : 'files'}` : '';
    // Will carry structured tables for the client to render nicely
    const dataTables: StructuredTable[] = [];

    // Auto-hydrate sheet data for Q&A if missing but context has selection
    try {
      const hasHydrated = (context as any).sheetData && Object.keys((context as any).sheetData).length > 0;
      const sheetNamesList = Array.isArray((context as any).sheetNames) ? ((context as any).sheetNames as string[]) : [];
      const canHydrate = !hasHydrated && !!context?.spreadsheetId && sheetNamesList.length > 0 && !hasFiles;
      if (canHydrate) {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const take = sheetNamesList.slice(0, 3);
        const results = await Promise.allSettled(
          take.map(async (name) => {
            const resp = await fetch(`${baseUrl}/api/get-sheet-data`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ spreadsheetId: context.spreadsheetId, sheetName: name })
            });
            if (!resp.ok) throw new Error(`Failed to hydrate ${name}`);
            const json = await resp.json();
            return { name, data: (json?.data as string[][]) || [] };
          })
        );
        const map: Record<string, string[][]> = {};
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) {
            map[r.value.name] = r.value.data;
          }
        }
        if (Object.keys(map).length > 0) {
          (context as any).sheetData = map;
        }
      }
    } catch (e) {
      console.warn('Sheet auto-hydration skipped due to error', e);
    }

    // Try to directly answer quantitative questions from hydrated data
    try {
      const hydratedForQA = (context as any).sheetData as Record<string, string[][]> | undefined;
      const selectedForQA = Array.isArray((context as any).sheetNames) ? ((context as any).sheetNames as string[]) : [];
      if (hydratedForQA && Object.keys(hydratedForQA).length > 0 && !hasFiles) {
        const qa = answerQuestionFromSheets(message, hydratedForQA, selectedForQA);
        if (qa) {
          response = qa.answer;
          if (qa.tables && qa.tables.length > 0) dataTables.push(...qa.tables);
        }
      }
    } catch (e) {
      console.warn('QA over sheets failed', e);
    }

    // Check if we have recent analysis results to provide intelligent suggestions
    if (context.fileAnalysis && context.fileAnalysis.files.length > 0) {
      const latestAnalysis = context.fileAnalysis.files[context.fileAnalysis.files.length - 1];
      const timeSinceAnalysis = Date.now() - (context.fileAnalysis.lastUpdated || 0);
      
      // If analysis was done recently (within last 5 minutes), provide intelligent response
      if (timeSinceAnalysis < 5 * 60 * 1000) {
        console.log(`🔍 [INTELLIGENT_RESPONSE] Generating intelligent response for recent analysis (${timeSinceAnalysis}ms ago)`);
        const extractedData = Array.isArray(latestAnalysis.extractedData) ? latestAnalysis.extractedData : [];
        
        if (extractedData.length > 0) {
          console.log(`🔍 [INTELLIGENT_RESPONSE] Found ${extractedData.length} data points to display`);
          response = `I've analyzed your file and found ${extractedData.length} data points. Here's what I found:\n\n`;
          
          // Add a summary of extracted data
          if (Array.isArray(extractedData)) {
            extractedData.slice(0, 5).forEach((item) => {
              if (item.field && item.value) {
                response += `• **${item.field}**: ${item.value}\n`;
              }
            });
            
            if (extractedData.length > 5) {
              response += `• ... and ${extractedData.length - 5} more items\n`;
            }
          }
          
          response += `\n**What would you like me to do next?**\n`;
          response += `1. 📊 Add this data to your spreadsheet\n`;
          response += `2. 🔍 Extract additional information\n`;
          response += `3. 📋 Generate a summary report\n`;
          response += `4. 💬 Ask me questions about the data`;
          
        } else {
          response = `I've analyzed your file but didn't find structured data to extract. The file appears to be a ${latestAnalysis.mimeType}.\n\n`;
          response += `**What would you like me to do next?**\n`;
          response += `1. 🔍 Try a different analysis approach\n`;
          response += `2. 📝 Extract text content instead\n`;
          response += `3. 📋 Generate a document summary\n`;
          response += `4. 💬 Ask me questions about the content`;
        }
      } else {
        // Analysis is older, provide standard response
        switch (intent) {
          case 'extract_from_files':
            response = `I've analyzed your ${images.length} ${images.length === 1 ? 'file' : 'files'} and extracted the relevant data.`;
            break;
          case 'add_data':
            response = `I've processed your request to add new data${fileInfo} to your spreadsheet "${context?.sheetName || 'current sheet'}".`;
            break;
          case 'update_data':
            response = `I've updated your spreadsheet "${context?.sheetName || 'current sheet'}" based on your input${fileInfo}.`;
            break;
          case 'get_data':
            if (context?.sheetName) {
              response = `I've retrieved the current data from your "${context.sheetName}" sheet.`;
            } else {
              response = `I'd be happy to help you get data, but you'll need to select a spreadsheet and sheet first. Please choose your target sheet and try again.`;
            }
            break;
          default:
            if (hasFiles) {
              response = `I've processed your ${images.length} ${images.length === 1 ? 'file' : 'files'} and completed the requested analysis.`;
            } else {
              response = `How can I help? You can ask me to update your sheet, fetch data, or extract info from files.`;
            }
        }
      }
    } else {
      // No analysis results, use standard response logic
      switch (intent) {
        case 'extract_from_files':
          response = `I've analyzed your ${images.length} ${images.length === 1 ? 'file' : 'files'} and extracted the relevant data.`;
          break;
        case 'add_data':
          response = `I've processed your request to add new data${fileInfo} to your spreadsheet "${context?.sheetName || 'current sheet'}".`;
          break;
        case 'update_data':
          response = `I've updated your spreadsheet "${context?.sheetName || 'current sheet'}" based on your input${fileInfo}.`;
          break;
        case 'get_data':
          if (context?.sheetName) {
            response = `I've retrieved the current data from your "${context.sheetName}" sheet.`;
          } else {
            response = `I'd be happy to help you get data, but you'll need to select a spreadsheet and sheet first. Please choose your target sheet and try again.`;
          }
          break;
        default:
          if (hasFiles) {
            response = `I've processed your ${images.length} ${images.length === 1 ? 'file' : 'files'} and completed the requested analysis.`;
          } else {
            response = `How can I help? You can ask me to update your sheet, fetch data, or extract info from files.`;
          }
      }
    }

    // Smart table builder: create views based on user request (filters, group-by, totals)
    const hydratedSheetData = (context as any).sheetData as Record<string, string[][]> | undefined;
    const selectedSheetNames = Array.isArray((context as any).sheetNames) ? (context as any).sheetNames as string[] : [];
    if (hydratedSheetData && Object.keys(hydratedSheetData).length > 0) {
      try {
        const smart = buildSmartTables(message, hydratedSheetData, selectedSheetNames);
        if (smart.length > 0) {
          dataTables.push(...smart);
        }
      } catch (e) {
        console.warn('Smart table build failed', e);
      }
    }

    // If we have pre-hydrated sheet data in context and relevant intent, add a tiny, low-token overview
    const shouldSummarize = hydratedSheetData && Object.keys(hydratedSheetData).length > 0 && (!hasFiles);
    const looksLikeDataRequest = intent === 'get_data' || /\b(about|overview|summary|summar(y|ise)|show|what's in|tell me)/i.test(message);
    if (shouldSummarize && (looksLikeDataRequest || intent === 'chat')) {
      const sheetsToDescribe = selectedSheetNames.length > 0
        ? selectedSheetNames.filter(n => hydratedSheetData[n])
        : Object.keys(hydratedSheetData);
      if (sheetsToDescribe.length > 0) {
        // Provide a short lead-in and push structured tables for UI rendering
        response += '\n\n📋 Selected sheets overview:';
        sheetsToDescribe.slice(0, 3).forEach((name) => {
          const table = hydratedSheetData[name] || [];
          const headers = (table[0] || []).slice(0, 5);
          // Show the latest row (tiny table preview)
          const body = table.length > 1 ? [table[table.length - 1].slice(0, 5)] : [];
          dataTables.push({ title: name, headers, rows: body });
        });
      }
    }

    // Provide a concise data preview for common requests using hydrated data only (no extra API calls)
    if (hydratedSheetData && Object.keys(hydratedSheetData).length > 0 && (!hasFiles)) {
      const wantToday = /\b(today|today'?s\s*entry)\b/i.test(message);
      const wantAll = /\b(all|everything|full|entire)\b/i.test(message);
      const wantRecent = /\b(recent|latest|last\s+few)\b/i.test(message) || (!wantToday && !wantAll && looksLikeDataRequest);
      const mDays = message.match(/\b(past|last)\s+(\d+)\s+days?\b/i);
      const wantPastNDays = mDays ? parseInt(mDays[2], 10) : null;
      const wantLastWeek = /\b(past|last)\s+(week|7\s*days)\b/i.test(message) ? 7 : null;
      const mRange = message.match(/\bfrom\s+([0-9\-\/\.\s]+)\s+(to|until|through)\s+([0-9\-\/\.\s]+)\b/i);
      const sheetsToShow = selectedSheetNames.length > 0 ? selectedSheetNames.filter(n => hydratedSheetData[n]) : Object.keys(hydratedSheetData);

      const formatTable = (name: string, table: string[][], rows: number, columnsLimit = 5): string => {
        if (!table || table.length === 0) return `\n- ${name}: empty`;
        const headers = (table[0] || []).slice(0, columnsLimit);
        const body = table.slice(1, 1 + rows).map(r => r.slice(0, columnsLimit));
        // Add to structured tables for UI rendering
        dataTables.push({ title: name, headers, rows: body });
        let out = `\n\n▶ ${name}`;
        out += `\n| ${headers.join(' | ')} |`;
        out += `\n| ${headers.map(() => '---').join(' | ')} |`;
        body.forEach(r => { out += `\n| ${r.join(' | ')} |`; });
        const remaining = Math.max(0, table.length - 1 - rows);
        if (remaining > 0) out += `\n… ${remaining} more row(s)`;
        return out;
      };

      const normalizeDate = (value: string): string => {
        const d = dayjs(value);
        if (d.isValid()) return d.format('YYYY-MM-DD');
        // try DD/MM/YY
        const d2 = dayjs(value.replace(/(\d{2})\/(\d{2})\/(\d{2,4})/, '$3-$2-$1'));
        return d2.isValid() ? d2.format('YYYY-MM-DD') : value;
      };

      const todayKey = dayjs().format('YYYY-MM-DD');
      let dataPreview = '';
      let matchedAny = false;
      let columnAskAnswered = false;
      let columnAskAnswerText = '';
      let columnAskSourceSheet: string | null = null;
      for (const name of sheetsToShow.slice(0, 3)) {
        const table = hydratedSheetData[name] || [];
        if (table.length <= 1) {
          dataPreview += `\n\n▶ ${name}\n(no data)`;
          continue;
        }
        const headers = table[0];
        const dateColIdx = headers.findIndex(h => /date/i.test(h));
        // Column-specific Q&A: if user references a column (e.g., "Show me Driver_Name")
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const looksLikeColumnAsk = /\b(show|list|what\s+is|who\s+is|display|get)\b/i.test(message);
        if (looksLikeColumnAsk) {
          const headerScores = headers.map((h) => {
            const hNorm = normalize(h);
            const msgNorm = normalize(message);
            let score = 0;
            if (msgNorm.includes(hNorm)) score += 3;
            if (hNorm.includes('driver') && /driver/i.test(message)) score += 2;
            if (hNorm.includes('registration') && /reg|registration|vehicle\s*reg/i.test(message)) score += 2;
            if (hNorm.includes('vehicle') && /vehicle/i.test(message)) score += 1;
            if (hNorm.includes('name') && /name/i.test(message)) score += 1;
            return score;
          });
          const bestIdx = headerScores.reduce((bi, s, i, arr) => (s > arr[bi] ? i : bi), 0);
          if (headerScores[bestIdx] > 0) {
            const colValues = table.slice(1).map(r => r[bestIdx]).filter(v => v != null && String(v).trim() !== '');
            const latest = colValues[colValues.length - 1];
            const unique = Array.from(new Set(colValues)).slice(-10);
            // Structured single-column table for unique values
            dataTables.push({ title: `${name} · ${headers[bestIdx]} (latest + unique)`, headers: [headers[bestIdx]], rows: [[String(latest ?? 'n/a')], ...unique.map(v => [String(v)])] });
            // Build a direct answer sentence when the question targets this column
            const headerLower = headers[bestIdx].toLowerCase();
            const valueText = String(latest ?? 'n/a');
            if (/driver/.test(headerLower) || /\bwho\b/i.test(message)) {
              columnAskAnswerText = `${valueText} drove it.`;
            } else {
              columnAskAnswerText = `${headers[bestIdx]}: ${valueText}`;
            }
            columnAskSourceSheet = name;
            columnAskAnswered = true;
            // Do not add markdown preview for this; rely on structured tables
            matchedAny = true;
            continue;
          }
        }
        if (wantToday && dateColIdx >= 0) {
          const todays = table.slice(1).filter(r => normalizeDate(r[dateColIdx] || '') === todayKey);
          const take = todays.length > 0 ? todays : [table[table.length - 1]]; // fallback to latest
          dataPreview += formatTable(name, [headers, ...take], take.length);
          matchedAny = matchedAny || todays.length > 0;
          continue;
        }
        if ((wantPastNDays || wantLastWeek || mRange) && dateColIdx >= 0) {
          const end = mRange ? dayjs(normalizeDate(mRange[3].trim())).endOf('day') : dayjs().endOf('day');
          const start = mRange
            ? dayjs(normalizeDate(mRange[1].trim())).startOf('day')
            : dayjs().subtract(wantPastNDays || wantLastWeek || 0, 'day').startOf('day');
          const inRange = table.slice(1).filter(r => {
            const key = normalizeDate(r[dateColIdx] || '');
            const d = dayjs(key);
            return d.isValid() && (d.isAfter(start) || d.isSame(start)) && (d.isBefore(end) || d.isSame(end));
          });
          if (inRange.length > 0) {
            const rows = Math.min(10, inRange.length);
            dataPreview += formatTable(name, [headers, ...inRange.slice(0, rows)], rows);
            matchedAny = true;
          } else {
            // Fallback to latest row if no matches
            const latest = [headers, table[table.length - 1]];
            dataPreview += formatTable(name, latest, 1);
          }
          continue;
        }
        if (wantAll) {
          const rows = Math.min(10, table.length - 1);
          dataPreview += formatTable(name, table, rows);
          matchedAny = matchedAny || rows > 0;
          continue;
        }
        if (wantRecent) {
          const rows = Math.min(3, table.length - 1);
          const recent = [headers, ...table.slice(-rows)];
          dataPreview += formatTable(name, recent, rows);
          matchedAny = matchedAny || rows > 0;
          continue;
        }
      }
      if (dataPreview && dataTables.length === 0) {
        // If existing response is generic, replace it with a more helpful lead-in
        const generic = 'How can I help? You can ask me to update your sheet, fetch data, or extract info from files.';
        const lead = matchedAny ? 'Here’s the data you asked for:' : 'No rows matched that request; showing the latest available:';
        response = response && !response.includes(generic) ? response : lead;
        response += `\n\n📄 Data preview:${dataPreview}`;
      }

      // Prefer a direct answer if we detected a column ask
      if (columnAskAnswered && columnAskAnswerText) {
        response = columnAskAnswerText + (columnAskSourceSheet ? `\n\nSource: ${columnAskSourceSheet}` : '');
      }
    }

    // Add enhanced response with tool results
    if (enhancedResponse) {
      response += enhancedResponse;
    }

    // Prefer hydrated data indication over plain "select a sheet" messaging
    // Do not append a plain text "Currently connected to" line here.
    // The client renders rich chips using the sheetsUsed array.

    // If client sent pre-cached sheet names/data in context, keep them for the model/tooling layer
    // Note: We do not auto-fetch here; the client should hydrate context once per spreadsheet
    // context.sheetData can carry a subset or specific sheet data when needed

    // Build quick replies (lightweight, history-aware)
    const quickReplies = await generateQuickReplies(message, conversationHistory, context, intent, hasFiles);

    return {
      response: response || 'Here is an overview generated from your selected sheet(s).',
      toolCalls: [], // No manual tool calls needed
      pendingToolCalls: [], // No pending tools - all executed automatically
      toolResults: toolResults, // Include the results of auto-executed tools
      context: context, // Return updated context with analysis results
      sheetsUsed: selectedSheetNames,
      quickReplies,
      dataTables,
      charts: hydratedSheetData ? buildChartSpecs(message, hydratedSheetData, selectedSheetNames) : []
    };

  } catch (error) {
    console.error('Message processing error:', error);
    return {
      response: `I encountered an error processing your message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      toolCalls: [],
      pendingToolCalls: [],
      toolResults: [],
      context: context // Return original context even on error
    };
  }
}

// n8n tool removed: sheet updates are handled directly via Genkit flows in /api/genkit-tool-execute

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, context, conversationHistory, images } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Validate file sizes before processing
    if (images && images.length > 0) {
      console.log(`API: ${images.length} images/files included`);
      
      const maxFileSize = 8 * 1024 * 1024; // 8MB limit for individual files
      const totalSizeLimit = 20 * 1024 * 1024; // 20MB total limit
      let totalSize = 0;
      
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const fileSize = Math.ceil((image.data.length * 3) / 4); // Approximate base64 size
        
        if (fileSize > maxFileSize) {
          return res.status(413).json({
            error: 'File too large',
            details: `File ${i + 1} exceeds the 8MB limit. Please compress or resize your file.`,
            fileIndex: i,
            fileSize: `${(fileSize / 1024 / 1024).toFixed(1)}MB`,
            maxSize: '8MB'
          });
        }
        
        totalSize += fileSize;
      }
      
      if (totalSize > totalSizeLimit) {
        return res.status(413).json({
          error: 'Total file size too large',
          details: `Combined file size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds the 20MB limit. Please reduce the number or size of files.`,
          totalSize: `${(totalSize / 1024 / 1024).toFixed(1)}MB`,
          maxTotalSize: '20MB'
        });
      }
    }

    const result = await processMessage(
      message,
      context || {},
      conversationHistory || [],
      images || []
    );

    return res.status(200).json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('API: Chat processing failed:', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('body too large') || error.message.includes('413')) {
        return res.status(413).json({
          error: 'Request too large',
          details: 'The uploaded files exceed the size limit. Please reduce file sizes or upload fewer files.',
          limits: {
            individualFile: '8MB',
            totalFiles: '20MB'
          }
        });
      }
    }
    
    return res.status(500).json({
      error: 'Failed to process chat message',
      details: error instanceof Error ? error.message : String(error)
    });
  }
} 