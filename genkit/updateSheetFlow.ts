import { genkit } from 'genkit';
import { gemini15Flash, gemini15Pro, googleAI } from '@genkit-ai/googleai';
import { buildSheetUpdatePrompt } from '../lib/prompts/sheetUpdate';
import { getGoogleSheetsClient } from '../lib/googleSheets';
import { suggestHeaderMapping, suggestHeaderMappingWithEmbeddings, inferColumnTypes, matchRowIdentity, parseDateFlexible, parseDecimal, findRowSemantically } from '../lib/mapping';
import { insertRow, updateCell } from './tools';
import { executeAIWithRetry, executeAIWithModelFallback } from '../lib/aiUtils';
import { findLastDataRow } from '../lib/sheetUtils';
import { detectHeaderRow } from '../lib/sheetStructure';
import { ensureHeaderVectors, getHeaderVectors } from '../lib/sheetVectorIndex';
import dayjs from 'dayjs';

// Create multiple AI configurations with different models for fallback
const aiConfigs = [
  {
    name: 'gemini-1.5-flash',
    config: genkit({
      plugins: [googleAI()],
      model: gemini15Flash,
    })
  },
  {
    name: 'gemini-1.5-pro',
    config: genkit({
      plugins: [googleAI()],
      model: gemini15Pro,
    })
  }
];

// Note: Some environments may not ship prompt artifacts. We build the prompt inline if missing.

// Input type for the flow
interface UpdateSheetInput {
  transcript: string;
  sheetId: string;
  sheetName?: string;
  commit?: boolean; // Execute actions when true
  // Optional safety-gate overrides
  forceCommit?: boolean; // If true, bypass confidence gating
  minConfidence?: number; // Minimum average preview confidence required
  minRowConfidence?: number; // Minimum per-row preview confidence required
}

// Output type for the flow
interface UpdateSheetOutput {
  actions: Array<{
    type: 'insertRow' | 'updateCell';
    sheet: string;
    row: number;
    column: string;
    value?: string | number;
    confidence: 'high' | 'medium' | 'low';
    reason?: string;
  }>;
  preview?: Array<{ row: number; updates: Record<string, string>; confidence: number; reason?: string }>; // dry-run preview
  success?: boolean;
  executedActions?: number;
}

// Simplified sheet analysis for AI
const analyzeSheetForAI = (sheetData: string[][]): { lastDataRow: number, insertionRow: number } => {
  const lastDataRow = findLastDataRow(sheetData);
  const insertionRow = lastDataRow + 1; // Insert after the last data row
  
  return { lastDataRow, insertionRow };
};

// Template's pattern analysis function
const buildPatternAnalysis = (sheetData: string[][]): string => {
  if (sheetData.length <= 1) return "";
  
  const headers = sheetData[0];
  const rows = sheetData.slice(1);
  let patternAnalysis = "\n\nDATA PATTERN ANALYSIS:";
  
  headers.forEach((header: string, colIndex: number) => {
    const columnValues = rows.map((row: string[]) => row[colIndex]).filter((val: string) => val !== "" && val !== null && val !== undefined);
    
    if (columnValues.length > 0) {
      const recentValues = columnValues.slice(-3);
      patternAnalysis += `\n- "${header}": Recent values: [${recentValues.join(', ')}]`;
    }
  });
  
  return patternAnalysis;
};

// Helper function to clean and improve the transcript
const cleanTranscript = async (transcript: string): Promise<string> => {
  if (!transcript) return '';
  
  // Apply basic grammar fixes
  let cleaned = applyGrammarFixes(transcript);
  
  // Add context if it's a fuel-related request
  if (cleaned.toLowerCase().includes('fuel') || cleaned.toLowerCase().includes('gas')) {
    cleaned += ' (fuel expense entry)';
  }
  
  // Add context if it's a weekly report
  if (cleaned.toLowerCase().includes('weekly') || cleaned.toLowerCase().includes('report')) {
    cleaned += ' (weekly report update)';
  }
  
  return cleaned;
};

// Helper function to apply grammar fixes
const applyGrammarFixes = (text: string): string => {
  // Basic grammar improvements
  let fixed = text
    .replace(/\b(add|update|insert)\s+my\b/gi, 'add to my')
    .replace(/\b(fuel|gas)\s+slips?\b/gi, 'fuel receipts')
    .replace(/\bweekly\s+repo\b/gi, 'weekly report')
    .replace(/\bdata\s+from\b/gi, 'information from');
  
  return fixed;
};

