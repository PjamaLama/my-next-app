import dayjs from 'dayjs';
import { StructuredTable } from './types';
import { bestHeaderIndex, detectDateWindow, normalizeToken, parseNumber, structureForDisplay, normalizeDateColumns } from './utils';
import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';

export type QAResult = { answer: string; tables?: StructuredTable[]; insights?: string[]; chart?: { kind: 'bar' | 'line' | 'pie'; title: string; labels: string[]; datasets: Array<{ label: string; data: number[] }> } | null } | null;

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

function classifyQueryType(message: string) {
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

function resolveQueryColumns(message: string, headers: string[], rows: string[][]) {
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

function performAggregation(rows: string[][], metricIdx: number, groupIdx: number, operation: 'sum' | 'avg' | 'min' | 'max') {
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

function applyQueryFilters(rows: string[][], message: string, headers: string[]) {
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

export async function answerQuestionFromSheets(
    message: string,
    hydratedSheetData: Record<string, string[][]>,
    selectedSheetNames: string[]
): Promise<QAResult> {
    const flattenSheetData = (table?: string[][]): string => {
        try {
            if (!Array.isArray(table)) return '';
            const lines = table.map(r => (Array.isArray(r) ? r.map(v => String(v ?? '')).join(' ') : '')).filter(Boolean);
            const joined = lines.join('\n');
            return joined.length > 20000 ? joined.slice(0, 20000) : joined;
        } catch { return ''; }
    };

    if (!hydratedSheetData || Object.keys(hydratedSheetData).length === 0) {
        return { answer: `I couldn’t load your sheet data. Try specifying a sheet name or column.` };
    }

    const candidateNames = selectedSheetNames.length > 0 ? selectedSheetNames : Object.keys(hydratedSheetData);
    const sheetName = candidateNames.find((n) => message.toLowerCase().includes(normalizeToken(n))) || candidateNames[0];
    const table = hydratedSheetData[sheetName] || [];
    if (table.length === 0) return null;

    const shaped = structureForDisplay(table);
    const headers = shaped.headers;
    let rows = shaped.rows;
    if (headers.length === 0 || rows.length === 0) return null;

    const { metricIdx, productKeyIdx, dateIdx } = resolveQueryColumns(message, headers, rows);
    const queryType = classifyQueryType(message);

    const range = detectDateWindow(message);
    if (range && dateIdx >= 0) {
        rows = rows.filter((r) => {
            const d = dayjs(String(r[dateIdx] || ''));
            return d.isValid() && (d.isAfter(range.start) || d.isSame(range.start)) && (d.isBefore(range.end) || d.isSame(range.end));
        });
    }

    rows = applyQueryFilters(rows, message, headers);

    if (queryType.groupMatch) {
        const groupIdx = bestHeaderIndex(headers, queryType.groupMatch[1].trim());
        if (groupIdx >= 0) {
            const operation = queryType.wantsAvg ? 'avg' : queryType.wantsMin ? 'min' : queryType.wantsMax ? 'max' : 'sum';
            const entries = performAggregation(rows, metricIdx, groupIdx, operation);
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
            if (queryType.wantsAvg) metricValue = best.count ? best.sum / best.count : 0;
            else if (queryType.wantsMin) metricValue = best.min;
            else if (queryType.wantsMax) metricValue = best.max;
            else metricValue = best.sum;
            const label = queryType.wantsAvg ? 'Average' : queryType.wantsMin ? 'Min' : queryType.wantsMax ? 'Max' : 'Total';
            const answer = `${label} ${headers[metricIdx]} by ${headers[groupIdx]}: ${Number(metricValue.toFixed(2))} (top: ${best.key}).`;
            return { answer, tables };
        }
    }

    if (queryType.wantsCount) {
        const uniqueHint = /(unique|distinct)\b/i.test(message);
        const columnMatch = message.match(/\b(?:of|in|for)?\s*([a-z][a-z0-9_\s]{2,})\b(?:\s+column)?/i);
        let direct = '';
        if (columnMatch) direct = columnMatch[1].trim();
        const idx = resolveColumnIndex(headers, direct || message);
        if (idx >= 0 && (uniqueHint || /\b(products?|drivers?|vehicles?|items?)\b/i.test(message))) {
            const values = rows.map(r => String(r[idx] ?? '')).filter(v => v.trim() !== '');
            const unique = new Set(values.map(v => v.toLowerCase())).size;
            const label = headers[idx];
            const answer = uniqueHint
                ? `Distinct ${label}${range?.label ? ` ${range.label}` : ''}: ${unique}.`
                : `Count of ${label}${range?.label ? ` ${range.label}` : ''}: ${values.length}.`;
            return { answer };
        }
        const answer = `Count${range?.label ? ` ${range.label}` : ''}: ${rows.length} row(s) in ${sheetName}.`;
        return { answer };
    }

    if (queryType.wantsSum || queryType.wantsAvg || queryType.wantsMin || queryType.wantsMax) {
        const vals = rows.map((r) => parseNumber(r[metricIdx])).filter((n): n is number => n != null);
        const total = vals.reduce((a, b) => a + b, 0);
        const avg = vals.length ? total / vals.length : 0;
        const min = vals.length ? Math.min(...vals) : 0;
        const max = vals.length ? Math.max(...vals) : 0;
        let answer = '';
        let tables: StructuredTable[] | undefined;
        if (queryType.wantsSum) answer = `Sum(${headers[metricIdx]}): ${Number(total.toFixed(2))} across ${vals.length} row(s) in ${sheetName}.`;
        else if (queryType.wantsAvg) answer = `Average(${headers[metricIdx]}): ${Number(avg.toFixed(2))} over ${vals.length} row(s) in ${sheetName}.`;
        else if (queryType.wantsMin || queryType.wantsMax) {
            const target = queryType.wantsMin ? min : max;
            if (productKeyIdx >= 0 && metricIdx >= 0 && Number.isFinite(target)) {
                const items = rows.filter(r => {
                    const n = parseNumber(r[metricIdx]);
                    return n != null && Math.abs(n - target) < 1e-6;
                });
                if (items.length > 0) {
                    const rowsOut = items.slice(0, 10).map(r => [String(r[productKeyIdx] ?? ''), String(parseNumber(r[metricIdx]) ?? '')]);
                    tables = [{ title: `${sheetName} · ${queryType.wantsMin ? 'Min' : 'Max'} ${headers[metricIdx]}`, headers: [headers[productKeyIdx], headers[metricIdx]], rows: rowsOut }];
                    answer = `${queryType.wantsMin ? 'Min' : 'Max'} ${headers[metricIdx]}: ${Number(target.toFixed(2))} — ${rowsOut[0][0]}${rowsOut.length > 1 ? ` (+${rowsOut.length - 1} more)` : ''}.`;
                } else {
                    answer = `${queryType.wantsMin ? 'Min' : 'Max'} ${headers[metricIdx]}: ${Number(target.toFixed(2))} in ${sheetName}.`;
                }
            } else {
                answer = `${queryType.wantsMin ? 'Min' : 'Max'} ${headers[metricIdx]}: ${Number(target.toFixed(2))} in ${sheetName}.`;
            }
        }
        return tables ? { answer, tables } : { answer };
    }

    // Fallback to LLM for complex questions
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    const ai = genkit({ plugins: [googleAI({ apiKey })], model: gemini15Flash });
    const previewTable = [headers, ...rows.slice(0, 30)];
    const prompt = `You are a spreadsheet QA assistant. Answer the user query based on the provided data. Return a JSON object with "answer" and optional "insights" and "chart".\n\nUser query: ${JSON.stringify(message)}\nHeaders: ${JSON.stringify(headers)}\nSample rows (CSV-like): ${JSON.stringify(previewTable)}\n`;
    try {
        const out = await ai.generate(prompt);
        const text = (out?.text || '').trim().replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(text);
        return {
            answer: parsed.answer || 'I am not sure how to answer that.',
            insights: parsed.insights,
            chart: parsed.chart,
        };
    } catch {
        return { answer: 'I was unable to process the response from the model.' };
    }
}
