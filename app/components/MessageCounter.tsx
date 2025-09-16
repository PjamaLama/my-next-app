"use client";
// Golden outline v5.0 - Force complete recompile

import React from 'react';
import { MessageSquare, AlertTriangle, Crown } from 'lucide-react';
import { useFirebase } from '../providers/FirebaseProvider';
import { useUpgradeModal } from '../providers/UpgradeModalProvider';
import { useMessageLimits } from '../hooks/useMessageLimits';

export default function MessageCounter() {
  const { user, userType } = useFirebase();
  const { openModal } = useUpgradeModal();
  const { dailyUsage, limit, isLimitReached, isNearLimit, canSendMessage } = useMessageLimits();

  // Debug: Log current state to help troubleshoot subscription issues
  React.useEffect(() => {
    console.log('📊 MessageCounter state:', {
      userType,
      dailyUsage,
      limit,
      isLimitReached,
      isNearLimit,
      canSendMessage,
      userEmail: user?.email
    });
  }, [userType, dailyUsage, limit, isLimitReached, isNearLimit, canSendMessage, user]);

  // Force refresh user profile for debugging
  const forceRefreshProfile = () => {
    console.log('🔄 MessageCounter: Forcing profile refresh...');
    window.dispatchEvent(new CustomEvent('subscription-updated'));
  };

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

  // State automatically updates via Firebase listeners in useUserProfile
  // No need for manual refresh calls with the new computed state architecture

  const getUsagePercentage = () => {
    return Math.min((dailyUsage / limit) * 100, 100);
  };

  if (userType === 'pro' || !user) {
    return null; // Don't show counter for pro users or when not logged in
  }

  // Enhanced design with better upgrade messaging
  console.log('🔍 MessageCounter: Rendering limit reached section with golden button');
  if (isLimitReached) {
    return (
      <div className="bg-gradient-to-r from-red-900/20 to-orange-900/20 border border-red-500/30 rounded-lg p-4 mb-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-medium text-red-300 mb-1">
              Daily Message Limit Reached
            </div>
            <div className="text-xs text-gray-300 mb-3">
              You've used all {limit} daily messages. Upgrade to Pro for unlimited conversations, WhatsApp & in‑app chat, and priority support.
            </div>
            <div className="text-xs text-gray-400 mb-3">
              <div className="font-medium text-emerald-400 mb-1">Pro includes:</div>
              <ul className="space-y-0.5 ml-2">
                <li>• Unlimited conversations daily</li>
                <li>• WhatsApp & in‑app chat integration</li>
                <li>• Priority customer support</li>
              </ul>
            </div>
            <button
              onClick={() => {
                console.log('🔄 MessageCounter: Opening upgrade modal from daily limit reached');
                openModal('Pro');
              }}
              className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-white px-4 py-3 rounded-lg text-sm font-bold flex items-center gap-2 transition-all duration-200 w-full justify-center border-2 border-yellow-300 shadow-xl hover:shadow-2xl ring-2 ring-yellow-400/30 hover:ring-yellow-300/50"
            >
              <Crown className="w-4 h-4" fill="currentColor" />
              Upgrade to Pro - Unlimited Messages
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/30 border border-gray-700/30 rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MessageSquare className={`w-4 h-4 ${isNearLimit ? 'text-yellow-400' : 'text-gray-400'}`} />
          <span className="text-sm text-gray-300 font-medium">Daily Messages</span>
        </div>
        <div className="text-xs text-gray-400">
          {dailyUsage}/{limit}
        </div>
      </div>

      {/* Compact Progress Bar */}
      <div className="w-full bg-gray-700 rounded-full h-1.5 mb-2">
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${
            isNearLimit ? 'bg-yellow-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${getUsagePercentage()}%` }}
        ></div>
      </div>

      {/* Compact Status */}
      <div className="flex items-center justify-between">
        {isNearLimit ? (
          <div className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-yellow-400" />
            <span className="text-xs text-yellow-400">Almost full</span>
          </div>
        ) : (
          <span className="text-xs text-gray-500">
            {limit - dailyUsage} left
          </span>
        )}

        <div className="flex items-center gap-1">
          {isNearLimit && (
            <button
              onClick={() => {
                console.log('🔄 MessageCounter: Opening upgrade modal from near limit');
                openModal('Pro');
              }}
              className="text-emerald-400 hover:text-emerald-300 text-xs font-medium flex items-center gap-1"
            >
              <Crown className="w-3 h-3" />
              Upgrade
            </button>
          )}

          {/* Debug: Temporary refresh button */}
          {process.env.NODE_ENV === 'development' && (
            <button
              onClick={forceRefreshProfile}
              className="text-blue-400 hover:text-blue-300 text-xs font-medium"
              title="Force refresh profile"
            >
              ↻
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
