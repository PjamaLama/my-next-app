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
  const [isOpenBeta, setIsOpenBeta] = useState(false);

  useEffect(() => {
    const fetchBetaStats = async () => {
      try {
        const response = await fetch('/api/beta-stats');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setRemainingSpots(data.spotsLeft);
        setIsOpenBeta(data.open || false);
      } catch (error) {
        console.error('Error fetching beta stats:', error);
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

    fetchBetaStats();
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
              Turn Your Spreadsheets Into Powerful AI Assistants
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-white/80 max-w-3xl mx-auto leading-relaxed px-4 sm:px-0">
              Tired of spending hours on spreadsheet work that should take minutes? SheetyAI transforms your Google Sheets into intelligent workbooks that understand your data, answer your questions, and create insights automatically.
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
                      src="https://www.youtube.com/embed/ZDazRU_PqGc?rel=0&loop=1&playlist=ZDazRU_PqGc&modestbranding=1&showinfo=0"
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
                    <span className="relative z-10">{isOpenBeta ? '🚀 Get Started Now' : '🔥 Get Early Access Now'}</span>
                  )}
                </motion.button>

                {/* Info Badges - Positioned below button as subtle info */}
                {!isOpenBeta && (
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
                </div>
                )}

                  {/* Social Proof Badge */}
                  {userCount !== null && (
                    <motion.div
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ duration: 0.5, delay: 1.0 }}
                      className="inline-flex items-center gap-2 text-blue-300/80 text-sm font-medium mt-3"
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
                <h3 className="text-xl font-bold">📊 Instant Data Analysis</h3>
              </div>
              <p className="text-white/70">
                Skip the complex formulas. Just upload your data and get meaningful insights, trends, and patterns identified automatically—no spreadsheet expertise required.
              </p>
            </motion.div>
            <motion.div variants={itemVariants} className="p-8 border border-white/20 rounded-2xl bg-black/30 backdrop-blur-md shadow-2xl shadow-black/50 hover:bg-black/40 transition-all duration-300 hover:border-white/30">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-sky-900/50 border border-sky-500/30 rounded-lg backdrop-blur-sm">
                  <Feather className="w-6 h-6 text-sky-400" />
                </div>
                <h3 className="text-xl font-bold">💬 Chat With Your Data</h3>
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
                <h3 className="text-xl font-bold">📈 Beautiful Reports in Seconds</h3>
              </div>
              <p className="text-white/70">
                Transform raw data into professional charts, graphs, and dashboards with a simple request. Perfect for presentations and team updates.
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
                        <h4 className="font-bold text-lg text-white">1. Connect & Upload</h4>
                        <p className="text-white/80">Link your Google Sheets securely. Your data stays private and protected.</p>
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
                        <h4 className="font-bold text-lg text-white">2. Ask Anything</h4>
                        <p className="text-white/80">Type questions naturally: "What's my top-performing category?" or "Create a sales forecast chart."</p>
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
                        <h4 className="font-bold text-lg text-white">3. Get Results Instantly</h4>
                        <p className="text-white/80">Receive professional insights, visualizations, and actionable recommendations immediately.</p>
                    </div>
                </motion.div>

              </div>
            </div>
            
            {/* Why Beta Users Love SheetyAI */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 1.8 }}
              className="mt-20"
            >
              <h3 className="text-4xl font-bold mb-12 bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent text-center">Why Beta Users Love SheetyAI</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-3xl mb-3">✨</div>
                  <p className="text-white/80 font-medium">Save 5+ hours per week on data analysis</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-3xl mb-3">✨</div>
                  <p className="text-white/80 font-medium">No learning curve - works like having a conversation</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-3xl mb-3">✨</div>
                  <p className="text-white/80 font-medium">Professional results without being a spreadsheet expert</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-3xl mb-3">✨</div>
                  <p className="text-white/80 font-medium">Real-time insights as your data updates</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-3xl mb-3">✨</div>
                  <p className="text-white/80 font-medium">Easy sharing - export and present with confidence</p>
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
                  <p className="text-white/80 font-medium">Small business owners tracking sales and inventory</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-2xl mb-3">📊</div>
                  <p className="text-white/80 font-medium">Marketing teams analyzing campaign performance</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-2xl mb-3">📋</div>
                  <p className="text-white/80 font-medium">Project managers monitoring team progress</p>
                </div>
                <div className="text-center p-6 border border-white/20 rounded-xl bg-black/20 backdrop-blur-sm">
                  <div className="text-2xl mb-3">👥</div>
                  <p className="text-white/80 font-medium">Anyone who works with data but isn't a spreadsheet wizard</p>
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
                  <span className="relative z-10">🔥 Get Early Access Now</span>
                )}
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
