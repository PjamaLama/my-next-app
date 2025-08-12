"use client";

import React, { useEffect, useState } from 'react';
import { useFirebase } from '@/app/providers/FirebaseProvider';

type BetaMeta = { capacity: number; testerCount: number; open: boolean };

export default function AdminPage() {
  const { user } = useFirebase();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<BetaMeta>({ capacity: 100, testerCount: 0, open: false });
  const [saving, setSaving] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const fetchMeta = async () => {
    if (!user || isAdmin !== true) return;
    try {
      setError(null);
      setLoading(true);
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/meta', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Failed to load admin meta (${res.status})`);
      const data = await res.json();
      setMeta({ capacity: data.capacity ?? 100, testerCount: data.testerCount ?? 0, open: !!data.open });
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchMeta(); }, [user, isAdmin]);

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

  const updateMeta = async (updates: Partial<BetaMeta>) => {
    if (!user) return;
    try {
      setSaving(true);
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'updateMeta', ...updates }),
      });
      if (!res.ok) throw new Error(`Failed to update (${res.status})`);
      const data = await res.json();
      setMeta({ capacity: data.capacity ?? 100, testerCount: data.testerCount ?? 0, open: !!data.open });
    } catch (e: any) {
      setError(e?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const grantTester = async (email: string) => {
    if (!user || !email) return;
    try {
      setActionBusy(true);
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'grantTester', email }),
      });
      if (!res.ok) throw new Error(`Grant failed (${res.status})`);
      await fetchMeta();
      setAdminEmail('');
    } catch (e: any) {
      setError(e?.message || 'Grant failed');
    } finally {
      setActionBusy(false);
    }
  };

  const revokeTester = async (email: string) => {
    if (!user || !email) return;
    try {
      setActionBusy(true);
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'revokeTester', email }),
      });
      if (!res.ok) throw new Error(`Revoke failed (${res.status})`);
      await fetchMeta();
      setAdminEmail('');
    } catch (e: any) {
      setError(e?.message || 'Revoke failed');
    } finally {
      setActionBusy(false);
    }
  };

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
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Admin</h1>
        {error && (
          <div className="mb-4 p-3 rounded bg-red-600/20 border border-red-400/40 text-red-200">{error}</div>
        )}

        <div className="glass rounded-xl p-5 border border-white/10 mb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-white/80 text-sm">Private Beta</div>
              {loading ? (
                <div className="text-white/60 text-sm">Loading…</div>
              ) : (
                <div className="text-white">
                  <div className="text-lg font-semibold">{meta.testerCount} / {meta.capacity} {meta.open ? '(Open)' : ''}</div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={meta.open}
                  onChange={(e) => updateMeta({ open: e.target.checked })}
                  disabled={saving || loading}
                />
                Open beta
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={meta.capacity}
                  onChange={(e) => setMeta((m) => ({ ...m, capacity: Math.max(0, Number(e.target.value || 0)) }))}
                  className="w-28 rounded bg-white/10 border border-white/10 px-3 py-2"
                  disabled={saving || loading}
                />
                <button
                  onClick={() => updateMeta({ capacity: meta.capacity })}
                  disabled={saving || loading}
                  className={`px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 ${saving ? 'opacity-60' : ''}`}
                >Save</button>
              </div>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl p-5 border border-white/10">
          <div className="text-white/80 text-sm mb-3">Manage Testers</div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="email"
              placeholder="user@example.com"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className="min-w-[260px] rounded bg-white/10 border border-white/10 px-3 py-2"
              disabled={actionBusy}
            />
            <button
              onClick={() => grantTester(adminEmail)}
              disabled={actionBusy || !adminEmail}
              className={`px-3 py-2 rounded bg-sky-600 hover:bg-sky-500 ${actionBusy ? 'opacity-60' : ''}`}
            >Grant tester</button>
            <button
              onClick={() => revokeTester(adminEmail)}
              disabled={actionBusy || !adminEmail}
              className={`px-3 py-2 rounded bg-red-600 hover:bg-red-500 ${actionBusy ? 'opacity-60' : ''}`}
            >Revoke tester</button>
          </div>
          <p className="text-xs text-white/60 mt-2">Grant/revoke will adjust testerCount atomically.</p>
        </div>

        {/* Feedback management */}
        <AdminFeedbackPanel />
      </div>
    </div>
  );
}

function AdminFeedbackPanel() {
  const { user } = useFirebase();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | 'bug' | 'feature' | 'other'>('all');
  const [status, setStatus] = useState<'all' | 'open' | 'in_progress' | 'closed' | 'merged'>('all');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/feedback?sort=new');
      const json = await res.json();
      setItems(Array.isArray(json?.data) ? json.data : []);
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
    const token = await user.getIdToken();
    await fetch('/api/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, status: next }),
    });
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: next } : it)));
  };

  return (
    <div className="glass rounded-xl p-5 border border-white/10 mt-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="text-white/80 text-sm">Feedback</div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="rounded bg-white/10 border border-white/10 px-3 py-2 text-sm"
          />
          <select value={type} onChange={(e) => setType(e.target.value as any)} className="rounded bg-white/10 border border-white/10 px-2 py-2 text-sm">
            <option value="all">All types</option>
            <option value="feature">Feature</option>
            <option value="bug">Bug</option>
            <option value="other">Other</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="rounded bg-white/10 border border-white/10 px-2 py-2 text-sm">
            <option value="all">All status</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="closed">Closed</option>
            <option value="merged">Merged</option>
          </select>
          <button onClick={load} className="rounded bg-white/10 hover:bg-white/20 px-3 py-2 text-sm">Refresh</button>
        </div>
      </div>

      {loading ? (
        <div className="text-white/60 text-sm">Loading…</div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
          {filtered.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 border border-white/10 rounded-xl p-3">
              <div className="flex items-start gap-3">
                {Array.isArray(item.attachments) && item.attachments[0]?.url ? (
                  <img src={item.attachments[0].url} className="w-16 h-16 rounded-lg object-cover border border-white/10" alt="" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs text-white/40">No img</div>
                )}
                <div>
                  <div className="text-sm font-semibold">{item.title}</div>
                  {item.description ? <div className="text-xs text-white/60 line-clamp-2 mt-0.5">{item.description}</div> : null}
                  <div className="text-xs text-white/50 mt-1">
                    <span className="px-1.5 py-0.5 rounded bg-white/10 mr-1">{item.type}</span>
                    <span className="px-1.5 py-0.5 rounded bg-white/10 mr-1">{item.votesCount || 0} votes</span>
                    {item.createdBy?.email ? <span className="px-1.5 py-0.5 rounded bg-white/10 mr-1">{item.createdBy.email}</span> : null}
                    {item.createdAt ? <span className="px-1.5 py-0.5 rounded bg-white/10">{new Date(item.createdAt).toLocaleString()}</span> : null}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={item.status}
                  onChange={(e) => void updateStatus(item.id, e.target.value)}
                  className="rounded bg-white/10 border border-white/10 px-2 py-1.5 text-xs"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="closed">Closed</option>
                  <option value="merged">Merged</option>
                </select>
              </div>
            </div>)
          )}
          {filtered.length === 0 && <div className="text-white/60 text-sm">No feedback</div>}
        </div>
      )}
    </div>
  );
}

