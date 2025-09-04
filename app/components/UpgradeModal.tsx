"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Crown, Sparkles, CreditCard } from 'lucide-react';
import { useFirebase } from '../providers/FirebaseProvider';
import PricingPlans from './PricingPlans';
import CustomCardPayment from './CustomCardPayment';

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
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  console.log('🎨 UpgradeModal: Rendering with props:', {
    isOpen,
    userType,
    selectedPlan,
    isProcessing
  });

  const handlePaymentSuccess = async (details: any) => {
    console.log('Payment successful:', details);
    setPaymentSuccess(true);
    setPaymentError(null);

    // Close modal and show success message
    setTimeout(() => {
      onClose();
      onUpgrade();
    }, 2000);
  };

  const handlePaymentError = (error: any) => {
    console.error('Payment failed:', error);
    setPaymentError('Payment failed. Please try again.');
    setPaymentSuccess(false);
  };

  // Auto-show payment buttons when modal opens for Pro
  useEffect(() => {
    if (isOpen && selectedPlan === 'Pro' && user && userType !== 'pro') {
      console.log('Showing payment options...');
      setHasStartedPayment(true);
    }
  }, [isOpen, selectedPlan, user, userType]);

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
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-gray-900 rounded-2xl max-w-lg w-full mx-4 relative border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors z-10"
            >
              <X size={20} />
            </button>

            <div className="p-6">
              {/* Header */}
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Crown className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">Upgrade to Pro</h2>
                <p className="text-gray-400 text-sm">Unlock unlimited AI power</p>
              </div>

              {/* Pro Benefits */}
              <div className="bg-gray-800/50 rounded-xl p-4 mb-6 border border-yellow-500/20">
                <h3 className="text-yellow-400 font-semibold text-sm mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Pro Benefits
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-300">
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <span>Unlimited AI conversations daily</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <span>Advanced AI models & features</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <span>Priority customer support</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <span>Higher file upload limits</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <span>Custom integrations available</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-300">
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <span>Premium analytics dashboard</span>
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div className="bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 rounded-xl p-4 mb-6 border border-yellow-500/30">
                <div className="text-center">
                  <div className="text-3xl font-bold text-white mb-1">
                    $19.97<span className="text-lg text-gray-400 font-normal">/month</span>
                  </div>
                  <div className="text-sm text-gray-400">Cancel anytime • 30-day money back</div>
                </div>
              </div>

              {/* Payment Section */}
              {hasStartedPayment ? (
                <CustomCardPayment
                  amount="19.97"
                  currency="USD"
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                  onCancel={() => setHasStartedPayment(false)}
                />
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => setHasStartedPayment(true)}
                    className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-bold py-3 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-yellow-500/25"
                  >
                    <CreditCard className="w-5 h-5" />
                    Pay with Card - $19.97
                  </button>

                  <button
                    onClick={onClose}
                    className="w-full bg-transparent text-gray-400 hover:text-white text-sm py-2 transition-colors"
                  >
                    Maybe later
                  </button>
                </div>
              )}

              {/* Success Message */}
              {paymentSuccess && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-center"
                >
                  <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <h3 className="text-green-400 font-semibold">Payment Successful!</h3>
                  <p className="text-green-300 text-sm">Welcome to SheetyAI Pro</p>
                </motion.div>
              )}

              {/* Error Message */}
              {paymentError && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-red-400 text-sm">{paymentError}</p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
