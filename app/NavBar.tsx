"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Crown } from 'lucide-react';
import { useFirebase } from './providers/FirebaseProvider';
import { useSheet } from './providers/SheetProvider';
import { useServiceAccount } from './providers/ServiceAccountProvider';
import { useUpgradeModal } from './providers/UpgradeModalProvider';


const NAV_LINKS: { name: string; href: string }[] = [
  { name: 'Feedback', href: '/feedback' },
];

const NavBar: React.FC = () => {
  const { user, continueWithGoogle, userType } = useFirebase();
  const { defaultSpreadsheetId } = useSheet();
  const { isLoading: serviceAccountLoading } = useServiceAccount();
  const { openModal } = useUpgradeModal();
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
    <nav className="sticky top-0 z-50 bg-gray-900 border-b border-gray-800 shadow-sm overflow-x-hidden sm:hidden -webkit-sticky mobile-nav-sticky"
         style={{
           paddingTop: 'env(safe-area-inset-top)',
           top: 'env(safe-area-inset-top)'
         }}>
      <div className="container mx-auto flex justify-between items-center px-4 py-3 max-w-full">
        {/* Logo and Title - Compact for mobile */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link href="/" className="flex items-center gap-2 group select-none min-w-0">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-1.5 flex-shrink-0">
              <Image src="/logo.png" alt="Logo" width={24} height={24} className="invert" />
            </div>
            <div className="flex flex-col justify-center min-w-0">
              <span className="text-base font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 truncate block leading-tight">
                Sheety AI
              </span>
            </div>
          </Link>
        </div>

        {/* Right area - Simplified for mobile */}
        <div className="flex items-center gap-1">
          {/* Compact Continue-as CTA for returning users */}
          {!user && lastGoogle?.email && (
            <button
              onClick={() => continueWithGoogle?.(lastGoogle.email)}
              className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white text-gray-900 hover:bg-white/90 active:scale-[0.98] text-xs min-h-[32px]"
              title={`Continue as ${lastGoogle.name || lastGoogle.email}`}
            >
              {lastGoogle.photo ? (
                <img
                  src={lastGoogle.photo}
                  alt={lastGoogle.name || lastGoogle.email || 'User'}
                  className="w-4 h-4 rounded-full border border-black/10"
                />
              ) : (
                <svg className="w-3 h-3 text-gray-700" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-3.866 0-7 3.134-7 7h2a5 5 0 0 1 10 0h2c0-3.866-3.134-7-7-7z"/></svg>
              )}
              <span className="truncate max-w-[80px] text-xs">Continue</span>
            </button>
          )}

          {/* Mobile hamburger to open sidebar - moved to end */}
          <button
            type="button"
            aria-label="Open menu"
            title="Open menu"
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-white/10 text-white/80 hover:text-white hover:border-white/40 active:scale-95 min-h-[32px] min-w-[32px]"
            onClick={() => window.dispatchEvent(new CustomEvent('open-sidebar'))}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default NavBar;
