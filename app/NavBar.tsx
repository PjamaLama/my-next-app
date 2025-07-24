"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { useFirebase } from './providers/FirebaseProvider';
import Link from 'next/link';

const NAV_LINKS = [
  { name: 'Home', href: '/' },
];

const NavBar = () => {
  const { user, loading, signOutUser } = useFirebase();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-white/20 dark:bg-gray-900/30 border-b border-white/20 dark:border-gray-800/60 shadow-xl rounded-b-2xl px-4 py-3 mb-4 transition-all duration-300">
      <div className="container mx-auto flex items-center justify-between">
        {/* Logo and Title */}
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-full p-1 shadow-md">
            <Image src="/globe.svg" alt="Logo" width={36} height={36} />
          </div>
          <Link href="/" className="relative group select-none">
            <span className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 drop-shadow-sm">
              Report AI
            </span>
            <span className="block text-xs font-medium text-white/70 mt-0.5 ml-1">
              Your Automated Report Assistant
            </span>
            <span className="absolute left-0 -bottom-1 w-full h-1 bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 rounded opacity-0 group-hover:opacity-100 scale-x-0 group-hover:scale-x-100 transition-all duration-300 origin-left" />
          </Link>
        </div>
        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-6">
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
        {/* User section & Mobile menu button */}
        <div className="flex items-center gap-4">
          {/* Mobile menu button */}
          <button
            className="md:hidden flex flex-col justify-center items-center w-10 h-10 rounded-lg hover:bg-white/30 transition-colors duration-200 focus:outline-none"
            aria-label="Toggle menu"
            onClick={() => setMenuOpen(v => !v)}
          >
            <span className={`block w-6 h-0.5 bg-white mb-1 rounded transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-1.5' : ''}`}></span>
            <span className={`block w-6 h-0.5 bg-white mb-1 rounded transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`}></span>
            <span className={`block w-6 h-0.5 bg-white rounded transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-1.5' : ''}`}></span>
          </button>
          {!loading && user ? (
            <>
              <span className="hidden sm:inline text-sm font-medium text-white/80 mr-2">Hi, {user.displayName?.split(' ')[0] || 'User'}!</span>
              <Image
                src={user.photoURL || '/file.svg'}
                alt={user.displayName || 'User'}
                width={40}
                height={40}
                className="rounded-full border-2 border-white shadow-md transition-transform duration-200 hover:scale-105 hover:ring-2 hover:ring-yellow-300 cursor-pointer"
              />
              <button
                onClick={signOutUser}
                className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-pink-500 hover:to-red-500 text-white px-4 py-1.5 rounded-lg font-semibold shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-300"
                aria-label="Logout"
              >
                Logout
              </button>
            </>
          ) : null}
        </div>
      </div>
      {/* Mobile Nav Links */}
      {menuOpen && (
        <div className="md:hidden mt-3 flex flex-col gap-2 items-center animate-fade-in-down">
          {NAV_LINKS.map(link => (
            <Link
              key={link.name}
              href={link.href}
              className="w-full text-center text-lg font-medium text-white/90 hover:text-yellow-300 transition-colors duration-200 px-2 py-2 rounded-lg hover:bg-white/10"
              onClick={() => setMenuOpen(false)}
            >
              {link.name}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
};

export default NavBar;
