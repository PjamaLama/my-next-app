import type { NextApiRequest, NextApiResponse } from 'next';

type Data = {
  email: string;
} | {
  error: string;
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    
    console.log('🔍 Environment check:');
    console.log('- Service account email:', serviceAccountEmail ? 'Present' : 'Missing');
    console.log('- Private key:', privateKey ? `Present (${privateKey.length} chars)` : 'Missing');
    
    if (!serviceAccountEmail) {
      return res.status(500).json({ error: 'Service account email not configured' });
    }
    
    if (!privateKey) {
      return res.status(500).json({ error: 'Private key not configured' });
    }

    res.status(200).json({ email: serviceAccountEmail });
  } catch (error) {
    console.error('Error retrieving service account email:', error);
    res.status(500).json({ error: 'Failed to retrieve service account email' });
  }
} 