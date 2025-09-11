import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from 'firebase-admin/auth';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getAdminAuth } from '@/lib/firebaseAdmin';

function isAllowedAdmin(decoded: any): boolean {
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (decoded?.admin === true) return true;
  const email = (decoded?.email || '').toLowerCase();
  return !!email && admins.includes(email);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Initialize admin app if needed
    getAdminDb();
    const bearer = req.headers.authorization || '';
    const idToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined;
    if (!idToken) return res.status(200).json({ isAdmin: false });
    const auth = getAuth();
    const decoded = await auth.verifyIdToken(idToken);
    const isAdmin = isAllowedAdmin(decoded);
    return res.status(200).json({ isAdmin, email: decoded.email || null });
  } catch (err: any) {
    return res.status(200).json({ isAdmin: false });
  }
}


