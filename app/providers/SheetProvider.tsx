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
  // Prefetch/cache state exposed so it survives page re-mounts and across chats
  allSheetNames: string[];
  sheetDataCache: Record<string, string[][]>;
  sheetsPrefetched: boolean;
  setSheetDataCache: React.Dispatch<React.SetStateAction<Record<string, string[][]>>>;
  sheetStructureCache: Record<string, { isStructured: boolean; confidence: number; issues: string[] }>;
  unstructuredOverrides: Record<string, boolean>;
  setUnstructuredOverride: (sheetName: string, value: boolean) => void;
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
  const [allSheetNames, setAllSheetNames] = useState<string[]>([]);
  const [sheetDataCache, setSheetDataCache] = useState<Record<string, string[][]>>({});
  const [sheetsPrefetched, setSheetsPrefetched] = useState<boolean>(false);
  const [sheetStructureCache, setSheetStructureCache] = useState<Record<string, { isStructured: boolean; confidence: number; issues: string[] }>>({});
  const [unstructuredOverrides, setUnstructuredOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    const userDocRef = doc(db, "users", user.uid, "private", "profile");
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

  // Prefetch all sheet names and data once per selected spreadsheet (moved from page component)
  useEffect(() => {
    let cancelled = false;
    const doPrefetch = async () => {
      if (!defaultSpreadsheetId) {
        setAllSheetNames([]);
        setSheetDataCache({});
        setSheetsPrefetched(false);
        return;
      }
      // Reset caches when spreadsheet changes
      setAllSheetNames([]);
      setSheetDataCache({});
      setSheetsPrefetched(false);
      try {
        const namesRes = await fetch('/api/get-sheet-names', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spreadsheetId: defaultSpreadsheetId })
        });
        const namesJson = await namesRes.json();
        const names: string[] = namesJson.sheetNames || namesJson.data || [];
        if (cancelled) return;
        setAllSheetNames(names);

        // Reconcile selected sheets with the latest list from the spreadsheet
        // Remove any selections that no longer exist
        if (selectedSheetNames.length > 0) {
          const filteredSelected = selectedSheetNames.filter(n => names.includes(n));
          if (filteredSelected.length !== selectedSheetNames.length) {
            setSelectedSheetNamesState(filteredSelected);
            if (defaultSpreadsheetId) {
              void saveDefaultSelections(defaultSpreadsheetId, filteredSelected);
            }
          }
        }

        for (const name of names) {
          try {
            const dataRes = await fetch('/api/get-sheet-data', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ spreadsheetId: defaultSpreadsheetId, sheetName: name })
            });
            const dataJson = await dataRes.json();
            if (cancelled) return;
            setSheetDataCache(prev => ({ ...prev, [name]: dataJson.data || [] }));
            if (dataJson.structure) {
              const { isStructured, confidence, issues } = dataJson.structure;
              setSheetStructureCache(prev => ({ ...prev, [name]: { isStructured, confidence, issues } }));
            }
          } catch (e) {
            console.warn('Prefetch sheet data failed for', name, e);
          }
        }
        if (!cancelled) setSheetsPrefetched(true);
      } catch (e) {
        console.warn('Prefetch sheet names failed', e);
      }
    };
    void doPrefetch();
    return () => { cancelled = true; };
  }, [defaultSpreadsheetId]);

  const saveDefaultSelections = async (spreadsheetId: string, sheetNames: string[]) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid, "private", "profile"), {
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
  const setUnstructuredOverride = (sheetName: string, value: boolean) => {
    setUnstructuredOverrides(prev => ({ ...prev, [sheetName]: value }));
  };
  
  return (
    <SheetContext.Provider
      value={{
        defaultSpreadsheetId,
        selectedSheetNames,
        setDefaultSpreadsheetId,
        setSelectedSheetNames,
        allSheetNames,
        sheetDataCache,
        sheetsPrefetched,
        setSheetDataCache,
        sheetStructureCache,
        unstructuredOverrides,
        setUnstructuredOverride
      }}
    >
      {children}
    </SheetContext.Provider>
  );
}; 