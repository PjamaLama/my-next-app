"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';

interface TutorialContextType {
  showTutorial: () => void;
  hideTutorial: () => void;
  isTutorialVisible: boolean;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
};

interface TutorialProviderProps {
  children: React.ReactNode;
}

export const TutorialProvider: React.FC<TutorialProviderProps> = ({ children }) => {
  const [isTutorialVisible, setIsTutorialVisible] = useState(false);

  const showTutorial = useCallback(() => {
    setIsTutorialVisible(true);
  }, []);

  const hideTutorial = useCallback(() => {
    setIsTutorialVisible(false);
  }, []);

  const value: TutorialContextType = {
    showTutorial,
    hideTutorial,
    isTutorialVisible,
  };

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
};
