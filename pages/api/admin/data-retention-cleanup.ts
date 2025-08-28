import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb, getAdminAuth } from '../../../lib/firebaseAdmin';
import type { DocumentData } from 'firebase-admin/firestore';

const DATA_RETENTION_DAYS = parseInt(process.env.DATA_RETENTION_DAYS || '90');

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

    // Check if user is admin
    const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
    if (!adminEmails.includes(decoded.email || '')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const db = getAdminDb();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DATA_RETENTION_DAYS);

    console.log(`[DATA_RETENTION] Starting cleanup for data older than ${cutoffDate.toISOString()}`);

    let deletedCount = 0;
    let errorCount = 0;

    // Clean up old user profiles (inactive users)
    const userProfilesQuery = db.collectionGroup('profile')
      .where('lastLoginAt', '<', cutoffDate);
    
    const userProfiles = await userProfilesQuery.get();
    
    for (const doc of userProfiles.docs) {
      try {
        // Get the user ID from the document path
        const pathParts = doc.ref.path.split('/');
        const userId = pathParts[1]; // users/{userId}/private/profile
        
        console.log(`[DATA_RETENTION] Deleting old profile for user: ${userId}`);
        
        // Delete the entire user subtree
        await db.recursiveDelete(db.collection('users').doc(userId));
        deletedCount++;
        
      } catch (error) {
        console.error(`[DATA_RETENTION] Error deleting user ${doc.ref.path}:`, error);
        errorCount++;
      }
    }

    // Clean up old recent activity
    const recentActivityQuery = db.collection('recentActivity')
      .where('timestamp', '<', cutoffDate);
    
    const recentActivity = await recentActivityQuery.get();
    
    const batch = db.batch();
    recentActivity.docs.forEach((doc: DocumentData) => {
      batch.delete(doc.ref);
    });
    
    try {
      await batch.commit();
      deletedCount += recentActivity.docs.length;
      console.log(`[DATA_RETENTION] Deleted ${recentActivity.docs.length} old activity records`);
    } catch (error) {
      console.error('[DATA_RETENTION] Error deleting recent activity:', error);
      errorCount++;
    }

    // Clean up old chat sessions
    const chatSessionsQuery = db.collectionGroup('sessions')
      .where('lastActivityAt', '<', cutoffDate);
    
    const chatSessions = await chatSessionsQuery.get();
    
    for (const doc of chatSessions.docs) {
      try {
        await doc.ref.delete();
        deletedCount++;
      } catch (error) {
        console.error(`[DATA_RETENTION] Error deleting chat session ${doc.ref.path}:`, error);
        errorCount++;
      }
    }

    console.log(`[DATA_RETENTION] Cleanup completed. Deleted: ${deletedCount}, Errors: ${errorCount}`);

    return res.status(200).json({
      success: true,
      message: 'Data retention cleanup completed',
      deletedCount,
      errorCount,
      cutoffDate: cutoffDate.toISOString(),
      retentionDays: DATA_RETENTION_DAYS,
      completedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error in data retention cleanup:', error);
    return res.status(500).json({ 
      error: 'Failed to perform data retention cleanup', 
      details: error.message 
    });
  }
}
