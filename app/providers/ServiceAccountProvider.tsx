"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

interface ServiceAccountContextType {
  serviceAccountEmail: string;
  isLoading: boolean;
}

const ServiceAccountContext = createContext<ServiceAccountContextType>({
  serviceAccountEmail: '',
  isLoading: true,
});

export const useServiceAccount = () => useContext(ServiceAccountContext);

export const ServiceAccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchServiceAccountEmail = async () => {
      try {
        const response = await fetch('/api/get-service-account/');
        if (response.ok) {
          const data = await response.json();
          setServiceAccountEmail(data.email || '');
        } else {
          console.error('Failed to fetch service account email');
        }
      } catch (error) {
        console.error('Error fetching service account email:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchServiceAccountEmail();
  }, []);

  return (
    <ServiceAccountContext.Provider value={{ serviceAccountEmail, isLoading }}>
      {children}
    </ServiceAccountContext.Provider>
  );
}; 