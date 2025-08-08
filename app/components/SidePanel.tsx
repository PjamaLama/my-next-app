"use client";

import React, { useEffect, useState } from "react";
import dynamic from 'next/dynamic';
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
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
          <div className="text-xs text-white/60">Workspace</div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPeek((p) => !p)}
              className="p-1.5 rounded-md border border-white/20 text-white/80 hover:text-white hover:border-white/50 bg-transparent"
              title={peek ? 'Expand sidebar' : 'Peek sidebar'}
            >
              {peek ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
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
