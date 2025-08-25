import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth, getAdminDb } from '../../../lib/firebaseAdmin';
import { firestore } from 'firebase-admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wa_id } = req.body;

  if (!wa_id || typeof wa_id !== 'string') {
    return res.status(400).json({ error: 'WhatsApp ID is required' });
  }

  // Validate E.164 format
  const waIdRegex = /^\+[1-9]\d{1,14}$/;
  if (!waIdRegex.test(wa_id.trim())) {
    return res.status(400).json({ error: 'Invalid WhatsApp ID format. Must be in E.164 format (e.g., +1234567890)' });
  }

  const idToken = req.headers.authorization?.split('Bearer ')[1];

  if (!idToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const db = getAdminDb();

    // Check if this WhatsApp ID is already claimed by another user
    const existingClaimRef = db.collection('wa_id_claims').doc(wa_id.trim());
    const existingClaim = await existingClaimRef.get();

    if (existingClaim.exists) {
      const existingUid = existingClaim.data()?.uid;
      
      // If the existing claim belongs to the same user, allow the update
      if (existingUid === uid) {
        // User is updating their existing WhatsApp ID, proceed
      } else {
        // Another user already has this WhatsApp ID
        return res.status(409).json({ 
          error: 'This WhatsApp number is already linked to another account. Please use a different number or contact support if you believe this is an error.' 
        });
      }
    }

    // Get the user's current WhatsApp ID to clean up old claims
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const currentWaId = userDoc.exists ? userDoc.data()?.wa_id : null;

    // Use a transaction to ensure atomicity
    await db.runTransaction(async (transaction) => {
      // Remove old claim if user had a different WhatsApp ID
      if (currentWaId && currentWaId !== wa_id.trim()) {
        const oldClaimRef = db.collection('wa_id_claims').doc(currentWaId);
        const oldClaim = await transaction.get(oldClaimRef);
        if (oldClaim.exists && oldClaim.data()?.uid === uid) {
          transaction.delete(oldClaimRef);
        }
      }

      // Create/update the new claim
      transaction.set(existingClaimRef, {
        uid: uid,
        claimedAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp()
      });

      // Update the user document
      transaction.set(userRef, { 
        wa_id: wa_id.trim(),
        wa_id_updated_at: firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });

    res.status(200).json({ 
      success: true, 
      message: 'WhatsApp number linked successfully',
      wa_id: wa_id.trim()
    });
  } catch (error: any) {
    console.error('Error updating WhatsApp number:', error);
    
    // Handle specific error cases
    if (error.code === 'permission-denied') {
      return res.status(403).json({ error: 'Permission denied. Please ensure you have the necessary permissions.' });
    }
    
    res.status(500).json({ error: 'Internal server error. Please try again later.' });
  }
}
