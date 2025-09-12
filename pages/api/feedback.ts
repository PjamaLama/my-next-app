import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import type { FeedbackDoc } from '@/lib/feedback';
import { normalizeText, heuristicCategory, scoreSimilarity, buildSimilarityKey } from '@/lib/feedback';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import type { DocumentData } from 'firebase-admin/firestore';

type Data = { success: boolean; data?: unknown; error?: string };

function isAllowedAdmin(decoded: any): boolean {
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (decoded?.admin === true) return true;
  const email = (decoded?.email || '').toLowerCase();
  return !!email && admins.includes(email);
}

function resolveBucketName(): string | undefined {
  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID;
  return (
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    (projectId ? `${projectId}.appspot.com` : undefined)
  );
}

async function listFeedback(sort: string | string[] | undefined) {
  const db = getAdminDb();
  let query = db.collection('feedback') as FirebaseFirestore.Query;
  try {
    if (sort === 'new') {
      query = query.orderBy('createdAt', 'desc');
    } else {
      query = query.orderBy('createdAt', 'desc'); // Default to newest first
    }
  } catch (_) {
    // fallback if index/field missing
  }
  const snap = await query.get();
  const serializeTs = (ts: any) => (ts && typeof ts.toDate === 'function' ? ts.toDate().toISOString() : ts ?? null);
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return { id: d.id, ...data, createdAt: serializeTs(data.createdAt), updatedAt: serializeTs(data.updatedAt) };
  });
}

