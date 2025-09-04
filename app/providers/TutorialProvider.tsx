"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

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
    console.log('🔍 [TutorialProvider] showTutorial called');
    setIsTutorialVisible(true);
  }, []);

  const hideTutorial = useCallback(() => {
    console.log('🔍 [TutorialProvider] hideTutorial called');
    setIsTutorialVisible(false);
    // Mark tutorial as seen in localStorage when hiding
    try {
      localStorage.setItem('hasSeenTutorial', 'true');
      console.log('🔍 [TutorialProvider] Tutorial marked as seen');
    } catch (error) {
      console.warn('Failed to save tutorial status to localStorage:', error);
    }
  }, []);

  // Debug logging
  useEffect(() => {
    console.log('🔍 [TutorialProvider] isTutorialVisible changed:', isTutorialVisible);
  }, [isTutorialVisible]);

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
