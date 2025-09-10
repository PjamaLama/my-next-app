"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Crown, Sparkles, CheckCircle, ArrowRight } from 'lucide-react';
import { useFirebase } from '../providers/FirebaseProvider';
import PayPalSubscription from './PayPalSubscription';
import { trackViewContent, trackInitiateCheckout, trackAddToCart } from '../../lib/metaPixel';
import { trackTikTokViewContent, trackTikTokInitiateCheckout, trackTikTokAddToCart } from '../../lib/tiktokPixel';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  userType: 'free' | 'pro';
  selectedPlan?: string | null;
}

export default function UpgradeModal({ isOpen, onClose, onUpgrade, userType, selectedPlan }: UpgradeModalProps) {
  const { user } = useFirebase();
  const [hasStartedPayment, setHasStartedPayment] = useState<boolean>(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  console.log('🎨 UpgradeModal:', new Date().toISOString(), {
    isOpen,
    userType,
    selectedPlan,
    hasStartedPayment
  });

  const handlePaymentSuccess = async (subscriptionId: string) => {
    console.log('PayPal subscription successful:', subscriptionId);
    setPaymentSuccess(true);
    setPaymentError(null);

    // TODO: Here you would typically call your backend API to update the user's subscription
    // For now, we'll just show success and close the modal
    try {
      // You could call an API here to save the subscription details
      console.log('Subscription ID:', subscriptionId);

      // Close modal and show success message
      setTimeout(() => {
        onClose();
        onUpgrade();
      }, 2000);
    } catch (error) {
      console.error('Error processing subscription:', error);
      setPaymentError('Subscription created but failed to update account. Please contact support.');
      setPaymentSuccess(false);
    }
  };

  const handlePaymentError = (error: any) => {
    console.error('Payment failed:', error);
    setPaymentError('Payment failed. Please try again.');
    setPaymentSuccess(false);
  };

  // Auto-show PayPal subscription when modal opens for Pro
  useEffect(() => {
    if (isOpen && selectedPlan === 'Pro' && user && userType !== 'pro') {
      setHasStartedPayment(true); // Start with PayPal subscription
    }
  }, [isOpen, selectedPlan, user, userType]);

  // Track modal view when it opens
  useEffect(() => {
    if (isOpen) {
      trackViewContent('sheetyai_pro_monthly');
      trackTikTokViewContent('sheetyai_pro_monthly');
    }
  }, [isOpen]);

  // Clean up when modal closes
  useEffect(() => {
    if (!isOpen) {
      setHasStartedPayment(false);
      setPaymentSuccess(false);
      setPaymentError(null);
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
            className="bg-gray-900 rounded-2xl max-w-3xl w-full mx-4 relative border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto"
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
                <p className="text-gray-400 text-sm">Unlock unlimited data conversions</p>
              </div>

              {/* Plan comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Free Plan */}
                <div className="rounded-xl p-4 border border-gray-700/60 bg-gray-800/40">
                  <div className="mb-3">
                    <div className="text-white font-bold text-lg">Free</div>
                    <div className="text-gray-400 text-sm">$0 • forever</div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-300">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <span>3 messages per day</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-300">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <span>All input types: text, voice, files, images</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-300">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <span>WhatsApp in‑app chat integration (3/day)</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-400">
                      <X className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <span>Priority customer support</span>
                    </div>
                  </div>
                </div>

                {/* Pro Plan */}
                <div className="rounded-xl p-4 border border-yellow-500/30 bg-yellow-500/10">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-white font-bold text-lg flex items-center gap-2">
                        <Crown className="w-5 h-5 text-yellow-400" /> Pro
                      </div>
                      <div className="text-gray-300 text-sm">$19.97 / month</div>
                    </div>
                    <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 px-2 py-1 rounded-md">Most popular</div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-200">
                      <Check className="w-4 h-4 text-green-300 flex-shrink-0" />
                      <span>Unlimited conversations daily</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-200">
                      <Check className="w-4 h-4 text-green-300 flex-shrink-0" />
                      <span>WhatsApp & in‑app chat integration</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-200">
                      <Check className="w-4 h-4 text-green-300 flex-shrink-0" />
                      <span>Priority customer support</span>
                    </div>
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
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <PayPalSubscription
                    clientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || ""}
                    amount="19.97"
                    onSuccess={handlePaymentSuccess}
                    onError={handlePaymentError}
                    onCancel={() => setHasStartedPayment(false)}
                  />
                </motion.div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      trackInitiateCheckout('sheetyai_pro_monthly');
                      trackTikTokInitiateCheckout('sheetyai_pro_monthly');
                      setHasStartedPayment(true);
                    }}
                    className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-bold py-3 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-yellow-500/25"
                  >
                    Upgrade to Pro - $19.97/month
                    <ArrowRight className="w-4 h-4" />
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
