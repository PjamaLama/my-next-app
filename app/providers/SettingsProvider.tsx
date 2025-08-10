"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { setWorkbookConfig, type WorkbookConfig } from '@/lib/sheetConfig';

interface SettingsContextType {
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

export const SettingsContext = createContext<SettingsContextType>({
  settingsOpen: false,
  setSettingsOpen: () => {},
});

export const useSettings = () => useContext(SettingsContext);

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Seed a minimal default config once if a last spreadsheet id is known
  useEffect(() => {
    try {
      const spreadsheetId = typeof window !== 'undefined' ? localStorage.getItem('lastSpreadsheetId') || undefined : undefined;
      if (!spreadsheetId) return;
      const cfg: WorkbookConfig = {
        'Fuel Sheet': {
          sheetName: 'Fuel Sheet',
          primaryKeys: [
            { headers: ['Date', 'Reg#'] },
            { headers: ['Date', 'Vehicle'], fuzzy: true },
            { headers: ['Date', 'Fuel Cost in Rands'] },
          ],
          required: ['Date'],
          mergePolicy: 'prefer_existing',
        },
      };
      setWorkbookConfig(spreadsheetId, cfg);
    } catch {}
  }, []);

  return (
    <SettingsContext.Provider value={{ settingsOpen, setSettingsOpen }}>
      {children}
    </SettingsContext.Provider>
  );
}; 