import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth } from '../../../lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'This endpoint is only available in development' });
  }

  try {
    // Auth check
    const bearer = req.headers.authorization || '';
    const idToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined;
    if (!idToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const auth = getAdminAuth();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (authError) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { getFirestore } = require('firebase-admin/firestore');
    const db = getFirestore();
    const userRef = db.collection('users').doc(decoded.uid);

    // Get current user type
    const userDoc = await userRef.get();
    const currentUserType = userDoc.data()?.userType || 'free';

    // Toggle user type
    const newUserType = currentUserType === 'free' ? 'pro' : 'free';

    // Update user type
    await userRef.set({
      userType: newUserType,
      // If switching to pro, add some basic subscription info
      ...(newUserType === 'pro' && !userDoc.data()?.subscription && {
        subscription: {
          status: 'active',
          plan: 'pro',
          paymentMethod: 'dev_toggle',
          lastUpdated: new Date()
        },
        upgradedAt: new Date()
      }),
      // If switching to free, clear subscription info
      ...(newUserType === 'free' && {
        subscription: null,
        upgradedAt: null
      })
    }, { merge: true });

    console.log(`✅ Dev: Toggled user ${decoded.email} from ${currentUserType} to ${newUserType}`);

    return res.status(200).json({
      success: true,
      newUserType,
      message: `User type changed from ${currentUserType} to ${newUserType}`
    });

  } catch (err: any) {
    console.error('Admin toggle user type error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err?.message || 'Unknown error'
    });
  }
}
