"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Crown, Sparkles, CheckCircle, ArrowRight } from 'lucide-react';
import { useFirebase } from '../providers/FirebaseProvider';
import PayPalSubscription from './PayPalSubscription';
import { trackViewContent, trackInitiateCheckout, trackAddToCart } from '../../lib/metaPixel';

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
    hasStartedPayment,
    userEmail: user?.email
  });

  // Additional debug: Check if user is already pro but modal still shows
  React.useEffect(() => {
    if (isOpen && userType === 'pro') {
      console.warn('⚠️ UpgradeModal opened for Pro user! This should not happen.');
    }
  }, [isOpen, userType]);

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
      // Track to TikTok pixel via GTM
      if (typeof window !== 'undefined') {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          event: 'tiktok_view_content',
          content_name: 'SheetyAI Pro Monthly Subscription',
          content_type: 'product',
          content_id: 'sheetyai_pro_monthly'
        });
      }
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
                <h2 className="text-xl font-bold text-white mb-1">🚀 Upgrade to Pro Now!</h2>
                <p className="text-gray-400 text-sm">Don't miss this exclusive 33% discount - limited time only!</p>
              </div>

              {/* Plan comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Free Plan */}
                <div className="rounded-xl p-4 border border-gray-700/60 bg-gray-800/40">
                  <div className="mb-3">
                    <div className="text-white font-bold text-lg">Free</div>
                    <div className="text-gray-400 text-sm">$0</div>
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
                      <span>File uploads up to 5MB each</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-300">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <span>WhatsApp integration (3/day total)</span>
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
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-sm line-through">$29.99</span>
                        <span className="text-gray-300 text-sm">$19.97 / month</span>
                      </div>
                      <div className="text-xs text-emerald-400 font-semibold">SAVE $10.02/month</div>
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
                      <span>All input types: text, voice, files, images</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-200">
                      <Check className="w-4 h-4 text-green-300 flex-shrink-0" />
                      <span>File uploads up to 25MB each</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-200">
                      <Check className="w-4 h-4 text-green-300 flex-shrink-0" />
                      <span>WhatsApp & in‑app chat integration (unlimited)</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-200">
                      <Check className="w-4 h-4 text-green-300 flex-shrink-0" />
                      <span>Advanced AI processing & analysis</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-200">
                      <Check className="w-4 h-4 text-green-300 flex-shrink-0" />
                      <span>Higher file upload limits</span>
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
                  {/* Limited Time Offer Badge */}
                  <div className="mb-2">
                    <span className="inline-block bg-red-500/20 text-red-400 text-xs font-bold px-3 py-1 rounded-full border border-red-500/30">
                      🔥 LIMITED TIME OFFER
                    </span>
                  </div>

                  {/* Pricing with crossed-out original */}
                  <div className="mb-2">
                    <span className="text-2xl text-gray-500 line-through mr-3">$29.99</span>
                    <span className="text-4xl font-bold text-white">$19.97</span>
                    <span className="text-lg text-gray-400 font-normal">/month</span>
                  </div>

                  {/* Savings highlight */}
                  <div className="text-emerald-400 font-bold text-sm mb-2">
                    💰 SAVE $10.02/month (33% OFF!)
                  </div>

                  {/* Urgency elements */}
                  <div className="space-y-1 text-xs text-gray-400">
                    <div>⚡ Price subject to change</div>
                    <div>Cancel anytime • 30-day money back</div>
                  </div>
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
                      // Track to TikTok pixel via GTM
                      if (typeof window !== 'undefined') {
                        window.dataLayer = window.dataLayer || [];
                        window.dataLayer.push({
                          event: 'tiktok_initiate_checkout',
                          content_name: 'SheetyAI Pro Monthly Subscription',
                          content_type: 'product',
                          content_id: 'sheetyai_pro_monthly',
                          value: 19.97,
                          currency: 'USD',
                          quantity: 1
                        });
                      }
                      setHasStartedPayment(true);
                    }}
                    className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-bold py-3 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-yellow-500/25 animate-pulse"
                  >
                    🚀 CLAIM DISCOUNT - Only $19.97/month
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
