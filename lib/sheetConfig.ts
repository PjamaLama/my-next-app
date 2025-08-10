export type SheetKey = { headers: string[]; fuzzy?: boolean };

export type SheetMergePolicy = 'prefer_existing' | 'prefer_new' | 'manual_review';

export type SheetConfig = {
  sheetName: string;
  primaryKeys?: SheetKey[];
  required?: string[];
  types?: Record<string, 'date' | 'number' | 'string' | 'boolean'>;
  synonyms?: Record<string, string[]>;
  crossSheetGroup?: string;
  mergePolicy?: SheetMergePolicy;
};

export type WorkbookConfig = Record<string, SheetConfig>;

// In a fuller implementation, this could load from Firestore or a JSON file per spreadsheetId.
// For now, return a minimal config object that callers can use optionally.
const inMemoryConfigs = new Map<string, WorkbookConfig>();

export function setWorkbookConfig(spreadsheetId: string, config: WorkbookConfig): void {
  inMemoryConfigs.set(spreadsheetId, config);
}

export function getWorkbookConfig(spreadsheetId: string): WorkbookConfig | null {
  return inMemoryConfigs.get(spreadsheetId) ?? null;
}

export function getSheetConfig(spreadsheetId: string, sheetName: string): SheetConfig | null {
  const cfg = inMemoryConfigs.get(spreadsheetId);
  if (!cfg) return null;
  return cfg[sheetName] ?? null;
}


