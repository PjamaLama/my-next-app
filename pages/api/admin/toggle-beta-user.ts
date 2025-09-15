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

type ToggleBetaUserResponse = {
  success: boolean;
  data?: {
    uid: string;
    isBetaUser: boolean;
  };
  error?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<ToggleBetaUserResponse>) {
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
    const { uid, isBetaUser } = req.body;

    if (!uid || typeof isBetaUser !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Missing or invalid uid or isBetaUser parameter' });
    }

    // Update the user document
    const userDocRef = db.collection('users').doc(uid);
    await userDocRef.update({
      isBetaUser: isBetaUser
    });

    return res.status(200).json({
      success: true,
      data: {
        uid,
        isBetaUser
      }
    });

  } catch (error: any) {
    console.error('Admin toggle beta user error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}
