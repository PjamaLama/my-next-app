"use client";

import React from 'react';
import { MessageSquare, AlertTriangle, Crown } from 'lucide-react';
import { useFirebase } from '../providers/FirebaseProvider';
import { useUpgradeModal } from '../providers/UpgradeModalProvider';
import { useMessageLimits } from '../hooks/useMessageLimits';

export default function MessageCounter() {
  const { user, userType } = useFirebase();
  const { openModal } = useUpgradeModal();
  const { dailyUsage, limit, isLimitReached, isNearLimit, canSendMessage, loadUsage } = useMessageLimits();

  // Debug: Log re-renders
  React.useEffect(() => {
    console.log('📊 MessageCounter re-rendered with:', {
      dailyUsage,
      limit,
      isLimitReached,
      isNearLimit,
      userType
    });
  });

  // Force refresh usage data when component mounts or when userType changes
  React.useEffect(() => {
    if (user && userType === 'free') {
      loadUsage();
    }
  }, [user, userType, loadUsage]);

  // Listen for usage update events to refresh immediately - more robust approach
  React.useEffect(() => {
    const handleUsageUpdate = (event: CustomEvent) => {
      console.log('📊 MessageCounter received usage update event:', event.detail);
      // Always refresh for free users when any usage event occurs
      if (userType === 'free') {
        console.log('📊 Refreshing usage data for free user');
        loadUsage();
      }
    };

    console.log('📊 Setting up usage update listener for MessageCounter');
    window.addEventListener('usage-updated', handleUsageUpdate as EventListener);

    // Also listen for a more direct update event
    const handleDirectUpdate = () => {
      if (userType === 'free') {
        console.log('📊 Direct refresh triggered');
        loadUsage();
      }
    };

    window.addEventListener('message-counter-refresh', handleDirectUpdate);

    return () => {
      console.log('📊 Cleaning up usage update listener for MessageCounter');
      window.removeEventListener('usage-updated', handleUsageUpdate as EventListener);
      window.removeEventListener('message-counter-refresh', handleDirectUpdate);
    };
  }, [userType, loadUsage]);

  const getUsagePercentage = () => {
    return Math.min((dailyUsage / limit) * 100, 100);
  };

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
          {dailyUsage}/{limit}
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
            {limit - dailyUsage} left
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