async function createFeedback({ title, description, type, user, ip, attachments = [] }:
  { title: string; description?: string; type?: string; user?: { uid?: string | null; displayName?: string | null; email?: string | null }, ip?: string | null, attachments?: FeedbackDoc['attachments'] }) {
  const db = getAdminDb();
  // Basic server-side cooldown per user (60s)
  try {
    const uid = user?.uid;
    if (uid) {
      const recent = await db.collection('feedback').where('createdBy.uid', '==', uid).orderBy('createdAt', 'desc').limit(1).get();
      if (!recent.empty) {
        const last = recent.docs[0].data().createdAt as any;
        const lastDate = last && typeof last.toDate === 'function' ? last.toDate() : null;
        if (lastDate && Date.now() - lastDate.getTime() < 60_000) {
          throw new Error('Please wait before submitting again.');
        }
      }
    }
  } catch {}
  const normalized = normalizeText(`${title} ${description || ''}`);
  const aiCategory = heuristicCategory(`${title} ${description || ''}`);
  const category = (type === 'bug' || type === 'feature' || type === 'other') ? type : aiCategory;

  // Find similar existing feedbacks (simple heuristic)
  const key = buildSimilarityKey(normalized);
  const candidatesSnap = await db.collection('feedback').where('similarityKey', '==', key).get();
  let duplicateOf: string | null = null;
  let bestScore = 0;
  const newText = `${title} ${description || ''}`;
  candidatesSnap.forEach((doc: DocumentData) => {
    const data = doc.data() as FeedbackDoc;
    const score = scoreSimilarity(newText, data.title + ' ' + (data.description || ''));
    if (score > 0.6 && score > bestScore) {
      bestScore = score;
      duplicateOf = doc.id;
    }
  });

  const payload: FeedbackDoc = {
    title: title.trim(),
    description: description?.trim() || '',
    type: category,
    status: 'open',
    aiCategory,
    tags: [],
    normalizedText: normalized,
    similarityKey: key,
    duplicateOf,
    duplicates: [],
    createdBy: user,
    createdAt: FieldValue.serverTimestamp() as unknown as Date,
    updatedAt: FieldValue.serverTimestamp() as unknown as Date,
    attachments: Array.isArray(attachments) ? attachments.slice(0, 3) : [],
  };

  const ref = await db.collection('feedback').add(payload as any);

  // If duplicate, also add link in parent doc
  if (duplicateOf) {
    await db.collection('feedback').doc(duplicateOf).update({
      duplicates: FieldValue.arrayUnion(ref.id),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  return { id: ref.id, ...payload };
}


async function searchSimilar(query: string) {
  const db = getAdminDb();
  const key = buildSimilarityKey(query);
  const snap = await db.collection('feedback').where('similarityKey', '==', key).get();

  interface FeedbackItem {
    id: string;
    title: string;
    description?: string;
    _score: number;
    [key: string]: any;
  }

  const list: FeedbackItem[] = snap.docs.map((d: DocumentData) => ({ id: d.id, ...(d.data() as any) }));
  // Rank by score
  return list
    .map((item: FeedbackItem) => ({ ...item, _score: scoreSimilarity(query, `${item.title} ${item.description || ''}`) }))
    .filter((x: FeedbackItem) => x._score >= 0.3)
    .sort((a: FeedbackItem, b: FeedbackItem) => b._score - a._score)
    .slice(0, 10);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  try {
    const { method } = req;

    // Upload image (client sends compressed base64)
    if (method === 'POST' && req.query.action === 'upload') {
      // Ensure admin app initialized
      getAdminDb();
      const { imageBase64, mimeType, name } = (req.body || {}) as { imageBase64?: string; mimeType?: string; name?: string };
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ success: false, error: 'imageBase64 is required' });
      }
      const bucketName = resolveBucketName();
      const storage = getStorage();
      const bucket = bucketName ? storage.bucket(bucketName) : storage.bucket();
      const safeMime = mimeType && /^image\/(jpeg|png|webp)$/.test(mimeType) ? mimeType : 'image/jpeg';
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const objectPath = `feedback/${id}.${safeMime === 'image/png' ? 'png' : safeMime === 'image/webp' ? 'webp' : 'jpg'}`;
      const buffer = Buffer.from(imageBase64, 'base64');
      const file = bucket.file(objectPath);
      await file.save(buffer, {
        contentType: safeMime,
        public: true,
        metadata: { cacheControl: 'public, max-age=31536000' },
      });
      const url = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(objectPath)}`;
      return res.status(200).json({ success: true, data: { url, mimeType: safeMime, name: name || objectPath } });
    }
    // Action-specific endpoints first
    if (method === 'GET' && req.query.action === 'search' && typeof req.query.q === 'string') {
      const results = await searchSimilar(normalizeText(req.query.q));
      return res.status(200).json({ success: true, data: results });
    }
    if (method === 'POST' && req.query.action === 'search') {
      const { query, userId } = req.body || {};
      const results = await searchSimilar(normalizeText(query || ''));
      return res.status(200).json({ success: true, data: results });
    }

    if (method === 'GET') {
      const data = await listFeedback(req.query.sort);
      return res.status(200).json({ success: true, data });
    }
    if (method === 'POST') {
      const { title, description, type, user, attachments } = req.body || {};
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ success: false, error: 'title is required' });
      }
      try {
        const created = await createFeedback({ title, description, type, user, attachments: Array.isArray(attachments) ? attachments : [], ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null });
        return res.status(200).json({ success: true, data: created });
      } catch (e) {
        return res.status(429).json({ success: false, error: e instanceof Error ? e.message : 'Rate limited' });
      }
    }
    if (method === 'PATCH') {
      // Admin-only updates: status/tags
      const bearer = req.headers.authorization || '';
      const idToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined;
      if (!idToken) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const auth = getAuth();
      const decoded = await auth.verifyIdToken(idToken);
      if (!isAllowedAdmin(decoded)) return res.status(403).json({ success: false, error: 'Forbidden' });

      const { id, status, tags } = req.body || {};
      if (!id) return res.status(400).json({ success: false, error: 'id is required' });

      const db = getAdminDb();
      const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (status && ['open', 'in_progress', 'closed', 'merged'].includes(status)) updates.status = status;
      if (Array.isArray(tags)) updates.tags = tags.slice(0, 20);

      await db.collection('feedback').doc(id).set(updates, { merge: true });
      const snap = await db.collection('feedback').doc(id).get();
      return res.status(200).json({ success: true, data: { id, ...(snap.data() as any) } });
    }

    if (method === 'DELETE') {
      // Admin-only delete
      const bearer = req.headers.authorization || '';
      const idToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined;
      if (!idToken) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const auth = getAuth();
      const decoded = await auth.verifyIdToken(idToken);
      if (!isAllowedAdmin(decoded)) return res.status(403).json({ success: false, error: 'Forbidden' });

      const { id } = req.query || {};
      if (!id || typeof id !== 'string') return res.status(400).json({ success: false, error: 'id is required' });

      const db = getAdminDb();

      // Get the feedback document to check for attachments and duplicates
      const docRef = db.collection('feedback').doc(id);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return res.status(404).json({ success: false, error: 'Feedback not found' });
      }

      const feedbackData = docSnap.data() as FeedbackDoc;

      // Delete attachments from storage if they exist
      if (feedbackData.attachments && feedbackData.attachments.length > 0) {
        try {
          const storage = getStorage();
          const bucketName = resolveBucketName();
          const bucket = bucketName ? storage.bucket(bucketName) : storage.bucket();

          for (const attachment of feedbackData.attachments) {
            if (attachment.url) {
              // Extract object path from URL
              const urlParts = attachment.url.split('/feedback/');
              if (urlParts.length === 2) {
                const objectPath = `feedback/${urlParts[1]}`;
                try {
                  await bucket.file(objectPath).delete();
                } catch (storageError) {
                  console.warn('Failed to delete attachment:', objectPath, storageError);
                }
              }
            }
          }
        } catch (storageError) {
          console.warn('Error deleting attachments from storage:', storageError);
        }
      }

      // Handle duplicate relationships
      if (feedbackData.duplicateOf) {
        // Remove this feedback from the parent's duplicates array
        try {
          await db.collection('feedback').doc(feedbackData.duplicateOf).update({
            duplicates: FieldValue.arrayRemove(id),
            updatedAt: FieldValue.serverTimestamp(),
          });
        } catch (error) {
          console.warn('Failed to update parent duplicate reference:', error);
        }
      }

      // If this feedback has duplicates, update them
      if (feedbackData.duplicates && feedbackData.duplicates.length > 0) {
        const batch = db.batch();
        feedbackData.duplicates.forEach((duplicateId) => {
          const duplicateRef = db.collection('feedback').doc(duplicateId);
          batch.update(duplicateRef, {
            duplicateOf: null,
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
        try {
          await batch.commit();
        } catch (error) {
          console.warn('Failed to update duplicate references:', error);
        }
      }

      // Delete the feedback document
      await docRef.delete();

      return res.status(200).json({ success: true, data: { id } });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (e) {
    console.error('Feedback API error', e);
    return res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' });
  }
}


