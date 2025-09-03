"use client";

import { useState, useEffect, useCallback } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';

const DAILY_LIMIT = 5;

export interface MessageLimitsState {
  dailyUsage: number;
  limit: number;
  isLimitReached: boolean;
  isNearLimit: boolean;
  canSendMessage: boolean;
}

export const useMessageLimits = () => {
  const { user, userType } = useFirebase();
  const [state, setState] = useState<MessageLimitsState>({
    dailyUsage: 0,
    limit: DAILY_LIMIT,
    isLimitReached: false,
    isNearLimit: false,
    canSendMessage: true,
  });

  // Load daily usage from localStorage
  const loadUsage = useCallback(() => {
    if (!user) return;

    const today = new Date().toDateString();
    const storageKey = `sheetyai_messages_${user.uid}_${today}`;

    const storedUsage = parseInt(localStorage.getItem(storageKey) || '0', 10);
    console.log('📊 loadUsage called:', {
      userId: user.uid,
      storageKey,
      storedUsage,
      userType
    });

    const isLimitReached = storedUsage >= DAILY_LIMIT && userType === 'free';
    const isNearLimit = storedUsage >= DAILY_LIMIT * 0.8 && userType === 'free';
    const canSendMessage = userType === 'pro' || !isLimitReached;

    const newState = {
      dailyUsage: storedUsage,
      limit: DAILY_LIMIT,
      isLimitReached,
      isNearLimit,
      canSendMessage,
    };

    console.log('📊 loadUsage setting state:', newState);
    setState(newState);
  }, [user, userType]);

  // Increment usage when a message is sent
  const incrementUsage = useCallback(() => {
    if (!user || userType === 'pro') return true; // Pro users have unlimited messages

    const today = new Date().toDateString();
    const storageKey = `sheetyai_messages_${user.uid}_${today}`;

    const currentUsage = parseInt(localStorage.getItem(storageKey) || '0', 10);
    const newUsage = currentUsage + 1;

    console.log('📊 incrementUsage called:', {
      userId: user.uid,
      currentUsage,
      newUsage,
      limit: DAILY_LIMIT
    });

    // Check if limit would be exceeded
    if (newUsage > DAILY_LIMIT) {
      console.log('📊 Limit would be exceeded, blocking message');
      setState(prev => ({
        ...prev,
        dailyUsage: currentUsage,
        isLimitReached: true,
        canSendMessage: false,
      }));
      return false; // Block the message
    }

    // Update storage and state immediately
    localStorage.setItem(storageKey, newUsage.toString());
    console.log('📊 Updated localStorage:', { storageKey, newUsage });

    // Force immediate state update
    setState(prev => {
      const updatedState = {
        ...prev,
        dailyUsage: newUsage,
        isNearLimit: newUsage >= DAILY_LIMIT * 0.8,
        canSendMessage: true,
      };
      console.log('📊 Updated state:', updatedState);
      return updatedState;
    });

    // Dispatch a custom event to notify other components of usage change
    console.log('📊 Dispatching usage-updated event');
    window.dispatchEvent(new CustomEvent('usage-updated', {
      detail: {
        newUsage,
        userId: user.uid,
        timestamp: Date.now()
      }
    }));

    // Also dispatch a direct refresh event for immediate updates
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('message-counter-refresh'));
    }, 50);

    return true; // Allow the message
  }, [user, userType]);

  // Reset usage (for testing or when day changes)
  const resetUsage = useCallback(() => {
    if (!user) return;

    const today = new Date().toDateString();
    const storageKey = `sheetyai_messages_${user.uid}_${today}`;

    localStorage.removeItem(storageKey);
    setState(prev => ({
      ...prev,
      dailyUsage: 0,
      isLimitReached: false,
      isNearLimit: false,
      canSendMessage: true,
    }));
  }, [user]);

  // Load usage on mount and when user/type changes
  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  // Check for day change and reset if needed
  useEffect(() => {
    if (!user) return;

    const checkDayChange = () => {
      const today = new Date().toDateString();
      const storageKey = `sheetyai_messages_${user.uid}_${today}`;

      if (!localStorage.getItem(storageKey)) {
        // Day has changed, reset usage
        resetUsage();
      }
    };

    // Check immediately and then every hour
    checkDayChange();
    const interval = setInterval(checkDayChange, 60 * 60 * 1000); // Check every hour

    return () => clearInterval(interval);
  }, [user, resetUsage]);

  return {
    ...state,
    incrementUsage,
    resetUsage,
    loadUsage,
  };
};
