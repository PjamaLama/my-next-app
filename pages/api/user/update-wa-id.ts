import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth, getAdminDb } from '../../../../lib/firebaseAdmin';
import { firestore } from 'firebase-admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wa_id } = req.body;

  if (!wa_id || !/^\d{10,15}$/.test(wa_id)) {
    return res.status(400).json({ error: 'Invalid WhatsApp number format.' });
  }

  const idToken = req.headers.authorization?.split('Bearer ')[1];

  if (!idToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const db = getAdminDb();

    const userRef = db.collection('users').doc(uid);
    const claimRef = db.collection('wa_id_claims').doc(wa_id);

    await db.runTransaction(async (transaction) => {
      const claimDoc = await transaction.get(claimRef);
      if (claimDoc.exists && claimDoc.data()?.uid !== uid) {
        throw new Error('This WhatsApp number is already linked to another account.');
      }

      // Set the claim and update the user doc
      transaction.set(claimRef, { uid });
      transaction.set(userRef, { wa_id }, { merge: true });
    });

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Error updating WhatsApp number:', error);
    if (error.message.includes('already linked')) {
        return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
}
