"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

interface TrackingPanelContextType {
  isVisible: boolean;
  setIsVisible: (visible: boolean) => void;
}

const TrackingPanelContext = createContext<TrackingPanelContextType | undefined>(undefined);

export function TrackingPanelProvider({ children }: { children: React.ReactNode }) {
  const [isVisible, setIsVisible] = useState(true);

  // Load initial state from localStorage (only in development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const stored = localStorage.getItem('tracking-panel-visible');
      if (stored !== null) {
        setIsVisible(JSON.parse(stored));
      }
    }
  }, []);

  // Save state to localStorage whenever it changes (only in development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      localStorage.setItem('tracking-panel-visible', JSON.stringify(isVisible));
    }
  }, [isVisible]);

  const value = {
    isVisible,
    setIsVisible,
  };

  return (
    <TrackingPanelContext.Provider value={value}>
      {children}
    </TrackingPanelContext.Provider>
  );
}

export function useTrackingPanel() {
  const context = useContext(TrackingPanelContext);
  if (context === undefined) {
    throw new Error('useTrackingPanel must be used within a TrackingPanelProvider');
  }
  return context;
}
