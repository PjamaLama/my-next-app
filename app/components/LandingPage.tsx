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
  const [remainingSpots, setRemainingSpots] = useState<number | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [isSigningUp, setIsSigningUp] = useState(false);

  useEffect(() => {
    const fetchRemainingSpots = async () => {
      try {
        // Use the existing beta-stats API endpoint
        const response = await fetch('/api/beta-stats');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        // The API returns { spotsLeft: number }
        setRemainingSpots(data.spotsLeft);
      } catch (error) {
        console.error('Error fetching remaining spots:', error);
        setRemainingSpots(null);
      }
    };

    const fetchUserCount = async () => {
      try {
        const response = await fetch('/api/user-count');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.success) {
          setUserCount(data.userCount);
        }
      } catch (error) {
        console.error('Error fetching user count:', error);
        setUserCount(null);
      }
    };

    fetchRemainingSpots();
    fetchUserCount();
  }, []);

  const handleBetaSignupWithGoogle = async () => {
    setIsSigningUp(true);
    setMessage('');
    try {
      // This will trigger the Google Sign-in flow via the parent component (app/page.tsx)
      await onSignIn();

      // After successful sign-in, call the Firebase-based beta signup API
      if (user) { // Check if user object is available after sign-in
        const response = await fetch('/api/beta-signup-firebase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: user.uid, email: user.email }),
        });
        const data = await response.json();
        if (response.ok && data.success) {
          setMessage(data.message);
          if (data.remainingSpots !== undefined) {
            setRemainingSpots(data.remainingSpots);
          }
        } else {
          setMessage(data.message || 'Failed to register for beta.');
        }
      } else {
        setMessage('Sign-in cancelled or failed.');
      }
    } catch (error) {
      console.error('Google Sign-in or beta registration failed:', error);
      setMessage('Sign-in or beta registration failed.');
    } finally {
      setIsSigningUp(false);
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
              className="bg-transparent border border-white/30 hover:border-white/60 text-white font-semibold py-2 px-5 rounded-full transition-all duration-300 backdrop-blur-sm hover:bg-white/5"
            >
              Sign In
            </motion.button>
        </motion.header>

        <main className="text-center pt-0">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-4"
          >
            <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold mb-4 bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent tracking-tighter leading-tight">
              The Future of Spreadsheets is Here
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-white/80 max-w-3xl mx-auto leading-relaxed px-4 sm:px-0">
              Stop wrestling with complex formulas and manual data entry. SheetyAI brings the power of artificial intelligence to your Google Sheets, automating tasks and unlocking insights like never before.
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mb-32"
          >
            {user ? (
              <p className="text-xl text-white/70">You are signed in. Beta registration logic will be implemented here.</p>
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
                      src="https://www.youtube.com/embed/ZDazRU_PqGc"
                      title="SheetyAI Demo Video"
                      className="w-full h-full rounded-2xl"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  </div>
                </motion.div>

                {/* Main CTA Button */}
                            <motion.button
              onClick={handleBetaSignupWithGoogle}
              whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(16, 185, 129, 0.4)" }}
              whileTap={{ scale: 0.95 }}
              className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700 hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 text-white font-bold py-4 sm:py-6 px-8 sm:px-12 rounded-full transition-all duration-300 shadow-2xl shadow-emerald-500/50 flex items-center justify-center mx-auto backdrop-blur-sm border-2 border-emerald-400/50 text-lg sm:text-xl relative overflow-hidden group"
              disabled={isSigningUp}
            >
                  {/* Shimmer effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                  
                  {isSigningUp ? (
                    <svg className="animate-spin h-6 w-6 mr-3 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <span className="relative z-10">🔥 Join Beta</span>
                  )}
                </motion.button>

                {/* Info Badges - Positioned below button as subtle info */}
                <div className="mt-8 space-y-3">
                  {/* Limited Time Badge */}
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.6 }}
                    className="inline-flex items-center gap-2 text-orange-300/80 text-sm font-medium"
                  >
                    <span>🚀</span>
                    <span>Limited Time: Private Beta Access</span>
                  </motion.div>

                  {/* Scarcity Badge */}
                  {remainingSpots !== null && (
                    <motion.div
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ duration: 0.5, delay: 0.8 }}
                      className="block"
                    >
                      {remainingSpots > 0 ? (
                        <div className="inline-flex items-center gap-2 text-red-300/80 text-sm font-medium">
                          <span>⏰</span>
                          <span>
                            Only <span className="text-white font-semibold">{remainingSpots}</span> spots remaining!
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 text-yellow-300/80 text-sm font-medium">
                          <span>🚫</span>
                          <span>Beta is currently full</span>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Social Proof Badge */}
                  {userCount !== null && (
                    <motion.div
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ duration: 0.5, delay: 1.0 }}
                      className="inline-flex items-center gap-2 text-blue-300/80 text-sm font-medium"
                    >
                      <span>👥</span>
                      <span>
                        <span className="text-white font-semibold">{userCount}</span> users already joined
                      </span>
                    </motion.div>
                  )}
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
                <h3 className="text-xl font-bold">Automated Analysis</h3>
              </div>
              <p className="text-white/70">
                Let our AI analyze your data, identify trends, and provide actionable insights in seconds.
              </p>
            </motion.div>
            <motion.div variants={itemVariants} className="p-8 border border-white/20 rounded-2xl bg-black/30 backdrop-blur-md shadow-2xl shadow-black/50 hover:bg-black/40 transition-all duration-300 hover:border-white/30">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-sky-900/50 border border-sky-500/30 rounded-lg backdrop-blur-sm">
                  <Feather className="w-6 h-6 text-sky-400" />
                </div>
                <h3 className="text-xl font-bold">Natural Language Queries</h3>
              </div>
              <p className="text-white/70">
                Talk to your data. Ask complex questions in plain English and get immediate answers.
              </p>
            </motion.div>
            <motion.div variants={itemVariants} className="p-8 border border-white/20 rounded-2xl bg-black/30 backdrop-blur-md shadow-2xl shadow-black/50 hover:bg-black/40 transition-all duration-300 hover:border-white/30">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-purple-900/50 border border-purple-500/30 rounded-lg backdrop-blur-sm">
                  <Database className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-xl font-bold">Smart Reporting</h3>
              </div>
              <p className="text-white/70">
                Generate stunning, customizable reports and dashboards with the click of a button.
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
              <h3 className="text-5xl font-bold mb-20 bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent">How It Works</h3>
              <div className="grid md:grid-cols-2 gap-12">
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                    className="flex gap-4 items-start"
                >
                    <div className="p-3 bg-white/10 border border-white/20 rounded-lg mt-1 backdrop-blur-sm shadow-lg shadow-black/20"><BarChart className="w-6 h-6 text-white"/></div>
                    <div>
                        <h4 className="font-bold text-lg text-white">Connect Your Sheet</h4>
                        <p className="text-white/80">Securely connect your Google Sheet and choose the data you want to analyze.</p>
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
                        <h4 className="font-bold text-lg text-white">Ask Your Questions</h4>
                        <p className="text-white/80">Use natural language to ask questions, request charts, or command data manipulations.</p>
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
                        <h4 className="font-bold text-lg text-white">Get Instant Insights</h4>
                        <p className="text-white/80">Receive AI-generated insights, charts, and summaries directly in the chat.</p>
                    </div>
                </motion.div>
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 1.2 }}
                    className="flex gap-4 items-start"
                >
                    <div className="p-3 bg-white/10 border border-white/20 rounded-lg mt-1 backdrop-blur-sm shadow-lg shadow-black/20"><Zap className="w-6 h-6 text-white"/></div>
                    <div>
                        <h4 className="font-bold text-lg text-white">Real-time Processing</h4>
                        <p className="text-white/80">Get instant responses and see your data transform in real-time as you interact.</p>
                    </div>
                </motion.div>
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 1.4 }}
                    className="flex gap-4 items-start"
                >
                    <div className="p-3 bg-white/10 border border-white/20 rounded-lg mt-1 backdrop-blur-sm shadow-lg shadow-black/20"><Database className="w-6 h-6 text-white"/></div>
                    <div>
                        <h4 className="font-bold text-lg text-white">Smart Analytics</h4>
                        <p className="text-white/80">AI-powered insights that help you understand patterns and trends in your data.</p>
                    </div>
                </motion.div>
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 1.6 }}
                    className="flex gap-4 items-start"
                >
                    <div className="p-3 bg-white/10 border border-white/20 rounded-lg mt-1 backdrop-blur-sm shadow-lg shadow-black/20"><Feather className="w-6 h-6 text-white"/></div>
                    <div>
                        <h4 className="font-bold text-lg text-white">Export & Share</h4>
                        <p className="text-white/80">Easily export your AI-generated reports and share insights with your team.</p>
                    </div>
                </motion.div>
              </div>
            </div>
            
            {/* Second CTA Button for scrollers */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 1.8 }}
              className="mt-16 text-center"
            >
              <motion.button
                onClick={handleBetaSignupWithGoogle}
                whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(16, 185, 129, 0.4)" }}
                whileTap={{ scale: 0.95 }}
                className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700 hover:from-emerald-600 hover:via-emerald-700 hover:to-emerald-800 text-white font-bold py-4 sm:py-6 px-8 sm:px-12 rounded-full transition-all duration-300 shadow-2xl shadow-emerald-500/50 flex items-center justify-center mx-auto backdrop-blur-sm border-2 border-emerald-400/50 text-lg sm:text-xl relative overflow-hidden group"
                disabled={isSigningUp}
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                
                {isSigningUp ? (
                  <svg className="animate-spin h-6 w-6 mr-3 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <span className="relative z-10">🔥 Join Beta</span>
                )}
              </motion.button>
            </motion.div>
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
