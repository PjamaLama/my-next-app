"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Crown, Sparkles } from 'lucide-react';
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

      console.log('Creating PayPal payment...');

      const response = await fetch('/api/paypal/create-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
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
            className="bg-gray-900 rounded-2xl max-w-2xl w-full mx-4 relative border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              disabled={isCreatingPayment}
              className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors z-10 disabled:opacity-50"
            >
              <X size={24} />
            </button>

            <div className="p-6">
              {isCreatingPayment ? (
                // Loading state
                <div className="text-center py-12">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-16 h-16 bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg"
                  >
                    <Crown className="w-8 h-8 text-white" />
                  </motion.div>
                  <h3 className="text-xl font-semibold text-white mb-2">Setting up your Premium experience...</h3>
                  <p className="text-gray-300 mb-6">Redirecting to PayPal securely</p>
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="flex justify-center"
                  >
                    <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 h-2 w-32 rounded-full shadow-lg"></div>
                  </motion.div>
                </div>
              ) : (
                // Plan comparison
                <>
                  <div className="text-center mb-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 20 }}
                      className="w-16 h-16 bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg"
                    >
                      <Crown className="w-8 h-8 text-white" />
                    </motion.div>
                    <h2 className="text-2xl font-bold text-white mb-2">Upgrade to Pro</h2>
                    <p className="text-gray-300">Unlock unlimited potential with AI</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {/* Free Plan */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 relative"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-gray-300">Free</h3>
                        <div className="text-xs bg-gray-700 text-gray-400 px-2 py-1 rounded-full">Current</div>
                      </div>
                      <div className="text-2xl font-bold text-white mb-4">$0</div>
                      <div className="space-y-2 text-sm text-gray-400">
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-400" />
                          <span>Basic AI conversations</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-400" />
                          <span>Limited messages</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-400" />
                          <span>Standard support</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-400" />
                          <span>Basic features</span>
                        </div>
                      </div>
                    </motion.div>

                    {/* Pro Plan with Matrix Golden Effects */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="relative overflow-hidden"
                    >
                      {/* Matrix-style golden background layers */}
                      <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/30 via-yellow-500/40 to-yellow-600/30 rounded-xl"></div>

                      {/* Flowing golden streams */}
                      <div className="absolute inset-0 overflow-hidden rounded-xl">
                        {/* Primary golden stream */}
                        <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-yellow-400 to-transparent animate-golden-matrix opacity-60"></div>

                        {/* Secondary streams with different delays */}
                        <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-yellow-300 to-transparent animate-golden-matrix opacity-40" style={{ animationDelay: '0.5s', top: '30%' }}></div>
                        <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-yellow-500 to-transparent animate-golden-matrix opacity-50" style={{ animationDelay: '1s', top: '60%' }}></div>
                        <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-yellow-200 to-transparent animate-golden-matrix opacity-30" style={{ animationDelay: '1.5s', top: '80%' }}></div>

                        {/* Vertical flowing streams */}
                        <div className="absolute w-0.5 h-full bg-gradient-to-b from-transparent via-yellow-400 to-transparent animate-golden-stream opacity-40" style={{ left: '25%', animationDelay: '0.8s' }}></div>
                        <div className="absolute w-0.5 h-full bg-gradient-to-b from-transparent via-yellow-500 to-transparent animate-golden-stream opacity-30" style={{ right: '30%', animationDelay: '1.3s' }}></div>
                      </div>

                      {/* Animated golden particles */}
                      <div className="absolute inset-0 overflow-hidden rounded-xl">
                        <div className="absolute w-1 h-1 bg-yellow-400 rounded-full animate-golden-particles opacity-60" style={{ left: '20%', animationDelay: '0.2s' }}></div>
                        <div className="absolute w-1.5 h-1.5 bg-yellow-300 rounded-full animate-golden-particles opacity-50" style={{ right: '15%', animationDelay: '1.1s' }}></div>
                        <div className="absolute w-0.5 h-0.5 bg-yellow-500 rounded-full animate-golden-particles opacity-70" style={{ left: '70%', top: '40%', animationDelay: '0.7s' }}></div>
                        <div className="absolute w-1 h-1 bg-yellow-200 rounded-full animate-golden-particles opacity-40" style={{ right: '60%', top: '70%', animationDelay: '1.8s' }}></div>
                      </div>

                      {/* Golden wave effects */}
                      <div className="absolute inset-0 overflow-hidden rounded-xl">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400/20 to-transparent animate-golden-wave opacity-0 hover:opacity-100 transition-opacity duration-500"></div>
                        <div className="absolute inset-0 bg-gradient-to-l from-transparent via-yellow-300/15 to-transparent animate-golden-wave opacity-0 hover:opacity-100 transition-opacity duration-500" style={{ animationDelay: '0.5s' }}></div>
                  </div>

                      {/* Animated border with golden flow */}
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 p-[2px] animate-pulse">
                        <div className="bg-gray-900 rounded-xl h-full w-full"></div>
                      </div>

                      <div className="relative bg-gray-900 rounded-xl p-4 border border-yellow-500/30 backdrop-blur-sm">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <motion.h3
                              className="text-lg font-semibold text-white relative"
                              animate={{
                                textShadow: [
                                  '0 0 5px rgba(251, 191, 36, 0.5)',
                                  '0 0 10px rgba(251, 191, 36, 0.8)',
                                  '0 0 5px rgba(251, 191, 36, 0.5)'
                                ]
                              }}
                              transition={{ duration: 2, repeat: Infinity }}
                            >
                              Pro
                            </motion.h3>
                            <motion.div
                              animate={{
                                rotate: [0, 10, -10, 0],
                                scale: [1, 1.2, 1]
                              }}
                              transition={{
                                duration: 2,
                                repeat: Infinity,
                                repeatDelay: 3
                              }}
                            >
                              <Sparkles className="w-4 h-4 text-yellow-400 drop-shadow-lg" />
                            </motion.div>
                          </div>
                          <motion.div
                            className="text-xs bg-gradient-to-r from-yellow-400 to-yellow-600 text-black px-2 py-1 rounded-full font-medium shadow-lg"
                            animate={{
                              boxShadow: [
                                '0 0 5px rgba(251, 191, 36, 0.3)',
                                '0 0 15px rgba(251, 191, 36, 0.6)',
                                '0 0 5px rgba(251, 191, 36, 0.3)'
                              ]
                            }}
                            transition={{ duration: 2, repeat: Infinity }}
                          >
                            Premium
                          </motion.div>
                        </div>

                        <motion.div
                          className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent mb-4 relative"
                          animate={{
                            textShadow: [
                              '0 0 5px rgba(251, 191, 36, 0.4)',
                              '0 0 15px rgba(251, 191, 36, 0.8)',
                              '0 0 5px rgba(251, 191, 36, 0.4)'
                            ]
                          }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          $19.97<span className="text-sm text-gray-400 font-normal">/month</span>
                        </motion.div>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-white">
                            <Check className="w-4 h-4 text-yellow-400 drop-shadow-sm" />
                            <span>Unlimited AI conversations</span>
                          </div>
                          <div className="flex items-center gap-2 text-white">
                            <Check className="w-4 h-4 text-yellow-400 drop-shadow-sm" />
                            <span>Advanced AI features</span>
                          </div>
                          <div className="flex items-center gap-2 text-white">
                            <Check className="w-4 h-4 text-yellow-400 drop-shadow-sm" />
                            <span>Priority support</span>
                          </div>
                          <div className="flex items-center gap-2 text-white">
                            <Check className="w-4 h-4 text-yellow-400 drop-shadow-sm" />
                            <span>Custom integrations</span>
                          </div>
                          <div className="flex items-center gap-2 text-white">
                            <Check className="w-4 h-4 text-yellow-400 drop-shadow-sm" />
                            <span>Premium analytics</span>
                      </div>
                    </div>

                        {/* Enhanced hover shimmer overlay */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400/10 to-transparent -skew-x-12 animate-shimmer opacity-0 hover:opacity-100 transition-opacity duration-300"></div>
                    </div>
                    </motion.div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleUpgrade}
                    disabled={isCreatingPayment}
                    className="relative w-full overflow-hidden rounded-xl transition-all duration-300 mb-4 group"
                  >
                    {/* Matrix golden streams across button */}
                    <div className="absolute inset-0 overflow-hidden rounded-xl">
                      {/* Horizontal golden streams */}
                      <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-yellow-400 to-transparent animate-golden-matrix opacity-70" style={{ top: '20%' }}></div>
                      <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-yellow-300 to-transparent animate-golden-matrix opacity-50" style={{ top: '50%', animationDelay: '0.8s' }}></div>
                      <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-yellow-500 to-transparent animate-golden-matrix opacity-60" style={{ top: '80%', animationDelay: '1.5s' }}></div>

                      {/* Vertical golden streams */}
                      <div className="absolute w-0.5 h-full bg-gradient-to-b from-transparent via-yellow-400 to-transparent animate-golden-stream opacity-40" style={{ left: '15%', animationDelay: '0.3s' }}></div>
                      <div className="absolute w-0.5 h-full bg-gradient-to-b from-transparent via-yellow-500 to-transparent animate-golden-stream opacity-30" style={{ right: '20%', animationDelay: '1.2s' }}></div>
                    </div>

                    {/* Enhanced golden particles */}
                    <div className="absolute inset-0 overflow-hidden rounded-xl">
                      <div className="absolute w-1 h-1 bg-yellow-400 rounded-full animate-golden-particles opacity-60" style={{ left: '25%', animationDelay: '0.1s' }}></div>
                      <div className="absolute w-1.5 h-1.5 bg-yellow-300 rounded-full animate-golden-particles opacity-50" style={{ right: '30%', animationDelay: '0.8s' }}></div>
                      <div className="absolute w-0.5 h-0.5 bg-yellow-500 rounded-full animate-golden-particles opacity-70" style={{ left: '75%', top: '30%', animationDelay: '1.4s' }}></div>
                      <div className="absolute w-1 h-1 bg-yellow-200 rounded-full animate-golden-particles opacity-40" style={{ right: '70%', top: '70%', animationDelay: '0.6s' }}></div>
                      <div className="absolute w-0.5 h-0.5 bg-yellow-300 rounded-full animate-golden-particles opacity-80" style={{ left: '45%', top: '60%', animationDelay: '1.8s' }}></div>
                    </div>

                    {/* Animated border with golden flow */}
                    <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-600 rounded-xl p-[2px] animate-pulse">
                      <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-xl h-full w-full"></div>
                    </div>

                    {/* Enhanced moving shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 animate-shimmer opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                    {/* Golden wave effects on hover */}
                    <div className="absolute inset-0 overflow-hidden rounded-xl">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400/30 to-transparent animate-golden-wave opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      <div className="absolute inset-0 bg-gradient-to-l from-transparent via-yellow-300/25 to-transparent animate-golden-wave opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ animationDelay: '0.3s' }}></div>
                    </div>

                    {/* Enhanced glow effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-xl blur-sm opacity-0 group-hover:opacity-40 transition-opacity duration-300"></div>

                    {/* Main button content */}
                    <div className="relative bg-gradient-to-r from-yellow-500 via-yellow-400 to-yellow-600 hover:from-yellow-400 hover:via-yellow-300 hover:to-yellow-500 disabled:from-yellow-500/50 disabled:via-yellow-400/50 disabled:to-yellow-600/50 text-black font-bold py-4 px-6 rounded-xl shadow-lg hover:shadow-yellow-500/50 hover:shadow-2xl transition-all duration-300 border-2 border-yellow-300/60">
                      <div className="flex items-center justify-center gap-3">
                        <motion.div
                          animate={{
                            rotate: [0, -10, 10, 0],
                            scale: [1, 1.2, 1]
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            repeatDelay: 3
                          }}
                        >
                          <Crown className="w-5 h-5 drop-shadow-lg" />
                        </motion.div>
                        <motion.span
                          className="text-lg relative"
                          animate={{
                            textShadow: [
                              '0 0 3px rgba(0, 0, 0, 0.3)',
                              '0 0 8px rgba(0, 0, 0, 0.5)',
                              '0 0 3px rgba(0, 0, 0, 0.3)'
                            ]
                          }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          Upgrade to Pro Now
                        </motion.span>
                        <motion.div
                          animate={{
                            x: [0, 3, 0],
                            rotate: [0, 15, -15, 0]
                          }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity
                          }}
                        >
                          <Sparkles className="w-4 h-4 drop-shadow-lg" />
                        </motion.div>
                      </div>
                    </div>

                    {/* Enhanced sparkle particles */}
                    <div className="absolute top-2 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <motion.div
                        animate={{
                          scale: [0, 1, 0],
                          rotate: [0, 180, 360]
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          delay: 0.5
                        }}
                        className="w-2 h-2 bg-yellow-200 rounded-full shadow-lg"
                      />
                    </div>
                    <div className="absolute bottom-2 left-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <motion.div
                        animate={{
                          scale: [0, 1, 0],
                          rotate: [0, -180, -360]
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          delay: 1
                        }}
                        className="w-1.5 h-1.5 bg-yellow-300 rounded-full shadow-lg"
                      />
                    </div>
                    <div className="absolute top-1/2 left-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <motion.div
                        animate={{
                          scale: [0, 1, 0],
                          rotate: [0, 90, 270, 360]
                        }}
                        transition={{
                          duration: 2.5,
                          repeat: Infinity,
                          delay: 0.8
                        }}
                        className="w-1 h-1 bg-yellow-400 rounded-full shadow-lg"
                      />
                    </div>
                    <div className="absolute top-1/2 right-8 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <motion.div
                        animate={{
                          scale: [0, 1, 0],
                          rotate: [0, -90, -270, -360]
                        }}
                        transition={{
                          duration: 2.5,
                          repeat: Infinity,
                          delay: 1.3
                        }}
                        className="w-0.5 h-0.5 bg-yellow-500 rounded-full shadow-lg"
                      />
                    </div>
                  </motion.button>

                  <button
                    onClick={onClose}
                    disabled={isCreatingPayment}
                    className="w-full bg-transparent text-gray-400 hover:text-white text-sm py-2 px-4 transition-colors duration-200"
                  >
                    Maybe later
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
