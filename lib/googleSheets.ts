import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { createLogger } from '@/lib/logger';
import { setTimeout } from 'timers/promises';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

let cachedSheets: ReturnType<typeof google.sheets> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
// Allow auth timeout to be configured via env; default to 30s to reduce flakiness
const AUTH_TIMEOUT_MS = Number(process.env.GSHEETS_AUTH_TIMEOUT_MS || process.env.GOOGLE_SHEETS_AUTH_TIMEOUT_MS || 30000);

// Rate limiter to prevent quota exhaustion
class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequestsPerMinute: number;
  private readonly maxRequestsPerSecond: number;
  private throttledRequests: number = 0;
  private lastLogTime: number = 0;

  constructor(maxPerMinute: number = 300, maxPerSecond: number = 10) {
    this.maxRequestsPerMinute = maxPerMinute;
    this.maxRequestsPerSecond = maxPerSecond;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();

    // Clean old requests
    this.requests = this.requests.filter(time => now - time < 60000); // Keep last minute

    // Check per-second limit
    const recentRequests = this.requests.filter(time => now - time < 1000);
    if (recentRequests.length >= this.maxRequestsPerSecond) {
      const waitTime = 1000 - (now - recentRequests[0]);
      if (waitTime > 0) {
        this.throttledRequests++;
        await setTimeout(waitTime);
        return this.waitForSlot(); // Recheck after waiting
      }
    }

    // Check per-minute limit
    if (this.requests.length >= this.maxRequestsPerMinute) {
      const waitTime = 60000 - (now - this.requests[0]);
      if (waitTime > 0) {
        this.throttledRequests++;
        await setTimeout(waitTime);
        return this.waitForSlot(); // Recheck after waiting
      }
    }

    this.requests.push(now);

    // Log stats every 5 minutes
    if (now - this.lastLogTime > 300000) {
      this.logStats();
      this.lastLogTime = now;
    }
  }

  private logStats(): void {
    const log = createLogger('lib/googleSheets.RateLimiter');
    const now = Date.now();
    const requestsLastMinute = this.requests.filter(time => now - time < 60000).length;
    const requestsLastSecond = this.requests.filter(time => now - time < 1000).length;

    log.info('Rate limiter stats', {
      totalRequests: this.requests.length,
      requestsLastMinute,
      requestsLastSecond,
      throttledRequests: this.throttledRequests,
      maxPerMinute: this.maxRequestsPerMinute,
      maxPerSecond: this.maxRequestsPerSecond
    });

    // Reset throttled counter
    this.throttledRequests = 0;
  }

  getStats() {
    const now = Date.now();
    return {
      totalRequests: this.requests.length,
      requestsLastMinute: this.requests.filter(time => now - time < 60000).length,
      requestsLastSecond: this.requests.filter(time => now - time < 1000).length,
      throttledRequests: this.throttledRequests,
      maxPerMinute: this.maxRequestsPerMinute,
      maxPerSecond: this.maxRequestsPerSecond
    };
  }
}

export const rateLimiter = new RateLimiter();

// Global cache for sheet metadata to reduce API calls
const SHEET_METADATA_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
type SheetMetadata = {
  sheets: Array<{ properties?: { title?: string; gridProperties?: { rowCount?: number; columnCount?: number } } }>;
  properties?: { title?: string };
  fetchedAt: number;
};
const sheetMetadataCache = new Map<string, SheetMetadata>();

// Get sheet metadata with caching
export const getSheetMetadataCached = async (spreadsheetId: string): Promise<SheetMetadata> => {
  const now = Date.now();
  const cached = sheetMetadataCache.get(spreadsheetId);

  if (cached && (now - cached.fetchedAt) < SHEET_METADATA_CACHE_TTL_MS) {
    return cached;
  }

  // Wait for rate limiter before making API call
  await rateLimiter.waitForSlot();

  const sheets = await getGoogleSheetsClient();
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: false
  });

  const metadata: SheetMetadata = {
    sheets: (response.data.sheets || []).map(sheet => ({
      properties: sheet.properties ? {
        title: sheet.properties.title || undefined,
        gridProperties: sheet.properties.gridProperties ? {
          rowCount: sheet.properties.gridProperties.rowCount || undefined,
          columnCount: sheet.properties.gridProperties.columnCount || undefined
        } : undefined
      } : undefined
    })),
    properties: response.data.properties ? {
      title: response.data.properties.title || undefined
    } : undefined,
    fetchedAt: now
  };

  sheetMetadataCache.set(spreadsheetId, metadata);
  return metadata;
};

// Function to clear caches (useful for debugging or forcing fresh data)
export const clearCaches = (): void => {
  sheetMetadataCache.clear();
  const log = createLogger('lib/googleSheets');
  log.info('Caches cleared');
};

