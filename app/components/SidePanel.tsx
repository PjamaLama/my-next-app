"use client";

import React, { useEffect, useState } from "react";
import dynamic from 'next/dynamic';
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useFirebase } from '../providers/FirebaseProvider';

const ChatSidebar = dynamic(() => import('./ChatSidebar'), { ssr: false });

const EXPANDED_WIDTH = 300;
const PEEK_WIDTH = 200;

const SidePanel: React.FC = () => {
  const { user, signOutUser } = useFirebase();
  const [peek, setPeek] = useState(false);

  const width = peek ? PEEK_WIDTH : EXPANDED_WIDTH;

  // Keep layout in sync with navbar/main content
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
    }
  }, [width]);

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-40 bg-gray-900/90 text-white border-r border-white/10 shadow-sm"
      style={{ width }}
      aria-label="Side panel"
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-3 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-2">
              <div className="bg-white/10 rounded-lg p-1.5">
                <Image src="/logo.png" alt="Sheety AI" width={20} height={20} className="dark:invert" />
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
          </div>
        </div>

        {/* Chats */}
        <div className="flex-1 min-h-0">
          <ChatSidebar embedded peek={peek} />
        </div>

        {/* Footer actions */}
        {user && (
          <div className="border-t border-white/10 p-2 space-y-2">
            <button
              onClick={() => signOutUser()}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-white hover:bg-white/10 text-sm"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

export default SidePanel;
