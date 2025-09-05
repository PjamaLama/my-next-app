"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useFirebase } from './FirebaseProvider';
import { useRouter } from 'next/navigation';
import UpgradeModal from '../components/UpgradeModal';

interface UpgradeModalContextType {
  isOpen: boolean;
  openModal: (plan?: string) => void;
  closeModal: () => void;
  selectedPlan: string | null;
}

const UpgradeModalContext = createContext<UpgradeModalContextType | undefined>(undefined);

export const useUpgradeModal = () => {
  const context = useContext(UpgradeModalContext);
  if (context === undefined) {
    throw new Error('useUpgradeModal must be used within an UpgradeModalProvider');
  }
  return context;
};

interface UpgradeModalProviderProps {
  children: ReactNode;
}

export const UpgradeModalProvider: React.FC<UpgradeModalProviderProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const { user, userType } = useFirebase();
  const router = useRouter();

  const openModal = (plan?: string) => {
    console.log('🚀 UpgradeModalProvider: Opening modal with plan:', plan);
    console.log('🚀 UpgradeModalProvider: Current userType:', userType);
    console.log('🚀 UpgradeModalProvider: Stack trace:', new Error().stack);
    setSelectedPlan(plan || null);
    setIsOpen(true);
  };
  const closeModal = () => {
    setIsOpen(false);
    setSelectedPlan(null);
  };

  // Handle PayPal cancellation from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paypalCancelled = urlParams.get('paypal_cancelled');

    if (paypalCancelled) {
      console.log('PayPal payment was cancelled by user');
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete('paypal_cancelled');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const handleUpgrade = () => {
    // PayPal buttons handle the payment flow directly now
    // This is kept as a fallback for any edge cases
    console.log('Fallback upgrade handler called');
  };

  return (
    <UpgradeModalContext.Provider value={{ isOpen, openModal, closeModal, selectedPlan }}>
      {children}
      <UpgradeModal
        isOpen={isOpen}
        onClose={closeModal}
        onUpgrade={handleUpgrade}
        userType={userType}
        selectedPlan={selectedPlan}
      />
    </UpgradeModalContext.Provider>
  );
};
