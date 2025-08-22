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
    // Prevent multiple tutorial triggers
    if (tutorialTriggered.current) return;
    
    // Check if the user has seen the tutorial before
    let hasSeenTutorial = false;
    try {
      hasSeenTutorial = localStorage.getItem('hasSeenTutorial') === 'true';
    } catch (error) {
      console.warn('Failed to access localStorage:', error);
      // If localStorage fails, assume tutorial has been seen to prevent infinite loading
      hasSeenTutorial = true;
    }
    
    if (!hasSeenTutorial && user && !loading) {
      // Show tutorial for first-time users after they're authenticated
      tutorialTriggered.current = true;
      showTutorial();
    }
  }, [user, loading, showTutorial]);

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  const handleCloseTutorial = () => {
    hideTutorial();
    localStorage.setItem('hasSeenTutorial', 'true'); // Mark tutorial as seen
  };

  const handleOpenGoogleSheets = () => {
    // Open Google Sheets in a new tab
    window.open('https://sheets.google.com', '_blank');
  };

  if (loading) {
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

  // Show loading state while spreadsheets are being fetched
  if (defaultSpreadsheetId && !sheetsPrefetched) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] text-white">
        <div className="flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/5 text-white/90">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600"></div>
          <span className="text-sm">Loading your spreadsheets...</span>
        </div>
      </div>
    );
  }

  // User is logged in and spreadsheets are loaded
  if (defaultSpreadsheetId) {
    return (
      <div className="h-screen flex flex-col bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] text-white">
        <ChatInterface onShowTutorial={showTutorial} />
      </div>
    );
  }

  // Show connect spreadsheet prompt when no spreadsheet is connected
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] text-white p-6">
      <div className="text-center max-w-2xl">
        <h1 className="text-4xl font-bold mb-6">Welcome to SheetyAI!</h1>
        <p className="text-xl text-white/70 mb-8">
          Connect your Google Sheets to start analyzing your data with AI.
        </p>
        <div className="space-y-4">
          <button
            onClick={handleOpenGoogleSheets}
            className="w-full sm:w-auto px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
          >
            Open Google Sheets
          </button>
          <div className="text-sm text-white/50">
            Create a new spreadsheet or use an existing one, then come back here to connect it.
          </div>
        </div>
      </div>
    </div>
  );
}


