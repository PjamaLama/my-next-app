"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useFirebase } from './FirebaseProvider';
import { db } from './FirebaseProvider';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

interface SheetContextType {
  defaultSpreadsheetId: string;
  selectedSheetNames: string[];
  setDefaultSpreadsheetId: (id: string) => void;
  setSelectedSheetNames: (names: string[]) => void;
}

const SheetContext = createContext<SheetContextType | null>(null);

export const useSheet = () => {
  const context = useContext(SheetContext);
  if (!context) {
    throw new Error('useSheet must be used within a SheetProvider');
  }
  return context;
};

export const SheetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useFirebase();
  const [defaultSpreadsheetId, setDefaultSpreadsheetIdState] = useState<string>("");
  const [selectedSheetNames, setSelectedSheetNamesState] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    const userDocRef = doc(db, "users", user.uid);
    const unsubUserDoc = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const newSpreadsheetId = data.defaultSpreadsheetId || "";
        const newSheetNames = data.selectedSheetNames || [];

        setDefaultSpreadsheetIdState(newSpreadsheetId);
        setSelectedSheetNamesState(newSheetNames);
      }
    });
    return () => unsubUserDoc();
  }, [user]);

  const saveDefaultSelections = async (spreadsheetId: string, sheetNames: string[]) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), {
        defaultSpreadsheetId: spreadsheetId,
        selectedSheetNames: sheetNames
      }, { merge: true });
    } catch (e) {
      console.error("Error saving default selections:", e);
    }
  };

  const setDefaultSpreadsheetId = (id: string) => {
    setDefaultSpreadsheetIdState(id);
    if (id && selectedSheetNames.length > 0) {
      saveDefaultSelections(id, selectedSheetNames);
    }
  };
  
  const setSelectedSheetNames = (names: string[]) => {
    setSelectedSheetNamesState(names);
    if (defaultSpreadsheetId && names.length > 0) {
      saveDefaultSelections(defaultSpreadsheetId, names);
    }
  };
  
  return (
    <SheetContext.Provider
      value={{
        defaultSpreadsheetId,
        selectedSheetNames,
        setDefaultSpreadsheetId,
        setSelectedSheetNames
      }}
    >
      {children}
    </SheetContext.Provider>
  );
}; 