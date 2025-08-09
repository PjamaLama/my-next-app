"use client";

import React, { useEffect, useState } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';

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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[min(560px,94vw)]">
      <div className="bg-zinc-900 border border-white/10 rounded-xl shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="bg-emerald-600/20 text-emerald-300 rounded-lg p-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m1 7l-4-4H7a3 3 0 01-3-3V7a3 3 0 013-3h10a3 3 0 013 3v7a3 3 0 01-3 3h-1l-3 3z" /></svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Got a minute to share feedback?</div>
            <div className="text-xs text-white/70 mt-1">Help us shape Sheety AI. Suggest a feature, report a bug, or tell us what felt rough.</div>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent('open-feedback'));
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-500"
              >
                Share feedback
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 text-white/80 text-sm hover:bg-white/20"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={() => { setOpen(false); markDismissed(); }}
            className="text-white/60 hover:text-white"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}


