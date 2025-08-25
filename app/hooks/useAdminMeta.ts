'use client';

import { useState, useEffect } from 'react';
import { useFirebase } from '../providers/FirebaseProvider';

interface AdminMeta {
  showWhatsAppMessaging: boolean;
}

export function useAdminMeta() {
  const { user } = useFirebase();
  const [meta, setMeta] = useState<AdminMeta>({ showWhatsAppMessaging: false });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchMeta = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/meta', { 
          headers: { Authorization: `Bearer ${token}` } 
        });
        
        if (res.ok) {
          const data = await res.json();
          setMeta({
            showWhatsAppMessaging: data.showWhatsAppMessaging ?? false
          });
        }
      } catch (error) {
        console.error('Failed to fetch admin meta:', error);
        // Default to NOT showing WhatsApp messaging if fetch fails
        setMeta({ showWhatsAppMessaging: false });
      } finally {
        setLoading(false);
      }
    };

    fetchMeta();
  }, [user]);

  return { meta, loading };
}
