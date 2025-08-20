"use client";
import React from "react";
import { useFirebase } from "./providers/FirebaseProvider";
import { useSheet } from "./providers/SheetProvider";
import ChatInterface from "./components/ChatInterface";

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
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] text-white">
        <div className="max-w-md mx-auto text-center px-6">
          {/* Logo/Brand */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
              Report AI
            </h1>
            <p className="text-white/70 mt-2 text-lg">
              AI-powered spreadsheet management and analysis
            </p>
          </div>

          {/* Features */}
          <div className="mb-8 space-y-4 text-left">
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
              <span>Connect Google Sheets for instant analysis</span>
            </div>
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
              <span>AI-powered data insights and reporting</span>
            </div>
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
              <span>Natural language data queries</span>
            </div>
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
              <span>Automated data processing workflows</span>
            </div>
          </div>

          {/* Sign In Button */}
          <button
            onClick={handleSignIn}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-[#0b0b0e]"
          >
            Sign in with Google
          </button>

          {/* Privacy Note */}
          <p className="text-white/50 text-sm mt-6">
            By signing in, you agree to our{" "}
            <a href="/terms" className="text-emerald-400 hover:text-emerald-300 underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="text-emerald-400 hover:text-emerald-300 underline">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    );
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


