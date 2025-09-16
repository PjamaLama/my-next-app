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
      console.error('paypal/process-card: No authorization token provided');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const auth = getAdminAuth();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (authError) {
      console.error('paypal/process-card: Token verification failed:', authError);
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { orderId, cardDetails } = req.body;

    if (!orderId || !cardDetails) {
      return res.status(400).json({ error: 'Missing orderId or cardDetails' });
    }

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

    if (!clientId || !clientSecret) {
      return res.status(500).json({
        error: 'PayPal configuration error',
        details: 'Missing PayPal credentials'
      });
    }

    const paypalAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // First, confirm the order exists and get payment details
    const orderResponse = await fetch(`${paypalUrl}/v2/checkout/orders/${orderId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${paypalAuth}`,
        'Content-Type': 'application/json',
      },
    });

    if (!orderResponse.ok) {
      console.error('Failed to get order details:', orderResponse.status);
      return res.status(orderResponse.status).json({
        error: 'Failed to retrieve order details'
      });
    }

    const orderData = await orderResponse.json();
    const purchaseUnit = orderData.purchase_units?.[0];
    const amount = purchaseUnit?.amount;

    if (!amount) {
      return res.status(400).json({ error: 'Invalid order amount' });
    }

    // Process the card payment
    const paymentData = {
      intent: 'CAPTURE',
      payer: {
        name: {
          given_name: cardDetails.name.split(' ')[0],
          surname: cardDetails.name.split(' ').slice(1).join(' ')
        }
      },
      purchase_units: [{
        reference_id: orderId,
        amount: {
          currency_code: amount.currency_code,
          value: amount.value
        }
      }],
      payment_source: {
        card: {
          number: cardDetails.number,
          expiry: cardDetails.expiry.replace('/', ''), // Remove slash
          security_code: cardDetails.cvc,
          name: cardDetails.name,
          billing_address: {
            address_line_1: '123 Main St', // You might want to collect this
            admin_area_2: 'Anytown',
            admin_area_1: 'CA',
            postal_code: '12345',
            country_code: 'US'
          }
        }
      }
    };

    console.log('Processing card payment for order:', orderId);

    const paymentResponse = await fetch(`${paypalUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${paypalAuth}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `capture-${Date.now()}`,
      },
      body: JSON.stringify(paymentData),
    });

    const captureResult = await paymentResponse.json();

    if (!paymentResponse.ok) {
      console.error('Card payment failed:', captureResult);
      return res.status(paymentResponse.status).json({
        error: 'Payment failed',
        details: captureResult
      });
    }

    // Verify payment was successful
    const capture = captureResult.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture || capture.status !== 'COMPLETED') {
      console.error('Card payment not completed:', capture?.status);
      return res.status(400).json({
        error: 'Payment not completed',
        status: capture?.status
      });
    }

    // Update user profile with Pro status
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

    // Update user type to pro and store payment details
    await userProfileRef.set({
      userType: 'pro',
      upgradedAt: new Date(),
      paypalOrderId: orderId,
      paypalPaymentId: capture.id,
      paypalPaymentAmount: capture.amount?.value,
      paypalPaymentCurrency: capture.amount?.currencyCode,
      paymentMethod: 'card',
      subscription: {
        status: 'active',
        plan: 'pro_monthly',
        startDate: new Date(),
        paypalSubscriptionId: null,
      }
    }, { merge: true });

    console.log(`Card payment successful: User ${decoded.email} upgraded to pro with payment ${capture.id}`);

    return res.status(200).json({
      success: true,
      message: 'Successfully upgraded to Pro! Welcome to SheetyAI Pro.',
      userType: 'pro',
      paymentId: capture.id,
      orderId: orderId,
      amount: capture.amount?.value,
      currency: capture.amount?.currencyCode
    });

  } catch (err: any) {
    console.error('paypal/process-card: Unexpected error:', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
