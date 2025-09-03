"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useFirebase } from './FirebaseProvider';
import { useRouter } from 'next/navigation';
import UpgradeModal from '../components/UpgradeModal';

interface UpgradeModalContextType {
  isOpen: boolean;
  openModal: (plan?: string) => void;
  closeModal: () => void;
  isProcessing: boolean;
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const { user, userType } = useFirebase();
  const router = useRouter();

  const openModal = (plan?: string) => {
    setSelectedPlan(plan || null);
    setIsOpen(true);
  };
  const closeModal = () => {
    setIsOpen(false);
    setSelectedPlan(null);
  };

  // Handle PayPal return from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paypalToken = urlParams.get('paypal_token');
    const paypalCancelled = urlParams.get('paypal_cancelled');

    if (paypalCancelled) {
      console.log('PayPal payment was cancelled by user');
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete('paypal_cancelled');
      window.history.replaceState({}, '', url.toString());
      return;
    }

    if (paypalToken && user) {
      handlePayPalReturn(paypalToken);
    }
  }, [user]);

  const handlePayPalReturn = async (paypalToken: string) => {
    try {
      setIsProcessing(true);

      const token = await user!.getIdToken();
      const response = await fetch('/api/paypal/capture-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ paypalToken }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Payment capture successful:', data.message);

        // Clean up URL
        const url = new URL(window.location.href);
        url.searchParams.delete('paypal_token');
        url.searchParams.delete('PayerID');
        window.history.replaceState({}, '', url.toString());

        // Refresh user data to update userType
        window.location.reload();
      } else {
        const error = await response.json();
        console.error('Payment capture failed:', error);
        alert('Payment processing failed. Please contact support.');
      }
    } catch (error) {
      console.error('Payment capture error:', error);
      alert('Payment processing failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpgrade = () => {
    // PayPal buttons handle the payment flow directly now
    // This is kept as a fallback for any edge cases
    console.log('Fallback upgrade handler called');
  };

  return (
    <UpgradeModalContext.Provider value={{ isOpen, openModal, closeModal, isProcessing, selectedPlan }}>
      {children}
      <UpgradeModal
        isOpen={isOpen}
        onClose={closeModal}
        onUpgrade={handleUpgrade}
        userType={userType}
        isProcessing={isProcessing}
        selectedPlan={selectedPlan}
      />
    </UpgradeModalContext.Provider>
  );
};
