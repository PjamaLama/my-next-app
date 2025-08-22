import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb, getAdminAuth } from '../../../lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;
    
    if (!idToken) {
      return res.status(401).json({ error: 'Missing Authorization Bearer token' });
    }

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;

    // Check if user is admin
    const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
    if (!adminEmails.includes(decoded.email || '')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ error: 'targetUserId is required' });
    }

    const db = getAdminDb();
    
    // Recursively delete all user data
    await db.recursiveDelete(db.collection('users').doc(targetUserId));
    
    // Also delete from recentActivity collection
    const recentActivityQuery = db.collection('recentActivity').where('userId', '==', targetUserId);
    const recentActivityDocs = await recentActivityQuery.get();
    
    const batch = db.batch();
    recentActivityDocs.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Log the deletion for audit purposes
    console.log(`[ADMIN] User data deleted for UID: ${targetUserId} by admin: ${decoded.email}`);

    return res.status(200).json({ 
      success: true, 
      message: `User data deleted successfully for UID: ${targetUserId}`,
      deletedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error deleting user data:', error);
    return res.status(500).json({ 
      error: 'Failed to delete user data', 
      details: error.message 
    });
  }
}
