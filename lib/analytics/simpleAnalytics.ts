// lib/analytics/simpleAnalytics.ts

import { normalizeNumber } from '../utils/normalizeNumber';

export function parseNumber(value: unknown): number | null {
  if (value == null) return null;
  // Use the comprehensive normalizeNumber function for consistency
  const normalized = normalizeNumber(String(value));
  return normalized.value;
}

export type AggregateMetric = { col: string; op: 'sum' | 'avg' | 'count' };
export type AggregateFilter = { col: string; op: '>=' | '<=' | '==' ; value: string };
export type AggregateSpec = {
  groupBy?: string[];
  metrics?: AggregateMetric[];
  filter?: AggregateFilter | { condition?: 'AND'|'OR'; filters: AggregateFilter[] };
};

export function aggregateRows(
  rows: string[][],
  headers: string[],
  spec: AggregateSpec
): Array<Record<string, unknown>> {
  const columnIndexOf = (colName: string): number => headers.indexOf(colName);
  const { groupBy = [], metrics = [], filter } = spec || {} as AggregateSpec;

  const matchesFilter = (row: string[]): boolean => {
    if (!filter) return true;
    const applyOne = (f: AggregateFilter): boolean => {
      const ci = columnIndexOf(f.col);
      if (ci < 0) return true; // unknown column → ignore filter
      const cell = row[ci];
      if (f.op === '==') return String(cell) === String(f.value);
      const lhs = new Date(String(cell));
      const rhs = new Date(String(f.value));
      if (f.op === '>=') return lhs >= rhs;
      if (f.op === '<=') return lhs <= rhs;
      return true;
    };
    if ((filter as any).filters && Array.isArray((filter as any).filters)) {
      const cond = (filter as any).condition === 'OR' ? 'OR' : 'AND';
      const filters = (filter as any).filters as AggregateFilter[];
      return cond === 'OR' ? filters.some(applyOne) : filters.every(applyOne);
    }
    return applyOne(filter as AggregateFilter);
  };

  // apply filter
  const filtered = rows.filter(matchesFilter);

  // group rows by groupBy columns
  const groupMap = new Map<string, string[][]>();
  const buildKey = (row: string[]): string => {
    if (!groupBy || groupBy.length === 0) return '';
    const parts = groupBy.map((g) => row[columnIndexOf(g)] ?? '');
    return parts.join('|');
  };
  for (const row of filtered) {
    const key = buildKey(row);
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(row);
  }

  // compute metrics per group
  const results: Array<Record<string, unknown>> = [];
  for (const [key, groupRows] of groupMap.entries()) {
    const out: Record<string, unknown> = { key: key ? key.split('|') : [] };
    for (const m of metrics) {
      const ci = columnIndexOf(m.col);
      const values = groupRows
        .map((r) => parseNumber(r[ci]))
        .filter((v): v is number => v !== null);
      switch (m.op) {
        case 'sum': {
          const sum = values.reduce((s, a) => s + (a || 0), 0);
          out[`sum_${m.col}`] = Number(sum.toFixed(6));
          break;
        }
        case 'avg': {
          const sum = values.reduce((s, a) => s + (a || 0), 0);
          const avg = values.length ? sum / values.length : 0;
          out[`avg_${m.col}`] = Number(avg.toFixed(6));
          break;
        }
        case 'count': {
          out[`count_${m.col}`] = values.length;
          break;
        }
        default:
          break;
      }
    }
    results.push(out);
  }

  return results;
}


