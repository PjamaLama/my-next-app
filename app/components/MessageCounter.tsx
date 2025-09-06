"use client";

import React from 'react';
import { MessageSquare, AlertTriangle, Crown } from 'lucide-react';
import { useFirebase } from '../providers/FirebaseProvider';
import { useUpgradeModal } from '../providers/UpgradeModalProvider';
import { useMessageLimits } from '../hooks/useMessageLimits';

export default function MessageCounter() {
  const { user, userType } = useFirebase();
  const { openModal } = useUpgradeModal();
  const { dailyUsage, limit, isLimitReached, isNearLimit, canSendMessage } = useMessageLimits();

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
              You've used all {limit} daily messages. Upgrade to Pro for unlimited messages and premium features.
            </div>
            <div className="text-xs text-gray-400 mb-3">
              <div className="font-medium text-emerald-400 mb-1">Pro Benefits:</div>
              <ul className="space-y-0.5 ml-2">
                <li>• Unlimited messages daily</li>
                <li>• Advanced AI features</li>
                <li>• Priority support</li>
                <li>• Higher file upload limits</li>
              </ul>
            </div>
            <button
              onClick={() => {
                console.log('🔄 MessageCounter: Opening upgrade modal from daily limit reached');
                openModal('Pro');
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors w-full justify-center"
            >
              <Crown className="w-4 h-4" />
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
      </div>
    </div>
  );
}
