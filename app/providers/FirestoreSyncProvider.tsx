"use client";

import React, { useEffect, useState } from 'react';

interface FirestoreSyncProviderProps {
  children: React.ReactNode;
}

export const FirestoreSyncProvider: React.FC<FirestoreSyncProviderProps> = ({ children }) => {
  const [hasSynced, setHasSynced] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');

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
        console.log('Starting Firestore sync via API...');
        console.log(`Environment: ${process.env.NODE_ENV}`);
        console.log(`Feature flag: ${featureFlagEnabled}`);
        console.log(`Sheet ID: ${sheetId}`);
        
        setSyncStatus('syncing');

        // Call the API endpoint instead of direct function import
        const response = await fetch('/api/sync-firestore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sheetId: sheetId,
            // Optional: include sheetName if you want to sync a specific tab
            // sheetName: 'Sheet1'
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`API Error: ${errorData.error} - ${errorData.details || ''}`);
        }

        const result = await response.json();
        console.log('Firestore sync completed successfully:', result.message);
        
        setHasSynced(true);
        setSyncStatus('success');
      } catch (error) {
        console.error('Firestore sync failed:', error);
        setSyncStatus('error');
        // Don't throw error to prevent app from crashing
      }
    };

    // Add a small delay to ensure Firebase is initialized
    const timer = setTimeout(performSync, 1000);

    return () => clearTimeout(timer);
  }, [hasSynced]);

  // Optional: You can expose sync status for debugging or UI feedback
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Firestore sync status:', syncStatus);
    }
  }, [syncStatus]);

  return <>{children}</>;
}; 