"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Star, Zap, Shield, HeadphonesIcon } from 'lucide-react';
import { useFirebase } from '../providers/FirebaseProvider';

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
}

export default function UpgradeModal({ isOpen, onClose, onUpgrade, userType, isProcessing = false }: UpgradeModalProps) {
  const { user } = useFirebase();

  const handleUpgrade = async () => {
    try {
      // Directly create PayPal payment and redirect
      const token = await user?.getIdToken();
      const returnUrl = `${window.location.origin}${window.location.pathname}?paypal_order_id={order_id}`;
      const cancelUrl = window.location.href;

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
        if (data.approvalUrl) {
          // Redirect to PayPal for payment
          window.location.href = data.approvalUrl;
        } else {
          console.error('No approval URL received from PayPal');
        }
      } else {
        console.error('Payment creation failed');
      }
    } catch (error) {
      console.error('Payment creation error:', error);
    }
  };

  // Clean up when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Modal cleanup if needed
    }
  }, [isOpen]);

  if (userType === 'pro') {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gradient-to-br from-emerald-900 to-emerald-800 rounded-2xl p-8 max-w-md w-full mx-4 relative border border-emerald-600/30 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>

              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Star className="w-8 h-8 text-emerald-400" fill="currentColor" />
                </div>

                <h2 className="text-2xl font-bold text-white mb-2">You're Already Pro!</h2>
                <p className="text-white/80 text-sm mb-6">
                  You have access to all premium features. Enjoy your SheetyAI Pro experience!
                </p>

                <button
                  onClick={onClose}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 max-w-lg w-full mx-4 relative border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>

            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Star className="w-8 h-8 text-white" fill="currentColor" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">Upgrade to Pro</h2>
              <p className="text-white/70 text-lg">Unlock unlimited potential with voice commands</p>
            </div>

            {/* Pricing */}
            <div className="bg-white/5 rounded-xl p-6 mb-6 border border-white/10">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="text-4xl font-bold text-white">$19</span>
                  <span className="text-white/60">/month</span>
                </div>
                <p className="text-white/80 text-sm">No setup fees • Cancel anytime</p>
              </div>
            </div>

            {/* Features */}
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 bg-emerald-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Unlimited Voice Commands</p>
                  <p className="text-white/60 text-sm">Process spreadsheets without limits</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-5 h-5 bg-emerald-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Advanced AI Features</p>
                  <p className="text-white/60 text-sm">Access to premium AI models and capabilities</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-5 h-5 bg-emerald-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Priority Support</p>
                  <p className="text-white/60 text-sm">Get help faster with dedicated support</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-5 h-5 bg-emerald-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Export & Analytics</p>
                  <p className="text-white/60 text-sm">Advanced data export and analytics features</p>
                </div>
              </div>
            </div>

            {/* CTA Button */}
            <button
              onClick={handleUpgrade}
              disabled={isProcessing}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Processing...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <Zap className="w-5 h-5" />
                  Upgrade to Pro - $19/month
                </div>
              )}
            </button>

            {/* PayPal Buttons Container (hidden but functional) */}
            <div id="paypal-button-container" className="hidden"></div>

            {/* Footer */}
            <p className="text-white/50 text-xs text-center mt-4">
              By upgrading, you agree to our terms of service and privacy policy.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
