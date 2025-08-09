"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';
import { ThumbsUp, ThumbsDown } from 'lucide-react';

type FeedbackType = 'bug' | 'feature' | 'other';

interface SimilarItem {
  id: string;
  title: string;
  description?: string;
  votesCount?: number;
  userVote?: 1 | -1 | 0;
}

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

  useEffect(() => {
    const q = title.trim() + ' ' + description.trim();
    const run = async () => {
      if (q.length < 8) {
        setSimilar([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/feedback?action=search&q=${encodeURIComponent(q)}`);
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
  }, [title, description]);

  // Listen for global open event to trigger from anywhere (e.g., sidebar button)
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-feedback', handler as EventListener);
    return () => window.removeEventListener('open-feedback', handler as EventListener);
  }, []);

  // Load all feedback when modal opens (for browse tab)
  useEffect(() => {
    if (!open) return;
    setView('submit');
    setAllLoading(true);
    fetch('/api/feedback?sort=top')
      .then((r) => r.json())
      .then((json) => setAllItems(Array.isArray(json?.data) ? json.data : []))
      .catch(() => setAllItems([]))
      .finally(() => setAllLoading(false));
  }, [open]);

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
          user: user ? { uid: user.uid, displayName: user.displayName, email: user.email } : undefined,
        }),
      });
      const json = await res.json();
      if (json?.success) {
        setTitle('');
        setDescription('');
        setType('feature');
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
    try {
      if (voting[id]) return;
      setVoting((m) => ({ ...m, [id]: true }));
      const res = await fetch('/api/feedback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, userId: user.uid, value }),
      });
      const json = await res.json();
      const newVote = (json?.data?.userVote ?? 0) as 1 | -1 | 0;
      setSimilar((prev) => prev.map((i) => {
        if (i.id !== id) return i;
        const prevVote = i.userVote ?? 0;
        const delta = newVote - prevVote;
        return { ...i, votesCount: (i.votesCount || 0) + delta, userVote: newVote };
      }));
      setAllItems((prev) => prev.map((i) => {
        if (i.id !== id) return i;
        const prevVote = i.userVote ?? 0;
        const delta = newVote - prevVote;
        return { ...i, votesCount: (i.votesCount || 0) + delta, userVote: newVote };
      }));
      setVoting((m) => ({ ...m, [id]: false }));
    } catch (_) {}
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
                      <div key={item.id} className="flex items-start justify-between gap-2 bg-zinc-800/70 border border-white/10 rounded-lg p-2 hover:bg-zinc-800 transition-colors">
                        <div>
                          <div className="text-sm font-semibold leading-snug">{item.title}</div>
                          {item.description ? (
                            <div className="text-xs text-white/60 line-clamp-2 mt-0.5">{item.description}</div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className={`px-2.5 py-1.5 rounded-md text-xs transition-all duration-150 inline-flex items-center gap-1 ${item.userVote === 1 ? 'bg-emerald-600 text-white ring-1 ring-emerald-400/40 shadow' : 'bg-zinc-800 text-white/80 hover:bg-zinc-700 hover:text-white active:scale-95'} disabled:opacity-50`}
                            onClick={() => vote(item.id, 1)}
                            disabled={!user || !!voting[item.id]}
                            title={user ? 'Upvote' : 'Sign in to vote'}
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            className={`px-2.5 py-1.5 rounded-md text-xs transition-all duration-150 inline-flex items-center gap-1 ${item.userVote === -1 ? 'bg-rose-600 text-white ring-1 ring-rose-400/40 shadow' : 'bg-zinc-800 text-white/80 hover:bg-zinc-700 hover:text-white active:scale-95'} disabled:opacity-50`}
                            onClick={() => vote(item.id, -1)}
                            disabled={!user || !!voting[item.id]}
                            title={user ? 'Downvote' : 'Sign in to vote'}
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                          {typeof item.votesCount === 'number' ? (
                            <span className="text-xs text-white/80 ml-1 tabular-nums px-1.5 py-0.5 rounded bg-white/10">{item.votesCount.toLocaleString()}</span>
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
                      <div key={item.id} className="flex items-start justify-between gap-2 bg-zinc-800/70 border border-white/10 rounded-lg p-2 hover:bg-zinc-800 transition-colors">
                        <div>
                          <div className="text-sm font-semibold leading-snug">{item.title}</div>
                          {item.description ? (
                            <div className="text-xs text-white/60 line-clamp-2 mt-0.5">{item.description}</div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className={`px-2.5 py-1.5 rounded-md text-xs transition-all duration-150 inline-flex items-center gap-1 ${item.userVote === 1 ? 'bg-emerald-600 text-white ring-1 ring-emerald-400/40 shadow' : 'bg-zinc-800 text-white/80 hover:bg-zinc-700 hover:text-white active:scale-95'} disabled:opacity-50`}
                            onClick={() => vote(item.id, 1)}
                            disabled={!user || !!voting[item.id]}
                            title={user ? 'Upvote' : 'Sign in to vote'}
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            className={`px-2.5 py-1.5 rounded-md text-xs transition-all duration-150 inline-flex items-center gap-1 ${item.userVote === -1 ? 'bg-rose-600 text-white ring-1 ring-rose-400/40 shadow' : 'bg-zinc-800 text-white/80 hover:bg-zinc-700 hover:text-white active:scale-95'} disabled:opacity-50`}
                            onClick={() => vote(item.id, -1)}
                            disabled={!user || !!voting[item.id]}
                            title={user ? 'Downvote' : 'Sign in to vote'}
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                          {typeof item.votesCount === 'number' ? (
                            <span className="text-xs text-white/80 ml-1 tabular-nums px-1.5 py-0.5 rounded bg-white/10">{item.votesCount.toLocaleString()}</span>
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
                    fetch('/api/feedback?sort=top')
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
                      <div key={item.id} className="flex items-start justify-between gap-2 bg-zinc-800/70 border border-white/10 rounded-lg p-2 hover:bg-zinc-800 transition-colors">
                        <div>
                          <div className="text-sm font-semibold leading-snug">{item.title}</div>
                          {item.description ? (
                            <div className="text-xs text-white/60 line-clamp-2 mt-0.5">{item.description}</div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className={`px-2.5 py-1.5 rounded-md text-xs transition-all duration-150 inline-flex items-center gap-1 ${item.userVote === 1 ? 'bg-emerald-600 text-white ring-1 ring-emerald-400/40 shadow' : 'bg-zinc-800 text-white/80 hover:bg-zinc-700 hover:text-white active:scale-95'} disabled:opacity-50`}
                            onClick={() => vote(item.id, 1)}
                            disabled={!user || !!voting[item.id]}
                            title={user ? 'Upvote' : 'Sign in to vote'}
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            className={`px-2.5 py-1.5 rounded-md text-xs transition-all duration-150 inline-flex items-center gap-1 ${item.userVote === -1 ? 'bg-rose-600 text-white ring-1 ring-rose-400/40 shadow' : 'bg-zinc-800 text-white/80 hover:bg-zinc-700 hover:text-white active:scale-95'} disabled:opacity-50`}
                            onClick={() => vote(item.id, -1)}
                            disabled={!user || !!voting[item.id]}
                            title={user ? 'Downvote' : 'Sign in to vote'}
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                          {typeof (item as any).votesCount === 'number' ? (
                            <span className="text-xs text-white/80 ml-1 tabular-nums px-1.5 py-0.5 rounded bg-white/10">{(item as any).votesCount.toLocaleString()}</span>
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


