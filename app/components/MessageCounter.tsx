"use client";

import React, { useState, useEffect } from 'react';
import { MessageSquare, AlertTriangle, Crown } from 'lucide-react';
import { useFirebase } from '../providers/FirebaseProvider';
import { useUpgradeModal } from '../providers/UpgradeModalProvider';

export default function MessageCounter() {
  const { user, userType } = useFirebase();
  const { openModal } = useUpgradeModal();
  const [dailyUsage, setDailyUsage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const DAILY_LIMIT = 5;

  // Simulate message tracking (in a real app, this would come from your backend)
  useEffect(() => {
    if (!user) return;

    // For demo purposes, we'll use localStorage to track messages
    // In production, this should come from your backend API
    const today = new Date().toDateString();
    const storageKey = `sheetyai_messages_${user.uid}_${today}`;

    const storedUsage = localStorage.getItem(storageKey);
    if (storedUsage) {
      setDailyUsage(parseInt(storedUsage, 10));
    }

    setIsLoading(false);
  }, [user]);

  const incrementUsage = () => {
    if (!user) return;

    const today = new Date().toDateString();
    const storageKey = `sheetyai_messages_${user.uid}_${today}`;

    const newUsage = dailyUsage + 1;
    setDailyUsage(newUsage);
    localStorage.setItem(storageKey, newUsage.toString());
  };

  const getUsagePercentage = () => {
    return Math.min((dailyUsage / DAILY_LIMIT) * 100, 100);
  };

  const isLimitReached = dailyUsage >= DAILY_LIMIT && userType === 'free';
  const isNearLimit = dailyUsage >= DAILY_LIMIT * 0.8 && userType === 'free';

  if (userType === 'pro' || !user) {
    return null; // Don't show counter for pro users or when not logged in
  }

  // Compact design that's less intrusive
  return (
    <div className="bg-gray-800/30 border border-gray-700/30 rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MessageSquare className={`w-4 h-4 ${isLimitReached ? 'text-red-400' : isNearLimit ? 'text-yellow-400' : 'text-gray-400'}`} />
          <span className="text-sm text-gray-300 font-medium">Messages</span>
        </div>
        <div className="text-xs text-gray-400">
          {dailyUsage}/{DAILY_LIMIT}
        </div>
      </div>

      {/* Compact Progress Bar */}
      <div className="w-full bg-gray-700 rounded-full h-1.5 mb-2">
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${
            isLimitReached ? 'bg-red-500' : isNearLimit ? 'bg-yellow-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${getUsagePercentage()}%` }}
        ></div>
      </div>

      {/* Compact Status */}
      <div className="flex items-center justify-between">
        {isLimitReached ? (
          <div className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span className="text-xs text-red-400">Limit reached</span>
          </div>
        ) : isNearLimit ? (
          <div className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-yellow-400" />
            <span className="text-xs text-yellow-400">Almost full</span>
          </div>
        ) : (
          <span className="text-xs text-gray-500">
            {DAILY_LIMIT - dailyUsage} left
          </span>
        )}

        {isLimitReached && (
          <button
            onClick={() => openModal('Pro')}
            className="text-emerald-400 hover:text-emerald-300 text-xs font-medium flex items-center gap-1"
          >
            <Crown className="w-3 h-3" />
            Upgrade
          </button>
        )}
      </div>
    </div>
  );
}

// Export the increment function for use in chat components
export const incrementMessageCount = (userId: string) => {
  const today = new Date().toDateString();
  const storageKey = `sheetyai_messages_${userId}_${today}`;

  const currentUsage = parseInt(localStorage.getItem(storageKey) || '0', 10);
  const newUsage = currentUsage + 1;

  localStorage.setItem(storageKey, newUsage.toString());
  return newUsage;
};
