export type FeedbackType = 'bug' | 'feature' | 'other';
export type FeedbackStatus = 'open' | 'in_progress' | 'closed' | 'merged';

export interface FeedbackDoc {
  id?: string;
  title: string;
  description?: string;
  type: FeedbackType;
  status: FeedbackStatus;
  aiCategory?: string;
  tags?: string[];
  normalizedText: string;
  similarityKey?: string;
  duplicateOf?: string | null;
  duplicates?: string[];
  createdBy?: { uid?: string | null; displayName?: string | null; email?: string | null };
  createdAt?: FirebaseFirestore.Timestamp | Date | null;
  updatedAt?: FirebaseFirestore.Timestamp | Date | null;
  // Optional attachments for additional context (e.g., screenshot)
  attachments?: Array<{
    url: string;
    mimeType: string;
    name?: string;
    width?: number;
    height?: number;
  }>;
}


export function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  const stopwords = new Set<string>([
    'the','is','and','a','an','to','of','in','on','for','with','it','this','that','i','you','we','they','be','at','or','as','by','from','can','should','would','could','please','add','support'
  ]);
  return normalizeText(text)
    .split(' ')
    .filter((t) => t && !stopwords.has(t));
}

export function jaccardSimilarity(aTokens: string[], bTokens: string[]): number {
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  const intersection = new Set<string>();
  for (const t of aSet) {
    if (bSet.has(t)) intersection.add(t);
  }
  const unionSize = new Set([...aSet, ...bSet]).size || 1;
  return intersection.size / unionSize;
}

export function scoreSimilarity(query: string, candidate: string): number {
  const q = tokenize(query);
  const c = tokenize(candidate);
  return jaccardSimilarity(q, c);
}

export function heuristicCategory(text: string): FeedbackType {
  const t = normalizeText(text);
  if (/crash|error|bug|fail|issue|broken|doesn\'t|not working|fix/.test(t)) return 'bug';
  if (/feature|request|add|support|integration|enhancement|improve|would like/.test(t)) return 'feature';
  return 'other';
}

export function buildSimilarityKey(text: string): string {
  // Top 5 tokens concatenated as a simple bucket key
  const tokens = tokenize(text);
  return tokens.slice(0, 5).join('-');
}


