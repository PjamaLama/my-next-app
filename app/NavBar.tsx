
import React from 'react';
import Image from 'next/image';
import { useFirebase } from './providers/FirebaseProvider';

const NavBar = () => {
  const { user, loading, signOutUser } = useFirebase();

  return (
    <nav className="bg-gray-800 text-white p-4">
      <div className="container mx-auto flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Image src="/globe.svg" alt="Logo" width={32} height={32} />
          <h1 className="text-xl font-bold">Report AI</h1>
        </div>
        {/* User section */}
        <div className="flex items-center gap-4">
          {!loading && user ? (
            <>
              <Image
                src={user.photoURL || '/file.svg'}
                alt={user.displayName || 'User'}
                width={36}
                height={36}
                className="rounded-full border border-white"
              />
              <button
                onClick={signOutUser}
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded"
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
