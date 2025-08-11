import { NextApiRequest, NextApiResponse } from 'next';
import { updateSheetFlow } from '../../genkit/updateSheetFlow';
import { convertSheetFlow, type ConvertOutput } from '../../genkit/convertSheetFlow';
import { analyzeFileFlow } from '../../genkit/analyzeFileFlow';
import { getGoogleSheetsClient } from '@/lib/googleSheets';
import { ensureSheetCapacity, findLastDataRow } from '@/lib/sheetUtils';
import { suggestHeaderMapping, matchRowIdentity } from '@/lib/mapping';
import { analyzeSheetStructure } from '@/lib/sheetStructure';
import { getCachedHeaders } from '@/lib/sheetHeaderCache';
import { buildExistingKeySet, filterNewRows } from '@/lib/dedupe';
import { insertRow } from '../../genkit/tools';

// Configure API to handle larger file uploads
export const config = {
  api: {
    // Increase to match chat endpoint and allow base64 payload overhead
    bodyParser: { sizeLimit: '128mb' },
  },
};

// Define proper types for the function parameters
interface Context {
  spreadsheetId?: string;
  sheetName?: string;
  sheetNames?: string[];
  unstructuredSheets?: string[];
  [key: string]: unknown;
}

interface ToolArgs {
  transcript?: string;
  sheetData?: unknown;
  spreadsheetId?: string;
  sheetName?: string; // Keep for backward compatibility if needed, but prefer sheetNames
  sheetNames?: string[]; // New field for multiple sheet selection
  imageCount?: number;
  imageTypes?: string[];
  [key: string]: unknown;
}

interface ImageData {
  data: string;
  mimeType: string;
  name?: string;
}

// Define interface SheetAction
interface SheetAction {
  sheet?: string;
  column: string;
  row: number;
  value: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { toolCall, context, images } = req.body;

    // Validate file sizes before processing
    if (images && images.length > 0) {
      console.log(`API: ${images.length} images/files included`);
      
      const maxFileSize = 8 * 1024 * 1024; // 8MB limit for individual files
      const totalSizeLimit = 20 * 1024 * 1024; // 20MB total limit
      let totalSize = 0;
      
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const fileSize = Math.ceil((image.data.length * 3) / 4); // Approximate base64 size
        
        if (fileSize > maxFileSize) {
          return res.status(413).json({
            error: 'File too large',
            details: `File ${i + 1} exceeds the 8MB limit. Please compress or resize your file.`,
            fileIndex: i,
            fileSize: `${(fileSize / 1024 / 1024).toFixed(1)}MB`,
            maxSize: '8MB'
          });
        }
        
        totalSize += fileSize;
      }
      
