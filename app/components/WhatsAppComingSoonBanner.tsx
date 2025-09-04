'use client';

import React from 'react';

const WhatsAppComingSoonBanner = () => {
  return (
    <div className="text-center text-xs text-gray-400 mt-3">
      <div className="bg-gradient-to-r from-green-600/20 to-green-700/20 border border-green-500/30 rounded-md p-2 inline-block cursor-pointer hover:bg-green-600/30 transition-colors">
        <div className="flex items-center gap-2 text-green-300">
          <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="text-sm font-medium">WhatsApp Integration Coming soon!</span>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppComingSoonBanner;
