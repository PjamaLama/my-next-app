import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth, getAdminDb } from '../../../lib/firebaseAdmin';
import { firestore } from 'firebase-admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const idToken = req.headers.authorization?.split('Bearer ')[1];

  if (!idToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const db = getAdminDb();

    // Get the user's current WhatsApp ID
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentWaId = userDoc.data()?.wa_id;
    
    if (!currentWaId) {
      return res.status(400).json({ error: 'No WhatsApp number currently linked' });
    }

    // Use a transaction to ensure atomicity
    await db.runTransaction(async (transaction) => {
      // Remove the WhatsApp ID from the user document
      transaction.update(userRef, { 
        wa_id: firestore.FieldValue.delete(),
        wa_id_updated_at: firestore.FieldValue.serverTimestamp()
      });

      // Remove the claim
      const claimRef = db.collection('wa_id_claims').doc(currentWaId);
      const claimDoc = await transaction.get(claimRef);
      
      if (claimDoc.exists && claimDoc.data()?.uid === uid) {
        transaction.delete(claimRef);
      }
    });

    res.status(200).json({ 
      success: true, 
      message: 'WhatsApp number unlinked successfully'
    });
  } catch (error: any) {
    console.error('Error unlinking WhatsApp number:', error);
    
    if (error.code === 'permission-denied') {
      return res.status(403).json({ error: 'Permission denied. Please ensure you have the necessary permissions.' });
    }
    
    res.status(500).json({ error: 'Internal server error. Please try again later.' });
  }
}
