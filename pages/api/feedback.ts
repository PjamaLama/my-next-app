import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import type { FeedbackDoc } from '@/lib/feedback';
import { normalizeText, heuristicCategory, scoreSimilarity, buildSimilarityKey } from '@/lib/feedback';

type Data = { success: boolean; data?: unknown; error?: string };

async function listFeedback(sort: string | string[] | undefined) {
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
  return snap.docs.map((d) => {
    const data = d.data() as any;
    const serializeTs = (ts: any) => (ts && typeof ts.toDate === 'function' ? ts.toDate().toISOString() : ts ?? null);
    return {
      id: d.id,
      ...data,
      createdAt: serializeTs(data.createdAt),
      updatedAt: serializeTs(data.updatedAt),
    };
  });
}

async function createFeedback({ title, description, type, user }: { title: string; description?: string; type?: string; user?: { uid?: string | null; displayName?: string | null; email?: string | null } }) {
  const db = getAdminDb();
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
  let delta = value;
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

async function searchSimilar(query: string) {
  const db = getAdminDb();
  const key = buildSimilarityKey(query);
  const snap = await db.collection('feedback').where('similarityKey', '==', key).get();
  const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
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
    // Action-specific endpoints first
    if (method === 'GET' && req.query.action === 'search' && typeof req.query.q === 'string') {
      const results = await searchSimilar(normalizeText(req.query.q));
      return res.status(200).json({ success: true, data: results });
    }
    if (method === 'POST' && req.query.action === 'search') {
      const { query } = req.body || {};
      const results = await searchSimilar(normalizeText(query || ''));
      return res.status(200).json({ success: true, data: results });
    }

    if (method === 'GET') {
      const data = await listFeedback(req.query.sort);
      return res.status(200).json({ success: true, data });
    }
    if (method === 'POST') {
      const { title, description, type, user } = req.body || {};
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ success: false, error: 'title is required' });
      }
      const created = await createFeedback({ title, description, type, user });
      return res.status(200).json({ success: true, data: created });
    }
    if (method === 'PUT') {
      const { id, userId, value } = req.body || {};
      if (!id || !userId || (value !== 1 && value !== -1)) {
        return res.status(400).json({ success: false, error: 'id, userId and value (1|-1) are required' });
      }
      const updated = await voteFeedback({ id, userId, value });
      return res.status(200).json({ success: true, data: updated });
    }
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (e) {
    console.error('Feedback API error', e);
    return res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' });
  }
}


