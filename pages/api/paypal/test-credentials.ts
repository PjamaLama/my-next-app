import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_SECRET_KEY;
  const nodeEnv = process.env.NODE_ENV;

  const credentialsStatus = {
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    clientIdLength: clientId?.length || 0,
    clientSecretLength: clientSecret?.length || 0,
    nodeEnv,
    paypalUrl: nodeEnv === 'production'
      ? 'https://api.paypal.com'
      : 'https://api.sandbox.paypal.com'
  };

  console.log('PayPal credentials test:', credentialsStatus);

  // Test actual API call if credentials are available
  if (clientId && clientSecret) {
    try {
      const paypalUrl = nodeEnv === 'production'
        ? 'https://api.paypal.com'
        : 'https://api.sandbox.paypal.com';

      const paypalAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const testResponse = await fetch(`${paypalUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'en_US',
          'Authorization': `Basic ${paypalAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials'
      });

      const testResult = await testResponse.json();

      if (testResponse.ok) {
        return res.status(200).json({
          status: 'success',
          message: 'PayPal credentials are valid!',
          credentials: credentialsStatus,
          tokenTest: 'successful'
        });
      } else {
        return res.status(200).json({
          status: 'error',
          message: 'PayPal credentials are invalid',
          credentials: credentialsStatus,
          apiError: testResult
        });
      }
    } catch (error: any) {
      return res.status(200).json({
        status: 'error',
        message: 'Failed to test PayPal credentials',
        credentials: credentialsStatus,
        error: error.message
      });
    }
  } else {
    return res.status(200).json({
      status: 'error',
      message: 'PayPal credentials are missing',
      credentials: credentialsStatus
    });
  }
}
