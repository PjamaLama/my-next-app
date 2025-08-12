import { getAdminDb } from './firebaseAdmin';
import { embedTexts } from './embeddings';

const db = getAdminDb();

export async function ensureHeaderVectors(
  sheetId: string,
  sheetName: string,
  headers: string[],
  examples: string[] = []
): Promise<boolean> {
  const collectionRef = db.collection('sheet_vectors').doc(sheetId).collection('headers');
  const texts = headers.map((header, index) => `${String(header)} | examples: ${String(examples[index] ?? '')}`);
  const vectors = await embedTexts(texts);

  const batch = db.batch();
  headers.forEach((header, index) => {
    const docId = encodeURIComponent(String(header));
    const docRef = collectionRef.doc(docId);
    batch.set(
      docRef,
      { header, vector: vectors[index] || [], updatedAt: Date.now() },
      { merge: true }
    );
  });
  await batch.commit();
  return true;
}

export async function getHeaderVectors(sheetId: string) {
  const snap = await db.collection('sheet_vectors').doc(sheetId).collection('headers').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function ensureRowVectors(
  sheetId: string,
  sheetName: string,
  rows: string[][],
  startRowIndex = 1
): Promise<boolean> {
  const collectionRef = db.collection('sheet_vectors').doc(sheetId).collection('rows');
  const texts = rows.map((row) => row.join(' | '));
  const vectors = await embedTexts(texts);

  const batch = db.batch();
  rows.forEach((row, index) => {
    const rowIndex = startRowIndex + index;
    const docRef = collectionRef.doc(String(rowIndex));
    batch.set(
      docRef,
      { rowIndex, values: row, vector: vectors[index] || [], updatedAt: Date.now() },
      { merge: true }
    );
  });
  await batch.commit();
  return true;
}

export async function queryRowVectors(sheetId: string, queryVec: number[], topK = 5) {
  const snap = await db.collection('sheet_vectors').doc(sheetId).collection('rows').get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<{
    id: string;
    rowIndex?: number;
    values?: string[];
    vector?: number[];
  }>;

  function dot(a: number[], b: number[]) {
    return a.reduce((sum, value, i) => sum + value * (b[i] ?? 0), 0);
  }
  function norm(a: number[]) {
    return Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
  }

  const qn = norm(queryVec || []);
  const scored = rows
    .map((row) => {
      const v = row.vector || [];
      const score = qn && v.length ? dot(queryVec, v) / (qn * norm(v)) : 0;
      return { ...row, score } as { id: string; rowIndex?: number; values?: string[]; vector?: number[]; score: number };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}


