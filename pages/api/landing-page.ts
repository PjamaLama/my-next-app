import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb } from '../../lib/firebaseAdmin';

type LandingPageDoc = {
  videoUrl?: string;
  videoTitle?: string;
  updatedAt?: Date;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const db = getAdminDb();
    const landingPageRef = db.doc('landingPage/content');

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
  } catch (err: any) {
    console.error('landing-page API error', err);
    // Return default values on error
    return res.status(200).json({
      videoUrl: 'https://www.youtube.com/embed/ZDazRU_PqGc?rel=0&loop=1&playlist=ZDazRU_PqGc&modestbranding=1&showinfo=0',
      videoTitle: 'SheetyAI Demo Video'
    });
  }
}
