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
      console.error('paypal/capture-payment: No authorization token provided');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const auth = getAdminAuth();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (authError) {
      console.error('paypal/capture-payment: Token verification failed:', authError);
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { paypalToken, orderId } = req.body;

    if (!paypalToken && !orderId) {
      return res.status(400).json({ error: 'Missing paypalToken or orderId' });
    }

    // Use orderId if provided (from Smart Buttons), otherwise use paypalToken
    const paymentId = orderId || paypalToken;

    const db = getAdminDb();
    const uid = decoded.uid;

    // Verify user profile exists
    const userProfileRef = db.doc(`users/${uid}/private/profile`);
    const profileSnap = await userProfileRef.get();

    if (!profileSnap.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Check if user is already pro
    const profileData = profileSnap.data();
    if (profileData?.userType === 'pro') {
      return res.status(400).json({ error: 'User is already pro' });
    }

    // Capture PayPal payment using REST API
    // Check if we have sandbox credentials, otherwise use production
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

    console.log('PayPal Capture Debug Info:', {
      nodeEnv: process.env.NODE_ENV,
      environment: isProduction ? 'PRODUCTION' : 'SANDBOX',
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      paypalUrl,
      paypalToken: paypalToken.substring(0, 10) + '...' // Log partial token for debugging
    });

    if (!clientId || !clientSecret) {
      console.error('❌ PAYPAL CREDENTIALS MISSING!');
      console.error('Please add these to your .env.local file:');
      console.error('PAYPAL_CLIENT_ID=your_paypal_client_id_here');
      console.error('PAYPAL_SECRET_KEY=your_paypal_secret_key_here');

      return res.status(500).json({
        error: 'PayPal configuration error',
        details: 'Missing PayPal credentials',
        debug: {
          hasClientId: !!clientId,
          hasClientSecret: !!clientSecret,
          nodeEnv: process.env.NODE_ENV,
          environment: isProduction ? 'PRODUCTION' : 'SANDBOX'
        }
      });
    }

    const paypalAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    console.log('Making PayPal capture API call...');
    const captureResponse = await fetch(`${paypalUrl}/v2/checkout/orders/${paymentId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${paypalAuth}`,
      },
    });

    const result = await captureResponse.json();

    if (!captureResponse.ok) {
      console.error('paypal/capture-payment: Failed to capture PayPal payment:', result);
      return res.status(captureResponse.status).json({
        error: 'Failed to capture payment',
        details: result
      });
    }

    // Verify payment was successful
    const capture = result.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture || capture.status !== 'COMPLETED') {
      console.error('paypal/capture-payment: Payment not completed:', capture?.status);
      return res.status(400).json({
        error: 'Payment not completed',
        status: capture?.status
      });
    }

    // Update user type to pro and store payment details
    await userProfileRef.set({
      userType: 'pro',
      upgradedAt: new Date(),
      paypalOrderId: paypalToken, // Store the token as order ID for tracking
      paypalPaymentId: capture.id,
      paypalPaymentAmount: capture.amount?.value,
      paypalPaymentCurrency: capture.amount?.currencyCode,
      subscription: {
        status: 'active',
        plan: 'pro_monthly',
        startDate: new Date(),
        paypalSubscriptionId: null, // For now, we'll handle one-time payments
      }
    }, { merge: true });

    console.log(`paypal/capture-payment: Successfully upgraded user ${decoded.email} to pro with payment ${capture.id}`);

    // Pro upgrade completed
    console.log('📊 Pro Upgrade Completed');

    return res.status(200).json({
      success: true,
      message: 'Successfully upgraded to Pro! Welcome to SheetyAI Pro.',
      userType: 'pro',
      paymentId: capture.id,
      orderId: paypalToken // Return the token as orderId for consistency
    });

  } catch (err: any) {
    console.error('paypal/capture-payment: Unexpected error:', err);
    console.error('paypal/capture-payment: Error stack:', err?.stack);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
