import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

export interface Context {
  spreadsheetId?: string;
  sheetName?: string;
  sheetNames?: string[];
  spreadsheetUrl?: string;
  sheetData?: any;
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
  };
};

export type ChartSpec = {
  kind: 'bar' | 'line' | 'pie';
  title?: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
  options?: Record<string, unknown>;
  meta?: {
    sheetName?: string;
    metricHeader?: string;
    groupByHeader?: string;
    dateHeader?: string;
  };
};


