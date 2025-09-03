import { Client, Environment } from '@paypal/paypal-server-sdk';

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

export { paypalClient };
export { Environment } from '@paypal/paypal-server-sdk';
