import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth, getAdminDb } from '../../../lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Auth check
    const bearer = req.headers.authorization || '';
    const idToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined;
    if (!idToken) {
      console.error('paypal/cancel-subscription: No authorization token provided');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const auth = getAdminAuth();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (authError) {
      console.error('paypal/cancel-subscription: Token verification failed:', authError);
      return res.status(401).json({ error: 'Invalid token' });
    }

    const db = getAdminDb();
    const uid = decoded.uid;

    // Get user profile
    const userProfileRef = db.doc(`users/${uid}/private/profile`);
    const profileSnap = await userProfileRef.get();

    if (!profileSnap.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const profileData = profileSnap.data();

    // Check if user is currently pro
    if (profileData?.userType !== 'pro') {
      return res.status(400).json({ error: 'User is not currently a pro subscriber' });
    }

    // For PayPal one-time payments, we can't actually cancel them through the API
    // Instead, we mark the subscription as cancelled and set a cancellation date
    // The user will remain pro until their current billing period ends
    const cancellationDate = new Date();
    const endDate = new Date(cancellationDate);
    endDate.setDate(endDate.getDate() + 30); // Give them 30 days remaining

    await userProfileRef.update({
      subscription: {
        ...profileData.subscription,
        status: 'cancelled',
        cancelledAt: cancellationDate,
        endDate: endDate,
        cancelReason: req.body?.reason || 'User requested cancellation'
      }
    });

    console.log(`paypal/cancel-subscription: Successfully cancelled subscription for user ${decoded.email}`);

    return res.status(200).json({
      success: true,
      message: 'Subscription cancelled successfully. You will retain Pro access until the end of your current billing period.',
      endDate: endDate.toISOString(),
      cancelledAt: cancellationDate.toISOString()
    });

  } catch (err: any) {
    console.error('paypal/cancel-subscription: Unexpected error:', err);
    console.error('paypal/cancel-subscription: Error stack:', err?.stack);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
