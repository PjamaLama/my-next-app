"use client";

import React, { useState, useEffect } from 'react';
import { useServiceAccount } from '../providers/ServiceAccountProvider';
import { useSearchParams } from 'next/navigation';
import { useFirebase } from '../providers/FirebaseProvider';
import PhoneNumberInput from './PhoneNumberInput';

const WhatsAppLinkForm = () => {
  const { user } = useFirebase();
  const { waId: initialWaId, setWaId: setContextWaId } = useServiceAccount();
  const [waId, setWaId] = useState(initialWaId || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLinked, setIsLinked] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const searchParams = useSearchParams();

  useEffect(() => {
    const waIdFromQuery = searchParams?.get('wa_id');
    if (waIdFromQuery) {
      setWaId(waIdFromQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    setWaId(initialWaId || '');
  }, [initialWaId]);

  // Check if user already has a linked WhatsApp number
  const checkUserWhatsAppStatus = async () => {
    if (!user) {
      setIsLoadingProfile(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        if (userData.wa_id) {
          setWaId(userData.wa_id);
          setContextWaId(userData.wa_id);
          setIsLinked(true);
        }
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  // Check user's WhatsApp status when user changes
  useEffect(() => {
    if (user) {
      checkUserWhatsAppStatus();
    } else {
      setIsLoadingProfile(false);
    }
  }, [user]);

  const validateWaId = (id: string) => {
    // Handle empty or undefined values
    if (!id || typeof id !== 'string') {
      return false;
    }
    
    // Trim whitespace
    const trimmedId = id.trim();
    
    // Check if it's empty after trimming
    if (!trimmedId) {
      return false;
    }
    
    // E.164 format validation: +[country code][number] (1-15 digits total)
    // Examples: +1, +44, +1234567890, +44123456789
    return /^\+[1-9]\d{1,14}$/.test(trimmedId);
  };

  const handleSave = async () => {
    if (!user) {
      setError('You must be logged in to save your WhatsApp number.');
      return;
    }
    
    // Clear previous errors
    setError('');
    
    if (!waId || !waId.trim()) {
      setError('WhatsApp number cannot be empty.');
      return;
    }
    
    if (!validateWaId(waId)) {
      setError(`Invalid format: "${waId}". Please enter a valid international phone number starting with + followed by country code and number.`);
      return;
    }
    
    setIsSaving(true);
    setSuccess('');

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/user/update-wa-id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ wa_id: waId.trim() }),
      });

      if (response.ok) {
        setContextWaId(waId.trim());
        setSuccess('WhatsApp number saved successfully!');
        setIsLinked(true);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save WhatsApp number.');
      }
    } catch (err) {
      setError('An unexpected error occurred.');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="glass rounded-xl border border-white/10 p-4 mb-4">
        <div className="text-center text-white/70">Loading...</div>
      </div>
    );
  }

  if (isLinked) {
    return (
      <div className="glass rounded-xl border border-white/10 p-4 mb-4">
        <div className="flex flex-col gap-3">
          <div className="text-center">
            <div className="text-green-400 text-2xl mb-2">✓</div>
            <h3 className="text-lg font-semibold text-white mb-2">WhatsApp Linked Successfully!</h3>
            <p className="text-sm text-white/70 mb-4">
              Your WhatsApp number <span className="font-semibold">{waId}</span> is now linked to your account.
            </p>
            <button
              onClick={async () => {
                if (!user) {
                  setError('You must be logged in to unlink your WhatsApp number.');
                  return;
                }
                
                try {
                  const token = await user.getIdToken();
                  const response = await fetch('/api/user/unlink-wa-id', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`,
                    },
                  });

                  if (response.ok) {
                    setWaId('');
                    setContextWaId('');
                    setIsLinked(false);
                    setSuccess('WhatsApp number unlinked successfully!');
                    setTimeout(() => setSuccess(''), 3000);
                  } else {
                    const data = await response.json();
                    setError(data.error || 'Failed to unlink WhatsApp number.');
                  }
                } catch (err) {
                  setError('An unexpected error occurred while unlinking.');
                }
              }}
              className="bg-red-600/20 border border-red-500/30 text-red-300 hover:bg-red-600/30 rounded-lg p-2 text-xs mx-auto"
            >
              Unlink WhatsApp
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl border border-white/10 p-4 mb-4">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-white">Link WhatsApp</h3>
        <p className="text-xs text-white/70">
          Enter your WhatsApp number to link it with SheetyAI for messaging.
          The number will be automatically formatted with the correct country code.
        </p>
        <PhoneNumberInput
          value={waId}
          onChange={(value) => setWaId(value || '')}
          placeholder="Enter your WhatsApp number"
          error={!!error}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-green-400">{success}</p>}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-white/10 border border-white/10 text-white/90 hover:bg-white/20 rounded-lg p-2"
        >
          {isSaving ? 'Saving...' : 'Save WhatsApp Number'}
        </button>
      </div>
    </div>
  );
};

export default WhatsAppLinkForm;
