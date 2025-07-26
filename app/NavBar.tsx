"use client";

import React, { useState, useEffect, useCallback } from 'react';
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

const NAV_LINKS: { name: string; href: string }[] = [];

// Types for sheet management
interface Option {
  id: string;
  label: string;
  spreadsheetId: string;
  sheetNames: string[];
}

const NavBar: React.FC = () => {
  const { user, signOutUser, geminiApiKey, saveGeminiApiKey } = useFirebase();
  const { defaultSpreadsheetId, selectedSheetName, setDefaultSpreadsheetId, setSelectedSheetName } = useSheet();
  const { serviceAccountEmail, isLoading: serviceAccountLoading } = useServiceAccount();
  const { settingsOpen, setSettingsOpen } = useSettings(); // Use settingsOpen and setSettingsOpen from the new provider
  const [sheetDropdownOpen, setSheetDropdownOpen] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [newOption, setNewOption] = useState("");
  const [addingSheet, setAddingSheet] = useState(false);
  // Removed: Gemini API Key settings modal state
  // const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [geminiApiKeySaved, setGeminiApiKeySaved] = useState<boolean>(false);

  // Set input value when geminiApiKey changes
  useEffect(() => {
    if (geminiApiKey) {
      setApiKeyInput(geminiApiKey);
    }
  }, [geminiApiKey]);

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
      // Standard sharing link: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit...
      /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
      // Alternative format: https://docs.google.com/spreadsheets/u/0/d/SPREADSHEET_ID/edit...
      /\/spreadsheets\/u\/\d+\/d\/([a-zA-Z0-9-_]+)/,
      // Mobile format: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/
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
    await deleteDoc(doc(db, "users", user.uid, "options", id));
  };

  // Debug function to log all spreadsheet options
  const debugSpreadsheetOptions = useCallback(() => {
    console.log('🔍 Current spreadsheet options:');
    options.forEach((option, index) => {
      console.log(`  ${index + 1}. "${option.label}" (ID: ${option.spreadsheetId})`);
      console.log(`     Sheets: [${option.sheetNames.join(', ')}]`);
      console.log(`     Firebase Doc ID: ${option.id}`);
    });
    console.log(`Current selection: spreadsheet="${defaultSpreadsheetId}", sheet="${selectedSheetName}"`);
  }, [options, defaultSpreadsheetId, selectedSheetName]);



  // Call debug on options change
  useEffect(() => {
    if (options.length > 0) {
      debugSpreadsheetOptions();
      
      // Check for potential mismatches
      if (defaultSpreadsheetId && selectedSheetName) {
        const currentOption = options.find(o => o.spreadsheetId === defaultSpreadsheetId);
        if (currentOption && !currentOption.sheetNames.includes(selectedSheetName)) {
          console.warn(`⚠️ MISMATCH DETECTED: Sheet "${selectedSheetName}" not found in current spreadsheet's stored sheets: [${currentOption.sheetNames.join(', ')}]`);
          console.warn('🔧 Consider clearing selections to fix this issue');
        }
      }
    }
  }, [options, defaultSpreadsheetId, selectedSheetName, debugSpreadsheetOptions]);

  const handleSpreadsheetSelect = async (spreadsheetId: string) => {
    console.log(`🎯 Selected spreadsheet: ${spreadsheetId}`);
    
    // Clear any previous sheet selection FIRST to avoid stale data issues
    setSelectedSheetName('');
    
    // Set the new spreadsheet ID
    setDefaultSpreadsheetId(spreadsheetId);
    setSheetDropdownOpen(false);
    
    try {
      console.log(`🔄 Refreshing sheet names for spreadsheet: ${spreadsheetId}`);
      
      // Refresh sheet names from the actual spreadsheet to ensure they're current
      const res = await fetch('/api/get-sheet-names/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId }),
      });
      
      if (res.ok) {
        const { sheetNames, spreadsheetTitle } = await res.json();
        console.log(`📋 Found ${sheetNames.length} sheets in "${spreadsheetTitle}":`, sheetNames);
        
        // Validate that we have actual sheet names
        if (!Array.isArray(sheetNames) || sheetNames.length === 0) {
          console.error('❌ No valid sheet names returned');
          return;
        }
        
        // Update the stored sheet names in Firebase
        const option = options.find(o => o.spreadsheetId === spreadsheetId);
        if (option && user) {
          try {
            await updateDoc(doc(db, 'users', user.uid, 'options', option.id), {
              sheetNames,
              label: spreadsheetTitle || option.label,
              lastUpdated: new Date().toISOString()
            });
            console.log(`💾 Updated Firebase with new sheet names for "${spreadsheetTitle}"`);
          } catch (updateError) {
            console.warn('Failed to update Firebase, but continuing:', updateError);
          }
        }
        
        // Auto-select the first available sheet from the ACTUAL spreadsheet
        const firstActualSheet = sheetNames[0];
        if (firstActualSheet && typeof firstActualSheet === 'string') {
          // Use a small delay to ensure spreadsheet ID is properly set first
          setTimeout(() => {
            // Double-check that we're still on the same spreadsheet to prevent race conditions
            if (defaultSpreadsheetId === spreadsheetId) {
              console.log(`✅ Auto-selecting sheet: "${firstActualSheet}" for spreadsheet: ${spreadsheetId}`);
              console.log(`📊 Available sheets: [${sheetNames.join(', ')}]`);
              setSelectedSheetName(firstActualSheet);
            } else {
              console.log(`⚠️ Spreadsheet changed during sheet refresh, skipping selection (expected: ${spreadsheetId}, current: ${defaultSpreadsheetId})`);
            }
          }, 150); // Reduced delay since we cleared the sheet name first
        } else {
          console.warn('❌ No valid first sheet found');
        }
      } else {
        console.error('Failed to refresh sheet names, API error:', res.status);
        const errorText = await res.text();
        console.error('API Error details:', errorText);
      }
    } catch (error) {
      console.error('Error refreshing sheet names:', error);
    }
  };

  const currentSpreadsheet = options.find(o => o.spreadsheetId === defaultSpreadsheetId);

  const handleSaveGeminiApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      await saveGeminiApiKey(apiKeyInput.trim());
      setGeminiApiKeySaved(true);
      setTimeout(() => setGeminiApiKeySaved(false), 3000);
      // Removed: setSettingsOpen(false);
    } catch (e) {
      console.error("Error saving Gemini API key:", e);
    }
  };

  return (
    <nav className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm overflow-x-hidden">
      <div className="container mx-auto flex justify-between items-center px-3 sm:px-4 py-2 max-w-full">
          {/* Logo and Title - Properly aligned for mobile */}
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

          {/* Desktop Nav Links - Hidden on mobile */}
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

          {/* User section: Optimized for mobile */}
          <div className="flex items-center gap-1 sm:gap-4 flex-shrink-0">
            {user && (
              <>
                {/* Spreadsheet Selector - Mobile-first design */}
                <div className="relative">
                  <button
                    onClick={() => setSheetDropdownOpen(!sheetDropdownOpen)}
                    className="flex items-center gap-1 sm:gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white px-2 sm:px-3 py-2 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-300 border border-white/20 text-xs sm:text-sm min-h-[44px]"
                  >
                    <svg width="14" height="14" className="sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M9 9h6v6H9z" />
                    </svg>
                    <span className="max-w-[60px] sm:max-w-[100px] md:max-w-[140px] truncate">
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
                  
                  {/* Unified modal for both mobile and desktop */}
                  {sheetDropdownOpen && (
                    <>
                      {/* Backdrop */}
                      <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setSheetDropdownOpen(false)} />
                      
                      {/* Modal container */}
                      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                        <div className="w-full max-w-md sm:max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-h-[85vh] overflow-hidden">
                          {/* Modal header */}
                          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">Select Spreadsheet</h3>
                            <button
                              onClick={() => setSheetDropdownOpen(false)}
                              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          
                          {/* Modal content */}
                          <div className="overflow-y-auto max-h-[calc(85vh-80px)]">
                            {/* Add new spreadsheet section */}
                            <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
                              <div className="space-y-3">
                                {!serviceAccountLoading && serviceAccountEmail && (
                                  <ServiceAccountInfo serviceAccountEmail={serviceAccountEmail} />
                                )}
                                <div>
                                  <input
                                    value={newOption}
                                    onChange={e => setNewOption(e.target.value)}
                                    placeholder="Paste Google Sheets share link or ID..."
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-base bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    onKeyDown={e => { if (e.key === 'Enter') addOption(); }}
                                  />
                                  <p className="text-xs text-gray-500 mt-2">
                                    💡 Just paste the share link from Google Sheets (Share → Copy link)
                                  </p>
                                </div>
                                <button
                                  onClick={addOption}
                                  disabled={addingSheet || !newOption.trim()}
                                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white text-base rounded-lg font-medium transition disabled:opacity-50"
                                >
                                  {addingSheet ? "Adding..." : "Add Spreadsheet"}
                                </button>
                              </div>
                            </div>
                            
                            {/* Spreadsheet list */}
                            <div className="p-3 sm:p-4">
                              {options.length === 0 ? (
                                <div className="p-8 text-center text-gray-500">
                                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  <p className="text-sm">No spreadsheets found.</p>
                                  <p className="text-xs text-gray-400 mt-1">Add one above to get started.</p>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {options.map(option => (
                                    <div key={option.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                      <div 
                                        className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${
                                          defaultSpreadsheetId === option.spreadsheetId 
                                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                        }`}
                                        onClick={() => handleSpreadsheetSelect(option.spreadsheetId)}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-3">
                                            <div className={`w-3 h-3 rounded-full ${
                                              defaultSpreadsheetId === option.spreadsheetId ? 'bg-blue-500' : 'bg-gray-300'
                                            }`} />
                                            <div>
                                              <div className="font-medium text-gray-900 dark:text-gray-100 text-sm sm:text-base">
                                                {option.label}
                                              </div>
                                              <div className="text-xs sm:text-sm text-gray-500">
                                                {option.sheetNames.length} sheet{option.sheetNames.length !== 1 ? 's' : ''}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                        <button
                                          onClick={e => { e.stopPropagation(); if (window.confirm('Delete this spreadsheet?')) deleteOption(option.id); }}
                                          className="p-2 text-red-600 hover:text-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        >
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
                  )}
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
                      className="rounded-full object-cover w-9 h-9 sm:w-10 sm:h-10 border border-white/40 shadow cursor-pointer"
                    />
                  ) : (
                    <span className="rounded-full bg-gray-300 flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 cursor-pointer">
                      <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M6 20c0-2.21 3.582-4 6-4s6 1.79 6 4" />
                      </svg>
                    </span>
                  )}
                  
                  {/* Settings button */}
                  <button
                    className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-300 border border-white/20 min-h-[44px] min-w-[44px]"
                    aria-label="Settings"
                    onClick={() => setSettingsOpen(true)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 sm:w-6 sm:h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.438.995s.145.755.438.995l1.003.827c.48.398.668 1.03.26 1.431l-1.296 2.247a1.125 1.125 0 0 1-1.37.49l-1.217-.456c-.355-.133-.75-.072-1.075.124a6.57 6.57 0 0 1-.22.128c-.332.183-.582.495-.645.87l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.645-.87a6.52 6.52 0 0 1-.22-.127c-.324-.196-.72-.257-1.075-.124l-1.217.456a1.125 1.125 0 0 1-1.37-.49l-1.296-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.437-.995s-.145-.755-.437-.995l-1.004-.827a1.125 1.125 0 0 1-.26-1.431l1.296-2.247a1.125 1.125 0 0 1 1.37-.49l1.217.456c.355.133.75.072 1.075-.124.072-.044.146-.087.22-.128.332-.183.582-.495.645-.87l.213-1.28Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>


        {/* Settings Modal - Mobile optimized */}
        {settingsOpen && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black/50 z-[60]" 
              onClick={() => setSettingsOpen(false)} 
            />
            {/* Modal Container */}
            <div className="fixed inset-0 z-[70] p-2 sm:p-4">
              <div className="min-h-screen flex items-center justify-center">
                {/* Modal Panel */}
                <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[95vh] overflow-y-auto transform transition-all">
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 sm:px-8 py-4 sm:py-6 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">Settings</h2>
                    <button
                      onClick={() => setSettingsOpen(false)}
                      className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-300 rounded-lg p-2 min-h-[44px] min-w-[44px]"
                    >
                      <span className="sr-only">Close</span>
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  {/* Content */}
                  <div className="p-6 sm:p-8">
                    {/* Info Box */}
                    <div className="mb-6 sm:mb-8 bg-blue-50 dark:bg-blue-900/30 rounded-xl p-4 sm:p-6">
                      <h3 className="text-base sm:text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3 sm:mb-4">
                        How to get a Gemini API key
                      </h3>
                      <ol className="text-sm sm:text-base text-blue-800 dark:text-blue-200 space-y-2 sm:space-y-3">
                        <li className="flex items-start">
                          <span className="font-medium mr-3">1.</span>
                          Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-300 hover:underline">Google AI Studio</a>
                        </li>
                        <li className="flex items-start">
                          <span className="font-medium mr-3">2.</span>
                          Sign in with your Google account
                        </li>
                        <li className="flex items-start">
                          <span className="font-medium mr-3">3.</span>
                          Click &apos;Create API Key&apos; and copy it
                        </li>
                        <li className="flex items-start">
                          <span className="font-medium mr-3">4.</span>
                          Paste it below and save
                        </li>
                      </ol>
                    </div>
                    {/* API Key Input */}
                    <div className="space-y-4 sm:space-y-6">
                      <label className="block">
                        <span className="text-sm sm:text-base font-medium text-gray-700 dark:text-gray-200 mb-2 block">
                          Google Gemini API Key
                        </span>
                        <input
                          type="password"
                          value={apiKeyInput}
                          onChange={e => setApiKeyInput(e.target.value)}
                          placeholder="Enter your API key..."
                          className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 
                                   bg-white dark:bg-gray-800 px-4 py-3 text-sm sm:text-base
                                   placeholder-gray-400 dark:placeholder-gray-500
                                   focus:border-yellow-300 dark:focus:border-yellow-300 
                                   focus:outline-none focus:ring-2 focus:ring-yellow-300 min-h-[50px]"
                        />
                      </label>
                      <button
                        onClick={handleSaveGeminiApiKey}
                        disabled={!apiKeyInput.trim()}
                        className="w-full flex justify-center py-3 px-6 border border-transparent 
                                 rounded-lg shadow-sm text-sm sm:text-base font-medium text-white 
                                 bg-blue-600 hover:bg-blue-700 
                                 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                                 disabled:opacity-50 disabled:cursor-not-allowed
                                 transition-colors duration-200 min-h-[50px]"
                      >
                        Save API Key
                      </button>
                      {/* Success Message */}
                      {geminiApiKeySaved && (
                        <div className="flex items-center justify-center text-sm sm:text-base text-green-600 dark:text-green-400 mt-2">
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          API Key saved successfully!
                        </div>
                      )}
                      {/* Logout Button */}
                      <button
                        onClick={() => { signOutUser(); setSettingsOpen(false); }}
                        className="w-full flex justify-center py-3 px-6 border border-transparent rounded-lg shadow-sm text-sm sm:text-base font-medium text-white bg-gradient-to-r from-red-500 to-pink-500 hover:from-pink-500 hover:to-red-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 mt-6 sm:mt-8 min-h-[50px]"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </nav>
    );
  };

export default NavBar;
