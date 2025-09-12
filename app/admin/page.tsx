"use client";

import React, { useEffect, useState } from 'react';
import { useFirebase } from '@/app/providers/FirebaseProvider';
import { useTrackingPanel } from '@/app/providers/TrackingPanelProvider';
import AdminMetricsDashboard from '../components/AdminMetricsDashboard';
import AdminUserManagement from '../components/AdminUserManagement';



export default function AdminPage() {
  const { user } = useFirebase();
  const { isVisible: trackingPanelVisible, setIsVisible: setTrackingPanelVisible } = useTrackingPanel();
  const [error, setError] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);



  useEffect(() => {
    (async () => {
      if (!user) { setIsAdmin(null); return; }
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/whoami', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setIsAdmin(!!data.isAdmin);
      } catch {
        setIsAdmin(false);
      }
    })();
  }, [user]);





  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white bg-[#0b0b0e]">
        <p>Please sign in to access admin.</p>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white bg-[#0b0b0e]">
        <div className="text-center">
          <div className="text-xl font-semibold mb-2">Not authorized</div>
          <p className="text-white/70">Your account does not have admin access.</p>
        </div>
      </div>
    );
  }

  if (isAdmin !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white bg-[#0b0b0e]">
        <div className="text-center text-white/70">Checking access…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] text-white">
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-white/60">Monitor your application metrics, manage users, and handle feedback</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded bg-red-600/20 border border-red-400/40 text-red-200">
            <div className="font-semibold mb-1">Error</div>
            {error}
          </div>
        )}

        <div className="space-y-8">
          {/* Metrics Dashboard */}
          <section>
            <AdminMetricsDashboard />
          </section>

          {/* User Management */}
          <section>
            <AdminUserManagement />
          </section>

          {/* Feedback Management */}
          <section>
            <AdminFeedbackPanel />
          </section>

          {/* Development Tools - Only show in development */}
          {process.env.NODE_ENV === 'development' && (
            <section>
              <AdminDevelopmentTools />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminDevelopmentTools() {
  const { isVisible: trackingPanelVisible, setIsVisible: setTrackingPanelVisible } = useTrackingPanel();

  return (
    <div className="glass rounded-xl p-5 border border-white/10 mt-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="text-white/80 text-sm font-semibold">Development Tools</div>
        <div className="text-xs text-white/60 bg-yellow-600/20 px-2 py-1 rounded">
          Development Only
        </div>
      </div>

      <div className="space-y-4">
        {/* Tracking Status Panel Toggle */}
        <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-white">Tracking Status Panel</div>
            <div className="text-xs text-white/60">
              Toggle visibility of the tracking status panel in the bottom-right corner
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs ${trackingPanelVisible ? 'text-green-400' : 'text-red-400'}`}>
              {trackingPanelVisible ? 'Visible' : 'Hidden'}
            </span>
            <button
              onClick={() => setTrackingPanelVisible(!trackingPanelVisible)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                trackingPanelVisible ? 'bg-green-600' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  trackingPanelVisible ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminFeedbackPanel() {
  const { user } = useFirebase();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | 'bug' | 'feature' | 'other'>('all');
  const [status, setStatus] = useState<'all' | 'open' | 'in_progress' | 'closed' | 'merged'>('all');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/feedback?sort=new');
      const json = await res.json();
      setItems(Array.isArray(json?.data) ? json.data : []);
    } catch (error) {
      console.error('Failed to load feedback:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = (items || []).filter((i) => {
    const matchesQ = !q || (`${i.title} ${i.description || ''}`.toLowerCase().includes(q.toLowerCase()));
    const matchesType = type === 'all' || i.type === type;
    const matchesStatus = status === 'all' || i.status === status;
    return matchesQ && matchesType && matchesStatus;
  });

  const updateStatus = async (id: string, next: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      await fetch('/api/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, status: next }),
      });
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: next } : it)));
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const deleteFeedback = async (id: string) => {
    if (!user) return;
    setDeletingId(id);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/feedback?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setItems((prev) => prev.filter((it) => it.id !== id));
      } else {
        console.error('Failed to delete feedback');
      }
    } catch (error) {
      console.error('Failed to delete feedback:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'in_progress': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'closed': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'merged': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'bug': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'feature': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'other': return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const StatusButton = ({ currentStatus, targetStatus, label, onClick }: {
    currentStatus: string;
    targetStatus: string;
    label: string;
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      disabled={currentStatus === targetStatus}
      className={`px-3 py-1 text-xs font-medium rounded-full border transition-all duration-200 ${
        currentStatus === targetStatus
          ? `${getStatusColor(targetStatus)} cursor-not-allowed opacity-75`
          : `bg-white/5 border-white/20 text-white/60 hover:bg-white/10 hover:border-white/30 hover:text-white/80`
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="glass rounded-xl p-6 border border-white/10 mt-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Feedback Management</h3>
            <p className="text-sm text-white/60">Monitor and manage user feedback</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg border border-white/20 transition-colors duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-white/5 rounded-lg border border-white/10">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <svg className="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search feedback..."
            className="flex-1 bg-transparent border-0 outline-none text-white placeholder-white/40 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-white/60 font-medium">Type:</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="all">All types</option>
            <option value="feature">Feature</option>
            <option value="bug">Bug</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-white/60 font-medium">Status:</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="all">All status</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="closed">Closed</option>
            <option value="merged">Merged</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="flex items-start gap-4 p-4 border border-white/10 rounded-xl bg-white/5">
                <div className="w-16 h-16 bg-white/10 rounded-lg"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-white/10 rounded w-3/4"></div>
                  <div className="h-3 bg-white/10 rounded w-1/2"></div>
                  <div className="flex gap-2">
                    <div className="h-5 bg-white/10 rounded w-16"></div>
                    <div className="h-5 bg-white/10 rounded w-20"></div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-6 bg-white/10 rounded w-16"></div>
                  <div className="h-6 bg-white/10 rounded w-12"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3 max-h-[70vh] overflow-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                <svg className="w-8 h-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h4 className="text-lg font-medium text-white/80 mb-2">No feedback found</h4>
              <p className="text-white/50 text-sm">Try adjusting your filters or check back later for new submissions.</p>
            </div>
          ) : (
            filtered.map((item) => (
              <div key={item.id} className="group relative flex items-start gap-4 p-4 border border-white/10 rounded-xl bg-gradient-to-r from-white/5 to-white/2 hover:from-white/10 hover:to-white/5 transition-all duration-200">
                {/* Image */}
                <div className="flex-shrink-0">
                  {Array.isArray(item.attachments) && item.attachments[0]?.url ? (
                    <img
                      src={item.attachments[0].url}
                      className="w-16 h-16 rounded-lg object-cover border border-white/10"
                      alt=""
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                      <svg className="w-6 h-6 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-white mb-1 line-clamp-1">{item.title}</h4>
                      {item.description && (
                        <p className="text-xs text-white/70 line-clamp-2 mb-3">{item.description}</p>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getTypeColor(item.type)}`}>
                          {item.type}
                        </span>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(item.status)}`}>
                          {item.status.replace('_', ' ')}
                        </span>
                        {item.createdBy?.email && (
                          <span className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded-full">
                            {item.createdBy.email}
                          </span>
                        )}
                        {item.createdAt && (
                          <span className="text-xs text-white/40">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      {/* Status Buttons */}
                      <div className="flex gap-1">
                        <StatusButton
                          currentStatus={item.status}
                          targetStatus="open"
                          label="Open"
                          onClick={() => void updateStatus(item.id, 'open')}
                        />
                        <StatusButton
                          currentStatus={item.status}
                          targetStatus="in_progress"
                          label="Progress"
                          onClick={() => void updateStatus(item.id, 'in_progress')}
                        />
                        <StatusButton
                          currentStatus={item.status}
                          targetStatus="closed"
                          label="Close"
                          onClick={() => void updateStatus(item.id, 'closed')}
                        />
                        <StatusButton
                          currentStatus={item.status}
                          targetStatus="merged"
                          label="Merge"
                          onClick={() => void updateStatus(item.id, 'merged')}
                        />
                      </div>

                      {/* Delete Button */}
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this feedback? This action cannot be undone.')) {
                            void deleteFeedback(item.id);
                          }
                        }}
                        disabled={deletingId === item.id}
                        className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deletingId === item.id ? (
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                        {deletingId === item.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Footer Stats */}
      {!loading && filtered.length > 0 && (
        <div className="mt-6 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between text-sm text-white/60">
            <span>Showing {filtered.length} of {items.length} feedback items</span>
            <div className="flex gap-4">
              <span>Open: {items.filter(i => i.status === 'open').length}</span>
              <span>In Progress: {items.filter(i => i.status === 'in_progress').length}</span>
              <span>Closed: {items.filter(i => i.status === 'closed').length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


