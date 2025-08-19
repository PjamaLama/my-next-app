"use client";
import React from "react";

import { useFirebase } from "./providers/FirebaseProvider";
import { useSheet } from "./providers/SheetProvider";

export default function Home() {
  const { user, loading } = useFirebase();
  const { defaultSpreadsheetId } = useSheet();

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] flex items-center justify-center">
        <div className="text-white">Please sign in</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#0b0b0e] to-[#0a0a0d] p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-white">
          <h1 className="text-2xl font-bold mb-4">Report AI</h1>
          {defaultSpreadsheetId ? (
            <p>Connected to spreadsheet: {defaultSpreadsheetId}</p>
          ) : (
            <p>No spreadsheet connected</p>
          )}
        </div>
      </div>
    </div>
  );
}
