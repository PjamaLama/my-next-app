import dayjs from 'dayjs';
import { Context, ConversationHistoryItem, ImageData, StructuredTable } from './types';
import { generateQuickReplies } from './quickReplies';
import { executeToolCall } from './toolExecution';
import { buildSmartTables } from './tables';
import { normalizeDateColumns } from './utils';
import { answerQuestionFromSheets } from './qa';
import { buildChartSpecs } from './charts';
import { composeGroundedReply } from './replyComposer';
import { generatePlan } from './planner';
import { DataSource, SheetDataSource, FileDataSource } from '../data/source';

// Helper: robustly extract headers from diverse tool response shapes
function extractHeadersFromTool(toolRes: any): string[] {
  try {
    if (!toolRes) return [];
    // Direct table.headers
    const table = (toolRes as any).table || (toolRes as any).details?.table;
    if (table && Array.isArray(table.headers)) {
      return (table.headers as any[]).map((h: any) => String(h ?? ''));
    }
    // table.rows[0]
    if (table && Array.isArray(table.rows) && Array.isArray(table.rows[0])) {
      return (table.rows[0] as any[]).map((h: any) => String(h ?? ''));
    }
    // data[0].values or data[0]
    const data = (toolRes as any).data || (toolRes as any).details?.data;
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      if (first && Array.isArray((first as any).values)) {
        return ((first as any).values as any[]).map((h: any) => String(h ?? ''));
      }
      if (Array.isArray(first)) {
        return (first as any[]).map((h: any) => String(h ?? ''));
      }
    }
    // Sometimes servers return JSON in result string
    const result = (toolRes as any).result;
    if (typeof result === 'string' && result.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(result);
        return extractHeadersFromTool(parsed);
      } catch {}
    }
  } catch {}
  return [];
}

