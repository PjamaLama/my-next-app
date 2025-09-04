"use client";

import React, { useState } from "react";
import { useFirebase } from "../providers/FirebaseProvider";
import { useSheet } from "../providers/SheetProvider";
import { useServiceAccount } from "../providers/ServiceAccountProvider";
import ServiceAccountInfo from "./ServiceAccountInfo";

interface SpreadsheetManagerModalProps {
  open: boolean;
  onClose: () => void;
}

const SpreadsheetManagerModal: React.FC<SpreadsheetManagerModalProps> = ({ open, onClose }) => {
  const { user } = useFirebase();
  const { setDefaultSpreadsheetId } = useSheet();
  const { serviceAccountEmail } = useServiceAccount();
  const [newSheetId, setNewSheetId] = useState("");
  const [addingSheet, setAddingSheet] = useState(false);

  const normalizeSheetId = (input: string): string => {
    const trimmed = (input || '').trim();
    if (!trimmed) return '';
    try {
      const url = new URL(trimmed);
      const segments = url.pathname.split('/').filter(Boolean);
      const dIndex = segments.findIndex((seg) => seg === 'd');
      if (dIndex !== -1 && segments[dIndex + 1]) {
        return segments[dIndex + 1];
      }
    } catch {
      // Not a full URL, fall through
    }
    if (trimmed.includes('/d/')) {
      const afterD = trimmed.split('/d/')[1] || '';
      return (afterD.split('/')[0] || trimmed);
    }
    return trimmed;
  };

  const saveSpreadsheetOption = async (spreadsheetId: string) => {
    if (!user || !spreadsheetId) return;
    const { collection, addDoc, getDocs } = await import('firebase/firestore');
    const { getDb } = await import('../providers/FirebaseProvider');
    const db = getDb();
    if (!db) return;

    const optionsRef = collection(db, 'users', user.uid, 'options');

    // Check if this is the user's first spreadsheet connection
    const existingSheets = await getDocs(optionsRef);
    const isFirstSheet = existingSheets.empty;

    const meta = await fetch(`/api/get-sheet-names?spreadsheetId=${encodeURIComponent(spreadsheetId)}`).then(r => r.json()).catch(() => ({}));
    const payload: any = { spreadsheetId };
    if (meta && typeof meta.spreadsheetTitle === 'string' && meta.spreadsheetTitle.trim()) {
      payload.title = meta.spreadsheetTitle.trim();
    }
    await addDoc(optionsRef, payload);

    // Track first sheet connection
    if (isFirstSheet) {
      console.log('📊 First Sheet Connected');
    } else {
      console.log('📊 Additional Sheet Connected');
    }
  };

  const handleAddSpreadsheet = async () => {
    const parsedId = normalizeSheetId(newSheetId);
    if (!parsedId) return;
    setAddingSheet(true);
    try {
      await saveSpreadsheetOption(parsedId);
      setDefaultSpreadsheetId(parsedId);
      setNewSheetId("");
    } finally {
      setAddingSheet(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" className="relative w-[92%] max-w-xl rounded-2xl border border-white/10 glass-soft shadow-2xl ring-1 ring-white/10">
        <div className="px-4 py-3 rounded-t-2xl border-b border-white/10 bg-white/5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-white/90">Manage spreadsheets</div>
            <button onClick={onClose} className="h-8 px-2 rounded-md text-white/70 hover:text-white hover:bg-white/10 border border-white/10">Close</button>
          </div>
        </div>
        <div className="px-4 py-3 text-sm text-white/90">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <ServiceAccountInfo serviceAccountEmail={serviceAccountEmail} />
            <div className="text-xs text-white/80 mb-2">Add a Google Sheet</div>
            <div className="flex items-center gap-2">
              <input
                value={newSheetId}
                onChange={(e) => setNewSheetId(e.target.value)}
                placeholder="Paste full Google Sheets URL or ID"
                className="flex-1 px-2 py-1 text-xs rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none"
              />
              <button
                onClick={handleAddSpreadsheet}
                disabled={addingSheet}
                className="px-2 py-1 rounded-md text-xs bg-emerald-600 hover:bg-emerald-700"
              >
                {addingSheet ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>

          {/* Setup helper removed to keep modal lightweight and generic */}
        </div>
        <div className="px-4 py-3 flex items-center justify-end gap-2 border-t border-white/10 bg-black/20 rounded-b-2xl">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm border border-white/10 text-white/80 hover:bg-white/10">Done</button>
        </div>
      </div>
    </div>
  );
};

export default SpreadsheetManagerModal;


