"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';
import { ThumbsUp, ThumbsDown, Plus, Grid3X3, Layers } from 'lucide-react';
import { compressImageFile } from '@/lib/imageCompression';
import SwipeableFeedbackStack from './SwipeableFeedbackStack';

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
  const [browseViewMode, setBrowseViewMode] = useState<'list' | 'swipe'>('list');
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

  const canSubmit = useMemo(() => title.trim().length >= 4 && description.trim().length >= 10, [title, description]);

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
        <div className="fixed inset-0 z-[60] flex items-center justify-center modal-backdrop">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
                     <div className="relative bg-zinc-900/95 border border-white/10 rounded-2xl shadow-2xl w-[min(900px,95vw)] h-[min(800px,90vh)] p-6 modal-content">
            {/* Header with enhanced design */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600/20 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Feedback Hub</h2>
                  <p className="text-sm text-white/60">Help us improve Sheety AI</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="text-white/70 hover:text-white p-1" onClick={() => setOpen(false)} aria-label="Close">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-2 mb-6">
              <button
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  view === 'submit' 
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/25' 
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
                onClick={() => setView('submit')}
              >
                Submit Feedback
              </button>
              <button
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  view === 'browse' 
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/25' 
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
                onClick={() => setView('browse')}
              >
                Browse & Vote
              </button>
            </div>

            {view === 'submit' ? (
            <div className="space-y-4">
              {/* Top requests quick-pick */}
              {Array.isArray(allItems) && allItems.length > 0 && (
                <div className="p-4 bg-zinc-800/30 rounded-xl border border-white/10">
                  <div className="text-sm text-white/80 mb-3 font-medium">Is it any of these top requests?</div>
                  <div className="space-y-2 max-h-36 overflow-auto pr-1">
                      {allItems.slice(0, 5).map((item) => (
                        <div key={item.id} className="flex items-start justify-between gap-3 glass-soft gloss border border-white/10 rounded-xl p-3 hover:bg-white/5 transition-all duration-200 feedback-interactive">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold leading-snug text-white">{item.title}</div>
                          {item.description ? (
                            <div className="text-xs text-white/60 line-clamp-2 mt-1">{item.description}</div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                           <button
                            type="button"
                             className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 ${voteAnim[item.id] === 'up' ? 'vote-pop' : ''} disabled:opacity-50`}
                            onClick={() => vote(item.id, 1)}
                            disabled={!user || !!voting[item.id]}
                            title={user ? 'Upvote' : 'Sign in to vote'}
                          >
                             <ThumbsUp className={`w-4 h-4 ${item.userVote === 1 ? 'text-emerald-500' : 'text-white/80'}`} fill={item.userVote === 1 ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            type="button"
                             className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 ${voteAnim[item.id] === 'down' ? 'vote-pop' : ''} disabled:opacity-50`}
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
              
              {/* Form Fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Title *</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief summary of your feedback"
                    className="w-full px-4 py-3 rounded-lg bg-zinc-800/50 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all duration-200"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Description *</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Please provide details about your feedback"
                    rows={4}
                    className="w-full px-4 py-3 rounded-lg bg-zinc-800/50 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all duration-200"
                    required
                  />
                </div>
                
                {/* Attachment */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-white/80">Attachment</label>
                    {attachments.length > 0 && (
                      <button
                        type="button"
                        className="text-xs text-white/60 hover:text-white transition-colors"
                        onClick={() => setAttachments([])}
                        disabled={uploading}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div>
                    {attachments.length === 0 ? (
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleFile(f);
                        }}
                        disabled={uploading}
                        className="block w-full text-sm text-white/80 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border file:border-white/10 file:bg-zinc-800 hover:file:bg-zinc-700 file:transition-colors"
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
                  <label className="text-sm font-medium text-white/80">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as FeedbackType)}
                    className="rounded-lg bg-zinc-800/50 border border-white/10 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all duration-200"
                  >
                    <option value="feature">Feature Request</option>
                    <option value="bug">Bug Report</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Similar requests */}
              {(loading || similar.length > 0) && (
                <div className="mt-4 p-4 bg-zinc-800/30 rounded-xl border border-white/10">
                  <div className="text-sm text-white/80 mb-3 font-medium">Similar requests</div>
                  <div className="space-y-2 max-h-40 overflow-auto pr-1">
                    {loading && <div className="text-xs text-white/50">Searching…</div>}
                    {!loading && similar.length === 0 && <div className="text-xs text-white/50">No similar items found</div>}
                    {similar.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-3 glass-soft gloss border border-white/10 rounded-xl p-3 hover:bg-white/5 transition-all duration-200 feedback-interactive">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold leading-snug text-white">{item.title}</div>
                          {item.description ? (
                            <div className="text-xs text-white/60 line-clamp-2 mt-1">{item.description}</div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 ${voteAnim[item.id] === 'up' ? 'vote-pop' : ''} disabled:opacity-50`}
                            onClick={() => vote(item.id, 1)}
                            disabled={!user || !!voting[item.id]}
                            title={user ? 'Upvote' : 'Sign in to vote'}
                          >
                            <ThumbsUp className={`w-4 h-4 ${item.userVote === 1 ? 'text-emerald-500' : 'text-white/80'}`} fill={item.userVote === 1 ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            type="button"
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 ${voteAnim[item.id] === 'down' ? 'vote-pop' : ''} disabled:opacity-50`}
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

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  className="px-4 py-2 rounded-lg bg-zinc-800/50 border border-white/10 text-white/80 hover:bg-zinc-700/50 hover:text-white transition-all duration-200"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50 transition-all duration-200 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30"
                  onClick={submit}
                  disabled={!canSubmit || submitting}
                >
                  {submitting ? 'Submitting…' : 'Submit Feedback'}
                </button>
              </div>
            </div>
            ) : (
            <div className="space-y-4">
              {/* Browse Controls */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    value={browseQuery}
                    onChange={(e) => setBrowseQuery(e.target.value)}
                    placeholder="Search feedback..."
                    className="w-full pl-4 pr-4 py-3 rounded-lg bg-zinc-800/50 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all duration-200"
                  />
                </div>
                
                
                
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
                  className="px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-all duration-200 shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30"
                >
                  Refresh
                </button>
              </div>
              
                             {/* Swipeable Feedback Stack */}
               <div className="max-h-[60vh] overflow-hidden">
                {allLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500"></div>
                    <span className="ml-2 text-white/60">Loading...</span>
                  </div>
                ) : (
                  <SwipeableFeedbackStack
                    items={allItems.filter((i) => {
                      const q = browseQuery.trim().toLowerCase();
                      if (!q) return true;
                      const text = `${i.title} ${i.description || ''}`.toLowerCase();
                      return text.includes(q);
                    })}
                    onVote={vote}
                    onSkip={(id) => {
                      // Skip logic - could be used for analytics or just to move to next item
                      console.log('Skipped item:', id);
                    }}
                    className="max-w-full"
                  />
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


