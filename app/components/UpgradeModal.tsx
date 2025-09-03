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
            className="bg-gray-900 rounded-2xl max-w-6xl w-full mx-4 relative border border-white/10 shadow-2xl max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors z-10"
            >
              <X size={24} />
            </button>

            <div className="p-8 overflow-y-auto max-h-[90vh]">
              <PricingPlans compact showTitle={false} />
            </div>

            {/* PayPal Buttons Container (hidden but functional) */}
            <div id="paypal-button-container" className="hidden"></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
