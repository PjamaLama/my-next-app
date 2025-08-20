"use client";
import React from "react";
import { useFirebase } from "./providers/FirebaseProvider";
import { useSheet } from "./providers/SheetProvider";
import ChatInterface from "./components/ChatInterface";

import LandingPage from "./components/LandingPage";

export default function Home() {
  const { user, loading, signInWithGoogle } = useFirebase();
  const { defaultSpreadsheetId, sheetsPrefetched } = useSheet();

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Sign in error:", error);
    }
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
    return <LandingPage onSignIn={handleSignIn} />;
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
    // Show chat interface when spreadsheet is connected
    return (
      <div className="h-screen flex flex-col bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] text-white">
        <ChatInterface />
      </div>
    );
  }

  // Show connect spreadsheet prompt when no spreadsheet is connected
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] text-white">
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome back!</h1>
          <p className="text-white/70">
            Connect a Google Sheet to get started with AI-powered data management.
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center">
          <h2 className="text-xl font-semibold mb-4">Get Started</h2>
          <p className="text-white/70 mb-6">
            Connect your first Google Sheet to unlock AI-powered data analysis, 
            automated reporting, and intelligent insights.
          </p>
          <button className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors duration-200">
            Connect Spreadsheet
          </button>
        </div>
      </div>
    </div>
  );
}


