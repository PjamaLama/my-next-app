import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb } from '../../lib/firebaseAdmin';
import { getAuth } from 'firebase-admin/auth';

type EnsureResponse = {
  status: 'tester' | 'waitlist' | 'unchanged';
  capacity: number;
  testerCount: number;
  open: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<EnsureResponse | { error: string }>) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;
    if (!idToken) return res.status(401).json({ error: 'Missing Authorization Bearer token' });

    // Ensure admin app is initialized
    const db = getAdminDb();
    const auth = getAuth();
    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;
    const email = decoded.email || null;
    const name = (decoded as any).name || null;
    const picture = (decoded as any).picture || null;

    const userProfileRef = db.doc(`users/${uid}/private/profile`);
    const metaRef = db.doc('meta/beta');

    const result = await db.runTransaction(async (tx) => {
      // Read meta
      const metaSnap = await tx.get(metaRef);
      const capacity = (metaSnap.exists && typeof metaSnap.get('capacity') === 'number') ? (metaSnap.get('capacity') as number) : 100;
      const open = (metaSnap.exists && typeof metaSnap.get('open') === 'boolean') ? (metaSnap.get('open') as boolean) : false;
      let testerCount = (metaSnap.exists && typeof metaSnap.get('testerCount') === 'number') ? (metaSnap.get('testerCount') as number) : 0;

      // Ensure profile exists
      const profileSnap = await tx.get(userProfileRef);
      const exists = profileSnap.exists;
      const data = exists ? (profileSnap.data() || {}) : {};
      const alreadyTester = !!data.betaTester;
      const alreadyWaitlist = !!data.betaWaitlist;

      // Base profile updates
      const baseData: Record<string, any> = {
        email,
        displayName: name,
        photoURL: picture,
        lastLoginAt: new Date(),
      };
      if (!exists) baseData.createdAt = new Date();

      let status: 'tester' | 'waitlist' | 'unchanged' = 'unchanged';

      if (open) {
        if (!alreadyTester) {
          baseData.betaTester = true;
          baseData.betaWaitlist = false;
          testerCount += 1;
          status = 'tester';
        }
      } else {
        const spotsLeft = Math.max(0, capacity - testerCount);
        if (alreadyTester) {
          status = 'unchanged';
        } else if (spotsLeft > 0) {
          baseData.betaTester = true;
          baseData.betaWaitlist = false;
          testerCount += 1;
          status = 'tester';
        } else {
          if (!alreadyWaitlist) {
            baseData.betaTester = false;
            baseData.betaWaitlist = true;
            status = 'waitlist';
          } else {
            status = 'unchanged';
          }
        }
      }

      // Write profile changes if any
      if (Object.keys(baseData).length > 0) {
        tx.set(userProfileRef, baseData, { merge: true });
      }

      // Persist testerCount and capacity back to meta for clients
      tx.set(metaRef, { testerCount, capacity, open, updatedAt: new Date() }, { merge: true });

      return { status, capacity, testerCount, open } as EnsureResponse;
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('beta-ensure error', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}


