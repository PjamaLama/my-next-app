"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useFirebase } from './providers/FirebaseProvider';
import { useSheet } from './providers/SheetProvider';
import { useServiceAccount } from './providers/ServiceAccountProvider';
import ServiceAccountInfo from './components/ServiceAccountInfo';
import { db } from './providers/FirebaseProvider';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import Link from 'next/link';
import { useSettings } from './providers/SettingsProvider'; // Import useSettings from the new provider
import { createPortal } from 'react-dom';

const NAV_LINKS: { name: string; href: string }[] = [];

// Types for sheet management
interface Option {
  id: string;
  label: string;
  spreadsheetId: string;
  sheetNames: string[];
}

const NavBar: React.FC = () => {
  const { user, signOutUser } = useFirebase();
  const { defaultSpreadsheetId, selectedSheetNames, setDefaultSpreadsheetId, setSelectedSheetNames } = useSheet();
  const { serviceAccountEmail, isLoading: serviceAccountLoading } = useServiceAccount();
  const { settingsOpen, setSettingsOpen } = useSettings(); // Use settingsOpen and setSettingsOpen from the new provider
  const [sheetDropdownOpen, setSheetDropdownOpen] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [newOption, setNewOption] = useState("");
  const [addingSheet, setAddingSheet] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => setIsClient(true), []);

  // Set default theme to dark if none set
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    if (!html.classList.contains('theme-dark') && !html.classList.contains('theme-light')) {
      html.classList.add('theme-dark');
    }
  }, []);

  const toggleTheme = () => {
    if (!isClient) return;
    const html = document.documentElement;
    const isDark = html.classList.contains('theme-dark');
    // If currently dark, switch to light; otherwise back to dark
    html.classList.toggle('theme-dark', !isDark);
    html.classList.toggle('theme-light', isDark);
  };

  // Removed: Gemini API Key settings modal state
  // const [settingsOpen, setSettingsOpen] = useState(false);
  // Removed Gemini API key UI/state

  // Set input value when geminiApiKey changes
  // Removed Gemini API key effect

  // Subscribe to user's spreadsheet options
  useEffect(() => {
    if (!user) return;
    const optionsRef = collection(db, "users", user.uid, "options");
    const unsubOptions = onSnapshot(optionsRef, (snapshot) => {
      setOptions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Option));
    });
    return () => unsubOptions();
  }, [user]);

  // Function to extract spreadsheet ID from Google Sheets URL
  const extractSpreadsheetId = (input: string): string => {
    const trimmedInput = input.trim();
    
    // If it's already a spreadsheet ID (no slashes, proper length), return as is
    if (!trimmedInput.includes('/') && trimmedInput.length > 20) {
      return trimmedInput;
    }
    
    // Extract from various Google Sheets URL formats
    const patterns = [
      /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
      /\/spreadsheets\/u\/\d+\/d\/([a-zA-Z0-9-_]+)/,
      /\/d\/([a-zA-Z0-9-_]+)\//,
    ];
    
    for (const pattern of patterns) {
      const match = trimmedInput.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    // If no pattern matches, return the original input (might be a direct ID)
    return trimmedInput;
  };

  const addOption = async () => {
    if (!newOption.trim() || !user) return;
    setAddingSheet(true);
    try {
      const spreadsheetId = extractSpreadsheetId(newOption);
      
      if (!spreadsheetId) {
        alert('Please enter a valid Google Sheets URL or spreadsheet ID.');
        setAddingSheet(false);
        return;
      }

      const res = await fetch('/api/get-sheet-names/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId }),
      });
      if (!res.ok) {
        alert('Failed to fetch sheet names. Make sure the spreadsheet is shared with the service account.');
        return;
      }
      const { sheetNames, spreadsheetTitle } = await res.json();
      await addDoc(collection(db, 'users', user.uid, 'options'), {
        label: spreadsheetTitle || spreadsheetId,
        spreadsheetId,
        sheetNames,
      });
      setNewOption("");
    } catch (e) {
      console.error('Error adding spreadsheet:', e);
      alert('Error adding spreadsheet. Please check the URL or ID and try again.');
    } finally {
      setAddingSheet(false);
    }
  };

  const deleteOption = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'options', id));
    } catch (e) {
      console.error('Error deleting option:', e);
    }
  };

  // Debug logging for spreadsheet options
  const debugSpreadsheetOptions = options.map(o => ({ id: o.id, label: o.label, spreadsheetId: o.spreadsheetId, sheetCount: o.sheetNames?.length || 0 }));
  useEffect(() => {
    console.log('📊 Available spreadsheet options:', debugSpreadsheetOptions);
    console.log('🎯 Current selection:', { defaultSpreadsheetId, selectedSheetNames });
  }, [options, defaultSpreadsheetId, selectedSheetNames, debugSpreadsheetOptions]);

  const handleSpreadsheetSelect = async (spreadsheetId: string) => {
    console.log(`🎯 Selected spreadsheet: ${spreadsheetId}`);
    setSelectedSheetNames([]);
    setDefaultSpreadsheetId(spreadsheetId);
    setSheetDropdownOpen(false);
    try {
      const res = await fetch('/api/get-sheet-names/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId }),
      });
      if (res.ok) {
        const { sheetNames, spreadsheetTitle } = await res.json();
        const option = options.find(o => o.spreadsheetId === spreadsheetId);
        if (option && user) {
          try {
            await updateDoc(doc(db, 'users', user.uid, 'options', option.id), {
              sheetNames,
              label: spreadsheetTitle || option.label,
              lastUpdated: new Date().toISOString()
            });
          } catch (updateError) {
            console.warn('Failed to update Firebase, but continuing:', updateError);
          }
        }
        const firstActualSheet = sheetNames[0];
        if (firstActualSheet && typeof firstActualSheet === 'string') {
          setTimeout(() => {
            if (defaultSpreadsheetId === spreadsheetId) {
              setSelectedSheetNames([firstActualSheet]);
            }
          }, 150);
        }
      } else {
        console.error('Failed to refresh sheet names, API error:', res.status);
      }
    } catch (error) {
      console.error('Error refreshing sheet names:', error);
    }
  };

  const currentSpreadsheet = options.find(o => o.spreadsheetId === defaultSpreadsheetId);

  // Modal content rendered via portal
  const sheetSelectorModal = (sheetDropdownOpen && isClient) ? createPortal(
    <>
      <div className="modal-overlay z-[100]" onClick={() => setSheetDropdownOpen(false)} />
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div className="w-full max-w-md sm:max-w-lg modal-panel overflow-hidden">
          <div className="modal-header">
            <h3 className="text-lg sm:text-xl font-semibold text-white">Select Spreadsheet</h3>
            <button onClick={() => setSheetDropdownOpen(false)} className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-white/10 border border-white/10 text-white/90 hover:bg-white/20 hover:scale-105 transition" aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22a10 10 0 100-20 10 10 0 000 20z" opacity="0.15" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto max-h-[70vh]">
            <div className="modal-body border-b border-white/10">
              {!serviceAccountLoading && serviceAccountEmail && (
                <ServiceAccountInfo serviceAccountEmail={serviceAccountEmail} />
              )}
              <div className="space-y-3">
                <div className="rounded-xl bg-white/5 border border-white/10 focus-within:ring-2 focus-within:ring-sky-500">
                  <input
                    value={newOption}
                    onChange={e => setNewOption(e.target.value)}
                    placeholder="Paste Google Sheets share link or ID..."
                    className="w-full rounded-xl px-4 py-3 bg-transparent text-white placeholder-white/50 border-0 outline-none"
                    onKeyDown={e => { if (e.key === 'Enter') addOption(); }}
                  />
                </div>
                <p className="text-xs text-white/60">💡 Paste the share link from Google Sheets (Share → Copy link)</p>
                <button
                  onClick={addOption}
                  disabled={addingSheet || !newOption.trim()}
                  className="btn btn-primary w-full disabled:opacity-50">
                  {addingSheet ? "Adding..." : "Add Spreadsheet"}
                </button>
              </div>
            </div>
            <div className="p-3 sm:p-4">
              {options.length === 0 ? (
                <div className="p-10 text-center text-white/60">
                  <svg className="w-12 h-12 mx-auto mb-3 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm">No spreadsheets found.</p>
                  <p className="text-xs text-white/40 mt-1">Add one above to get started.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {options.map(option => (
                    <div key={option.id} className="rounded-xl overflow-hidden border border-white/10 bg-white/5">
                      <div
                        className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${
                          defaultSpreadsheetId === option.spreadsheetId ? 'bg-sky-500/10' : 'hover:bg-white/10'
                        }`}
                        onClick={() => handleSpreadsheetSelect(option.spreadsheetId)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${
                              defaultSpreadsheetId === option.spreadsheetId ? 'bg-sky-400' : 'bg-white/30'
                            }`} />
                            <div>
                              <div className="font-medium text-white text-sm sm:text-base truncate max-w-[240px]">
                                {option.label}
                              </div>
                              <div className="text-xs sm:text-sm text-white/60">
                                {option.sheetNames.length} sheet{option.sheetNames.length !== 1 ? 's' : ''}
                              </div>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); if (window.confirm('Delete this spreadsheet?')) deleteOption(option.id); }}
                          className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-white/10 border border-white/10 text-red-300 hover:text-red-200 hover:bg-white/20 hover:scale-105 transition"
                          aria-label="Delete spreadsheet"
                          title="Delete"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M8 6l1-2h6l1 2" />
                            <rect x="8" y="6" width="8" height="12" rx="2" />
                            <path d="M10 10v6M14 10v6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  , document.body) : null;

  // Removed Gemini API key handler

  return (
    <nav className="sticky top-0 z-[60] backdrop-blur-xl bg-black/30 dark:bg-black/30 border-b border-white/10 shadow-[0_1px_0_0_rgba(255,255,255,0.06)] overflow-visible gloss">
      <div className="container mx-auto flex justify-between items-center px-3 sm:px-4 py-2 max-w-full">
          {/* Logo and Title - Properly aligned for mobile */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <Link href="/" className="flex items-center gap-2 sm:gap-3 group select-none min-w-0">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-1.5 sm:p-2 flex-shrink-0">
                <Image src="/logo.png" alt="Logo" width={24} height={24} className="dark:invert sm:w-8 sm:h-8" />
              </div>
              <div className="flex flex-col justify-center min-w-0">
                <span className="text-base sm:text-lg md:text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-sky-300 via-fuchsia-300 to-violet-300 drop-shadow-sm truncate block leading-tight">
                  Sheety AI
                </span>
                <span className="hidden sm:block text-xs font-medium text-white/80 leading-tight">
                  Sheets, automated by AI
                </span>
              </div>
              <span className="absolute left-0 -bottom-1 w-full h-1 bg-gradient-to-r from-sky-300 via-fuchsia-300 to-violet-300 rounded opacity-0 group-hover:opacity-100 scale-x-0 group-hover:scale-x-100 transition-all duration-300 origin-left" />
            </Link>
          </div>

          {/* Desktop Nav Links - Hidden on mobile */}
          <div className="hidden md:flex items-center gap-6 text-white/90">
            {NAV_LINKS.map(link => (
              <Link
                key={link.name}
                href={link.href}
                className="relative text-lg font-medium hover:text-white transition-colors duration-200 px-2 py-1"
              >
                <span className="relative z-10">{link.name}</span>
                <span className="absolute left-0 -bottom-1 w-full h-0.5 bg-gradient-to-r from-sky-300 via-fuchsia-300 to-violet-300 rounded opacity-0 group-hover:opacity-100 scale-x-0 hover:scale-x-100 transition-all duration-300 origin-left" />
              </Link>
            ))}
          </div>

          {/* User section: Optimized for mobile */}
          <div className="flex items-center gap-1 sm:gap-2 md:gap-4 flex-shrink-0">
            {user && (
              <>
                {/* Spreadsheet Selector - Mobile-first design */}
                <div className="relative">
                  <button
                    onClick={() => setSheetDropdownOpen(!sheetDropdownOpen)}
                    className="btn btn-secondary text-white text-xs sm:text-sm min-h-[40px]"
                  >
                    <svg className="icon-20 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M9 9h6v6H9z" />
                    </svg>
                    <span className="max-w-[60px] sm:max-w-[120px] md:max-w-[160px] truncate">
                      {currentSpreadsheet?.label || 'Select'}
                    </span>
                    <svg 
                      className={`icon-16 transition-transform flex-shrink-0 ${sheetDropdownOpen ? 'rotate-180' : ''}`} 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      viewBox="0 0 24 24" aria-hidden="true"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {sheetSelectorModal}
                </div>

                {/* User avatar and menu */}
                <div className="relative z-[70]">
                  <button
                    onClick={() => setProfileOpen(prev => !prev)}
                    className="rounded-full border border-white/20 overflow-hidden focus:outline-none focus:ring-2 focus:ring-sky-400 w-9 h-9"
                    aria-label="Profile menu"
                  >
                    {user?.photoURL ? (
                      <Image src={user.photoURL} alt={user.displayName || 'User'} width={36} height={36} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full rounded-full bg-white/10" />
                    )}
                  </button>

                  {profileOpen && isClient && (
                    <div className="absolute right-0 mt-2 w-52 glass rounded-xl border border-white/10 shadow-xl p-2 z-[80]">
                      <div className="px-2 py-2 text-xs text-white/70 truncate">
                        {user?.email || 'Account'}
                      </div>
                      <button
                        onClick={() => { toggleTheme(); setProfileOpen(false);} }
                        className="menu-item"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                        </svg>
                        <span>Toggle theme</span>
                      </button>
                      <button
                        onClick={() => { signOutUser(); setProfileOpen(false);} }
                        className="menu-item"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M16 17l5-5-5-5" />
                          <path d="M21 12H9" />
                          <path d="M13 21H7a2 2 0 01-2-2V5a2 2 0 012-2h6" />
                        </svg>
                        <span>Sign out</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
      </div>
    </nav>
  );
};

export default NavBar;
