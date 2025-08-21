import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getAuth } from 'firebase-admin/auth';

type TutorialVideo = {
  id: string;
  title: string;
  description: string;
  youtubeId: string;
  order: number;
  updatedAt?: any;
};

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
    // Auth check
    const bearer = req.headers.authorization || '';
    const idToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined;
    if (!idToken) return res.status(401).json({ error: 'Unauthorized' });

    const auth = getAuth();
    const decoded = await auth.verifyIdToken(idToken);
    if (!isAllowedAdmin(decoded)) return res.status(403).json({ error: 'Forbidden' });

    const db = getAdminDb();
    const tutorialVideosRef = db.collection('tutorial-videos');

    if (req.method === 'GET') {
      const snap = await tutorialVideosRef.orderBy('order').get();
      const videos: TutorialVideo[] = [];
      
      snap.forEach((doc) => {
        const data = doc.data();
        videos.push({
          id: doc.id,
          title: data.title || '',
          description: data.description || '',
          youtubeId: data.youtubeId || '',
          order: data.order || 0,
          updatedAt: data.updatedAt,
        });
      });

      // If no videos exist, return default ones
      if (videos.length === 0) {
        return res.status(200).json({
          videos: [
            {
              id: 'welcome',
              title: 'Welcome to Sheety AI',
              description: 'Get started with AI-powered data analysis',
              youtubeId: 'dQw4w9WgXcQ',
              order: 0,
            },
            {
              id: 'connect',
              title: 'Connect Your Spreadsheet',
              description: 'Link your Google Sheets to begin analyzing',
              youtubeId: 'dQw4w9WgXcQ',
              order: 1,
            },
            {
              id: 'chat',
              title: 'Chat with Your Data',
              description: 'Ask questions and get intelligent insights',
              youtubeId: 'dQw4w9WgXcQ',
              order: 2,
            },
          ],
        });
      }

      return res.status(200).json({ videos });
    }

    if (req.method === 'POST') {
      const { action, video } = req.body || {};

      if (action === 'updateVideo') {
        if (!video || !video.id) {
          return res.status(400).json({ error: 'Missing video data' });
        }

        const updates: Record<string, any> = {
          title: video.title,
          description: video.description,
          youtubeId: video.youtubeId,
          order: video.order,
          updatedAt: new Date(),
        };

        await tutorialVideosRef.doc(video.id).set(updates, { merge: true });
        
        // Return updated video
        const updatedSnap = await tutorialVideosRef.doc(video.id).get();
        const updatedData = updatedSnap.data();
        return res.status(200).json({
          video: {
            id: video.id,
            title: updatedData?.title || '',
            description: updatedData?.description || '',
            youtubeId: updatedData?.youtubeId || '',
            order: updatedData?.order || 0,
            updatedAt: updatedData?.updatedAt,
          },
        });
      }

      if (action === 'resetToDefaults') {
        // Clear existing videos
        const existingSnap = await tutorialVideosRef.get();
        const batch = db.batch();
        existingSnap.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });

        // Add default videos
        const defaultVideos = [
          {
            id: 'welcome',
            title: 'Welcome to Sheety AI',
            description: 'Get started with AI-powered data analysis',
            youtubeId: 'dQw4w9WgXcQ',
            order: 0,
            updatedAt: new Date(),
          },
          {
            id: 'connect',
            title: 'Connect Your Spreadsheet',
            description: 'Link your Google Sheets to begin analyzing',
            youtubeId: 'dQw4w9WgXcQ',
            order: 1,
            updatedAt: new Date(),
          },
          {
            id: 'chat',
            title: 'Chat with Your Data',
            description: 'Ask questions and get intelligent insights',
            youtubeId: 'dQw4w9WgXcQ',
            order: 2,
            updatedAt: new Date(),
          },
        ];

        defaultVideos.forEach((video) => {
          const docRef = tutorialVideosRef.doc(video.id);
          batch.set(docRef, video);
        });

        await batch.commit();

        return res.status(200).json({ 
          message: 'Reset to defaults successful',
          videos: defaultVideos,
        });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('admin/tutorial-videos error', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
