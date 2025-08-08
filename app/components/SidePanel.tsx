"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight, Settings, LogOut, Table, Sheet, MessageSquare, LayoutGrid } from 'lucide-react';
import { useFirebase } from '../providers/FirebaseProvider';
import { useSheet } from '../providers/SheetProvider';

const ChatSidebar = dynamic(() => import('./ChatSidebar'), { ssr: false });

const COLLAPSED_WIDTH = 20; // px exposed when collapsed
const EXPANDED_WIDTH = 280; // default expanded width

const SidePanel: React.FC = () => {
  const [expanded, setExpanded] = useState(true);
  const [width, setWidth] = useState(EXPANDED_WIDTH);
  const { user, signOutUser } = useFirebase();
  const { defaultSpreadsheetId } = useSheet();

  useEffect(() => {
    setWidth(expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH);
  }, [expanded]);

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-40 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-sm"
      style={{ width }}
      aria-label="Side panel"
    >
      {/* Grab handle */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="absolute -right-3 top-16 z-50 rounded-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 shadow p-1"
        title={expanded ? 'Collapse' : 'Expand'}
      >
        {expanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {/* Collapsed indicator */}
      {!expanded && (
        <div className="h-full flex items-center justify-center text-gray-400 rotate-90 select-none">
          <MessageSquare className="w-4 h-4" />
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="flex flex-col h-full">
          {/* App section header */}
          <div className="px-3 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <div className="text-xs text-gray-500">Workspace</div>
            <div className="flex items-center gap-1">
              {/* Additional quick actions could be added here */}
            </div>
          </div>

          {/* Chats */}
          <div className="flex-1 min-h-0">
            <ChatSidebar embedded />
          </div>

          {/* Controls moved from navbar */}
          {user && (
            <div className="border-t border-gray-200 dark:border-gray-800 p-2 space-y-2">
              <button
                onClick={() => signOutUser()}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 text-sm"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};

export default SidePanel;
