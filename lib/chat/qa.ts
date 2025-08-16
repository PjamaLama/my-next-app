import dayjs from 'dayjs';
import { StructuredTable } from './types';
import { bestHeaderIndex, detectDateWindow, normalizeToken, parseNumber, structureForDisplay, normalizeDateColumns } from './utils';
import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';

export type QAResult = { answer: string; tables?: StructuredTable[]; insights?: string[]; chart?: { kind: 'bar' | 'line' | 'pie'; title: string; labels: string[]; datasets: Array<{ label: string; data: number[] }> } | null } | null;

import { resolveColumnIndex, parseSimpleFilter, classifyQueryType, resolveQueryColumns, performAggregation, applyQueryFilters } from './queryProcessing';

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
