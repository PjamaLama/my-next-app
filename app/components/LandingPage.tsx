"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Feather, Zap, BarChart, PieChart, Table, Loader2, FileText, Mic, Upload, Send, Paperclip, Square } from 'lucide-react';
import { User } from 'firebase/auth';
import SpaceBackground from './SpaceBackground';
import { trackCombinedViewContent, trackLead, createUserData } from '../../lib/metaConversionsAPI';
import { trackTikTokViewContent } from '../../lib/tiktokPixel';
import { DemoInputManager } from '../../lib/demoInputManager';
import VoiceRecorder from './VoiceRecorder';
import { arrayBufferToBase64, extractImageText, extractPDFText, validateFileForUpload, type UploadedFile } from '../../lib/utils/chatFileUtils';
import { handleHashNavigation, setupHashNavigation, setupScrollBasedHashUpdate } from '../../lib/utils/smoothScroll';
import SiteLinks, { GoogleAdsSiteLinks } from './SiteLinks';

interface LandingPageProps {
  onSignIn: () => Promise<void>;
  user: User | null;
}

export default function LandingPage({ onSignIn, user }: LandingPageProps) {
  const [message, setMessage] = useState('');
  const [showFreeConversionPrompt, setShowFreeConversionPrompt] = useState(false);

  // Demo functionality state
  const [demoInput, setDemoInput] = useState('');
  const [isDemoProcessing, setIsDemoProcessing] = useState(false);
  const [demoResults, setDemoResults] = useState<any>(null);
  const [showDemoResults, setShowDemoResults] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  // File upload state for demo
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Demo protection state
  const [lastRequestTime, setLastRequestTime] = useState<number>(0);
  const [requestCount, setRequestCount] = useState<number>(0);

  // Generate secure session ID for demo tracking
  const generateSecureSessionId = (): string => {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const combined = `${timestamp}_${randomString}_${navigator.userAgent.slice(0, 10)}`;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `demo_${Math.abs(hash).toString(36).substring(0, 16)}`;
  };

  // Client-side rate limiting
  const checkClientRateLimit = (): boolean => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;

    // Reset counter if more than 5 minutes have passed
    if (timeSinceLastRequest > 5 * 60 * 1000) {
      setRequestCount(0);
    }

    // Allow max 5 requests per 5 minutes
    if (requestCount >= 5 && timeSinceLastRequest < 5 * 60 * 1000) {
      return false;
    }

    // Minimum 3 seconds between requests
    if (timeSinceLastRequest < 3000) {
      return false;
    }

    return true;
  };

  // Update rate limiting state
  const updateRateLimit = () => {
    setLastRequestTime(Date.now());
    setRequestCount(prev => prev + 1);
  };

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

      // Also track to TikTok pixel
      trackTikTokViewContent('sheetyai_pro_monthly');
    };

    trackViewContent();
  }, []);

  // Set up smooth scrolling for site links
  useEffect(() => {
    // Handle initial hash navigation on page load
    handleHashNavigation();

    // Set up hash change listener for browser navigation
    setupHashNavigation();

    // Set up automatic hash updates when scrolling
    setupScrollBasedHashUpdate();

    // Cleanup on unmount
    return () => {
      window.removeEventListener('hashchange', () => {});
      window.removeEventListener('scroll', () => {});
    };
  }, []);


  const handleFreeConversionFirst = () => {
    setShowFreeConversionPrompt(true);
  };

  // Demo processing functions
  const processDemoText = async () => {
    if (!demoInput.trim()) return;

    // Client-side rate limiting check
    if (!checkClientRateLimit()) {
      setDemoError('Please wait a moment before trying again.');
      return;
    }

    setIsDemoProcessing(true);
    setDemoError(null);

    try {
      // Generate secure session ID
      const secureUserId = generateSecureSessionId();
      updateRateLimit();

      // Call the real Gemini demo API
      const response = await fetch('/api/demo-genkit-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: demoInput,
          isDemoRequest: true,
          userId: secureUserId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();

        // Handle rate limiting
        if (response.status === 429) {
          if (errorData.retryAfter) {
            setDemoError(`Too many requests. Please wait ${errorData.retryAfter} seconds.`);
          } else if (errorData.nextReset) {
            setDemoError(`Demo limit reached. Next reset: ${errorData.nextReset}`);
          } else {
            setDemoError('Demo limit reached. Sign up for unlimited access!');
          }
        } else {
          throw new Error(errorData.error || 'Failed to process demo');
        }
        return;
      }

      const results = await response.json();

      setDemoResults(results);
      setShowDemoResults(true);

      // Store demo input for later use after sign-in
      DemoInputManager.saveDemoInput({
        type: 'text',
        content: demoInput,
        timestamp: Date.now(),
        results
      });

    } catch (error: any) {
      console.error('Demo processing error:', error);

      // Handle specific demo limit error
      if (error.message.includes('Demo limit reached')) {
        setDemoError('You\'ve used all 3 free demo requests today. Sign up for unlimited access!');
      } else if (error.message.includes('Too many requests')) {
        setDemoError('Please wait a moment before trying again.');
      } else {
        setDemoError('Failed to process demo. Please try again.');
      }
    } finally {
      setIsDemoProcessing(false);
    }
  };


  const processDemoVoice = async () => {
    setIsDemoProcessing(true);
    setDemoError(null);

    try {
      const transcript = demoInput.trim() || 'Add these items to my project list: website redesign, mobile app development, database optimization';

      const response = await fetch('/api/demo-genkit-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Voice transcript: "${transcript}" - Convert this spoken data into a structured spreadsheet`,
          isDemoRequest: true,
          userId: `landing_page_voice_${Date.now()}`
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process demo voice');
      }

      const results = await response.json();

      setDemoResults(results);
      setShowDemoResults(true);

      // Store demo input for later use after sign-in
      DemoInputManager.saveDemoInput({
        type: 'voice',
        content: transcript,
        timestamp: Date.now(),
        results
      });

    } catch (error: any) {
      console.error('Demo voice processing error:', error);

      if (error.message.includes('Demo limit reached')) {
        setDemoError('You\'ve used all 3 free demo requests today. Sign up for unlimited access!');
      } else {
        setDemoError('Failed to process demo voice. Please try again.');
      }
    } finally {
      setIsDemoProcessing(false);
    }
  };

  const closeDemoResults = () => {
    setShowDemoResults(false);
    setDemoResults(null);
    setDemoError(null);
  };

  // Handle voice transcript changes
  const handleTranscriptChange = useCallback((transcript: string) => {
    if (transcript && transcript.trim()) {
      setDemoInput(prev => {
        const currentText = prev.trim();
        const newText = transcript.trim();

        // If current input is empty, set the transcript directly
        if (!currentText) {
          return newText;
        }

        // Otherwise, append the new transcript to existing content
        return currentText + ' ' + newText;
      });
    }
  }, []); // Empty dependency array since we only use setDemoInput

  // Process file for demo (similar to ChatInterface but creates demo results)
  const processDemoFileForUpload = useCallback(async (file: File): Promise<UploadedFile> => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const uploadedFile: UploadedFile = {
      id,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      status: 'uploading',
      extractedData: {
        type: 'metadata',
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type
      }
    };

    try {
      uploadedFile.status = 'processing';

      if (file.type === 'text/csv') {
        try {
          const text = await file.text();
          const lines = text.split('\n').filter(line => line.trim());
          if (lines.length > 0) {
            const headers = lines[0].split(',').map(h => h.trim());
            const rows = lines.slice(1).map(line =>
              line.split(',').map(cell => cell.trim())
            );
            const sampleRows = rows.slice(0, 5);
            uploadedFile.extractedData = {
              type: 'structured',
              format: 'csv',
              fileName: file.name,
              fileSize: file.size,
              headers,
              rows,
              rowCount: rows.length,
              columnCount: headers.length,
              sampleRows,
              hasData: rows.length > 0,
              extractedText: `CSV with ${rows.length} rows and ${headers.length} columns. Headers: ${headers.join(', ')}. Sample data: ${sampleRows.slice(0, 2).map(row => row.slice(0, 3).join(', ')).join('; ')}`,
              textLength: text.length,
              preview: {
                headers: headers.slice(0, 5),
                sampleData: sampleRows.slice(0, 3)
              }
            };
          }
        } catch (error) {
          console.warn('CSV parsing failed:', error);
          uploadedFile.extractedData = {
            type: 'error',
            format: 'csv',
            fileName: file.name,
            fileSize: file.size,
            error: 'Failed to parse CSV file'
          };
        }
      } else if (file.type === 'application/pdf') {
        try {
          // For demo, we'll use a simpler approach than the full PDF processing
          uploadedFile.extractedData = {
            type: 'document',
            format: 'pdf',
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            extractedText: `PDF document: ${file.name} - Contains ${Math.floor(file.size / 1000)}KB of content`,
            textLength: Math.floor(file.size / 10), // Rough estimate
            hasTextContent: true,
            needsBackendProcessing: false, // For demo, we don't need backend processing
            pageCount: Math.max(1, Math.floor(file.size / 50000)), // Rough page estimate
            isScannedDocument: false,
            note: 'PDF ready for demo processing'
          };
        } catch (error) {
          console.warn('PDF processing failed:', error);
          uploadedFile.extractedData = {
            type: 'document',
            format: 'pdf',
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            extractedText: `PDF document: ${file.name} - Processing failed`,
            textLength: 0,
            hasTextContent: false,
            needsBackendProcessing: false,
            pageCount: 0,
            isScannedDocument: false,
            error: 'Failed to process PDF'
          };
        }
      } else if (file.type.startsWith('image/')) {
        try {
          // For demo, we'll use a simpler approach than full OCR
          uploadedFile.extractedData = {
            type: 'image',
            format: file.type.split('/')[1],
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            extractedText: `Image: ${file.name} (${file.type}) - Contains visual data ready for analysis`,
            textLength: 100, // Rough estimate
            hasTextContent: false,
            needsBackendProcessing: false, // For demo, we don't need backend processing
            note: 'Image ready for demo analysis'
          };
        } catch (error) {
          console.warn('Image processing failed:', error);
          uploadedFile.extractedData = {
            type: 'image',
            format: file.type.split('/')[1] || 'unknown',
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            extractedText: `Image: ${file.name} - Processing failed`,
            textLength: 0,
            hasTextContent: false,
            needsBackendProcessing: false,
            error: 'Failed to process image'
          };
        }
      } else if (file.type.includes('spreadsheet') || file.name.toLowerCase().includes('.xls')) {
        uploadedFile.extractedData = {
          type: 'spreadsheet',
          format: file.type.includes('openxmlformats') ? 'xlsx' : 'xls',
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          extractedText: `Excel spreadsheet: ${file.name}`,
          textLength: file.name.length,
          hasData: true,
          needsBackendProcessing: false, // For demo, we don't need backend processing
          note: 'Spreadsheet ready for demo processing'
        };
      } else {
        // Generic file type
        uploadedFile.extractedData = {
          type: 'document',
          format: 'unknown',
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          extractedText: `File: ${file.name} (${file.type}) - ${Math.floor(file.size / 1000)}KB`,
          textLength: Math.floor(file.size / 10),
          hasTextContent: false,
          needsBackendProcessing: false,
          note: 'File ready for demo processing'
        };
      }

      uploadedFile.status = 'completed';
      return uploadedFile;
    } catch (error) {
      console.warn('File processing failed:', error);
      uploadedFile.status = 'error';
      uploadedFile.error = error instanceof Error ? error.message : 'Failed to process file';
      return uploadedFile;
    }
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback((files: FileList) => {
    const fileArray = Array.from(files);
    if (fileArray.length > 0) {
      // For demo, just process the first file
      const file = fileArray[0];

      // Validate file before processing (using Free tier limits for demo)
      const validation = validateFileForUpload(file, 'free');
      if (!validation.valid) {
        setDemoError(validation.error || 'Invalid file');
        return;
      }

      // Process the file and then send to demo API
      processDemoFileForUpload(file).then(async (processedFile) => {
        setUploadedFiles([processedFile]);

        // Now process with the actual file data
        setIsDemoProcessing(true);
        setDemoError(null);

        try {
          const extractedData = processedFile.extractedData;

          // Create message based on actual processed file data
          let message = '';
          if (extractedData.type === 'structured' && extractedData.format === 'csv') {
            const headers = extractedData.headers || [];
            const sampleRows = extractedData.sampleRows || [];
            message = `Convert this CSV data to spreadsheet: Headers are ${headers.join(', ')}. Sample rows: ${sampleRows.slice(0, 2).map((row: string[]) => row.join(' | ')).join(' ; ')}`;
          } else if (extractedData.type === 'document') {
            message = `Process this document "${file.name}" and extract structured data from: ${extractedData.extractedText}`;
          } else if (extractedData.type === 'image') {
            message = `Analyze this image "${file.name}" and extract any tabular data or text that can be converted to spreadsheet format`;
          } else {
            message = `Process this file "${file.name}" and convert its content to spreadsheet format`;
          }

          const response = await fetch('/api/demo-genkit-chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message,
              isDemoRequest: true,
              userId: generateSecureSessionId()
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to process demo file');
          }

          const results = await response.json();

          setDemoResults(results);
          setShowDemoResults(true);

          // Store demo input for later use after sign-in
          DemoInputManager.saveDemoInput({
            type: 'file',
            content: message,
            fileName: file.name,
            fileType: file.type,
            timestamp: Date.now(),
            results
          });

          // Clear uploaded files after processing
          setUploadedFiles([]);

        } catch (error: any) {
          console.error('Demo file processing error:', error);

          if (error.message.includes('Demo limit reached')) {
            setDemoError('You\'ve used all 3 free demo requests today. Sign up for unlimited access!');
          } else {
            setDemoError('Failed to process demo file. Please try again.');
          }
        } finally {
          setIsDemoProcessing(false);
        }
      }).catch((error) => {
        console.error('File processing error:', error);
        setDemoError('Failed to process uploaded file');
      });
    }
  }, [processDemoFileForUpload]);

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
          transition={{ duration: 0.3 }}
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
            transition={{ duration: 0.3, delay: 0.1 }}
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
              id="try-demo"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="max-w-5xl mx-auto mb-12 px-4 sm:px-0"
            >
              <div className="bg-black/30 backdrop-blur-md border border-white/20 rounded-2xl p-4 shadow-2xl shadow-black/50 animate-pulse-slow relative overflow-hidden">
                {/* Shimmer effect overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer-landing pointer-events-none rounded-2xl"></div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-white">Try It Now</h3>
                  <div className="text-xs text-white/70 bg-emerald-500/20 px-2 py-1 rounded-full">
                    🎁 3 Free Demos
                  </div>
                </div>

                {/* Quick Reply Buttons */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    onClick={() => setDemoInput("Sales data:\nJohn - $500 laptop\nJane - $750 phone\nBob - $300 tablet")}
                    disabled={isDemoProcessing}
                    className="px-3 py-2 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-full border border-blue-500/30 hover:border-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    💰 Sales
                  </button>
                  <button
                    onClick={() => setDemoInput("Project tasks:\nDesign website - High\nImplement auth - Medium\nWrite docs - Low")}
                    disabled={isDemoProcessing}
                    className="px-3 py-2 text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-full border border-purple-500/30 hover:border-purple-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    📋 Tasks
                  </button>
                  <button
                    onClick={() => setDemoInput("Expenses:\nCoffee shop - $45\nTaxi ride - $25\nOffice supplies - $90")}
                    disabled={isDemoProcessing}
                    className="px-3 py-2 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-full border border-emerald-500/30 hover:border-emerald-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    💸 Expenses
                  </button>
                </div>

                {/* WhatsApp-style Chat Input */}
                <div className="bg-black/30 backdrop-blur-md border border-white/20 rounded-2xl p-4 shadow-2xl shadow-black/50">
                  {/* File preview if uploaded */}
                  {uploadedFiles.length > 0 && (
                    <div className="mb-3 p-2 bg-white/10 rounded-lg flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm text-white/80">{uploadedFiles[0].name}</span>
                      <button
                        onClick={() => setUploadedFiles([])}
                        className="ml-auto text-white/60 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Input area */}
                  <div className="flex items-end gap-2">
                    {/* Attachment buttons */}
                    <div className="flex gap-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
                        className="hidden"
                        disabled={isDemoProcessing}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isDemoProcessing}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all flex items-center justify-center disabled:opacity-50"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>

                      <VoiceRecorder
                        onTranscriptChange={handleTranscriptChange}
                        disabled={isDemoProcessing}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all flex items-center justify-center disabled:opacity-50"
                      />
                    </div>

                    {/* Text input */}
                    <div className="flex-1">
                      <textarea
                        value={demoInput}
                        onChange={(e) => setDemoInput(e.target.value)}
                        placeholder="Type your data or try a quick reply above..."
                        className="w-full bg-transparent text-white placeholder-white/50 focus:outline-none resize-none text-sm py-3 px-2"
                        rows={3}
                        disabled={isDemoProcessing}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (demoInput.trim() || uploadedFiles.length > 0) {
                              if (demoInput.trim()) {
                                processDemoText();
                              } else {
                                // File is already processed, just send to demo API
                                const file = uploadedFiles[0];
                                const extractedData = file.extractedData;
                                let message = `Process this ${file.mimeType} file: ${file.name}`;

                                // Send the file data to demo API
                                fetch('/api/demo-genkit-chat', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    message,
                                    isDemoRequest: true,
                                    userId: generateSecureSessionId()
                                  }),
                                }).then(async (response) => {
                                  if (!response.ok) {
                                    const errorData = await response.json();
                                    throw new Error(errorData.error || 'Failed to process demo file');
                                  }
                                  const results = await response.json();
                                  setDemoResults(results);
                                  setShowDemoResults(true);
                                  setUploadedFiles([]); // Clear after processing
                                }).catch((error) => {
                                  console.error('Demo file processing error:', error);
                                  setDemoError('Failed to process demo file. Please try again.');
                                });
                              }
                            }
                          }
                        }}
                      />
                    </div>

                    {/* Send button */}
                    <button
                      onClick={() => {
                        if (demoInput.trim()) {
                          processDemoText();
                        } else if (uploadedFiles.length > 0) {
                          // File is already processed, just send to demo API
                          const file = uploadedFiles[0];
                          const extractedData = file.extractedData;
                          let message = `Process this ${file.mimeType} file: ${file.name}`;

                          // Send the file data to demo API
                          fetch('/api/demo-genkit-chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              message,
                              isDemoRequest: true,
                              userId: generateSecureSessionId()
                            }),
                          }).then(async (response) => {
                            if (!response.ok) {
                              const errorData = await response.json();
                              throw new Error(errorData.error || 'Failed to process demo file');
                            }
                            const results = await response.json();
                            setDemoResults(results);
                            setShowDemoResults(true);
                            setUploadedFiles([]); // Clear after processing
                          }).catch((error) => {
                            console.error('Demo file processing error:', error);
                            setDemoError('Failed to process demo file. Please try again.');
                          });
                        } else {
                          // No input, show error
                          setDemoError('Please enter text or upload a file first');
                        }
                      }}
                      disabled={isDemoProcessing || (!demoInput.trim() && uploadedFiles.length === 0)}
                      className={`w-10 h-10 rounded-full transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2 shadow-lg hover:shadow-xl ${
                        isDemoProcessing
                          ? 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-500'
                          : 'bg-emerald-500 hover:bg-emerald-600 text-white focus:ring-emerald-500'
                      } ${
                        (!demoInput.trim() && uploadedFiles.length === 0)
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:scale-105 cursor-pointer active:scale-95'
                      }`}
                      aria-label={
                        isDemoProcessing
                          ? "Processing demo request"
                          : "Send demo request"
                      }
                    >
                      {isDemoProcessing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {demoError && (
                  <div className="mt-3 text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                    {demoError}
                    {demoError.includes('demo requests') && (
                      <div className="mt-2">
                        <button
                          onClick={handleSignIn}
                          className="text-emerald-400 hover:text-emerald-300 underline text-xs"
                        >
                          Sign up for unlimited access →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="mb-16"
          >
            {user ? (
              <p className="text-xl text-white/70">Welcome back! You are signed in and ready to use SheetyAI.</p>
            ) : (
              <div className="text-center">
                {/* Main CTA Button */}
                <motion.button
                  onClick={handleSignIn}
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

          {/* Site Links for Google Ads */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.25 }}
            className="mt-12"
          >
            <SiteLinks />
          </motion.div>

          {/* Google Ads Site Links (hidden for structured data) */}
          <GoogleAdsSiteLinks />

          {/* Multi-Input Types Showcase */}
          <motion.div
            id="input-types"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
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
            id="features"
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
            id="demo"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
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
                loading="eager"
              />
            </div>
          </motion.div>

          {/* Pricing Tiers Section */}
          <motion.div
            id="pricing"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
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
                  <div className="text-4xl font-bold text-purple-400 mb-2">$19.97</div>
                  <h4 className="text-xl font-bold text-white mb-1">Unlimited Access</h4>
                  <p className="text-purple-300 text-sm mb-4">per month</p>
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
            id="process"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
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
                    transition={{ duration: 0.3, delay: 0.2 }}
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
                    transition={{ duration: 0.3, delay: 0.3 }}
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
                    transition={{ duration: 0.3, delay: 0.4 }}
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
              transition={{ duration: 0.3, delay: 0.5 }}
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
              transition={{ duration: 0.3, delay: 0.6 }}
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
                onClick={handleSignIn}
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

        {/* Demo Results Modal */}
        <AnimatePresence>
          {showDemoResults && demoResults && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={closeDemoResults}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-gray-900 rounded-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto relative border border-white/10 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-400/30 rounded-full flex items-center justify-center">
                        <Table className="w-6 h-6 text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">Demo Results</h3>
                        <p className="text-gray-400 text-sm">Here's how your data would look in a spreadsheet</p>
                      </div>
                    </div>
                    <button
                      onClick={closeDemoResults}
                      className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-6">
                    {/* AI Reasoning */}
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                      <h4 className="text-blue-300 font-semibold mb-2">🤖 AI Analysis</h4>
                      <p className="text-gray-300 text-sm">{demoResults.reasoning}</p>
                    </div>

                    {/* Data Table */}
                    {demoResults.tables && demoResults.tables.length > 0 && (
                      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                        <h4 className="text-white font-semibold mb-3">{demoResults.tables[0].title}</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-white/20">
                                {demoResults.tables[0].headers.map((header: string, index: number) => (
                                  <th key={index} className="text-left text-white/80 font-medium py-2 px-3">
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {demoResults.tables[0].rows.slice(0, 5).map((row: string[], rowIndex: number) => (
                                <tr key={rowIndex} className="border-b border-white/10">
                                  {row.map((cell: string, cellIndex: number) => (
                                    <td key={cellIndex} className="py-2 px-3 text-gray-300">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {demoResults.tables[0].rows.length > 5 && (
                            <p className="text-gray-500 text-xs mt-2 text-center">
                              ... and {demoResults.tables[0].rows.length - 5} more rows
                            </p>
                          )}
                        </div>
                        <p className="text-gray-400 text-xs mt-3">{demoResults.tables[0].summary}</p>
                      </div>
                    )}

                    {/* Insights */}
                    {demoResults.insights && demoResults.insights.length > 0 && (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                        <h4 className="text-emerald-300 font-semibold mb-3">💡 Key Insights</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {demoResults.insights.map((insight: string, index: number) => (
                            <div key={index} className="text-gray-300 text-sm flex items-center gap-2">
                              <span className="text-emerald-400">•</span>
                              {insight}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Call to Action */}
                    <div className="bg-gradient-to-r from-emerald-500/15 to-blue-500/15 border-2 border-emerald-500/30 rounded-lg p-5 shadow-lg">
                      <h4 className="text-white font-bold mb-3 text-lg">🚀 Ready to connect your sheet?</h4>
                      <p className="text-gray-300 text-sm mb-5 leading-relaxed">
                        Login with Google and connect your Sheets account to unlock unlimited AI processing and real-time data conversion.
                      </p>
                      <div className="space-y-3">
                        <button
                          onClick={handleSignIn}
                          className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 shadow-xl hover:shadow-emerald-500/50 border-2 border-emerald-400/50 text-base"
                        >
                          🔐 Login & Connect Google Sheets
                        </button>
                        <div className="bg-emerald-500/10 border border-emerald-400/20 rounded-lg p-3">
                          <p className="text-xs text-emerald-200 text-center leading-relaxed">
                            ✨ Unlimited AI processing • 📊 Auto-save to Sheets • 🎤 Voice commands • 📁 File uploads
                          </p>
                        </div>
                      </div>
                    </div>
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
