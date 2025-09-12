"use client";

import React, { useEffect, useState } from "react";
import dynamic from 'next/dynamic';
import { LogOut, ChevronLeft, ChevronRight, Megaphone } from 'lucide-react';
import Image from 'next/image';
import { useFirebase } from '../providers/FirebaseProvider';
import { useTutorial } from '../providers/TutorialProvider';
import UserProfile from './UserProfile';

const ChatSidebar = dynamic(() => import('./ChatSidebar'), { ssr: false });

const EXPANDED_WIDTH = 300;
const PEEK_WIDTH = 60; // Very narrow when collapsed - just enough for small icons with padding

const SidePanel: React.FC = () => {
  const { user, signOutUser } = useFirebase();
  const { showTutorial } = useTutorial();
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

  // Hide sidebar on admin pages
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
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
                 {/* Header - Hidden on mobile since we have hamburger in NavBar */}
         <div className={`${peek ? 'px-2 py-2' : 'px-3 py-3'} border-b border-white/10 flex items-center justify-between ${isMobile ? 'hidden' : ''}`}>
           <div className="flex items-center gap-2 min-w-0">
             {!peek && (
               <div className="flex items-center gap-2">
                 <div className="bg-white/10 rounded-lg p-1.5">
                   <Image src="/logo.png" alt="Sheety AI" width={20} height={20} className="invert" />
                 </div>
                 <div className="min-w-0">
                   <div className="text-sm font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 truncate">
                     Sheety AI
                   </div>
                   <div className="text-[10px] text-white/70 truncate">Sheets, automated by AI</div>
                 </div>
               </div>
             )}
           </div>
           <div className="flex items-center gap-1 shrink-0">
             <button
               onClick={() => setPeek((p) => !p)}
               className={`inline-flex items-center justify-center ${peek ? 'h-6 w-6' : 'h-7 w-7'} rounded-md border border-white/20 text-white/80 hover:text-white hover:border-white/50 bg-transparent focus:outline-none focus:ring-1 focus:ring-white/30`}
               title={peek ? 'Expand sidebar' : 'Collapse sidebar'}
             >
               {peek ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3.5 h-3.5" />}
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

        {/* Chats - only show when expanded */}
        {!peek && (
          <div className="flex-1 min-h-0">
            <ChatSidebar embedded peek={peek} onShowTutorial={showTutorial} />
          </div>
        )}

                 {/* Footer actions - compact when collapsed */}
         {user && (
           <div className="border-t border-white/10 p-2 space-y-2">
             <div className={`flex items-center gap-2 ${peek ? 'flex-col' : ''}`}>
               {/* User Profile and Logout */}
               <UserProfile peek={peek} />

               {/* Feedback button - icon only when collapsed */}
               <button
                 onClick={() => window.dispatchEvent(new CustomEvent('open-feedback'))}
                 className={`${peek ? 'h-9 w-9' : 'h-9 px-3'} inline-flex items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 shadow-md`}
                 title="Give feedback"
                 aria-label="Give feedback"
               >
                 <Megaphone className="w-4 h-4" />
                 {!peek && <span className="text-sm font-semibold ml-2">Feedback</span>}
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
