import { normalizeSpreadsheetId, getSheetMetadataCached, clearCaches } from '../../lib/googleSheets';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Support both GET (?spreadsheetId=) and POST ({ spreadsheetId })
  const spreadsheetIdParam =
    (req.method === 'GET' ? req.query.spreadsheetId : (req.body?.spreadsheetId as string | undefined)) ||
    (req.query.spreadsheetId as string | undefined);

  // Check for force refresh parameter
  const forceRefreshParam = req.method === 'GET' ? req.query.forceRefresh : req.body?.forceRefresh;
  const forceRefresh = forceRefreshParam === true || forceRefreshParam === 'true';

  if (!spreadsheetIdParam || typeof spreadsheetIdParam !== 'string') {
    return res.status(400).json({ error: 'Spreadsheet ID is required' });
  }

  try {
    const spreadsheetId = normalizeSpreadsheetId(spreadsheetIdParam);

    // Clear cache if force refresh is requested
    if (forceRefresh) {
      clearCaches();
    }

    const metadata = await getSheetMetadataCached(spreadsheetId);

    const sheetNames = metadata.sheets.map(s => s.properties?.title || '').filter(Boolean) || [];
    const spreadsheetTitle = metadata.properties?.title;

    return res.status(200).json({ sheetNames, spreadsheetTitle });
  } catch (error: unknown) {
    const gaxiosMessage = (error as any)?.response?.data?.error?.message as string | undefined;
    const message = gaxiosMessage || (error as any)?.message || 'Failed to fetch sheet names';
    console.error('Error fetching sheet names:', error);

    if (typeof message === 'string') {
      if (message.includes('This operation is not supported for this document')) {
        return res.status(400).json({
          error: 'The provided ID is not a Google Sheet.',
          details: message,
          hint:
            'Open the Google Sheet in your browser and copy the ID from the URL between /d/ and /edit. If this is an Excel file, open it in Google Sheets and save as a Google Sheet first.'
        });
      }

      if (message.includes('Requested entity was not found')) {
        return res.status(404).json({
          error: 'Spreadsheet not found or the service account does not have access.',
          details: message,
          hint:
            'Ensure the spreadsheet exists and is shared with the service account email shown in /api/get-service-account.'
        });
      }
    }

    return res.status(500).json({ error: message });
  }
}