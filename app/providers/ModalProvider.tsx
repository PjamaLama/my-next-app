"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import SpreadsheetManagerModal from "../components/SpreadsheetManagerModal";

interface ModalContextType {
  isSpreadsheetManagerOpen: boolean;
  openSpreadsheetManager: () => void;
  closeSpreadsheetManager: () => void;
}

const ModalContext = createContext<ModalContextType | null>(null);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};

interface ModalProviderProps {
  children: ReactNode;
}

export const ModalProvider: React.FC<ModalProviderProps> = ({ children }) => {
  const [isSpreadsheetManagerOpen, setIsSpreadsheetManagerOpen] = useState(false);

  const openSpreadsheetManager = () => {
    console.log('🎯 ModalProvider: Setting spreadsheet manager modal to OPEN');
    setIsSpreadsheetManagerOpen(true);
  };
  const closeSpreadsheetManager = () => {
    console.log('🎯 ModalProvider: Setting spreadsheet manager modal to CLOSED');
    setIsSpreadsheetManagerOpen(false);
  };

  return (
    <ModalContext.Provider
      value={{
        isSpreadsheetManagerOpen,
        openSpreadsheetManager,
        closeSpreadsheetManager,
      }}
    >
      {children}
      <SpreadsheetManagerModal
        open={isSpreadsheetManagerOpen}
        onClose={closeSpreadsheetManager}
      />
    </ModalContext.Provider>
  );
};
