import { NextApiRequest, NextApiResponse } from 'next';
import { updateSingleSheetFlow } from '../../lib/genkit-template';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transcript, sheetData } = req.body;
    
    if (!transcript || !sheetData) {
      return res.status(400).json({ 
        error: 'Both transcript and sheetData are required' 
      });
    }

    console.log(`API: Running Genkit sheet update flow`);
    console.log(`Transcript: ${transcript}`);
    console.log(`Sheet: ${sheetData.sheetName}`);
    
    const result = await updateSingleSheetFlow({
      transcript,
      sheetData
    });
    
    return res.status(200).json({ 
      success: true, 
      result: result
    });

  } catch (error) {
    console.error('API: Genkit sheet update flow failed:', error);
    return res.status(500).json({ 
      error: 'Failed to run sheet update flow',
      details: error instanceof Error ? error.message : String(error)
    });
  }
} 