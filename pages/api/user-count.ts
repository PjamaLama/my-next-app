import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth } from '../../lib/firebaseAdmin';

type UserCountResponse = {
  userCount: number;
  success: boolean;
  error?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<UserCountResponse>) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed', userCount: 0 });

  try {
    const auth = getAdminAuth();
    const listUsersResult = await auth.listUsers();
    
    return res.status(200).json({
      success: true,
      userCount: listUsersResult.users.length
    });
  } catch (err: any) {
    console.error('user-count error', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal error',
      userCount: 0
    });
  }
}
