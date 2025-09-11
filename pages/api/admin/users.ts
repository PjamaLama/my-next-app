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

type UsersResponse = {
  success: boolean;
  data?: {
    users: any[];
    total: number;
    hasMore: boolean;
  };
  error?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<UsersResponse>) {
  if (req.method !== 'GET') {
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
    const { search, limit = 20, offset = 0 } = req.query;

    let query = db.collection('users').orderBy('createdAt', 'desc');

    // Apply search filter if provided
    if (search && typeof search === 'string') {
      const searchLower = search.toLowerCase();
      // Note: This is a simple implementation. For production, consider using Algolia or similar for better search
      query = query.where('email', '>=', searchLower).where('email', '<=', searchLower + '\uf8ff');
    }

    // Apply pagination
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    const offsetNum = parseInt(offset as string) || 0;

    const usersSnap = await query.limit(limitNum + 1).offset(offsetNum).get();

    const users = usersSnap.docs.slice(0, limitNum).map((doc: any) => {
      const data = doc.data();
      return {
        uid: doc.id,
        email: data.email || null,
        displayName: data.displayName || null,
        wa_id: data.wa_id || null,
        wa_id_updated_at: data.wa_id_updated_at?.toDate?.() || data.wa_id_updated_at || null,
        createdAt: data.createdAt?.toDate?.() || data.createdAt || null,
        lastActivity: data.lastActivity?.toDate?.() || data.lastActivity || null,
        userType: data.userType || 'free',
        upgradedAt: data.upgradedAt?.toDate?.() || data.upgradedAt || null
      };
    });

    const hasMore = usersSnap.docs.length > limitNum;

    // Get total count (this could be optimized with a separate counter collection)
    const totalSnap = await db.collection('users').get();
    const total = totalSnap.size;

    return res.status(200).json({
      success: true,
      data: {
        users,
        total,
        hasMore
      }
    });

  } catch (error: any) {
    console.error('Admin users error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}