      if (totalSize > totalSizeLimit) {
        return res.status(413).json({
          error: 'Total file size too large',
          details: `Combined file size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds the 20MB limit. Please reduce the number or size of files.`,
          totalSize: `${(totalSize / 1024 / 1024).toFixed(1)}MB`,
          maxTotalSize: '20MB'
        });
      }
    }

    if (!toolCall || !toolCall.function) {
      return res.status(400).json({ error: 'Valid tool call is required' });
    }

    const { name, arguments: argsString } = toolCall.function;
    const args = JSON.parse(argsString);

    // Get API key from environment variable
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    
    // Ensure API key is provided for tools that require it
    if (!apiKey && (name === 'analyze_images' || name === 'analyze_files' || name === 'extract_data_from_images' || name === 'extract_data_from_files')) {
      return res.status(400).json({
        success: false,
        error: 'Gemini API key is required for this operation.',
        details: 'Please ensure your GOOGLE_GENAI_API_KEY is configured in your environment variables.'
      });
    }

    console.log(`API: Executing approved tool: ${name}`);
    console.log(`API: Tool arguments:`, args);
    console.log(`API: Received ${images?.length || 0} images`);
    console.log(`API: Images types:`, images?.map((img: ImageData) => img.mimeType) || []);
    console.log(`API: Gemini API key provided:`, !!apiKey);

    switch (name) {
      case 'update_sheet':
        return await handleUpdateSheet(args, context, res);
      case 'convert_unstructured_sheet':
        return await handleConvertSheet(args, res);

      case 'get_sheet_data':
        return await handleGetSheetData(args, res);

      case 'get_sheet_stats':
        return await handleGetSheetStats(args, res);

      case 'get_column_stats':
        return await handleGetColumnStats(args, res);

    case 'update_single_cell': {
      try {
        const { spreadsheetId, sheetName, cell, value } = args as any;
        if (!spreadsheetId || !sheetName || !cell) {
          return res.status(400).json({ success: false, error: 'spreadsheetId, sheetName and cell are required' });
        }
        const sheets = await getGoogleSheetsClient();
        const range = `${sheetName.includes(' ')? `'${sheetName.replace(/'/g, "''")}'`: sheetName}!${cell}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[value ?? '']] }
        });
        return res.status(200).json({ success: true, result: `Updated ${cell} in ${sheetName}` });
      } catch (e) {
        return res.status(500).json({ success: false, error: 'Failed to update cell', details: e instanceof Error ? e.message : String(e) });
      }
    }

      case 'analyze_voice_input':
        return await handleAnalyzeVoiceInput(args, res);

      case 'analyze_images':
      case 'analyze_files':
        return await handleAnalyzeImages(args, images, apiKey!, res);

      case 'extract_data_from_images':
      case 'extract_data_from_files':
        return await handleExtractDataFromImages(args, context, images, apiKey!, res);

      case 'extract_text_only':
        return await handleExtractTextOnly(args, images, res);

      case 'generate_report':
        return await handleGenerateReport(args, context, res);

      case 'apply_structured_rows':
        return await handleApplyStructuredRows(args, context, res);

      case 'bulk_update_column':
        return await handleBulkUpdateColumn(args, context, res);

      case 'get_current_datetime': {
        try {
          const now = new Date();
          const pad = (n: number) => String(n).padStart(2, '0');
          const yyyy = now.getFullYear();
          const mm = pad(now.getMonth() + 1);
          const dd = pad(now.getDate());
          const HH = pad(now.getHours());
          const MM = pad(now.getMinutes());
          const SS = pad(now.getSeconds());
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
          const result = {
            iso: now.toISOString(),
            date: `${yyyy}-${mm}-${dd}`,
            time: `${HH}:${MM}:${SS}`,
            datetime: `${yyyy}-${mm}-${dd} ${HH}:${MM}`,
            timezone: tz
          };
          return res.status(200).json({ success: true, result: `Now: ${result.datetime} (${tz})`, details: result });
        } catch (e) {
          return res.status(500).json({ success: false, error: 'Failed to get current date/time', details: e instanceof Error ? e.message : String(e) });
        }
      }

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown tool: ${name}`
        });
    }

  } catch (error: unknown) {
    console.error('API: Unhandled error during tool execution:', error);
    console.error('API: Type of error:', typeof error);

    let errorMessage = 'Failed to execute tool';
    let errorDetails: string | object = 'An unknown error occurred.';

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || error.message;
      if (error.message.includes('body too large') || error.message.includes('413')) {
        return res.status(413).json({
          error: 'Request too large',
          details: 'The uploaded files exceed the size limit. Please reduce file sizes or upload fewer files.',
          limits: {
            individualFile: '8MB',
            totalFiles: '20MB'
          }
        });
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
      errorDetails = error;
    } else if (typeof error === 'object' && error !== null) {
      // Attempt to stringify other object types for logging
      try {
        errorDetails = JSON.stringify(error);
              } catch {
        errorDetails = '[Unstringifiable object error]';
      }
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
      details: errorDetails
    });
  }
}
async function handleConvertSheet(args: ToolArgs, res: NextApiResponse) {
  const { spreadsheetId, sheetName, newSheetName } = args as any;
  if (!spreadsheetId || !sheetName) {
    return res.status(400).json({ success: false, error: 'spreadsheetId and sheetName are required' });
  }
  try {
    const sheets = await getGoogleSheetsClient();
    const escaped = sheetName.includes(' ')? `'${sheetName.replace(/'/g, "''")}'`: sheetName;

    // Read source data using dynamic dimensions and robust fallbacks
    const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
    const sourceSheet = meta.data.sheets?.find(s => s.properties?.title === sheetName);
    if (!sourceSheet?.properties?.gridProperties) {
      return res.status(404).json({ success: false, error: `Sheet "${sheetName}" not found in spreadsheet` });
    }
    const rowCount = sourceSheet.properties.gridProperties.rowCount || 1000;
    const columnCount = sourceSheet.properties.gridProperties.columnCount || 26;
    const getColumnLetter = (num: number) => {
      let result = '';
      while (num > 0) { num--; result = String.fromCharCode(65 + (num % 26)) + result; num = Math.floor(num / 26); }
      return result || 'A';
    };
    const endColumn = getColumnLetter(columnCount);

    // Create the STRUCTURED sheet up-front to ensure the original sheet is never modified
    const baseName = (typeof newSheetName === 'string' && newSheetName.trim()) ? newSheetName.trim() : `${sheetName} (Structured)`;
    const existingNames = new Set((meta.data.sheets || []).map(s => s.properties?.title).filter(Boolean) as string[]);

    const chooseUniqueName = (): string => {
      if (!existingNames.has(baseName)) return baseName;
      let i = 2;
      while (i < 1000) {
        const candidate = `${baseName} ${i}`;
        if (!existingNames.has(candidate)) return candidate;
        i++;
      }
      return `${baseName} ${Date.now()}`;
    };

    let targetName = chooseUniqueName();
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: targetName } } }] }
      });
    } catch (e: any) {
      const msg = (e?.message || '').toString();
      if (msg.includes('already exists') || msg.includes('Duplicate') || msg.includes('409')) {
        // Retry once with a timestamped name
        targetName = `${baseName} ${Date.now()}`;
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: targetName } } }] }
        });
      } else {
        throw e;
      }
    }

    const strategies = [
      `${escaped}!A1:${endColumn}${Math.min(rowCount, 2000)}`,
      `${escaped}!A:${endColumn}`,
      `${escaped}!A1:${endColumn}200`,
      `${escaped}!A1:T100`
    ];

    let data: string[][] = [];
    let lastReadError: unknown = null;
    for (const strategy of strategies) {
      try {
        const resp = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: strategy,
          valueRenderOption: 'FORMATTED_VALUE',
          dateTimeRenderOption: 'FORMATTED_STRING'
        });
        data = (resp.data.values || []) as string[][];
        // If we got any rows at all, accept this strategy
        if (data.length > 0) break;
      } catch (err) {
        lastReadError = err;
        continue;
      }
    }

    let sourceReadWarning: string | undefined;
    if (!data || data.length === 0) {
      const detail = lastReadError instanceof Error ? lastReadError.message : String(lastReadError || 'Unknown read error');
      sourceReadWarning = `Source read produced no rows. Details: ${detail}`;
      data = [];
    }

    // Build CSV for AI conversion
    const csv = (data as string[][]).map(r => (r || []).join(',')).join('\n');
    let converted: ConvertOutput | null = null;
    try {
      converted = (await convertSheetFlow.run({ sheetName, sheetCsv: csv })) as unknown as ConvertOutput;
    } catch (convErr) {
      // Proceed with heuristic fallback below
      converted = null;
    }

    // Fallback: if AI conversion failed, threw, or returned empty, derive a structured table heuristically
    if (!converted || !Array.isArray(converted.headers) || converted.headers.length === 0) {
      try {
        const metaAnalysis = analyzeSheetStructure(data);
        let headers: string[] = [];
        let rows: string[][] = [];
        if (metaAnalysis.detectedHeaders && metaAnalysis.columnCount > 0) {
          headers = metaAnalysis.detectedHeaders.map(h => String(h ?? '').trim());
          const width = headers.length;
          for (let r = 1; r < data.length; r++) {
            const row = (data[r] || []).map(v => String(v ?? ''));
            const hasAny = row.some(v => v.trim() !== '');
            if (!hasAny) continue;
            const shaped = row.slice(0, width);
            while (shaped.length < width) shaped.push('');
            rows.push(shaped);
          }
        } else {
          // Use first non-empty row as headers or synthesize generic headers based on max width
          const firstNonEmpty = data.find(r => (r || []).some(v => String(v ?? '').trim() !== '')) || [];
          const width = Math.max(1, firstNonEmpty.length);
          const toLetters = (n: number) => { let s = '', x = n; while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); } return s || 'A'; };
          headers = Array.from({ length: width }, (_, i) => String(firstNonEmpty[i] ?? '').trim() || `Column ${toLetters(i + 1)}`);
          for (let r = 1; r < data.length; r++) {
            const row = (data[r] || []).map(v => String(v ?? ''));
            const hasAny = row.some(v => v.trim() !== '');
            if (!hasAny) continue;
            const shaped = row.slice(0, width);
            while (shaped.length < width) shaped.push('');
            rows.push(shaped);
          }
        }
        converted = { headers, rows };
      } catch {
        // As a last resort, create a minimal sheet with a single generic header
        converted = { headers: ['Column A'], rows: [] };
      }
    }

    // Helper to generate a unique sheet name avoiding collisions
    // targetName is already created above

    // Ensure the new sheet has enough capacity for the data
    const totalRows = (converted.rows?.length || 0) + 1; // +1 for headers
    const totalCols = Math.max(1, converted.headers.length);
    const toColumnLetter = (num: number): string => {
      let n = num, s = '';
      while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
      return s || 'A';
    };
    const endCol = toColumnLetter(totalCols);
    await ensureSheetCapacity(spreadsheetId, targetName, Math.max(1, totalRows), endCol);

    // Write structured values starting at A1
    // Normalize and sanitize headers: ensure non-empty and unique
    const seen = new Set<string>();
    const safeHeader = (h: string, idx: number) => {
      const base = (h || '').toString().trim() || `Column ${idx + 1}`;
      let name = base;
      let i = 2;
      while (seen.has(name)) { name = `${base} ${i++}`; }
      seen.add(name);
      return name;
    };

    const normalizedHeaders = converted.headers.map((h, i) => safeHeader(String(h ?? ''), i));
    const width = normalizedHeaders.length;
    const normalizedRows = (converted.rows || []).map(r => {
      const row = Array.isArray(r) ? r.map(v => (v == null ? '' : String(v))) : [];
      const shaped = row.slice(0, width);
      while (shaped.length < width) shaped.push('');
      return shaped;
    });

    const values = [normalizedHeaders, ...normalizedRows];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${targetName.replace(/'/g, "''")}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values }
    });
    return res.status(200).json({ success: true, newSheetName: targetName, rows: normalizedRows.length, warning: sourceReadWarning });
  } catch (e) {
    return res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
}

