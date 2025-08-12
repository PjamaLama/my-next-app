import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb } from '../../lib/firebaseAdmin';

type BetaStats = {
  capacity: number;
  testerCount: number;
  spotsLeft: number;
  open?: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<BetaStats | { error: string }>) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const db = getAdminDb();

    // Read centralized beta meta document
    const metaRef = db.doc('meta/beta');
    const metaSnap = await metaRef.get();
    const capacity = (metaSnap.exists && typeof metaSnap.get('capacity') === 'number') ? (metaSnap.get('capacity') as number) : 100;
    const testerCount = (metaSnap.exists && typeof metaSnap.get('testerCount') === 'number') ? (metaSnap.get('testerCount') as number) : 0;
    const open = (metaSnap.exists && typeof metaSnap.get('open') === 'boolean') ? (metaSnap.get('open') as boolean) : false;

    const spotsLeft = open ? Number.POSITIVE_INFINITY : Math.max(0, capacity - testerCount);

    // Ensure doc is initialized
    if (!metaSnap.exists) {
      await metaRef.set({ capacity, testerCount, open, updatedAt: new Date() }, { merge: true });
    }

    return res.status(200).json({ capacity, testerCount, spotsLeft, open });
  } catch (err: any) {
    console.error('beta-stats error', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}


