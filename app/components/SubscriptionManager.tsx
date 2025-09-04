"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Crown, Calendar, CreditCard, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { useFirebase } from '../providers/FirebaseProvider';
import { useUserProfile } from '../hooks/useUserProfile';

interface SubscriptionManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SubscriptionManager({ isOpen, onClose }: SubscriptionManagerProps) {
  const { user } = useFirebase();
  const { userType, subscription } = useUserProfile(user);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const handleCancelSubscription = async () => {
    if (!user || !subscription) return;

    try {
      setIsCancelling(true);
      const token = await user.getIdToken();

      const response = await fetch('/api/paypal/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: cancelReason }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(data.message);
        onClose();
        // Refresh the page to update subscription status
        window.location.reload();
      } else {
        const error = await response.json();
        alert(`Cancellation failed: ${error.error}`);
      }
    } catch (error) {
      console.error('Cancellation error:', error);
      alert('Cancellation failed. Please try again.');
    } finally {
      setIsCancelling(false);
      setShowCancelConfirm(false);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getDaysRemaining = () => {
    if (!subscription?.endDate) return 0;
    const now = new Date();
    const endDate = subscription.endDate;
    const diffTime = endDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

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
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-gray-900 rounded-2xl max-w-lg w-full mx-4 relative border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors z-10"
            >
              <X size={24} />
            </button>

            <div className="p-6">
              {/* Header */}
              <div className="text-center mb-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 20 }}
                  className="w-16 h-16 bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg"
                >
                  <Crown className="w-8 h-8 text-white" />
                </motion.div>
                <h2 className="text-2xl font-bold text-white mb-2">Subscription Management</h2>
                <p className="text-gray-300">Manage your SheetyAI Pro subscription</p>
              </div>

              {/* Subscription Status */}
              <div className="bg-gray-800/50 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-white">Current Plan</h3>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      userType === 'pro'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-gray-600/20 text-gray-400 border border-gray-600/30'
                    }`}>
                      {userType === 'pro' ? 'Pro' : 'Free'}
                    </span>
                    {userType === 'pro' && (
                      <Crown className="w-4 h-4 text-emerald-400" fill="currentColor" />
                    )}
                  </div>
                </div>

                {subscription && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <CreditCard className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-300">Plan: <span className="text-white capitalize">{subscription.plan || 'Monthly'}</span></span>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-300">Status: <span className={`capitalize ${
                        subscription.status === 'active' ? 'text-green-400' :
                        subscription.status === 'cancelled' ? 'text-yellow-400' : 'text-gray-400'
                      }`}>{subscription.status}</span></span>
                    </div>

                    {subscription.cancelledAt && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-300">Cancelled: <span className="text-white">{formatDate(subscription.cancelledAt)}</span></span>
                      </div>
                    )}

                    {subscription.endDate && subscription.status === 'cancelled' && (
                      <div className="flex items-center gap-2 text-sm">
                        <AlertTriangle className="w-4 h-4 text-yellow-400" />
                        <span className="text-gray-300">Access until: <span className="text-white">{formatDate(subscription.endDate)}</span></span>
                        <span className="text-xs text-yellow-400 ml-2">({getDaysRemaining()} days)</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Pro Features */}
              <div className="bg-gray-800/50 rounded-xl p-4 mb-6">
                <h3 className="text-lg font-semibold text-white mb-3">Pro Features</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-white">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>Unlimited AI conversations</span>
                  </div>
                  <div className="flex items-center gap-2 text-white">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>Advanced AI features</span>
                  </div>
                  <div className="flex items-center gap-2 text-white">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>Priority support</span>
                  </div>
                  <div className="flex items-center gap-2 text-white">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>Custom integrations</span>
                  </div>
                  <div className="flex items-center gap-2 text-white">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>Premium analytics</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                {subscription?.status === 'cancelled' ? (
                  <div className="text-center p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                    <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                    <p className="text-yellow-200 text-sm">
                      Your subscription has been cancelled. You will retain Pro access until {subscription.endDate ? formatDate(subscription.endDate) : 'the end of your billing period'}.
                    </p>
                  </div>
                ) : userType === 'pro' ? (
                  <AnimatePresence>
                    {!showCancelConfirm ? (
                      <motion.button
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        onClick={() => setShowCancelConfirm(true)}
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
                      >
                        Cancel Subscription
                      </motion.button>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-3"
                      >
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                          <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
                          <p className="text-red-200 text-sm text-center mb-3">
                            Are you sure you want to cancel your subscription? You'll lose access to Pro features at the end of your current billing period.
                          </p>
                          <textarea
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            placeholder="Optional: Tell us why you're cancelling..."
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
                            rows={3}
                          />
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={() => setShowCancelConfirm(false)}
                            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
                          >
                            Keep Subscription
                          </button>
                          <button
                            onClick={handleCancelSubscription}
                            disabled={isCancelling}
                            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
                          >
                            {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                ) : (
                  <div className="text-center p-4 bg-gray-700/50 rounded-xl">
                    <p className="text-gray-300 text-sm">No active subscription found.</p>
                  </div>
                )}

                <button
                  onClick={onClose}
                  className="w-full bg-transparent text-gray-400 hover:text-white text-sm py-2 px-4 transition-colors duration-200"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
