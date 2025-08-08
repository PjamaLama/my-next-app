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
  useEffect(() => setIsClient(true), []);

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
      <div className="fixed inset-0 z-[100] bg-black/60" onClick={() => setSheetDropdownOpen(false)} />
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div className="w-full max-w-md sm:max-w-lg glass rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10">
            <h3 className="text-lg sm:text-xl font-semibold text-white">Select Spreadsheet</h3>
            <button onClick={() => setSheetDropdownOpen(false)} className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="overflow-y-auto max-h-[70vh]">
            <div className="p-4 sm:p-5 border-b border-white/10">
              {!serviceAccountLoading && serviceAccountEmail && (
                <ServiceAccountInfo serviceAccountEmail={serviceAccountEmail} />
              )}
              <div className="space-y-3">
                <input
                  value={newOption}
                  onChange={e => setNewOption(e.target.value)}
                  placeholder="Paste Google Sheets share link or ID..."
                  className="w-full rounded-xl px-4 py-3 bg-white/5 text-white placeholder-white/50 border border-white/10 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  onKeyDown={e => { if (e.key === 'Enter') addOption(); }}
                />
                <p className="text-xs text-white/60">💡 Paste the share link from Google Sheets (Share → Copy link)</p>
                <button
                  onClick={addOption}
                  disabled={addingSheet || !newOption.trim()}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition disabled:opacity-50">
                  {addingSheet ? "Adding..." : "Add Spreadsheet"}
                </button>
              </div>
            </div>
            <div className="p-3 sm:p-4">
              {options.length === 0 ? (
                <div className="p-10 text-center text-white/60">
                  <svg className="w-12 h-12 mx-auto mb-3 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                          className="p-2 text-red-300 hover:text-red-200 rounded-lg hover:bg-red-500/10 transition-colors">
                          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M6 8v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V8"/>
                            <path d="M9 4h2a2 2 0 0 1 2 2v1H7V6a2 2 0 0 1 2-2z"/>
                            <line x1="4" y1="7" x2="16" y2="7"/>
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
    <nav className="sticky top-0 z-50 backdrop-blur-xl bg-black/30 dark:bg-black/30 border-b border-white/10 shadow-[0_1px_0_0_rgba(255,255,255,0.06)] overflow-x-hidden gloss">
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
                <span className="hidden sm:block text-xs font-medium text-white/70 leading-tight">
                  Sheets, automated by AI
                </span>
              </div>
              <span className="absolute left-0 -bottom-1 w-full h-1 bg-gradient-to-r from-sky-300 via-fuchsia-300 to-violet-300 rounded opacity-0 group-hover:opacity-100 scale-x-0 group-hover:scale-x-100 transition-all duration-300 origin-left" />
            </Link>
          </div>

          {/* Desktop Nav Links - Hidden on mobile */}
          <div className="hidden md:flex items-center gap-6 text-white/80">
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
          <div className="flex items-center gap-1 sm:gap-4 flex-shrink-0">
            {user && (
              <>
                {/* Spreadsheet Selector - Mobile-first design */}
                <div className="relative">
                  <button
                    onClick={() => setSheetDropdownOpen(!sheetDropdownOpen)}
                    className="flex items-center gap-2 glass-soft border border-white/10 text-white px-3 py-2 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-400 text-xs sm:text-sm min-h-[44px]"
                  >
                    <svg width="14" height="14" className="sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M9 9h6v6H9z" />
                    </svg>
                    <span className="max-w-[60px] sm:max-w-[120px] md:max-w-[160px] truncate">
                      {currentSpreadsheet?.label || 'Select'}
                    </span>
                    <svg 
                      className={`w-3 h-3 sm:w-4 sm:h-4 transition-transform flex-shrink-0 ${sheetDropdownOpen ? 'rotate-180' : ''}`} 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      viewBox="0 0 24 24"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {sheetSelectorModal}
                </div>

                {/* User avatar and settings - Mobile optimized */}
                <div className="flex items-center gap-1 sm:gap-2">
                  {/* User avatar */}
                  {user?.photoURL ? (
                    <Image
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      width={36}
                      height={36}
                      className="rounded-full border border-white/10"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-white/10 border border-white/10" />
                  )}

                  {/* Settings button */}
                  <button
                    onClick={() => setSettingsOpen(!settingsOpen)}
                    className="p-2 rounded-lg glass-soft border border-white/10 text-white/80 hover:text-white hover:bg-white/10"
                    aria-label="Settings"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>

                  {/* Sign out */}
                  <button
                    onClick={signOutUser}
                    className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
      </div>
    </nav>
  );
};

export default NavBar;
