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

  const fetchMeta = async () => {
    if (!user) return;
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

  useEffect(() => { void fetchMeta(); }, [user]);

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
      </div>
    </div>
  );
}


