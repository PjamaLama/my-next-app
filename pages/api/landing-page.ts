import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb, getAdminAuth } from '../../lib/firebaseAdmin';

type LandingPageDoc = {
  videoUrl?: string;
  videoTitle?: string;
  updatedAt?: Date;
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

async function verifyAdmin(req: NextApiRequest): Promise<boolean> {
  try {
    const bearer = req.headers.authorization || '';
    const idToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined;
    if (!idToken) return false;

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken);
    return isAllowedAdmin(decoded);
  } catch {
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const db = getAdminDb();
    const landingPageRef = db.doc('landingPage/content');

    if (req.method === 'GET') {
      const snap = await landingPageRef.get();
      const data: LandingPageDoc = snap.exists ? (snap.data() as LandingPageDoc) : {
        videoUrl: 'https://www.youtube.com/embed/ZDazRU_PqGc?rel=0&loop=1&playlist=ZDazRU_PqGc&modestbranding=1&showinfo=0',
        videoTitle: 'SheetyAI Demo Video'
      };

      return res.status(200).json({
        videoUrl: data.videoUrl || 'https://www.youtube.com/embed/ZDazRU_PqGc?rel=0&loop=1&playlist=ZDazRU_PqGc&modestbranding=1&showinfo=0',
        videoTitle: data.videoTitle || 'SheetyAI Demo Video',
        updatedAt: data.updatedAt
      });
    }

    if (req.method === 'POST') {
      // Verify admin authorization
      const isAdmin = await verifyAdmin(req);
      if (!isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { action, videoUrl, videoTitle } = req.body || {};

      if (action === 'updateVideo') {
        const updates: Record<string, any> = { updatedAt: new Date() };

        if (typeof videoUrl === 'string' && videoUrl.trim()) {
          updates.videoUrl = videoUrl.trim();
        }

        if (typeof videoTitle === 'string' && videoTitle.trim()) {
          updates.videoTitle = videoTitle.trim();
        }

        await landingPageRef.set(updates, { merge: true });

        const snap = await landingPageRef.get();
        const data = snap.data() as LandingPageDoc;

        return res.status(200).json({
          videoUrl: data.videoUrl || 'https://www.youtube.com/embed/ZDazRU_PqGc?rel=0&loop=1&playlist=ZDazRU_PqGc&modestbranding=1&showinfo=0',
          videoTitle: data.videoTitle || 'SheetyAI Demo Video',
          updatedAt: data.updatedAt
        });
      }

      if (action === 'resetToDefault') {
        const defaultData = {
          videoUrl: 'https://www.youtube.com/embed/ZDazRU_PqGc?rel=0&loop=1&playlist=ZDazRU_PqGc&modestbranding=1&showinfo=0',
          videoTitle: 'SheetyAI Demo Video',
          updatedAt: new Date()
        };

        await landingPageRef.set(defaultData);

        return res.status(200).json({
          videoUrl: defaultData.videoUrl,
          videoTitle: defaultData.videoTitle,
          updatedAt: defaultData.updatedAt
        });
      }

      return res.status(400).json({ error: 'Invalid action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('landing-page API error', err);
    // Return default values on error
    return res.status(200).json({
      videoUrl: 'https://www.youtube.com/embed/ZDazRU_PqGc?rel=0&loop=1&playlist=ZDazRU_PqGc&modestbranding=1&showinfo=0',
      videoTitle: 'SheetyAI Demo Video'
    });
  }
}
