import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb, getAdminAuth } from '../../../lib/firebaseAdmin';
import { auditLogger } from '../../../lib/auditLogger';
import type { DocumentData } from 'firebase-admin/firestore';

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
    const { userId } = req.body;

    // Users can only delete their own data
    if (userId !== uid) {
      return res.status(403).json({ error: 'You can only delete your own data' });
    }

    const db = getAdminDb();
    
    console.log(`[USER_DELETE] Starting data deletion for user: ${uid}`);

    let deletedCount = 0;
    let errorCount = 0;

    // Delete user profile and all subcollections
    try {
      await db.recursiveDelete(db.collection('users').doc(uid));
      deletedCount++;
      console.log(`[USER_DELETE] Deleted user profile and subcollections for: ${uid}`);
    } catch (error) {
      console.error(`[USER_DELETE] Error deleting user profile for ${uid}:`, error);
      errorCount++;
    }

    // Delete from recent activity collection
    try {
      const recentActivityQuery = db.collection('recentActivity').where('userId', '==', uid);
      const recentActivityDocs = await recentActivityQuery.get();
      
      const batch = db.batch();
      recentActivityDocs.docs.forEach((doc: DocumentData) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      
      deletedCount += recentActivityDocs.docs.length;
      console.log(`[USER_DELETE] Deleted ${recentActivityDocs.docs.length} recent activity records for: ${uid}`);
    } catch (error) {
      console.error(`[USER_DELETE] Error deleting recent activity for ${uid}:`, error);
      errorCount++;
    }

    // Delete feedback submissions
    try {
      const feedbackQuery = db.collection('feedback').where('createdBy.uid', '==', uid);
      const feedbackDocs = await feedbackQuery.get();
      
      const batch = db.batch();
      feedbackDocs.docs.forEach((doc: DocumentData) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      
      deletedCount += feedbackDocs.docs.length;
      console.log(`[USER_DELETE] Deleted ${feedbackDocs.docs.length} feedback records for: ${uid}`);
    } catch (error) {
      console.error(`[USER_DELETE] Error deleting feedback for ${uid}:`, error);
      errorCount++;
    }

    // Delete feedback votes
    try {
      const votesQuery = db.collectionGroup('votes').where('userId', '==', uid);
      const voteDocs = await votesQuery.get();
      
      const batch = db.batch();
      voteDocs.docs.forEach((doc: DocumentData) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      
      deletedCount += voteDocs.docs.length;
      console.log(`[USER_DELETE] Deleted ${voteDocs.docs.length} vote records for: ${uid}`);
    } catch (error) {
      console.error(`[USER_DELETE] Error deleting votes for ${uid}:`, error);
      errorCount++;
    }

    // Log the data deletion for audit purposes
    await auditLogger.logDataAccess(
      uid,
      'user_data',
      uid,
      'delete',
      true,
      req.socket.remoteAddress || req.headers['x-forwarded-for'] as string,
      req.headers['user-agent']
    );

    console.log(`[USER_DELETE] Data deletion completed for user: ${uid}. Deleted: ${deletedCount}, Errors: ${errorCount}`);

    return res.status(200).json({
      success: true,
      message: 'Your data has been deleted successfully',
      deletedCount,
      errorCount,
      deletedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error deleting user data:', error);
    
    // Log the failed deletion attempt
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/id-token-revoked') {
      await auditLogger.logAuth(
        'unknown',
        'login_failed',
        false,
        req.socket.remoteAddress || req.headers['x-forwarded-for'] as string,
        req.headers['user-agent'],
        error.message
      );
    }
    
    return res.status(500).json({ 
      error: 'Failed to delete user data', 
      details: error.message 
    });
  }
}


