"use client";
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Database, Feather, Zap, BarChart, PieChart, Table } from 'lucide-react';

export default function LandingPage({ onSignIn }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const handleBetaSignUp = async (e) => {
    e.preventDefault();
    setMessage('');

    if (!email) {
      setMessage('Please enter your email.');
      return;
    }

    try {
      const response = await fetch('/api/beta-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(data.message);
        setEmail('');
      } else {
        setMessage(data.message || 'An error occurred.');
      }
    } catch (error) {
      setMessage('An error occurred.');
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
    <div className="min-h-screen bg-[#020202] text-white font-sans overflow-x-hidden relative">
      <style jsx>{`
        @keyframes grid-fade-in {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 0.1; transform: scale(1); }
        }
        .animated-grid {
          background-size: 40px 40px;
          background-image: linear-gradient(to right, #333 1px, transparent 1px), linear-gradient(to bottom, #333 1px, transparent 1px);
          animation: grid-fade-in 3s ease-out forwards;
          opacity: 0.1; /* Start with some opacity */
        }
      `}</style>
      <div className="absolute inset-0 z-0 pointer-events-none animated-grid"></div>
      <div className="container mx-auto px-6 py-8 relative z-10">
        <motion.header
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex justify-between items-center mb-32"
        >
          <h1 className="text-3xl font-bold tracking-tighter bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">SheetyAI</h1>
          <motion.button
            onClick={onSignIn}
            whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.5)' }}
            whileTap={{ scale: 0.95 }}
            className="bg-transparent border border-white/30 hover:border-white/60 text-white font-semibold py-2 px-5 rounded-full transition-all duration-300 backdrop-blur-sm"
          >
            Sign In
          </motion.button>
        </motion.header>

        <main className="text-center pt-16">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-16"
          >
            <h2 className="text-7xl font-extrabold mb-8 bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent tracking-tighter leading-tight">
              The Future of Spreadsheets is Here
            </h2>
            <p className="text-xl text-white/70 max-w-3xl mx-auto leading-relaxed">
              Stop wrestling with complex formulas and manual data entry. SheetyAI brings the power of artificial intelligence to your Google Sheets, automating tasks and unlocking insights like never before.
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mb-40"
          >
            <form onSubmit={handleBetaSignUp} className="flex justify-center gap-3 max-w-lg mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email to join the private beta"
                className="w-full px-5 py-4 bg-black/20 border border-white/10 rounded-full text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all duration-300 backdrop-blur-sm"
              />
              <motion.button
                type="submit"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-4 px-6 rounded-full transition-all duration-300 shadow-lg shadow-emerald-500/40"
              >
                Get Early Access
              </motion.button>
            </form>
            {message && <p className="mt-4 text-emerald-300 font-medium">{message}</p>}
            <p className="mt-3 text-sm text-white/40">Limited spots available for our exclusive beta.</p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid md:grid-cols-3 gap-10 text-left"
          >
            <motion.div variants={itemVariants} className="p-8 border border-white/10 rounded-2xl bg-black/20 backdrop-blur-md shadow-2xl shadow-black/30">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-emerald-900/50 border border-emerald-500/30 rounded-lg">
                  <Zap className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold">Automated Analysis</h3>
              </div>
              <p className="text-white/60">
                Let our AI analyze your data, identify trends, and provide actionable insights in seconds.
              </p>
            </motion.div>
            <motion.div variants={itemVariants} className="p-8 border border-white/10 rounded-2xl bg-black/20 backdrop-blur-md shadow-2xl shadow-black/30">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-sky-900/50 border border-sky-500/30 rounded-lg">
                  <Feather className="w-6 h-6 text-sky-400" />
                </div>
                <h3 className="text-xl font-bold">Natural Language Queries</h3>
              </div>
              <p className="text-white/60">
                Talk to your data. Ask complex questions in plain English and get immediate answers.
              </p>
            </motion.div>
            <motion.div variants={itemVariants} className="p-8 border border-white/10 rounded-2xl bg-black/20 backdrop-blur-md shadow-2xl shadow-black/30">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-purple-900/50 border border-purple-500/30 rounded-lg">
                  <Database className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-xl font-bold">Smart Reporting</h3>
              </div>
              <p className="text-white/60">
                Generate stunning, customizable reports and dashboards with the click of a button.
              </p>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            viewport={{ once: true }}
            className="mt-48"
          >
            <h3 className="text-5xl font-bold mb-20 bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent">How It Works</h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-20">
                <div className="w-full md:w-1/2">
                    <img src="/templates/convert-to-google-sheets.png" alt="SheetyAI in action" className="rounded-2xl shadow-2xl shadow-black/50 border border-white/10"/>
                </div>
                <div className="w-full md:w-1/2 text-left space-y-12">
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        whileInView={{ y: 0, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.6 }}
                        className="flex gap-4 items-start"
                    >
                        <div className="p-3 bg-gray-800 border border-white/20 rounded-lg mt-1"><BarChart className="w-6 h-6 text-white"/></div>
                        <div>
                            <h4 className="font-bold text-lg">Connect Your Sheet</h4>
                            <p className="text-white/60">Securely connect your Google Sheet and choose the data you want to analyze.</p>
                        </div>
                    </motion.div>
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        whileInView={{ y: 0, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.8 }}
                        className="flex gap-4 items-start"
                    >
                        <div className="p-3 bg-gray-800 border border-white/20 rounded-lg mt-1"><PieChart className="w-6 h-6 text-white"/></div>
                        <div>
                            <h4 className="font-bold text-lg">Ask Your Questions</h4>
                            <p className="text-white/60">Use natural language to ask questions, request charts, or command data manipulations.</p>
                        </div>
                    </motion.div>
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        whileInView={{ y: 0, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 1.0 }}
                        className="flex gap-4 items-start"
                    >
                        <div className="p-3 bg-gray-800 border border-white/20 rounded-lg mt-1"><Table className="w-6 h-6 text-white"/></div>
                        <div>
                            <h4 className="font-bold text-lg">Get Instant Insights</h4>
                            <p className="text-white/60">Receive AI-generated insights, charts, and summaries directly in the chat.</p>
                        </div>
                    </motion.div>
                </div>
            </div>
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
