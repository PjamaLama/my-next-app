"use client";

import React, { useEffect, useState } from "react";
import { useFirebase } from "../providers/FirebaseProvider";
import Image from "next/image";

export default function JoinPage() {
  const { joinBeta, continueWithGoogle, authError } = useFirebase();
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        setAttempted(true);
        await joinBeta();
      } catch {
        // joinBeta reports errors via context; show fallback UI
      }
    };
    void run();
  }, [joinBeta]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] text-white px-6">
      <div className="w-full max-w-md">
        <div className="glass gloss rounded-2xl p-6 border border-white/10 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-white/10 rounded-xl p-2">
              <Image src="/logo.png" alt="Sheety AI" width={28} height={28} className="invert" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">Joining beta…</h2>
              <p className="text-xs text-white/70">Redirecting to Google</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-white/80">
            <span className="inline-block w-4 h-4 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
            <span className="text-sm">If nothing happens, use one of the options below.</span>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => joinBeta()}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-300/30"
              aria-label="Try joining again"
            >
              <svg className="w-5 h-5 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
              <span>Try Join Beta Again</span>
            </button>

            <button
              type="button"
              onClick={() => continueWithGoogle?.()}
              className="inline-flex items-center justify-center gap-3 px-5 py-3 rounded-xl font-semibold shadow-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white text-gray-900 hover:bg-white/90"
            >
              <svg className="w-5 h-5 text-gray-700" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-3.866 0-7 3.134-7 7h2a5 5 0 0 1 10 0h2c0-3.866-3.134-7-7-7z"/></svg>
              Continue with Google
            </button>
          </div>

          {authError && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
              <p className="font-medium">Authentication Error</p>
              <p className="mt-1">{authError}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


