"use client";
import React, { useState, useRef, useEffect } from "react";

// Types for SpeechRecognition
interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface MinimalSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: (event: MinimalSpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  onstart?: () => void;
}

interface SpeechRecognitionResult {
  length: number;
  isFinal: boolean;
  [index: number]: { 
    transcript: string;
    confidence: number;
  };
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface MinimalSpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

// TypeScript: Add SpeechRecognition types if missing (for browser compatibility)
declare global {
  interface Window {
    webkitSpeechRecognition?: {
      new (): MinimalSpeechRecognition;
    };
    SpeechRecognition?: {
      new (): MinimalSpeechRecognition;
    };
  }
  var SpeechRecognition: unknown;
  var webkitSpeechRecognition: unknown;
}

interface VoiceRecorderProps {
  onTranscriptChange: (transcript: string) => void;
  onInterimTextChange: (interimText: string) => void;
  onListeningChange: (listening: boolean) => void;
  onTranscriptComplete: (transcript: string) => void;
  listening: boolean;
  transcript: string;
  interimText: string;
}

function playBeep() {
  if (typeof window === 'undefined') return;
  try {
    const ctx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    )();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.18);
    o.onended = () => ctx.close();
  } catch {}
}

export default function VoiceRecorder({
  onTranscriptChange,
  onInterimTextChange,
  onListeningChange,
  onTranscriptComplete,
  listening,
  transcript,
  interimText
}: VoiceRecorderProps) {
  const [paused, setPaused] = useState(false);
  const listeningRef = useRef(listening);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);
  const interimTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  const startListening = (clearTranscript = true) => {
    if (typeof window === "undefined") return;
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      alert("Speech recognition not supported in this browser.");
      return;
    }
    
    console.log('SpeechRecognition class found:', SpeechRecognitionClass);
    
    // Play beep when starting to record
    playBeep();
    // Create a new instance every time
    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: MinimalSpeechRecognitionEvent) => {
      console.log('Speech recognition result received:', event);
      
      let interimTranscript = '';
      let finalTranscript = '';

      // Process only the newest results to avoid duplication
      // Get the latest result only
      const latestResultIndex = event.results.length - 1;
      const latestResult = event.results[latestResultIndex];
      
      if (latestResult.isFinal) {
        finalTranscript = latestResult[0].transcript;
        console.log('Final result:', finalTranscript);
      } else {
        interimTranscript = latestResult[0].transcript;
        console.log('Interim result:', interimTranscript);
      }

      // Update transcript immediately to test if it works at all
      if (finalTranscript) {
        console.log('Setting final transcript:', finalTranscript);
        onTranscriptChange(transcript + finalTranscript + ' ');
        onInterimTextChange('');
      }
      
      if (interimTranscript) {
        console.log('Setting interim transcript:', interimTranscript);
        onInterimTextChange(interimTranscript);
      }
    };
    recognition.onstart = () => {
      console.log('Speech recognition started successfully!');
    };
    
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      onListeningChange(false);
    };
    recognition.onend = () => {
      if (listeningRef.current && !paused) {
        try {
          recognition.start();
        } catch {
          // ignore
        }
      } else {
        onListeningChange(false);
      }
    };
    recognitionRef.current = recognition;
    if (clearTranscript) {
      onTranscriptChange("");
      onInterimTextChange("");
    }
    onListeningChange(true);
    setPaused(false);
    console.log('Starting speech recognition...');
    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = () => {}; // Prevent auto-restart
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    // Clear any pending interim updates
    if (interimTimeoutRef.current) {
      clearTimeout(interimTimeoutRef.current);
      interimTimeoutRef.current = null;
    }
    onListeningChange(false);
    onInterimTextChange(""); // Clear interim text when stopping
  };

  const pauseListening = () => {
    setPaused(true);
    onInterimTextChange(""); // Clear interim text when pausing
    stopListening();
  };

  const resumeListening = () => {
    setPaused(false);
    startListening(false); // Do not clear transcript
  };

  // Enhanced mic button handler with text integration
  const handleMicButton = () => {
    if (listening && !paused) {
      // Stop listening and add transcript to text input for editing
      pauseListening();
      // Small delay to ensure transcript is captured
      setTimeout(() => {
        if (transcript.trim()) {
          // Add voice transcript to the text input so user can edit/add context
          onTranscriptComplete(transcript);
          onTranscriptChange(""); // Clear the voice transcript display
        }
      }, 500);
    } else if (paused) {
      resumeListening();
    } else {
      startListening(); // New recording, clear transcript
    }
  };

  return (
    <div className="w-full flex flex-col items-center gap-4 mt-4">
      {/* Voice Input Button - Enhanced for mobile */}
      <div className="relative p-6 sm:p-8">
        <button
          onClick={handleMicButton}
          className={`relative h-28 w-28 sm:h-32 sm:w-32 rounded-full flex items-center justify-center transition-all duration-500
                    transform hover:scale-105 active:scale-95 group overflow-hidden
                    ${listening 
                      ? 'bg-gradient-to-br from-red-500 via-pink-500 to-red-600 shadow-2xl shadow-red-500/50' 
                      : 'bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 shadow-2xl shadow-blue-500/30 animate-gradient-x'}
                    before:absolute before:inset-0 before:rounded-full before:p-[3px]
                    ${listening 
                      ? 'before:bg-gradient-to-br before:from-red-400 before:via-pink-400 before:to-red-500 before:animate-pulse' 
                      : 'before:bg-gradient-to-r before:from-yellow-300 before:via-pink-300 before:to-blue-300 before:animate-gradient-x'}`}
        >
          {/* Animated gradient border effect */}
          <div className={`absolute inset-[3px] rounded-full transition-all duration-500
                         ${listening 
                           ? 'bg-gradient-to-br from-red-500 via-pink-500 to-red-600' 
                           : 'bg-gradient-to-r from-yellow-300 via-pink-300 to-blue-300 animate-gradient-x'}`} />
          
          {/* Inner button content */}
          <div className="relative z-10 w-full h-full rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
            <svg 
              className={`w-14 h-14 sm:w-16 sm:h-16 text-white transition-all duration-300 drop-shadow-lg
                        ${listening ? 'animate-pulse' : 'group-hover:scale-110'}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2.5} 
                d={listening 
                  ? "M6 6l12 12M6 18L18 6"
                  : "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"} 
              />
            </svg>
          </div>
          
          {/* Animated pulse rings */}
          {listening && (
            <>
              <div className="absolute inset-0 rounded-full border-4 border-yellow-300/50 animate-ping" />
              <div className="absolute inset-0 rounded-full border-4 border-pink-300/50 animate-ping animation-delay-300" />
              <div className="absolute inset-0 rounded-full border-4 border-blue-300/50 animate-ping animation-delay-700" />
            </>
          )}
        </button>
      </div>

      {/* Voice instruction text */}
      <div className="text-center mb-2">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {listening ? "🎤 Speak your message..." : ""}
        </p>
      </div>
    </div>
  );
} 