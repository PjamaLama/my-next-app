"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useFirebase } from './FirebaseProvider';
import { db } from './FirebaseProvider';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

interface SheetContextType {
  defaultSpreadsheetId: string;
  selectedSheetName: string;
  setDefaultSpreadsheetId: (id: string) => void;
  setSelectedSheetName: (name: string) => void;
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
  const [selectedSheetName, setSelectedSheetNameState] = useState<string>("");

  // Load user's default selections from Firebase
  useEffect(() => {
    if (!user) return;
    const userDocRef = doc(db, "users", user.uid);

    const unsubUserDoc = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.defaultSpreadsheetId) {
          setDefaultSpreadsheetIdState(data.defaultSpreadsheetId);
        }
        if (data.defaultSheetName) {
          setSelectedSheetNameState(data.defaultSheetName);
        }
      }
    });

    return () => unsubUserDoc();
  }, [user]);

  // Save selections to Firebase
  const saveDefaultSelections = async (spreadsheetId: string, sheetName: string) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), { 
        defaultSpreadsheetId: spreadsheetId,
        defaultSheetName: sheetName 
      }, { merge: true });
    } catch (e) {
      console.error("Error saving default selections:", e);
    }
  };

  const setDefaultSpreadsheetId = (id: string) => {
    setDefaultSpreadsheetIdState(id);
    if (id && selectedSheetName) {
      saveDefaultSelections(id, selectedSheetName);
    }
  };

  const setSelectedSheetName = (name: string) => {
    setSelectedSheetNameState(name);
    if (defaultSpreadsheetId && name) {
      saveDefaultSelections(defaultSpreadsheetId, name);
    }
  };

  return (
    <SheetContext.Provider 
      value={{
        defaultSpreadsheetId,
        selectedSheetName,
        setDefaultSpreadsheetId,
        setSelectedSheetName
      }}
    >
      {children}
    </SheetContext.Provider>
  );
}; 