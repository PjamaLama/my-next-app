import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    // Auto-detect environment: production uses live, development uses sandbox
    const isProduction = process.env.NODE_ENV === 'production';

    const clientId = isProduction
      ? process.env.PAYPAL_CLIENT_ID
      : process.env.PAYPAL_SANDBOX_CLIENT_ID || process.env.PAYPAL_CLIENT_ID;

    const clientSecret = isProduction
      ? process.env.PAYPAL_SECRET_KEY
      : process.env.PAYPAL_SANDBOX_SECRET_KEY || process.env.PAYPAL_SECRET_KEY;

    const webhookUrl = process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/paypal/webhook`
      : `http://localhost:3000/api/paypal/webhook`;

    const status = {
      environment: isProduction ? 'production' : 'sandbox',
      webhookConfigured: !!webhookId,
      credentialsConfigured: !!(clientId && clientSecret),
      webhookUrl: webhookUrl,
      requiredHeaders: [
        'paypal-transmission-id',
        'paypal-transmission-time',
        'paypal-transmission-sig',
        'paypal-auth-algo',
        'paypal-cert-url'
      ]
    };

    return res.status(200).json({
      message: 'PayPal Webhook Debug Information',
      status: status,
      setupInstructions: {
        step1: 'Create webhook in PayPal Developer Dashboard',
        step2: 'Set PAYPAL_WEBHOOK_ID in your environment variables',
        step3: 'Configure webhook URL: ' + webhookUrl,
        step4: 'Subscribe to these events: PAYMENT.SALE.COMPLETED, BILLING.SUBSCRIPTION.*',
        setupGuide: 'https://developer.paypal.com/docs/api-basics/notifications/webhooks/'
      }
    });

  } catch (error) {
    console.error('Webhook debug error:', error);
    return res.status(500).json({
      error: 'Debug endpoint failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