// Bulk update a numeric column across all rows (add/subtract/multiply/divide/set)
async function handleBulkUpdateColumn(args: ToolArgs, context: Context, res: NextApiResponse) {
  try {
    const { spreadsheetId, sheetNames } = context;
    const { column, operation, amount, value } = (args || {}) as {
      column?: string;
      operation?: 'add' | 'subtract' | 'multiply' | 'divide' | 'set';
      amount?: number;
      value?: number | string;
    };

    if (!spreadsheetId || !Array.isArray(sheetNames) || sheetNames.length === 0) {
      return res.status(400).json({ success: false, error: 'Spreadsheet ID and at least one sheet name are required' });
    }
    if (!column || !operation || (operation === 'set' ? value == null : typeof amount !== 'number')) {
      return res.status(400).json({ success: false, error: 'column, operation and amount/value are required' });
    }

    const sheets = await getGoogleSheetsClient();
    const updates: Array<{ sheetName: string; cell: string; value: string | number }> = [];
    const perSheetSummary: Array<{ sheet: string; updatedCells: number; targetHeader: string }> = [];

    const toLetters = (num: number): string => {
      let n = num, s = '';
      while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor(n / 26); }
      return s || 'A';
    };

    for (const sheetName of sheetNames) {
      const escaped = sheetName.includes(' ')? `'${sheetName.replace(/'/g, "''")}'`: sheetName;
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${escaped}!A1:T2000`,
        valueRenderOption: 'FORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING'
      });
      const values = (resp.data.values || []) as string[][];
      if (!values.length) { perSheetSummary.push({ sheet: sheetName, updatedCells: 0, targetHeader: String(column) }); continue; }

      const headers = values[0] || [];
      // Resolve target column index: accept letter like "C" or fuzzy header name
      let colIdx = -1;
      const letterMatch = typeof column === 'string' ? column.trim().match(/^[A-Z]+$/i) : null;
      if (letterMatch) {
        colIdx = column.toUpperCase().split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
      } else {
        colIdx = pickHeaderIndex(headers, String(column));
      }
      if (colIdx < 0 || colIdx >= headers.length) {
        return res.status(404).json({ success: false, error: `Column not found in "${sheetName}": ${column}` });
      }
      const targetHeader = headers[colIdx] || `Column ${colIdx + 1}`;

      let updatedCells = 0;
      for (let r = 1; r < values.length; r++) {
        const row = values[r] || [];
        const raw = row[colIdx];
        const cell = `${toLetters(colIdx + 1)}${r + 1}`;

        if (operation === 'set') {
          updates.push({ sheetName, cell, value: value as any });
          updatedCells++;
          continue;
        }

        const num = raw == null ? NaN : parseFloat(String(raw).replace(/[\,\s]/g, ''));
        if (!Number.isFinite(num)) continue;

        let next: number | null = null;
        switch (operation) {
          case 'add': next = num + (amount as number); break;
          case 'subtract': next = num - (amount as number); break;
          case 'multiply': next = num * (amount as number); break;
          case 'divide':
            if (!amount || amount === 0) next = null; else next = num / amount; break;
          default: next = null;
        }
        if (next == null) continue;
        updates.push({ sheetName, cell, value: Number(next.toFixed(6)) });
        updatedCells++;
      }

      perSheetSummary.push({ sheet: sheetName, updatedCells, targetHeader });
    }

    if (updates.length === 0) {
      return res.status(200).json({ success: true, result: 'No numeric cells to update', details: { perSheetSummary } });
    }

    const updateResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/save-sheet-data-multi`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spreadsheetId, updates })
    });
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Batch update failed: ${updateResponse.status} - ${errorText}`);
    }

    const total = perSheetSummary.reduce((a, b) => a + b.updatedCells, 0);
    return res.status(200).json({ success: true, result: `Updated ${total} cell(s) across ${perSheetSummary.length} sheet(s).`, details: { perSheetSummary } });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Failed to bulk update column', details: e instanceof Error ? e.message : String(e) });
  }
}

// Helper to pick a header index by fuzzy match
function pickHeaderIndex(headers: string[], query: string): number {
  const q = (query || '').toLowerCase().trim();
  if (!q) return -1;
  let best = -1;
  let bestScore = 0;
  headers.forEach((h, i) => {
    const hn = (h || '').toLowerCase();
    let score = 0;
    if (hn === q) score += 4;
    if (hn.includes(q)) score += Math.min(q.length, 3);
    // token overlap
    const qParts = q.split(/\s+/).filter(Boolean);
    qParts.forEach(p => { if (p.length >= 3 && hn.includes(p)) score += 1; });
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

async function handleGetSheetStats(args: ToolArgs, res: NextApiResponse) {
  try {
    const { spreadsheetId, sheetName } = args as any;
    if (!spreadsheetId || !sheetName) {
      return res.status(400).json({ success: false, error: 'spreadsheetId and sheetName are required' });
    }

    const sheets = await getGoogleSheetsClient();
    const escaped = sheetName.includes(' ')? `'${sheetName.replace(/'/g, "''")}'`: sheetName;

    // Read a generous range; rely on Sheets API to cap
    const strategies = [
      `${escaped}!A1:T2000`,
      `${escaped}!A:T`,
      `${escaped}!A1:T200`,
      `${escaped}!A1:H100`
    ];
    let values: string[][] = [];
    for (const r of strategies) {
      try {
        const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: r, valueRenderOption: 'FORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' });
        values = (resp.data.values || []) as string[][];
        if (values.length > 0) break;
      } catch { /* try next */ }
    }

    const headers = (values[0] || []) as string[];
    const lastRow = findLastDataRow(values);
    const dataRowCount = Math.max(0, lastRow - 1);
    const columnCount = headers.length;

    return res.status(200).json({
      success: true,
      result: `Sheet "${sheetName}": ${dataRowCount} data row(s), ${columnCount} column(s).`,
      details: { headers, lastDataRow: lastRow, dataRowCount, columnCount }
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Failed to get sheet stats', details: e instanceof Error ? e.message : String(e) });
  }
}

