import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';

type PlannerCtx = { headers: string[]; sheetSummary?: string; historySummary?: string; error?: string };
export type PlannerPlan = {
  intent: 'get_data' | 'aggregate' | 'update' | 'describe_data' | 'other';
  queryType: 'aggregate' | 'filter' | 'join' | 'text' | 'other';
  reasoning: string | null;
  targetColumn: string | null;
  targetColumnScore?: number | null;
  targetColumnReason?: string | null;
  bestGuess?: string | null;
  // For filter queries
  condition?: { column: string | null; op: '>=' | '<=' | '>' | '<' | '==' | '!=' | 'contains' | 'not_contains' | null; value: string | null } | null;
  // For join queries
  join?: { leftSheet?: string | null; rightSheet?: string | null; key?: string | null } | null;
  clarifyQuestion: string | null;
  tools: Array<{ name: string; args: Record<string, unknown> }>;
  toolChain?: Array<{
    toolName: string;
    params: Record<string, unknown>;
    dependsOn?: number[];
    fallback?: { toolName: string; params: Record<string, unknown> } | null;
  }>;
};

export const plannerPrompt = (message: string, ctx: PlannerCtx): string => {
  const headers = Array.isArray(ctx?.headers) ? ctx.headers : [];
  const headersList = headers.map(h => JSON.stringify(String(h))).join(', ');
  const sheetSummary = typeof ctx?.sheetSummary === 'string' && ctx.sheetSummary.trim() ? ctx.sheetSummary.trim() : '';
  const previousContext = typeof ctx?.historySummary === 'string' && ctx.historySummary.trim() ? ctx.historySummary.trim() : '';
  // Diverse few-shot examples covering aggregate, filter, text, join, summary/description, and update chains
  const fewShot = `
Example A (aggregate, clear numeric header):
User: "sum up total sales by region"
Headers: ["Date","Region","Total Sales","Rep"]
Reasoning: QueryType aggregate. Best column is "Total Sales" due to keyword 'sales'.
Output: {"intent":"get_data","queryType":"aggregate","reasoning":"Aggregate sum of Total Sales grouped by Region.","targetColumn":"Total Sales","targetColumnScore":0.92,"targetColumnReason":"Header includes keyword 'sales' indicating monetary amount","clarifyQuestion":null,"tools":[{"name":"aggregate","args":{"metric":"sum","column":"Total Sales","groupBy":["Region"]}}]}

Example B (filter over numeric):
User: "show rows where sales > 1000"
Headers: ["Date","Region","Sales","Client"]
Reasoning: QueryType filter. Condition column is "Sales" with op ">" and value "1000".
Output: {"intent":"get_data","queryType":"filter","reasoning":"Filter rows by Sales > 1000.","targetColumn":null,"clarifyQuestion":null,"condition":{"column":"Sales","op":">","value":"1000"},"tools":[{"name":"sheet_query","args":{"range":"A1:Z","note":"fetch then filter client-side if necessary"}}]}

Example C (text/categorical stat):
User: "most common client"
Headers: ["Client","Region","Issue"]
Reasoning: QueryType text. We need frequency stats on a text column; best column "Client".
Output: {"intent":"get_data","queryType":"text","reasoning":"Compute mode of Client column.","targetColumn":"Client","clarifyQuestion":null,"tools":[{"name":"get_column_stats","args":{"column":"Client"}}]}

Example D (join requires more info):
User: "combine sheet A with sheet B on customer id"
Headers: ["Customer ID","Name","Amount"]
Reasoning: QueryType join. Lacks both sheet names in context; ask clarification.
Output: {"intent":"get_data","queryType":"join","reasoning":"Join sheets on Customer ID.","targetColumn":null,"join":{"leftSheet":null,"rightSheet":null,"key":"Customer ID"},"clarifyQuestion":"Which two sheets should I join? Provide names and confirm join key Customer ID.","tools":[]}

Example E (ambiguous aggregate):
User: "what's the revenue by product?"
Headers: ["Product","Count","Note"]
Reasoning: QueryType aggregate, but no clear amount-like header.
Output: {"intent":"get_data","queryType":"aggregate","reasoning":"Need numeric amount column for revenue by product.","targetColumn":null,"targetColumnScore":null,"targetColumnReason":null,"clarifyQuestion":"Which column contains the amounts? Options: [Product, Count, Note]","tools":[]}

Example F (chain: fetch, aggregate, trend analysis):
User: "forecast sales trend for this quarter"
Headers: ["Date","Region","Sales"]
Reasoning: QueryType aggregate → trend. Need data → aggregate Sales by Date → trend_analysis.
Output: {"intent":"get_data","queryType":"aggregate","reasoning":"Fetch data, aggregate Sales by Date, then trend analysis to estimate slope.","targetColumn":"Sales","toolChain":[
  {"toolName":"get_sheet_data","params":{"sheetName":"${headers[0] ? 'Sheet1' : ''}"}},
  {"toolName":"aggregate","params":{"spec":{"groupBy":["Date"],"metrics":[{"op":"sum","col":"Sales"}]}},"dependsOn":[0]},
  {"toolName":"trend_analysis","params":{"from":"aggregate"},"dependsOn":[1],"fallback":{"toolName":"get_sheet_stats","params":{}}}
]}

Example G (summary/description; proactive describe):
User: "tell me about my sheet"
Headers: ["Date","Category","Amount"]
Reasoning: Summary-like request; data appears available.
Output: {"intent":"describe_data","queryType":"text","reasoning":"Describe sheet using available headers and sample rows.","targetColumn":null,"clarifyQuestion":null,"tools":[{"name":"describe_sheet","args":{}}]}

Example H (summary with sheet hint):
User: "summarize fuel weekly"
Headers: ["Week","Fuel","Miles","Cost"]
Reasoning: Summary-like request with implicit sheet name.
Output: {"intent":"describe_data","queryType":"text","reasoning":"Provide high-level overview.","targetColumn":null,"clarifyQuestion":null,"tools":[{"name":"describe_sheet","args":{"sheetName":"Fuel Weekly"}}]}

Example I (update with files; proactive toolChain):
User: "update with these receipts" (files attached)
Headers: ["Date","Vendor","Amount","Category"]
Reasoning: Update intent with incoming structured data.
Output: {"intent":"update","queryType":"text","reasoning":"Load current sheet structure, extract structured rows from files, then preview update.","targetColumn":null,"clarifyQuestion":null,
  "toolChain":[
    {"toolName":"get_sheet_data","params":{}},
    {"toolName":"extract_data_from_files","params":{}},
    {"toolName":"update_sheet","params":{"transcript":"update with these receipts","preview":true},"dependsOn":[0,1]}
  ]}

Example J (update without files; map to headers):
User: "add new fuel data"
Headers: ["Date","Fuel","Amount"]
Reasoning: Update: row append compatible with headers.
Output: {"intent":"update","queryType":"text","reasoning":"Append new rows matching [Date,Fuel,Amount].","targetColumn":null,"clarifyQuestion":null,"tools":[{"name":"update_sheet","args":{"transcript":"add new fuel data","preview":true}}]}
`;

  return `You are a STRICT planner for a spreadsheet assistant. Think step-by-step quietly, then output ONLY JSON.

User message: ${JSON.stringify(message)}
Headers (the ONLY valid columns): [${headersList}]
  ${sheetSummary ? `\nSheet data summary (best-effort, may be partial): ${sheetSummary}` : ''}
  ${previousContext ? `\nPrevious context (last 3 messages): ${previousContext}\nUse this to infer missing details like sheetName or targetColumn.` : ''}

${fewShot}

 Instructions:
- Be proactive: for summary/description requests (e.g., "tell me about", "summarize", "what I did" based on data), if headers or sheet data summary are available, plan a describe action directly without clarifying. Use the "describe_sheet" tool when in doubt.
- Only clarify if no data is accessible or the query is truly ambiguous.
- Chain-of-thought (do not output):
  1) Infer intent from User message and previousContext.
  2) If summary-like, set intent="describe_data" and tools=[{"name":"describe_sheet","args":{}}] (include sheetName if apparent).
  3) If data missing, set a concise clarifyQuestion but suggest a fallback assumption (e.g., "Assuming sheet 'Fuel Weekly Repo'...").
- First classify "queryType" among [aggregate, filter, join, text, other]. Then set "intent" among [get_data, aggregate, update, other].
  - For aggregate: choose the best targetColumn from headers. Prefer headers containing ['sale','sales','amount','cost','price','revenue','total'] (case-insensitive). Boost confidence by +0.10 if a keyword is present. Compute confidence [0,1]. If score < 0.5 or no suitable header, set targetColumn to null and set clarifyQuestion to EXACTLY: "Which column contains the amounts? Options: [${headers.join(', ')}]" and set tools to []. If 0.5 <= score < 0.7, still pick the column but this will be treated as a best-guess.
- For filter: extract a simple condition with fields {column, op, value}. Support ops: ">=", "<=", ">", "<", "==", "!=", "contains", "not_contains". If column not in headers, ask a clarification question.
- For join: set join: {leftSheet, rightSheet, key}. If sheet names or key are missing, ask for clarification. Do not invent sheet names.
- For text: pick the categorical column if obvious (e.g., 'Client', 'Category'). If ambiguous, ask for clarification.
  - For updates: Step 1: Compare user request to sheetSummary (append if new rows match headers). Step 2: If files present, chain extract_data_from_files → match structures → update_sheet or apply_structured_rows if compatible. Prefer a toolChain like [{toolName: 'get_sheet_data'}, {toolName: 'extract_data_from_files'}, {toolName: 'update_sheet', params: {transcript: <message>, preview: true}, dependsOn: [0,1]}].
  - For updates: If extracted file rows align with headers, prefer apply_structured_rows with {rows, startRow: currentRows+1}. If mismatch, include a brief clarifyQuestion or suggest a simple transform.
- Only use headers as-is; do not invent or transform.
  - Return STRICT JSON with EXACT fields: { "intent", "queryType", "reasoning", "targetColumn", "targetColumnScore", "targetColumnReason", "clarifyQuestion", "condition", "join", "tools", "toolChain" }.
- tools is an array of {"name": string, "args": object} chosen conservatively based on the queryType.
- toolChain is an ordered array of steps. Each step: {"toolName": string, "params": object, "dependsOn": number[] (indices of prior steps), "fallback"?: {"toolName": string, "params": object}}. Use dependsOn to indicate explicit dependencies; steps without dependsOn can run in parallel.
- Keep reasoning concise (1-2 sentences). Do NOT include any text outside the JSON. Do NOT wrap in code fences.
`;
};