// Export the flow implementation
export const updateSheetFlow = aiConfigs[0].config.defineFlow('updateSheetFlow', async (input: UpdateSheetInput): Promise<UpdateSheetOutput> => {
  try {
    console.log('UpdateSheetFlow called with:', input);
    
    // Ensure sheetName is provided
    const { transcript, sheetId, sheetName, commit = false } = input;
    
    if (!sheetName) {
      throw new Error('Sheet name is required for sheet updates');
    }
    
    // Clean and improve the transcript
    const cleanedTranscript = await cleanTranscript(transcript);
    console.log('Original transcript:', transcript);
    console.log('Cleaned transcript:', cleanedTranscript);
    
    // Fetch real Google Sheets data as structured data
    const sheets = await getGoogleSheetsClient();
    
    // Use shared utility for escaping sheet names
    const { escapeSheetName } = await import('../lib/sheetUtils');
    
    const escapedSheetName = escapeSheetName(sheetName);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${escapedSheetName}!A1:Z1000`,
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    
    const sheetData = response.data.values || [];
    
    if (sheetData.length === 0) {
      throw new Error('No data found in sheet');
    }
    
    // Analyze sheet structure using simplified logic
    const { lastDataRow, insertionRow } = analyzeSheetForAI(sheetData);
    const patternAnalysis = buildPatternAnalysis(sheetData);
    
    console.log('Sheet structure analysis:', { lastDataRow, insertionRow });
    console.log('Pattern analysis:', patternAnalysis);
    
    // Convert to CSV for the prompt
    const headerDetect = detectHeaderRow(sheetData);
    let headerRowIdx = Math.max(0, headerDetect.rowIndex);
    const csvData = sheetData.map(row => row.join(',')).join('\n');
    let headers = sheetData[headerRowIdx] || [];
    let rowsOnly = sheetData.slice(headerRowIdx + 1);
    const columnTypes = inferColumnTypes(headers, rowsOnly);
    
    // Current date/time context for the prompt
    const now = dayjs();
    const currentDate = now.format('YYYY-MM-DD');
    const currentTime = now.format('HH:mm');
    const currentDateTime = now.format('YYYY-MM-DD HH:mm');
    const isoDateTime = now.toDate().toISOString();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    // Ensure header vectors for embeddings-backed mapping
    try {
      await ensureHeaderVectors(sheetId, sheetName, headers, rowsOnly);
    } catch (e) {
      console.warn('Failed to ensure header vectors:', e);
    }
    const vectors = getHeaderVectors(sheetId, sheetName) || [];

    // Try to find an existing row for "today" to encourage updates over inserts
    let matchingRowForToday = -1;
    try {
      const candidateForToday: Record<string, string> = { Date: currentDate };
      matchingRowForToday = matchRowIdentity(headers, sheetData, candidateForToday);
    } catch (e) {
      console.warn('Failed to compute matchingRowForToday:', e);
    }

    // If no matching row found by heuristic and transcript looks like an update, use semantic finder
    try {
      const wantsUpdate = /\b(update|fix|change|edit|correct|adjust)\b/i.test(cleanedTranscript);
      if (wantsUpdate && matchingRowForToday < 0) {
        const semantic = await findRowSemantically(headers, rowsOnly, cleanedTranscript);
        if (semantic.rowIndex >= 0 && semantic.score >= 0.55) {
          // Convert rowsOnly index to absolute sheet row index (1-based)
          matchingRowForToday = (headerRowIdx + 1) + semantic.rowIndex + 1; // headerRowIdx is 0-based, +1 for 1-based rows
          console.log(`Semantic row match selected at row ${matchingRowForToday} (score=${semantic.score.toFixed(2)})`);
        }
      }
    } catch (e) {
      console.warn('Semantic row finder failed:', e);
    }

    // Respect manual block override from client if present via context (optional):
    try {
      // If the client sends a block index in the transcript context like [Block:#]
      const blockTag = cleanedTranscript.match(/\[Block:(\d+)\]/i);
      if (blockTag) {
        const idx = Number(blockTag[1]);
        // Fallback: parse blocks client-side is not sent; we can ignore if unknown
        // This is a placeholder for future API to accept explicit block index
        console.log(`Client requested block override index: ${idx}`);
      }
    } catch {}

    // Build inline prompt text to avoid missing prompt artifacts in production
    // Build mapping hints for common canonical fields
    const canonicalKeys = ['date', 'amount', 'total', 'price', 'vehicle', 'registration', 'reg#', 'driver', 'category', 'description'];
    let headerMappingHints: Record<string, string> = {};
    try {
      const suggestions = await suggestHeaderMappingWithEmbeddings(canonicalKeys, headers, vectors);
      // Convert header index to column letters
      const headerToLetter = (idx: number) => {
        let n = idx + 1, s = '';
        while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
        return s;
      };
      suggestions.forEach(sug => {
        const idx = headers.findIndex(h => h === sug.targetHeader);
        if (idx >= 0 && sug.confidence >= 0.4) headerMappingHints[sug.incomingKey] = headerToLetter(idx);
      });
    } catch (e) {
      console.warn('Header mapping with embeddings failed, falling back to lexical only');
      const suggestions = suggestHeaderMapping(canonicalKeys, headers);
      const headerToLetter = (idx: number) => {
        let n = idx + 1, s = '';
        while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
        return s;
      };
      suggestions.forEach(sug => {
        const idx = headers.findIndex(h => h === sug.targetHeader);
        if (idx >= 0 && sug.confidence >= 0.5) headerMappingHints[sug.incomingKey] = headerToLetter(idx);
      });
    }

    const promptText = buildSheetUpdatePrompt({
      transcript: cleanedTranscript,
      sheetName,
      lastDataRow,
      insertionRow,
      headers: headers.join(', '),
      detectedHeaderRowIndex: headerRowIdx,
      headerMappingHints: JSON.stringify(headerMappingHints),
      patternAnalysis,
      currentDate,
      currentTime,
      currentDateTime,
      isoDateTime,
      timezone,
      matchingRowForToday,
      sheetDataCsv: csvData,
    });

    // Create multiple AI operations for fallback using inline prompt
    const aiOperations = aiConfigs.map(config =>
      () => config.config.generate(promptText)
    );
    
    // Use the fallback strategy with multiple models
    const { text } = await executeAIWithModelFallback(
      aiOperations,
      'Sheet update analysis with AI models'
    );
    
    console.log('AI response:', text);
    
    // Parse the JSON response
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      if (parsed && parsed.actions && Array.isArray(parsed.actions)) {
        console.log(`Successfully parsed ${parsed.actions.length} actions`);
        
        // Build a dry-run preview grouped by row with confidence and reasons
        try {
          const headerLetters = (idx: number) => {
            let n = idx + 1, s = '';
            while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
            return s;
          };
          const colCount = headers.length;
          const previews: Array<{ row: number; updates: Record<string, string>; confidence: number; reason?: string }> = [];
          const byRow = new Map<number, Record<string, string>>();
          for (const action of parsed.actions as Array<{ type: string; row: number; column: string; value?: string }>) {
            if (action.type !== 'updateCell') continue;
            const m = action.column.match(/^[A-Z]+$/);
            if (!m) continue;
            const colIndex = action.column.split('').reduce((acc: number, ch: string) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
            if (colIndex < 0 || colIndex >= colCount) continue;
            const hdr = headers[colIndex];
            const obj = byRow.get(action.row) || {};
            obj[hdr] = String(action.value ?? '');
            byRow.set(action.row, obj);
          }
          for (const [row, obj] of byRow.entries()) {
            // Heuristic confidence: date parse success, numeric columns parse success
            let votes = 0, total = 1;
            for (const [k, v] of Object.entries(obj)) {
              total++;
              const t = columnTypes[k] || 'string';
              if (t === 'date' && parseDateFlexible(v)) votes++;
              else if (t === 'number' && parseDecimal(v) != null) votes++;
              else if (t === 'string' && v.trim().length > 0) votes += 0.5;
            }
            const confidence = Math.max(0.1, Math.min(1, votes / total));
            previews.push({ row, updates: obj, confidence });
          }
          (parsed as UpdateSheetOutput).preview = previews.sort((a, b) => a.row - b.row);
        } catch (e) {
          console.warn('Failed to build preview from actions:', e);
        }

        // If commit is true, execute the actions
        if (commit) {
          console.log('Commit flag is true, executing actions...');
          let executedCount = 0;

          // Heuristic: if user wants to update today's entry and a matching row exists,
          // prefer updates over inserts by rewriting actions to target the matched row.
          try {
            const wantsToday = /\b(today|now|tonight|todays|today\'s)\b/i.test(cleanedTranscript);
            const wantsUpdate = /\b(update|fix|change|edit|correct|adjust)\b/i.test(cleanedTranscript);
            if (wantsToday && matchingRowForToday > 0) {
              console.log(`Rewriting actions to update existing row ${matchingRowForToday} for today`);
              (parsed as any).actions = (parsed as any).actions
                .filter((a: any) => a.type !== 'insertRow')
                .map((a: any) => a.type === 'updateCell' ? { ...a, row: matchingRowForToday } : a);
            } else if (wantsUpdate && matchingRowForToday > 0) {
              // If explicit update intent and match exists, also force updates
              console.log(`Rewriting actions to update existing row ${matchingRowForToday} due to update intent`);
              (parsed as any).actions = (parsed as any).actions
                .filter((a: any) => a.type !== 'insertRow')
                .map((a: any) => a.type === 'updateCell' ? { ...a, row: matchingRowForToday } : a);
            }
          } catch (rewriteErr) {
            console.warn('Failed to apply update-over-insert rewrite:', rewriteErr);
          }
          
          // Confidence gating: require sufficient preview confidence before committing
          try {
            const preview = (parsed as UpdateSheetOutput).preview || [];
            if (preview.length > 0) {
              const avg = preview.reduce((s, p) => s + (p.confidence ?? 0), 0) / preview.length;
              const min = preview.reduce((m, p) => Math.min(m, p.confidence ?? 1), 1);
              // Code-level defaults: if no per-call override is provided, do not block (0)
              const thresholdAvg = (typeof input.minConfidence === 'number' ? input.minConfidence : 0);
              const thresholdMin = (typeof input.minRowConfidence === 'number' ? input.minRowConfidence : 0);
              const force = !!input.forceCommit;
              if (!force && (avg < thresholdAvg || min < thresholdMin)) {
                console.warn(`Aborting commit due to low confidence. avg=${avg.toFixed(2)} min=${min.toFixed(2)} (req avg>=${thresholdAvg}, min>=${thresholdMin})`);
                return { ...(parsed as UpdateSheetOutput), success: false, executedActions: 0 } as UpdateSheetOutput;
              }
              if (force) {
                console.warn(`Bypassing confidence gate via forceCommit. avg=${avg.toFixed(2)} min=${min.toFixed(2)}`);
              }
            }
          } catch (e) {
            console.warn('Confidence gating failed to compute:', e);
          }

          // Separate insertRow and updateCell actions
          const insertRowActions = parsed.actions.filter((action: any) => action.type === 'insertRow');
          const updateCellActions = parsed.actions.filter((action: any) => action.type === 'updateCell');
          
          console.log(`Found ${insertRowActions.length} insertRow actions and ${updateCellActions.length} updateCell actions`);
          
          // Track write errors to surface meaningful feedback
          const writeErrors: string[] = [];

          // First, execute all insertRow actions
          for (const action of insertRowActions) {
            try {
              // Validate insertion row position
              if (action.row < insertionRow) {
                console.error(`Skipping insertRow at row ${action.row}: must be at or after insertion row ${insertionRow}`);
                continue;
              }
              
              console.log(`Executing insertRow: ${action.sheet}, row ${action.row}`);
              console.log(`Using lastDataRow from AI analysis: ${lastDataRow}`);
              await insertRow({
                sheetId: sheetId,
                sheetName: sheetName,
                row: action.row,
                lastDataRow: lastDataRow // Pass the lastDataRow from AI analysis
              });
              executedCount++;
            } catch (actionError) {
              console.error(`Error executing insertRow action:`, actionError);
              writeErrors.push(actionError instanceof Error ? actionError.message : String(actionError));
              // Continue with other actions even if one fails
            }
          }
          
          // Then, execute updateCell actions in batches (optimize by grouping)
          if (updateCellActions.length > 0) {
            try {
              type UpdateItem = { cell: string; row: number; column: string; value: string };
              const updates: UpdateItem[] = updateCellActions.map((a: any) => ({
                cell: `${a.column}${a.row}`,
                row: Number(a.row),
                column: String(a.column),
                value: String(a.value ?? '')
              }));

              // Ensure capacity to the max row/column being written
              const { ensureSheetCapacity, escapeSheetName } = await import('../lib/sheetUtils');
              const maxRow = updates.reduce((max: number, u: UpdateItem) => Math.max(max, u.row || 1), 1);
              const maxCol = updates.reduce((max: string, u: UpdateItem) => {
                if (!u.column) return max;
                return u.column.length > max.length ? u.column : max;
              }, 'A');

              await ensureSheetCapacity(sheetId, sheetName, maxRow, maxCol);

              // Snapshot pre-values for verification/rollback
              const ranges = updates.map(u => `${escapeSheetName(sheetName)}!${u.cell}:${u.cell}`);
              const pre = await sheets.spreadsheets.values.batchGet({
                spreadsheetId: sheetId,
                ranges
              });
              const preValues = (pre.data.valueRanges || []).map(vr => (vr.values && vr.values[0] ? String(vr.values[0][0] ?? '') : ''));

              // Prepare batch update payload
              const batchData = updates.map((u: UpdateItem) => ({
                range: `${escapeSheetName(sheetName)}!${u.cell}`,
                values: [[u.value]]
              }));

              await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: sheetId,
                requestBody: {
                  data: batchData,
                  valueInputOption: 'USER_ENTERED'
                }
              });

              // Read-after-write verification
              const post = await sheets.spreadsheets.values.batchGet({ spreadsheetId: sheetId, ranges });
              const postValues = (post.data.valueRanges || []).map(vr => (vr.values && vr.values[0] ? String(vr.values[0][0] ?? '') : ''));
              const failures: number[] = [];
              postValues.forEach((v, i) => {
                const intended = String(updates[i]?.value ?? '');
                const colIndex = updates[i].column.split('').reduce((acc: number, ch: string) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
                const header = headers[colIndex] || '';
                const type = columnTypes[header] || 'string';
                const vv = String(v ?? '');
                let equal = false;
                if (type === 'date') {
                  try {
                    const d1 = parseDateFlexible(intended);
                    const d2 = parseDateFlexible(vv);
                    if (d1 && d2) {
                      const iso1 = new Date(d1).toISOString().slice(0, 10);
                      const iso2 = new Date(d2).toISOString().slice(0, 10);
                      equal = iso1 === iso2;
                    }
                  } catch {}
                } else if (type === 'number') {
                  const n1 = parseFloat(intended.replace(/[^0-9.\-]+/g, ''));
                  const n2 = parseFloat(vv.replace(/[^0-9.\-]+/g, ''));
                  if (Number.isFinite(n1) && Number.isFinite(n2)) equal = Math.abs(n1 - n2) < 1e-6;
                } else {
                  equal = vv === intended;
                }
                if (!equal) failures.push(i);
              });

              if (failures.length > 0) {
                console.warn(`Verification failed for ${failures.length}/${updates.length} update(s). Attempting targeted rollback for failed cells.`);
                // Rollback failed cells to pre-values
                const rollbackData = failures.map(i => ({
                  range: `${escapeSheetName(sheetName)}!${updates[i].cell}`,
                  values: [[preValues[i] ?? '']]
                }));
                try {
                  await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: sheetId,
                    requestBody: { data: rollbackData, valueInputOption: 'USER_ENTERED' }
                  });
                } catch (rbErr) {
                  console.error('Rollback failed:', rbErr);
                }
                // Report failure without counting those updates
                executedCount += (updates.length - failures.length);
                return {
                  ...(parsed as UpdateSheetOutput),
                  success: false,
                  executedActions: executedCount,
                  preview: (parsed as UpdateSheetOutput).preview
                } as UpdateSheetOutput;
              }

              executedCount += updates.length;
            } catch (err) {
              console.error('Batch update for updateCell actions failed:', err);
              writeErrors.push(err instanceof Error ? err.message : String(err));
            }
          }
          
          console.log(`Successfully executed ${executedCount} out of ${parsed.actions.length} actions`);
          if (executedCount === 0 && writeErrors.length > 0) {
            // Surface a consolidated error to the caller so the UI can inform the user
            throw new Error(`No updates could be applied. Possible causes: missing edit permission or protected range. Details: ${writeErrors.join(' | ')}`);
          }
          
          return {
            ...parsed,
            success: true,
            executedActions: executedCount
          } as UpdateSheetOutput;
        } else {
          // Just return the actions without executing them
          return parsed as UpdateSheetOutput;
        }
      } else {
        console.error('Invalid response structure:', parsed);
        return { actions: [] };
      }
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('Raw response:', text);
      return { actions: [] };
    }
    
  } catch (error) {
    console.error('Error in updateSheetFlow:', error);
    throw error;
  }
}); 