"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useFirebase } from '../providers/FirebaseProvider';
import PricingPlans from './PricingPlans';

// Extend window interface for PayPal
declare global {
  interface Window {
    paypal?: any;
  }
}

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  userType: 'free' | 'pro';
  isProcessing?: boolean;
  selectedPlan?: string | null;
}

export default function UpgradeModal({ isOpen, onClose, onUpgrade, userType, isProcessing = false, selectedPlan }: UpgradeModalProps) {
  const { user } = useFirebase();
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [hasStartedPayment, setHasStartedPayment] = useState(false);

  const handleUpgrade = async () => {
    if (!user || hasStartedPayment) {
      return;
    }

    try {
      setIsCreatingPayment(true);
      setHasStartedPayment(true);

      // Directly create PayPal payment and redirect
      const token = await user.getIdToken();
      const returnUrl = `${window.location.origin}${window.location.pathname}?paypal_order_id={order_id}`;
      const cancelUrl = window.location.href;

      console.log('Creating PayPal payment...');

      const response = await fetch('/api/paypal/create-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          returnUrl,
          cancelUrl,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ PayPal API call successful');
        console.log('PayPal response data:', data);

        if (data.approvalUrl) {
          console.log('Redirecting to PayPal:', data.approvalUrl);
          // Redirect to PayPal for payment
          window.location.href = data.approvalUrl;
        } else {
          console.error('❌ No approval URL received from PayPal API');
          console.error('Response data:', data);
          alert('Payment setup failed - no payment URL received. Please try again.');
          setHasStartedPayment(false);
        }
      } else {
        console.error('❌ PayPal API call failed');
        console.error('Response status:', response.status);
        console.error('Response status text:', response.statusText);
        console.error('Response headers:', Object.fromEntries(response.headers.entries()));

        let errorData;
        try {
          // Try to parse the error response
          const responseText = await response.text();
          console.error('Raw response text:', responseText);

          if (responseText.trim()) {
            errorData = JSON.parse(responseText);
          } else {
            errorData = { error: 'Empty response body' };
          }
        } catch (parseError) {
          console.error('Error parsing response:', parseError);
          errorData = { error: 'Invalid JSON response', rawStatus: response.status };
        }

        console.error('Parsed error data:', errorData);

        // Show specific error message
        if (errorData.error === 'PayPal configuration error') {
          alert('PayPal is not configured. Please contact support.');
        } else if (response.status === 401) {
          alert('PayPal authentication failed. Please check your credentials.');
        } else if (response.status === 400) {
          alert('Invalid payment request. Please try again.');
        } else {
          alert(`Payment setup failed (${response.status}). Please try again.`);
        }
        setHasStartedPayment(false);
      }
    } catch (error) {
      console.error('Payment creation error:', error);
      alert('Payment setup failed. Please try again.');
      setHasStartedPayment(false);
    } finally {
      setIsCreatingPayment(false);
    }
  };

  // Auto-start payment process when modal opens for Pro
  useEffect(() => {
    if (isOpen && selectedPlan === 'Pro' && user && userType !== 'pro' && !hasStartedPayment) {
      console.log('Auto-starting payment process...');
      const timer = setTimeout(() => {
        handleUpgrade();
      }, 1000); // 1 second delay so user can see the modal

      return () => clearTimeout(timer);
    }
  }, [isOpen, selectedPlan, user, userType, hasStartedPayment]);

  // Clean up when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsCreatingPayment(false);
      setHasStartedPayment(false);
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={isCreatingPayment ? undefined : onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-gray-900 rounded-2xl max-w-lg w-full mx-4 relative border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              disabled={isCreatingPayment}
              className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors z-10 disabled:opacity-50"
            >
              <X size={24} />
            </button>

            <div className="p-8 text-center">
              {isCreatingPayment ? (
                // Loading state
                <>
                  <div className="mb-6">
                    <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">Setting up payment...</h3>
                    <p className="text-gray-300">Redirecting to PayPal securely</p>
                  </div>
                  <div className="flex justify-center">
                    <div className="animate-pulse bg-gray-700 h-2 w-32 rounded-full"></div>
                  </div>
                </>
              ) : (
                // Upgrade confirmation
                <>
                  <div className="mb-6">
                    <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <div className="w-8 h-8 text-emerald-400">
                        <svg fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">Ready to Upgrade?</h3>
                    <p className="text-gray-300 mb-4">$19.97/month - Unlimited AI conversations</p>
                    <div className="text-sm text-gray-400 mb-6 text-left bg-gray-800/50 p-4 rounded-lg">
                      <div className="font-medium text-white mb-2">What you'll get:</div>
                      ✓ Unlimited messages<br/>
                      ✓ Advanced AI features<br/>
                      ✓ Priority support<br/>
                      ✓ Custom integrations
                    </div>
                  </div>

                  <button
                    onClick={handleUpgrade}
                    disabled={isCreatingPayment}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 mb-4"
                  >
                    Continue to PayPal
                  </button>

                  <button
                    onClick={onClose}
                    disabled={isCreatingPayment}
                    className="w-full bg-transparent text-gray-400 hover:text-white text-sm py-2 px-4 transition-colors duration-200"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
