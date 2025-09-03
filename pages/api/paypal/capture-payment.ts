import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from 'firebase-admin/auth';
import { getAdminDb } from '../../../lib/firebaseAdmin';
import { paypalClient } from '../../../lib/paypal';

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

    const auth = getAuth();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (authError) {
      console.error('paypal/capture-payment: Token verification failed:', authError);
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Missing orderId' });
    }

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

    // Capture PayPal payment
    const ordersController = paypalClient.getOrdersController();
    const captureOrderRequest = {
      id: orderId,
    };

    const { result, ...httpResponse } = await ordersController.ordersCapture(captureOrderRequest);

    if (httpResponse.statusCode !== 201) {
      console.error('paypal/capture-payment: Failed to capture PayPal payment:', result);
      return res.status(httpResponse.statusCode).json({
        error: 'Failed to capture payment',
        details: result
      });
    }

    // Verify payment was successful
    const capture = result.purchaseUnits?.[0]?.payments?.captures?.[0];
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
      paypalOrderId: orderId,
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

    return res.status(200).json({
      success: true,
      message: 'Successfully upgraded to Pro! Welcome to SheetyAI Pro.',
      userType: 'pro',
      paymentId: capture.id,
      orderId: orderId
    });

  } catch (err: any) {
    console.error('paypal/capture-payment: Unexpected error:', err);
    console.error('paypal/capture-payment: Error stack:', err?.stack);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
