import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb, getAdminAuth } from '../../../lib/firebaseAdmin';
import { auditLogger } from '../../../lib/auditLogger';

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

    // Users can only export their own data
    if (userId !== uid) {
      return res.status(403).json({ error: 'You can only export your own data' });
    }

    const db = getAdminDb();
    
    // Collect all user data
    const userData: any = {
      exportDate: new Date().toISOString(),
      userId: uid,
      userEmail: decoded.email,
      userDisplayName: decoded.displayName,
      userPhotoURL: decoded.photoURL,
      dataTypes: []
    };

    // Get user profile (private data)
    try {
      const profileDoc = await db.doc(`users/${uid}/private/profile`).get();
      if (profileDoc.exists) {
        userData.profile = profileDoc.data();
        userData.dataTypes.push('profile');
      }
    } catch (error) {
      console.warn('Could not fetch private profile:', error);
    }

    // Get main user document for selectedSheetNames and defaultSpreadsheetId
    try {
      const userDoc = await db.doc(`users/${uid}`).get();
      if (userDoc.exists) {
        const userDataDoc = userDoc.data();
        // Add sheet selection data to export
        userData.selectedSheetNames = userDataDoc?.selectedSheetNames || [];
        userData.defaultSpreadsheetId = userDataDoc?.defaultSpreadsheetId || "";
        // Mark as having user document data
        if (!userData.dataTypes.includes('user_document')) {
          userData.dataTypes.push('user_document');
        }
      }
    } catch (error) {
      console.warn('Could not fetch main user document:', error);
    }

    // Get chat sessions
    try {
      const sessionsQuery = db.collection(`users/${uid}/private/sessions`);
      const sessionsSnapshot = await sessionsQuery.get();
      const sessions: any[] = [];
      
      sessionsSnapshot.forEach(doc => {
        const sessionData = doc.data();
        // Remove sensitive data like API keys
        const { geminiApiKey, ...cleanSessionData } = sessionData;
        sessions.push({
          sessionId: doc.id,
          ...cleanSessionData
        });
      });
      
      if (sessions.length > 0) {
        userData.chatSessions = sessions;
        userData.dataTypes.push('chat_sessions');
      }
    } catch (error) {
      console.warn('Could not fetch chat sessions:', error);
    }

    // Get recent activity
    try {
      const activityQuery = db.collection('recentActivity').where('userId', '==', uid);
      const activitySnapshot = await activityQuery.get();
      const activities: any[] = [];
      
      activitySnapshot.forEach(doc => {
        activities.push({
          activityId: doc.id,
          ...doc.data()
        });
      });
      
      if (activities.length > 0) {
        userData.recentActivity = activities;
        userData.dataTypes.push('recent_activity');
      }
    } catch (error) {
      console.warn('Could not fetch recent activity:', error);
    }

    // Get feedback submissions
    try {
      const feedbackQuery = db.collection('feedback').where('createdBy.uid', '==', uid);
      const feedbackSnapshot = await feedbackQuery.get();
      const feedbacks: any[] = [];
      
      feedbackSnapshot.forEach(doc => {
        feedbacks.push({
          feedbackId: doc.id,
          ...doc.data()
        });
      });
      
      if (feedbacks.length > 0) {
        userData.feedback = feedbacks;
        userData.dataTypes.push('feedback');
      }
    } catch (error) {
      console.warn('Could not fetch feedback:', error);
    }

    // Log the data export for audit purposes
    await auditLogger.logDataAccess(
      uid,
      'user_data',
      uid,
      'read',
      true,
      req.socket.remoteAddress || req.headers['x-forwarded-for'] as string,
      req.headers['user-agent']
    );

    // Set response headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="user-data-${uid}-${new Date().toISOString().split('T')[0]}.json"`);
    
    return res.status(200).json(userData);

  } catch (error: any) {
    console.error('Error exporting user data:', error);
    
    // Log the failed export attempt
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
      error: 'Failed to export user data', 
      details: error.message 
    });
  }
}
