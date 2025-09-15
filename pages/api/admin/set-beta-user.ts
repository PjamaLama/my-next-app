import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from 'firebase-admin/auth';
import { getAdminDb } from '@/lib/firebaseAdmin';

function isAllowedAdmin(decoded: any): boolean {
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (decoded?.admin === true) return true;
  const email = (decoded?.email || '').toLowerCase();
  return !!email && admins.includes(email);
}

type SetBetaUserResponse = {
  success: boolean;
  data?: {
    uid: string;
    email: string;
    isBetaUser: boolean;
  };
  error?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<SetBetaUserResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Verify admin access
    const bearer = req.headers.authorization || '';
    const idToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined;
    if (!idToken) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const auth = getAuth();
    const decoded = await auth.verifyIdToken(idToken);
    if (!isAllowedAdmin(decoded)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const db = getAdminDb();
    const { email, isBetaUser } = req.body;

    if (!email || typeof isBetaUser !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Missing or invalid email or isBetaUser parameter' });
    }

    // Find user by email
    const usersRef = db.collection('users');
    const userQuery = await usersRef.where('email', '==', email).limit(1).get();

    if (userQuery.empty) {
      return res.status(404).json({ success: false, error: 'User not found with that email' });
    }

    const userDoc = userQuery.docs[0];
    const uid = userDoc.id;

    // Update the user document
    await userDoc.ref.update({
      isBetaUser: isBetaUser
    });

    return res.status(200).json({
      success: true,
      data: {
        uid,
        email,
        isBetaUser
      }
    });

  } catch (error: any) {
    console.error('Admin set beta user error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}
