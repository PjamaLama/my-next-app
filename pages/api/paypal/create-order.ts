import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth } from '../../../lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Auth check
    const bearer = req.headers.authorization || '';
    const idToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined;
    if (!idToken) {
      console.error('paypal/create-order: No authorization token provided');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const auth = getAdminAuth();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (authError) {
      console.error('paypal/create-order: Token verification failed:', authError);
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { amount, currency = 'USD' } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    // Create PayPal order using REST API with enhanced card support
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

    // Create order with card processing enabled
    const orderData = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value: amount,
            breakdown: {
              item_total: {
                currency_code: currency,
                value: amount,
              },
            },
          },
          items: [
            {
              name: 'SheetyAI Pro Subscription',
              description: 'Monthly subscription to SheetyAI Pro',
              quantity: '1',
              unit_amount: {
                currency_code: currency,
                value: amount,
              },
            },
          ],
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
            locale: 'en-US',
            landing_page: 'LOGIN',
            return_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/paypal-success`,
            cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/paypal/cancel`,
          }
        }
      },
    };

    console.log('Creating PayPal order for Smart Buttons...');
    const createResponse = await fetch(`${paypalUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${paypalAuth}`,
        'Accept': 'application/json',
        'PayPal-Request-Id': `order-${Date.now()}`,
      },
      body: JSON.stringify(orderData),
    });

    const result = await createResponse.json();

    if (!createResponse.ok) {
      console.error('PayPal order creation failed:', result);
      return res.status(createResponse.status).json({
        error: 'Failed to create PayPal order',
        details: result
      });
    }

    console.log(`✅ paypal/create-order: Successfully created order ${result.id} for user ${decoded.email}`);

    return res.status(200).json({
      id: result.id,
      status: result.status,
      links: result.links
    });

  } catch (err: any) {
    console.error('paypal/create-order: Unexpected error:', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
