"use client";

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useFirebase } from '../providers/FirebaseProvider';

interface FeedbackItem {
  id: string;
  title: string;
  description?: string;
  type: 'bug' | 'feature' | 'other';
  status?: string;
  votesCount?: number;
  duplicateOf?: string | null;
  userVote?: 1 | -1 | 0;
}

export default function FeedbackBoardPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'feature' | 'bug' | 'other'>('all');
  const { user } = useFirebase();
  const [voting, setVoting] = useState<Record<string, boolean>>({});
  const [voteAnim, setVoteAnim] = useState<Record<string, 'up' | 'down' | null>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/feedback?sort=top');
      const json = await res.json();
      setItems(json.data || []);
    } catch (_) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      const typeOk = filter === 'all' || i.type === filter;
      const text = `${i.title} ${i.description || ''}`.toLowerCase();
      const qOk = !q || text.includes(q);
      return typeOk && qOk;
    });
  }, [items, query, filter]);

  const upvoteAndFocus = async (id: string) => {
    setVoteAnim((m) => ({ ...m, [id]: 'up' }));
    setTimeout(() => setVoteAnim((m) => ({ ...m, [id]: null })), 600);
    await vote(id, 1);
  };

  const vote = async (id: string, value: 1 | -1) => {
    if (!user) {
      alert('Please sign in to vote.');
      return;
    }
    if (voting[id]) return;
    const prevVote = (items.find(i => i.id === id)?.userVote ?? 0) as 1 | -1 | 0;
    const optimistic = prevVote === value ? 0 : value;
    // Apply optimistic update immediately
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, votesCount: (i.votesCount || 0) + (optimistic - prevVote), userVote: optimistic } : i));
    setVoteAnim((m) => ({ ...m, [id]: value === 1 ? 'up' : 'down' }));
    setTimeout(() => setVoteAnim((m) => ({ ...m, [id]: null })), 600);
    setVoting((m) => ({ ...m, [id]: true }));
    try {
      const res = await fetch('/api/feedback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, userId: user.uid, value }),
      });
      const json = await res.json();
      const newVote = (json?.data?.userVote ?? 0) as 1 | -1 | 0;
      // Reconcile if server differs
      if (newVote !== optimistic) {
        setItems((prev) => prev.map((i) => {
          if (i.id !== id) return i;
          const current = i.userVote ?? 0;
          const delta = newVote - current;
          return { ...i, votesCount: (i.votesCount || 0) + delta, userVote: newVote };
        }));
      }
    } catch (_) {}
    finally {
      setVoting((m) => ({ ...m, [id]: false }));
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Feedback</h1>
        <Link href="/" className="text-sm text-white/70 hover:text-white">Back</Link>
      </div>

      <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search feedback"
          className="w-full md:w-80 rounded-lg bg-zinc-900 border border-white/10 px-3 py-2"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 w-full md:w-auto"
        >
          <option value="all">All</option>
          <option value="feature">Feature</option>
          <option value="bug">Bug</option>
          <option value="other">Other</option>
        </select>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load()}
            className="rounded-lg bg-white/10 hover:bg-white/20 text-white/80 px-3 py-2 text-sm"
            title="Refresh"
          >
            Refresh
          </button>
          <button
            onClick={async () => {
              setLoading(true);
              try {
                const res = await fetch('/api/feedback?sort=new');
                const json = await res.json();
                setItems(json.data || []);
              } finally {
                setLoading(false);
              }
            }}
            className="rounded-lg bg-white/10 hover:bg-white/20 text-white/80 px-3 py-2 text-sm"
            title="Sort by new"
          >
            Newest
          </button>
          <button
            onClick={async () => {
              setLoading(true);
              try {
                const res = await fetch('/api/feedback?sort=top');
                const json = await res.json();
                setItems(json.data || []);
              } finally {
                setLoading(false);
              }
            }}
            className="rounded-lg bg-white/10 hover:bg-white/20 text-white/80 px-3 py-2 text-sm"
            title="Sort by top"
          >
            Top
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 text-white/60">Loading…</div>
      ) : (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((item) => (
            <div key={item.id} className="glass gloss card-gradient border border-white/10 rounded-2xl p-4 flex flex-col gap-2 hover:bg-white/5 transition-colors tilt-hover">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold leading-snug truncate" title={item.title}>{item.title}</div>
                  {item.description ? (
                    <div className="text-sm text-white/70 mt-1 line-clamp-3">{item.description}</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs bg-white/10 capitalize">{item.type}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-white/50">{item.status || 'open'}</div>
                <div className="flex items-center gap-1">
                  <button
                    className={`relative overflow-hidden px-2.5 py-1.5 rounded-md text-xs inline-flex items-center gap-1 transition-all duration-150 ${item.userVote === 1 ? 'bg-emerald-600 text-white ring-1 ring-emerald-400/40 shadow' : 'bg-zinc-800 text-white/80 hover:bg-zinc-700 hover:text-white active:scale-95'} ${voteAnim[item.id] === 'up' ? 'vote-pop' : ''}`}
                    onClick={() => upvoteAndFocus(item.id)}
                    title="Upvote"
                    aria-pressed={item.userVote === 1}
                    disabled={!!voting[item.id]}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14 9l-2 2-2-2m2 8V7" /></svg>
                    Upvote
                    {voteAnim[item.id] === 'up' ? (
                      <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-emerald-400/50 animate-flash" />
                    ) : null}
                  </button>
                  <button
                    className={`relative overflow-hidden px-2.5 py-1.5 rounded-md text-xs inline-flex items-center gap-1 transition-all duration-150 ${item.userVote === -1 ? 'bg-rose-600 text-white ring-1 ring-rose-400/40 shadow' : 'bg-zinc-800 text-white/80 hover:bg-zinc-700 hover:text-white active:scale-95'} ${voteAnim[item.id] === 'down' ? 'vote-pop' : ''}`}
                    onClick={() => vote(item.id, -1)}
                    title="Downvote"
                    aria-pressed={item.userVote === -1}
                    disabled={!!voting[item.id]}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 15l2-2 2 2m-2-8v10" /></svg>
                    Downvote
                    {voteAnim[item.id] === 'down' ? (
                      <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-rose-400/50 animate-flash" />
                    ) : null}
                  </button>
                  <span className={`ml-1 px-1.5 py-0.5 rounded bg-white/10 text-xs text-white/90 font-semibold tabular-nums ${voteAnim[item.id] === 'up' ? 'animate-count-up' : ''} ${voteAnim[item.id] === 'down' ? 'animate-count-down' : ''}`}>{(item.votesCount || 0).toLocaleString()}</span>
                </div>
              </div>
              {item.duplicateOf ? (
                <div className="text-xs text-white/50">Possible duplicate of {item.duplicateOf}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


