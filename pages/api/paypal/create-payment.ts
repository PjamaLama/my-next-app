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
      console.error('paypal/create-payment: No authorization token provided');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const auth = getAdminAuth();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (authError) {
      console.error('paypal/create-payment: Token verification failed:', authError);
      return res.status(401).json({ error: 'Invalid token' });
    }

    // returnUrl and cancelUrl are now handled internally

    // Create PayPal order using REST API
    // Check if we have sandbox credentials, otherwise use production
    const hasSandboxCredentials = process.env.PAYPAL_SANDBOX_CLIENT_ID && process.env.PAYPAL_SANDBOX_SECRET_KEY;
    const isProduction = process.env.NODE_ENV === 'production' || !hasSandboxCredentials;

    const paypalUrl = isProduction
      ? 'https://api.paypal.com'
      : 'https://api.sandbox.paypal.com';

    const clientId = isProduction
      ? process.env.PAYPAL_CLIENT_ID
      : process.env.PAYPAL_SANDBOX_CLIENT_ID || process.env.PAYPAL_CLIENT_ID;

    const clientSecret = isProduction
      ? process.env.PAYPAL_SECRET_KEY
      : process.env.PAYPAL_SANDBOX_SECRET_KEY || process.env.PAYPAL_SECRET_KEY;

    console.log('PayPal Debug Info:', {
      nodeEnv: process.env.NODE_ENV,
      environment: isProduction ? 'PRODUCTION' : 'SANDBOX',
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      clientIdLength: clientId?.length,
      clientSecretLength: clientSecret?.length,
      paypalUrl,
      hasSandboxCredentials
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
          solution: 'Add PAYPAL_CLIENT_ID and PAYPAL_SECRET_KEY to .env.local'
        }
      });
    }

    const paypalAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const orderData = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: 'USD',
            value: '19.97',
            breakdown: {
              item_total: {
                currency_code: 'USD',
                value: '19.97',
              },
            },
          },
          items: [
            {
              name: 'SheetyAI Pro Subscription',
              description: 'Monthly subscription to SheetyAI Pro',
              quantity: '1',
              unit_amount: {
                currency_code: 'USD',
                value: '19.97',
              },
            },
          ],
        },
      ],
      application_context: {
        return_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/paypal/success`,
        cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/paypal/cancel`,
        brand_name: 'SheetyAI',
        user_action: 'PAY_NOW',
      },
    };

    console.log('Making PayPal API call to:', paypalUrl);
    console.log('Order data:', JSON.stringify(orderData, null, 2));

    const createResponse = await fetch(`${paypalUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${paypalAuth}`,
        'Accept': 'application/json',
        'PayPal-Request-Id': `order-${Date.now()}`, // Unique request ID
      },
      body: JSON.stringify(orderData),
    });

    console.log('PayPal API response status:', createResponse.status);
    console.log('PayPal API response headers:', Object.fromEntries(createResponse.headers.entries()));

    let result;
    try {
      const responseText = await createResponse.text();
      console.log('PayPal API raw response:', responseText);

      if (responseText.trim()) {
        result = JSON.parse(responseText);
        console.log('PayPal API parsed response:', result);
      } else {
        result = { error: 'Empty response body' };
      }
    } catch (parseError) {
      console.error('Error parsing PayPal response:', parseError);
      result = { error: 'Invalid JSON response', parseError: parseError instanceof Error ? parseError.message : 'Unknown parsing error' };
    }

    if (!createResponse.ok) {
      console.error('❌ PayPal API call failed with status:', createResponse.status);
      console.error('❌ PayPal API error details:', result);

      // Return more detailed error information
      return res.status(createResponse.status).json({
        error: 'Failed to create PayPal order',
        details: result,
        debug: {
          status: createResponse.status,
          statusText: createResponse.statusText,
          paypalUrl,
          hasAuth: !!paypalAuth,
          authLength: paypalAuth?.length,
          orderData: orderData,
          environment: isProduction ? 'PRODUCTION' : 'SANDBOX'
        }
      });
    }

    // Store order ID in session for later verification
    const orderId = result.id;
    const approvalUrl = result.links?.find((link: any) => link.rel === 'approve')?.href;

    console.log(`✅ paypal/create-payment: Successfully created PayPal order ${orderId}`);
    console.log(`✅ PayPal approval URL: ${approvalUrl}`);
    console.log(`✅ Order created for user: ${decoded.email}`);

    if (!approvalUrl) {
      console.error('❌ No approval URL found in PayPal response');
      console.error('PayPal response links:', result.links);
      return res.status(500).json({
        error: 'No approval URL in PayPal response',
        details: result
      });
    }

    return res.status(200).json({
      orderId,
      approvalUrl,
      status: 'success',
      debug: {
        hasOrderId: !!orderId,
        hasApprovalUrl: !!approvalUrl,
        environment: isProduction ? 'PRODUCTION' : 'SANDBOX'
      }
    });

  } catch (err: any) {
    console.error('paypal/create-payment: Unexpected error:', err);
    console.error('paypal/create-payment: Error stack:', err?.stack);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
