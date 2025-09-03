"use client";

import React from 'react';
import { Crown, X } from 'lucide-react';
import { useFirebase } from '../providers/FirebaseProvider';

interface UpgradeBannerProps {
  onUpgrade: () => void;
  onDismiss?: () => void;
}

export default function UpgradeBanner({ onUpgrade, onDismiss }: UpgradeBannerProps) {
  const { userType } = useFirebase();

  // Don't show banner for pro users
  if (userType === 'pro') {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-emerald-600/10 to-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 mx-4 mb-4 relative">
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute top-2 right-2 text-white/60 hover:text-white/80 transition-colors"
          aria-label="Dismiss upgrade banner"
        >
          <X size={16} />
        </button>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
            <Crown className="w-5 h-5 text-emerald-400" fill="currentColor" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white mb-1">
            Upgrade to Pro
          </h3>
          <p className="text-xs text-white/80">
            Get unlimited voice commands and premium features for just $19/month
          </p>
        </div>

        <button
          onClick={onUpgrade}
          className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Upgrade
        </button>
      </div>
    </div>
  );
}
