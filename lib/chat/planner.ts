import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';
import { Context, ConversationHistoryItem } from './types';

export type PlannerPlan = {
  intent: 'describe_data' | 'update_data' | 'get_data' | 'other';
  reasoning: string | null;
  tools: Array<{ name: string; args: Record<string, unknown> }>;
  toolChain: Array<{ toolName: string; params: Record<string, unknown>; dependsOn?: number[] }>;
  clarifyQuestion: string | null;
};

function buildPrompt(message: string, context: Context, history: ConversationHistoryItem[], hasFiles: boolean): string {
  const headers: string[] = Array.isArray((context as any)?.sheetHeaders)
    ? ((context as any).sheetHeaders as string[])
    : [];
  const headersList = headers.map((h) => JSON.stringify(String(h))).join(', ');
  const historyText = (history || [])
    .slice(-3)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${(m.content || '').slice(0, 300)}`)
    .join('\n');
  const filesText = hasFiles ? 'yes' : 'no';

  const fewShot = `
  Example 1 (summary):
  User: "tell me about my sheet"
  Headers: ["Date","Category","Amount"]
  Output: {"intent":"describe_data","tools":[{"name":"describe_sheet","args":{}}],"toolChain":[],"clarifyQuestion":null,"reasoning":"Summary-like request; describe the sheet."}

  Example 1b (summary):
  User: "tell me about my data"
  Headers: ["Date","Category","Amount"]
  Output: {"intent":"describe_data","tools":[{"name":"describe_sheet","args":{}}],"toolChain":[],"clarifyQuestion":null,"reasoning":"Summary-like request; describe the sheet."}

  Example 1c (non-tabular summary):
   User: "tell me about my sheet"
   Context.isNonTabular = true
   Output: {"intent":"describe_data","tools":[{"name":"describe_sheet","args":{"mode":"text_summary"}}],"toolChain":[],"clarifyQuestion":null,"reasoning":"Sheet looks non-tabular; request a text-based summary."}

  Example 2 (update with file; prefer apply_structured_rows when compatible):
  User: "add fuel data" (file attached)
  Headers: ["Date","Fuel","Amount","Category"]
  Output: {"intent":"update_data","tools":[],"toolChain":[
    {"toolName":"get_sheet_data","params":{}},
    {"toolName":"extract_data_from_files","params":{}},
    {"toolName":"apply_structured_rows","params":{},"dependsOn":[0,1]}
  ],"clarifyQuestion":null,"reasoning":"Extract rows from file, compare to headers, and apply structured rows when columns match; otherwise fallback will be handled by update tool."}

  Example 3 (aggregate):
  User: "sum sales by region"
  Headers: ["Region","Sales","Rep"]
  Output: {"intent":"get_data","tools":[{"name":"aggregate","args":{"metric":"sum","column":"Sales","groupBy":["Region"]}}],"toolChain":[],"clarifyQuestion":null,"reasoning":"Aggregate sum over Sales grouped by Region."}

  Example 4 (column lookup):
  User: "who is the driver"
  Headers: ["Date","Driver","Miles","Fuel"]
  Output: {"intent":"get_data","tools":[{"name":"get_column_stats","args":{"column":"Driver"}}],"toolChain":[],"clarifyQuestion":null,"reasoning":"Identify the 'Driver' column from headers and get basic stats or values."}

  Example 5 (update, tabular):
  User: "add client Stanley, sold 2000k"
  Headers: ["Client","Amount","Date"]
  Context.sheetData: { "Leads": [["Client","Amount"],["Acme",1000]] }, Context.sheetName: "Leads"
  Output: {"intent":"update_data","tools":[],"toolChain":[
    {"toolName":"apply_structured_rows","params":{"rows":[{"Client":"Stanley","Amount":2000000}],"startRow":3}}
  ],"clarifyQuestion":null,"reasoning":"Tabular sheet; parse fields and append a new structured row."}

  Example 6 (update, non-tabular explicit):
  User: "append raw note: sold to client Stanley 2000k seed"
  Context.isNonTabular = true
  Output: {"intent":"update_data","tools":[],"toolChain":[
    {"toolName":"update_sheet","params":{"text":"sold to client Stanley 2000k seed","append":true,"commit":true}}
  ],"clarifyQuestion":null,"reasoning":"Non-tabular sheet append explicitly requested; append transcript text to the sheet."}
  `;

  return `You are a STRICT planner for a spreadsheet assistant. Think step-by-step privately, then output ONLY JSON with fields exactly {intent, tools, toolChain, clarifyQuestion, reasoning}.

User message: ${JSON.stringify(message)}
Recent conversation (last 3):\n${historyText}
Files attached: ${filesText}
Known headers: [${headersList}]
Sheet format flags: sheetDataFormat=${String((context as any)?.sheetDataFormat || '')}, isNonTabular=${Boolean((context as any)?.isNonTabular)}

${fewShot}

  Chain-of-thought (do not output):
  Update parsing guidance for update_data:
  Step 1: Use context.sheetHeaders to parse message fields. Map terms to the EXACT header names present in the sheet:
    - Prefer exact header names from context.sheetHeaders. Never invent new headers.
    - Examples of common mappings:
      • "client"/"customer" → header that includes "client" (e.g., "CLIENT SEEN").
      • "town"/"city"/known place → header that includes "town" (e.g., "TOWN").
      • "sold"/"amount"/"rand"/"price" → header that includes "sale" or "amount" (e.g., "SALES MADE").
      • "spoke"/"visit"/"reports" → header that includes "detail" or "visit" (e.g., "DETAILS OF VISIT").
    - Always include Date. If unspecified, use current date 08/13/2025 in MM/DD/YYYY.
  Step 2: Output a row object using exact header names only. ALWAYS show a preview first, do not commit until the user confirms.
    Example:
    {Date: '08/13/2025', Vendor: 'Victor', TOWN VISITED: 'Hogwarts', Fuel Cost in Rands: '4000', Notes: 'spoke to him about the upcoming seed reports'}
  Step 3: Plan apply_structured_rows with params { rows: [parsed_row], commit: false } to return a preview for confirmation.
  Example mapping: "add client victor in hogwarts, sold 4000 rand" → rows: [{Date: '08/13/2025', Vendor: 'Victor', TOWN VISITED: 'Hogwarts', Fuel Cost in Rands: '4000'}].
  Include reasoning in JSON and show mapping details, e.g.: {"mapped_fields": {"client": "Vendor", "sold": "Fuel Cost in Rands"}}.

  Additional planning rules:
  - Be proactive. If the message includes "tell me about my data" or contains a probable sheet name (e.g., "Fuel Weekly Repo"), plan describe_sheet immediately with args { sheetName: context.sheetName (or detected), mode: context.isNonTabular ? "text_summary" : "tabular" }.
  - For column/lookup queries like "who is the driver" or "which driver", scan context.sheetHeaders for likely matches (keywords: "driver", "name"). Plan tools=[{"name":"get_column_stats","args":{"column":"<matched header>"}}]. If isNonTabular=true, prefer tools=[{"name":"describe_sheet","args":{"mode":"text_summary"}}].
  - If no headers are known, use context.sheetData when present or guess from conversationHistory to avoid clarifications. Only ask to clarify when there is no usable data and no helpful history.
  - For updates ("add", "update", "append"), set intent="update_data" and choose ONE of these paths (preview first):
    • Tabular: If context.sheetData has rows, parse against context.sheetHeaders and plan apply_structured_rows with { rows: [parsed_row], commit: false }.
    • Non-tabular explicit append: If context.isNonTabular is true AND the user explicitly asked to append raw text ("append", "note", "log", "add text"), plan update_sheet with { text: ${JSON.stringify(message)}, append: true, commit: true }.
    • Files present: First plan extraction then structured apply when compatible: toolChain=[{"toolName":"get_sheet_data"}, ${hasFiles ? "{\"toolName\":\"extract_data_from_files\"}," : ''}{"toolName":"apply_structured_rows","dependsOn":[0${hasFiles ? ',1' : ''}], "params": {"commit": true}}].
  - Only ask to clarify if there is no accessible data (no headers or sheetData) AND no helpful history cues; otherwise include a best-guess tool.
  
  Return STRICT JSON only, no prose, no code fences.`;
}

export async function generatePlan(
  message: string,
  context: Context,
  conversationHistory: ConversationHistoryItem[],
  hasFiles: boolean
): Promise<PlannerPlan> {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  const ai = genkit({ plugins: [googleAI({ apiKey })], model: gemini15Flash });
  const prompt = buildPrompt(message, context, conversationHistory || [], !!hasFiles);
  const { text } = await ai.generate(prompt);
  try {
    let cleaned = String(text || '').trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const intent: PlannerPlan['intent'] = ['describe_data', 'update_data', 'get_data', 'other'].includes(parsed.intent)
      ? parsed.intent
      : 'other';
    const tools = Array.isArray(parsed.tools) ? parsed.tools : [];
    const toolChain = Array.isArray(parsed.toolChain)
      ? parsed.toolChain.map((s: any) => ({
          toolName: String(s?.toolName || ''),
          params: (typeof s?.params === 'object' && s?.params) ? s.params : {},
          dependsOn: Array.isArray(s?.dependsOn) ? s.dependsOn.map((i: any) => Number(i)).filter((n: number) => Number.isFinite(n) && n >= 0) : [],
        }))
      : [];
    // Force commit=true for update tools in toolChain to disable preview mode by default
    const committedChain = toolChain.map((step: { toolName: string; params: Record<string, unknown>; dependsOn?: number[] }) => {
      const name = String(step.toolName || '').toLowerCase();
      if (name === 'update_sheet') {
        return { ...step, params: { ...(step.params || {}), commit: true } };
      }
      if (name === 'apply_structured_rows') {
        return { ...step, params: { ...(step.params || {}), commit: true } };
      }
      return step;
    });

    return {
      intent,
      tools,
      toolChain: committedChain,
      clarifyQuestion: typeof parsed.clarifyQuestion === 'string' ? parsed.clarifyQuestion : null,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : null,
    };
  } catch {
    // Safe fallback with a best-guess tool
    const summaryLike = /tell\s+me\s+about|summariz|what\s+i\s+did|overview/i.test(message || '');
    if (summaryLike) {
      return { intent: 'describe_data', tools: [{ name: 'describe_sheet', args: {} }], toolChain: [], clarifyQuestion: null, reasoning: 'Summary-like request.' };
    }
    return { intent: 'get_data', tools: [{ name: 'get_sheet_data', args: {} }], toolChain: [], clarifyQuestion: null, reasoning: 'Fallback planner.' };
  }
}
