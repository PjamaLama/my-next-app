import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';
import { ConversationHistoryItem, Context } from './types';

export async function generateQuickReplies(
  message: string,
  conversationHistory: ConversationHistoryItem[],
  context: Context,
  intent: string,
  hasFiles: boolean
): Promise<string[]> {
  const buildHeuristic = (): string[] => {
    const suggestions: string[] = [];
    const hasSpreadsheet = !!(context?.spreadsheetId && (context?.sheetName || context?.sheetNames?.length));
    const hydratedSheetData = (context as any).sheetData as Record<string, string[][]> | undefined;
    const selectedSheetNames = Array.isArray((context as any).sheetNames) ? (context as any).sheetNames as string[] : [];
    const primarySheet = hydratedSheetData
      ? (selectedSheetNames.find(n => hydratedSheetData[n]) || Object.keys(hydratedSheetData)[0])
      : undefined;
    const table = primarySheet ? hydratedSheetData?.[primarySheet] : undefined;
    const headers: string[] = table?.[0] || [];
    const lastRow: string[] | undefined = table && table.length > 1 ? table[table.length - 1] : undefined;
    const hasDate = headers.some(h => /date/i.test(h));

    if (hasFiles) {
      suggestions.push('Extract text from files');
      if (hasSpreadsheet) suggestions.push('Add extracted data to sheet');
      suggestions.push('Summarize the files');
      return suggestions.slice(0, 3);
    }

    if (intent === 'add_data' || intent === 'update_data') {
      suggestions.push('Preview updates');
      suggestions.push('Apply changes');
      if (hasSpreadsheet) suggestions.push('Show current sheet data');
      return suggestions.slice(0, 3);
    }

    if (intent === 'get_data') {
      if (hydratedSheetData && primarySheet) {
        if (hasDate) suggestions.push("Today's entries");
        if (hasDate) suggestions.push('Past 7 days');
        suggestions.push('Last 3 rows');
        const driverLikeIdx = headers.findIndex(h => /driver/i.test(h));
        if (driverLikeIdx >= 0 && lastRow && lastRow[driverLikeIdx]) {
          const name = String(lastRow[driverLikeIdx]).trim().slice(0, 18);
          suggestions.unshift(`Filter driver ${name}`);
        }
      } else {
        suggestions.push('Show latest rows');
        suggestions.push('Summarize this sheet');
        suggestions.push('Filter by date');
      }
      return suggestions.slice(0, 3);
    }

    if (hydratedSheetData && primarySheet) {
      suggestions.push('Show this sheet');
      if (hasDate) suggestions.push("Today's entries");
      suggestions.push('Unique values');
    } else {
      suggestions.push('Add a new row');
      if (hasSpreadsheet) suggestions.push('Show current sheet');
    }
    suggestions.push('Help me get started');
    return suggestions.slice(0, 3);
  };

  try {
    const recent = [...(conversationHistory || [])].slice(-3).map((m) => ({
      role: m.role,
      content: (m.content || '').slice(0, 200)
    }));
    recent.push({ role: 'user', content: (message || '').slice(0, 200) });

    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) return buildHeuristic();

    const ai = genkit({ plugins: [googleAI({ apiKey })], model: gemini15Flash });
    const historyText = recent
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const hydratedSheetData = (context as any).sheetData as Record<string, string[][]> | undefined;
    const selectedSheetNames = Array.isArray((context as any).sheetNames) ? (context as any).sheetNames as string[] : [];
    const primarySheet = hydratedSheetData
      ? (selectedSheetNames.find(n => hydratedSheetData[n]) || Object.keys(hydratedSheetData)[0])
      : undefined;
    const table = primarySheet ? hydratedSheetData?.[primarySheet] : undefined;
    const headers = table?.[0]?.slice(0, 6) || [];
    const last = table && table.length > 1 ? table[table.length - 1]?.slice(0, 6) : undefined;
    const sheetContext = primarySheet ? `Sheet: ${primarySheet}\nHeaders: ${headers.join(', ')}${last ? `\nLatest: ${last.join(' | ')}` : ''}` : '';

    const prompt = `You generate at most 3 short, tap-friendly quick replies to help the user continue.\nRules:\n- Each reply <= 6 words\n- Be context-aware and helpful\n- Return ONLY a JSON array of strings\n\nConversation:\n${historyText}\n\nData context (if any):\n${sheetContext}\n\nJSON only:`;

    const { text } = await ai.generate(prompt);
    if (!text) return buildHeuristic();

    let cleaned = text.trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/```json|```/g, '').trim();

    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.filter((s) => typeof s === 'string').slice(0, 3);
    }
    return buildHeuristic();
  } catch {
    return buildHeuristic();
  }
}


