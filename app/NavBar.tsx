"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useFirebase } from './providers/FirebaseProvider';
import { useSheet } from './providers/SheetProvider';
import { useServiceAccount } from './providers/ServiceAccountProvider';


const NAV_LINKS: { name: string; href: string }[] = [
  { name: 'Feedback', href: '/feedback' },
];

const NavBar: React.FC = () => {
  const { user, continueWithGoogle } = useFirebase();
  const { defaultSpreadsheetId } = useSheet();
  const { isLoading: serviceAccountLoading } = useServiceAccount();
  const [lastGoogle, setLastGoogle] = useState<{ email?: string; name?: string; photo?: string } | null>(null);

  useEffect(() => {
    // no-op left intentionally (kept structure for future needs)
  }, [user, defaultSpreadsheetId, serviceAccountLoading]);

  // Load last used Google identity for a prominent "Continue as" CTA
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const email = localStorage.getItem('lastGoogleEmail') || undefined;
      const name = localStorage.getItem('lastGoogleName') || undefined;
      const photo = localStorage.getItem('lastGooglePhoto') || undefined;
      if (email || name || photo) setLastGoogle({ email, name, photo });
    } catch (_) {
      // ignore
    }
  }, []);

  return (
    <nav className="sticky top-0 z-30 bg-gray-900 border-b border-gray-800 shadow-sm overflow-x-hidden sm:hidden">
      <div className="container mx-auto flex justify-between items-center px-4 py-3 max-w-full">
        {/* Logo and Title */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link href="/" className="flex items-center gap-3 group select-none min-w-0">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2 flex-shrink-0">
              <Image src="/logo.png" alt="Logo" width={28} height={28} className="invert" />
            </div>
            <div className="flex flex-col justify-center min-w-0">
              <span className="text-lg font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 drop-shadow-sm truncate block leading-tight">
                Sheety AI
              </span>
              <span className="text-xs font-medium text-white/70 leading-tight">
                Your Automated Report Assistant
              </span>
            </div>
            <span className="absolute left-0 -bottom-1 w-full h-1 bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 rounded opacity-0 group-hover:opacity-100 scale-x-0 group-hover:scale-x-100 transition-all duration-300 origin-left" />
          </Link>
        </div>

        {/* Right area */}
        <div className="flex items-center gap-3">
          {/* Prominent Continue-as CTA for returning, logged-out users */}
          {!user && lastGoogle?.email && (
            <button
              onClick={() => continueWithGoogle?.(lastGoogle.email)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white text-gray-900 hover:bg-white/90 active:scale-[0.98] min-h-[44px]"
              title={`Continue as ${lastGoogle.name || lastGoogle.email}`}
            >
              {lastGoogle.photo ? (
                <img
                  src={lastGoogle.photo}
                  alt={lastGoogle.name || lastGoogle.email || 'User'}
                  className="w-5 h-5 rounded-full border border-black/10"
                />
              ) : (
                <svg className="w-4 h-4 text-gray-700" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-3.866 0-7 3.134-7 7h2a5 5 0 0 1 10 0h2c0-3.866-3.134-7-7-7z"/></svg>
              )}
              <span className="truncate max-w-[120px] text-sm">Continue as {lastGoogle.name || lastGoogle.email}</span>
            </button>
          )}

          {NAV_LINKS.map(link => (
            <Link
              key={link.name}
              href={link.href}
              className="relative text-base font-medium text-white/90 hover:text-yellow-300 transition-colors duration-200 px-3 py-2 min-h-[44px] flex items-center"
            >
              <span className="relative z-10">{link.name}</span>
              <span className="absolute left-0 -bottom-1 w-full h-0.5 bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 rounded opacity-0 group-hover:opacity-100 scale-x-0 hover:scale-x-100 transition-all duration-300 origin-left" />
            </Link>
          ))}
          {/* Mobile hamburger to open sidebar */}
          <button
            type="button"
            aria-label="Open menu"
            title="Open menu"
            className="inline-flex items-center justify-center h-11 w-11 rounded-lg border border-white/10 text-white/80 hover:text-white hover:border-white/40 active:scale-95 min-h-[44px] min-w-[44px]"
            onClick={() => window.dispatchEvent(new CustomEvent('open-sidebar'))}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default NavBar;
