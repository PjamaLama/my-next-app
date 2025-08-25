import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth, getAdminDb } from '../../../lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
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

    // Get the user document
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    
    res.status(200).json({
      uid: uid,
      email: userData?.email || null,
      displayName: userData?.displayName || null,
      wa_id: userData?.wa_id || null,
      wa_id_updated_at: userData?.wa_id_updated_at?.toDate?.() || userData?.wa_id_updated_at || null,
      createdAt: userData?.createdAt?.toDate?.() || userData?.createdAt || null
    });
  } catch (error: any) {
    console.error('Error fetching user profile:', error);
    
    if (error.code === 'permission-denied') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
}
