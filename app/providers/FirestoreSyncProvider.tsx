"use client";

import React, { useEffect, useState } from 'react';
import { syncSheetToFirestore } from '../../libs/firestoreSync';

interface FirestoreSyncProviderProps {
  children: React.ReactNode;
}

export const FirestoreSyncProvider: React.FC<FirestoreSyncProviderProps> = ({ children }) => {
  const [hasSynced, setHasSynced] = useState(false);

  useEffect(() => {
    const performSync = async () => {
      // Guard: Only run in development or when feature flag is enabled
      const isDevelopment = process.env.NODE_ENV === 'development';
      const featureFlagEnabled = process.env.NEXT_PUBLIC_ENABLE_FIRESTORE_SYNC === 'true';
      const sheetId = process.env.NEXT_PUBLIC_SHEET_ID;

      if (!isDevelopment && !featureFlagEnabled) {
        console.log('Firestore sync skipped: Not in development and feature flag not enabled');
        return;
      }

      if (!sheetId) {
        console.log('Firestore sync skipped: No SHEET_ID environment variable found');
        return;
      }

      if (hasSynced) {
        console.log('Firestore sync skipped: Already synced in this session');
        return;
      }

      try {
        console.log('Starting Firestore sync...');
        console.log(`Environment: ${process.env.NODE_ENV}`);
        console.log(`Feature flag: ${featureFlagEnabled}`);
        console.log(`Sheet ID: ${sheetId}`);
        
        await syncSheetToFirestore(sheetId);
        setHasSynced(true);
        console.log('Firestore sync completed successfully');
      } catch (error) {
        console.error('Firestore sync failed:', error);
        // Don't throw error to prevent app from crashing
      }
    };

    // Add a small delay to ensure Firebase is initialized
    const timer = setTimeout(performSync, 1000);

    return () => clearTimeout(timer);
  }, [hasSynced]);

  return <>{children}</>;
}; 