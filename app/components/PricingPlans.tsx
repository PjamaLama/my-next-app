"use client";

import React, { useEffect } from 'react';
import { Check, X, Zap, Crown, MessageSquare, Users, TrendingUp } from 'lucide-react';
import { useFirebase } from '../providers/FirebaseProvider';
import { useUpgradeModal } from '../providers/UpgradeModalProvider';
import { trackCombinedViewContent, trackInitiateCheckout, createUserData } from '../../lib/metaConversionsAPI';
import { trackTikTokViewContent, trackTikTokInitiateCheckout } from '../../lib/tiktokPixel';

interface PricingPlansProps {
  compact?: boolean;
  showTitle?: boolean;
}

export default function PricingPlans({ compact = false, showTitle = true }: PricingPlansProps) {
  const { user, userType } = useFirebase();
  const { openModal } = useUpgradeModal();

  // Track ViewContent when pricing page is viewed
  useEffect(() => {
    const trackViewContent = async () => {
      const userData = createUserData({
        email: user?.email || undefined,
        clientUserAgent: navigator.userAgent
      });

      await trackCombinedViewContent({
        userData,
        contentName: 'Pricing Plans Page',
        contentIds: ['pricing_plans'],
        contentType: 'product',
        eventSourceUrl: window.location.href,
        testEventCode: process.env.NODE_ENV === 'development' ? 'TEST65930' : undefined
      });

      // Also track to TikTok pixel
      trackTikTokViewContent('sheetyai_pro_monthly');
    };

    trackViewContent();
  }, [user?.email]);

  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: '',
      description: 'Perfect for getting started',
      features: [
        { name: '3 messages per day', included: true, icon: MessageSquare },
        { name: 'All input types: text, voice, files, images', included: true, icon: Zap },
        { name: 'File uploads up to 5MB each', included: true, icon: TrendingUp },
        { name: 'WhatsApp integration (3/day total)', included: true, icon: TrendingUp },
      ],
      buttonText: 'Current Plan',
      buttonVariant: 'secondary' as const,
      popular: false,
    },
    {
      name: 'Pro',
      originalPrice: '$29.99',
      price: '$19.97',
      period: 'per month',
      description: 'Unlimited conversations and priority support',
      savings: 'SAVE $10.02/month (33% OFF!)',
      limitedTime: true,
      features: [
        { name: 'Unlimited conversations daily', included: true, icon: MessageSquare },
        { name: 'All input types: text, voice, files, images', included: true, icon: Zap },
        { name: 'File uploads up to 25MB each', included: true, icon: TrendingUp },
        { name: 'WhatsApp & in‑app chat integration (unlimited)', included: true, icon: TrendingUp },
        { name: 'Advanced AI processing & analysis', included: true, icon: Crown },
        { name: 'Priority customer support', included: true, icon: Crown },
      ],
      buttonText: userType === 'pro' ? 'Current Plan' : '🚀 Claim Discount',
      buttonVariant: 'primary' as const,
      popular: true,
    },
  ];

  const handleUpgradeClick = async (planName: string) => {
    if (planName === 'Pro' && userType !== 'pro') {
      // Track InitiateCheckout event
      const userData = createUserData({
        email: user?.email || undefined,
        clientUserAgent: navigator.userAgent
      });

      await trackInitiateCheckout({
        userData,
        eventSourceUrl: window.location.href,
        testEventCode: process.env.NODE_ENV === 'development' ? 'TEST65930' : undefined
      });

      // Also track to TikTok pixel
      trackTikTokInitiateCheckout('sheetyai_pro_monthly');

      openModal(planName);
    }
  };

  return (
    <div className={`w-full ${compact ? 'max-w-6xl' : 'max-w-7xl'} mx-auto px-4 sm:px-6 lg:px-8`}>
      {showTitle && (
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Choose the plan that fits your needs. Upgrade or downgrade at any time.
          </p>
        </div>
      )}

      <div className={`grid ${compact ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 lg:grid-cols-2'} gap-8`}>
        {plans.map((plan, index) => (
          <div
            key={plan.name}
            className={`relative rounded-2xl border p-8 ${
              plan.popular
                ? 'border-emerald-500/50 bg-emerald-500/5 shadow-lg shadow-emerald-500/10'
                : 'border-gray-700/50 bg-gray-800/50'
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="bg-emerald-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg">
                  Most Popular
                </span>
              </div>
            )}

            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>

              {/* Limited Time Offer Badge */}
              {plan.limitedTime && (
                <div className="mb-3">
                  <span className="inline-block bg-red-500/20 text-red-400 text-xs font-bold px-3 py-1 rounded-full border border-red-500/30">
                    🔥 LIMITED TIME OFFER
                  </span>
                </div>
              )}

              <div className="mb-4">
                {plan.originalPrice && (
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <span className="text-2xl text-gray-500 line-through">{plan.originalPrice}</span>
                    <span className="text-4xl font-bold text-white">{plan.price}</span>
                  </div>
                )}
                {!plan.originalPrice && (
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                )}
                {plan.period && <span className="text-gray-400 ml-2">{plan.period}</span>}

                {/* Savings highlight */}
                {plan.savings && (
                  <div className="text-emerald-400 font-bold text-sm mt-1">
                    {plan.savings}
                  </div>
                )}

              </div>
              <p className="text-gray-300">{plan.description}</p>
            </div>

            <div className="space-y-4 mb-8">
              {plan.features.map((feature, featureIndex) => (
                <div key={featureIndex} className="flex items-center gap-3">
                  <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                    feature.included
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-gray-600/20 text-gray-500'
                  }`}>
                    {feature.included ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <X className="w-3 h-3" />
                    )}
                  </div>
                  <span className={`text-sm ${
                    feature.included ? 'text-white' : 'text-gray-400'
                  }`}>
                    {feature.name}
                  </span>
                  {feature.included && (
                    <feature.icon className="w-4 h-4 text-emerald-400 ml-auto" />
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => handleUpgradeClick(plan.name)}
              disabled={plan.name === 'Free' && userType === 'free'}
              className={`w-full py-3 px-6 rounded-xl font-semibold transition-all duration-200 ${
                plan.buttonVariant === 'primary'
                  ? plan.name === 'Pro' && userType === 'pro'
                    ? 'bg-emerald-600/50 text-emerald-300 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg hover:shadow-emerald-500/25 animate-pulse'
                  : plan.name === 'Free' && userType === 'free'
                    ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed border border-gray-500/50'
                    : 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-600'
              }`}
            >
              {plan.buttonText}
            </button>
          </div>
        ))}
      </div>

      {compact && (
        <div className="text-center mt-8">
          <p className="text-gray-400 text-sm">
            Questions about pricing? <a href="mailto:support@sheetyai.com" className="text-emerald-400 hover:text-emerald-300">Contact us</a>
          </p>
        </div>
      )}
    </div>
  );
}
