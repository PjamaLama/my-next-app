"use client";
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Feather, Zap, BarChart, PieChart, Table } from 'lucide-react';
import { User } from 'firebase/auth';
import SpaceBackground from './SpaceBackground';
import { trackCombinedViewContent, trackLead, createUserData } from '../../lib/metaConversionsAPI';

interface LandingPageProps {
  onSignIn: () => Promise<void>;
  user: User | null;
}

export default function LandingPage({ onSignIn, user }: LandingPageProps) {
  const [message, setMessage] = useState('');
  const [showFreeConversionPrompt, setShowFreeConversionPrompt] = useState(false);

  // Track ViewContent when landing page loads
  useEffect(() => {
    const trackViewContent = async () => {
      const userData = createUserData({
        clientUserAgent: navigator.userAgent
      });

      await trackCombinedViewContent({
        userData,
        contentName: 'Landing Page',
        contentIds: ['landing_page'],
        contentType: 'website',
        eventSourceUrl: window.location.href,
        testEventCode: process.env.NODE_ENV === 'development' ? 'TEST65930' : undefined
      });
    };

    trackViewContent();
  }, []);


  const handleFreeConversionFirst = () => {
    setShowFreeConversionPrompt(true);
  };

  const handleSignIn = async () => {
    setMessage('');
    setShowFreeConversionPrompt(false);
    try {
      await onSignIn();
      setMessage('Welcome! You are now signed in. Ready to convert your first data!');

      // Track Lead event after successful sign-in
      const trackLeadEvent = async () => {
        const userData = createUserData({
          email: user?.email || undefined,
          clientUserAgent: navigator.userAgent
        });

        await trackLead({
          userData,
          eventSourceUrl: window.location.href,
          testEventCode: process.env.NODE_ENV === 'development' ? 'TEST65930' : undefined
        });
      };

      trackLeadEvent();
    } catch (error) {
      console.error('Sign-in failed:', error);
      setMessage('Sign-in failed. Please try again.');
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2, delayChildren: 0.3 },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.5 } },
  };

  return (
    <div className="min-h-screen text-white font-sans overflow-x-hidden relative">
      {/* Skip link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 bg-emerald-600 text-white px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-300"
      >
        Skip to main content
      </a>

      <SpaceBackground />
      
      <div className="w-full py-2 px-6 sm:px-8 relative z-10">
        <motion.header
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex justify-between items-center mb-4 px-4 sm:px-0"
        >
          <div className="flex items-center gap-3">
            <img 
              src="/logo.png" 
              alt="SheetyAI Logo" 
              className="w-10 h-10 drop-shadow-lg"
              style={{ filter: 'invert(1)' }}
            />
            <h1 className="text-3xl font-bold tracking-tighter bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">SheetyAI</h1>
          </div>
            <motion.button
              onClick={onSignIn}
              whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.5)' }}
              whileTap={{ scale: 0.95 }}
              className="bg-transparent border border-white/30 hover:border-white/60 text-white font-semibold py-2 px-5 rounded-full transition-all duration-300 backdrop-blur-sm hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-opacity-50"
              aria-label="Sign in with Google to access Sheety AI"
            >
              Sign In
            </motion.button>
        </motion.header>

        <main id="main-content" className="text-center pt-0">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-4"
          >
            <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold mb-4 bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent tracking-tighter leading-tight">
              Turn Any Data into Smart Spreadsheets – Via Chat or WhatsApp
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-white/80 max-w-3xl mx-auto leading-relaxed px-4 sm:px-0 mb-6">
              Transform text, voice, files, or images into spreadsheet formulas instantly. Chat naturally or use WhatsApp to convert your data – get 3 free conversions per day, or go Pro for unlimited access.
            </p>

            {/* Free/Pro Emphasis */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8 px-4 sm:px-0">
              <div className="bg-emerald-500/20 border border-emerald-400/30 rounded-full px-6 py-3 backdrop-blur-sm">
                <span className="text-emerald-300 font-bold text-lg">🎁 3 Free Conversions Per Day</span>
              </div>
              <div className="bg-purple-500/20 border border-purple-400/30 rounded-full px-6 py-3 backdrop-blur-sm">
                <span className="text-purple-300 font-bold text-lg">⭐ Go Pro for Unlimited</span>
              </div>
            </div>

            {/* Interactive Demo Input */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="max-w-2xl mx-auto mb-12 px-4 sm:px-0"
            >
              <div className="bg-black/30 backdrop-blur-md border border-white/20 rounded-2xl p-6 shadow-2xl shadow-black/50">
                <h3 className="text-xl font-bold mb-4 text-center text-white">Try It Now - Convert Data to Spreadsheet</h3>
                <div className="space-y-4">
                  <textarea
                    placeholder="Enter your data here... (e.g., 'Sales data: John - $500, Jane - $750, Bob - $300')"
                    className="w-full p-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent resize-none"
                    rows={3}
                  />
                  <div className="flex gap-4">
                    <button
                      onClick={handleSignIn}
                      className="flex-1 bg-emerald-600/80 hover:bg-emerald-600 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      <span>📝</span>
                      Convert Text
                    </button>
                    <button
                      onClick={handleSignIn}
                      className="flex-1 bg-blue-600/80 hover:bg-blue-600 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      <span>📎</span>
                      Upload File/Image
                    </button>
                    <button
                      onClick={handleSignIn}
                      className="flex-1 bg-purple-600/80 hover:bg-purple-600 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      <span>🎤</span>
                      Voice Input
                    </button>
                  </div>
                </div>
                <p className="text-xs text-white/60 text-center mt-3">
                  💡 Try: "Create a spreadsheet from my expense receipts" or upload an image of data
                </p>
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mb-16"
          >
            {user ? (
              <p className="text-xl text-white/70">Welcome back! You are signed in and ready to use SheetyAI.</p>
            ) : (
              <div className="text-center">
                {/* Main CTA Button */}
                <motion.button
                  onClick={handleFreeConversionFirst}
                  whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(16, 185, 129, 0.4)" }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700 hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 text-white font-bold py-4 sm:py-6 px-8 sm:px-12 rounded-full transition-all duration-300 shadow-2xl shadow-emerald-500/50 flex items-center justify-center mx-auto backdrop-blur-sm border-2 border-emerald-400/50 text-lg sm:text-xl relative overflow-hidden group focus:outline-none focus:ring-4 focus:ring-emerald-300 focus:ring-opacity-50"
                  aria-label="Convert data now with 3 free conversions"
                >
                  {/* Shimmer effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>

                  <span className="relative z-10">🚀 Convert Data Now – 3 Free/Day</span>
                </motion.button>

                {/* Hidden description for screen readers */}
                <div id="cta-description" className="sr-only">
                  Start free signup to convert any data type into spreadsheets – get 3 free conversions per day
                </div>

                {/* Success Message */}
                {message && (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="mt-6 inline-block bg-emerald-500/20 border border-emerald-400/30 rounded-xl px-6 py-4 backdrop-blur-sm max-w-md"
                  >
                    <p className="text-emerald-300 font-semibold text-sm mb-2">{message}</p>
                    <p className="text-emerald-200 text-xs">💡 Tip: Set up WhatsApp integration after signup to convert data via chat!</p>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>

          {/* Multi-Input Types Showcase */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <h3 className="text-3xl font-bold mb-8 bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent text-center">Multiple Input Methods</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm hover:bg-black/30 transition-all duration-300"
              >
                <div className="text-4xl mb-3">📝</div>
                <h4 className="font-bold text-white mb-2">Text Input</h4>
                <p className="text-white/70 text-sm">Paste lists, tables, or any text data</p>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm hover:bg-black/30 transition-all duration-300"
              >
                <div className="text-4xl mb-3">🎤</div>
                <h4 className="font-bold text-white mb-2">Voice Input</h4>
                <p className="text-white/70 text-sm">Speak your data naturally</p>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm hover:bg-black/30 transition-all duration-300"
              >
                <div className="text-4xl mb-3">📎</div>
                <h4 className="font-bold text-white mb-2">File Upload</h4>
                <p className="text-white/70 text-sm">CSV, Excel, PDF files</p>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm hover:bg-black/30 transition-all duration-300"
              >
                <div className="text-4xl mb-3">📸</div>
                <h4 className="font-bold text-white mb-2">Image Upload</h4>
                <p className="text-white/70 text-sm">Photos of documents, receipts, forms</p>
              </motion.div>
            </div>
          </motion.div>

          {/* Main Features Grid */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 text-left"
          >
            <motion.div variants={itemVariants} className="p-6 border border-white/20 rounded-2xl bg-black/30 backdrop-blur-md shadow-2xl shadow-black/50 hover:bg-black/40 transition-all duration-300 hover:border-white/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-green-900/50 border border-green-500/30 rounded-lg backdrop-blur-sm">
                  <Database className="w-6 h-6 text-green-400" />
                </div>
                <h3 className="text-lg font-bold">📱 WhatsApp Integration</h3>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">
                Send data via WhatsApp for instant conversion. Perfect for casual users who want quick, mobile-first spreadsheet creation.
              </p>
            </motion.div>

            <motion.div variants={itemVariants} className="p-6 border border-white/20 rounded-2xl bg-black/30 backdrop-blur-md shadow-2xl shadow-black/50 hover:bg-black/40 transition-all duration-300 hover:border-white/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-blue-900/50 border border-blue-500/30 rounded-lg backdrop-blur-sm">
                  <Zap className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-lg font-bold">💻 In-App Power Tools</h3>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">
                Advanced features for power users: bulk processing, custom templates, and sophisticated data manipulation tools.
              </p>
            </motion.div>

            <motion.div variants={itemVariants} className="p-6 border border-white/20 rounded-2xl bg-black/30 backdrop-blur-md shadow-2xl shadow-black/50 hover:bg-black/40 transition-all duration-300 hover:border-white/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-purple-900/50 border border-purple-500/30 rounded-lg backdrop-blur-sm">
                  <Feather className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-lg font-bold">🔒 Privacy First</h3>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">
                Your data stays private and secure. All processing happens on secure servers with enterprise-grade encryption.
              </p>
            </motion.div>

            <motion.div variants={itemVariants} className="p-6 border border-white/20 rounded-2xl bg-black/30 backdrop-blur-md shadow-2xl shadow-black/50 hover:bg-black/40 transition-all duration-300 hover:border-white/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-emerald-900/50 border border-emerald-500/30 rounded-lg backdrop-blur-sm">
                  <PieChart className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-lg font-bold">📊 Smart Conversion</h3>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">
                AI-powered conversion that understands context and creates meaningful spreadsheet structures from any input type.
              </p>
            </motion.div>
          </motion.div>

          {/* Demo Video Section - Social Proof */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="mt-20 mb-16"
          >
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-white mb-4">See SheetyAI in Action</h3>
              <p className="text-white/70 max-w-2xl mx-auto">
                Watch how easy it is to convert any data into smart spreadsheets using our multi-input system.
              </p>
            </div>
            <div className="relative w-full max-w-4xl mx-auto aspect-video bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl border border-white/20 backdrop-blur-sm overflow-hidden mx-4 sm:mx-auto">
              <iframe
                src="https://www.youtube.com/embed/9EtaDAxoqv0?rel=0&modestbranding=1&showinfo=0&iv_load_policy=3"
                title="SheetyAI Demo Video"
                className="w-full h-full rounded-2xl"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
              />
            </div>
          </motion.div>

          {/* Pricing Tiers Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="mt-20 mb-16"
          >
            <h3 className="text-3xl font-bold mb-8 bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent text-center">Simple Pricing</h3>
            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              <motion.div
                whileHover={{ scale: 1.02 }}
                className="relative p-8 border-2 border-emerald-500/30 rounded-2xl bg-gradient-to-br from-emerald-900/20 to-emerald-800/10 backdrop-blur-sm shadow-2xl shadow-emerald-500/10"
              >
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="bg-emerald-500 text-black font-bold px-4 py-2 rounded-full text-sm">
                    FREE TIER
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-emerald-400 mb-2">$0</div>
                  <h4 className="text-xl font-bold text-white mb-4">Free Forever</h4>
                  <ul className="text-white/80 space-y-2 text-left">
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span>
                      <span>3 conversions per day</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span>
                      <span>All input types supported</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span>
                      <span>WhatsApp integration</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span>
                      <span>Basic export options</span>
                    </li>
                  </ul>
                </div>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.02 }}
                className="relative p-8 border-2 border-purple-500/30 rounded-2xl bg-gradient-to-br from-purple-900/20 to-purple-800/10 backdrop-blur-sm shadow-2xl shadow-purple-500/10"
              >
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="bg-purple-500 text-white font-bold px-4 py-2 rounded-full text-sm">
                    PRO PLAN
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-purple-400 mb-2">$9.99</div>
                  <h4 className="text-xl font-bold text-white mb-4">Unlimited Access</h4>
                  <ul className="text-white/80 space-y-2 text-left">
                    <li className="flex items-center gap-2">
                      <span className="text-purple-400">✓</span>
                      <span>Unlimited conversions</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-purple-400">✓</span>
                      <span>Advanced AI features</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-purple-400">✓</span>
                      <span>Priority processing</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-purple-400">✓</span>
                      <span>Custom templates & bulk processing</span>
                    </li>
                  </ul>
                </div>
              </motion.div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            viewport={{ once: true }}
            className="mt-48 relative overflow-hidden rounded-3xl p-12"
          >
            <div className="relative z-10">
              <h3 className="text-5xl font-bold mb-20 bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent">Simple 3-Step Process</h3>
              <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                    className="flex gap-4 items-start"
                >
                    <div className="p-3 bg-emerald-900/50 border border-emerald-500/30 rounded-lg mt-1 backdrop-blur-sm shadow-lg shadow-black/20"><BarChart className="w-6 h-6 text-emerald-400"/></div>
                    <div>
                        <h4 className="font-bold text-lg text-white">1. Choose Your Input</h4>
                        <p className="text-white/80">Send data via WhatsApp, upload files/images, paste text, or speak naturally. Any format works!</p>
                    </div>
                </motion.div>
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.8 }}
                    className="flex gap-4 items-start"
                >
                    <div className="p-3 bg-blue-900/50 border border-blue-500/30 rounded-lg mt-1 backdrop-blur-sm shadow-lg shadow-black/20"><PieChart className="w-6 h-6 text-blue-400"/></div>
                    <div>
                        <h4 className="font-bold text-lg text-white">2. AI Processes Instantly</h4>
                        <p className="text-white/80">Smart AI analyzes your data and creates structured spreadsheets with intelligent formatting and formulas.</p>
                    </div>
                </motion.div>
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 1.0 }}
                    className="flex gap-4 items-start"
                >
                    <div className="p-3 bg-purple-900/50 border border-purple-500/30 rounded-lg mt-1 backdrop-blur-sm shadow-lg shadow-black/20"><Table className="w-6 h-6 text-purple-400"/></div>
                    <div>
                        <h4 className="font-bold text-lg text-white">3. Get Your Spreadsheet</h4>
                        <p className="text-white/80">Download your perfectly formatted spreadsheet or continue editing in-app. Ready to use immediately!</p>
                    </div>
                </motion.div>

              </div>
            </div>
            
            {/* Why Users Love SheetyAI */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 1.8 }}
              className="mt-20"
            >
              <h3 className="text-4xl font-bold mb-12 bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent text-center">Why Users Love SheetyAI</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-3xl mb-3">✨</div>
                  <p className="text-white/80 font-medium">Convert any data type to spreadsheets instantly</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-3xl mb-3">✨</div>
                  <p className="text-white/80 font-medium">WhatsApp and chat integration for seamless workflow</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-3xl mb-3">✨</div>
                  <p className="text-white/80 font-medium">AI-powered formula generation from unstructured data</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-3xl mb-3">✨</div>
                  <p className="text-white/80 font-medium">Extract data from images, PDFs, and documents</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-3xl mb-3">✨</div>
                  <p className="text-white/80 font-medium">3 free conversions daily, unlimited with Pro</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-3xl mb-3">✨</div>
                  <p className="text-white/80 font-medium">Secure & private - your data never leaves your control</p>
                </div>
              </div>
            </motion.div>
            
            {/* Perfect For Section */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 2.0 }}
              className="mt-20"
            >
              <h3 className="text-4xl font-bold mb-12 bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent text-center">🎯 Perfect For:</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-2xl mb-3">📱</div>
                  <p className="text-white/80 font-medium">Mobile users who prefer WhatsApp for data conversion</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-2xl mb-3">📄</div>
                  <p className="text-white/80 font-medium">Document processors converting receipts, invoices, and forms</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-2xl mb-3">💼</div>
                  <p className="text-white/80 font-medium">Business analysts transforming unstructured data</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-2xl mb-3">👥</div>
                  <p className="text-white/80 font-medium">Teams needing quick data-to-spreadsheet conversions</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
            
            {/* Second CTA Button for scrollers */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 1.8 }}
              className="mt-16 text-center"
            >
              <motion.button
                onClick={handleFreeConversionFirst}
                whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(16, 185, 129, 0.4)" }}
                whileTap={{ scale: 0.95 }}
                className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700 hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 text-white font-bold py-4 sm:py-6 px-8 sm:px-12 rounded-full transition-all duration-300 shadow-2xl shadow-emerald-500/50 flex items-center justify-center mx-auto backdrop-blur-sm border-2 border-emerald-400/50 text-lg sm:text-xl relative overflow-hidden group"
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>

                <span className="relative z-10">🚀 Convert Data Now – 3 Free/Day</span>
              </motion.button>
            </motion.div>

        </main>

        {/* Free Conversion Prompt Modal */}
        <AnimatePresence>
          {showFreeConversionPrompt && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setShowFreeConversionPrompt(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-gray-900 rounded-2xl max-w-md w-full mx-4 relative border border-white/10 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6">
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-400/30 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-3xl">✨</span>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Try Free Conversion First!</h3>
                    <p className="text-gray-300 text-sm leading-relaxed">
                      Get started with 3 free conversions per day. Sign up now to unlock unlimited data conversion from WhatsApp, chat, or any input type!
                    </p>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={handleSignIn}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-emerald-500/25"
                    >
                      🚀 Sign Up & Get 3 Free Conversions
                    </button>

                    <button
                      onClick={() => setShowFreeConversionPrompt(false)}
                      className="w-full bg-transparent text-gray-400 hover:text-white text-sm py-2 transition-colors"
                    >
                      Maybe later
                    </button>
                  </div>

                  <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-400/20 rounded-lg">
                    <p className="text-emerald-300 text-xs text-center">
                      💡 Pro tip: Set up WhatsApp integration after signup for seamless mobile conversions!
                    </p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.5 }}
          className="text-center mt-48 text-white/40 text-sm"
        >
          <p>&copy; {new Date().getFullYear()} SheetyAI. All rights reserved.</p>
          <div className="mt-2">
            <a href="/terms" className="hover:text-emerald-300 underline">Terms of Service</a>
            <span className="mx-2">|</span>
            <a href="/privacy" className="hover:text-emerald-300 underline">Privacy Policy</a>
          </div>
        </motion.footer>
      </div>
    </div>
  );
}
