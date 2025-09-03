import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('PayPal cancel: User cancelled payment');

    // Redirect back to the main page
    res.redirect('/?paypal_cancelled=true');

  } catch (error: any) {
    console.error('PayPal cancel handler error:', error);
    res.redirect('/?error=paypal_cancel_error');
  }
}
