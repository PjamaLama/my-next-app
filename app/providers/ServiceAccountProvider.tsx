"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useFirebase } from './FirebaseProvider';

interface ServiceAccountContextType {
  serviceAccountEmail: string;
  isLoading: boolean;
  waId: string | null;
  setWaId: (waId: string) => void;
}

const ServiceAccountContext = createContext<ServiceAccountContextType>({
  serviceAccountEmail: '',
  isLoading: true,
  waId: null,
  setWaId: () => {},
});

export const useServiceAccount = () => useContext(ServiceAccountContext);

export const ServiceAccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useFirebase();
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string>('');
  const [waId, setWaId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchServiceAccount = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/get-service-account/', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          setServiceAccountEmail(data.email || '');
          setWaId(data.wa_id || null);
        } else {
          console.error('Failed to fetch service account');
        }
      } catch (error) {
        console.error('Error fetching service account:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchServiceAccount();
  }, [user]);

  return (
    <ServiceAccountContext.Provider value={{ serviceAccountEmail, isLoading, waId, setWaId }}>
      {children}
    </ServiceAccountContext.Provider>
  );
}; 