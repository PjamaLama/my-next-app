import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getAuth } from 'firebase-admin/auth';
import type { Transaction } from 'firebase-admin/firestore';

type MetaDoc = { capacity?: number; testerCount?: number; open?: boolean; showWhatsAppMessaging?: boolean; updatedAt?: any };

function isAllowedAdmin(decoded: any): boolean {
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (decoded?.admin === true) return true;
  const email = (decoded?.email || '').toLowerCase();
  return !!email && admins.includes(email);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Auth check
    const bearer = req.headers.authorization || '';
    const idToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined;
    if (!idToken) {
      console.error('admin/meta: No authorization token provided');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const auth = getAuth();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (authError) {
      console.error('admin/meta: Token verification failed:', authError);
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (!isAllowedAdmin(decoded)) {
      console.error('admin/meta: User not allowed admin access:', decoded?.email);
      return res.status(403).json({ error: 'Forbidden' });
    }

    let db;
    try {
      db = getAdminDb();
    } catch (dbError) {
      console.error('admin/meta: Database initialization failed:', dbError);
      return res.status(500).json({ error: 'Database configuration error' });
    }

    const metaRef = db.doc('meta/beta');

    if (req.method === 'GET') {
      try {
        const snap = await metaRef.get();
        const data: MetaDoc = snap.exists ? (snap.data() as MetaDoc) : { capacity: 100, testerCount: 0, open: false, showWhatsAppMessaging: false };
        console.log('admin/meta: GET successful, data:', { exists: snap.exists, capacity: data.capacity, testerCount: data.testerCount });
        return res.status(200).json({
          capacity: typeof data.capacity === 'number' ? data.capacity : 100,
          testerCount: typeof data.testerCount === 'number' ? data.testerCount : 0,
          open: !!data.open,
          showWhatsAppMessaging: typeof data.showWhatsAppMessaging === 'boolean' ? data.showWhatsAppMessaging : false,
        });
      } catch (getError) {
        console.error('admin/meta: GET operation failed:', getError);
        return res.status(500).json({ error: 'Failed to read meta data' });
      }
    }

    if (req.method === 'POST') {
      const { action } = req.body || {};

      // Update meta fields (capacity/open/showWhatsAppMessaging)
      if (!action || action === 'updateMeta') {
        try {
          const { capacity, open, showWhatsAppMessaging } = req.body || {};
          const updates: Record<string, any> = { updatedAt: new Date() };
          if (typeof capacity === 'number' && capacity >= 0) updates.capacity = capacity;
          if (typeof open === 'boolean') updates.open = open;
          if (typeof showWhatsAppMessaging === 'boolean') updates.showWhatsAppMessaging = showWhatsAppMessaging;

          console.log('admin/meta: POST updateMeta, updates:', updates);
          await metaRef.set(updates, { merge: true });
          const snap = await metaRef.get();
          const data = snap.data() as MetaDoc;
          console.log('admin/meta: POST updateMeta successful');
          return res.status(200).json({
            capacity: typeof data.capacity === 'number' ? data.capacity : 100,
            testerCount: typeof data.testerCount === 'number' ? data.testerCount : 0,
            open: !!data.open,
            showWhatsAppMessaging: typeof data.showWhatsAppMessaging === 'boolean' ? data.showWhatsAppMessaging : true,
          });
        } catch (updateError) {
          console.error('admin/meta: POST updateMeta failed:', updateError);
          return res.status(500).json({ error: 'Failed to update meta data' });
        }
      }

      // Grant tester by email
      if (action === 'grantTester') {
        const email: string | undefined = (req.body && req.body.email) || undefined;
        if (!email) return res.status(400).json({ error: 'Missing email' });
        const { uid } = await auth.getUserByEmail(email);
        const userProfileRef = db.doc(`users/${uid}/private/profile`);
        const result = await db.runTransaction(async (tx: Transaction) => {
          const metaSnap = await tx.get(metaRef) as any; // DocumentSnapshot
          const capacity = (metaSnap.exists && typeof metaSnap.get('capacity') === 'number') ? (metaSnap.get('capacity') as number) : 100;
          const open = (metaSnap.exists && typeof metaSnap.get('open') === 'boolean') ? (metaSnap.get('open') as boolean) : false;
          let testerCount = (metaSnap.exists && typeof metaSnap.get('testerCount') === 'number') ? (metaSnap.get('testerCount') as number) : 0;

          const profileSnap = await tx.get(userProfileRef) as any; // DocumentSnapshot
          const alreadyTester = profileSnap.exists && !!profileSnap.get('betaTester');
          if (!alreadyTester) {
            tx.set(userProfileRef, { betaTester: true, betaWaitlist: false, lastUpdatedAt: new Date() }, { merge: true });
            testerCount += 1;
          }
          tx.set(metaRef, { testerCount, capacity, open, updatedAt: new Date() }, { merge: true });
          return { capacity, testerCount, open };
        });
        return res.status(200).json(result);
      }

      // Revoke tester by email
      if (action === 'revokeTester') {
        const email: string | undefined = (req.body && req.body.email) || undefined;
        if (!email) return res.status(400).json({ error: 'Missing email' });
        const { uid } = await auth.getUserByEmail(email);
        const userProfileRef = db.doc(`users/${uid}/private/profile`);
        const result = await db.runTransaction(async (tx: Transaction) => {
          const metaSnap = await tx.get(metaRef) as any; // DocumentSnapshot
          const capacity = (metaSnap.exists && typeof metaSnap.get('capacity') === 'number') ? (metaSnap.get('capacity') as number) : 100;
          const open = (metaSnap.exists && typeof metaSnap.get('open') === 'boolean') ? (metaSnap.get('open') as boolean) : false;
          let testerCount = (metaSnap.exists && typeof metaSnap.get('testerCount') === 'number') ? (metaSnap.get('testerCount') as number) : 0;

          const profileSnap = await tx.get(userProfileRef) as any; // DocumentSnapshot
          const wasTester = profileSnap.exists && !!profileSnap.get('betaTester');
          if (wasTester) {
            tx.set(userProfileRef, { betaTester: false, betaWaitlist: true, lastUpdatedAt: new Date() }, { merge: true });
            testerCount = Math.max(0, testerCount - 1);
          }
          tx.set(metaRef, { testerCount, capacity, open, updatedAt: new Date() }, { merge: true });
          return { capacity, testerCount, open };
        });
        return res.status(200).json(result);
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('admin/meta: Unexpected error:', err);
    console.error('admin/meta: Error stack:', err?.stack);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}


