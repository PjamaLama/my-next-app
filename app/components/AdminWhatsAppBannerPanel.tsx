'use client';

import React, { useState, useEffect } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';

interface WhatsAppBannerData {
  bannerMode: 'coming-soon' | 'start-chatting';
  isVisible: boolean;
  updatedAt?: Date;
  updatedBy?: string;
}

export default function AdminWhatsAppBannerPanel() {
  const { user } = useFirebase();
  const [data, setData] = useState<WhatsAppBannerData>({
    bannerMode: 'coming-soon',
    isVisible: true
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/whatsapp-banner', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load WhatsApp banner settings');
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error('Failed to load WhatsApp banner settings:', error);
      setError('Failed to load WhatsApp banner settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [user]);


  const setBannerMode = async (mode: 'coming-soon' | 'start-chatting') => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/whatsapp-banner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'setBannerMode',
          bannerMode: mode,
          isVisible: true // Always show banner when selecting a mode
        })
      });
      if (!res.ok) throw new Error('Failed to update WhatsApp banner mode');
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error('Failed to update WhatsApp banner mode:', error);
      setError('Failed to update WhatsApp banner mode');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/whatsapp-banner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'resetToDefault'
        })
      });
      if (!res.ok) throw new Error('Failed to reset WhatsApp banner to default');
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error('Failed to reset WhatsApp banner to default:', error);
      setError('Failed to reset WhatsApp banner to default');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass rounded-xl p-5 border border-white/10 mt-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="text-white/80 text-sm">WhatsApp Banner Control</div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetToDefault}
            disabled={saving || loading}
            className={`px-3 py-2 rounded bg-amber-600 hover:bg-amber-500 text-sm ${saving || loading ? 'opacity-60' : ''}`}
          >
            {saving ? 'Resetting...' : 'Reset to Default'}
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="rounded bg-white/10 hover:bg-white/20 px-3 py-2 text-sm"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-600/20 border border-red-400/40 text-red-200 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-white/60 text-sm">Loading WhatsApp banner settings...</div>
      ) : (
        <div className="space-y-4">
          {/* Banner Mode Selection */}
          <div className="space-y-3">
            <div className="text-sm font-semibold">Choose Banner Type</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={() => setBannerMode('coming-soon')}
                disabled={saving}
                className={`p-3 rounded-lg border transition-all ${
                  data.bannerMode === 'coming-soon'
                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                    : 'border-white/20 bg-white/5 text-white/60 hover:bg-white/10'
                } ${saving ? 'opacity-60' : ''}`}
              >
                <div className="text-xs font-medium mb-1">Coming Soon Banner</div>
                <div className="text-xs opacity-70">Shows "WhatsApp Integration - Coming soon!"</div>
              </button>
              <button
                onClick={() => setBannerMode('start-chatting')}
                disabled={saving}
                className={`p-3 rounded-lg border transition-all ${
                  data.bannerMode === 'start-chatting'
                    ? 'border-green-500/50 bg-green-500/10 text-green-300'
                    : 'border-white/20 bg-white/5 text-white/60 hover:bg-white/10'
                } ${saving ? 'opacity-60' : ''}`}
              >
                <div className="text-xs font-medium mb-1">Start Chatting Banner</div>
                <div className="text-xs opacity-70">Shows clickable "Start chatting now on WhatsApp"</div>
              </button>
            </div>
            <div className="text-xs text-white/40 text-center">
              Select a banner type to display it to users, or leave unselected to hide banner
            </div>
          </div>

          {/* Banner Preview */}
          <div>
            <label className="block text-xs text-white/60 mb-2">Banner Preview</label>

            <div className="space-y-3">
              {/* Coming Soon Banner */}
              <div className={`p-3 rounded-lg border transition-all ${
                data.bannerMode === 'coming-soon'
                  ? 'border-green-500/50 bg-green-500/5'
                  : 'border-white/10 bg-white/5'
              }`}>
                <div className="text-xs text-white/60 mb-2">Coming Soon Banner:</div>
                <div className="bg-gradient-to-r from-green-600/20 to-green-700/20 border border-green-500/30 rounded-md p-2 inline-block cursor-pointer">
                  <div className="flex items-center gap-2 text-green-300">
                    <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium">WhatsApp Integration Coming soon!</span>
                  </div>
                </div>
              </div>

              {/* Start Chatting Banner */}
              <div className={`p-3 rounded-lg border transition-all ${
                data.bannerMode === 'start-chatting'
                  ? 'border-green-500/50 bg-green-500/5'
                  : 'border-white/10 bg-white/5'
              }`}>
                <div className="text-xs text-white/60 mb-2">Start Chatting Banner:</div>
                <div className="bg-gradient-to-r from-green-600/20 to-green-700/20 border border-green-500/30 rounded-md p-2 inline-block cursor-pointer">
                  <div className="flex items-center gap-2 text-green-300">
                    <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium">Start chatting now on WhatsApp</span>
                    <svg className="w-3 h-3 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {!data.isVisible && (
              <div className="text-xs text-white/40 mt-2">
                Banner is currently hidden from users
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
