'use client';

import { useState } from 'react';

interface AdminMeta {
  showWhatsAppMessaging: boolean;
}

export function useAdminMeta() {
  // Simplified - always show WhatsApp messaging for simplicity
  const [meta] = useState<AdminMeta>({ showWhatsAppMessaging: true });
  const [loading] = useState(false);

  return { meta, loading };
}
