import { bestHeaderIndex, parseNumber, structureForDisplay } from '../utils/chatUtils';

export type QueryAggregateFn = 'sum' | 'avg' | 'min' | 'max' | 'count';

export type QuerySpec = {
  sheet?: string;
  select?: string[]; // headers or derived/aggregate aliases
  where?: Array<{ column: string; op: '=' | '!=' | 'contains' | '>' | '<' | '>=' | '<='; value: string | number }>;
  groupBy?: string[];
  aggregates?: Array<{ fn: QueryAggregateFn; of?: string; as?: string }>;
  orderBy?: Array<{ by: string; dir?: 'asc' | 'desc' }>;
  limit?: number;
  derive?: Array<{ as: string; expr: string }>;
};

type Table = string[][];

export function executeSheetQuery(spec: QuerySpec, rawTable: Table): { headers: string[]; rows: string[][]; summary?: string } {
  const shaped = structureForDisplay(rawTable);
  const headers = shaped.headers;
  let rows = shaped.rows;
  if (headers.length === 0 || rows.length === 0) return { headers: [], rows: [] };

  const toIndex = (name: string): number => bestHeaderIndex(headers, name);

  // Derive columns (row-level)
  const derivedDefs = (spec.derive || []).filter(d => d && d.as && d.expr);
  const derivedGetters: Array<{ as: string; fn: (row: string[]) => number | string | null } > = derivedDefs.map(d => ({ as: d.as, fn: buildExpressionFn(d.expr, headers) }));
  let workingHeaders = [...headers];
  if (derivedGetters.length > 0) {
    derivedGetters.forEach(d => { workingHeaders.push(d.as); });
    rows = rows.map(r => {
      const extra = derivedGetters.map(d => {
        const v = d.fn(r);
        return v == null ? '' : String(v);
      });
      return [...r, ...extra];
    });
  }

  // WHERE filters
  if (Array.isArray(spec.where) && spec.where.length > 0) {
    rows = rows.filter(r => spec.where!.every(w => {
      const idx = toIndex(w.column);
      if (idx < 0) return false;
      const cell = String(r[idx] ?? '');
      switch (w.op) {
        case 'contains': return cell.toLowerCase().includes(String(w.value ?? '').toLowerCase());
        case '=': return cell === String(w.value ?? '');
        case '!=': return cell !== String(w.value ?? '');
        case '>': {
          const n = parseNumber(cell); const v = typeof w.value === 'number' ? w.value : parseNumber(w.value); return n != null && v != null && n > v;
        }
        case '<': {
          const n = parseNumber(cell); const v = typeof w.value === 'number' ? w.value : parseNumber(w.value); return n != null && v != null && n < v;
        }
        case '>=': {
          const n = parseNumber(cell); const v = typeof w.value === 'number' ? w.value : parseNumber(w.value); return n != null && v != null && n >= v;
        }
        case '<=': {
          const n = parseNumber(cell); const v = typeof w.value === 'number' ? w.value : parseNumber(w.value); return n != null && v != null && n <= v;
        }
        default: return false;
      }
    }));
  }

  // GROUP BY + aggregates
  const groupCols = Array.isArray(spec.groupBy) ? spec.groupBy.filter(Boolean) : [];
  const aggDefs = Array.isArray(spec.aggregates) ? spec.aggregates.filter(a => a && a.fn) : [];
  if (groupCols.length > 0 || aggDefs.length > 0) {
    // Build map key by group cols; accumulate metrics
    type AggState = Record<string, { sum: number; cnt: number; min: number; max: number }>;
    const groupIdxs = groupCols.map(toIndex);
    const metricIdxs = aggDefs.map(a => a.of ? toIndex(a.of) : -1);

    const map = new Map<string, { keyParts: string[]; agg: AggState }>();
    const groupKey = (r: string[]) => groupIdxs.map(i => (i >= 0 ? String(r[i] ?? 'Unknown') : 'All'));
    const updateAgg = (state: AggState, label: string, val: number | null) => {
      const s = state[label] || { sum: 0, cnt: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
      if (val != null) {
        s.sum += val; s.cnt += 1; s.min = Math.min(s.min, val); s.max = Math.max(s.max, val);
      }
      state[label] = s;
    };
    rows.forEach(r => {
      const parts = groupKey(r);
      const k = JSON.stringify(parts);
      if (!map.has(k)) map.set(k, { keyParts: parts, agg: {} });
      const rec = map.get(k)!;
      // Apply aggregates
      aggDefs.forEach((a, idx) => {
        const alias = a.as || `${a.fn}${a.of ? `(${a.of})` : ''}`;
        const colIdx = metricIdxs[idx];
        const v = a.fn === 'count' ? 1 : (colIdx >= 0 ? parseNumber(r[colIdx]) : null);
        updateAgg(rec.agg, alias, v);
      });
    });

    // Build output headers and rows
    const outHeaders: string[] = [];
    outHeaders.push(...(groupCols.length > 0 ? groupCols : ['All']));
    const aggAliases = aggDefs.map(a => a.as || `${a.fn}${a.of ? `(${a.of})` : ''}`);
    outHeaders.push(...(aggAliases.length > 0 ? aggAliases : ['Count']));

    const outRows: string[][] = [];
    for (const { keyParts, agg } of Array.from(map.values())) {
      const row: string[] = [];
      row.push(...keyParts);
      if (aggAliases.length > 0) {
        aggAliases.forEach(alias => {
          const st = agg[alias] || { sum: 0, cnt: 0, min: 0, max: 0 };
          const def = aggDefs.find(a => (a.as || `${a.fn}${a.of ? `(${a.of})` : ''}`) === alias)!;
          switch (def.fn) {
            case 'sum': row.push(String(Number(st.sum.toFixed(2)))); break;
            case 'avg': row.push(String(Number((st.cnt ? st.sum / st.cnt : 0).toFixed(2)))); break;
            case 'min': row.push(String(Number(st.min.toFixed(2)))); break;
            case 'max': row.push(String(Number(st.max.toFixed(2)))); break;
            case 'count': row.push(String(st.cnt)); break;
            default: row.push('');
          }
        });
      } else {
        // default to count
        const total = Object.values(agg)[0]?.cnt ?? 0;
        row.push(String(total));
      }
      outRows.push(row);
    }

    // ORDER BY
    const order = spec.orderBy && spec.orderBy[0];
    if (order) {
      const idx = outHeaders.findIndex(h => h.toLowerCase() === order.by.toLowerCase());
      if (idx >= 0) {
        outRows.sort((a, b) => {
          const av = parseNumber(a[idx]);
          const bv = parseNumber(b[idx]);
          const na = av == null ? Number.NEGATIVE_INFINITY : av;
          const nb = bv == null ? Number.NEGATIVE_INFINITY : bv;
          return (order.dir === 'asc' ? na - nb : nb - na);
        });
      }
    }

    const limited = typeof spec.limit === 'number' && spec.limit > 0 ? outRows.slice(0, spec.limit) : outRows;
    return { headers: outHeaders, rows: limited, summary: `Grouped ${rows.length} row(s).` };
  }

  // Projection (select), order, limit for raw rows
  let selectedIdxs: number[] | null = null;
  if (Array.isArray(spec.select) && spec.select.length > 0) {
    selectedIdxs = spec.select.map(toIndex).filter(i => i >= 0);
  }
  const projHeaders = selectedIdxs ? selectedIdxs.map(i => workingHeaders[i]) : workingHeaders;
  let projRows = rows.map(r => selectedIdxs ? selectedIdxs.map(i => String(r[i] ?? '')) : r);

  // Order
  const order = spec.orderBy && spec.orderBy[0];
  if (order) {
    const idx = projHeaders.findIndex(h => h.toLowerCase() === order.by.toLowerCase());
    if (idx >= 0) {
      projRows.sort((a, b) => {
        const av = parseNumber(a[idx]);
        const bv = parseNumber(b[idx]);
        if (av != null && bv != null) return order.dir === 'asc' ? av - bv : bv - av;
        return String(a[idx]).localeCompare(String(b[idx]));
      });
    }
  }

  // Limit
  if (typeof spec.limit === 'number' && spec.limit > 0) projRows = projRows.slice(0, spec.limit);

  return { headers: projHeaders, rows: projRows, summary: `Returned ${projRows.length} row(s).` };
}

// Very small expression parser for derive: supports variables (header names), numbers and + - * /
function buildExpressionFn(expr: string, headers: string[]): (row: string[]) => number | null {
  const tokens = tokenize(expr);
  const toIdx = (name: string) => bestHeaderIndex(headers, name);
  const rpn = toRPN(tokens, headers);
  return (row: string[]) => {
    try {
      const stack: number[] = [];
      for (const t of rpn) {
        if (t.type === 'num') stack.push(t.value as number);
        else if (t.type === 'var') {
          const idx = toIdx(String(t.value));
          const n = idx >= 0 ? parseNumber(row[idx]) : null;
          stack.push(n == null ? NaN : n);
        } else if (t.type === 'op') {
          const b = stack.pop(); const a = stack.pop();
          if (a == null || b == null) return null;
          switch (t.value) {
            case '+': stack.push(a + b); break;
            case '-': stack.push(a - b); break;
            case '*': stack.push(a * b); break;
            case '/': stack.push(b === 0 ? NaN : a / b); break;
            default: return null;
          }
        }
      }
      const out = stack.pop();
      if (out == null || !Number.isFinite(out)) return null;
      return Number(out.toFixed(6));
    } catch { return null; }
  };
}

function tokenize(expr: string): Array<{ type: 'num' | 'var' | 'op' | 'paren'; value: string | number }> {
  const tokens: Array<{ type: 'num' | 'var' | 'op' | 'paren'; value: string | number }> = [];
  const re = /([A-Za-z_][A-Za-z0-9_\s-]*)|(\d+\.?\d*)|([+\-*/])|([()])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr)) != null) {
    if (m[1]) tokens.push({ type: 'var', value: m[1].trim() });
    else if (m[2]) tokens.push({ type: 'num', value: parseFloat(m[2]) });
    else if (m[3]) tokens.push({ type: 'op', value: m[3] });
    else if (m[4]) tokens.push({ type: 'paren', value: m[4] });
  }
  return tokens;
}

function toRPN(tokens: Array<{ type: 'num' | 'var' | 'op' | 'paren'; value: string | number }>, headers: string[]) {
  const out: typeof tokens = [];
  const stack: typeof tokens = [];
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
  for (const t of tokens) {
    if (t.type === 'num' || t.type === 'var') out.push(t);
    else if (t.type === 'op') {
      while (stack.length && stack[stack.length - 1].type === 'op' && prec[String(stack[stack.length - 1].value)] >= prec[String(t.value)]) {
        out.push(stack.pop()!);
      }
      stack.push(t);
    } else if (t.type === 'paren') {
      if (t.value === '(') stack.push(t);
      else {
        while (stack.length && stack[stack.length - 1].value !== '(') out.push(stack.pop()!);
        stack.pop();
      }
    }
  }
  while (stack.length) out.push(stack.pop()!);
  return out;
}


