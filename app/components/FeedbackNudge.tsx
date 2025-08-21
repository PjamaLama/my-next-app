"use client";

import React, { useEffect, useState } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';
import { MessageSquare, ExternalLink, X } from 'lucide-react';
import Link from 'next/link';

const STORAGE_KEY = 'feedbackNudge';

function shouldShow(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const data = JSON.parse(raw) as { lastShown: number; count: number; dismissedAt?: number };
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const sevenDays = 7 * oneDay;
    // throttle: show at most once per day, and no more than 3 times in 7 days
    if (now - data.lastShown < oneDay) return false;
    if (data.count >= 3 && now - data.lastShown < sevenDays) return false;
    return true;
  } catch {
    return true;
  }
}

function markShown() {
  try {
    const now = Date.now();
    const raw = localStorage.getItem(STORAGE_KEY);
    const prev = raw ? (JSON.parse(raw) as { lastShown: number; count: number; dismissedAt?: number }) : { lastShown: 0, count: 0 };
    const next = { ...prev, lastShown: now, count: (prev.count || 0) + 1 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

function markDismissed() {
  try {
    const now = Date.now();
    const raw = localStorage.getItem(STORAGE_KEY);
    const prev = raw ? (JSON.parse(raw) as { lastShown: number; count: number }) : { lastShown: 0, count: 0 };
    const next = { ...prev, dismissedAt: now } as any;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export default function FeedbackNudge() {
  const { user } = useFirebase();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return; // do not show nudge on landing (logged-out)
    const t = setTimeout(() => {
      if (shouldShow()) {
        setOpen(true);
        markShown();
      }
    }, 8000); // show gently after 8s on page/app usage
    return () => clearTimeout(t);
  }, [user]);

  if (!user || !open) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[min(560px,94vw)] feedback-card">
      <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 border border-white/10 rounded-2xl shadow-2xl p-5 backdrop-blur-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-600/20 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-semibold text-white mb-2">Got a minute to share feedback?</div>
            <div className="text-sm text-white/70 mb-4 leading-relaxed">
              Help us shape Sheety AI. Suggest a feature, report a bug, or tell us what felt rough. 
              Your input drives our improvements.
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent('open-feedback'));
                }}
                className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-all duration-200 shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 hover:scale-105"
              >
                Share feedback
              </button>
              <Link
                href="/feedback"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 text-white/80 hover:text-white transition-all duration-200"
              >
                <ExternalLink className="w-4 h-4" />
                View all
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all duration-200"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={() => { setOpen(false); markDismissed(); }}
            className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all duration-200 flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}


