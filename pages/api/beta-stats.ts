import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb } from '../../lib/firebaseAdmin';
import { FieldPath } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

type BetaStats = {
  capacity: number;
  testerCount: number;
  spotsLeft: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<BetaStats | { error: string }>) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const db = getAdminDb();

    // Read capacity from meta/beta, default 100
    const metaRef = db.doc('meta/beta');
    const metaSnap = await metaRef.get();
    const capacity = (metaSnap.exists && typeof metaSnap.get('capacity') === 'number') ? metaSnap.get('capacity') as number : 100;

    // Robust: count registered users via Firebase Authentication
    const auth = getAuth();
    let nextPageToken: string | undefined = undefined;
    let testerCount = 0;
    do {
      const result = await auth.listUsers(1000, nextPageToken);
      testerCount += result.users.length;
      nextPageToken = result.pageToken;
    } while (nextPageToken);

    // Persist latest testerCount on meta/beta so clients can listen live without client perms to user data
    await metaRef.set({ testerCount, capacity, updatedAt: new Date() }, { merge: true });

    const spotsLeft = Math.max(0, capacity - testerCount);

    return res.status(200).json({ capacity, testerCount, spotsLeft });
  } catch (err: any) {
    console.error('beta-stats error', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}


