import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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

    console.log('Test Payment Debug Info:', {
      nodeEnv: process.env.NODE_ENV,
      environment: isProduction ? 'PRODUCTION' : 'SANDBOX',
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      paypalUrl,
      hasSandboxCredentials
    });

    if (!clientId || !clientSecret) {
      return res.status(500).json({
        error: 'PayPal credentials missing',
        debug: {
          hasClientId: !!clientId,
          hasClientSecret: !!clientSecret,
          nodeEnv: process.env.NODE_ENV
        }
      });
    }

    const paypalAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // Test order data
    const orderData = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: 'USD',
            value: '1.00', // Small test amount
            breakdown: {
              item_total: {
                currency_code: 'USD',
                value: '1.00',
              },
            },
          },
          items: [
            {
              name: 'Test Payment - SheetyAI',
              description: 'Test payment for SheetyAI',
              quantity: '1',
              unit_amount: {
                currency_code: 'USD',
                value: '1.00',
              },
            },
          ],
        },
      ],
      application_context: {
        return_url: 'http://localhost:3000/api/paypal/success',
        cancel_url: 'http://localhost:3000/api/paypal/cancel',
        brand_name: 'SheetyAI Test',
        user_action: 'PAY_NOW',
      },
    };

    console.log('Test Payment - Making API call to:', paypalUrl);
    console.log('Test Payment - Order data:', JSON.stringify(orderData, null, 2));

    const createResponse = await fetch(`${paypalUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${paypalAuth}`,
        'Accept': 'application/json',
        'PayPal-Request-Id': `test-order-${Date.now()}`,
      },
      body: JSON.stringify(orderData),
    });

    console.log('Test Payment - Response status:', createResponse.status);
    console.log('Test Payment - Response headers:', Object.fromEntries(createResponse.headers.entries()));

    let result;
    try {
      const responseText = await createResponse.text();
      console.log('Test Payment - Raw response:', responseText);

      if (responseText.trim()) {
        result = JSON.parse(responseText);
      } else {
        result = { error: 'Empty response body' };
      }
    } catch (parseError) {
      console.error('Test Payment - Error parsing response:', parseError);
      result = { error: 'Invalid JSON response', parseError: parseError.message };
    }

    if (createResponse.ok) {
      console.log('✅ Test Payment - SUCCESS!');
      console.log('Test Payment - Order created:', result.id);

      return res.status(200).json({
        success: true,
        message: 'PayPal test payment successful!',
        orderId: result.id,
        approvalUrl: result.links?.find((link: any) => link.rel === 'approve')?.href,
        fullResponse: result,
        debug: {
          environment: isProduction ? 'PRODUCTION' : 'SANDBOX',
          paypalUrl,
          status: createResponse.status
        }
      });
    } else {
      console.error('❌ Test Payment - FAILED');
      console.error('Test Payment - Error details:', result);

      return res.status(createResponse.status).json({
        success: false,
        error: 'PayPal test payment failed',
        details: result,
        debug: {
          environment: isProduction ? 'PRODUCTION' : 'SANDBOX',
          paypalUrl,
          status: createResponse.status,
          statusText: createResponse.statusText
        }
      });
    }

  } catch (error: any) {
    console.error('Test Payment - Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unexpected error during test payment',
      details: error.message,
      stack: error.stack
    });
  }
}
