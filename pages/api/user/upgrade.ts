import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from 'firebase-admin/auth';
import { getAdminDb } from '../../../lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Auth check
    const bearer = req.headers.authorization || '';
    const idToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined;
    if (!idToken) {
      console.error('user/upgrade: No authorization token provided');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const auth = getAuth();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (authError) {
      console.error('user/upgrade: Token verification failed:', authError);
      return res.status(401).json({ error: 'Invalid token' });
    }

    const db = getAdminDb();
    const uid = decoded.uid;

    // Get main user document (userType is now stored here)
    const userDocRef = db.doc(`users/${uid}`);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDocSnap.data();

    // Check if user is already pro
    if (userData?.userType === 'pro') {
      return res.status(400).json({ error: 'User is already pro' });
    }

    // TODO: Here you would integrate with PayPal payment processing
    // For now, we'll simulate the upgrade process

    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Update user type to pro in main document
    await userDocRef.set({
      userType: 'pro',
      upgradedAt: new Date(),
      // TODO: Add subscription details when payment is integrated
    }, { merge: true });

    console.log(`user/upgrade: Successfully upgraded user ${decoded.email} to pro`);

    return res.status(200).json({
      success: true,
      message: 'Successfully upgraded to Pro! Welcome to SheetyAI Pro.',
      userType: 'pro'
    });

  } catch (err: any) {
    console.error('user/upgrade: Unexpected error:', err);
    console.error('user/upgrade: Error stack:', err?.stack);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
