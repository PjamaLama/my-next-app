"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { compressImageFile } from '@/lib/imageCompression';

type FeedbackType = 'bug' | 'feature' | 'other';

interface SimilarItem {
  id: string;
  title: string;
  description?: string;
  votesCount?: number;
  userVote?: 1 | -1 | 0;
}

type Attachment = { url: string; mimeType: string; name?: string };

const PERSIST_KEY = 'feedbackModalState_v1';
const COOLDOWN_MS = 800;

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<FeedbackType>('feature');
  const [loading, setLoading] = useState(false);
  const [similar, setSimilar] = useState<SimilarItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<'submit' | 'browse'>('submit');
  const [allItems, setAllItems] = useState<SimilarItem[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [browseQuery, setBrowseQuery] = useState('');
  const { user } = useFirebase();
  const [voting, setVoting] = useState<Record<string, boolean>>({});
  const [voteAnim, setVoteAnim] = useState<Record<string, 'up' | 'down' | null>>({});

  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);

  // Persist state across reloads
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s?.title === 'string') setTitle(s.title);
      if (typeof s?.description === 'string') setDescription(s.description);
      if (s?.type === 'bug' || s?.type === 'feature' || s?.type === 'other') setType(s.type);
      if (s?.view === 'submit' || s?.view === 'browse') setView(s.view);
      if (Array.isArray(s?.attachments)) setAttachments(s.attachments);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      const s = { title, description, type, view, attachments };
      localStorage.setItem(PERSIST_KEY, JSON.stringify(s));
    } catch {}
  }, [title, description, type, view, attachments]);

  useEffect(() => {
    const q = title.trim() + ' ' + description.trim();
    const run = async () => {
      if (q.length < 8) {
        setSimilar([]);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({ action: 'search', q });
        if (user?.uid) params.set('userId', user.uid);
        const res = await fetch(`/api/feedback?${params.toString()}`);
        const data = await res.json();
        setSimilar((data?.data || []).slice(0, 5));
      } catch (_) {
        setSimilar([]);
      } finally {
        setLoading(false);
      }
    };
    const id = setTimeout(run, 350);
    return () => clearTimeout(id);
  }, [title, description, user?.uid]);

  // Listen for global open event to trigger from anywhere (e.g., sidebar button)
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-feedback', handler as EventListener);
    return () => window.removeEventListener('open-feedback', handler as EventListener);
  }, []);

  // Load all feedback when modal opens (for browse tab)
  useEffect(() => {
    if (!open) return;
    setAllLoading(true);
    const params = new URLSearchParams({ sort: 'top' });
    if (user?.uid) params.set('userId', user.uid);
    fetch(`/api/feedback?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => setAllItems(Array.isArray(json?.data) ? json.data : []))
      .catch(() => setAllItems([]))
      .finally(() => setAllLoading(false));
  }, [open, user?.uid]);

  // Upload compressed image and store URL
  const handleFile = async (file: File) => {
    try {
      setUploading(true);
      const { base64, mimeType } = await compressImageFile(file, 1200, 0.75);
      const res = await fetch('/api/feedback?action=upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType, name: file.name }),
      });
      const json = await res.json();
      if (json?.success && json.data?.url) {
        const att: Attachment = { url: json.data.url, mimeType: json.data.mimeType, name: json.data.name };
        setAttachments((arr) => [att]);
      } else {
        alert(json?.error || 'Upload failed');
      }
    } catch (_) {
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = useMemo(() => title.trim().length >= 4, [title]);

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      // If there is a strong match, confirm with the user first
      const strong = similar.find((s) => (s.title || '').toLowerCase().includes(title.trim().toLowerCase()));
      if (strong) {
        const confirmUse = confirm('We found an existing similar request. Upvote that instead?');
        if (confirmUse) {
          if (strong.id) await vote(strong.id, 1);
          setOpen(false);
          setSubmitting(false);
          return;
        }
      }
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          type,
          attachments,
          user: user ? { uid: user.uid, displayName: user.displayName, email: user.email } : undefined,
        }),
      });
      const json = await res.json();
      if (json?.success) {
        setTitle('');
        setDescription('');
        setType('feature');
        setAttachments([]);
        setOpen(false);
      } else {
        alert(json?.error || 'Failed to submit feedback');
      }
    } catch (e) {
      alert('Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  const vote = async (id: string, value: 1 | -1) => {
    if (!user) {
      alert('Please sign in to vote.');
      return;
    }
    if (voting[id]) return;

    setVoting((m) => ({ ...m, [id]: true }));

    const originalSimilar = similar;
    const originalAllItems = allItems;

    // Optimistic UI update
    const optimisticUpdater = (i: SimilarItem) => {
      if (i.id !== id) return i;
      const prevVote = i.userVote ?? 0;
      let newVote: 1 | -1 | 0;
      let delta: number;

      if (prevVote === value) { // un-voting
        newVote = 0;
        delta = -value;
      } else { // new vote or switching vote
        newVote = value;
        delta = newVote - prevVote;
      }
      
      return { ...i, votesCount: (i.votesCount || 0) + delta, userVote: newVote };
    };

    setSimilar(prev => prev.map(optimisticUpdater));
    setAllItems(prev => prev.map(optimisticUpdater));
    setVoteAnim((m) => ({ ...m, [id]: value === 1 ? 'up' : 'down' }));
    setTimeout(() => setVoteAnim((m) => ({ ...m, [id]: null })), 600);

    try {
      const res = await fetch('/api/feedback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, userId: user.uid, value }),
      });

      if (!res.ok) {
        throw new Error('Failed to vote');
      }

      const json = await res.json();
      const serverState = json?.data;

      // Sync with server state
      const serverUpdater = (i: SimilarItem) => {
        if (i.id !== id) return i;
        return { ...i, votesCount: serverState.votesCount, userVote: serverState.userVote };
      };

      setSimilar(prev => prev.map(serverUpdater));
      setAllItems(prev => prev.map(serverUpdater));

    } catch (_) {
      // Revert on error
      setSimilar(originalSimilar);
      setAllItems(originalAllItems);
      alert('Failed to vote. Please try again.');
    } finally {
      setVoting((m) => ({ ...m, [id]: false }));
    }
  };

  return (
    <>
      {/* Mobile floating trigger removed; mobile users can open from the sidebar footer or via the nudge */}

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative bg-zinc-900/95 border border-white/10 rounded-2xl shadow-2xl w-[min(720px,94vw)] p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${view === 'submit' ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white hover:bg-white/5'}`}
                  onClick={() => setView('submit')}
                >
                  Submit
                </button>
                <button
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${view === 'browse' ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white hover:bg-white/5'}`}
                  onClick={() => setView('browse')}
                >
                  Browse & vote
                </button>
              </div>
              <button className="text-white/70 hover:text-white" onClick={() => setOpen(false)} aria-label="Close">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {view === 'submit' ? (
            <div className="space-y-3">
              {/* Top requests quick-pick */}
              {Array.isArray(allItems) && allItems.length > 0 && (
                <div>
                  <div className="text-sm text-white/80 mb-2">Is it any of these top requests?</div>
                  <div className="space-y-2 max-h-36 overflow-auto pr-1">
                      {allItems.slice(0, 5).map((item) => (
                        <div key={item.id} className="flex items-start justify-between gap-2 glass-soft gloss border border-white/10 rounded-xl p-2.5 hover:bg-white/5 transition-colors">
                        <div>
                          <div className="text-sm font-semibold leading-snug">{item.title}</div>
                          {item.description ? (
                            <div className="text-xs text-white/60 line-clamp-2 mt-0.5">{item.description}</div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                           <button
                            type="button"
                             className={`px-2.5 py-1.5 rounded-md text-xs transition-colors duration-150 inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 ${voteAnim[item.id] === 'up' ? 'vote-pop' : ''} disabled:opacity-50`}
                            onClick={() => vote(item.id, 1)}
                            disabled={!user || !!voting[item.id]}
                            title={user ? 'Upvote' : 'Sign in to vote'}
                          >
                             <ThumbsUp className={`w-4 h-4 ${item.userVote === 1 ? 'text-emerald-500' : 'text-white/80'}`} fill={item.userVote === 1 ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            type="button"
                             className={`px-2.5 py-1.5 rounded-md text-xs transition-colors duration-150 inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 ${voteAnim[item.id] === 'down' ? 'vote-pop' : ''} disabled:opacity-50`}
                            onClick={() => vote(item.id, -1)}
                            disabled={!user || !!voting[item.id]}
                            title={user ? 'Downvote' : 'Sign in to vote'}
                          >
                             <ThumbsDown className={`w-4 h-4 ${item.userVote === -1 ? 'text-rose-500' : 'text-white/80'}`} fill={item.userVote === -1 ? 'currentColor' : 'none'} />
                          </button>
                          {typeof item.votesCount === 'number' ? (
                            <span className={`text-xs text-white/90 ml-1 tabular-nums px-1.5 py-0.5 rounded bg-white/10 font-semibold ${voteAnim[item.id] === 'up' ? 'animate-count-up' : ''} ${voteAnim[item.id] === 'down' ? 'animate-count-down' : ''}`}>{item.votesCount.toLocaleString()}</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm text-white/80">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short summary"
                  className="mt-1 w-full rounded-lg bg-zinc-800 border border-white/10 px-3 py-2 outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-sm text-white/80">Details</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional details"
                  rows={4}
                  className="mt-1 w-full rounded-lg bg-zinc-800 border border-white/10 px-3 py-2 outline-none focus:border-emerald-500"
                />
              </div>
              {/* Attachment */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm text-white/80">Attachment</label>
                  {attachments.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-white/60 hover:text-white"
                      onClick={() => setAttachments([])}
                      disabled={uploading}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="mt-1">
                  {attachments.length === 0 ? (
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleFile(f);
                      }}
                      disabled={uploading}
                      className="block w-full text-sm text-white/80 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border file:border-white/10 file:bg-zinc-800 hover:file:bg-zinc-700"
                    />
                  ) : (
                    <div className="flex items-center gap-3">
                      <img src={attachments[0].url} alt={attachments[0].name || 'attachment'} className="w-24 h-24 object-cover rounded-lg border border-white/10" />
                      <span className="text-xs text-white/60">{attachments[0].name || 'image'}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-white/80">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as FeedbackType)}
                  className="rounded-lg bg-zinc-800 border border-white/10 px-3 py-2 outline-none focus:border-emerald-500"
                >
                  <option value="feature">Feature</option>
                  <option value="bug">Bug</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {(loading || similar.length > 0) && (
                <div className="mt-2">
                  <div className="text-sm text-white/60 mb-1">Similar requests</div>
                  <div className="space-y-2 max-h-40 overflow-auto pr-1">
                    {loading && <div className="text-xs text-white/50">Searching…</div>}
                    {!loading && similar.length === 0 && <div className="text-xs text-white/50">No similar items found</div>}
                    {similar.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-2 glass-soft gloss border border-white/10 rounded-xl p-2.5 hover:bg-white/5 transition-colors">
                        <div>
                          <div className="text-sm font-semibold leading-snug">{item.title}</div>
                          {item.description ? (
                            <div className="text-xs text-white/60 line-clamp-2 mt-0.5">{item.description}</div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className={`px-2.5 py-1.5 rounded-md text-xs transition-colors duration-150 inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 ${voteAnim[item.id] === 'up' ? 'vote-pop' : ''} disabled:opacity-50`}
                            onClick={() => vote(item.id, 1)}
                            disabled={!user || !!voting[item.id]}
                            title={user ? 'Upvote' : 'Sign in to vote'}
                          >
                            <ThumbsUp className={`w-4 h-4 ${item.userVote === 1 ? 'text-emerald-500' : 'text-white/80'}`} fill={item.userVote === 1 ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            type="button"
                            className={`px-2.5 py-1.5 rounded-md text-xs transition-colors duration-150 inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 ${voteAnim[item.id] === 'down' ? 'vote-pop' : ''} disabled:opacity-50`}
                            onClick={() => vote(item.id, -1)}
                            disabled={!user || !!voting[item.id]}
                            title={user ? 'Downvote' : 'Sign in to vote'}
                          >
                            <ThumbsDown className={`w-4 h-4 ${item.userVote === -1 ? 'text-rose-500' : 'text-white/80'}`} fill={item.userVote === -1 ? 'currentColor' : 'none'} />
                          </button>
                          {typeof item.votesCount === 'number' ? (
                            <span className={`text-xs text-white/90 ml-1 tabular-nums px-1.5 py-0.5 rounded bg-white/10 font-semibold ${voteAnim[item.id] === 'up' ? 'animate-count-up' : ''} ${voteAnim[item.id] === 'down' ? 'animate-count-down' : ''}`}>{item.votesCount.toLocaleString()}</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  className="px-3 py-2 rounded-lg bg-zinc-800 border border-white/10 text-white/80 hover:bg-zinc-700"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                  onClick={submit}
                  disabled={!canSubmit || submitting}
                >
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </div>
            ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  value={browseQuery}
                  onChange={(e) => setBrowseQuery(e.target.value)}
                  placeholder="Search feedback"
                  className="flex-1 rounded-lg bg-zinc-800 border border-white/10 px-3 py-2 outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    setAllLoading(true);
                    const params = new URLSearchParams({ sort: 'top' });
                    if (user?.uid) params.set('userId', user.uid);
                    fetch(`/api/feedback?${params.toString()}`)
                      .then((r) => r.json())
                      .then((json) => setAllItems(Array.isArray(json?.data) ? json.data : []))
                      .finally(() => setAllLoading(false));
                  }}
                  className="rounded-lg bg-white/10 hover:bg-white/20 text-white/80 px-3 py-2 text-sm"
                >
                  Refresh
                </button>
              </div>
              <div className="max-h-[50vh] overflow-auto pr-1 space-y-2">
                {allLoading ? (
                  <div className="text-sm text-white/60">Loading…</div>
                ) : (
                  (allItems || [])
                    .filter((i) => {
                      const q = browseQuery.trim().toLowerCase();
                      if (!q) return true;
                      const text = `${i.title} ${i.description || ''}`.toLowerCase();
                      return text.includes(q);
                    })
                    .map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-2 glass-soft gloss border border-white/10 rounded-xl p-2.5 hover:bg-white/5 transition-colors">
                        <div>
                          <div className="text-sm font-semibold leading-snug">{item.title}</div>
                          {item.description ? (
                            <div className="text-xs text-white/60 line-clamp-2 mt-0.5">{item.description}</div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className={`px-2.5 py-1.5 rounded-md text-xs transition-colors duration-150 inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 ${voteAnim[item.id] === 'up' ? 'vote-pop' : ''} disabled:opacity-50`}
                            onClick={() => vote(item.id, 1)}
                            disabled={!user || !!voting[item.id]}
                            title={user ? 'Upvote' : 'Sign in to vote'}
                          >
                            <ThumbsUp className={`w-4 h-4 ${item.userVote === 1 ? 'text-emerald-500' : 'text-white/80'}`} fill={item.userVote === 1 ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            type="button"
                            className={`px-2.5 py-1.5 rounded-md text-xs transition-colors duration-150 inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 ${voteAnim[item.id] === 'down' ? 'vote-pop' : ''} disabled:opacity-50`}
                            onClick={() => vote(item.id, -1)}
                            disabled={!user || !!voting[item.id]}
                            title={user ? 'Downvote' : 'Sign in to vote'}
                          >
                            <ThumbsDown className={`w-4 h-4 ${item.userVote === -1 ? 'text-rose-500' : 'text-white/80'}`} fill={item.userVote === -1 ? 'currentColor' : 'none'} />
                          </button>
                          {typeof (item as any).votesCount === 'number' ? (
                            <span className={`text-xs text-white/90 ml-1 tabular-nums px-1.5 py-0.5 rounded bg-white/10 font-semibold ${voteAnim[item.id] === 'up' ? 'animate-count-up' : ''} ${voteAnim[item.id] === 'down' ? 'animate-count-down' : ''}`}>{(item as any).votesCount.toLocaleString()}</span>
                          ) : null}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}