async function handleGetColumnStats(args: ToolArgs, res: NextApiResponse) {
  try {
    const { spreadsheetId, sheetName, column } = args as any;
    if (!spreadsheetId || !sheetName || (!column && column !== 0)) {
      return res.status(400).json({ success: false, error: 'spreadsheetId, sheetName and column are required' });
    }

    const sheets = await getGoogleSheetsClient();
    const escaped = sheetName.includes(' ')? `'${sheetName.replace(/'/g, "''")}'`: sheetName;
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${escaped}!A1:T2000`, valueRenderOption: 'FORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' });
    const values = (resp.data.values || []) as string[][];
    const headers = (values[0] || []) as string[];
    let colIdx: number;
    if (typeof column === 'number') colIdx = column;
    else colIdx = pickHeaderIndex(headers, String(column));
    if (colIdx < 0) {
      return res.status(404).json({ success: false, error: `Column not found: ${column}` });
    }
    const rows = values.slice(1);
    const rawVals = rows.map(r => (r[colIdx] ?? '')).map(v => String(v));
    const nonEmpty = rawVals.filter(v => v.trim() !== '');
    const numVals = nonEmpty.map(v => parseFloat(v.replace(/[\s,]/g, ''))).filter(n => Number.isFinite(n));
    const sum = numVals.reduce((a, b) => a + b, 0);
    const avg = numVals.length ? sum / numVals.length : 0;
    const min = numVals.length ? Math.min(...numVals) : 0;
    const max = numVals.length ? Math.max(...numVals) : 0;
    const uniqueCount = new Set(nonEmpty.map(v => v.toLowerCase())).size;

    const label = headers[colIdx] || `Column ${colIdx + 1}`;
    return res.status(200).json({
      success: true,
      result: `${label}: ${nonEmpty.length} value(s), ${uniqueCount} unique. Sum=${Number(sum.toFixed(2))}, Avg=${Number(avg.toFixed(2))}${numVals.length ? `, Min=${Number(min.toFixed(2))}, Max=${Number(max.toFixed(2))}` : ''}`,
      details: { header: label, count: nonEmpty.length, uniqueCount, sum, avg, min, max }
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Failed to get column stats', details: e instanceof Error ? e.message : String(e) });
  }
}

type ReportSection = {
  title: string;
  charts?: Array<{ kind: 'bar'|'line'|'pie'; title?: string; labels: string[]; datasets: Array<{ label: string; data: number[] }> }>;
  tables?: Array<{ title?: string; headers: string[]; rows: string[][]; footer?: string[]; summary?: string }>;
  insights?: string[];
};

async function handleGenerateReport(args: ToolArgs, context: Context, res: NextApiResponse) {
  try {
    const { spreadsheetId, sheetNames = [] } = context;
    const { responsePrefs } = (args || {}) as any;
    if (!spreadsheetId || !Array.isArray(sheetNames) || sheetNames.length === 0) {
      return res.status(400).json({ success: false, error: 'Spreadsheet ID and at least one sheet name are required' });
    }

    const sheets = await getGoogleSheetsClient();
    const fetchOne = async (name: string): Promise<string[][]> => {
      const escaped = name.includes(' ')? `'${name.replace(/'/g, "''")}'`: name;
      // Try to read a generous range; rely on Sheets to cap
      const range = `${escaped}!A1:T2000`;
      const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range, valueRenderOption: 'FORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' });
      return (resp.data.values || []) as string[][];
    };

    const dataMap: Record<string, string[][]> = {};
    for (const n of sheetNames) {
      try { dataMap[n] = await fetchOne(n); } catch { dataMap[n] = []; }
    }

    // Build sections: per-sheet summary + combined summary
    const sections: ReportSection[] = [];
    let combinedRows: Array<{ sheet: string; row: string[] }> = [];
    for (const [name, table] of Object.entries(dataMap)) {
      if (!table || table.length <= 1) {
        sections.push({ title: `${name}`, tables: [{ headers: ['Info'], rows: [["No data"]] }] });
        continue;
      }
      const headers = table[0];
      const rows = table.slice(1);
      combinedRows.push(...rows.map(r => ({ sheet: name, row: r })));

      // Simple stats: count, numeric sum of first numeric column
      const numericIdx = headers.findIndex((_, i) => rows.some(r => !isNaN(parseFloat(String(r[i]).replace(/[,\s]/g, '')))));
      let sum = 0; let cnt = 0;
      if (numericIdx >= 0) {
        rows.forEach(r => { const n = parseFloat(String(r[numericIdx]).replace(/[,\s]/g, '')); if (!isNaN(n)) { sum += n; cnt++; } });
      }

      const tables = [
        { title: `${name} · Overview`, headers, rows: rows.slice(-5) }
      ];
      const insights: string[] = [];
      if (numericIdx >= 0 && cnt > 0) insights.push(`Sum(${headers[numericIdx]}): ${Number(sum.toFixed(2))} over ${cnt} numeric row(s)`);

      // Optional tiny chart from last 10 numeric points
      const charts = (responsePrefs?.charts && numericIdx >= 0)
        ? [{ kind: 'line' as const, title: `${name} · ${headers[numericIdx]} (last 10)`, labels: rows.slice(-10).map((_, i) => String(i + 1)), datasets: [{ label: headers[numericIdx], data: rows.slice(-10).map(r => parseFloat(String(r[numericIdx]).replace(/[,\s]/g, '')) || 0) }] }]
        : undefined;

      sections.push({ title: name, tables, insights, charts });
    }

    // Combined section (best-effort)
    if (combinedRows.length > 0) {
      const firstTable = dataMap[sheetNames[0]] || [];
      const headers = firstTable[0] || [];
      const rowsOut = combinedRows.slice(-10).map(x => x.row.slice(0, Math.max(1, headers.length)));
      sections.unshift({ title: 'Combined overview', tables: [{ headers, rows: rowsOut, summary: `Merged last ${rowsOut.length} rows across ${sheetNames.length} sheet(s)` }] });
    }

    // Return a structured payload suitable for a dedicated page
    return res.status(200).json({ success: true, report: { spreadsheetId, sheetNames, sections } });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Failed to generate report', details: e instanceof Error ? e.message : String(e) });
  }
}

