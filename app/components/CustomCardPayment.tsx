"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Lock, CheckCircle } from 'lucide-react';
import { useFirebase } from '../providers/FirebaseProvider';

interface CardDetails {
  number: string;
  expiry: string;
  cvc: string;
  name: string;
}

interface CustomCardPaymentProps {
  amount: string;
  currency?: string;
  onSuccess: (details: any) => void;
  onError: (error: any) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export default function CustomCardPayment({
  amount,
  currency = 'USD',
  onSuccess,
  onError,
  onCancel,
  disabled = false
}: CustomCardPaymentProps) {
  const { user } = useFirebase();
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardDetails, setCardDetails] = useState<CardDetails>({
    number: '',
    expiry: '',
    cvc: '',
    name: ''
  });
  const [errors, setErrors] = useState<Partial<CardDetails>>({});

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = matches && matches[0] || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  const formatExpiry = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
  };

  const validateCard = () => {
    const newErrors: Partial<CardDetails> = {};

    if (!cardDetails.number.replace(/\s/g, '').match(/^\d{13,19}$/)) {
      newErrors.number = 'Invalid card number';
    }

    if (!cardDetails.expiry.match(/^(0[1-9]|1[0-2])\/\d{2}$/)) {
      newErrors.expiry = 'Invalid expiry date';
    }

    if (!cardDetails.cvc.match(/^\d{3,4}$/)) {
      newErrors.cvc = 'Invalid CVC';
    }

    if (!cardDetails.name.trim()) {
      newErrors.name = 'Name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateCard() || !user) {
      return;
    }

    setIsProcessing(true);

    try {
      const token = await user.getIdToken();

      // Create order first
      const orderResponse = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount,
          currency,
        }),
      });

      if (!orderResponse.ok) {
        throw new Error('Failed to create order');
      }

      const orderData = await orderResponse.json();

      // Process card payment
      const paymentResponse = await fetch('/api/paypal/process-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId: orderData.id,
          cardDetails: {
            number: cardDetails.number.replace(/\s/g, ''),
            expiry: cardDetails.expiry,
            cvc: cardDetails.cvc,
            name: cardDetails.name
          },
        }),
      });

      if (!paymentResponse.ok) {
        const errorData = await paymentResponse.json();
        throw new Error(errorData.error || 'Payment failed');
      }

      const paymentData = await paymentResponse.json();
      onSuccess(paymentData);

    } catch (error: any) {
      console.error('Payment error:', error);
      onError(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const getCardType = (number: string) => {
    const num = number.replace(/\s/g, '');
    if (num.startsWith('4')) return 'visa';
    if (num.startsWith('5') || num.startsWith('2')) return 'mastercard';
    if (num.startsWith('3')) return 'amex';
    return 'generic';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md mx-auto"
    >
      {/* Card Preview */}
      <div className="mb-6">
        <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-xl p-6 text-white shadow-2xl">
          <div className="flex justify-between items-start mb-8">
            <div className="flex items-center gap-2">
              <CreditCard size={24} />
              <span className="text-sm font-medium">Premium</span>
            </div>
            <div className={`w-12 h-8 rounded bg-gradient-to-r ${
              getCardType(cardDetails.number) === 'visa' ? 'from-blue-400 to-blue-600' :
              getCardType(cardDetails.number) === 'mastercard' ? 'from-orange-400 to-red-500' :
              getCardType(cardDetails.number) === 'amex' ? 'from-green-400 to-blue-500' :
              'from-gray-400 to-gray-600'
            } flex items-center justify-center`}>
              <span className="text-xs font-bold text-white">
                {getCardType(cardDetails.number) === 'visa' ? 'VISA' :
                 getCardType(cardDetails.number) === 'mastercard' ? 'MC' :
                 getCardType(cardDetails.number) === 'amex' ? 'AMEX' : 'CARD'}
              </span>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-lg font-mono tracking-wider">
              {cardDetails.number || '•••• •••• •••• ••••'}
            </div>
          </div>

          <div className="flex justify-between items-end">
            <div>
              <div className="text-xs opacity-75 mb-1">CARDHOLDER NAME</div>
              <div className="text-sm font-medium">
                {cardDetails.name || 'YOUR NAME'}
              </div>
            </div>
            <div>
              <div className="text-xs opacity-75 mb-1">VALID THRU</div>
              <div className="text-sm font-medium">
                {cardDetails.expiry || 'MM/YY'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Card Number
          </label>
          <input
            type="text"
            value={cardDetails.number}
            onChange={(e) => setCardDetails(prev => ({
              ...prev,
              number: formatCardNumber(e.target.value)
            }))}
            placeholder="1234 5678 9012 3456"
            maxLength={19}
            className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
              errors.number ? 'border-red-500' : 'border-gray-600'
            }`}
            disabled={disabled || isProcessing}
          />
          {errors.number && (
            <p className="text-red-400 text-sm mt-1">{errors.number}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Expiry Date
            </label>
            <input
              type="text"
              value={cardDetails.expiry}
              onChange={(e) => setCardDetails(prev => ({
                ...prev,
                expiry: formatExpiry(e.target.value)
              }))}
              placeholder="MM/YY"
              maxLength={5}
              className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                errors.expiry ? 'border-red-500' : 'border-gray-600'
              }`}
              disabled={disabled || isProcessing}
            />
            {errors.expiry && (
              <p className="text-red-400 text-sm mt-1">{errors.expiry}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              CVC
            </label>
            <input
              type="text"
              value={cardDetails.cvc}
              onChange={(e) => setCardDetails(prev => ({
                ...prev,
                cvc: e.target.value.replace(/[^0-9]/g, '')
              }))}
              placeholder="123"
              maxLength={4}
              className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                errors.cvc ? 'border-red-500' : 'border-gray-600'
              }`}
              disabled={disabled || isProcessing}
            />
            {errors.cvc && (
              <p className="text-red-400 text-sm mt-1">{errors.cvc}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Cardholder Name
          </label>
          <input
            type="text"
            value={cardDetails.name}
            onChange={(e) => setCardDetails(prev => ({
              ...prev,
              name: e.target.value
            }))}
            placeholder="John Doe"
            className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
              errors.name ? 'border-red-500' : 'border-gray-600'
            }`}
            disabled={disabled || isProcessing}
          />
          {errors.name && (
            <p className="text-red-400 text-sm mt-1">{errors.name}</p>
          )}
        </div>

        {/* Amount Display */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-300">Total Amount:</span>
            <span className="text-2xl font-bold text-white">${amount}</span>
          </div>
        </div>

        {/* Security Notice */}
        <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-800/50 rounded-lg p-3">
          <Lock size={16} />
          <span>Your payment information is secure and encrypted</span>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled || isProcessing}
            className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={disabled || isProcessing || !cardDetails.number || !cardDetails.expiry || !cardDetails.cvc || !cardDetails.name}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black rounded-lg font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                Processing...
              </>
            ) : (
              <>
                <Lock size={16} />
                Pay ${amount}
              </>
            )}
          </button>
        </div>
      </form>
    </motion.div>
  );
}