export async function generatePlan(message: string, ctxOrLegacy: PlannerCtx | string = { headers: [] }): Promise<PlannerPlan> {
  const ctx: PlannerCtx = typeof ctxOrLegacy === 'string'
    ? { headers: [] }
    : {
        headers: Array.isArray((ctxOrLegacy as any)?.headers) ? (ctxOrLegacy as any).headers.map((h: any) => String(h ?? '')) : [],
        sheetSummary: typeof (ctxOrLegacy as any)?.sheetSummary === 'string' ? String((ctxOrLegacy as any).sheetSummary) : undefined,
        historySummary: typeof (ctxOrLegacy as any)?.historySummary === 'string' ? String((ctxOrLegacy as any).historySummary) : undefined,
        error: typeof (ctxOrLegacy as any)?.error === 'string' ? String((ctxOrLegacy as any).error) : undefined,
      };
  // If there was a sheet access error, bias towards clarification instead of tool execution
  const hasAccessError = typeof (ctxOrLegacy as any) === 'object' && (ctxOrLegacy as any) && typeof (ctxOrLegacy as any).error === 'string';

  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  const ai = genkit({ plugins: [googleAI({ apiKey })], model: gemini15Flash });
  const prompt = plannerPrompt(message, ctx);
  const { text } = await ai.generate(prompt);
  try {
    let cleaned = (text || '').trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const intent: PlannerPlan['intent'] = ['get_data', 'aggregate', 'update', 'describe_data', 'other'].includes(parsed.intent)
      ? parsed.intent
      : 'other';
    const queryType: PlannerPlan['queryType'] = ['aggregate', 'filter', 'join', 'text', 'other'].includes(parsed.queryType)
      ? parsed.queryType
      : 'other';
    const plan: PlannerPlan = {
      intent,
      queryType,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : null,
      targetColumn: typeof parsed.targetColumn === 'string' && parsed.targetColumn ? parsed.targetColumn : null,
      targetColumnScore: typeof parsed.targetColumnScore === 'number' ? parsed.targetColumnScore : null,
      targetColumnReason: typeof parsed.targetColumnReason === 'string' ? parsed.targetColumnReason : null,
      bestGuess: null,
      condition: parsed.condition && typeof parsed.condition === 'object'
        ? {
            column: typeof parsed.condition.column === 'string' ? parsed.condition.column : null,
            op: ['>=', '<=', '>', '<', '==', '!=', 'contains', 'not_contains'].includes(parsed.condition.op)
              ? parsed.condition.op
              : null,
            value: typeof parsed.condition.value === 'string' ? parsed.condition.value : (parsed.condition.value != null ? String(parsed.condition.value) : null),
          }
        : null,
      join: parsed.join && typeof parsed.join === 'object'
        ? {
            leftSheet: typeof parsed.join.leftSheet === 'string' ? parsed.join.leftSheet : null,
            rightSheet: typeof parsed.join.rightSheet === 'string' ? parsed.join.rightSheet : null,
            key: typeof parsed.join.key === 'string' ? parsed.join.key : null,
          }
        : null,
      clarifyQuestion: typeof parsed.clarifyQuestion === 'string' ? parsed.clarifyQuestion : null,
      tools: Array.isArray(parsed.tools) ? parsed.tools : [],
      toolChain: Array.isArray(parsed.toolChain)
        ? parsed.toolChain.map((s: any) => ({
            toolName: String(s?.toolName || ''),
            params: (typeof s?.params === 'object' && s?.params) ? s.params : {},
            dependsOn: Array.isArray(s?.dependsOn) ? s.dependsOn.map((i: any) => Number(i)).filter((n: any) => Number.isFinite(n) && n >= 0) : [],
            fallback: s?.fallback && typeof s.fallback === 'object'
              ? { toolName: String(s.fallback.toolName || ''), params: (typeof s.fallback.params === 'object' && s.fallback.params) ? s.fallback.params : {} }
              : null,
          }))
        : [],
    };
    // Mark best-guess if medium confidence (>=0.5 and <0.7)
    if (
      plan.intent === 'aggregate' &&
      typeof plan.targetColumnScore === 'number' && plan.targetColumnScore >= 0.5 && plan.targetColumnScore < 0.7 &&
      typeof plan.targetColumn === 'string' && plan.targetColumn
    ) {
      plan.bestGuess = plan.targetColumn;
    }

    // If targetColumn missing, try to infer from previous context by matching known headers
    if (!plan.targetColumn && ctx.historySummary && Array.isArray(ctx.headers) && ctx.headers.length > 0) {
      const text = ctx.historySummary.toLowerCase();
      let best: { h: string; score: number } | null = null;
      for (const h of ctx.headers) {
        const token = String(h || '').trim();
        if (!token) continue;
        const tLower = token.toLowerCase();
        let score = 0;
        if (text.includes(` ${tLower} `)) score += 3;
        if (text.includes(tLower)) score += Math.min(tLower.length, 3);
        if (/column|amount|sum|total|revenue|price|cost|sales/i.test(ctx.historySummary)) score += 0.5;
        if (!best || score > best.score) best = { h: token, score };
      }
      if (best && best.score >= 1) {
        plan.targetColumn = best.h;
        plan.bestGuess = best.h;
        if (plan.intent !== 'aggregate') plan.intent = 'get_data';
      }
    }

    // Guard: if aggregate but low confidence (<0.5), missing, or invalid header, ask to clarify
    if (
      plan.intent === 'aggregate' && (
        !plan.targetColumn ||
        (typeof plan.targetColumnScore === 'number' && plan.targetColumnScore < 0.5) ||
        (plan.targetColumn && !ctx.headers.includes(plan.targetColumn))
      )
    ) {
      const hadHeaders = Array.isArray(ctx.headers) && ctx.headers.length > 0;
      const suggestion = (typeof parsed.targetColumn === 'string' && parsed.targetColumn) ? parsed.targetColumn : (plan.bestGuess || null);
      plan.targetColumn = null;
      plan.targetColumnScore = null;
      plan.targetColumnReason = null;
      plan.tools = [];
      if (!hadHeaders) {
        plan.clarifyQuestion = `I couldn’t load column headers—please check your sheet connection or specify a column manually.`;
      } else if (suggestion) {
        plan.clarifyQuestion = `Which column? I suggest ${suggestion}. Options: [${ctx.headers.join(', ')}]`;
      } else {
        plan.clarifyQuestion = `Which column contains the amounts? Options: [${ctx.headers.join(', ')}]`;
      }
    }
    // Proactive behavior: for summary-like intents, ensure a describe tool is planned
    if (plan.intent === 'describe_data' && (!Array.isArray(plan.tools) || plan.tools.length === 0)) {
      plan.tools = [{ name: 'describe_sheet', args: {} }];
    }

    // Lower clarification threshold for non-aggregate: proceed with best guess if we have some context
    if (plan.intent !== 'aggregate' && plan.clarifyQuestion) {
      const hasSomeContext = (Array.isArray(ctx.headers) && ctx.headers.length > 0) || (typeof ctx.sheetSummary === 'string' && ctx.sheetSummary.trim().length > 0);
      if (hasSomeContext) {
        plan.clarifyQuestion = null;
        if (!plan.tools || plan.tools.length === 0) {
          // Default to fetching sheet data or describing sheet to ground the response
          if (plan.intent === 'describe_data') {
            plan.tools = [{ name: 'describe_sheet', args: {} }];
          } else {
            plan.tools = [{ name: 'get_sheet_data', args: {} }];
          }
        }
      }
    }
    // If a sheet access error was observed upstream, avoid proposing tools and ask a generic clarification
    if (hasAccessError) {
      plan.clarifyQuestion = plan.clarifyQuestion || 'I had trouble accessing the sheet. Please verify access or tell me what you want to know, and I will guide you.';
      plan.tools = [];
      plan.toolChain = [];
    }
    // Guard: if filter but column not in headers, clarify
    if (plan.queryType === 'filter') {
      const col = plan.condition?.column || null;
      if (!col || !ctx.headers.includes(col)) {
        plan.clarifyQuestion = plan.clarifyQuestion || `Which column should I filter on? Options: [${ctx.headers.join(', ')}]`;
        plan.tools = [];
      }
    }
    return plan;
  } catch (e) {
    const hdrs = ctx.headers || [];
    return {
      intent: 'other',
      queryType: 'other',
      reasoning: null,
      targetColumn: null,
      targetColumnScore: null,
      targetColumnReason: null,
      bestGuess: null,
      condition: null,
      join: null,
      clarifyQuestion: hdrs.length ? `Which column contains the amounts? Options: [${hdrs.join(', ')}]` : `I couldn’t load column headers—please check your sheet connection or specify a column manually.`,
      tools: [],
    };
  }
}


