import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import type { FeedbackDoc } from '@/lib/feedback';
import { normalizeText, heuristicCategory, scoreSimilarity, buildSimilarityKey } from '@/lib/feedback';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

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

async function listFeedback(sort: string | string[] | undefined, userId?: string) {
  const db = getAdminDb();
  let query = db.collection('feedback') as FirebaseFirestore.Query;
  try {
    if (sort === 'new') {
      query = query.orderBy('createdAt', 'desc');
    } else {
      query = query.orderBy('votesCount', 'desc');
    }
  } catch (_) {
    // fallback if index/field missing
  }
  const snap = await query.get();
  const serializeTs = (ts: any) => (ts && typeof ts.toDate === 'function' ? ts.toDate().toISOString() : ts ?? null);
  if (!userId) {
    return snap.docs.map((d) => {
      const data = d.data() as any;
      return { id: d.id, ...data, createdAt: serializeTs(data.createdAt), updatedAt: serializeTs(data.updatedAt) };
    });
  }
  const results = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data() as any;
      let userVote: 1 | -1 | 0 = 0;
      try {
        const v = await d.ref.collection('votes').doc(userId).get();
        if (v.exists) userVote = (v.data()?.value ?? 0) as 1 | -1 | 0;
      } catch {}
      return { id: d.id, ...data, userVote, createdAt: serializeTs(data.createdAt), updatedAt: serializeTs(data.updatedAt) };
    })
  );
  return results;
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
  candidatesSnap.forEach((doc) => {
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
    votesCount: 0,
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

async function voteFeedback({ id, userId, value }: { id: string; userId: string; value: 1 | -1 }) {
  const db = getAdminDb();
  const docRef = db.collection('feedback').doc(id);
  const voteRef = docRef.collection('votes').doc(userId);
  const existing = await voteRef.get();
  let delta: number = value;
  let finalUserVote: 1 | -1 | 0 = value;
  if (existing.exists) {
    const prev = existing.data()?.value as 1 | -1;
    if (prev === value) {
      // toggle off
      delta = -value;
      await voteRef.delete();
      finalUserVote = 0;
    } else {
      // switch vote
      delta = value - prev;
      await voteRef.set({ value, createdAt: FieldValue.serverTimestamp() });
      finalUserVote = value;
    }
  } else {
    await voteRef.set({ value, createdAt: FieldValue.serverTimestamp() });
    finalUserVote = value;
  }
  await docRef.update({ votesCount: FieldValue.increment(delta), updatedAt: FieldValue.serverTimestamp() });
  const snap = await docRef.get();
  return { id: snap.id, ...snap.data(), userVote: finalUserVote };
}

async function searchSimilar(query: string, userId?: string) {
  const db = getAdminDb();
  const key = buildSimilarityKey(query);
  const snap = await db.collection('feedback').where('similarityKey', '==', key).get();
  const list = await Promise.all(snap.docs.map(async (d) => {
    const base = { id: d.id, ...(d.data() as any) } as any;
    if (userId) {
      try {
        const v = await d.ref.collection('votes').doc(userId).get();
        base.userVote = v.exists ? (v.data()?.value ?? 0) : 0;
      } catch {}
    }
    return base;
  }));
  // Rank by score
  return list
    .map((item) => ({ ...item, _score: scoreSimilarity(query, `${item.title} ${item.description || ''}`) }))
    .filter((x) => x._score >= 0.3)
    .sort((a, b) => b._score - a._score)
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
      const results = await searchSimilar(normalizeText(req.query.q), typeof req.query.userId === 'string' ? req.query.userId : undefined);
      return res.status(200).json({ success: true, data: results });
    }
    if (method === 'POST' && req.query.action === 'search') {
      const { query, userId } = req.body || {};
      const results = await searchSimilar(normalizeText(query || ''), typeof userId === 'string' ? userId : undefined);
      return res.status(200).json({ success: true, data: results });
    }

    if (method === 'GET') {
      const data = await listFeedback(req.query.sort, typeof req.query.userId === 'string' ? req.query.userId : undefined);
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
    if (method === 'PUT') {
      const { id, userId, value } = req.body || {};
      if (!id || !userId || (value !== 1 && value !== -1)) {
        return res.status(400).json({ success: false, error: 'id, userId and value (1|-1) are required' });
      }
      const updated = await voteFeedback({ id, userId, value });
      return res.status(200).json({ success: true, data: updated });
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

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (e) {
    console.error('Feedback API error', e);
    return res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' });
  }
}


