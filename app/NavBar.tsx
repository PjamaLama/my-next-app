"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useFirebase } from './providers/FirebaseProvider';
import { useSheet } from './providers/SheetProvider';
import { db } from './providers/FirebaseProvider';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  deleteDoc,
  setDoc
} from "firebase/firestore";
import Link from 'next/link';

const NAV_LINKS: { name: string; href: string }[] = [];

// Types for sheet management
interface Option {
  id: string;
  label: string;
  spreadsheetId: string;
  sheetNames: string[];
}

const NavBar: React.FC = () => {
  const { user, loading, signOutUser } = useFirebase();
  const { defaultSpreadsheetId, selectedSheetName, setDefaultSpreadsheetId, setSelectedSheetName } = useSheet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetDropdownOpen, setSheetDropdownOpen] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [newOption, setNewOption] = useState("");
  const [addingSheet, setAddingSheet] = useState(false);
  // Gemini API Key settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [geminiApiKeySaved, setGeminiApiKeySaved] = useState<boolean>(false);

  // Load Gemini API key from Firestore
  useEffect(() => {
    if (!user) return;
    const userDocRef = doc(db, "users", user.uid);
    const unsubUserDoc = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.geminiApiKey) {
          setGeminiApiKey(data.geminiApiKey);
        }
      }
    });
    return () => unsubUserDoc();
  }, [user]);

  const saveGeminiApiKey = async () => {
    if (!user || !geminiApiKey.trim()) return;
    try {
      await setDoc(doc(db, "users", user.uid), { geminiApiKey: geminiApiKey.trim() }, { merge: true });
      setGeminiApiKeySaved(true);
      setTimeout(() => setGeminiApiKeySaved(false), 3000);
      setSettingsOpen(false);
    } catch (e) {
      console.error("Error saving Gemini API key:", e);
    }
  };

  // Subscribe to user's spreadsheet options
  useEffect(() => {
    if (!user) return;
    const optionsRef = collection(db, "users", user.uid, "options");
    const unsubOptions = onSnapshot(optionsRef, (snapshot) => {
      setOptions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Option));
    });
    return () => unsubOptions();
  }, [user]);



  const addOption = async () => {
    if (!newOption.trim() || !user) return;
    setAddingSheet(true);
    try {
      const res = await fetch('/api/get-sheet-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId: newOption.trim() }),
      });
      if (!res.ok) {
        alert('Failed to fetch sheet names. Make sure the spreadsheet is shared with the service account.');
        return;
      }
      const { sheetNames, spreadsheetTitle } = await res.json();
      await addDoc(collection(db, 'users', user.uid, 'options'), {
        label: spreadsheetTitle || newOption.trim(),
        spreadsheetId: newOption.trim(),
        sheetNames,
      });
      setNewOption("");
    } catch (e) {
      console.error('Error adding spreadsheet:', e);
      alert('Error adding spreadsheet');
    } finally {
      setAddingSheet(false);
    }
  };

  const deleteOption = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "options", id));
  };

  const handleSpreadsheetSelect = (spreadsheetId: string) => {
    setDefaultSpreadsheetId(spreadsheetId);
    // Auto-select first sheet if available
    const option = options.find(o => o.spreadsheetId === spreadsheetId);
    if (option && option.sheetNames.length > 0) {
      const firstSheet = option.sheetNames[0];
      setSelectedSheetName(firstSheet);
    }
    setSheetDropdownOpen(false);
  };

  const handleSheetSelect = (sheetName: string) => {
    setSelectedSheetName(sheetName);
    setSheetDropdownOpen(false);
  };

  const currentSpreadsheet = options.find(o => o.spreadsheetId === defaultSpreadsheetId);

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

        {/* Sheet Selection Dropdown - Only show when user is logged in */}
        {user && (
          <div className="relative">
            <button
              onClick={() => setSheetDropdownOpen(!sheetDropdownOpen)}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-300 border border-white/20"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 9h6v6H9z" />
              </svg>
              <span className="max-w-32 truncate">
                {currentSpreadsheet?.label || "Select Sheet"}
              </span>
              {selectedSheetName && (
                <span className="text-xs text-yellow-300">
                  • {selectedSheetName}
                </span>
              )}
              <svg 
                className={`w-4 h-4 transition-transform ${sheetDropdownOpen ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                viewBox="0 0 24 24"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {sheetDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto z-50">
                {/* Add new spreadsheet section */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex gap-2">
                    <input
                      value={newOption}
                      onChange={e => setNewOption(e.target.value)}
                      placeholder="Enter Spreadsheet ID..."
                      className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      onKeyDown={e => { if (e.key === 'Enter') addOption(); }}
                    />
                    <button
                      onClick={addOption}
                      disabled={addingSheet || !newOption.trim()}
                      className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium transition disabled:opacity-50"
                    >
                      {addingSheet ? "..." : "Add"}
                    </button>
                  </div>
                </div>

                {/* Spreadsheet list */}
                <div className="max-h-64 overflow-y-auto">
                  {options.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      No spreadsheets found. Add one above.
                    </div>
                  ) : (
                    options.map(option => (
                      <div key={option.id} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                        <div 
                          className={`flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors ${
                            defaultSpreadsheetId === option.spreadsheetId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                          }`}
                          onClick={() => handleSpreadsheetSelect(option.spreadsheetId)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                              {option.label}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {option.sheetNames.length} sheet{option.sheetNames.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); if (window.confirm('Delete this spreadsheet?')) deleteOption(option.id); }}
                            className="ml-2 p-1 text-red-600 hover:text-red-800 text-xs"
                          >
                            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path d="M6 8v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V8"/>
                              <path d="M9 4h2a2 2 0 0 1 2 2v1H7V6a2 2 0 0 1 2-2z"/>
                              <line x1="4" y1="7" x2="16" y2="7"/>
                            </svg>
                          </button>
                        </div>

                        {/* Sheet names for selected spreadsheet */}
                        {defaultSpreadsheetId === option.spreadsheetId && (
                          <div className="bg-gray-50 dark:bg-gray-800 px-6 pb-3">
                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 font-medium">Select Sheet:</div>
                            <div className="grid grid-cols-2 gap-1">
                              {option.sheetNames.map(sheetName => (
                                <button
                                  key={sheetName}
                                  onClick={() => handleSheetSelect(sheetName)}
                                  className={`text-left px-2 py-1 text-xs rounded transition-colors ${
                                    selectedSheetName === sheetName 
                                      ? 'bg-blue-600 text-white' 
                                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                                  }`}
                                >
                                  {sheetName}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

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
          {/* Settings (gear) icon */}
          {user && (
            <button
              className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/30 transition-colors duration-200 focus:outline-none"
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 5 15.4a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 5 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09c.29.06.56.18.8.34.24.16.45.37.61.61.16.24.28.51.34.8H16a1.65 1.65 0 0 0 1.51 1z" />
              </svg>
            </button>
          )}
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

      {/* Click outside to close dropdown */}
      {sheetDropdownOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setSheetDropdownOpen(false)}
        />
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <section className="w-full max-w-md mx-auto bg-white/95 dark:bg-[#23232a] rounded-xl shadow-2xl p-8 border border-gray-200 dark:border-gray-800 flex flex-col items-center relative max-h-[90vh] overflow-hidden">
            <button
              onClick={() => setSettingsOpen(false)}
              className="sticky top-4 right-4 float-right text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl font-bold focus:outline-none z-10 bg-transparent"
              aria-label="Close"
              style={{ position: 'absolute', top: 16, right: 16 }}
            >&times;</button>
            <h2 className="text-xl font-bold mb-6 text-center">Settings</h2>
            <div className="mb-4 w-full">
              <label className="block text-md font-semibold mb-2 text-gray-800 dark:text-gray-100">Google Gemini API Key</label>
              <input
                type="password"
                value={geminiApiKey}
                onChange={e => setGeminiApiKey(e.target.value)}
                placeholder="Enter your Gemini API Key..."
                className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 w-full bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
              />
              <button
                onClick={saveGeminiApiKey}
                className="mt-3 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition w-full"
              >Save</button>
              {geminiApiKeySaved && <p className="text-green-600 text-sm mt-2">API Key saved!</p>}
            </div>
          </section>
        </div>
      )}
    </nav>
  );
};

export default NavBar;
