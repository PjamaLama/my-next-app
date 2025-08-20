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
    <div className="min-h-screen bg-[#020202] text-white font-sans overflow-x-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.3),rgba(255,255,255,0))] z-0"></div>
      <div className="container mx-auto px-6 py-8 relative z-10">
        <motion.header
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex justify-between items-center mb-32"
        >
          <h1 className="text-3xl font-bold tracking-tighter">SheetyAI</h1>
          <motion.button
            onClick={onSignIn}
            whileHover={{ scale: 1.05, backgroundColor: '#fff', color: '#000' }}
            whileTap={{ scale: 0.95 }}
            className="bg-transparent border border-white/50 hover:bg-white text-white font-semibold py-2 px-5 rounded-full transition-all duration-300"
          >
            Sign In
          </motion.button>
        </motion.header>

        <main className="text-center">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-12"
          >
            <h2 className="text-7xl font-extrabold mb-6 bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent tracking-tighter">
              The Future of Spreadsheets is Here
            </h2>
            <p className="text-xl text-white/60 max-w-3xl mx-auto leading-relaxed">
              Stop wrestling with complex formulas and manual data entry. SheetyAI brings the power of artificial intelligence to your Google Sheets, automating tasks and unlocking insights like never before.
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mb-24"
          >
            <form onSubmit={handleBetaSignUp} className="flex justify-center gap-2 max-w-lg mx-auto">
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
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 px-6 rounded-full transition-colors duration-300 shadow-lg shadow-emerald-600/20"
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
            className="grid md:grid-cols-3 gap-8 text-left"
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
            className="mt-32"
          >
            <h3 className="text-4xl font-bold mb-12 bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent">How It Works</h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-12">
                <div className="w-full md:w-1/2">
                    <img src="/templates/convert-to-google-sheets.png" alt="SheetyAI in action" className="rounded-2xl shadow-2xl shadow-black/50"/>
                </div>
                <div className="w-full md:w-1/2 text-left space-y-8">
                    <div className="flex gap-4 items-start">
                        <div className="p-3 bg-gray-800 border border-white/20 rounded-lg mt-1"><BarChart className="w-6 h-6 text-white"/></div>
                        <div>
                            <h4 className="font-bold text-lg">Connect Your Sheet</h4>
                            <p className="text-white/60">Securely connect your Google Sheet and choose the data you want to analyze.</p>
                        </div>
                    </div>
                    <div className="flex gap-4 items-start">
                        <div className="p-3 bg-gray-800 border border-white/20 rounded-lg mt-1"><PieChart className="w-6 h-6 text-white"/></div>
                        <div>
                            <h4 className="font-bold text-lg">Ask Your Questions</h4>
                            <p className="text-white/60">Use natural language to ask questions, request charts, or command data manipulations.</p>
                        </div>
                    </div>
                    <div className="flex gap-4 items-start">
                        <div className="p-3 bg-gray-800 border border-white/20 rounded-lg mt-1"><Table className="w-6 h-6 text-white"/></div>
                        <div>
                            <h4 className="font-bold text-lg">Get Instant Insights</h4>
                            <p className="text-white/60">Receive AI-generated insights, charts, and summaries directly in the chat.</p>
                        </div>
                    </div>
                </div>
            </div>
          </motion.div>

        </main>

        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.5 }}
          className="text-center mt-32 text-white/40 text-sm"
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
