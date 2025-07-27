import { updateSheetFlow } from '../../genkit/updateSheetFlow';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transcript, sheetId, sheetName, commit } = req.body;

    if (!transcript || !sheetId) {
      return res.status(400).json({ 
        error: 'Missing required fields: transcript and sheetId are required' 
      });
    }

    // Call the Genkit flow
    const result = await updateSheetFlow({
      transcript,
      sheetId,
      sheetName,
      commit: commit || false
    });

    // Return the result based on whether it's a commit or preview
    if (commit) {
      res.status(200).json({
        success: result.success,
        executedActions: result.executedActions,
        actions: result.actions
      });
    } else {
      res.status(200).json({
        success: true,
        actions: result.actions
      });
    }

  } catch (error) {
    console.error('Error in updateSheet API:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 