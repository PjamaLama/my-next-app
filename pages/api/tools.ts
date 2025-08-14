import { NextApiRequest, NextApiResponse } from 'next';

// Cleaned up unused tools for leaner API.
const TOOL_REGISTRY = [
  { name: 'apply_structured_rows', label: 'Apply Structured Rows', description: 'Apply already-structured rows into selected sheets using orchestrated ingest.' },
  { name: 'sheet_query', label: 'Sheet Query', description: 'Query a sheet range and return headers/rows for previews or insights.' },
  { name: 'describe_sheet', label: 'Describe Sheet', description: 'Summarize the current sheet with notable columns and row counts.' },
  { name: 'aggregate', label: 'Aggregate', description: 'Compute aggregates (sum, avg, count, group-by) over a column.' },
  { name: 'trend_analysis', label: 'Trend Analysis', description: 'Analyze time series trends and report direction and slope.' },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return res.status(200).json({ tools: TOOL_REGISTRY });
}


