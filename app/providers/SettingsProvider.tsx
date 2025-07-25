"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

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

  return (
    <SettingsContext.Provider value={{ settingsOpen, setSettingsOpen }}>
      {children}
    </SettingsContext.Provider>
  );
}; 