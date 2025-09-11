"use client";

import React from 'react';
import { useFirebase } from './FirebaseProvider';

export const ClientGatedLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useFirebase();
  if (!user) {
    // Landing page: no sidebar offset, no navbar
    return (
      <main className="flex-1 w-full">
        {children}
      </main>
    );
  }
  // Authenticated: navbar is now handled in page.tsx, just provide sidebar margin
  return (
    <div
      className="transition-all min-h-screen flex flex-col overflow-hidden"
      style={{ marginLeft: 'var(--sidebar-width, 0px)' }}
    >
      <main className="flex-1 w-full max-w-[110rem] mx-auto px-3 sm:px-6 flex flex-col min-h-0">
        {children}
      </main>
    </div>
  );
};


