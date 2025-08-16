import { ConversationHistoryItem } from './types';

// Quick helper to extract a probable sheet/tab name from free text (e.g., "fuel weekly repo")
export const extractSheetNameFromMessage = (msg: string): string | undefined => {
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
export const extractIdFromHistory = (history: ConversationHistoryItem[] | undefined): string | undefined => {
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
export const extractSheetName = (
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