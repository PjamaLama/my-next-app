import dayjs from 'dayjs';
import { Context, ConversationHistoryItem, ImageData, StructuredTable } from './types';
import { generateQuickReplies } from './quickReplies';
import { executeToolCall } from './toolExecution';
import { buildSmartTables } from './tables';
import { normalizeDateColumns } from './utils';
import { answerQuestionFromSheets } from './qa';
import { buildChartSpecs } from './charts';
import { composeGroundedReply } from './replyComposer';

export async function processMessage(
  message: string,
  context: Context,
  conversationHistory: ConversationHistoryItem[],
  images: ImageData[] = []
) {
  try {
    const lowerMessage = (message || '').toLowerCase();
    let intent = 'chat';
    const suggestedTools: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];

    const isGreeting = /^(hi|hello|hey|yo|howdy|good\s+(morning|afternoon|evening))\b/i.test((message || '').trim());
    if (isGreeting) {
      const quickReplies = await generateQuickReplies(message, conversationHistory, context, intent, false);
      return {
        response: 'Hi! How can I help with your sheet or files?',
        toolCalls: [],
        pendingToolCalls: [],
        toolResults: [],
        context,
        quickReplies
      };
    }

    const hasFiles = images && images.length > 0;
    const isFileOnly = hasFiles && (!message || message.trim() === '');
    const hasPDFs = hasFiles && images.some(img => img.mimeType === 'application/pdf');

    if (context.fileAnalysis && context.fileAnalysis.files.length > 0) {
      const timeSinceAnalysis = Date.now() - (context.fileAnalysis.lastUpdated || 0);
      if (timeSinceAnalysis < 5 * 60 * 1000) {
        // follow-up actions disabled to avoid numeric triggers
      }
    }

    if (hasFiles) {
      const isSheetRelated = lowerMessage.includes('add') || lowerMessage.includes('update') || lowerMessage.includes('insert') || lowerMessage.includes('sheet') || lowerMessage.includes('spreadsheet');
      if (isSheetRelated) {
        suggestedTools.push({
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: {
            name: 'extract_data_from_files',
            arguments: JSON.stringify({ transcript: message, fileCount: images.length, fileTypes: images.map(i => i.mimeType) })
          }
        });
      } else {
        suggestedTools.push({
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: {
            name: hasPDFs ? 'analyze_files' : 'analyze_images',
            arguments: JSON.stringify({ transcript: message, fileCount: images.length, fileTypes: images.map(i => i.mimeType) })
          }
        });
      }
    } else {
      // Detect bulk numeric column operations like: "add 100 to Cost per item", "decrease 5 from Price", "multiply Quantity by 2", "divide Total by 3"
      const msg = message || '';
      const addInc = msg.match(/\b(?:add|increase)\s+(-?\d+(?:\.\d+)?)\s+(?:to)\s+(?:all|every|the)\s+(.+?)(?:\s+(?:in|on)\s+(?:this|the)\s+(?:sheet|table))?$/i);
      const subDec = msg.match(/\b(?:subtract|decrease)\s+(-?\d+(?:\.\d+)?)\s+(?:from)\s+(?:all|every|the)\s+(.+?)(?:\s+(?:in|on)\s+(?:this|the)\s+(?:sheet|table))?$/i);
      const mul = msg.match(/\b(?:multiply)\s+(?:all|every|the)\s+(.+?)\s+(?:by)\s+(-?\d+(?:\.\d+)?)$/i);
      const div = msg.match(/\b(?:divide)\s+(?:all|every|the)\s+(.+?)\s+(?:by)\s+(-?\d+(?:\.\d+)?)$/i);

      let op: 'add'|'subtract'|'multiply'|'divide'|null = null;
      let amount = 0;
      let columnQuery = '';
      if (addInc) { op = 'add'; amount = parseFloat(addInc[1]); columnQuery = addInc[2]; }
      else if (subDec) { op = 'subtract'; amount = parseFloat(subDec[1]); columnQuery = subDec[2]; }
      else if (mul) { op = 'multiply'; amount = parseFloat(mul[2]); columnQuery = mul[1]; }
      else if (div) { op = 'divide'; amount = parseFloat(div[2]); columnQuery = div[1]; }

      if (op && columnQuery && context?.spreadsheetId && Array.isArray(context?.sheetNames) && (context.sheetNames as string[]).length) {
        if (!Array.isArray((context as any).availableTools) || (context as any).availableTools.includes('bulk_update_column')) {
          suggestedTools.push({
            id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: { name: 'bulk_update_column', arguments: JSON.stringify({ column: columnQuery.trim(), operation: op, amount }) }
          });
        }
      } else if (lowerMessage.includes('add') || lowerMessage.includes('insert') || lowerMessage.includes('new')) {
        intent = 'add_data';
        if (!Array.isArray((context as any).availableTools) || (context as any).availableTools.includes('update_sheet')) {
          suggestedTools.push({
            id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: { name: 'update_sheet', arguments: JSON.stringify({ transcript: message }) }
          });
        }
      } else if (/\b[A-Z]{1,3}\d+\b/.test(message) && (lowerMessage.includes('set') || lowerMessage.includes('change') || lowerMessage.includes('update'))) {
        const cellMatch = message.match(/\b([A-Z]{1,3}\d+)\b/);
        const valueMatch = message.match(/to\s+(.+)$/i);
        if (cellMatch && context?.spreadsheetId && context?.sheetNames?.length) {
          if (!Array.isArray((context as any).availableTools) || (context as any).availableTools.includes('update_single_cell')) {
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
        }
      } else if (lowerMessage.includes('update') || lowerMessage.includes('change') || lowerMessage.includes('edit')) {
        intent = 'update_data';
        if (!Array.isArray((context as any).availableTools) || (context as any).availableTools.includes('update_sheet')) {
          suggestedTools.push({
            id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: { name: 'update_sheet', arguments: JSON.stringify({ transcript: message }) }
          });
        }
      } else if (/\b(report|overview|insights?)\b/i.test(lowerMessage)) {
        intent = 'get_data';
        if (!Array.isArray((context as any).availableTools) || (context as any).availableTools.includes('generate_report')) {
          suggestedTools.push({
            id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: { name: 'generate_report', arguments: JSON.stringify({ responsePrefs: { charts: true } }) }
          });
        }
      } else if (lowerMessage.includes('show') || lowerMessage.includes('get') || lowerMessage.includes('display') || lowerMessage.includes('data')) {
        intent = 'get_data';
        const sheetNamesList = Array.isArray(context?.sheetNames) ? (context.sheetNames as string[]) : [];
        const targetSheet = (context?.sheetName as string) || (sheetNamesList.length > 0 ? sheetNamesList[0] : undefined);
        if (context?.spreadsheetId && targetSheet) {
          if (!Array.isArray((context as any).availableTools) || (context as any).availableTools.includes('get_sheet_data')) {
            suggestedTools.push({
              id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'function',
              function: { name: 'get_sheet_data', arguments: JSON.stringify({ spreadsheetId: context.spreadsheetId, sheetName: targetSheet }) }
            });
          }
        }
      } else if (/(how\s+many|count|number\s+of|unique|distinct)\b/i.test(message)) {
        intent = 'get_data';
        const sheetNamesList = Array.isArray(context?.sheetNames) ? (context.sheetNames as string[]) : [];
        const targetSheet = (context?.sheetName as string) || (sheetNamesList.length > 0 ? sheetNamesList[0] : undefined);
        if (context?.spreadsheetId && targetSheet) {
          if (!Array.isArray((context as any).availableTools) || (context as any).availableTools.includes('get_sheet_stats')) {
            suggestedTools.push({
              id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'function',
              function: { name: 'get_sheet_stats', arguments: JSON.stringify({ spreadsheetId: context.spreadsheetId, sheetName: targetSheet }) }
            });
          }
          const mDistinct = message.match(/\b(?:distinct|unique)\s+([a-z][a-z0-9_\s-]{2,})/i);
          const mHowMany = message.match(/\bhow\s+many\s+([a-z][a-z0-9_\s-]{2,})/i);
          const columnQuery = (mDistinct?.[1] || mHowMany?.[1] || '').trim();
          if (columnQuery) {
            if (!Array.isArray((context as any).availableTools) || (context as any).availableTools.includes('get_column_stats')) {
              suggestedTools.push({
                id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'function',
                function: { name: 'get_column_stats', arguments: JSON.stringify({ spreadsheetId: context.spreadsheetId, sheetName: targetSheet, column: columnQuery }) }
              });
            }
          }
        }
      }
    }

    const toolResults: any[] = [];
    let enhancedResponse = '';
    for (const toolCall of suggestedTools) {
      const result = await executeToolCall(toolCall, context, images);
      toolResults.push(result);
      if (result.success) {
        const executedToolName = toolCall.function.name;
        if (executedToolName === 'extract_text_only') {
          if (!context.fileAnalysis) {
            context.fileAnalysis = { files: [], lastUpdated: Date.now() };
          }
          const extractedTexts = Array.isArray(result.extractions) ? result.extractions.map((ex: any) => ex.extractedText || '') : [];
          if (context.fileAnalysis && extractedTexts) {
            images.forEach((image, index) => {
              context.fileAnalysis!.files.push({ mimeType: image.mimeType, extractedData: extractedTexts[index] || '', timestamp: Date.now() });
            });
            context.fileAnalysis.lastUpdated = Date.now();
          }
        } else if (executedToolName === 'analyze_files' || executedToolName === 'analyze_images') {
          if (!context.fileAnalysis) {
            context.fileAnalysis = { files: [], lastUpdated: Date.now() };
          }
          let extractedData: any = [];
          if (result.analyses && Array.isArray(result.analyses)) {
            extractedData = result.analyses.map((a: any) => a.extractedData?.result?.extracted_data || a.extractedData || []).flat();
          } else if (result.details && result.details.analyses) {
            extractedData = result.details.analyses.map((a: any) => a.extractedData?.result?.extracted_data || a.extractedData || []).flat();
          } else {
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
          if (context.fileAnalysis && extractedData) {
            images.forEach((image) => {
              context.fileAnalysis!.files.push({ mimeType: image.mimeType, extractedData, timestamp: Date.now() });
            });
            context.fileAnalysis.lastUpdated = Date.now();
          }
        } else if (executedToolName === 'update_sheet') {
          // Surface the tool summary so the user sees a meaningful confirmation
          if (typeof result.result === 'string' && result.result.trim()) {
            enhancedResponse += `\n${result.result.trim()}`;
          }
        } else if (
          executedToolName === 'get_sheet_data' ||
          executedToolName === 'get_sheet_stats' ||
          executedToolName === 'get_column_stats' ||
          executedToolName === 'update_single_cell' ||
          executedToolName === 'bulk_update_column' ||
          executedToolName === 'apply_structured_rows'
        ) {
          if (typeof result.result === 'string' && result.result.trim()) {
            enhancedResponse += `\n${result.result.trim()}`;
          }
          // If we fetched sheet data, merge directly into context.sheetData for immediate QA/composer grounding
          if (executedToolName === 'get_sheet_data' && (result as any).data && Array.isArray((result as any).data)) {
            try {
              const args = JSON.parse(toolCall.function.arguments || '{}');
              const name = String(args.sheetName || '').trim();
              if (name) {
                const ctxAny = context as any;
                if (!ctxAny.sheetData || typeof ctxAny.sheetData !== 'object') ctxAny.sheetData = {};
                ctxAny.sheetData[name] = (result as any).data as string[][];
                ctxAny._sheetHydratedAt = Date.now();
              }
            } catch {}
          }
        } else if (executedToolName === 'extract_data_from_files') {
          // Extraction tools may not directly update sheets; still surface a brief summary
          if (typeof result.result === 'string' && result.result.trim()) {
            enhancedResponse += `\n${result.result.trim()}`;
          }
        }
      } else {
        // Surface detailed error text for UI toast/logging
        const detailsText = result && (result as any).details
          ? (typeof (result as any).details === 'string'
              ? (result as any).details
              : JSON.stringify((result as any).details))
          : '';
        enhancedResponse += `\nTool error: ${result.result}${detailsText ? `\nDetails: ${detailsText}` : ''}`;
      }
    }

    let response = '';
    const dataTables: StructuredTable[] = [];

    // Determine if user is asking for charts/graphs early (used by table suppression later)
    const wantCharts = (context as any)?.responsePrefs?.charts === true || /\b(chart|graph|trend|distribution|plot|bar\s+chart|line\s+chart|pie\s+chart)\b/i.test(message);

    // auto-hydrate sheets
    try {
      const now = Date.now();
      const ctxAny = context as any;
      const hasHydrated = ctxAny.sheetData && Object.keys(ctxAny.sheetData).length > 0;
      const lastHydration = typeof ctxAny._sheetHydratedAt === 'number' ? ctxAny._sheetHydratedAt : 0;
      const isStale = now - lastHydration > 60_000;
      let sheetNamesList = Array.isArray(ctxAny.sheetNames) ? (ctxAny.sheetNames as string[]) : [];
      // Fallbacks: single sheetName, else first from allSheetNames
      if ((!sheetNamesList || sheetNamesList.length === 0)) {
        const single = typeof ctxAny.sheetName === 'string' && ctxAny.sheetName.trim() ? [ctxAny.sheetName] : [];
        const fromAll = Array.isArray(ctxAny.allSheetNames) && ctxAny.allSheetNames.length > 0 ? [ctxAny.allSheetNames[0]] : [];
        sheetNamesList = single.length > 0 ? single : fromAll;
      }
      const canHydrate = (!hasHydrated || isStale) && !!context?.spreadsheetId && sheetNamesList.length > 0 && !hasFiles;
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
          if (r.status === 'fulfilled' && r.value) map[r.value.name] = r.value.data;
        }
        if (Object.keys(map).length > 0) {
          ctxAny.sheetData = map;
          ctxAny._sheetHydratedAt = now;
          // Build a lightweight column catalog for the first hydrated sheet
          try {
            const first = Object.keys(map)[0];
            const table = map[first] || [];
            const headers = Array.isArray(table) && table.length > 0 ? table[0] : [];
            const lower = headers.map((h: string) => String(h || '').toLowerCase());
            const types = headers.map((_, i) => {
              // numeric if >50% parseNumber
              const col = (table.slice(1) as string[][]).map(r => r?.[i]);
              const num = col.map(parseFloat).filter(n => Number.isFinite(n)).length;
              return num / Math.max(1, col.length) > 0.5 ? 'number' : 'text';
            });
            ctxAny.columnCatalog = { sheet: first, headers, lower, types };
          } catch {}
        }
      }
    } catch {}

    // QA over sheets (skip if user is asking specifically for charts/graphs without an explicit data/table request)
    try {
      const hydratedForQA = (context as any).sheetData as Record<string, string[][]> | undefined;
      const selectedForQA = Array.isArray((context as any).sheetNames) ? ((context as any).sheetNames as string[]) : [];
      const wantsExplicitDataView = /(\bshow\b|\bdisplay\b|\btable\b|\bcolumns?\b|\brows?\b|\blist\b|\boverview\b|\bsummary\b)/i.test(message);
      const suppressTablesForCharts = wantCharts && !wantsExplicitDataView;
      if (hydratedForQA && Object.keys(hydratedForQA).length > 0 && !hasFiles && !suppressTablesForCharts) {
        const qa = answerQuestionFromSheets(message, hydratedForQA, selectedForQA);
        if (qa) {
          response = qa.answer;
          if (qa.tables && qa.tables.length > 0) dataTables.push(...qa.tables);
        }
      }
    } catch {}

    // file analysis status: concise
    if (context.fileAnalysis && context.fileAnalysis.files.length > 0) {
      const latestAnalysis = context.fileAnalysis.files[context.fileAnalysis.files.length - 1];
      const timeSinceAnalysis = Date.now() - (context.fileAnalysis.lastUpdated || 0);
      const extractedData = Array.isArray(latestAnalysis.extractedData) ? latestAnalysis.extractedData : [];
      if (!isFileOnly) {
        if (extractedData.length > 0) response = response || `Extracted ${extractedData.length} item(s).`;
      }
    }

    const hydratedSheetData = (context as any).sheetData as Record<string, string[][]> | undefined;
    const selectedSheetNames = Array.isArray((context as any).sheetNames) ? (context as any).sheetNames as string[] : [];
    const wantsExplicitDataView2 = /(\bshow\b|\bdisplay\b|\btable\b|\bcolumns?\b|\brows?\b|\blist\b|\bgroup\b|\bby\b|\bper\b|\btotals?\b|\bsum\b|\baverage\b|\bavg\b|\bcount\b|\bfilter\b|\bunique\b|\bdistinct\b|\boverview\b|\bsummary\b)/i.test(message);
    const suppressTablesForCharts2 = wantCharts && !wantsExplicitDataView2;
    if (!hasFiles && !suppressTablesForCharts2 && hydratedSheetData && Object.keys(hydratedSheetData).length > 0 && (intent === 'get_data' || wantsExplicitDataView2)) {
      try {
        const smart = buildSmartTables(message, hydratedSheetData, selectedSheetNames);
        if (smart.length > 0) dataTables.push(...smart);
      } catch {}
    }

    // per-file preview tables built strictly one table per file
    try {
      const filePreviews: StructuredTable[] = [];

      // Gather extractions by file index
      const allExtractions: any[] = toolResults.map(r => (r as any).extractions).filter(Boolean).flat();
      const extractionsByIndex = new Map<number, any>();
      for (const ex of allExtractions) {
        if (!ex || ex.success === false) continue;
        const idx = typeof ex.index === 'number' ? Math.max(0, ex.index - 1) : undefined;
        if (idx != null && !extractionsByIndex.has(idx)) {
          extractionsByIndex.set(idx, ex);
        }
      }

      // Gather analyses by file index
      let analysesFromTools: any[] = toolResults.map(r => (r as any).analyses).filter(Boolean).flat();
      if (!analysesFromTools || analysesFromTools.length === 0) {
        const fallback = toolResults.map(r => (r as any).details?.analysisResults).filter(Boolean).flat();
        if (fallback && fallback.length > 0) analysesFromTools = fallback as any[];
      }
      const analysesByIndex = new Map<number, any>();
      for (const a of analysesFromTools || []) {
        if (!a || a.success === false) continue;
        const idx = typeof a.index === 'number' ? Math.max(0, a.index - 1) : undefined;
        if (idx != null && !analysesByIndex.has(idx)) {
          analysesByIndex.set(idx, a);
        }
      }

      // Build exactly one table per uploaded file (when available)
      for (let i = 0; i < (images?.length || 0); i++) {
        const fileName = images?.[i]?.name;

        // Prefer structured rows from analyses
        const a = analysesByIndex.get(i);
        if (a) {
          const data = a.extractedData ?? a.analysis;
          let rowsArr: any[] | null = null;
          if (data && typeof data === 'object') {
            if (Array.isArray((data as any).extracted_rows)) rowsArr = (data as any).extracted_rows as any[];
            else if ((data as any).result && Array.isArray((data as any).result.extracted_rows)) rowsArr = (data as any).result.extracted_rows as any[];
          }
          if (Array.isArray(rowsArr) && rowsArr.length > 0) {
            const allKeys: string[] = Array.from(new Set<string>(rowsArr.flatMap((r: any) => Object.keys(r))));
            const rows: string[][] = rowsArr.slice(0, 50).map((r: Record<string, unknown>) => allKeys.map((k: string) => String((r as any)[k] ?? '')));
            filePreviews.push({
              title: `Structured Extracted Data${fileName ? ` — ${fileName}` : ` (File ${i + 1})`}`,
              headers: allKeys,
              rows,
              meta: { fileIndex: i + 1, fileName }
            });
            continue; // exactly one table per file
          }
        }

        // Fallback: use extraction structured/text
        const ex = extractionsByIndex.get(i);
        if (ex) {
          if (Array.isArray(ex.structured) && ex.structured.length > 0) {
            const allKeys: string[] = Array.from(new Set<string>(ex.structured.flatMap((r: any) => Object.keys(r))));
            const rows: string[][] = ex.structured.slice(0, 50).map((r: Record<string, unknown>) => allKeys.map((k: string) => String((r as any)[k] ?? '')));
            filePreviews.push({
              title: `Structured Extracted Data${fileName ? ` — ${fileName}` : ` (File ${i + 1})`}`,
              headers: allKeys,
              rows,
              meta: { fileIndex: i + 1, fileName }
            });
            continue;
          }
          if (typeof ex.extractedText === 'string') {
            const text = (ex.extractedText as string).trim();
            if (text) {
              const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 120);
              const rows = lines.map((l: string) => [l.slice(0, 120)]);
              filePreviews.push({
                title: `Extracted Text Preview${fileName ? ` — ${fileName}` : ` (File ${i + 1})`}`,
                headers: ['Line'],
                rows,
                meta: { fileIndex: i + 1, fileName }
              });
              continue;
            }
          }
        }
      }

      // Optionally add a combined view across all structured per-file tables
      try {
        const structuredOnly = filePreviews.filter(t => t.headers && t.headers.length > 1 && Array.isArray(t.rows) && t.rows.length > 0);
        if (structuredOnly.length > 1) {
          const allHeaders = Array.from(new Set<string>(structuredOnly.flatMap(t => t.headers)));
          const rows = structuredOnly.flatMap(t => {
            const indexByHeader: Record<string, number> = {};
            t.headers.forEach((h, i) => { indexByHeader[h] = i; });
            return t.rows.map(r => allHeaders.map(h => {
              const idx = indexByHeader[h];
              return idx != null ? String(r[idx] ?? '') : '';
            }));
          });

          // Put combined overview first
          dataTables.push({
            title: 'Combined Extracted Data (all files)',
            headers: allHeaders,
            rows,
            summary: `Merged ${rows.length} row(s) from ${structuredOnly.length} file(s).`,
            meta: { combined: true }
          });
        }
      } catch {}

      if (filePreviews.length > 0) dataTables.push(...filePreviews);
    } catch {}
    const charts = wantCharts && hydratedSheetData ? buildChartSpecs(message, hydratedSheetData, selectedSheetNames) : [];

    const wantStats = (context as any)?.responsePrefs?.stats === true || /\b(stat|stats|statistics|summary|insight)\b/i.test(message);
    const insights: string[] = [];
    try {
      if (wantStats && charts.length > 0) {
        for (const ch of charts.slice(0, 2)) {
          if (ch.kind === 'line' && ch.labels.length >= 3 && ch.datasets[0]?.data?.length === ch.labels.length) {
            const y = ch.datasets[0].data;
            const n = y.length;
            const xs = Array.from({ length: n }, (_, i) => i + 1);
            const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
            const xBar = mean(xs);
            const yBar = mean(y);
            const num = xs.reduce((acc, xi, i) => acc + (xi - xBar) * (y[i] - yBar), 0);
            const den = xs.reduce((acc, xi) => acc + (xi - xBar) ** 2, 0) || 1;
            const slope = num / den;
            if (Math.abs(slope) > 0.01) insights.push(`${ch.datasets[0].label || 'Series'} is ${slope > 0 ? 'increasing' : 'decreasing'} over time`);
          }
          if (ch.kind === 'bar' && ch.labels.length > 0 && ch.datasets[0]?.data?.length === ch.labels.length) {
            const data = ch.datasets[0].data;
            let bestIdx = 0;
            for (let i = 1; i < data.length; i++) if (data[i] > data[bestIdx]) bestIdx = i;
            insights.push(`Top ${ch.meta?.groupByHeader || 'category'}: ${ch.labels[bestIdx]} (${data[bestIdx]})`);
          }
          if (ch.kind === 'pie' && ch.labels.length > 0 && ch.datasets[0]?.data?.length === ch.labels.length) {
            const data = ch.datasets[0].data;
            const total = data.reduce((a, b) => a + b, 0) || 1;
            let bestIdx = 0;
            for (let i = 1; i < data.length; i++) if (data[i] > data[bestIdx]) bestIdx = i;
            const pct = Math.round((data[bestIdx] / total) * 100);
            insights.push(`${ch.labels[bestIdx]} makes up ~${pct}%`);
          }
        }
      }
    } catch {}

    const quickReplies = await generateQuickReplies(message, conversationHistory, context, intent, hasFiles);

    // Normalize date formats across all tables before returning
    let normalizedTables = dataTables.map(t => ({
      ...t,
      rows: normalizeDateColumns(t.headers, t.rows)
    }));

    // If user wanted charts/graphs and did not explicitly ask for table/data view, suppress tables unless they came from file uploads
    try {
      const wantsExplicitDataView3 = /(\bshow\b|\bdisplay\b|\btable\b|\bcolumns?\b|\brows?\b|\blist\b|\boverview\b|\bsummary\b)/i.test(message);
      const suppressTablesForCharts3 = wantCharts && !wantsExplicitDataView3;
      if (!hasFiles && suppressTablesForCharts3) {
        normalizedTables = [];
        // Also clear any QA-generated response if charts exist to focus on charts
        if (charts && charts.length > 0) {
          response = '';
        }
      }
    } catch {}

    // Compose a grounded conversational reply if we still don't have a response
    if (!response || !response.trim()) {
      try {
        const toolSummaries = (enhancedResponse || '').split('\n').map(s => s.trim()).filter(Boolean);
        response = await composeGroundedReply({
          userMessage: message,
          qaAnswer: undefined,
          tables: normalizedTables,
          charts,
          insights,
          toolSummaries
        });
      } catch {
        // Fallback to tool summaries if composition fails
        if (enhancedResponse && enhancedResponse.trim()) {
          response = enhancedResponse.trim();
        }
      }
    }

    return {
      response: isFileOnly ? '' : (response || ''),
      toolCalls: [],
      pendingToolCalls: [],
      toolResults,
      context,
      sheetsUsed: selectedSheetNames,
      quickReplies,
      dataTables: normalizedTables,
      charts,
      insights,
      suppressResponseText: isFileOnly
    };
  } catch (error) {
    return {
      response: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      toolCalls: [],
      pendingToolCalls: [],
      toolResults: [],
      context
    };
  }
}