export async function processMessage(
  message: string,
  context: Context,
  conversationHistory: ConversationHistoryItem[],
  images: ImageData[] = []
) {
  try {
    // Initialize and append current user message to in-context history (keep last 5)
    try {
      const ctxAny = context as any;
      const existing: ConversationHistoryItem[] = Array.isArray(ctxAny.conversationHistory) ? ctxAny.conversationHistory : [];
      const combined = [...existing, { role: 'user', content: String(message || ''), timestamp: Date.now() }];
      ctxAny.conversationHistory = combined.slice(-5);
    } catch {}
    const debugEnabled = Boolean((context as any)?.debug);
    const lowerMessage = (message || '').toLowerCase();
    const summaryIntentRegex = /(\btell\s+me\s+about\b|\bwhat\s+(?:is|are)\b|\bsummariz\w*\b|\boverview\s+of\b|\bdescribe\b|\bbased\s+on\s+the\s+data\b|\bwhat\s+i\s+did\b)/i;

    // Quick helper to extract a probable sheet/tab name from free text (e.g., "fuel weekly repo")
    const extractSheetNameFromMessage = (msg: string): string | undefined => {
      try {
        const m = String(msg || '');
        // 1) Quoted names: "... \"Fuel Weekly Repo\" ..."
        const q = m.match(/\"([^\"]{2,80})\"|\'([^\']{2,80})\'/);
        if (q) return (q[1] || q[2] || '').trim();
        // 2) Patterns like: overview of X, describe X, about X
        const ofPat = m.match(/(?:overview\s+of|summary\s+of|describe|about)\s+(?:my\s+)?([a-z0-9 _\-()]{3,80})/i);
        if (ofPat) return (ofPat[1] || '').trim();
        // 3) Patterns like: my X sheet/data/repo
        const myPat = m.match(/\bmy\s+([a-z0-9 _\-()]{3,80})\s+(?:sheet|tab|data|repo|report)\b/i);
        if (myPat) return (myPat[1] || '').trim();
        // 4) After the word 'of' at end: 'summarize ... of X'
        const tailPat = m.match(/\bof\s+([a-z0-9 _\-()]{3,80})$/i);
        if (tailPat) return (tailPat[1] || '').trim();
      } catch {}
      return undefined;
    };

    // New: extract a spreadsheetId from recent conversation history (URLs or explicit mentions)
    const extractIdFromHistory = (history: ConversationHistoryItem[] | undefined): string | undefined => {
      try {
        const items = Array.isArray(history) ? history.slice().reverse() : [];
        for (const it of items) {
          const text = String(it?.content || '');
          // Match Google Sheets URL pattern
          const m1 = text.match(/https?:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
          if (m1 && m1[1]) return m1[1];
          // Match explicit key-value like: spreadsheetId: ABC123
          const m2 = text.match(/\bspreadsheetId\s*[:=]\s*([a-zA-Z0-9-_]{10,})/i);
          if (m2 && m2[1]) return m2[1];
        }
      } catch {}
      return undefined;
    };

    // New: robustly extract a sheet name from message and history; includes specific known names
    const extractSheetName = (
      msg: string,
      history: ConversationHistoryItem[] | undefined
    ): string | undefined => {
      // Try quoted and heuristic parsing first
      let name = extractSheetNameFromMessage(msg);
      if (!name && Array.isArray(history)) {
        for (const it of history.slice().reverse()) {
          name = extractSheetNameFromMessage(String(it?.content || ''));
          if (name) break;
        }
      }
      // Known names fallback
      if (!name) {
        const combined = `${String(msg || '')}\n${(Array.isArray(history) ? history.map(h => String(h.content || '')).join('\n') : '')}`;
        const m = combined.match(/(fuel\s+weekly\s+repo|logbook)/i);
        if (m && m[1]) name = m[1];
      }
      return name?.trim() || undefined;
    };

    // New: validate and infer sheet context up front so hydration has a target
    const inferSheetContext = (
      msg: string,
      ctx: any,
      history: ConversationHistoryItem[] | undefined
    ) => {
      if (!ctx.spreadsheetId) {
        ctx.spreadsheetId = extractIdFromHistory(history) || 'default-id';
      }
      if (!ctx.sheetName && Array.isArray(ctx.sheetNames) && ctx.sheetNames.length > 0) {
        ctx.sheetName = ctx.sheetNames[0];
      }
      if (!ctx.sheetName) {
        ctx.sheetName = extractSheetName(msg, history) || 'Sheet1';
      }
      if (!Array.isArray(ctx.sheetNames) || ctx.sheetNames.length === 0) {
        if (ctx.sheetName) ctx.sheetNames = [ctx.sheetName];
      }
    };

    // Invoke inference before any hydration logic
    try {
      const ctxAny = context as any;
      inferSheetContext(message, ctxAny, conversationHistory);
      if (!ctxAny.spreadsheetId || !ctxAny.sheetName) {
        ctxAny.error = 'No valid sheet selected.';
      }
    } catch {}
    let intent = 'chat';
    const plannedOnlyToolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];

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

    if (context.fileAnalysis && context.fileAnalysis.files.length > 0) {
      const timeSinceAnalysis = Date.now() - (context.fileAnalysis.lastUpdated || 0);
      if (timeSinceAnalysis < 5 * 60 * 1000) {
        // follow-up actions disabled to avoid numeric triggers
      }
    }

    // Helper to hydrate sheet data early and prepare summary for planner (supports legacy and proactive signatures)
    const hydrateSheetData = async (...args: any[]): Promise<{ headers?: string[]; rowCount?: number; summary?: string } | void> => {
      try {
      const ctxAny = context as any;
        // Signature A: (dataSource, context)
        if (args.length >= 2 && typeof args[1] === 'object' && args[1] && !Array.isArray(args[1])) {
          const ds: DataSource = args[0] as any;
          // TTL caching (10 minutes) to reuse hydration across sessions
          const now = Date.now();
          const lastAt = typeof ctxAny._sheetHydratedAt === 'number' ? ctxAny._sheetHydratedAt : 0;
          const fresh = now - lastAt < 10 * 60 * 1000;
          const headers = fresh && Array.isArray(ctxAny.sheetHeaders) && ctxAny.sheetHeaders.length > 0
            ? (ctxAny.sheetHeaders as string[])
            : await ds.getHeaders();
          const rows = fresh && ctxAny.sheetData && Object.keys(ctxAny.sheetData).length > 0
            ? (ctxAny.sheetData[(ctxAny.sheetName || 'Sheet1')] || []).slice(1)
            : await ds.getSampleRows(100);
          const name = (ctxAny.sheetName && String(ctxAny.sheetName)) || 'Sheet1';
          const map: Record<string, string[][]> = {};
          map[name] = [headers || [], ...rows];
          ctxAny.sheetData = map;
          ctxAny.sheetHeaders = (headers || []).map((h: any) => String(h ?? ''));
          ctxAny._sheetHydratedAt = Date.now();
          ctxAny._earlySheetSummary = `Columns: ${(headers || []).join(', ')} · Rows: ${Math.max(0, rows.length)}`;
          return;
        }
        // Signature B: (dataSource, sheetName, sampleRows)
        const ds: DataSource = args[0] as any;
        const sheetName: string = String(args[1] || 'Sheet1');
        const sampleRows: number = Number(args[2] ?? 50);
        const now = Date.now();
        const lastAt = typeof ctxAny._sheetHydratedAt === 'number' ? ctxAny._sheetHydratedAt : 0;
        const fresh = now - lastAt < 10 * 60 * 1000;
        const headers = fresh && Array.isArray(ctxAny.sheetHeaders) && ctxAny.sheetHeaders.length > 0
          ? (ctxAny.sheetHeaders as string[])
          : await ds.getHeaders();
        const rows = fresh && ctxAny.sheetData && Object.keys(ctxAny.sheetData).length > 0
          ? (ctxAny.sheetData[sheetName] || []).slice(1)
          : await ds.getSampleRows(Math.max(100, sampleRows));
      const map: Record<string, string[][]> = {};
      map[sheetName] = [headers || [], ...rows];
      ctxAny.sheetData = map;
      ctxAny._sheetHydratedAt = Date.now();
      if (!Array.isArray(ctxAny.sheetHeaders) || ctxAny.sheetHeaders.length === 0) {
        ctxAny.sheetHeaders = (headers || []).map((h: any) => String(h ?? ''));
      }
      const rowCount = Math.max(0, rows.length);
      const summary = `Columns: ${(headers || []).join(', ')} · Rows: ${rowCount}`;
      ctxAny._earlySheetSummary = summary;
      return { headers, rowCount, summary };
      } catch (e: any) {
        try {
          const ctxAny = context as any;
          ctxAny.error = 'Sheet access failed: ' + (e?.message || String(e));
          ctxAny.sheetData = {};
        } catch {}
      }
    };

    const toTitleCase = (s: string) => s.replace(/[A-Za-zÀ-ÿ][^\s-]*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

    // Infer missing sheet info from history/message, then attempt early hydration when possible
    try {
      const ctxAny = context as any;
      if (!ctxAny.sheetName || !String(ctxAny.sheetName).trim()) {
        // scan history for phrases like "sheet X"
        try {
          const items: ConversationHistoryItem[] = Array.isArray(ctxAny.conversationHistory) ? ctxAny.conversationHistory : [];
          for (const it of items.slice().reverse()) {
            const m = String(it.content || '').match(/\bsheet\s+([A-Za-z0-9 _\-()]{2,80})\b/i);
            if (m && m[1]) { ctxAny.sheetName = m[1].trim(); break; }
          }
        } catch {}
        if (!ctxAny.sheetName) {
          const guess = extractSheetNameFromMessage(message);
          if (guess) ctxAny.sheetName = guess;
        }
        if (ctxAny.sheetName && (!Array.isArray(ctxAny.sheetNames) || ctxAny.sheetNames.length === 0)) {
          ctxAny.sheetNames = [ctxAny.sheetName];
        }
      }

      if (!hasFiles && context?.spreadsheetId) {
        // Infer a likely sheet name from history or message if missing
        try {
          const ctxAny2 = context as any;
          if (!ctxAny2.sheetName || !String(ctxAny2.sheetName).trim()) {
            const guess = extractSheetNameFromMessage(message);
            if (guess) ctxAny2.sheetName = toTitleCase(guess);
          }
        } catch {}
        const sheetName = (context as any).sheetName || ((context as any).sheetNames?.[0]) || '';
        if (sheetName) {
          const scopedBase = (typeof window === 'undefined' && context && (ctxAny)._baseUrl)
            ? String((ctxAny)._baseUrl)
            : undefined;
          const sessionKey = String((ctxAny.userId || ctxAny.sessionId || '') || '');
          const earlyDS = new SheetDataSource(context.spreadsheetId, sheetName, scopedBase, sessionKey || undefined);
          const alreadyHydrated = ctxAny.sheetData && Object.keys(ctxAny.sheetData).length > 0;
          const lastAt = typeof ctxAny._sheetHydratedAt === 'number' ? ctxAny._sheetHydratedAt : 0;
          const isStale5m = Date.now() - lastAt > 5 * 60 * 1000;
          if (!alreadyHydrated || isStale5m) {
            try {
              await hydrateSheetData(earlyDS, context as any);
            } catch (e: any) {
              try { ctxAny.error = 'Failed to access sheet: ' + (e?.message || String(e)); } catch {}
            }
          }
        }
      }
    } catch {}

    // Heuristics removed: planning will be handled by generatePlan below

    // Build an abstracted data source (sheet vs file)
    let dataSource: DataSource | null = null;
    try {
      const ctxAny = context as any;
      const scopedBase = (typeof window === 'undefined' && context && (ctxAny)._baseUrl)
        ? String((ctxAny)._baseUrl)
        : undefined;
      if (!hasFiles && context?.spreadsheetId) {
        // Prefer current sheetName or first sheetNames
        const sheetName = (ctxAny.sheetName && String(ctxAny.sheetName))
          || (Array.isArray(ctxAny.sheetNames) && ctxAny.sheetNames[0])
          || (Array.isArray(ctxAny.allSheetNames) && ctxAny.allSheetNames[0])
          || '';
        if (sheetName) {
          const sessionKey = String((ctxAny.userId || ctxAny.sessionId || '') || '');
          dataSource = new SheetDataSource(context.spreadsheetId, sheetName, scopedBase, sessionKey || undefined);
        }
      } else if (hasFiles) {
        // Build FileDataSource using any structured extractions present in tool results later
        dataSource = new FileDataSource(images as any, []);
      }
    } catch {}

    // Before planning: ensure header row is attached for planner if missing (via data source when available)
    try {
      const ctxAny = context as any;
      const hasHeaders = Array.isArray(ctxAny.sheetHeaders) && ctxAny.sheetHeaders.length > 0;
      const sheetName = typeof ctxAny.sheetName === 'string' && ctxAny.sheetName.trim() ? ctxAny.sheetName : '';
      if (!hasHeaders) {
        if (dataSource) {
          try {
            const headers = await dataSource.getHeaders();
            if (Array.isArray(headers) && headers.length > 0) {
              ctxAny.sheetHeaders = headers.map((h: any) => String(h ?? ''));
            }
          } catch {}
        } else if (context?.spreadsheetId && sheetName) {
          const toolCall = {
            id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: {
              name: 'sheet_query',
              arguments: JSON.stringify({ spreadsheetId: context.spreadsheetId, sheetName, range: 'A1:Z1' })
            }
          };
          const headerRes = await executeToolCall(toolCall as any, context, images);
          if (headerRes && headerRes.success) {
            const headers = extractHeadersFromTool(headerRes);
            if (Array.isArray(headers) && headers.length > 0) {
              ctxAny.sheetHeaders = headers.map((h: any) => String(h ?? ''));
            }
          }
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[processMessage] Header prefetch error (continuing without headers)', e);
    }

    // Proactive auto-hydration: ensure headers and sample rows are available before planning
    try {
      const now = Date.now();
      const ctxAny = context as any;
      const hasHydrated = ctxAny.sheetData && Object.keys(ctxAny.sheetData).length > 0;
      const lastHydration = typeof ctxAny._sheetHydratedAt === 'number' ? ctxAny._sheetHydratedAt : 0;
      const isStale = now - lastHydration > 60_000;
      const canHydrate = Boolean(dataSource);
      const shouldHydrate = Boolean(context?.spreadsheetId) && (!hasHydrated || isStale);
      if (canHydrate && shouldHydrate && dataSource) {
        try {
          const headers = await dataSource.getHeaders();
          const rows = await dataSource.getSampleRows(800); // at least 50 samples upfront

          // Treat empty headers and rows as a failed hydration as well
          const noHeaders = !Array.isArray(headers) || headers.length === 0;
          const noRows = !Array.isArray(rows) || rows.length === 0;
          if (noHeaders && noRows) {
            throw new Error('No data returned from sheet');
          }

          const map: Record<string, string[][]> = {};
          const sheetName = (context as any).sheetName || ((context as any).sheetNames?.[0]) || 'Sheet1';
          map[sheetName] = [headers, ...rows];
          if (Object.keys(map).length > 0) {
            ctxAny.sheetData = map;
            ctxAny._sheetHydratedAt = now;
            // Backfill sheetHeaders if not set
            if (!Array.isArray(ctxAny.sheetHeaders) || ctxAny.sheetHeaders.length === 0) {
              ctxAny.sheetHeaders = (headers || []).map((h: any) => String(h ?? ''));
            }
            // Build a lightweight column catalog for planner/QA
            try {
              const first = Object.keys(map)[0];
              const table = map[first] || [];
              const hdrs = Array.isArray(table) && table.length > 0 ? table[0] : [];
              const lower = hdrs.map((h: string) => String(h || '').toLowerCase());
              const types = hdrs.map((_, i) => {
                const col = (table.slice(1) as string[][]).map(r => r?.[i]);
                const num = col.map(parseFloat).filter(n => Number.isFinite(n)).length;
                return num / Math.max(1, col.length) > 0.5 ? 'number' : 'text';
              });
              ctxAny.columnCatalog = { sheet: first, headers: hdrs, lower, types };
            } catch {}
          }
        } catch (e) {
          // Hydration failed: ensure sheetData is empty, use data source standardized error mapping, log, and enqueue a summary fallback
          try {
            if (!ctxAny.sheetData || typeof ctxAny.sheetData !== 'object') ctxAny.sheetData = {};
            else ctxAny.sheetData = {};
          } catch {}
          // eslint-disable-next-line no-console
          console.error('[processMessage] Hydration failed', e);
          try {
            const mapped = typeof (dataSource as any).onError === 'function' ? (dataSource as any).onError(e) : null;
            if (mapped && mapped.error) {
              ctxAny.error = mapped.error;
              if (mapped.fallbackData != null) ctxAny.sheetData = mapped.fallbackData;
            } else {
              const msg = e instanceof Error ? e.message : String(e);
              ctxAny.error = `Sheet access failed: ${msg}`;
            }
            ctxAny.hydrationNote = 'Failed to load data; attempting summary from available context';
          } catch {}

          // Proactively attempt a context-based summary so the user still gets value
          try {
            let historySummary = '';
            try {
              const items: ConversationHistoryItem[] = Array.isArray((context as any).conversationHistory) ? ((context as any).conversationHistory as ConversationHistoryItem[]) : [];
              const joined = items.map(i => `${i.role}: ${i.content}`).join('\n');
              historySummary = joined.length > 4000 ? joined.slice(-4000) : joined;
            } catch {}
            const fallbackPrompt = `No data loaded; describe what data might be available based on context or history.\n\n(Recent context:)\n${historySummary}\n\nSheet: ${String((context as any)?.spreadsheetId || '')}`;
            const qa = await answerQuestionFromSheets(fallbackPrompt, (context as any).sheetData || {}, Array.isArray((context as any).sheetNames) ? (context as any).sheetNames as string[] : []);
            if (qa && qa.answer) {
              try { (context as any)._proactiveSummary = String(qa.answer); } catch {}
            }
          } catch {}

          // Planning fallback removed; handled by consolidated planner
        }
      }
    } catch {}

    // Helper: summarize recent conversation (simple truncation by characters approximating tokens)
    const summarizeHistory = (): string => {
      try {
        const items: ConversationHistoryItem[] = Array.isArray((context as any).conversationHistory) ? ((context as any).conversationHistory as ConversationHistoryItem[]) : [];
        // Extract potential sheet info (e.g., "sheetName: X") to fill context gaps
        try {
          for (const it of items.slice(-3)) {
            const m = String(it.content || '').match(/\bsheetName\s*:\s*([A-Za-z0-9 _\-()]+)\b/);
            if (m && m[1]) {
              const name = m[1].trim();
              const ctxAny = context as any;
              if (!ctxAny.sheetName) ctxAny.sheetName = name;
              if (!Array.isArray(ctxAny.sheetNames) || ctxAny.sheetNames.length === 0) ctxAny.sheetNames = [name];
            }
          }
        } catch {}
        const joined = items.map(i => `${i.role}: ${i.content}`).join('\n');
        // rough cap ~1000 tokens ≈ 4000 chars
        return joined.length > 4000 ? joined.slice(-4000) : joined;
      } catch { return ''; }
    };

    // Infer probable topic from recent history/message to make fallbacks more helpful
    const inferFromHistory = (): string => {
      try {
        const recent = String(message || '') + '\n' + summarizeHistory();
        const lower = recent.toLowerCase();
        if (/fuel\s+weekly\s+repo|fuel\s+weekly/.test(lower)) return 'fuel weekly repo (likely fuel costs or mileage)';
        if (/fuel|diesel|gas|mpg|mileage/.test(lower)) return 'fuel (sales, costs, or mileage)';
        if (/sale|sales|revenue/.test(lower)) return 'sales or revenue';
        if (/expense|spend|cost/.test(lower)) return 'expenses or costs';
        if (/inventory|stock|sku/.test(lower)) return 'inventory or stock levels';
        if (/invoice|receipt|bill/.test(lower)) return 'invoices or receipts';
        return '';
      } catch { return ''; }
    };

    // Plan → Execute: use consolidated Genkit planner
    let plannedToolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];
    let currentPlan: any = null;
    try {
      const plan: any = await generatePlan(message, context as any, (context as any).conversationHistory || conversationHistory || [], hasFiles);
      currentPlan = plan;
      // eslint-disable-next-line no-console
      console.log('[Planner] plan', plan);

      // Use the plan as-is (auto-pick is handled inside the planner now)
      if (plan?.intent && typeof plan.intent === 'string') intent = plan.intent;

      // If clarification is still needed (e.g., no confident target), return clarification flow
      if (plan && plan.clarifyQuestion && !(String(plan?.intent || '').toLowerCase() === 'aggregate' && plan?.targetColumn)) {
        const clarifyOut = {
          response: String(plan.clarifyQuestion),
          requiresClarification: true,
          plan: debugEnabled ? plan : undefined,
          toolCalls: [],
          pendingToolCalls: [],
          toolResults: [],
          context,
          quickReplies: await generateQuickReplies(message, conversationHistory, context, intent, hasFiles),
          dataTables: [],
          charts: [],
          insights: [],
          suppressResponseText: false
        };
        if (debugEnabled) (clarifyOut as any).debugSources = [];
        return clarifyOut;
      }
      const toolsFromPlan = Array.isArray(plan?.tools) ? plan.tools : [];
      plannedToolCalls = toolsFromPlan.map((t: any) => ({
        id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'function',
        function: { name: String(t?.name || ''), arguments: JSON.stringify(t?.args || {}) },
      }));

      // If planner provided a dependency-aware toolChain, execute it here with parallelization
      let _chainCollected: any[] = [];
      const chain: any[] = Array.isArray((plan as any).toolChain) ? (plan as any).toolChain : [];
      if (chain.length > 0) {
        const chainResults: any[] = [];
        const completed = new Set<number>();
        const maxIterations = 50;
        let iter = 0;
        const collectedResults: any[] = [];
        while (completed.size < chain.length && iter++ < maxIterations) {
          const runnable: number[] = [];
          for (let i = 0; i < chain.length; i++) {
            if (completed.has(i)) continue;
            const deps: number[] = Array.isArray(chain[i].dependsOn) ? chain[i].dependsOn : [];
            const depsDone = deps.every((d) => completed.has(d));
            if (depsDone) runnable.push(i);
          }
          if (runnable.length === 0) break; // deadlock or cyclic deps
          const tasks = runnable.map(async (idx) => {
            const step = chain[idx];
            // Lazy loading: if step.params needs only a particular column/range, prefer get-sheet-data partials
            if (step.toolName === 'get_sheet_data') {
              try {
                const tCol = String(plan?.targetColumn || '').trim();
                if (tCol) {
                  const ctxAny = context as any;
                  const hdrs: string[] = Array.isArray(ctxAny.sheetHeaders) ? ctxAny.sheetHeaders : [];
                  const colIdx = hdrs.indexOf(tCol);
                  if (colIdx >= 0) {
                    // Convert index to A1 column letter (1-based)
                    const toCol = (n: number) => { let s=''; n++; while(n>0){n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26);} return s; };
                    const colLetter = toCol(colIdx);
                    step.params = { ...(step.params || {}), range: `${colLetter}:${colLetter}` };
                  }
                }
              } catch {}
            }
            const call = {
              id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'function',
              function: { name: String(step.toolName || ''), arguments: JSON.stringify(step.params || {}) }
            } as any;
            let res = await executeToolCall(call, context, images);
            if (!res?.success && step.fallback && step.fallback.toolName) {
              const fb = {
                id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'function',
                function: { name: String(step.fallback.toolName), arguments: JSON.stringify(step.fallback.params || {}) }
              } as any;
              res = await executeToolCall(fb, context, images);
            }
            chainResults[idx] = res;
            completed.add(idx);
            return res;
          });
          const batchResults = await Promise.all(tasks);
          collectedResults.push(...batchResults);
        }
        _chainCollected = collectedResults;
      }
      // If update intent and we have sheet data, proactively add helper tools to compute merge/resolve mapping
      try {
        if (intent === 'update_data') {
          const ctxAny = context as any;
          const hasData = ctxAny.sheetData && Object.keys(ctxAny.sheetData).length > 0;
          if (hasData) {
            // Resolve commonly referenced columns (best-effort)
            const headers: string[] = Array.isArray(ctxAny.sheetHeaders)
              ? (ctxAny.sheetHeaders as string[]).map((x: any) => String(x ?? ''))
              : [];
            const likely = headers.find((h: string) => /date|amount|total|fuel|vendor|category/i.test(h));
            if (likely) {
              plannedToolCalls.unshift({
                id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'function',
                function: { name: 'resolve_column', arguments: JSON.stringify({ columnName: likely }) }
              });
            }
          }
        }
      } catch {}
    } catch {
      plannedToolCalls = [];
    }

    const toolResults: any[] = [];
    // Note: _chainCollected is defined above; wrap reference in try/catch to avoid TS hoist issues
    try {
      // @ts-ignore
      const chainCollectedLocal: any[] = _chainCollected;
      if (Array.isArray(chainCollectedLocal) && chainCollectedLocal.length > 0) toolResults.push(...chainCollectedLocal);
    } catch {}
    let enhancedResponse = '';
    let describeText: string | null = null;
    let didUpdateSheet = false;
    const dataTables: StructuredTable[] = [];
    const postQuickActions: string[] = [];
    const toolCallsToRun = plannedToolCalls;
    for (const toolCall of toolCallsToRun) {
      const result = await executeToolCall(toolCall, context, images);
      try {
        if (result && (result as any).error) {
          const ctxAny = context as any;
          if (!Array.isArray(ctxAny.errors)) ctxAny.errors = [];
          ctxAny.errors.push(String((result as any).error));
        }
      } catch {}
      toolResults.push(result);
      // eslint-disable-next-line no-console
      try { console.log('[Planner] tool result', { name: toolCall.function.name, success: result?.success }); } catch {}
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
          didUpdateSheet = true;
          // If update_sheet returned a preview of what was written, render it as a data table
          try {
            const flowPreview = (result as any).flowPreview;
            // Support single or multi-sheet responses
            const sheets = flowPreview && typeof flowPreview === 'object' && !Array.isArray(flowPreview)
              ? Object.keys(flowPreview)
              : [];
            const previews = sheets.length > 0 ? sheets.flatMap((name: string) => (flowPreview as any)[name]) : ((result as any).preview || (result as any).details?.preview || []);
            if (Array.isArray(previews) && previews.length > 0) {
              const headers = ['Row', 'Field', 'Value'];
              const rows: string[][] = [];
              for (const p of previews.slice(0, 30)) {
                const rowIndex = p.row ?? p.targetRow ?? '';
                const updates = p.updates || {};
                for (const [k, v] of Object.entries(updates)) {
                  rows.push([String(rowIndex), String(k), String(v ?? '')]);
                }
              }
              if (rows.length > 0) {
                dataTables.push({ title: 'Applied updates (preview)', headers, rows, summary: `Showing ${rows.length} cell update(s)` });
                // Add conversational confirmation prompts
                postQuickActions.push('Confirm update');
                postQuickActions.push('Adjust mapping');
              }
            }
            // Suggested mapping preview support
            const suggested = (result as any).details?.previewSuggestedMapping;
            if (Array.isArray(suggested) && suggested.length > 0) {
              const headers = ['File Column', 'Suggested Sheet Column', 'Confidence'];
              const rows = suggested.slice(0, 30).map((m: any) => [String(m.file || ''), String(m.sheet || ''), String(m.score != null ? Math.round(Number(m.score) * 100) + '%' : '')]);
              dataTables.push({ title: 'Suggested column mapping', headers, rows });
              postQuickActions.push('Confirm update');
              postQuickActions.push('Adjust mapping');
            }
          } catch {}
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
          // Persist extracted structured rows for subsequent update tools
          try {
            const extractedRows = (result as any)?.details?.extracted_rows || (result as any)?.result?.extracted_rows || (result as any)?.extracted_rows;
            if (Array.isArray(extractedRows) && extractedRows.length > 0) {
              if (!context.fileAnalysis) context.fileAnalysis = { files: [], lastUpdated: Date.now() };
              context.fileAnalysis.files.push({ mimeType: 'application/octet-stream', extractedData: { extracted_rows: extractedRows }, timestamp: Date.now() });
              context.fileAnalysis.lastUpdated = Date.now();
            }
          } catch {}
        } else if (executedToolName === 'describe_sheet') {
          // Prefer the description as main response for describe_data intent
          if (typeof result.result === 'string' && result.result.trim()) {
            enhancedResponse += `\n${result.result.trim()}`;
            if (intent === 'describe_data') {
              describeText = result.result.trim();
            }
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

    // Determine if user is asking for charts/graphs early (used by table suppression later)
    const wantCharts = (context as any)?.responsePrefs?.charts === true || /\b(chart|graph|trend|distribution|plot|bar\s+chart|line\s+chart|pie\s+chart)\b/i.test(message);

    // (moved) auto-hydration now occurs earlier before planning

    // QA over sheets (always attempt after hydration; for vague queries, produce a high-level overview)
    try {
      const hydratedForQA = (context as any).sheetData as Record<string, string[][]> | undefined;
      const selectedForQA = Array.isArray((context as any).sheetNames) ? ((context as any).sheetNames as string[]) : [];
      const wantsExplicitDataView = /(\bshow\b|\bdisplay\b|\btable\b|\bcolumns?\b|\brows?\b|\blist\b|\boverview\b|\bsummary\b)/i.test(message);
      const suppressTablesForCharts = wantCharts && !wantsExplicitDataView;
      if (hydratedForQA && Object.keys(hydratedForQA).length > 0 && !hasFiles && !suppressTablesForCharts) {
        const historySummary = summarizeHistory();
        const qa = await answerQuestionFromSheets(`${message}\n\n(Recent context:)\n${historySummary}\n\nIf query is vague, provide a high-level overview of the data.`, hydratedForQA, selectedForQA);
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

    let quickReplies: string[] = await generateQuickReplies(message, conversationHistory, context, intent, hasFiles);
    try {
      const hdrs = Array.isArray((context as any).sheetHeaders) ? ((context as any).sheetHeaders as string[]) : [];
      const add: string[] = [];
      if (hdrs.length > 0) {
        add.push('Show headers');
        const salesLike = hdrs.find(h => /sales|amount|total|revenue|price|cost/i.test(String(h)));
        if (salesLike) add.push('Compute total sales');
      }
      if (add.length > 0) quickReplies = [...new Set([...(quickReplies || []), ...add])].slice(0, 5);
    } catch {}

    // Fallback composition: if we have no hydrated data or an error, provide a proactive, contextual response
    try {
      const ctxAny = context as any;
      const dataObj = ctxAny?.sheetData as Record<string, unknown> | undefined;
      const isEmptyData = !dataObj || Object.keys(dataObj).length === 0;
      const hasCtxError = Boolean(ctxAny?.error);
      const wantsRawToolOutput = String(intent || '').toLowerCase() === 'execute_tool';
      if ((isEmptyData || hasCtxError) && !wantsRawToolOutput) {
        const historySummary = summarizeHistory();
        const nameGuess = (ctxAny.sheetName && String(ctxAny.sheetName)) || extractSheetNameFromMessage(message) || extractSheetNameFromMessage(historySummary) || '';
        const topicGuess = inferFromHistory();

        // Build proactive text
        const base = hasCtxError
          ? `I couldn’t load your sheet data (error: ${String(ctxAny.error)}).`
          : `I haven't loaded your sheet data yet.`;
        const hint = nameGuess
          ? ` Based on your mention of "${nameGuess}"${topicGuess ? `, it might track ${topicGuess}.` : '.'}`
          : (topicGuess ? ` It might track ${topicGuess}.` : '');

        // If user intent is to update but we lack data, prefer a clear update-specific message
        if (intent === 'update_data' && isEmptyData) {
          response = 'To update, I need current sheet access. Describe the changes you want or upload files.';
        } else {
          response = `${base}${hint} Try specifying columns or uploading data. Please provide more details or confirm the sheet name.`.trim();
        }
        enhancedResponse = '';

        // Optionally try to generate a brief guess from history if not already present
        try {
          if (!ctxAny._proactiveSummary) {
            const qa = await answerQuestionFromSheets(
              `From this history, guess a concise 1-2 sentence summary of what the data likely tracks (do not assume access to the sheet):\n\n${historySummary}`,
              (ctxAny.sheetData || {}) as any,
              Array.isArray(ctxAny.sheetNames) ? (ctxAny.sheetNames as string[]) : []
            );
            if (qa && qa.answer) ctxAny._proactiveSummary = String(qa.answer);
          }
        } catch {}

        const proactive = ctxAny?._proactiveSummary;
        if (typeof proactive === 'string' && proactive.trim()) {
          response = `${response}\n\n${proactive.trim()}`.trim();
        }

        // Add helpful quick actions
        const actions: string[] = [];
        actions.push('Try accessing sheet again');
        if (nameGuess) actions.push(`Specify sheet name: ${nameGuess}?`);
        else actions.push('Specify sheet name');
        if (intent === 'update_data') actions.push('Upload files to update');
        // Conversational actions for UI wiring
        try { (ctxAny._uiActions = ctxAny._uiActions || []).push({ text: 'Try accessing sheet again', action: 'retry_hydration' }, { text: 'Specify sheet name', action: 'clarify_sheet' }); } catch {}
        quickReplies = Array.isArray(quickReplies) ? [...quickReplies, ...actions] : actions;
      }
    } catch {}

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

    // If intent was a broad description request, prefer tool description if present; else provide concise overview from hydrated data
    try {
      if (!hasFiles && intent === 'describe_data') {
        if (describeText && (!response || !response.trim())) {
          response = describeText;
        }
        const hydrated = (context as any).sheetData as Record<string, string[][]> | undefined;
        if (hydrated && Object.keys(hydrated).length > 0) {
          const sheetOrder = Array.isArray((context as any).sheetNames) && (context as any).sheetNames.length > 0
            ? ((context as any).sheetNames as string[])
            : Object.keys(hydrated);
          const first = sheetOrder.find(n => hydrated[n]) || Object.keys(hydrated)[0];
          const table = hydrated[first] || [];
          if (Array.isArray(table) && table.length > 0) {
            const headers = table[0] || [];
            const rows = table.slice(1);
            const sample = rows.slice(0, 3).map(r => (r || []).slice(0, headers.length).join(' | '));
            const total = Math.max(0, rows.length);
            const summaryParts: string[] = [];
            if (headers.length > 0) summaryParts.push(`columns: ${headers.join(', ')}`);
            if (sample.length > 0) summaryParts.push(`sample rows: ${sample.join(' || ')}`);
            summaryParts.push(`total rows: ${total}`);
            const text = `Your sheet (${first}) has ${summaryParts.join('. ')}.`;
            if (!response || !response.trim()) {
              response = text;
            } else {
              response = `${response}\n${text}`.trim();
            }
          }
        }
      }
    } catch {}

    // If we successfully updated sheets, prefer a deterministic confirmation over a generative reply
    if (didUpdateSheet) {
      try {
        const sheets = Array.isArray((context as any).sheetNames) ? ((context as any).sheetNames as string[]) : [];
        const suffix = sheets.length > 0 ? ` in ${sheets.join(', ')}` : '';
        const summary = (enhancedResponse || '').trim();
        response = summary || `Applied updates${suffix}.`;
      } catch {
        response = (enhancedResponse || '').trim() || 'Applied updates.';
      }
    }

    // Compose a grounded conversational reply if we still don't have a response
    if (!response || !response.trim()) {
      try {
        const toolSummaries = (enhancedResponse || '').split('\n').map(s => s.trim()).filter(Boolean);
        response = await composeGroundedReply({
          userMessage: message,
          qaAnswer: response && response.trim() ? response : undefined,
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

    // If still no data-driven response, guide the user
    if ((!response || !response.trim()) && (!context || !(context as any).sheetData || Object.keys((context as any).sheetData || {}).length === 0)) {
      response = 'No sheet data loaded yet. Please provide spreadsheet details or upload files.';
    }

    const out: any = {
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
    if ((context as any)._hydrationWarning) {
      out.response = `${out.response ? out.response + '\n' : ''}${(context as any)._hydrationWarning}`.trim();
    }
    // Append assistant reply into conversation history (keep last 5)
    try {
      const ctxAny = context as any;
      const existing: ConversationHistoryItem[] = Array.isArray(ctxAny.conversationHistory) ? ctxAny.conversationHistory : [];
      const combined = [...existing, { role: 'assistant', content: String(out.response || ''), timestamp: Date.now() }];
      ctxAny.conversationHistory = combined.slice(-5);
    } catch {}
    if (debugEnabled) {
      out.plan = currentPlan;
      out.debugSources = (toolResults || []).map((r: any) => r?.result).slice(0, 5);
    }
    return out;
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