// Helper function to properly format private key from environment variable
const formatPrivateKey = (rawKey: string): string => {
  if (!rawKey) return '';
  
  // Remove any surrounding quotes
  let key = rawKey.trim().replace(/^["']|["']$/g, '');
  
  // Handle various newline formats that can occur when copying from JSON
  // Replace literal \n with actual newlines
  key = key.replace(/\\n/g, '\n');
  
  // If the key doesn't start with -----BEGIN PRIVATE KEY-----,
  // it might be missing the header/footer or have wrong formatting
  if (!key.includes('-----BEGIN PRIVATE KEY-----')) {
    // Try to reconstruct the key if it's just the base64 content
    if (key.length > 100 && !key.includes('-----')) {
      key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
    } else if (key.length < 1000) {
      // Key is too short - this usually means it got truncated
      throw new Error(`Private key appears to be truncated. Expected ~1700+ characters, got ${key.length}. Please check your environment variable.`);
    }
  }
  
  // Validate the key format
  if (!key.includes('-----BEGIN PRIVATE KEY-----') || !key.includes('-----END PRIVATE KEY-----')) {
    throw new Error('Invalid private key format: missing BEGIN/END markers. Please check your environment variable.');
  }
  
  // Check if the key content looks reasonable
  const keyContent = key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '').replace(/\n/g, '');
  if (keyContent.length < 1000) {
    throw new Error(`Private key content appears to be truncated. Expected ~1000+ characters of base64 content, got ${keyContent.length}. Please check your environment variable.`);
  }
  
  return key;
};

export const getGoogleSheetsClient = async (retries = 3) => {
  const log = createLogger('lib/googleSheets');
  // Return cached client if still fresh
  if (cachedSheets && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedSheets;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log.debug(`Attempting Google Sheets authentication (${attempt}/${retries})`);
      
      const rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY;
      const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      
      if (!rawPrivateKey || !serviceAccountEmail) {
        throw new Error('Missing required environment variables: GOOGLE_PRIVATE_KEY or GOOGLE_SERVICE_ACCOUNT_EMAIL');
      }
      
      const formattedPrivateKey = formatPrivateKey(rawPrivateKey);
      
      if (!formattedPrivateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        throw new Error('Invalid private key format: missing BEGIN/END markers');
      }
      
      const client = new JWT({
        email: serviceAccountEmail,
        key: formattedPrivateKey,
        scopes: SCOPES,
      });

      // Add timeout for authorization
      const authPromise = client.authorize();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(AUTH_TIMEOUT_MS).then(() => reject(new Error(`Authentication timeout after ${Math.round(AUTH_TIMEOUT_MS / 1000)} seconds`)))
      );

      await Promise.race([authPromise, timeoutPromise]);
      log.debug(`Google Sheets authentication successful on attempt ${attempt}`);

      const sheets = google.sheets({ version: 'v4', auth: client });
      cachedSheets = sheets;
      cachedAt = Date.now();
      return sheets;
      
    } catch (error) {
      log.warn(`Authentication attempt ${attempt} failed`, error);
      
      // Handle ETIMEDOUT errors specifically with exponential backoff
      if (error instanceof Error && error.message.includes('timeout') && attempt < retries) {
        const backoffTime = 1000 * Math.pow(2, attempt - 1); // Backoff: 1s, 2s, 4s
        log.debug(`Authentication timeout, retrying in ${backoffTime/1000}s...`);
        await setTimeout(backoffTime);
        continue;
      }
      
      if (attempt === retries) {
        log.error(`All ${retries} authentication attempts failed`);
        throw new Error(`Google Sheets authentication failed after ${retries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      // Wait before retrying (exponential backoff)
      const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      log.debug(`Waiting ${waitTime/1000}s before retry...`);
        await setTimeout(waitTime);
    }
  }
  
  throw new Error('This should never be reached');
};

export const normalizeSpreadsheetId = (input: string): string => {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';
  // Try parsing as URL to extract /spreadsheets/d/{ID}
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split('/').filter(Boolean);
    const dIndex = segments.findIndex(seg => seg === 'd');
    if (dIndex !== -1 && segments[dIndex + 1]) {
      return segments[dIndex + 1];
    }
  } catch {
    // Not a full URL, continue
  }
  // Fallback: split on "/d/" if present
  if (trimmed.includes('/d/')) {
    const afterD = trimmed.split('/d/')[1] || '';
    return (afterD.split('/')[0] || '').trim();
  }
  return trimmed;
};

// Lightweight helper to fetch a values range from Google Sheets API
// Retries a couple times to reduce flakiness.
export const getRange = async (
  spreadsheetId: string,
  range: string,
  retries = 2
): Promise<{ values?: any[][] }> => {
  const log = createLogger('lib/googleSheets.getRange');
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= Math.max(1, retries + 1); attempt++) {
    try {
      // Wait for rate limiter before making API call
      await rateLimiter.waitForSlot();

      const sheets = await getGoogleSheetsClient();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        majorDimension: 'ROWS'
      });
      const data = res.data || {};
      return { values: (data as any).values };
    } catch (e) {
      lastErr = e;
      log.warn(`getRange failed (attempt ${attempt}) for ${spreadsheetId} ${range}`, e as any);

      // Check if it's a quota exceeded error
      if (e instanceof Error && e.message.includes('quota')) {
        log.warn('Quota exceeded detected, waiting longer before retry');
        // Wait longer for quota issues
        await setTimeout(5000);
      }

      if (attempt < Math.max(1, retries + 1)) {
        const backoff = attempt * 500;
        await setTimeout(backoff);
      }
    }
  }
  log.error('getRange ultimately failed', lastErr as any);
  throw new Error(`Failed to fetch range ${range}`);
};

// Efficient helper to fetch multiple ranges in a single batch request
export const getBatchRanges = async (
  spreadsheetId: string,
  ranges: string[],
  retries = 2
): Promise<{ [range: string]: any[][] }> => {
  const log = createLogger('lib/googleSheets.getBatchRanges');

  if (ranges.length === 0) return {};
  if (ranges.length === 1) {
    // Single range - use regular getRange for consistency
    const result = await getRange(spreadsheetId, ranges[0], retries);
    return { [ranges[0]]: result.values || [] };
  }

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= Math.max(1, retries + 1); attempt++) {
    try {
      // Wait for rate limiter before making API call
      await rateLimiter.waitForSlot();

      const sheets = await getGoogleSheetsClient();
      const res = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
        majorDimension: 'ROWS'
      });

      const result: { [range: string]: any[][] } = {};
      ranges.forEach((range, index) => {
        const data = res.data.valueRanges?.[index];
        result[range] = data?.values || [];
      });

      return result;
    } catch (e) {
      lastErr = e;
      log.warn(`getBatchRanges failed (attempt ${attempt}) for ${spreadsheetId}`, e as any);

      // Check if it's a quota exceeded error
      if (e instanceof Error && e.message.includes('quota')) {
        log.warn('Quota exceeded detected, waiting longer before retry');
        await setTimeout(5000);
      }

      if (attempt < Math.max(1, retries + 1)) {
        const backoff = attempt * 500;
        await setTimeout(backoff);
      }
    }
  }
  log.error('getBatchRanges ultimately failed', lastErr as any);
  throw new Error(`Failed to fetch batch ranges`);
};

// Optimized helper to get sheet metadata and data efficiently
export const getSheetDataEfficiently = async (
  spreadsheetId: string,
  sheetName: string,
  options: {
    maxRows?: number;
    includeHeaders?: boolean;
    tailRows?: number;
  } = {}
): Promise<{
  data: string[][];
  headers?: string[];
  rowCount: number;
  columnCount: number;
}> => {
  const log = createLogger('lib/googleSheets.getSheetDataEfficiently');
  const { maxRows = 1000, includeHeaders = true, tailRows } = options;

  // Get sheet metadata from cache
  const metadata = await getSheetMetadataCached(spreadsheetId);

  const sheet = metadata.sheets.find(s => s.properties?.title === sheetName);
  if (!sheet?.properties?.gridProperties) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }

  const gridProps = sheet.properties.gridProperties;
  const rowCount = gridProps.rowCount || 1000;
  const columnCount = gridProps.columnCount || 26;

  // Convert column count to letter
  const getColumnLetter = (num: number) => {
    let result = '';
    while (num > 0) {
      num--;
      result = String.fromCharCode(65 + (num % 26)) + result;
      num = Math.floor(num / 26);
    }
    return result;
  };

  const endColumn = getColumnLetter(columnCount);
  const escapedSheetName = sheetName.replace(/'/g, "''");

  let dataRange: string;
  let headerRange: string | undefined;

  if (tailRows && tailRows > 0) {
    // Get tail rows
    const startRow = Math.max(1, rowCount - tailRows + 1);
    dataRange = `'${escapedSheetName}'!A${startRow}:${endColumn}${rowCount}`;
    headerRange = includeHeaders ? `'${escapedSheetName}'!A1:${endColumn}1` : undefined;
  } else {
    // Get all data up to maxRows
    const endRow = Math.min(rowCount, maxRows);
    dataRange = `'${escapedSheetName}'!A1:${endColumn}${endRow}`;
    headerRange = undefined; // Headers are included in the data range
  }

  const ranges = headerRange ? [dataRange, headerRange] : [dataRange];

  // Batch request both ranges if needed
  const batchResult = await getBatchRanges(spreadsheetId, ranges);

  const dataValues = batchResult[dataRange] || [];
  const headerValues = headerRange ? batchResult[headerRange]?.[0] || [] : (dataValues.length > 0 ? dataValues[0] : []);

  // Remove header from data if we have separate header request
  let finalData = dataValues;
  let headers = headerValues;

  if (tailRows && includeHeaders && dataValues.length > 0) {
    // For tail requests, we need to prepend headers
    finalData = [headers, ...dataValues];
  } else if (!tailRows && includeHeaders && dataValues.length > 0) {
    // For full requests, headers are already first row
    headers = dataValues[0] || [];
    finalData = dataValues;
  }

  return {
    data: finalData,
    headers: includeHeaders ? headers : undefined,
    rowCount,
    columnCount
  };
};