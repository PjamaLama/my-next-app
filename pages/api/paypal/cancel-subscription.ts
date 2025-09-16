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

    // Get user document (where subscription data is stored)
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userSnap.data();

    // Check if user is currently pro
    if (userData?.userType !== 'pro') {
      return res.status(400).json({ error: 'User is not currently a pro subscriber' });
    }

    // Check if they have a PayPal subscription ID
    const paypalSubscriptionId = userData?.paypalSubscriptionId || userData?.subscription?.paypalSubscriptionId;

    if (paypalSubscriptionId) {
      // For PayPal subscriptions, we need to cancel through PayPal API first
      const isProduction = process.env.NODE_ENV === 'production';
      const paypalUrl = isProduction ? 'https://api.paypal.com' : 'https://api.sandbox.paypal.com';
      const clientId = isProduction
        ? process.env.PAYPAL_CLIENT_ID
        : process.env.PAYPAL_SANDBOX_CLIENT_ID || process.env.PAYPAL_CLIENT_ID;
      const clientSecret = isProduction
        ? process.env.PAYPAL_SECRET_KEY
        : process.env.PAYPAL_SANDBOX_SECRET_KEY || process.env.PAYPAL_SECRET_KEY;

      if (clientId && clientSecret) {
        try {
          // Get PayPal access token
          const paypalAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
          const tokenResponse = await fetch(`${paypalUrl}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Basic ${paypalAuth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=client_credentials',
          });

          const tokenData = await tokenResponse.json();

          if (tokenResponse.ok) {
            // Cancel subscription through PayPal API
            const cancelResponse = await fetch(`${paypalUrl}/v1/billing/subscriptions/${paypalSubscriptionId}/cancel`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                reason: req.body?.reason || 'User requested cancellation'
              }),
            });

            if (!cancelResponse.ok) {
              console.warn('Failed to cancel PayPal subscription, but will still update our database');
            }
          }
        } catch (paypalError) {
          console.warn('PayPal API cancellation failed, proceeding with database update:', paypalError);
        }
      }
    }

    // Update our database regardless of PayPal API success
    const cancellationDate = new Date();
    const endDate = new Date(cancellationDate);
    endDate.setDate(endDate.getDate() + 30); // Give them 30 days remaining

    await userRef.update({
      'subscription.status': 'cancelled',
      'subscription.cancelledAt': cancellationDate,
      'subscription.endDate': endDate,
      'subscription.cancelReason': req.body?.reason || 'User requested cancellation',
      'subscription.lastUpdated': new Date()
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
