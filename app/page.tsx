"use client";
import React, { useEffect, useState, useRef } from "react";
import { useFirebase } from "./providers/FirebaseProvider";
import { useSheet } from "./providers/SheetProvider";
import { useTutorial } from "./providers/TutorialProvider";
import ChatInterface from "./components/ChatInterface";
import LandingPage from "./components/LandingPage";
import { DemoInputManager } from "../lib/demoInputManager";

export default function Home() {
  const { user, loading, signInWithGoogle } = useFirebase();
  const { defaultSpreadsheetId, sheetsPrefetched, setDefaultSpreadsheetId } = useSheet();
  const { showTutorial, hideTutorial, isTutorialVisible } = useTutorial();
  const tutorialTriggered = useRef(false);

  // Demo onboarding state
  const [showDemoOnboarding, setShowDemoOnboarding] = useState(false);
  const [demoInputData, setDemoInputData] = useState<any>(null);

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

  // Check for demo input after user signs in
  useEffect(() => {
    if (!user || !sheetsPrefetched) return;

    // Check if we have recent demo input to show onboarding
    if (DemoInputManager.shouldShowOnboardingModal() && !defaultSpreadsheetId) {
      const demoData = DemoInputManager.getDemoInput();
      if (demoData) {
        setDemoInputData(demoData);
        setShowDemoOnboarding(true);
      }
    }
  }, [user, sheetsPrefetched, defaultSpreadsheetId]);

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

  const handleCloseDemoOnboarding = () => {
    setShowDemoOnboarding(false);
    setDemoInputData(null);
    // Clear the demo input since user has seen it
    DemoInputManager.clearDemoInput();
  };

  const handleProcessDemoData = async () => {
    if (!user || !demoInputData) return;

    try {
      // First, create a demo spreadsheet
      const token = await user.getIdToken();
      const createResponse = await fetch('/api/create-demo-spreadsheet', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create demo spreadsheet');
      }

      const spreadsheetData = await createResponse.json();

      // Set the demo spreadsheet as the default
      if (spreadsheetData.spreadsheetId) {
        // This will update the user's Firestore document
        setDefaultSpreadsheetId(spreadsheetData.spreadsheetId);

        // Now process the original user input with the real AI system
        try {
          await processOriginalUserInput(demoInputData, spreadsheetData.spreadsheetId, token);
        } catch (processError) {
          console.warn('Failed to auto-process demo input, but spreadsheet was created:', processError);
          // Don't fail the whole flow if processing fails
        }

        // Close the modal and clear demo input
        setShowDemoOnboarding(false);
        DemoInputManager.clearDemoInput();

        // Show success message or trigger next steps
        console.log('Demo spreadsheet created and set up successfully:', spreadsheetData);
      }

    } catch (error) {
      console.error('Error setting up demo data:', error);
      // For now, just close the modal even if there's an error
      setShowDemoOnboarding(false);
      DemoInputManager.clearDemoInput();
    }
  };

  const processOriginalUserInput = async (inputData: any, spreadsheetId: string, token: string) => {
    // Process the original demo input using the real AI system
    const requestBody = {
      message: inputData.content,
      context: {
        sheetNames: ['Demo Data'], // Use the demo sheet
        sheetData: {}
      },
      conversationHistory: [],
      fileUrls: undefined
    };

    const response = await fetch('/api/genkit-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      const aiResponse = await response.json();
      console.log('Successfully processed original demo input with real AI:', aiResponse);
    } else {
      console.warn('Failed to process demo input with real AI, but spreadsheet was created');
    }
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

      {/* Demo Onboarding Modal */}
      {showDemoOnboarding && demoInputData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl max-w-2xl w-full mx-4 relative border border-white/10 shadow-2xl">
            <div className="p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-400/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">🚀</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Welcome to SheetyAI!</h3>
                <p className="text-gray-300 text-sm leading-relaxed">
                  I see you tried our demo on the landing page. Let's set up your account to process your actual data!
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-6">
                <h4 className="text-white font-semibold mb-2">Your Demo Input:</h4>
                <p className="text-gray-300 text-sm mb-3">
                  <strong>Type:</strong> {demoInputData.type}
                </p>
                <p className="text-gray-300 text-sm">
                  <strong>Content:</strong> {demoInputData.content.length > 100
                    ? `${demoInputData.content.substring(0, 100)}...`
                    : demoInputData.content
                  }
                </p>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
                <h4 className="text-blue-300 font-semibold mb-2">📋 Next Steps:</h4>
                <ol className="text-gray-300 text-sm space-y-1">
                  <li>1. Connect your Google Sheets account</li>
                  <li>2. Process your demo data with real AI</li>
                  <li>3. Save results to your spreadsheet automatically</li>
                </ol>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleProcessDemoData}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-emerald-500/25"
                >
                  🚀 Set Up & Process My Data
                </button>

                <button
                  onClick={handleCloseDemoOnboarding}
                  className="w-full bg-transparent text-gray-400 hover:text-white text-sm py-2 transition-colors"
                >
                  Skip for now
                </button>
              </div>

              <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-400/20 rounded-lg">
                <p className="text-emerald-300 text-xs text-center">
                  💡 You can always access this from your chat later!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


