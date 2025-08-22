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
      if (attempt < Math.max(1, retries + 1)) {
        const backoff = attempt * 500;
        await setTimeout(backoff);
      }
    }
  }
  log.error('getRange ultimately failed', lastErr as any);
  throw new Error(`Failed to fetch range ${range}`);
};