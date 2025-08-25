"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

const UserProfile = ({ peek }: { peek?: boolean }) => {
  const { user, signOutUser, waId } = useFirebase();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!user) {
    return null;
  }

  const handleSignOut = async () => {
    await signOutUser();
    router.push('/');
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button onClick={() => setDropdownOpen(!dropdownOpen)} className={`flex items-center justify-center w-full ${peek ? 'h-9 w-9' : 'h-9 px-3'} rounded-lg bg-white/5 text-white hover:bg-white/10 text-sm focus:outline-none`}>
        {user.photoURL ? (
          <Image
            src={user.photoURL}
            alt={user.displayName || 'User profile'}
            width={24}
            height={24}
            className="rounded-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20 text-[11px] font-medium">
            {user.email ? user.email.charAt(0).toUpperCase() : ''}
          </div>
        )}
        {!peek && (
          <>
            <span className="truncate ml-2">{user.displayName || user.email}</span>
            <LogOut className="w-4 h-4 ml-auto opacity-80" />
          </>
        )}
      </button>

      {dropdownOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-lg py-2 z-50">
          <div className="px-4 py-2 border-b border-gray-700">
            <p className="text-sm font-semibold text-white truncate">{user.displayName || 'User'}</p>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </div>
          <div className="py-1">
            <Link href="/whatsapp-setup"
              onClick={() => setDropdownOpen(false)}
              className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
            >
              {waId ? `WhatsApp Linked` : 'Link WhatsApp'} 
              {waId && <span className="text-green-400 ml-2">✓</span>}
            </Link>
            <Link href="/privacy"
              onClick={() => setDropdownOpen(false)}
              className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
            >
              Privacy
            </Link>
          </div>
          <div className="py-1 border-t border-gray-700">
            <button
              onClick={handleSignOut}
              className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
