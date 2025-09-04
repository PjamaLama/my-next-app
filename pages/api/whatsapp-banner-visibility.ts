import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb } from '../../lib/firebaseAdmin';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTION_NAME = 'admin_settings';
const DOCUMENT_ID = 'whatsapp_banner';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only allow GET requests for public access
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const db = getFirestore();

    // Get current banner settings
    const docRef = db.collection(COLLECTION_NAME).doc(DOCUMENT_ID);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const data = docSnap.data();
      return res.status(200).json({
        bannerMode: data?.bannerMode ?? 'coming-soon', // Default to coming-soon mode
        isVisible: data?.isVisible ?? true, // Default to visible if not set
        updatedAt: data?.updatedAt?.toDate?.() || data?.updatedAt,
        updatedBy: data?.updatedBy
      });
    } else {
      // Return default settings if document doesn't exist
      return res.status(200).json({
        bannerMode: 'coming-soon',
        isVisible: true,
        updatedAt: null,
        updatedBy: null
      });
    }
  } catch (error) {
    console.error('WhatsApp banner visibility API error:', error);
    // Return default visible state on error to ensure banner shows by default
    return res.status(200).json({
      bannerMode: 'coming-soon',
      isVisible: true,
      updatedAt: null,
      updatedBy: null
    });
  }
}
