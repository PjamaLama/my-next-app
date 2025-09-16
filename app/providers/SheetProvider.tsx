"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useFirebase, getDb } from './FirebaseProvider';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { analyzeSheetStructure, SheetStructureMeta } from '../../lib/sheetStructure';

interface SheetContextType {
  defaultSpreadsheetId: string;
  selectedSheetNames: string[];
  setDefaultSpreadsheetId: (id: string) => void;
  setSelectedSheetNames: (names: string[]) => void;
  // Prefetch/cache state exposed so it survives page re-mounts and across chats
  allSheetNames: string[];
  sheetDataCache: Record<string, string[][]>;
  sheetsPrefetched: boolean;
  isSheetDataLoading: boolean;
  setSheetDataCache: React.Dispatch<React.SetStateAction<Record<string, string[][]>>>;
  sheetStructureCache: Record<string, { isStructured: boolean; confidence: number; issues: string[]; detectedHeaderRowIndex?: number; blocks?: Array<{ headerRowIndex: number; startRowIndex: number; endRowIndex: number; score: number }> }>;
  unstructuredOverrides: Record<string, boolean>;
  setUnstructuredOverride: (sheetName: string, value: boolean) => void;
  chosenBlockBySheet: Record<string, number | null>;
  setChosenBlockForSheet: (sheetName: string, blockIndex: number | null) => void;
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
  const [isSheetDataLoading, setIsSheetDataLoading] = useState<boolean>(false);
  const [sheetStructureCache, setSheetStructureCache] = useState<Record<string, { isStructured: boolean; confidence: number; issues: string[]; detectedHeaderRowIndex?: number; blocks?: Array<{ headerRowIndex: number; startRowIndex: number; endRowIndex: number; score: number }> }>>({});
  const [unstructuredOverrides, setUnstructuredOverrides] = useState<Record<string, boolean>>({});
  const [chosenBlockBySheet, setChosenBlockBySheet] = useState<Record<string, number | null>>({});

  useEffect(() => {
    if (!user) return;
    const db = getDb();
    if (!db) return;

    // Read from main user document instead of private profile
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


  // Prefetch all sheet names and data once per selected spreadsheet (moved from page component)
  useEffect(() => {
    let cancelled = false;
    const doPrefetch = async (forceRefresh = false) => {
      if (!defaultSpreadsheetId) {
        setAllSheetNames([]);
        setSheetDataCache({});
        setSheetStructureCache({});
        setChosenBlockBySheet({});
        setSheetsPrefetched(false);
        return;
      }
      // Reset caches when spreadsheet changes or force refresh
      if (!forceRefresh) {
        setAllSheetNames([]);
        setSheetDataCache({});
        setSheetStructureCache({});
        setChosenBlockBySheet({});
        setSheetsPrefetched(false);
      }
      try {
        const namesRes = await fetch('/api/get-sheet-names', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spreadsheetId: defaultSpreadsheetId,
            forceRefresh
          })
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
        // Mark prefetched once names are loaded; sheet data will be fetched on demand
        if (!cancelled) setSheetsPrefetched(true);
      } catch (e) {
        console.warn('Prefetch sheet names failed', e);
      }
    };

    // Listen for force refresh events from SheetChipSelector
    const handleForceRefresh = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.spreadsheetId === defaultSpreadsheetId) {
        void doPrefetch(true);
      }
    };

    window.addEventListener('force-refresh-sheet-names' as any, handleForceRefresh);

    void doPrefetch();
    return () => {
      cancelled = true;
      window.removeEventListener('force-refresh-sheet-names' as any, handleForceRefresh);
    };
  }, [defaultSpreadsheetId]);

  // Fetch sheet data when selected sheets change
  useEffect(() => {
    let cancelled = false;
    const fetchSheetData = async () => {
      if (!defaultSpreadsheetId || !selectedSheetNames.length) {
        console.log('🔍 [SHEET] Skipping sheet data fetch:', { defaultSpreadsheetId, selectedSheetNames });
        setIsSheetDataLoading(false);
        return;
      }

      console.log('🔍 [SHEET] Fetching sheet data for:', selectedSheetNames);
      setIsSheetDataLoading(true);

      try {
        // Fetch data for each selected sheet
        const newSheetDataCache: Record<string, string[][]> = {};
        const newSheetStructureCache: Record<string, SheetStructureMeta> = {};
        
        for (const sheetName of selectedSheetNames) {
          try {
            console.log(`🔍 [SHEET] Fetching data for sheet: ${sheetName}`);
            const response = await fetch('/api/get-sheet-data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                spreadsheetId: defaultSpreadsheetId, 
                sheetName,
                maxRows: 10 // Only fetch first 10 rows for efficiency
              })
            });
            
            if (response.ok && !cancelled) {
              const data = await response.json();
              if (data.data && Array.isArray(data.data)) {
                newSheetDataCache[sheetName] = data.data;
                const structure = analyzeSheetStructure(data.data);
                newSheetStructureCache[sheetName] = structure;
                console.log(`✅ [SHEET] Successfully fetched data for ${sheetName}:`, {
                  rows: data.data.length,
                  headers: data.data[0]?.length || 0
                });
              } else {
                console.log(`❌ [SHEET] Invalid data structure for ${sheetName}:`, data);
              }
            } else {
              console.log(`❌ [SHEET] Failed to fetch data for ${sheetName}:`, response.status, response.statusText);
            }
          } catch (e) {
            console.warn(`Failed to fetch data for sheet ${sheetName}:`, e);
          }
        }
        
        if (!cancelled) {
          console.log('🔍 [SHEET] Updating sheetDataCache with:', Object.keys(newSheetDataCache));
          setSheetDataCache(prev => ({ ...prev, ...newSheetDataCache }));
          setSheetStructureCache(prev => ({ ...prev, ...newSheetStructureCache }));
        }
      } catch (e) {
        console.warn('Failed to fetch sheet data:', e);
      } finally {
        if (!cancelled) {
          setIsSheetDataLoading(false);
        }
      }
    };

    void fetchSheetData();
    return () => { cancelled = true; };
  }, [defaultSpreadsheetId, selectedSheetNames]);

  const saveDefaultSelections = async (spreadsheetId: string, sheetNames: string[]) => {
    if (!user) return;
    const db = getDb();
    if (!db) return;

    try {
      // Save to main user document instead of private profile
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
  const setUnstructuredOverride = (sheetName: string, value: boolean) => {
    setUnstructuredOverrides(prev => ({ ...prev, [sheetName]: value }));
  };
  const setChosenBlockForSheet = (sheetName: string, blockIndex: number | null) => {
    setChosenBlockBySheet(prev => ({ ...prev, [sheetName]: blockIndex }));
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
        isSheetDataLoading,
        setSheetDataCache,
        sheetStructureCache,
        unstructuredOverrides,
        setUnstructuredOverride,
        chosenBlockBySheet,
        setChosenBlockForSheet
      }}
    >
      {children}
    </SheetContext.Provider>
  );
}; 