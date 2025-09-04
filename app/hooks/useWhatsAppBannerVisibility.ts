import { useState, useEffect } from 'react';

interface WhatsAppBannerState {
  bannerMode: 'coming-soon' | 'start-chatting';
  isVisible: boolean;
  loading: boolean;
  error: string | null;
}

export function useWhatsAppBannerVisibility(): WhatsAppBannerState {
  const [state, setState] = useState<WhatsAppBannerState>({
    bannerMode: 'coming-soon',
    isVisible: true, // Default to visible
    loading: true,
    error: null
  });

  useEffect(() => {
    const fetchBannerVisibility = async () => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));

        // Fetch banner visibility setting from public endpoint
        const res = await fetch('/api/whatsapp-banner-visibility');
        if (!res.ok) {
          throw new Error('Failed to fetch banner visibility');
        }

        const data = await res.json();
        setState({
          bannerMode: data.bannerMode || 'coming-soon',
          isVisible: data.isVisible !== false, // Default to true unless explicitly false
          loading: false,
          error: null
        });
      } catch (error) {
        console.error('Failed to fetch WhatsApp banner visibility:', error);
        // On error, default to visible and don't show error to user
        setState({
          bannerMode: 'coming-soon',
          isVisible: true,
          loading: false,
          error: null
        });
      }
    };

    void fetchBannerVisibility();
  }, []);

  return state;
}
