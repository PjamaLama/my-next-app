import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth, getAdminDb } from '../../../../lib/firebaseAdmin';

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

    const userRef = getAdminDb().collection('users').doc(uid);
    await userRef.set({ wa_id }, { merge: true });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error updating WhatsApp number:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
