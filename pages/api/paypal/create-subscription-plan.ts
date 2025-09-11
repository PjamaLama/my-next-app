import type { NextApiRequest, NextApiResponse } from 'next';

interface PayPalProduct {
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
  image_url?: string;
  home_url?: string;
}

interface PayPalPlan {
  id: string;
  product_id: string;
  name: string;
  description: string;
  status: string;
  billing_cycles: Array<{
    frequency: {
      interval_unit: string;
      interval_count: number;
    };
    tenure_type: string;
    sequence: number;
    total_cycles: number;
    pricing_scheme: {
      fixed_price: {
        value: string;
        currency_code: string;
      };
    };
  }>;
  payment_preferences: {
    auto_bill_outstanding: boolean;
    setup_fee: {
      value: string;
      currency_code: string;
    };
    setup_fee_failure_action: string;
    payment_failure_threshold: number;
  };
  taxes?: {
    percentage: string;
    inclusive: boolean;
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // WARNING: This endpoint creates duplicate plans. Use /api/paypal/manage-plan instead
    console.warn('⚠️ WARNING: create-subscription-plan endpoint is deprecated and may create duplicate plans. Use /api/paypal/manage-plan instead.');
    // Get PayPal configuration
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

    const accessToken = tokenData.access_token;

    // Step 1: Create Product
    const productData = {
      name: 'SheetyAI Pro Monthly Subscription',
      description: 'Access to all SheetyAI Pro features including unlimited sheets, AI analysis, and premium support.',
      type: 'SERVICE',
      category: 'SOFTWARE'
    };

    const productResponse = await fetch(`${paypalUrl}/v1/catalogs/products`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `product-${Date.now()}`
      },
      body: JSON.stringify(productData)
    });

    const product = await productResponse.json() as PayPalProduct;

    if (!productResponse.ok) {
      console.error('Failed to create PayPal product:', product);
      return res.status(500).json({
        error: 'Failed to create subscription product',
        details: product
      });
    }

    console.log('✅ Created PayPal product:', product.id);

    // Step 2: Create Plan
    const planData = {
      product_id: product.id,
      name: 'SheetyAI Pro Monthly',
      description: 'Monthly subscription to SheetyAI Pro features',
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: {
            interval_unit: 'MONTH',
            interval_count: 1
          },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0, // 0 means infinite
          pricing_scheme: {
            fixed_price: {
              value: '19.97',
              currency_code: 'USD'
            }
          }
        }
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: {
          value: '0.00',
          currency_code: 'USD'
        },
        setup_fee_failure_action: 'CANCEL',
        payment_failure_threshold: 3
      }
    };

    const planResponse = await fetch(`${paypalUrl}/v1/billing/plans`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `plan-${Date.now()}`
      },
      body: JSON.stringify(planData)
    });

    const plan = await planResponse.json() as PayPalPlan;

    if (!planResponse.ok) {
      console.error('Failed to create PayPal plan:', plan);
      return res.status(500).json({
        error: 'Failed to create subscription plan',
        details: plan
      });
    }

    console.log('✅ Created PayPal plan:', plan.id);
    console.log('Plan response structure:', JSON.stringify(plan, null, 2));

    // Extract price safely
    let price = '19.97'; // fallback
    if (plan.billing_cycles && plan.billing_cycles.length > 0) {
      const billingCycle = plan.billing_cycles[0];
      if (billingCycle.pricing_scheme && billingCycle.pricing_scheme.fixed_price) {
        price = billingCycle.pricing_scheme.fixed_price.value;
      }
    }

    // Return both product and plan IDs
    res.status(200).json({
      success: true,
      product: {
        id: product.id,
        name: product.name
      },
      plan: {
        id: plan.id,
        name: plan.name,
        price: price
      }
    });

  } catch (err: any) {
    console.error('PayPal subscription plan creation error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err?.message || 'Unknown error'
    });
  }
}