function formatAnalysesAsMarkdown(analyses: Array<{ index: number; type: string; analysis: unknown; success: boolean; error?: string; extractedData?: unknown }>): string {
  if (!analyses || analyses.length === 0) {
    return "No analysis results to display.";
  }

  let markdown = "| File | Type | Analysis | Extracted Data |\n";
  markdown += "|---|---|---|---|\n";

  for (const analysis of analyses) {
    const extractedData = analysis.extractedData ? `\`\`\`json\n${JSON.stringify(analysis.extractedData, null, 2)}\n\`\`\`` : "None";
    markdown += `| ${analysis.index} | ${analysis.type} | ${analysis.analysis} | ${extractedData} |\n`;
  }

  return markdown;
}

async function handleUpdateSheet(args: ToolArgs, context: Context, res: NextApiResponse) {
  try {
    const { transcript, preview } = args;
    const { spreadsheetId } = context;
    // Resolve sheet selection with sensible fallbacks
    const providedList = Array.isArray((context as any).sheetNames) ? ((context as any).sheetNames as string[]) : [];
    const fallbackSingle = typeof (context as any).sheetName === 'string' && (context as any).sheetName.trim() ? [(context as any).sheetName as string] : [];
    const allSheetNames = Array.isArray((context as any).allSheetNames) ? ((context as any).allSheetNames as string[]) : [];
    const resolvedSheetNames = providedList.length > 0
      ? providedList
      : (fallbackSingle.length > 0
        ? fallbackSingle
        : (allSheetNames.length > 0 ? [allSheetNames[0]] : []));

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required for sheet updates'
      });
    }

    if (!spreadsheetId || !Array.isArray(resolvedSheetNames) || resolvedSheetNames.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Spreadsheet ID and at least one sheet name are required'
      });
    }

    const allUpdates: SheetAction[] = [];
    let totalExecuted = 0;
    for (const sheetName of resolvedSheetNames) {
      console.log(`Processing updates for sheet: ${sheetName}`);
      const result = await updateSheetFlow({
        transcript,
        sheetId: spreadsheetId,
        sheetName: sheetName,
        commit: !preview // Only commit if not in preview mode
      });

      if (result && Array.isArray((result as any).actions) && (result as any).actions.length > 0) {
        // Only convert concrete cell updates here; row inserts are already handled inside the flow when commit=true
        const updatesForSheet = (result as any).actions
          .filter((a: any) => a.type === 'updateCell')
          .map((action: any) => {
          // Validate that the AI is using the correct sheet name
          if (action.sheet && action.sheet !== sheetName) {
            console.warn(`AI returned sheet name "${action.sheet}" but expected "${sheetName}". Using expected sheet name.`);
          }
          return {
            sheetName: sheetName, // Always use the expected sheet name from the loop
            cell: `${action.column}${action.row}`,
            value: action.value,
            row: action.row,
            column: action.column
          };
          });
        allUpdates.push(...updatesForSheet);
      }

      // Track how many actions the flow executed when commit=true
      if (!preview && typeof (result as any)?.executedActions === 'number') {
        totalExecuted += (result as any).executedActions;
      }
    }

    if (allUpdates.length > 0) {
      if (preview) {
        // Return preview data without actually updating
        return res.status(200).json({
          success: true,
          result: `Preview: ${allUpdates.length} cells would be updated across ${resolvedSheetNames.length} sheet(s).`,
          actions: allUpdates,
          preview: true,
          // pass through any flow-generated preview for confidence display
          flowPreview: undefined
        });
      } else {
        // The flow already executed updates (commit=true). Avoid double-applying.
        const message = totalExecuted > 0
          ? `Successfully executed ${totalExecuted} action(s) across ${resolvedSheetNames.length} sheet(s).`
          : `Successfully applied updates across ${resolvedSheetNames.length} sheet(s).`;
        return res.status(200).json({
          success: true,
          result: message,
          actions: allUpdates
        });
      }
    } else {
      return res.status(200).json({
        success: true,
        result: 'No updates were needed based on the transcript',
        actions: []
      });
    }
  } catch (error) {
    console.error('Sheet update error:', error);
    return res.status(500).json({
      success: false,
      error: 'Sheet update failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

async function handleGetSheetData(args: ToolArgs, res: NextApiResponse) {
  try {
    const { spreadsheetId, sheetName } = args;

    if (!spreadsheetId || !sheetName) {
      return res.status(400).json({
        success: false,
        error: 'Spreadsheet ID and sheet name are required'
      });
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/get-sheet-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId, sheetName })
    });

    if (response.ok) {
      try {
        const data = await response.json();
        return res.status(200).json({
          success: true,
          result: `Retrieved ${data.data?.length || 0} rows from ${sheetName}`,
          data: data.data || []
        });
      } catch (parseError) {
        console.error('Failed to parse sheet data response as JSON:', parseError);
        return res.status(500).json({
          success: false,
          error: 'Failed to parse sheet data response'
        });
      }
    } else {
      const errorText = await response.text();
      console.error('Get sheet data API error:', errorText);
      let details = errorText;
      if (errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
        details = 'Received HTML error page from internal API. Check server logs for details.';
      }
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve sheet data',
        details: details
      });
    }

  } catch (error) {
    console.error('Get sheet data error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get sheet data',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

async function handleAnalyzeVoiceInput(args: ToolArgs, res: NextApiResponse) {
  try {
    const { transcript } = args;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required for analysis'
      });
    }

    const analysis = {
      intent: 'unknown',
      entities: [] as string[],
      confidence: 0.5,
      suggestedActions: [] as string[]
    };

    const lowerTranscript = transcript.toLowerCase();

    if (lowerTranscript.includes('add') || lowerTranscript.includes('insert') || lowerTranscript.includes('new')) {
      analysis.intent = 'add_data';
      analysis.confidence = 0.8;
      analysis.suggestedActions.push('Use update_sheet tool to add new data');
    } else if (lowerTranscript.includes('update') || lowerTranscript.includes('change') || lowerTranscript.includes('modify')) {
      analysis.intent = 'update_data';
      analysis.confidence = 0.8;
      analysis.suggestedActions.push('Use update_sheet tool to modify existing data');
    } else if (lowerTranscript.includes('delete') || lowerTranscript.includes('remove')) {
      analysis.intent = 'delete_data';
      analysis.confidence = 0.7;
      analysis.suggestedActions.push('Use update_sheet tool to remove data');
    } else if (lowerTranscript.includes('show') || lowerTranscript.includes('get') || lowerTranscript.includes('display')) {
      analysis.intent = 'get_data';
      analysis.confidence = 0.7;
      analysis.suggestedActions.push('Use get_sheet_data tool to retrieve information');
    }

    return res.status(200).json({
      success: true,
      result: `Analyzed voice input: Intent=${analysis.intent}, Confidence=${analysis.confidence}`,
      analysis
    });

  } catch (error) {
    console.error('Voice analysis error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to analyze voice input',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

async function handleAnalyzeImages(args: ToolArgs, images: ImageData[], apiKey: string, res: NextApiResponse) {
  try {
    const { transcript } = args;

    console.log(`🔍 [ANALYZE_IMAGES] Received ${images?.length || 0} images`);
    console.log(`🔍 [ANALYZE_IMAGES] Args:`, args);

    if (!images || images.length === 0) {
      console.log(`❌ [ANALYZE_IMAGES] No files provided`);
      return res.status(400).json({
        success: false,
        error: 'Files are required for analysis'
      });
    }

    console.log(`Analyzing ${images.length} images/files`);

    const analysisResults: Array<{
      index: number;
      type: string;
      analysis: string;
      success: boolean;
      error?: string;
      extractedData?: unknown;
    }> = [];

    await Promise.allSettled(images.map(async (image, idx) => {
      try {
        const flow = analyzeFileFlow(apiKey);
        const result = await flow.run({ prompt: transcript || 'Analyze this file', files: [image] });
        analysisResults.push({
          index: idx + 1,
          type: image.mimeType,
          analysis: 'Analysis complete',
          success: true,
          extractedData: result
        });
      } catch (error) {
        console.error(`Error analyzing image ${idx + 1}:`, error);
        let errorMessage = 'Analysis failed';
        if (error instanceof Error) {
          if (error.message.includes('503') || error.message.includes('overloaded')) {
            errorMessage = 'The AI service is currently busy. Please try again in a few moments.';
          } else if (error.message.includes('429') || error.message.includes('rate limit')) {
            errorMessage = 'Too many requests to the AI service. Please wait a moment and try again.';
          } else if (error.message.includes('quota exceeded')) {
            errorMessage = 'AI service quota exceeded. Please check your API key limits.';
          } else {
            errorMessage = error.message;
          }
        }
        
        analysisResults.push({
          index: idx + 1,
          type: image.mimeType,
          analysis: 'Analysis failed',
          success: false,
          error: errorMessage
        });
      }
    }));

    const successfulAnalyses = analysisResults.filter(result => !result.error).length;
    const summary = `Successfully analyzed ${successfulAnalyses} out of ${images.length} ${images.length === 1 ? 'file' : 'files'}`;

    return res.status(200).json({
      success: true,
      result: summary + "\n\n" + formatAnalysesAsMarkdown(analysisResults),
      analyses: analysisResults,
      summary: {
        total: images.length,
        successful: successfulAnalyses,
        failed: images.length - successfulAnalyses,
        types: Array.from(new Set(images.map(img => img.mimeType)))
      }
    });

  } catch (error) {
    console.error('Image analysis error:', error);
    
    // Provide user-friendly error messages
    let errorMessage = 'Failed to analyze images';
    if (error instanceof Error) {
      if (error.message.includes('503') || error.message.includes('overloaded')) {
        errorMessage = 'The AI service is currently busy. Please try again in a few moments.';
      } else if (error.message.includes('429') || error.message.includes('rate limit')) {
        errorMessage = 'Too many requests to the AI service. Please wait a moment and try again.';
      } else {
        errorMessage = error.message;
      }
    }
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

async function handleExtractDataFromImages(args: ToolArgs, context: Context, images: ImageData[], apiKey: string, res: NextApiResponse) {
  try {
    const { transcript } = args;
    const { spreadsheetId, sheetName, sheetNames } = context;

    if (!images || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Files are required for data extraction'
      });
    }

    // Handle both sheetName (singular) and sheetNames (plural) for backward compatibility
    const targetSheetName = sheetName || (Array.isArray(sheetNames) && sheetNames.length > 0 ? sheetNames[0] : null);

    if (!spreadsheetId || (!targetSheetName && (!Array.isArray(sheetNames) || sheetNames.length === 0))) {
      console.error('Missing context:', { spreadsheetId, sheetName, sheetNames, targetSheetName });
      return res.status(400).json({
        success: false,
        error: 'Spreadsheet ID and at least one sheet name are required for data extraction',
        details: {
          provided: {
            spreadsheetId: !!spreadsheetId,
            sheetName: !!sheetName,
            sheetNames: Array.isArray(sheetNames) ? sheetNames.length : 0
          },
          resolved: {
            targetSheetName: !!targetSheetName
          }
        }
      });
    }

    console.log(`Extracting data from ${images.length} images/files for ${targetSheetName}`);

    // First, analyze the files to extract data
    const analysisResults: Array<{
      index: number;
      type: string;
      analysis: unknown;
      success: boolean;
      error?: string;
      extractedData?: unknown;
    }> = [];
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      
      try {
        console.log(`Analyzing file ${i + 1}: ${image.mimeType}`);
        
        // Use the analyzeFileFlow to extract data from the file
        const flow = analyzeFileFlow(apiKey);
        const result = await flow.run({ 
          prompt: transcript || 'Extract all relevant data from this file that could be added to a spreadsheet',
          files: [image]
        });
        
        analysisResults.push({
          index: i + 1,
          type: image.mimeType,
          analysis: result,
          success: true
        });
        
      } catch (analysisError) {
        console.error(`Error analyzing file ${i + 1}:`, analysisError);
        
        // Provide user-friendly error messages for common AI service issues
        let errorMessage = 'Unknown error during analysis';
        if (analysisError instanceof Error) {
          if (analysisError.message.includes('503') || analysisError.message.includes('overloaded')) {
            errorMessage = 'The AI service is currently busy. Please try again in a few moments.';
          } else if (analysisError.message.includes('429') || analysisError.message.includes('rate limit')) {
            errorMessage = 'Too many requests to the AI service. Please wait a moment and try again.';
          } else if (analysisError.message.includes('quota exceeded')) {
            errorMessage = 'AI service quota exceeded. Please check your API key limits.';
          } else {
            errorMessage = analysisError.message;
          }
        }
        
        analysisResults.push({
          index: i + 1,
          type: image.mimeType,
          analysis: null,
          success: false,
          error: errorMessage
        });
      }
    }

    // Check if any analysis succeeded
    const successfulAnalyses = analysisResults.filter(result => result.success);
    if (successfulAnalyses.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to analyze any files',
        details: 'All file analysis attempts failed. This may be due to AI service issues or unsupported file types.',
        analysisResults
      });
    }

    // Now use the updateSheetFlow to process the extracted data and update the sheet
    try {
      console.log('Processing extracted data with updateSheetFlow...');
      
      // Prefer structured rows if present; otherwise fallback to transcript method
      const extractedRows = analysisResults
        .map(r => (r.analysis as any)?.extracted_rows)
        .filter(Boolean)
        .flat();
      let updateResult: any;
      if (Array.isArray(extractedRows) && extractedRows.length > 0) {
        const selectedNames = Array.isArray(sheetNames) && sheetNames.length > 0 ? sheetNames : [targetSheetName!];
        // Dry-run first for preview and safety
        const dryRunResp = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/ingest-rows`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spreadsheetId, sheetNames: selectedNames, rows: extractedRows, dryRun: true })
        });
        if (!dryRunResp.ok) {
          const txt = await dryRunResp.text();
          throw new Error(`ingest-rows dryRun failed: ${dryRunResp.status} - ${txt}`);
        }
        const preview = await dryRunResp.json();
        // Commit
        const commitResp = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/ingest-rows`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spreadsheetId, sheetNames: selectedNames, rows: extractedRows, dryRun: false })
        });
        if (!commitResp.ok) {
          const txt = await commitResp.text();
          throw new Error(`ingest-rows commit failed: ${commitResp.status} - ${txt}`);
        }
        const committed = await commitResp.json();
        updateResult = { ingestPreview: preview, ingestCommitted: committed };
      } else {
        // Fallback: combine as transcript and let updateSheetFlow infer actions
        const extractedData = analysisResults
          .filter(result => result.success && result.analysis)
          .map(result => {
            if (typeof result.analysis === 'string') return result.analysis;
            if (result.analysis && typeof result.analysis === 'object') return JSON.stringify(result.analysis);
            return '';
          })
          .join('\n\n');
        const enhancedTranscript = `${transcript || 'Add the following data to the spreadsheet'}\n\nIMPORTANT: The extracted data contains multiple entries. Please create a separate row for each entry in the data.\n\nExtracted data:\n${extractedData}`;
        updateResult = await updateSheetFlow({ transcript: enhancedTranscript, sheetId: spreadsheetId, sheetName: targetSheetName, commit: false });
      }

      console.log('UpdateSheetFlow (no-commit) result:', updateResult);
      // If routed via ingestion, return that result and avoid manual A1 operations
      if (updateResult && (updateResult as any).ingestCommitted) {
        return res.status(200).json({
          success: true,
          result: `Successfully processed extracted rows via centralized ingestion for ${targetSheetName}.`,
          details: { filesProcessed: images.length, successfulAnalyses: successfulAnalyses.length, analysisResults, updateResult }
        });
      }

      // Fallback path (when we built actions via updateSheetFlow): keep existing behavior
      const actions = Array.isArray(updateResult?.actions) ? updateResult.actions : [];
      const insertRowActions = actions.filter((a: any) => a.type === 'insertRow');
      if (insertRowActions.length > 0) {
        try {
          const sheets = await getGoogleSheetsClient();
          const sheetMetadata = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false });
          const target = sheetMetadata.data.sheets?.find(s => s.properties?.title === targetSheetName);
          if (target?.properties?.sheetId == null) throw new Error(`Sheet ${targetSheetName} not found`);
          const internalSheetId = target.properties.sheetId;
          const sorted = [...insertRowActions].sort((a, b) => a.row - b.row);
          const requests = sorted.map(a => ({ insertRange: { range: { sheetId: internalSheetId, startRowIndex: a.row - 1, endRowIndex: a.row, startColumnIndex: 0, endColumnIndex: 0 }, shiftDimension: 'ROWS' } }));
          await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
        } catch (e) {
          console.warn('Batch insert rows failed:', e);
        }
      }

      let updates = actions.filter((a: any) => a.type === 'updateCell').map((a: any) => ({ sheetName: targetSheetName, cell: `${a.column}${a.row}`, value: a.value ?? '' }));
      if (updates.length === 0) {
        return res.status(200).json({ success: true, result: `Extracted data from ${successfulAnalyses.length} file(s), but no actionable updates were generated for ${targetSheetName}.`, details: { filesProcessed: images.length, successfulAnalyses: successfulAnalyses.length, analysisResults } });
      }
      const updateResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/save-sheet-data-multi`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spreadsheetId, updates }) });
      if (!updateResponse.ok) { const errorText = await updateResponse.text(); throw new Error(`Batch update failed: ${updateResponse.status} - ${errorText}`); }
      const updateSummary = await updateResponse.json();
      return res.status(200).json({ success: true, result: `Successfully extracted data from ${successfulAnalyses.length} out of ${images.length} file(s) and applied ${updates.length} updates to ${targetSheetName}.`, details: { filesProcessed: images.length, successfulAnalyses: successfulAnalyses.length, analysisResults, updateSummary } });
      
    } catch (updateError) {
      console.error('Error updating sheet with extracted data:', updateError);
      
      // Provide user-friendly error messages for update failures
      let errorMessage = 'Failed to update sheet with extracted data';
      if (updateError instanceof Error) {
        if (updateError.message.includes('503') || updateError.message.includes('overloaded')) {
          errorMessage = 'The AI service is currently busy. Please try again in a few moments.';
        } else if (updateError.message.includes('429') || updateError.message.includes('rate limit')) {
          errorMessage = 'Too many requests to the AI service. Please wait a moment and try again.';
        } else {
          errorMessage = updateError.message;
        }
      }
      
      return res.status(500).json({
        success: false,
        error: errorMessage,
        details: updateError instanceof Error ? updateError.message : String(updateError),
        analysisResults // Still return the analysis results even if update failed
      });
    }

  } catch (error) {
    console.error('Error in handleExtractDataFromImages:', error);
    
    // Provide user-friendly error messages
    let errorMessage = 'Failed to extract data from images';
    if (error instanceof Error) {
      if (error.message.includes('503') || error.message.includes('overloaded')) {
        errorMessage = 'The AI service is currently busy. Please try again in a few moments.';
      } else if (error.message.includes('429') || error.message.includes('rate limit')) {
        errorMessage = 'Too many requests to the AI service. Please wait a moment and try again.';
      } else {
        errorMessage = error.message;
      }
    }
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
      details: error instanceof Error ? error.message : String(error)
    });
  }
} 

async function handleExtractTextOnly(args: ToolArgs, images: ImageData[], res: NextApiResponse) {
  try {
    console.log(`🔍 [EXTRACT_TEXT_ONLY] Received ${images?.length || 0} images`);

    if (!images || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Files are required for text extraction'
      });
    }

    console.log(`Extracting text from ${images.length} images/files`);

    const extractionResults: Array<{
      index: number;
      type: string;
      success: boolean;
      error?: string;
      extractedText?: string;
      textLength?: number;
      structured?: Array<Record<string, unknown>>;
    }> = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      
      try {
        let extractedText = '';
        
        if (image.mimeType === 'application/pdf') {
          console.log(`🔍 [EXTRACT_TEXT_ONLY] Extracting text from PDF...`);
          // Import pdf-parse dynamically
          const pdf = (await import('pdf-parse')).default;
          const buffer = Buffer.from(image.data, 'base64');
          const pdfData = await pdf(buffer);
          extractedText = pdfData.text || 'No text could be extracted from the PDF';
        } else if (image.mimeType.startsWith('image/')) {
          console.log(`🔍 [EXTRACT_TEXT_ONLY] Extracting text from image using OCR...`);
          // Import Tesseract dynamically
          const Tesseract = (await import('tesseract.js')).default;
          const { data: { text } } = await Tesseract.recognize(
            `data:image/jpeg;base64,${image.data}`,
            'eng',
            { logger: m => console.log(m) }
          );
          extractedText = text;
        } else {
          extractedText = 'Unknown file type - cannot extract text';
        }

        // Run lightweight AI structuring on the extracted text
        let structured: Array<Record<string, unknown>> | undefined;
        try {
          const { genkit } = await import('genkit');
          const { googleAI, gemini15Flash } = await import('@genkit-ai/googleai');
          const apiKey = process.env.GOOGLE_GENAI_API_KEY;
          if (apiKey) {
            const ai = genkit({ plugins: [googleAI({ apiKey })], model: gemini15Flash });
            const prompt = `You receive raw text extracted from a user-uploaded file. Extract ALL structured entries relevant for spreadsheet rows and return STRICT JSON as {"extracted_rows": [ ... ]}. Normalize dates and numbers. Raw text:\n\n${extractedText.slice(0, 6000)}`;
            const { text } = await ai.generate(prompt);
            if (text) {
              let cleaned = text.trim();
              if (cleaned.startsWith('```')) cleaned = cleaned.replace(/```json|```/g, '').trim();
              const parsed = JSON.parse(cleaned);
              if (parsed && Array.isArray(parsed.extracted_rows)) structured = parsed.extracted_rows as Array<Record<string, unknown>>;
            }
          }
        } catch (e) {
          console.warn('Structuring pass skipped:', e);
        }

        extractionResults.push({
          index: i + 1,
          type: image.mimeType,
          success: true,
          extractedText: extractedText,
          textLength: extractedText.length,
          structured
        });

        console.log(`🔍 [EXTRACT_TEXT_ONLY] Extracted ${extractedText.length} characters from file ${i + 1}`);
      } catch (error) {
        console.error(`Error extracting text from file ${i + 1}:`, error);
        
        extractionResults.push({
          index: i + 1,
          type: image.mimeType,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const successfulExtractions = extractionResults.filter(result => result.success).length;
    const summary = `Successfully extracted text from ${successfulExtractions} out of ${images.length} ${images.length === 1 ? 'file' : 'files'}`;

    return res.status(200).json({
      success: true,
      result: summary + "\n\n" + formatExtractionsAsMarkdown(extractionResults),
      extractions: extractionResults,
      summary: {
        total: images.length,
        successful: successfulExtractions,
        failed: images.length - successfulExtractions,
        types: Array.from(new Set(images.map(img => img.mimeType)))
      }
    });

  } catch (error) {
    console.error('Text extraction error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to extract text from files',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

// Apply structured rows through the centralized ingestion endpoint
async function handleApplyStructuredRows(args: ToolArgs, context: Context, res: NextApiResponse) {
  try {
    const { spreadsheetId, sheetNames } = context;
    const { rows, dryRun } = (args || {}) as { rows?: Array<Record<string, unknown>>; dryRun?: boolean };
    if (!spreadsheetId || !Array.isArray(sheetNames) || sheetNames.length === 0) {
      return res.status(400).json({ success: false, error: 'Spreadsheet ID and at least one sheet name are required' });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No structured rows provided' });
    }

    const ingestResp = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/ingest-rows`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spreadsheetId, sheetNames, rows, dryRun: !!dryRun })
    });
    if (!ingestResp.ok) {
      const txt = await ingestResp.text();
      throw new Error(`ingest-rows failed: ${ingestResp.status} - ${txt}`);
    }
    const result = await ingestResp.json();
    return res.status(200).json({ success: true, result: `Ingestion ${result.success ? 'succeeded' : 'failed'}. Inserts=${result.inserts}, Updates=${result.updates}.`, details: result });
  } catch (error) {
    console.error('apply_structured_rows error:', error);
    return res.status(500).json({ success: false, error: 'Failed to apply structured rows', details: error instanceof Error ? error.message : String(error) });
  }
}

function formatExtractionsAsMarkdown(extractions: Array<{ index: number; type: string; success: boolean; error?: string; extractedText?: string; textLength?: number }>): string {
  let markdown = '| File | Type | Status | Text Length |\n|---|---|---|---|\n';
  
  extractions.forEach(extraction => {
    const status = extraction.success ? '✅ Success' : '❌ Failed';
    const textLength = extraction.success ? extraction.textLength || 0 : 'N/A';
    markdown += `| ${extraction.index} | ${extraction.type} | ${status} | ${textLength} |\n`;
  });
  
  return markdown;
} 