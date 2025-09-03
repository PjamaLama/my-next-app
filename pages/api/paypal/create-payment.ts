import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from 'firebase-admin/auth';
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
      console.error('paypal/create-payment: No authorization token provided');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const auth = getAuth();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (authError) {
      console.error('paypal/create-payment: Token verification failed:', authError);
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { returnUrl, cancelUrl } = req.body;

    if (!returnUrl || !cancelUrl) {
      return res.status(400).json({ error: 'Missing returnUrl or cancelUrl' });
    }

    // Create PayPal order
    const ordersController = paypalClient.getOrdersController();
    const createOrderRequest = {
      body: {
        intent: 'CAPTURE',
        purchaseUnits: [
          {
            amount: {
              currencyCode: 'USD',
              value: '19.00',
              breakdown: {
                itemTotal: {
                  currencyCode: 'USD',
                  value: '19.00',
                },
              },
            },
            items: [
              {
                name: 'SheetyAI Pro Subscription',
                description: 'Monthly subscription to SheetyAI Pro',
                quantity: '1',
                unitAmount: {
                  currencyCode: 'USD',
                  value: '19.00',
                },
              },
            ],
          },
        ],
        applicationContext: {
          returnUrl: returnUrl,
          cancelUrl: cancelUrl,
          brandName: 'SheetyAI',
          userAction: 'PAY_NOW',
        },
      },
    };

    const { result, ...httpResponse } = await ordersController.ordersCreate(createOrderRequest);

    if (httpResponse.statusCode !== 201) {
      console.error('paypal/create-payment: Failed to create PayPal order:', result);
      return res.status(httpResponse.statusCode).json({
        error: 'Failed to create PayPal order',
        details: result
      });
    }

    // Store order ID in session for later verification
    const orderId = result.id;

    console.log(`paypal/create-payment: Created PayPal order ${orderId} for user ${decoded.email}`);

    return res.status(200).json({
      orderId,
      approvalUrl: result.links?.find((link: any) => link.rel === 'approve')?.href,
      result
    });

  } catch (err: any) {
    console.error('paypal/create-payment: Unexpected error:', err);
    console.error('paypal/create-payment: Error stack:', err?.stack);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
