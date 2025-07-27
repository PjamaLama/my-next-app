import { NextApiRequest, NextApiResponse } from 'next';
import { syncSheetToFirestore, syncSheetTabToFirestore } from '../../libs/firestoreSync';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sheetId, sheetName } = req.body;
    
    // Use sheetId from request body or fallback to environment variable
    const targetSheetId = sheetId || process.env.NEXT_PUBLIC_SHEET_ID;
    
    if (!targetSheetId) {
      return res.status(400).json({ 
        error: 'Sheet ID is required. Provide it in request body or set NEXT_PUBLIC_SHEET_ID environment variable.' 
      });
    }

    console.log(`API: Starting Firestore sync for sheet: ${targetSheetId}`);
    
    // If sheetName is provided, sync specific tab, otherwise sync entire sheet
    if (sheetName) {
      await syncSheetTabToFirestore(targetSheetId, sheetName);
      console.log(`API: Successfully synced sheet tab ${targetSheetId}/${sheetName}`);
    } else {
      await syncSheetToFirestore(targetSheetId);
      console.log(`API: Successfully synced entire sheet ${targetSheetId}`);
    }

    return res.status(200).json({ 
      success: true, 
      message: sheetName 
        ? `Successfully synced sheet tab ${targetSheetId}/${sheetName} to Firestore`
        : `Successfully synced sheet ${targetSheetId} to Firestore`
    });

  } catch (error) {
    console.error('API: Firestore sync failed:', error);
    return res.status(500).json({ 
      error: 'Failed to sync to Firestore',
      details: error instanceof Error ? error.message : String(error)
    });
  }
} 