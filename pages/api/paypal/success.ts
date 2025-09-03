import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, PayerID } = req.query;

    if (!token) {
      console.error('PayPal success: No token provided');
      return res.redirect('/?error=no_token');
    }

    console.log('PayPal success: Token received:', token);
    console.log('PayPal success: PayerID:', PayerID);

    // Redirect to the main page with the token for processing
    // The frontend will handle capturing the payment
    res.redirect(`/?paypal_token=${token}${PayerID ? `&PayerID=${PayerID}` : ''}`);

  } catch (error: any) {
    console.error('PayPal success handler error:', error);
    res.redirect('/?error=paypal_success_error');
  }
}
