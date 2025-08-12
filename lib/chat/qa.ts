import dayjs from 'dayjs';
import { StructuredTable } from './types';
import { bestHeaderIndex, detectDateWindow, normalizeToken, parseNumber, structureForDisplay, normalizeDateColumns } from './utils';
import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';

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

  // Handle simple entity lookup questions like "who was the driver"
  try {
    const asksWho = /\bwho\b/i.test(message);
    const mentionsDriver = /\b(driver|driver name|operator)\b/i.test(lower);
    if (asksWho && mentionsDriver) {
      const driverIdx = resolveColumnIndex(headers, message, COLUMN_SYNONYMS.driver);
      if (driverIdx >= 0) {
        // Prefer the latest by date when available; otherwise, use the last non-empty driver in the filtered window
        let candidateRows = filtered.filter(r => String(r[driverIdx] ?? '').trim() !== '');
        if (candidateRows.length > 0) {
          if (dateIdx >= 0) {
            candidateRows = candidateRows
              .map(r => ({ r, d: dayjs(String(r[dateIdx] || '')) }))
              .filter(x => x.d.isValid())
              .sort((a, b) => a.d.valueOf() - b.d.valueOf())
              .map(x => x.r);
          }
          const latest = candidateRows[candidateRows.length - 1];
          const name = String(latest[driverIdx] ?? '').trim();
          if (name) {
            // If there are multiple drivers, optionally surface that there are others
            const uniqueDrivers = Array.from(new Set(candidateRows.map(r => String(r[driverIdx] ?? '').trim()).filter(Boolean)));
            const suffix = uniqueDrivers.length > 1 ? ` (latest${range?.label ? ` ${range.label}` : ''})` : '';
            return { answer: `Driver: ${name}${suffix}.` };
          }
        }
      }
    }
  } catch {}

  // Generalized categorical Q&A: detect target categorical column via synonyms (e.g., town/city/location) and answer
  try {
    const wantsMost = /\b(most|top|frequent|often)\b/i.test(message);
    const categoryKeys = Object.keys(COLUMN_SYNONYMS) as Array<keyof typeof COLUMN_SYNONYMS>;
    // Determine which categorical column is referenced, if any
    let targetKey: keyof typeof COLUMN_SYNONYMS | null = null;
    let targetIdx = -1;
    for (const key of categoryKeys) {
      // Skip numeric-focused categories here
      if (key === 'amount' || key === 'fuel' || key === 'margin') continue;
      const synonyms = COLUMN_SYNONYMS[key];
      if (synonyms.some(s => lower.includes(s))) {
        const idx = resolveColumnIndex(headers, message, synonyms);
        if (idx >= 0) {
          targetKey = key;
          targetIdx = idx;
          break;
        }
      }
    }

    if (targetIdx >= 0) {
      const nonEmpty = filtered.filter(r => String(r[targetIdx] ?? '').trim() !== '');
      // Case A: Most/common value for the referenced categorical column
      if (wantsMost && nonEmpty.length > 0) {
        const counts = new Map<string, number>();
        for (const r of nonEmpty) {
          const v = String(r[targetIdx] ?? '').trim();
          counts.set(v, (counts.get(v) || 0) + 1);
        }
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) {
          const [topValue, topCount] = sorted[0];
          const title = `${sheetName} · Most common ${headers[targetIdx]}` + (range?.label ? ` · ${range.label}` : '');
          const tblHeaders = [headers[targetIdx], 'Count'];
          const tblRows = sorted.slice(0, 10).map(([v, c]) => [v, String(c)]);
          return {
            answer: `Most common ${headers[targetIdx]}: ${topValue} (${topCount}).`,
            tables: [{ title, headers: tblHeaders, rows: tblRows }]
          };
        }
      }

      // Case B: If a date window is present, return the value for the latest row in that window
      if (range && nonEmpty.length > 0) {
        let candidate = nonEmpty;
        if (dateIdx >= 0) {
          candidate = candidate
            .map(r => ({ r, d: dayjs(String(r[dateIdx] || '')) }))
            .filter(x => x.d.isValid())
            .sort((a, b) => a.d.valueOf() - b.d.valueOf())
            .map(x => x.r);
        }
        const latest = candidate[candidate.length - 1];
        const value = String(latest[targetIdx] ?? '').trim();
        if (value) {
          return { answer: `${headers[targetIdx]}: ${value}${range?.label ? ` · ${range.label}` : ''}.` };
        }
      }

      // Case C: Fallback — return the latest non-empty categorical value
      if (nonEmpty.length > 0) {
        let candidate = nonEmpty;
        if (dateIdx >= 0) {
          candidate = candidate
            .map(r => ({ r, d: dayjs(String(r[dateIdx] || '')) }))
            .filter(x => x.d.isValid())
            .sort((a, b) => a.d.valueOf() - b.d.valueOf())
            .map(x => x.r);
        }
        const latest = candidate[candidate.length - 1];
        const value = String(latest[targetIdx] ?? '').trim();
        if (value) {
          return { answer: `${headers[targetIdx]}: ${value}.` };
        }
      }
    }
  } catch {}

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

  // As a fallback for complex questions: Use LLM chain-of-thought with a safe pseudo-execution
  try {
    const sampleRows = rows.slice(0, 30);
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    const ai = genkit({ plugins: [googleAI({ apiKey })], model: gemini15Flash });
    const previewTable = [headers, ...sampleRows];
    const prompt = `You are a spreadsheet QA assistant.
Follow these steps strictly:
Step 1: Understand the query.
Step 2: Identify relevant columns and any filters from the provided headers/rows.
Step 3: Reason step-by-step how to compute the answer.
Step 4: Provide a concise final answer.

Return STRICT JSON only with fields: {"reasoning": string, "queryType": "aggregate"|"filter"|"text"|"other", "code": string, "answer": string}
- "code" should be short Python-like pseudocode using pandas (e.g., df['Sales'].sum(), df[df['Region']=='East']['Sales'].mean(), df.groupby('Region')['Sales'].sum().sort_values(desc=True).head(3)).
- Keep reasoning concise (<= 3 sentences). Do NOT include any non-JSON text.

User query: ${JSON.stringify(message)}
Headers: ${JSON.stringify(headers)}
Sample rows (CSV-like): ${JSON.stringify(previewTable)}
`;
    let text = '';
    try {
      const out = await ai.generate(prompt);
      text = (out?.text || '').trim();
    } catch {}
    if (text.startsWith('```')) text = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    const code: string = typeof parsed.code === 'string' ? parsed.code : '';
    const llmAnswer: string = typeof parsed.answer === 'string' ? parsed.answer : '';

    // Simple pseudo-executor to simulate pandas-like snippets on our in-memory table
    const runPseudo = (): { answer?: string; tables?: StructuredTable[] } | null => {
      try {
        // groupby sum: df.groupby('X')['Y'].sum()
        const mGroup = code.match(/groupby\(['"](.+?)['"]\).*?\['(.+?)'\]\.sum\(\)/i);
        if (mGroup) {
          const gCol = mGroup[1];
          const yCol = mGroup[2];
          const gIdx = headers.indexOf(gCol);
          const yIdx = headers.indexOf(yCol);
          if (gIdx >= 0 && yIdx >= 0) {
            const map = new Map<string, number>();
            for (const r of rows) {
              const k = String(r[gIdx] ?? '');
              const v = parseNumber(r[yIdx]);
              if (v != null) map.set(k, (map.get(k) || 0) + v);
            }
            const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
            const tbl: StructuredTable = {
              title: `${sheetName} · Sum(${yCol}) by ${gCol}`,
              headers: [gCol, `Sum(${yCol})`],
              rows: entries.slice(0, 10).map(([k, v]) => [k, String(Number(v.toFixed(2)))]),
            };
            // Basic anomaly detection (z-score on group sums)
            const values = entries.map(e => e[1]);
            const mean = values.reduce((a,b)=>a+b,0) / Math.max(1, values.length);
            const sd = Math.sqrt(values.reduce((a,b)=>a + (b-mean)*(b-mean), 0) / Math.max(1, values.length));
            const anomalies = entries.filter(([,v]) => sd > 0 && Math.abs((v-mean)/sd) >= 2.5).map(e => e[0]);
            const suffix = anomalies.length > 0 ? ` Possible anomalies: ${anomalies.slice(0,3).join(', ')}.` : '';
            return { answer: `Top ${gCol} by total ${yCol}: ${entries[0]?.[0] ?? 'n/a'} (${Number((entries[0]?.[1] ?? 0).toFixed(2))}).${suffix}`, tables: [tbl] };
          }
        }
        // simple sum: df['Col'].sum()
        const mSum = code.match(/\[['"](.+?)['"]\]\.sum\(\)/i);
        if (mSum) {
          const col = mSum[1];
          const idx = headers.indexOf(col);
          if (idx >= 0) {
            const vals = rows.map(r => parseNumber(r[idx])).filter((n): n is number => n != null);
            const total = vals.reduce((a,b)=>a+b,0);
            return { answer: `Sum(${col}): ${Number(total.toFixed(2))}.` };
          }
        }
        // filter mean: df[df['A']=="x"]["B"].mean()
        const mFilterMean = code.match(/df\[df\[['"](.+?)['"]\]\s*([!=]=)\s*['"](.+?)['"]\]\[['"](.+?)['"]\]\.mean\(\)/i);
        if (mFilterMean) {
          const colA = mFilterMean[1]; const op = mFilterMean[2]; const val = mFilterMean[3]; const colB = mFilterMean[4];
          const aIdx = headers.indexOf(colA); const bIdx = headers.indexOf(colB);
          if (aIdx >= 0 && bIdx >= 0) {
            const filt = rows.filter(r => (op === '==' ? String(r[aIdx]) === val : String(r[aIdx]) !== val));
            const vals = filt.map(r => parseNumber(r[bIdx])).filter((n): n is number => n != null);
            const avg = vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
            return { answer: `Average ${colB} where ${colA} ${op} ${val}: ${Number(avg.toFixed(2))}.` };
          }
        }
      } catch {}
      return null;
    };

    const sim = runPseudo();
    if (sim && sim.answer) return sim;
    if (llmAnswer) return { answer: llmAnswer };
  } catch {}

  return null;
}


