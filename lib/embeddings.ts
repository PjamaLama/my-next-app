import { executeAIWithRetry } from './aiUtils';

/**
 * Lightweight Google AI embeddings client for server-side usage.
 * Uses the text-embedding-004 model. Requires GOOGLE_GENAI_API_KEY in env.
 */
const GOOGLE_EMBEDDING_MODEL = 'text-embedding-004';

type EmbedResponse = {
  embeddings: Array<{ values: number[] }>
};

function getApiKey(): string {
  const key = process.env.GOOGLE_GENAI_API_KEY;
  if (!key) {
    throw new Error('Missing GOOGLE_GENAI_API_KEY');
  }
  return key;
}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1/models/${GOOGLE_EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`;

  // Google API accepts one input per request; batch with minimal concurrency
  const results: number[][] = new Array(texts.length);

  await Promise.all(
    texts.map(async (t, i) => {
      const body = {
        content: { parts: [{ text: String(t || '') }] }
      };
      const doCall = async () => {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!resp.ok) {
          const details = await resp.text().catch(() => '');
          throw new Error(`Embedding request failed (${resp.status}): ${details}`);
        }
        const json = (await resp.json()) as EmbedResponse;
        const vec = json?.embeddings?.[0]?.values;
        if (!Array.isArray(vec) || vec.length === 0) {
          throw new Error('Empty embedding vector');
        }
        return vec;
      };
      results[i] = await executeAIWithRetry(doCall, 'Embedding request');
    })
  );

  return results;
}

export function cosineSimilarity(a: number[] | undefined, b: number[] | undefined): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}


