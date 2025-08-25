'use client';

import React from 'react';
import Link from 'next/link';
import { useFirebase } from '../providers/FirebaseProvider';

const WhatsAppLinkBanner = () => {
  const { user, waId } = useFirebase();

  // Only show the banner if the user is logged in and has no wa_id
  if (!user || waId) {
    return null;
  }

  return (
    <div className="bg-blue-600 text-white text-center p-2">
      <p className="text-sm">
        Link your WhatsApp for seamless messaging!{' '}
        <Link href="/whatsapp-setup" className="font-bold underline hover:text-blue-200">
          Go to settings.
        </Link>
      </p>
    </div>
  );
};

export default WhatsAppLinkBanner;
