"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';
import { Plus } from 'lucide-react';
import { compressImageFile } from '@/lib/imageCompression';
import FeedbackList from './FeedbackList';

type FeedbackType = 'bug' | 'feature' | 'other';

interface FeedbackItem {
  id: string;
  title: string;
  description?: string;
  votesCount?: number;
  userVote?: 1 | -1 | 0;
  createdBy?: {
    uid?: string;
    displayName?: string;
    email?: string;
  };
  createdAt?: any; // Can be Firestore timestamp or Date
}

type Attachment = { url: string; mimeType: string; name?: string };

const PERSIST_KEY = 'feedbackModalState_v1';
const TAB_PERSIST_KEY = 'feedbackActiveTab_v1';
const COOLDOWN_MS = 800;

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'submit' | 'browse'>('submit');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<FeedbackType>('feature');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { user } = useFirebase();

  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);

  // Feedback browsing state
  const [allItems, setAllItems] = useState<FeedbackItem[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [voting, setVoting] = useState<Record<string, boolean>>({});
  const [voteAnim, setVoteAnim] = useState<Record<string, 'up' | 'down' | null>>({});
  const [browseQuery, setBrowseQuery] = useState('');

  // Persist state across reloads
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s?.title === 'string') setTitle(s.title);
      if (typeof s?.description === 'string') setDescription(s.description);
      if (s?.type === 'bug' || s?.type === 'feature' || s?.type === 'other') setType(s.type);
      if (Array.isArray(s?.attachments)) setAttachments(s.attachments);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      const s = { title, description, type, attachments };
      localStorage.setItem(PERSIST_KEY, JSON.stringify(s));
    } catch {}
  }, [title, description, type, attachments]);

  // Persist active tab
  useEffect(() => {
    try {
      const savedTab = localStorage.getItem(TAB_PERSIST_KEY);
      if (savedTab === 'submit' || savedTab === 'browse') {
        setActiveTab(savedTab);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(TAB_PERSIST_KEY, activeTab);
    } catch {}
  }, [activeTab]);



  // Listen for global open event to trigger from anywhere (e.g., sidebar button)
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-feedback', handler as EventListener);
    return () => window.removeEventListener('open-feedback', handler as EventListener);
  }, []);

  // Keyboard shortcuts for tab switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      // Ctrl/Cmd + 1 for Submit tab
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        setActiveTab('submit');
      }
      // Ctrl/Cmd + 2 for Browse tab
      if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault();
        setActiveTab('browse');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

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
        setSubmitted(true);
        // Show success state for 2 seconds
        setTimeout(() => {
          setTitle('');
          setDescription('');
          setType('feature');
          setAttachments([]);
          setSubmitted(false);
          setOpen(false);
        }, 2000);
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

    const originalAllItems = allItems;

    // Optimistic UI update
    const optimisticUpdater = (i: FeedbackItem) => {
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
      const serverUpdater = (i: FeedbackItem) => {
        if (i.id !== id) return i;
        return { ...i, votesCount: serverState.votesCount, userVote: serverState.userVote };
      };

      setAllItems(prev => prev.map(serverUpdater));

    } catch (_) {
      // Revert on error
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
                     <div className="relative bg-zinc-900/95 border border-white/10 rounded-2xl shadow-2xl w-[min(1200px,98vw)] max-h-[92vh] h-auto p-0 modal-content overflow-hidden flex flex-col">
            {/* Header with enhanced design */}
            <div className="flex items-center justify-between p-6 pb-4 flex-shrink-0">
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

            {/* Tab Toggles */}
            <div className="flex items-center justify-center px-6 pb-4 flex-shrink-0">
              <div className="flex items-center bg-zinc-800/50 rounded-xl p-1 border border-white/10">
                <button
                  onClick={() => setActiveTab('submit')}
                  className={`px-4 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                    activeTab === 'submit'
                      ? 'bg-emerald-600 text-white shadow-lg'
                      : 'text-white/70 hover:text-white hover:bg-white/5'
                  }`}
                  title="Ctrl/Cmd + 1"
                >
                  <Plus className="w-4 h-4" />
                  Submit
                  <span className="text-xs opacity-60 ml-1">⌘1</span>
                </button>
                <button
                  onClick={() => setActiveTab('browse')}
                  className={`px-4 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                    activeTab === 'browse'
                      ? 'bg-emerald-600 text-white shadow-lg'
                      : 'text-white/70 hover:text-white hover:bg-white/5'
                  }`}
                  title="Ctrl/Cmd + 2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                  </svg>
                  Browse
                  <span className="text-xs opacity-60 ml-1">⌘2</span>
                </button>
              </div>
            </div>

            {/* Main Content - Tabbed Layout */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {/* Submit Tab */}
              {activeTab === 'submit' && (
                <div className="space-y-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-white mb-1">Submit Feedback</h3>
                    <p className="text-sm text-white/60">Share your ideas, report bugs, or give us general feedback</p>
                  </div>

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
                  <label className="text-sm font-medium text-white/80 mb-3 block">
                    📎 Attachment (Optional)
                  </label>
                  <div>
                    {attachments.length === 0 ? (
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleFile(f);
                          }}
                          disabled={uploading}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <div className={`w-full p-6 rounded-xl border-2 border-dashed transition-all duration-200 text-center ${
                          uploading 
                            ? 'border-white/20 bg-zinc-800/30' 
                            : 'border-white/30 bg-zinc-800/20 hover:bg-zinc-800/40 hover:border-white/40'
                        }`}>
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-emerald-600/20 flex items-center justify-center">
                              {uploading ? (
                                <div className="animate-spin w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full"></div>
                              ) : (
                                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
                                </svg>
                              )}
                            </div>
                            <div className="text-sm text-white/80 font-medium">
                              {uploading ? 'Uploading...' : 'Click or drag to upload image'}
                            </div>
                            <div className="text-xs text-white/50">
                              PNG, JPG up to 10MB
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="relative p-4 bg-zinc-800/30 rounded-xl border border-white/10">
                        <div className="flex items-center gap-4">
                          <img 
                            src={attachments[0].url} 
                            alt={attachments[0].name || 'attachment'} 
                            className="w-16 h-16 object-cover rounded-lg border border-white/10" 
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">
                              {attachments[0].name || 'Uploaded image'}
                            </div>
                            <div className="text-xs text-white/50 mt-1">
                              Image attachment
                            </div>
                          </div>
                          <button
                            type="button"
                            className="p-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 transition-all duration-200"
                            onClick={() => setAttachments([])}
                            disabled={uploading}
                            title="Remove attachment"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-white/80 mb-3 block">
                    🏷️ Feedback Type
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'feature', label: 'Feature', icon: '💡', desc: 'New idea' },
                      { value: 'bug', label: 'Bug', icon: '🐛', desc: 'Something broken' },
                      { value: 'other', label: 'Other', icon: '💬', desc: 'General feedback' }
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setType(option.value as FeedbackType)}
                        className={`p-3 rounded-lg border transition-all duration-200 text-left ${
                          type === option.value
                            ? 'border-emerald-500 bg-emerald-600/20 text-white'
                            : 'border-white/10 bg-zinc-800/30 text-white/80 hover:bg-zinc-800/50 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm">{option.icon}</span>
                          <span className="text-sm font-medium">{option.label}</span>
                        </div>
                        <div className="text-xs text-white/50">{option.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>



                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-6 pb-4 border-t border-white/10">
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    {!canSubmit && (
                      <div className="flex items-center gap-1">
                        <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span>Title (4+ chars) and description (10+ chars) required</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="px-5 py-2.5 rounded-lg border border-white/20 text-white/70 hover:text-white hover:bg-white/5 hover:border-white/30 transition-all duration-200 font-medium"
                      onClick={() => setOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={`relative px-8 py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl overflow-hidden ${
                        submitted
                          ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                          : !canSubmit || submitting
                          ? 'bg-zinc-700 text-white/50 cursor-not-allowed'
                          : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-emerald-500/25 hover:shadow-emerald-500/40 transform hover:scale-[1.02] active:scale-[0.98]'
                      }`}
                      onClick={submit}
                      disabled={!canSubmit || submitting || submitted}
                    >
                      {/* Background gradient animation */}
                      {!submitted && !submitting && canSubmit && (
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-emerald-300 opacity-0 hover:opacity-20 transition-opacity duration-300"></div>
                      )}
                      
                      <div className="relative flex items-center justify-center gap-2.5">
                        {submitted ? (
                          <>
                            <div className="animate-bounce">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path>
                              </svg>
                            </div>
                            <span className="font-bold">Success! Thank you!</span>
                          </>
                        ) : submitting ? (
                          <>
                            <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full"></div>
                            <span>Submitting...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
                            </svg>
                            <span>Submit Feedback</span>
                          </>
                        )}
                      </div>
                    </button>
                  </div>
                  </div>
                </div>
              )}

              {/* Browse Tab */}
              {activeTab === 'browse' && (
                <div className="space-y-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-white mb-1">Browse & Vote</h3>
                    <p className="text-sm text-white/60">Review and vote on feedback from the community</p>
                  </div>

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
                  </div>

                  {/* Feedback List */}
                  <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
                    {allLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500"></div>
                        <span className="ml-2 text-white/60">Loading...</span>
                      </div>
                    ) : (
                      <FeedbackList
                        items={allItems.filter((i) => {
                          // Apply search filter only
                          const q = browseQuery.trim().toLowerCase();
                          if (!q) return true;
                          const text = `${i.title} ${i.description || ''}`.toLowerCase();
                          return text.includes(q);
                        })}
                        onVote={vote}
                        className="max-w-full"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}


