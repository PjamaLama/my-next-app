"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useFirebase } from './providers/FirebaseProvider';
import { useSheet } from './providers/SheetProvider';
import { useServiceAccount } from './providers/ServiceAccountProvider';

const NAV_LINKS: { name: string; href: string }[] = [];

const NavBar: React.FC = () => {
  const { user } = useFirebase();
  const { defaultSpreadsheetId } = useSheet();
  const { isLoading: serviceAccountLoading } = useServiceAccount();

  useEffect(() => {
    // no-op left intentionally (kept structure for future needs)
  }, [user, defaultSpreadsheetId, serviceAccountLoading]);

  return (
    <nav className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm overflow-x-hidden">
      <div className="container mx-auto flex justify-between items-center px-3 sm:px-4 py-2 max-w-full">
        {/* Logo and Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Link href="/" className="flex items-center gap-2 sm:gap-3 group select-none min-w-0">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-1.5 sm:p-2 flex-shrink-0">
              <Image src="/logo.png" alt="Logo" width={24} height={24} className="dark:invert sm:w-8 sm:h-8" />
            </div>
            <div className="flex flex-col justify-center min-w-0">
              <span className="text-base sm:text-lg md:text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 drop-shadow-sm truncate block leading-tight">
                Report AI
              </span>
              <span className="hidden sm:block text-xs font-medium text-white/70 leading-tight">
                Your Automated Report Assistant
              </span>
            </div>
            <span className="absolute left-0 -bottom-1 w-full h-1 bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 rounded opacity-0 group-hover:opacity-100 scale-x-0 group-hover:scale-x-100 transition-all duration-300 origin-left" />
          </Link>
        </div>

        {/* Right area intentionally minimal */}
        <div className="flex items-center gap-4">
          {NAV_LINKS.map(link => (
            <Link
              key={link.name}
              href={link.href}
              className="relative text-lg font-medium text-white/90 hover:text-yellow-300 transition-colors duration-200 px-2 py-1"
            >
              <span className="relative z-10">{link.name}</span>
              <span className="absolute left-0 -bottom-1 w-full h-0.5 bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 rounded opacity-0 group-hover:opacity-100 scale-x-0 hover:scale-x-100 transition-all duration-300 origin-left" />
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default NavBar;
