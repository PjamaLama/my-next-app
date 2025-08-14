import type { NextApiRequest, NextApiResponse } from 'next';
import { ingestRows } from '@/lib/ingestion/orchestrator';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { spreadsheetId, sheetName, sheetNames, rows, dryRun } = req.body || {};

    // Resolve a single target sheet from either sheetNames[] or sheetName
    const resolvedSheetNames: string[] = Array.isArray(sheetNames) && sheetNames.length > 0
      ? sheetNames
      : (typeof sheetName === 'string' && sheetName.trim() ? [sheetName.trim()] : []);

    if (!spreadsheetId || resolvedSheetNames.length === 0) {
      return res.status(400).json({ error: 'spreadsheetId and a target sheet (sheetName or sheetNames[]) are required' });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows[] is required' });
    }

    // Delegate to orchestrator which dynamically aligns values to headers from the Sheets API
    const result = await ingestRows({ spreadsheetId, sheetNames: resolvedSheetNames, rows, dryRun: !!dryRun });
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to ingest rows' });
  }
}


