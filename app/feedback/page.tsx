"use client";

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useFirebase } from '../providers/FirebaseProvider';
import { 
  Search, 
  Filter, 
  Plus, 
  TrendingUp, 
  Clock, 
  MessageSquare, 
  Bug, 
  Lightbulb, 
  HelpCircle,
  CheckCircle,
  XCircle,
  AlertCircle,
  GitMerge,
  RefreshCw,
  ChevronDown,
  Star,
  Users,
  Calendar,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';

interface FeedbackItem {
  id: string;
  title: string;
  description?: string;
  type: 'bug' | 'feature' | 'other';
  status?: 'open' | 'in_progress' | 'closed' | 'merged';
  votesCount?: number;
  duplicateOf?: string | null;
  userVote?: 1 | -1 | 0;
  createdAt?: string;
  createdBy?: { displayName?: string; email?: string };
  tags?: string[];
  aiCategory?: string;
}

type SortOption = 'top' | 'new' | 'trending';
type ViewMode = 'grid' | 'list';

export default function FeedbackBoardPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'feature' | 'bug' | 'other'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'closed' | 'merged'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('top');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [newFeedback, setNewFeedback] = useState({ title: '', description: '', type: 'feature' as const });
  const { user } = useFirebase();
  const [voting, setVoting] = useState<Record<string, boolean>>({});
  const [voteAnim, setVoteAnim] = useState<Record<string, 'up' | 'down' | null>>({});

  const load = async (sort: SortOption = sortBy) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort });
      if (user?.uid) params.set('userId', user.uid);
      const res = await fetch(`/api/feedback?${params.toString()}`);
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
      const statusOk = statusFilter === 'all' || i.status === statusFilter;
      const text = `${i.title} ${i.description || ''}`.toLowerCase();
      const qOk = !q || text.includes(q);
      return typeOk && statusOk && qOk;
    });
  }, [items, query, filter, statusFilter]);

  const stats = useMemo(() => {
    const total = items.length;
    const open = items.filter(i => i.status === 'open').length;
    const inProgress = items.filter(i => i.status === 'in_progress').length;
    const closed = items.filter(i => i.status === 'closed').length;
    const merged = items.filter(i => i.status === 'merged').length;
    const features = items.filter(i => i.type === 'feature').length;
    const bugs = items.filter(i => i.type === 'bug').length;
    
    return { total, open, inProgress, closed, merged, features, bugs };
  }, [items]);

  const vote = async (id: string, value: 1 | -1) => {
    if (!user) {
      alert('Please sign in to vote.');
      return;
    }
    if (voting[id]) return;

    setVoting((m) => ({ ...m, [id]: true }));

    const originalItems = items;

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

    setItems(prev => prev.map(optimisticUpdater));
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
      setItems(prev => prev.map(i => {
        if (i.id !== id) return i;
        return { ...i, votesCount: serverState.votesCount, userVote: serverState.userVote };
      }));

    } catch (_) {
      // Revert on error
      setItems(originalItems);
      alert('Failed to vote. Please try again.');
    } finally {
      setVoting((m) => ({ ...m, [id]: false }));
    }
  };

  const submitFeedback = async () => {
    if (!newFeedback.title.trim() || submitting) return;
    setSubmitting(true);
    
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newFeedback.title.trim(),
          description: newFeedback.description.trim(),
          type: newFeedback.type,
          user: user ? { uid: user.uid, displayName: user.displayName, email: user.email } : undefined,
        }),
      });
      
      if (res.ok) {
        setNewFeedback({ title: '', description: '', type: 'feature' });
        setShowSubmitForm(false);
        await load(); // Refresh the list
      } else {
        throw new Error('Failed to submit');
      }
    } catch (e) {
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <AlertCircle className="w-4 h-4 text-blue-500" />;
      case 'in_progress': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'closed': return <XCircle className="w-4 h-4 text-gray-500" />;
      case 'merged': return <GitMerge className="w-4 h-4 text-green-500" />;
      default: return <AlertCircle className="w-4 h-4 text-blue-500" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bug': return <Bug className="w-4 h-4 text-red-500" />;
      case 'feature': return <Lightbulb className="w-4 h-4 text-yellow-500" />;
      case 'other': return <HelpCircle className="w-4 h-4 text-blue-500" />;
      default: return <HelpCircle className="w-4 h-4 text-blue-500" />;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-black">
      {/* Header */}
      <div className="border-b border-white/10 bg-zinc-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
                Feedback Hub
              </h1>
              <p className="text-white/60 mt-1">Help shape the future of Sheety AI</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSubmitForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Submit Feedback
              </button>
              <Link 
                href="/" 
                className="px-4 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                Back to App
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="border-b border-white/10 bg-zinc-800/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="grid grid-cols-2 md:grid-cols-7 gap-4 text-center">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{stats.total}</div>
              <div className="text-xs text-white/60">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">{stats.open}</div>
              <div className="text-xs text-white/60">Open</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-500">{stats.inProgress}</div>
              <div className="text-xs text-white/60">In Progress</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">{stats.merged}</div>
              <div className="text-xs text-white/60">Merged</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">{stats.features}</div>
              <div className="text-xs text-white/60">Features</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{stats.bugs}</div>
              <div className="text-xs text-white/60">Bugs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-500">{stats.closed}</div>
              <div className="text-xs text-white/60">Closed</div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-3 flex-1 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40 w-4 h-4" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search feedback..."
                className="w-full pl-10 pr-4 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
              />
            </div>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                showFilters 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-zinc-800/50 text-white/70 hover:text-white hover:bg-zinc-700/50'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Sort and View Controls */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-800/50 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'grid' 
                    ? 'bg-emerald-600 text-white' 
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
                title="Grid view"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'list' 
                    ? 'bg-emerald-600 text-white' 
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
                title="List view"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <div className="flex items-center bg-zinc-800/50 rounded-lg p-1">
              <button
                onClick={() => { setSortBy('top'); load('top'); }}
                className={`p-2 rounded transition-colors ${
                  sortBy === 'top' 
                    ? 'bg-emerald-600 text-white' 
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
                title="Sort by top votes"
              >
                <TrendingUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setSortBy('new'); load('new'); }}
                className={`p-2 rounded transition-colors ${
                  sortBy === 'new' 
                    ? 'bg-emerald-600 text-white' 
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
                title="Sort by newest"
              >
                <Clock className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => load()}
              className="p-2 bg-zinc-800/50 text-white/60 hover:text-white hover:bg-zinc-700/50 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="mt-4 p-4 bg-zinc-800/30 rounded-lg border border-white/10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Type</label>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as any)}
                  className="w-full px-3 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                >
                  <option value="all">All Types</option>
                  <option value="feature">Feature Requests</option>
                  <option value="bug">Bug Reports</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full px-3 py-2 bg-zinc-800/50 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="closed">Closed</option>
                  <option value="merged">Merged</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => {
                    setFilter('all');
                    setStatusFilter('all');
                    setQuery('');
                  }}
                  className="w-full px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Submit Feedback Form Modal */}
        {showSubmitForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSubmitForm(false)} />
            <div className="relative bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">Submit Feedback</h2>
                <button 
                  onClick={() => setShowSubmitForm(false)}
                  className="text-white/60 hover:text-white p-1"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Title *</label>
                  <input
                    value={newFeedback.title}
                    onChange={(e) => setNewFeedback(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Brief summary of your feedback"
                    className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Description</label>
                  <textarea
                    value={newFeedback.description}
                    onChange={(e) => setNewFeedback(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="More details about your feedback (optional)"
                    rows={4}
                    className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">Type</label>
                  <select
                    value={newFeedback.type}
                    onChange={(e) => setNewFeedback(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                  >
                    <option value="feature">Feature Request</option>
                    <option value="bug">Bug Report</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              
              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-white/10">
                <button
                  onClick={() => setShowSubmitForm(false)}
                  className="px-4 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitFeedback}
                  disabled={!newFeedback.title.trim() || submitting}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                >
                  {submitting ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="mt-8 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto"></div>
              <p className="text-white/60 mt-4">Loading feedback...</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-8 text-center">
            <div className="text-white/40 text-6xl mb-4">💭</div>
            <h3 className="text-xl font-medium text-white/80 mb-2">No feedback found</h3>
            <p className="text-white/60 mb-4">
              {query || filter !== 'all' || statusFilter !== 'all' 
                ? 'Try adjusting your search or filters' 
                : 'Be the first to share feedback!'
              }
            </p>
            {!query && filter === 'all' && statusFilter === 'all' && (
              <button
                onClick={() => setShowSubmitForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Submit First Feedback
              </button>
            )}
          </div>
        ) : (
          <div className={`mt-6 ${
            viewMode === 'grid' 
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' 
              : 'space-y-3'
          }`}>
            {filtered.map((item) => (
              <div 
                key={item.id} 
                className={`glass gloss card-gradient border border-white/10 rounded-2xl p-5 hover:bg-white/5 transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/10 ${
                  viewMode === 'list' ? 'flex items-start gap-4' : ''
                }`}
              >
                {viewMode === 'list' ? (
                  // List View
                  <>
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-zinc-800/50 flex items-center justify-center">
                        {getTypeIcon(item.type)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-white leading-snug">{item.title}</h3>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            item.type === 'feature' ? 'bg-yellow-500/20 text-yellow-300' :
                            item.type === 'bug' ? 'bg-red-500/20 text-red-300' :
                            'bg-blue-500/20 text-blue-300'
                          }`}>
                            {item.type}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            item.status === 'open' ? 'bg-blue-500/20 text-blue-300' :
                            item.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-300' :
                            item.status === 'closed' ? 'bg-gray-500/20 text-gray-300' :
                            'bg-green-500/20 text-green-300'
                          }`}>
                            {item.status || 'open'}
                          </span>
                        </div>
                      </div>
                      
                      {item.description && (
                        <p className="text-white/70 text-sm mb-3 line-clamp-2">{item.description}</p>
                      )}
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-xs text-white/50">
                          {item.createdBy?.displayName && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {item.createdBy.displayName}
                            </span>
                          )}
                          {item.createdAt && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(item.createdAt)}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                              item.userVote === 1 
                                ? 'bg-emerald-600 text-white' 
                                : 'bg-zinc-800 text-white/80 hover:bg-zinc-700 hover:text-white'
                            } ${voteAnim[item.id] === 'up' ? 'vote-pop' : ''}`}
                            onClick={() => vote(item.id, 1)}
                            disabled={!!voting[item.id]}
                            title="Upvote"
                          >
                            <ThumbsUp className="w-4 h-4" />
                          </button>
                          <button
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                              item.userVote === -1 
                                ? 'bg-rose-600 text-white' 
                                : 'bg-zinc-800 text-white/80 hover:bg-zinc-700 hover:text-white'
                            } ${voteAnim[item.id] === 'down' ? 'vote-pop' : ''}`}
                            onClick={() => vote(item.id, -1)}
                            disabled={!!voting[item.id]}
                            title="Downvote"
                          >
                            <ThumbsDown className="w-4 h-4" />
                          </button>
                          <span className={`px-2 py-1 rounded bg-white/10 text-sm text-white/90 font-semibold tabular-nums ${
                            voteAnim[item.id] === 'up' ? 'animate-count-up' : ''} ${
                            voteAnim[item.id] === 'down' ? 'animate-count-down' : ''
                          }`}>
                            {(item.votesCount || 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  // Grid View
                  <>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-zinc-800/50 flex items-center justify-center">
                          {getTypeIcon(item.type)}
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          item.type === 'feature' ? 'bg-yellow-500/20 text-yellow-300' :
                          item.type === 'bug' ? 'bg-red-500/20 text-red-300' :
                          'bg-blue-500/20 text-blue-300'
                        }`}>
                          {item.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(item.status || 'open')}
                        <span className="text-xs text-white/60 capitalize">{item.status || 'open'}</span>
                      </div>
                    </div>
                    
                    <h3 className="text-base font-semibold text-white leading-snug mb-2 line-clamp-2">{item.title}</h3>
                    
                    {item.description && (
                      <p className="text-white/70 text-sm mb-3 line-clamp-3">{item.description}</p>
                    )}
                    
                    <div className="flex items-center justify-between mt-auto">
                      <div className="text-xs text-white/50">
                        {item.createdAt && formatDate(item.createdAt)}
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <button
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                            item.userVote === 1 
                              ? 'bg-emerald-600 text-white' 
                              : 'bg-zinc-800 text-white/80 hover:bg-zinc-700 hover:text-white'
                          } ${voteAnim[item.id] === 'up' ? 'vote-pop' : ''}`}
                          onClick={() => vote(item.id, 1)}
                          disabled={!!voting[item.id]}
                          title="Upvote"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                            item.userVote === -1 
                              ? 'bg-rose-600 text-white' 
                              : 'bg-zinc-800 text-white/80 hover:bg-zinc-700 hover:text-white'
                          } ${voteAnim[item.id] === 'down' ? 'vote-pop' : ''}`}
                          onClick={() => vote(item.id, -1)}
                          disabled={!!voting[item.id]}
                          title="Downvote"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                        <span className={`ml-1 px-1.5 py-0.5 rounded bg-white/10 text-xs text-white/90 font-semibold tabular-nums ${
                          voteAnim[item.id] === 'up' ? 'animate-count-up' : ''} ${
                          voteAnim[item.id] === 'down' ? 'animate-count-down' : ''
                        }`}>
                          {(item.votesCount || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


