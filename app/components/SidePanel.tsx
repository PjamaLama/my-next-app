"use client";

import React, { useEffect, useState } from "react";
import dynamic from 'next/dynamic';
import { LogOut, ChevronLeft, ChevronRight, Megaphone } from 'lucide-react';
import Image from 'next/image';
import { useFirebase } from '../providers/FirebaseProvider';

const ChatSidebar = dynamic(() => import('./ChatSidebar'), { ssr: false });

const EXPANDED_WIDTH = 300;
const PEEK_WIDTH = 220;

const SidePanel: React.FC = () => {
  const { user, signOutUser } = useFirebase();
  const [peek, setPeek] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const width = peek ? PEEK_WIDTH : EXPANDED_WIDTH;

  // Track viewport for mobile behavior
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640);
    update();
    window.addEventListener('resize', update);
    const openHandler = () => setMobileOpen(true);
    const closeHandler = () => setMobileOpen(false);
    window.addEventListener('open-sidebar', openHandler as EventListener);
    window.addEventListener('close-sidebar', closeHandler as EventListener);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Keep layout in sync with navbar/main content (desktop only pushes content)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--sidebar-width', isMobile ? '0px' : `${width}px`);
    }
  }, [width, isMobile]);

  // Lock background scroll when mobile sidebar is open; close on Escape
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const original = document.body.style.overflow;
    if (isMobile && mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = original || '';
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobile && mobileOpen) setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = original || '';
    };
  }, [isMobile, mobileOpen]);

  // Hide sidebar entirely on landing (logged-out) state
  if (!user) {
    return null;
  }

  const visible = isMobile ? mobileOpen : true;

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm sm:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed top-0 bottom-0 z-50 text-white shadow-lg transition-transform duration-200 ease-out ${isMobile ? 'sm:hidden' : ''} ${isMobile ? 'bg-gray-900/95' : 'bg-gray-900/90 border-r border-white/10'} ${visible ? 'translate-x-0 left-0' : '-translate-x-full left-0'}`}
        style={{ width: isMobile ? '85vw' : width }}
        aria-label="Side panel"
      >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-3 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-2">
              <div className="bg-white/10 rounded-lg p-1.5">
                <Image src="/logo.png" alt="Sheety AI" width={20} height={20} className="invert" />
              </div>
              {!peek && (
                <div className="min-w-0">
                  <div className="text-sm font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 truncate">
                    Sheety AI
                  </div>
                  <div className="text-[10px] text-white/70 truncate">Sheets, automated by AI</div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setPeek((p) => !p)}
              className={`inline-flex items-center justify-center ${peek ? 'h-6 w-6' : 'h-7 w-7'} rounded-md border border-white/20 text-white/80 hover:text-white hover:border-white/50 bg-transparent focus:outline-none focus:ring-1 focus:ring-white/30`}
              title={peek ? 'Expand sidebar' : 'Peek sidebar'}
            >
              {peek ? <ChevronRight className={`${peek ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} /> : <ChevronLeft className={`${peek ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />}
            </button>
            {isMobile && (
              <button
                onClick={() => setMobileOpen(false)}
                className={`inline-flex items-center justify-center ${peek ? 'h-6 w-6' : 'h-7 w-7'} rounded-md border border-white/20 text-white/80 hover:text-white hover:border-white/50 bg-transparent focus:outline-none focus:ring-1 focus:ring-white/30`}
                title="Close"
                aria-label="Close sidebar"
              >
                <ChevronLeft className={`${peek ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
              </button>
            )}
          </div>
        </div>

        {/* Chats */}
        <div className="flex-1 min-h-0">
          <ChatSidebar embedded peek={peek} />
        </div>

        {/* Footer actions */}
        {user && (
          <div className="border-t border-white/10 p-2 space-y-2">
            <div className="flex items-center gap-2">
              {/* Feedback buttons: compact on mobile, prominent on desktop */}
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-feedback'))}
                className="inline-flex sm:hidden items-center justify-center h-9 w-9 rounded-lg border border-white/15 text-white/80 hover:text-white hover:border-white/40"
                title="Give feedback"
                aria-label="Give feedback"
              >
                <Megaphone className="w-4 h-4" />
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-feedback'))}
                className="hidden sm:inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 shadow-md"
                title="Give feedback"
                aria-label="Give feedback"
              >
                <Megaphone className="w-4 h-4" />
                <span className="text-sm font-semibold">Feedback</span>
              </button>

              {/* Logout */}
              <button
                onClick={() => signOutUser()}
                className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-white hover:bg-white/10 text-sm"
                title="Logout"
                aria-label="Logout"
              >
                {user.photoURL ? (
                  <Image
                    src={user.photoURL}
                    alt={user.displayName || user.email || 'User'}
                    width={24}
                    height={24}
                    className="rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20 text-[11px] font-medium"
                    title={user.displayName || user.email || 'User'}
                  >
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="truncate">Logout</span>
                <LogOut className="w-4 h-4 ml-auto opacity-80" />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
    </>
  );
};

export default SidePanel;
