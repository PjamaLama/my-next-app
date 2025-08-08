"use client";

import React from "react";
import dynamic from 'next/dynamic';
import { LogOut } from 'lucide-react';
import { useFirebase } from '../providers/FirebaseProvider';

const ChatSidebar = dynamic(() => import('./ChatSidebar'), { ssr: false });

const SIDEBAR_WIDTH = 300; // always visible, comfortably wide

const SidePanel: React.FC = () => {
  const { user, signOutUser } = useFirebase();

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-40 bg-gray-900/90 text-white border-r border-white/10 shadow-sm"
      style={{ width: SIDEBAR_WIDTH }}
      aria-label="Side panel"
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-3 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="text-xs text-white/60">Workspace</div>
          <div className="flex items-center gap-1" />
        </div>

        {/* Chats */}
        <div className="flex-1 min-h-0">
          <ChatSidebar embedded />
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
