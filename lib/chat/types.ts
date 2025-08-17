import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

export interface Context {
  spreadsheetId?: string;
  sheetName?: string;
  sheetNames?: string[];
  spreadsheetUrl?: string;
  sheetData?: any;
  conversationHistory?: ConversationHistoryItem[];
  fileAnalysis?: {
    files: Array<{
      mimeType: string;
      extractedData?: unknown;
      timestamp: number;
    }>;
    lastUpdated: number;
  };
  responsePrefs?: {
    charts?: boolean;
    stats?: boolean;
  };
  [key: string]: unknown;
}

export interface ConversationHistoryItem {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface ImageData {
  data: string;
  mimeType: string;
  name?: string;
}

export type StructuredTable = {
  title?: string;
  headers: string[];
  rows: string[][];
  footer?: string[];
  summary?: string;
  meta?: {
    fileIndex?: number;
    fileName?: string;
    combined?: boolean;
    empty?: boolean;
    editable?: boolean;
    buttons?: string[];
    type?: string;
    mappingConfidence?: Record<string, number>;
    unmappedHeaders?: string[];
    originalHeaders?: string[];
    sheetName?: string;
    current?: boolean;
    isDryRun?: boolean;
    totalRows?: number;
    operations?: {
      add: number;
      update: number;
    };
    dryRunContext?: {
      toolName: string;
      dryRun: boolean;
      proposedChanges: Record<string, unknown>;
    };
    requiresConfirmation?: boolean;
  };
};




