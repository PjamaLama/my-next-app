"use client";
import React, { useEffect, useState, useRef } from "react";
import { useFirebase } from "./providers/FirebaseProvider";
import { useSheet } from "./providers/SheetProvider";
import { useTutorial } from "./providers/TutorialProvider";
import ChatInterface from "./components/ChatInterface";
import LandingPage from "./components/LandingPage";

export default function Home() {
  const { user, loading, signInWithGoogle } = useFirebase();
  const { defaultSpreadsheetId, sheetsPrefetched } = useSheet();
  const { showTutorial, hideTutorial, isTutorialVisible } = useTutorial();
  const tutorialTriggered = useRef(false);

  useEffect(() => {
    // Prevent multiple tutorial triggers and don't trigger during chat operations
    if (tutorialTriggered.current) return;

    // Only trigger tutorial on initial app load, not during chat switching
    if (!user) return; // Don't trigger if no user yet

    // Check if the user has seen the tutorial before
    let hasSeenTutorial = false;
    try {
      hasSeenTutorial = localStorage.getItem('hasSeenTutorial') === 'true';
    } catch (error) {
      console.warn('Failed to access localStorage:', error);
      // If localStorage fails, assume tutorial has been seen to prevent infinite loading
      hasSeenTutorial = true;
    }

    // Only show tutorial for first-time users on initial load
    if (!hasSeenTutorial && !tutorialTriggered.current) {
      tutorialTriggered.current = true;
      console.log('🔍 [Home] Showing tutorial for first-time user');
      showTutorial();
    }
  }, []); // Empty dependency array - only run once on mount

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  const handleCloseTutorial = () => {
    hideTutorial();
  };

  const handleOpenGoogleSheets = () => {
    // Open Google Sheets in a new tab
    window.open('https://sheets.google.com', '_blank');
  };

  // Only show loading on initial app load, not during chat switching
  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] text-white">
        <div className="flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/5 text-white/90">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600"></div>
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LandingPage onSignIn={handleSignIn} user={user} />;
  }

  // Don't block chat interface on spreadsheet loading - load in background

  // Always show chat interface for logged-in users - spreadsheets load in background
  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] text-white">
      <ChatInterface onShowTutorial={showTutorial} />
    </div>
  );
}


