import type { NextApiRequest, NextApiResponse } from 'next';
import { ingestRows } from '@/lib/ingestion/orchestrator';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { spreadsheetId, sheetNames, rows, dryRun } = req.body || {};
    if (!spreadsheetId || !Array.isArray(sheetNames) || sheetNames.length === 0) {
      return res.status(400).json({ error: 'spreadsheetId and sheetNames[] are required' });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows[] is required' });
    }
    const result = await ingestRows({ spreadsheetId, sheetNames, rows, dryRun: !!dryRun });
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to ingest rows' });
  }
}


