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

type MetricsResponse = {
  success: boolean;
  data?: {
    totalUsers: number;
    newUsersToday: number;
    newUsersWeek: number;
    newUsersMonth: number;
    activeUsers: number;
    feedbackCount: number;
    openFeedback: number;
    totalVotes: number;
  };
  error?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<MetricsResponse>) {
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
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get user metrics
    const usersSnap = await db.collection('users').get();
    const totalUsers = usersSnap.size;

    // Count new users
    let newUsersToday = 0;
    let newUsersWeek = 0;
    let newUsersMonth = 0;
    let activeUsers = 0;

    usersSnap.forEach((doc: any) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || 0);

      if (createdAt >= oneDayAgo) newUsersToday++;
      if (createdAt >= oneWeekAgo) newUsersWeek++;
      if (createdAt >= oneMonthAgo) newUsersMonth++;

      // Consider active if created in last 30 days or has recent activity
      const lastActivity = data.lastActivity?.toDate ? data.lastActivity.toDate() : createdAt;
      if (lastActivity >= oneMonthAgo) activeUsers++;
    });

    // Get feedback metrics
    const feedbackSnap = await db.collection('feedback').get();
    const feedbackCount = feedbackSnap.size;

    let openFeedback = 0;
    let totalVotes = 0;

    feedbackSnap.forEach((doc: any) => {
      const data = doc.data();
      if (data.status === 'open') openFeedback++;
      totalVotes += data.votesCount || 0;
    });

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        newUsersToday,
        newUsersWeek,
        newUsersMonth,
        activeUsers,
        feedbackCount,
        openFeedback,
        totalVotes
      }
    });

  } catch (error: any) {
    console.error('Admin metrics error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}
