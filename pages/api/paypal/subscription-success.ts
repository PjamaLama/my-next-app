import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth } from '../../../lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { subscription_id, token, PayerID } = req.query;

    if (!subscription_id) {
      return res.status(400).json({ error: 'Subscription ID is required' });
    }

    console.log('Processing PayPal subscription success:', { subscription_id, token, PayerID });

    // Get PayPal configuration
    // Auto-detect environment: production uses live, development uses sandbox
    const isProduction = process.env.NODE_ENV === 'production';

    const paypalUrl = isProduction
      ? 'https://api.paypal.com'
      : 'https://api.sandbox.paypal.com';

    const clientId = isProduction
      ? process.env.PAYPAL_CLIENT_ID
      : process.env.PAYPAL_SANDBOX_CLIENT_ID || process.env.PAYPAL_CLIENT_ID;

    const clientSecret = isProduction
      ? process.env.PAYPAL_SECRET_KEY
      : process.env.PAYPAL_SANDBOX_SECRET_KEY || process.env.PAYPAL_SECRET_KEY;

    if (!clientId || !clientSecret) {
      console.error('PayPal credentials missing');
      return res.status(500).json({ error: 'PayPal configuration error' });
    }

    // Get access token
    const paypalAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await fetch(`${paypalUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en_US',
        'Authorization': `Basic ${paypalAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Failed to get PayPal access token:', tokenData);
      return res.status(500).json({ error: 'Failed to authenticate with PayPal' });
    }

    // Get subscription details
    const subscriptionResponse = await fetch(`${paypalUrl}/v1/billing/subscriptions/${subscription_id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const subscriptionData = await subscriptionResponse.json();

    if (!subscriptionResponse.ok) {
      console.error('Failed to get subscription details:', subscriptionData);
      return res.status(500).json({ error: 'Failed to get subscription details' });
    }

    console.log('PayPal subscription details:', subscriptionData);

    // Extract user info from subscription metadata if available
    const subscriber = subscriptionData.subscriber;
    const payerEmail = subscriber?.email_address || subscriber?.payer_info?.email || null;

    if (!payerEmail) {
      console.warn('No email found in subscription data');
      // Redirect to success page anyway with limited info
      return res.redirect(302, `/paypal-success?type=subscription&subscription_id=${subscription_id}&status=success`);
    }

    // Find user by email in Firebase
    const auth = getAdminAuth();
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(payerEmail);
    } catch (error) {
      console.error('User not found by email:', payerEmail);
      return res.redirect(302, `/paypal-success?type=subscription&subscription_id=${subscription_id}&status=user_not_found`);
    }

    // Update user's subscription status in Firestore
    const { getFirestore } = require('firebase-admin/firestore');
    const db = getFirestore();

    const userRef = db.collection('users').doc(userRecord.uid);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Calculate subscription end date (assuming monthly subscription)
    const startTime = new Date(subscriptionData.start_time || new Date());
    const endDate = new Date(startTime);
    endDate.setMonth(endDate.getMonth() + 1); // Add one month

    const subscriptionUpdate = {
      paypalSubscriptionId: subscription_id,
      plan: 'pro',
      status: subscriptionData.status.toLowerCase(),
      startDate: startTime,
      endDate: endDate,
      paypalPlanId: subscriptionData.plan_id,
      lastUpdated: new Date(),
      paymentMethod: 'paypal_subscription',
      autoRenew: true
    };

    await userRef.set({
      ...userData,
      userType: 'pro',
      subscription: subscriptionUpdate,
      upgradedAt: new Date(),
      paypalSubscriptionId: subscription_id
    }, { merge: true });

    console.log(`✅ Successfully processed PayPal subscription ${subscription_id} for user ${userRecord.uid}`);

    // Debug: Verify the update worked by reading back the data
    const verifyUpdate = await userRef.get();
    const verifyData = verifyUpdate.data();
    console.log('🔍 Verification - User data after update:', {
      userType: verifyData?.userType,
      subscription: verifyData?.subscription,
      upgradedAt: verifyData?.upgradedAt
    });

    // Redirect to success page
    return res.redirect(302, `/paypal-success?type=subscription&subscription_id=${subscription_id}&status=success&user_id=${userRecord.uid}`);

  } catch (err: any) {
    console.error('PayPal subscription success handler error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err?.message || 'Unknown error'
    });
  }
}
