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
  `;

  return `You are a STRICT planner for a spreadsheet assistant. Think step-by-step privately, then output ONLY JSON with fields exactly {intent, tools, toolChain, clarifyQuestion, reasoning}.

User message: ${JSON.stringify(message)}
Recent conversation (last 3):\n${historyText}
Files attached: ${filesText}
Known headers: [${headersList}]

${fewShot}

  Chain-of-thought (do not output):
  Step 1: Analyze message and historySummary (the last 3 messages above) for intent: summary/describe, query, or update.
  Step 2: For summary-like ("tell me about", "summarize", "what I did"), set intent="describe_data" and plan tools=[{"name":"describe_sheet","args":{${(context as any)?.sheetName ? `"sheetName":"${String((context as any).sheetName)}"` : ''}}}]. If the message mentions a specific sheet (e.g., "Fuel Weekly Repo"), include that sheetName.
  Step 3: For column/lookup queries like "who is the driver" or "which driver", search known headers for a likely match (e.g., contains "driver" or looks like a person name column). Plan tools=[{"name":"get_column_stats","args":{"column":"<matched header>"}}].
  Step 4: For updates ("add this data", "update with", "append"), set intent="update_data" and plan tool-calls as follows:
    - Check headers from context.
    - If files present, chain extract_data_from_files to obtain structured rows.
    - Compare extracted columns with headers. If compatible, plan apply_structured_rows with {rows: <extracted>} and dependsOn get_sheet_data (and extract step when applicable); otherwise plan update_sheet with {transcript:${JSON.stringify(message)}, preview:true}.
    - Default chain: [{toolName:'get_sheet_data'}, ${hasFiles ? "{toolName:'extract_data_from_files'}," : ''} {toolName:'apply_structured_rows', dependsOn:[0${hasFiles ? ',1' : ''}]}]. If unsure about compatibility, prefer update_sheet.
  Step 5: Only ask to clarify if there is no accessible data (no headers) AND no helpful history cues; otherwise include a best-guess tool.
  
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
    return {
      intent,
      tools,
      toolChain,
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
