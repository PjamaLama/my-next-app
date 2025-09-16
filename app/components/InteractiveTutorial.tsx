"use client";

import React, { useState, useEffect } from 'react';
import { useTutorial } from '../providers/TutorialProvider';
import { X, ChevronRight, ChevronLeft, Check, Shield, Lock, Phone, FileText, Zap, FileSpreadsheet, MessageSquare, Copy } from 'lucide-react';

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  content: string | React.ReactNode;
  icon?: React.ReactNode;
}

interface InteractiveTutorialProps {
  isVisible: boolean;
  onClose: () => void;
}

export default function InteractiveTutorial({ isVisible, onClose }: InteractiveTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isVisible) {
      setCurrentStep(0);
    }
  }, [isVisible]);

  const handleTemplateClick = () => {
    // Open template in new tab
    window.open('https://docs.google.com/spreadsheets/d/1Hv8sEkw0vLuHcNPyrrQ_bkje2bjwQqdhlu3EfaQrLWc/edit?usp=sharing', '_blank');
  };

  const handleWhatsAppManage = () => {
    // Navigate to WhatsApp setup page
    window.location.href = '/whatsapp-setup';
  };

  const nextStep = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const skipTutorial = () => {
    onClose();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const TUTORIAL_STEPS: TutorialStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to Report AI!',
      description: 'Your secure AI-powered spreadsheet assistant',
      content: 'Report AI helps you connect your Google Sheets and chat with your data using natural language. Analyze, edit, and generate insights while keeping your data completely private.',
      icon: <Zap className="w-6 h-6" />
    },
    {
      id: 'privacy-security',
      title: '🔒 Privacy & Security First',
      description: 'Your data stays private and secure',
      content: (
        <div className="space-y-4">
          <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
            <div className="text-green-400 font-semibold text-sm mb-1">🔒 Zero Data Storage</div>
            <div className="text-green-300 text-xs">We never store your spreadsheet data on our servers. Your data stays in your Google Sheets account only.</div>
          </div>
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
            <div className="text-blue-400 font-semibold text-sm mb-1">🔐 Secure Access</div>
            <div className="text-blue-300 text-xs">We use Google's secure OAuth and service account authentication. No passwords are ever shared.</div>
          </div>
          <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3">
            <div className="text-purple-400 font-semibold text-sm mb-1">📊 Temporary Processing</div>
            <div className="text-purple-300 text-xs">Data is only processed in memory during your session and is immediately discarded when you close the app.</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-white font-semibold text-sm mb-2">Privacy Features</div>
            <div className="space-y-2 text-xs text-gray-300">
              <div className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <div><strong>No Data Logging</strong> - We don't log or track your spreadsheet contents</div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <div><strong>Session-Based Access</strong> - Access exists only while you're using the app</div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <div><strong>Google's Security</strong> - Protected by enterprise-grade infrastructure</div>
              </div>
            </div>
          </div>
        </div>
      ),
      icon: <Shield className="w-6 h-6" />
    },
    {
      id: 'service-account',
      title: 'Service Account Setup',
      description: 'Grant secure access to your Google Sheets',
      content: (
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-white font-semibold text-sm mb-3">📹 Tutorial Video</div>
            <div className="aspect-video w-full rounded-lg overflow-hidden border border-gray-600">
              <iframe
                width="100%"
                height="100%"
                src="https://www.youtube.com/embed/Lcf1KNNq_oc?start=17&end=68"
                title="Service Account Setup Tutorial"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="rounded-lg"
              ></iframe>
            </div>
          </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-white font-semibold text-sm mb-2">1. Copy the service account email below</div>
          <div className="relative">
            <div className="bg-gray-900 rounded p-2 pr-12 border border-gray-600 flex items-center justify-between break-all">
              <code className="text-xs text-blue-400 font-mono select-all">report-ai@report-ai-23599.iam.gserviceaccount.com</code>
            </div>
            <button
              onClick={() => copyToClipboard('report-ai@report-ai-23599.iam.gserviceaccount.com')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-full bg-white/10 border border-white/10 text-white/90 hover:bg-white/20 hover:scale-105 transition"
              aria-label="Copy service account email"
              title={copied ? 'Copied!' : 'Copy'}
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-white font-semibold text-sm mb-2">2. Share your Google Sheet with this email as "Editor"</div>
            <div className="text-gray-300 text-xs">Open your Google Sheet → Click "Share" → Paste the email → Set as "Editor" → Send</div>
          </div>
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3">
            <div className="text-yellow-400 font-semibold text-sm mb-1">⚠️ Important</div>
            <div className="text-yellow-300 text-xs">Granting Editor access allows AI to read and write data. You can revoke access anytime.</div>
          </div>
        </div>
      ),
      icon: <Lock className="w-6 h-6" />
    },
    {
      id: 'template',
      title: '📋 Get Template',
      description: 'Use our structured template for optimal AI analysis',
      content: (
        <div className="space-y-4">
          <div className="text-center mb-4">
            <button
              onClick={handleTemplateClick}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Open Template
            </button>
            <div className="text-xs text-gray-400 mt-2">Click to open the template in Google Sheets, then make a copy to use for your data</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-white font-semibold text-sm mb-3">📋 Template Structure Rules</div>
            <div className="space-y-3 text-xs text-gray-300">
              <div className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">📋</span>
                <div><strong>Header Row (Row 1)</strong> - First row must contain column headers. Use clear, descriptive names.</div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">🔢</span>
                <div><strong>Data Rows (Row 2+)</strong> - All data starts from row 2. Keep headers in row 1 only.</div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">📊</span>
                <div><strong>Optional Total Row (Row 2)</strong> - You can add a second row above headers for column totals or summaries.</div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">📊</span>
                <div><strong>Consistent Format</strong> - Each column should contain the same type of data throughout.</div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5">🚫</span>
                <div><strong>No Empty Header Rows</strong> - Avoid blank rows between headers and data.</div>
              </div>
            </div>
            <div className="bg-blue-900/20 border border-blue-500/30 rounded p-3 mt-3">
              <div className="text-blue-400 font-semibold text-sm mb-1">💡 Pro Tip</div>
              <div className="text-blue-300 text-xs">Use our template as a starting point and modify the columns to match your data needs. The AI will automatically detect your structure!</div>
            </div>
          </div>
        </div>
      ),
      icon: <FileText className="w-6 h-6" />
    },
    {
      id: 'connect-sheet',
      title: 'Connect Your Google Sheet',
      description: 'Link your spreadsheet for AI analysis',
      content: 'Copy the full URL from your browser\'s address bar when viewing your Google Sheet. Paste it below and we\'ll automatically detect the sheet structure and prepare it for analysis.',
      icon: <FileSpreadsheet className="w-6 h-6" />
    },
    {
      id: 'whatsapp-setup',
      title: '📱 WhatsApp Integration',
      description: 'Connect WhatsApp to interact with your sheets on the go',
      content: (
        <div className="space-y-4">
          <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
            <div className="text-green-400 font-semibold text-sm mb-2">✓ WhatsApp Linked Successfully!</div>
            <div className="text-green-300 text-xs">Your WhatsApp number +27659315189 is now linked to your account.</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-white font-semibold text-sm mb-2">Link WhatsApp</div>
            <div className="text-gray-300 text-xs mb-3">Connect your WhatsApp to interact with your sheets on the go.</div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleWhatsAppManage}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs"
              >
                Manage Spreadsheets
              </button>
              <button
                onClick={handleWhatsAppManage}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs"
              >
                Unlink WhatsApp
              </button>
            </div>
          </div>
        </div>
      ),
      icon: <Phone className="w-6 h-6" />
    },
    {
      id: 'chat-analysis',
      title: 'Chat with Your Data',
      description: 'Ask questions and get AI-powered insights',
      content: 'Use natural language to ask questions like "What are my top-selling products?" or "Show me sales trends". You can request edits, calculations, visualizations, and export results back to your spreadsheet.',
      icon: <MessageSquare className="w-6 h-6" />
    }
  ];

  const step = TUTORIAL_STEPS[currentStep];

  if (!isVisible) return null;

  return (
    <>
      {/* Simple backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={skipTutorial} />

      {/* Simple centered modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white">
                {step.icon || <span className="text-lg font-bold">{currentStep + 1}</span>}
              </div>
              <div>
                <h3 className="text-white font-semibold text-xl">{step.title}</h3>
                <div className="text-sm text-gray-400">
                  Step {currentStep + 1} of {TUTORIAL_STEPS.length}
                </div>
              </div>
            </div>
            <button
              onClick={skipTutorial}
              className="text-gray-400 hover:text-white transition-colors p-2"
              title="Skip tutorial"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            <p className="text-gray-300 text-lg leading-relaxed mb-6">
              {step.description}
            </p>

            <div className="mb-8">
              {typeof step.content === 'string' ? (
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                  <p className="text-gray-200 text-base leading-relaxed">
                    {step.content}
                </p>
              </div>
              ) : (
                step.content
            )}
            </div>

            {/* Progress indicator */}
            <div className="flex items-center gap-2 mb-8">
              {TUTORIAL_STEPS.map((_, index) => (
                <div
                  key={index}
                  className={`h-3 flex-1 rounded-full transition-colors ${
                    index <= currentStep ? 'bg-emerald-500' : 'bg-gray-700'
                  }`}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={prevStep}
                disabled={currentStep === 0}
                className="flex items-center gap-2 px-6 py-3 text-base text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
                Previous
              </button>

              <button
                onClick={skipTutorial}
                className="px-6 py-3 text-base text-gray-500 hover:text-gray-400 transition-colors"
              >
                Skip
              </button>

              <button
                onClick={nextStep}
                className="flex items-center gap-2 px-6 py-3 text-base bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
              >
                {currentStep === TUTORIAL_STEPS.length - 1 ? (
                  <>
                    <Check className="w-5 h-5" />
                    Get Started!
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
