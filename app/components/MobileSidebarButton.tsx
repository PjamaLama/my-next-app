"use client";

import React from 'react';
import { useFirebase } from '../providers/FirebaseProvider';

const MobileSidebarButton: React.FC = () => {
  const { user } = useFirebase();
  if (!user) return null;

  const openSidebar = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-sidebar'));
    }
  };

  return (
    <button
      type="button"
      onClick={openSidebar}
      className="sm:hidden fixed bottom-4 right-4 z-30 h-12 w-12 rounded-full bg-sky-600 text-white shadow-lg shadow-black/30 grid place-items-center active:scale-95"
      aria-label="Open chats"
      title="Open chats"
    >
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 0 1-3.32-.56L3 20l1.19-3.17A7.9 7.9 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    </button>
  );
};

export default MobileSidebarButton;


