import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';

type ComposeTable = { title?: string; headers: string[]; rows: string[][]; summary?: string };
type ComposeChart = { kind: 'bar' | 'line' | 'pie'; title?: string; labels: string[]; datasets: Array<{ label: string; data: number[] }> };

type ComposeInput = {
  userMessage: string;
  qaAnswer?: string;
  tables?: ComposeTable[];
  charts?: ComposeChart[];
  insights?: string[];
  toolSummaries?: string[];
};

export async function composeGroundedReply(input: ComposeInput): Promise<string> {
  const { userMessage, qaAnswer, tables = [], charts = [], insights = [], toolSummaries = [] } = input;

  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  const ai = genkit({ plugins: [googleAI({ apiKey })], model: gemini15Flash });

  const compactTables = tables.slice(0, 2).map(t => ({
    title: t.title || 'Table',
    headers: (t.headers || []).slice(0, 6),
    rows: (t.rows || []).slice(0, 5).map(r => (r || []).slice(0, 6)),
    summary: t.summary || ''
  }));
  const compactCharts = charts.slice(0, 2).map(c => ({
    kind: c.kind,
    title: c.title || '',
    labels: (c.labels || []).slice(0, 8),
    datasets: (c.datasets || []).map(d => ({ label: d.label, data: (d.data || []).slice(0, 8) }))
  }));

  const system = [
    'You are a helpful spreadsheet assistant.',
    'Ground your answer ONLY in the provided context (tables, charts, insights, tool summaries).',
    'If information is missing from the context, say you do not have enough information.',
    'Keep it concise, conversational, and specific. Avoid markdown tables unless asked.',
    'If the user intent suggests data updates, suggest "Preview updates" or "Apply changes" as next steps.'
  ].join(' ');

  const contextJson = JSON.stringify({
    qaAnswer: qaAnswer || null,
    toolSummaries,
    tables: compactTables,
    charts: compactCharts,
    insights: insights.slice(0, 5)
  });

  const prompt = `${system}

User message:
${userMessage}

Context (ground truth JSON):
${contextJson}

Write a short, friendly answer grounded in the context.`;

  const { text } = await ai.generate(prompt);
  return (text || '').trim() || 'I analyzed your data.';
}


