"use client";

import { useMemo, useCallback } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';
import { useUserProfile } from './useUserProfile';
import { doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { getDb } from '../providers/FirebaseProvider';

const DAILY_LIMIT = 3;

export interface MessageLimitsState {
  dailyUsage: number;
  limit: number;
  isLimitReached: boolean;
  isNearLimit: boolean;
  canSendMessage: boolean;
}

export const useMessageLimits = () => {
  const { user, userType } = useFirebase();
  const { message_count } = useUserProfile(user);

  // Computed state based on Firebase data from useUserProfile
  // Daily resets are handled server-side by Firebase scheduled function
  const state = useMemo((): MessageLimitsState => {
    const isLimitReached = message_count >= DAILY_LIMIT && userType === 'free';
    const isNearLimit = message_count >= DAILY_LIMIT * 0.8 && userType === 'free';
    const canSendMessage = userType === 'pro' || !isLimitReached;

    return {
      dailyUsage: message_count,
      limit: DAILY_LIMIT,
      isLimitReached,
      isNearLimit,
      canSendMessage,
    };
  }, [message_count, userType]);

  // Increment usage when a message is sent
  const incrementUsage = useCallback(async () => {
    if (!user || userType === 'pro') return true; // Pro users have unlimited messages

    try {
      const db = getDb();
      if (!db) return true; // Allow message if DB not available

      const userDocRef = doc(db, 'users', user.uid);

      // Use Firestore increment for atomic operation
      // This prevents race conditions and ensures accurate counting
      const increment = (current: number) => current + 1;

      // First, get current count to check limit
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        console.log('📊 User document not found during increment - this should not happen as useUserProfile creates it');
        // Don't create document here - let useUserProfile handle initialization
        // This prevents race conditions and ensures proper initialization
        return true; // Allow message for now, user document will be created by useUserProfile
      }

      const userData = userDoc.data();
      const currentMessageCount = userData?.message_count || 0;

      console.log('📊 incrementUsage called:', {
        userId: user.uid,
        currentMessageCount,
        newUsage: currentMessageCount + 1,
        limit: DAILY_LIMIT
      });

      // Check if limit would be exceeded BEFORE incrementing
      if (currentMessageCount >= DAILY_LIMIT) {
        console.log('📊 Limit would be exceeded, blocking message');
        return false; // Block the message
      }

      // Increment the message count atomically
      await updateDoc(userDocRef, {
        message_count: currentMessageCount + 1
      });

      console.log('📊 Successfully incremented message count to:', currentMessageCount + 1);

      return true; // Allow the message

    } catch (error) {
      console.error('📊 Error incrementing usage in Firebase:', error);
      // On error, allow the message to avoid blocking users unnecessarily
      return true;
    }
  }, [user, userType]);

  // Reset usage (for testing or manual reset)
  const resetUsage = useCallback(async () => {
    if (!user) return;

    try {
      const db = getDb();
      if (!db) return;

      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        message_count: 0,
        last_reset: serverTimestamp()
      });

      console.log('📊 Manually reset usage in Firebase to 0');

    } catch (error) {
      console.error('📊 Error resetting usage in Firebase:', error);
    }
  }, [user]);

  return {
    ...state,
    incrementUsage,
    resetUsage,
  };
};
