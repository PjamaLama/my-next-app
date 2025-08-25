'use client';

import React from 'react';

const WhatsAppComingSoonBanner = () => {
  return (
    <div className="text-center text-xs text-gray-400 mt-3">
      <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-md p-2 inline-block">
        <div className="text-blue-300 font-medium text-xs mb-0.5">WhatsApp Integration</div>
        <div className="text-blue-200/70 text-xs leading-tight">
          Direct messaging coming soon!
        </div>
      </div>
    </div>
  );
};

export default WhatsAppComingSoonBanner;
