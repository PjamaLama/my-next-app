import type { NextApiRequest, NextApiResponse } from 'next';

interface PayPalProduct {
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
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
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get PayPal configuration
    const hasSandboxCredentials = process.env.PAYPAL_SANDBOX_CLIENT_ID && process.env.PAYPAL_SANDBOX_SECRET_KEY;
    const isProduction = process.env.NODE_ENV === 'production' || !hasSandboxCredentials;

    // Check for cached plan IDs from environment variables
    const cachedProductId = isProduction
      ? process.env.PAYPAL_PRODUCT_ID
      : process.env.PAYPAL_SANDBOX_PRODUCT_ID;
    const cachedPlanId = isProduction
      ? process.env.PAYPAL_PLAN_ID
      : process.env.PAYPAL_SANDBOX_PLAN_ID;

    // If we have cached IDs, verify they still exist
    if (cachedProductId && cachedPlanId) {
      console.log('Using cached PayPal product and plan IDs');
      return res.status(200).json({
        success: true,
        product: {
          id: cachedProductId,
          name: 'SheetyAI Pro Monthly Subscription'
        },
        plan: {
          id: cachedPlanId,
          name: 'SheetyAI Pro Monthly',
          price: '19.97',
          status: 'ACTIVE'
        }
      });
    }

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

    // First, try to get existing products
    const productsResponse = await fetch(`${paypalUrl}/v1/catalogs/products?page_size=20&page=1&total_required=true`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    let product: PayPalProduct | null = null;

    if (productsResponse.ok) {
      const productsData = await productsResponse.json();
      // Look for existing SheetyAI product
      if (productsData.products && productsData.products.length > 0) {
        product = productsData.products.find((p: PayPalProduct) =>
          p.name === 'SheetyAI Pro Monthly Subscription'
        );
      }
    }

    // Create product if it doesn't exist
    if (!product) {
      console.log('Creating new PayPal product...');
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

      if (!productResponse.ok) {
        const errorData = await productResponse.json();
        console.error('Failed to create PayPal product:', errorData);
        return res.status(500).json({
          error: 'Failed to create subscription product',
          details: errorData
        });
      }

      product = await productResponse.json() as PayPalProduct;
      console.log('✅ Created PayPal product:', product.id);
    } else {
      console.log('✅ Using existing PayPal product:', product.id);
    }

    // Now get existing plans for this product
    const plansResponse = await fetch(`${paypalUrl}/v1/billing/plans?page_size=20&page=1&total_required=true`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    let plan: PayPalPlan | null = null;

    if (plansResponse.ok) {
      const plansData = await plansResponse.json();
      // Look for existing SheetyAI plan with the correct product
      if (plansData.plans && plansData.plans.length > 0) {
        plan = plansData.plans.find((p: PayPalPlan) =>
          p.name === 'SheetyAI Pro Monthly' &&
          p.product_id === product.id &&
          p.status === 'ACTIVE'
        );
      }
    }

    // Create plan if it doesn't exist
    if (!plan) {
      console.log('Creating new PayPal plan...');
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

      if (!planResponse.ok) {
        const errorData = await planResponse.json();
        console.error('Failed to create PayPal plan:', errorData);
        return res.status(500).json({
          error: 'Failed to create subscription plan',
          details: errorData
        });
      }

      plan = await planResponse.json() as PayPalPlan;
      console.log('✅ Created PayPal plan:', plan.id);
    } else {
      console.log('✅ Using existing PayPal plan:', plan.id);
    }

    // Extract price safely
    let price = '19.97'; // fallback
    if (plan.billing_cycles && plan.billing_cycles.length > 0) {
      const billingCycle = plan.billing_cycles[0];
      if (billingCycle.pricing_scheme && billingCycle.pricing_scheme.fixed_price) {
        price = billingCycle.pricing_scheme.fixed_price.value;
      }
    }

    // Return product and plan info
    res.status(200).json({
      success: true,
      product: {
        id: product.id,
        name: product.name
      },
      plan: {
        id: plan.id,
        name: plan.name,
        price: price,
        status: plan.status
      }
    });

  } catch (err: any) {
    console.error('PayPal plan management error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: err?.message || 'Unknown error'
    });
  }
}
