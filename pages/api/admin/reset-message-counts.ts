import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb } from '../../../lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { authorization } = req.headers;

  if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const db = getAdminDb();
    const usersSnapshot = await db.collection('users').get();

    const batch = db.batch();

    for (const userDoc of usersSnapshot.docs) {
      const profileRef = db.collection('users').doc(userDoc.id).collection('private').doc('profile');
      batch.update(profileRef, { messageCount: 0 });
    }

    await batch.commit();

    res.status(200).json({ success: true, message: 'Message counts reset successfully.' });
  } catch (error: any) {
    console.error('Error resetting message counts:', error);
    res.status(500).json({ success: false, message: 'An internal error occurred.', error: error.message });
  }
}
