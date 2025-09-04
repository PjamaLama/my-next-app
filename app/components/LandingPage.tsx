"use client";
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, Feather, Zap, BarChart, PieChart, Table } from 'lucide-react';
import { User } from 'firebase/auth';
import SpaceBackground from './SpaceBackground';

interface LandingPageProps {
  onSignIn: () => Promise<void>;
  user: User | null;
}

export default function LandingPage({ onSignIn, user }: LandingPageProps) {
  const [message, setMessage] = useState('');

  // Hardcoded video data
  const videoData = {
    videoUrl: 'https://www.youtube.com/embed/9EtaDAxoqv0?rel=0&modestbranding=1&showinfo=0&iv_load_policy=3',
    videoTitle: 'SheetyAI Demo Video'
  };

  const handleSignIn = async () => {
    setMessage('');
    try {
      await onSignIn();
      setMessage('Welcome! You are now signed in.');
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
              Update Your Spreadsheets With Voice Commands
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-white/80 max-w-3xl mx-auto leading-relaxed px-4 sm:px-0">
              Tired of manually typing and editing spreadsheet data? SheetyAI lets you update your Google Sheets using natural voice commands. Just speak what you want to change, and watch your spreadsheets update automatically—no more clicking, typing, or complex formulas.
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mb-32"
          >
            {user ? (
              <p className="text-xl text-white/70">Welcome back! You are signed in and ready to use SheetyAI.</p>
            ) : (
              <div className="text-center">
                {/* YouTube Video */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="mb-8"
                >
                  <div className="relative w-full max-w-4xl mx-auto aspect-video bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl border border-white/20 backdrop-blur-sm overflow-hidden mx-4 sm:mx-auto">
                    <iframe
                      src={videoData.videoUrl}
                      title={videoData.videoTitle}
                      className="w-full h-full rounded-2xl"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      loading="lazy"
                    />
                  </div>
                </motion.div>

                {/* Main CTA Button */}
                <motion.button
                  onClick={handleSignIn}
                  whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(16, 185, 129, 0.4)" }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700 hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 text-white font-bold py-4 sm:py-6 px-8 sm:px-12 rounded-full transition-all duration-300 shadow-2xl shadow-emerald-500/50 flex items-center justify-center mx-auto backdrop-blur-sm border-2 border-emerald-400/50 text-lg sm:text-xl relative overflow-hidden group focus:outline-none focus:ring-4 focus:ring-emerald-300 focus:ring-opacity-50"
                  aria-label="Get started with Sheety AI"
                >
                  {/* Shimmer effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>

                  <span className="relative z-10">🚀 Get Started Now</span>
                </motion.button>

                {/* Hidden description for screen readers */}
                <div id="cta-description" className="sr-only">
                  Sign up for free to start using Sheety AI's voice-to-spreadsheet automation features
                </div>

                {/* Success Message */}
                {message && (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="mt-6 inline-block bg-emerald-500/20 border border-emerald-400/30 rounded-full px-4 py-2 backdrop-blur-sm"
                  >
                    <p className="text-emerald-300 font-semibold text-sm">{message}</p>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid md:grid-cols-3 gap-10 text-left"
          >
            <motion.div variants={itemVariants} className="p-8 border border-white/20 rounded-2xl bg-black/30 backdrop-blur-md shadow-2xl shadow-black/50 hover:bg-black/40 transition-all duration-300 hover:border-white/30">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-emerald-900/50 border border-emerald-500/30 rounded-lg backdrop-blur-sm">
                  <Zap className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold">🎤 Voice-Powered Updates</h3>
              </div>
              <p className="text-white/70">
                Simply speak your changes: "Add a new row for John Smith with $500 sales" or "Update the budget in cell B15 to $2,000." No more manual typing or clicking through cells.
              </p>
            </motion.div>
            <motion.div variants={itemVariants} className="p-8 border border-white/20 rounded-2xl bg-black/30 backdrop-blur-md shadow-2xl shadow-black/50 hover:bg-black/40 transition-all duration-300 hover:border-white/30">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-sky-900/50 border border-sky-500/30 rounded-lg backdrop-blur-sm">
                  <Feather className="w-6 h-6 text-sky-400" />
                </div>
                <h3 className="text-xl font-bold">💬 Natural Language Editing</h3>
              </div>
              <p className="text-white/70">
                Ask questions like "Which products sold best last quarter?" or "Show me sales trends by region" and get instant, accurate answers in plain English.
              </p>
            </motion.div>
            <motion.div variants={itemVariants} className="p-8 border border-white/20 rounded-2xl bg-black/30 backdrop-blur-md shadow-2xl shadow-black/50 hover:bg-black/40 transition-all duration-300 hover:border-white/40 transition-all duration-300 hover:border-white/30">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-purple-900/50 border border-purple-500/30 rounded-lg backdrop-blur-sm">
                  <Database className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-xl font-bold">📝 Smart Data Entry</h3>
              </div>
              <p className="text-white/70">
                Let AI handle the complex stuff. Insert new rows, update existing data, and reorganize your spreadsheets with simple voice commands. Perfect for data entry and maintenance tasks.
              </p>
            </motion.div>
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
                    <div className="p-3 bg-white/10 border border-white/20 rounded-lg mt-1 backdrop-blur-sm shadow-lg shadow-black/20"><BarChart className="w-6 h-6 text-white"/></div>
                    <div>
                        <h4 className="font-bold text-lg text-white">1. Connect & Speak</h4>
                        <p className="text-white/80">Link your Google Sheets securely, then start talking. Your voice commands are instantly converted to spreadsheet updates.</p>
                    </div>
                </motion.div>
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.8 }}
                    className="flex gap-4 items-start"
                >
                    <div className="p-3 bg-white/10 border border-white/20 rounded-lg mt-1 backdrop-blur-sm shadow-lg shadow-black/20"><PieChart className="w-6 h-6 text-white"/></div>
                    <div>
                        <h4 className="font-bold text-lg text-white">2. Voice Your Changes</h4>
                        <p className="text-white/80">Speak naturally: "Add a new customer row" or "Update the sales total in column C to $15,000."</p>
                    </div>
                </motion.div>
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 1.0 }}
                    className="flex gap-4 items-start"
                >
                    <div className="p-3 bg-white/10 border border-white/20 rounded-lg mt-1 backdrop-blur-sm shadow-lg shadow-black/20"><Table className="w-6 h-6 text-white"/></div>
                    <div>
                        <h4 className="font-bold text-lg text-white">3. Watch It Update Instantly</h4>
                        <p className="text-white/80">See your spreadsheet update in real-time as AI processes your voice commands and applies the changes automatically.</p>
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
                  <p className="text-white/80 font-medium">Update spreadsheets 10x faster with voice commands</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-3xl mb-3">✨</div>
                  <p className="text-white/80 font-medium">No more manual typing or clicking through cells</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-3xl mb-3">✨</div>
                  <p className="text-white/80 font-medium">Natural language editing - just speak what you want</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-3xl mb-3">✨</div>
                  <p className="text-white/80 font-medium">Real-time updates as you speak</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-3xl mb-3">✨</div>
                  <p className="text-white/80 font-medium">Perfect for data entry and maintenance tasks</p>
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
                  <div className="text-2xl mb-3">💼</div>
                  <p className="text-white/80 font-medium">Business owners updating sales and inventory data</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-2xl mb-3">📊</div>
                  <p className="text-white/80 font-medium">Teams managing customer databases and records</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-2xl mb-3">📋</div>
                  <p className="text-white/80 font-medium">Project managers updating task progress and timelines</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-2xl mb-3">👥</div>
                  <p className="text-white/80 font-medium">Anyone who spends time manually updating spreadsheet data</p>
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
                onClick={handleSignIn}
                whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(16, 185, 129, 0.4)" }}
                whileTap={{ scale: 0.95 }}
                className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700 hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 text-white font-bold py-4 sm:py-6 px-8 sm:px-12 rounded-full transition-all duration-300 shadow-2xl shadow-emerald-500/50 flex items-center justify-center mx-auto backdrop-blur-sm border-2 border-emerald-400/50 text-lg sm:text-xl relative overflow-hidden group"
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>

                <span className="relative z-10">🚀 Get Started Now</span>
              </motion.button>
            </motion.div>

        </main>

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
