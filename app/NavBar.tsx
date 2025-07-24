
import React from 'react';
import Image from 'next/image';
import { useFirebase } from './providers/FirebaseProvider';

const NavBar = () => {
  const { user, loading, signOutUser } = useFirebase();

  return (
    <nav className="sticky top-0 z-50 bg-gradient-to-r from-blue-700 via-purple-700 to-indigo-700 shadow-lg rounded-b-xl px-4 py-3 mb-4">
      <div className="container mx-auto flex items-center justify-between">
        {/* Logo and Title */}
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-full p-1 shadow-md">
            <Image src="/globe.svg" alt="Logo" width={36} height={36} />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 drop-shadow-sm select-none">
            Report AI
          </h1>
        </div>
        {/* User section */}
        <div className="flex items-center gap-4">
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
    </nav>
  );
};

export default NavBar;
