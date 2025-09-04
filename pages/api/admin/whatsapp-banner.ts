import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth, getAdminDb } from '../../../lib/firebaseAdmin';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTION_NAME = 'admin_settings';
const DOCUMENT_ID = 'whatsapp_banner';

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

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken);
    const isAdmin = isAllowedAdmin(decoded);

    if (!isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const db = getFirestore();

    if (req.method === 'GET') {
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
    }

    if (req.method === 'POST') {
      const { action, isVisible, bannerMode } = req.body;

      if (action === 'toggleVisibility') {
        if (typeof isVisible !== 'boolean') {
          return res.status(400).json({ error: 'isVisible must be a boolean' });
        }

        const docRef = db.collection(COLLECTION_NAME).doc(DOCUMENT_ID);

        await docRef.set({
          isVisible,
          updatedAt: new Date(),
          updatedBy: decoded.email || decoded.uid
        }, { merge: true });

        return res.status(200).json({
          isVisible,
          updatedAt: new Date(),
          updatedBy: decoded.email || decoded.uid
        });
      }

      if (action === 'setBannerMode') {
        if (!['coming-soon', 'start-chatting'].includes(bannerMode)) {
          return res.status(400).json({ error: 'bannerMode must be either "coming-soon" or "start-chatting"' });
        }

        const docRef = db.collection(COLLECTION_NAME).doc(DOCUMENT_ID);

        await docRef.set({
          bannerMode,
          updatedAt: new Date(),
          updatedBy: decoded.email || decoded.uid
        }, { merge: true });

        return res.status(200).json({
          bannerMode,
          updatedAt: new Date(),
          updatedBy: decoded.email || decoded.uid
        });
      }

      if (action === 'resetToDefault') {
        const docRef = db.collection(COLLECTION_NAME).doc(DOCUMENT_ID);

        await docRef.set({
          bannerMode: 'coming-soon',
          isVisible: true,
          updatedAt: new Date(),
          updatedBy: decoded.email || decoded.uid
        }, { merge: true });

        return res.status(200).json({
          bannerMode: 'coming-soon',
          isVisible: true,
          updatedAt: new Date(),
          updatedBy: decoded.email || decoded.uid
        });
      }

      return res.status(400).json({ error: 'Invalid action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('WhatsApp banner API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
