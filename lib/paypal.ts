import { Client, Environment, orders, payments } from '@paypal/paypal-server-sdk';

const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_SECRET_KEY;

if (!clientId || !clientSecret) {
  throw new Error('PayPal credentials not found in environment variables');
}

// Initialize PayPal client
const paypalClient = new Client({
  clientCredentialsAuthCredentials: {
    oAuthClientId: clientId,
    oAuthClientSecret: clientSecret,
  },
  timeout: 0,
  environment: process.env.NODE_ENV === 'production'
    ? Environment.Production
    : Environment.Sandbox,
});

// Enhanced PayPal client with card processing capabilities
export class EnhancedPayPalClient {
  private client: Client;

  constructor() {
    this.client = paypalClient;
  }

  // Create order with card processing enabled
  async createOrderWithCardSupport(amount: string, currency = 'USD') {
    const order = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: currency,
          value: amount,
        },
      }],
      payment_source: {
        card: {
          attributes: {
            verification: {
              method: 'SCA_ALWAYS'
            }
          }
        }
      },
      application_context: {
        return_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/paypal-success`,
        cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/paypal/cancel`,
        brand_name: 'SheetyAI',
        user_action: 'PAY_NOW',
      },
    };

    const request = new orders.OrdersCreateRequest();
    request.requestBody(order);
    return await this.client.execute(request);
  }

  // Process card payment directly
  async processCardPayment(cardDetails: any, amount: string, currency = 'USD') {
    const payment = {
      intent: 'CAPTURE',
      payer: {
        payment_method: 'paypal'
      },
      transactions: [{
        amount: {
          total: amount,
          currency: currency
        },
        description: 'SheetyAI Pro Subscription'
      }],
      redirect_urls: {
        return_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/paypal-success`,
        cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/paypal/cancel`
      }
    };

    const request = new payments.PaymentCreateRequest();
    request.requestBody(payment);
    return await this.client.execute(request);
  }
}

export { paypalClient };
export { Environment } from '@paypal/paypal-server-sdk';
export { EnhancedPayPalClient };
