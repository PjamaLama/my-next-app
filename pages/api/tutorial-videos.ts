import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb } from '@/lib/firebaseAdmin';
import type { DocumentData } from 'firebase-admin/firestore';

type TutorialVideo = {
  id: string;
  title: string;
  description: string;
  youtubeId: string;
  order: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = getAdminDb();
    const tutorialVideosRef = db.collection('tutorial-videos');
    
    const snap = await tutorialVideosRef.orderBy('order').get();
    const videos: TutorialVideo[] = [];
    
    snap.forEach((doc: DocumentData) => {
      const data = doc.data();
      videos.push({
        id: doc.id,
        title: data.title || '',
        description: data.description || '',
        youtubeId: data.youtubeId || '',
        order: data.order || 0,
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
            id: 'setup',
            title: 'Setup & Templates',
            description: 'Download templates and configure your service account',
            youtubeId: 'dQw4w9WgXcQ',
            order: 1,
          },
          {
            id: 'connect',
            title: 'Connect Your Spreadsheet',
            description: 'Link your Google Sheets to begin analyzing',
            youtubeId: 'dQw4w9WgXcQ',
            order: 2,
          },
          {
            id: 'chat',
            title: 'Chat with Your Data',
            description: 'Ask questions and get intelligent insights',
            youtubeId: 'dQw4w9WgXcQ',
            order: 3,
          },
        ],
      });
    }

    return res.status(200).json({ videos });
  } catch (err: any) {
    console.error('tutorial-videos error', err);
    // Return default videos on error
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
          id: 'setup',
          title: 'Setup & Templates',
          description: 'Download templates and configure your service account',
          youtubeId: 'dQw4w9WgXcQ',
          order: 1,
        },
        {
          id: 'connect',
          title: 'Connect Your Spreadsheet',
          description: 'Link your Google Sheets to begin analyzing',
          youtubeId: 'dQw4w9WgXcQ',
          order: 2,
        },
        {
          id: 'chat',
          title: 'Chat with Your Data',
          description: 'Ask questions and get intelligent insights',
          youtubeId: 'dQw4w9WgXcQ',
          order: 3,
        },
      ],
    });
  }
}
