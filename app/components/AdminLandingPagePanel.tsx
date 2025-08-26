"use client";

import React, { useState, useEffect } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';

interface LandingPageData {
  videoUrl: string;
  videoTitle: string;
  updatedAt?: Date;
}

export default function AdminLandingPagePanel() {
  const { user } = useFirebase();
  const [data, setData] = useState<LandingPageData>({
    videoUrl: '',
    videoTitle: ''
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/landing-page', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load landing page data');
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error('Failed to load landing page data:', error);
      setError('Failed to load landing page data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [user]);

  const updateVideo = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/landing-page', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          action: 'updateVideo',
          videoUrl: data.videoUrl,
          videoTitle: data.videoTitle
        })
      });
      if (!res.ok) throw new Error('Failed to update video');
      const result = await res.json();
      setData(result);
      setEditing(false);
    } catch (error) {
      console.error('Failed to update video:', error);
      setError('Failed to update video');
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
      const res = await fetch('/api/admin/landing-page', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          action: 'resetToDefault'
        })
      });
      if (!res.ok) throw new Error('Failed to reset to default');
      const result = await res.json();
      setData(result);
      setEditing(false);
    } catch (error) {
      console.error('Failed to reset to default:', error);
      setError('Failed to reset to default');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = () => {
    setEditing(true);
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
    // Reload data to discard changes
    void loadData();
  };

  const extractVideoId = (url: string): string => {
    // Extract YouTube video ID from various URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    
    return url; // Return as-is if no pattern matches
  };

  const generateEmbedUrl = (videoId: string): string => {
    // Clean the video ID (remove any extra parameters)
    const cleanId = videoId.split('?')[0].split('&')[0];
    return `https://www.youtube.com/embed/${cleanId}?rel=0&loop=1&playlist=${cleanId}&modestbranding=1&showinfo=0`;
  };

  const handleVideoUrlChange = (url: string) => {
    const videoId = extractVideoId(url);
    const embedUrl = generateEmbedUrl(videoId);
    setData(prev => ({ ...prev, videoUrl: embedUrl }));
  };

  return (
    <div className="glass rounded-xl p-5 border border-white/10 mt-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="text-white/80 text-sm">Landing Page Video</div>
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
        <div className="text-white/60 text-sm">Loading landing page data...</div>
      ) : (
        <div className="space-y-4">
          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/60 mb-2">Video Title</label>
                <input
                  type="text"
                  value={data.videoTitle}
                  onChange={(e) => setData(prev => ({ ...prev, videoTitle: e.target.value }))}
                  placeholder="SheetyAI Demo Video"
                  className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-xs text-white/60 mb-2">YouTube Video URL or ID</label>
                <input
                  type="text"
                  value={data.videoUrl}
                  onChange={(e) => handleVideoUrlChange(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=ZDazRU_PqGc or ZDazRU_PqGc"
                  className="w-full rounded bg-white/10 border border-white/10 px-3 py-2 text-sm"
                />
                <div className="text-xs text-white/40 mt-1">
                  Enter a YouTube URL or just the video ID. The system will automatically convert it to an embed URL.
                </div>
              </div>

              {/* Preview */}
              {data.videoUrl && (
                <div>
                  <label className="block text-xs text-white/60 mb-2">Preview</label>
                  <div className="relative w-full max-w-md aspect-video bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-lg border border-white/20 backdrop-blur-sm overflow-hidden">
                    <iframe
                      src={data.videoUrl}
                      title={data.videoTitle}
                      className="w-full h-full rounded-lg"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={updateVideo}
                  disabled={saving}
                  className={`px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-sm ${saving ? 'opacity-60' : ''}`}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={saving}
                  className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="text-sm font-semibold mb-1">{data.videoTitle}</div>
                  <div className="text-xs text-white/60 mb-2 break-all">{data.videoUrl}</div>
                  {data.updatedAt && (
                    <div className="text-xs text-white/40">
                      Last updated: {new Date(data.updatedAt).toLocaleString()}
                    </div>
                  )}
                </div>
                <button
                  onClick={startEdit}
                  className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm"
                >
                  Edit
                </button>
              </div>

              {/* Current video preview */}
              {data.videoUrl && (
                <div>
                  <label className="block text-xs text-white/60 mb-2">Current Video</label>
                  <div className="relative w-full max-w-md aspect-video bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-lg border border-white/20 backdrop-blur-sm overflow-hidden">
                    <iframe
                      src={data.videoUrl}
                      title={data.videoTitle}
                      className="w-full h-full rounded-lg"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
