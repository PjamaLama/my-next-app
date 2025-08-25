import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth, getAdminDb } from '../../lib/firebaseAdmin';

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
  wa_id?: string;
} | {
  error: string;
};

export default async function handler(
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

    const idToken = req.headers.authorization?.split('Bearer ')[1];
    let wa_id = undefined;

    if (idToken) {
      try {
        const decodedToken = await getAdminAuth().verifyIdToken(idToken);
        const uid = decodedToken.uid;
        const userDoc = await getAdminDb().collection('users').doc(uid).get();
        if (userDoc.exists) {
          wa_id = userDoc.data()?.wa_id;
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    }

    res.status(200).json({ 
      email: serviceAccountEmail,
      privateKeyInfo,
      wa_id
    });
  } catch (error) {
    console.error('Error retrieving service account email:', error);
    res.status(500).json({ error: 'Failed to retrieve service account email' });
  }
} 