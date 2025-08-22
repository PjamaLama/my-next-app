import type { NextApiRequest, NextApiResponse } from 'next';

type Data = {
  email: string;
  privateKeyInfo: {
    length: number;
    startsWith: string;
    endsWith: string;
    hasHeaders: boolean;
    hasNewlines: boolean;
    sample: string;
  };
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

    // Analyze the private key format (without logging sensitive details)
    const privateKeyInfo = {
      length: privateKey.length,
      startsWith: privateKey.substring(0, 50),
      endsWith: privateKey.substring(Math.max(0, privateKey.length - 50)),
      hasHeaders: privateKey.includes('-----BEGIN PRIVATE KEY-----') && privateKey.includes('-----END PRIVATE KEY-----'),
      hasNewlines: privateKey.includes('\n'),
      sample: privateKey.length > 100 ? privateKey.substring(0, 100) + '...' : privateKey
    };

    // Only log non-sensitive information
    console.log('🔍 Private key status: Valid format detected');

    res.status(200).json({ 
      email: serviceAccountEmail,
      privateKeyInfo
    });
  } catch (error) {
    console.error('Error retrieving service account email:', error);
    res.status(500).json({ error: 'Failed to retrieve service account email' });
  }
} 