"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic } from 'lucide-react';

// Type definitions for Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface VoiceRecorderProps {
  onTranscriptChange: (transcript: string) => void;
  disabled?: boolean;
  className?: string;
}

export const useVoiceRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [hasSentTranscript, setHasSentTranscript] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const shouldAutoRestartRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedTranscriptRef = useRef(''); // Track accumulated transcript across sessions

  useEffect(() => {
    // Check if speech recognition is supported
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this browser');
      return;
    }

    setIsSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = false; // Single recording session
    recognition.interimResults = false; // Only final results - no interim updates
    recognition.lang = 'en-US';
    
    // Add more robust configuration to reduce errors
    recognition.maxAlternatives = 1; // Only get one alternative to reduce complexity
    
    // Set a reasonable timeout to prevent hanging
    if ('serviceURI' in recognition) {
      // Some browsers support custom service URI for better reliability
      (recognition as any).serviceURI = undefined; // Use default service
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Only process final results since interimResults is false
      let finalTranscript = '';

      // Process all results from this event
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        }
      }

      if (finalTranscript.trim()) {
        console.log('🔊 [VoiceRecorder] Final transcript received:', finalTranscript);
        
        // Add to accumulated transcript
        const newText = finalTranscript.trim();
        const currentAccumulated = accumulatedTranscriptRef.current;
        
        if (currentAccumulated) {
          // Add space between accumulated text and new text
          accumulatedTranscriptRef.current = currentAccumulated + ' ' + newText;
          // Only send the NEW part to prevent double accumulation
          setTranscript(newText);
        } else {
          // First recording
          accumulatedTranscriptRef.current = newText;
          setTranscript(newText);
        }
        
        // Mark that we have a transcript to send
        setHasSentTranscript(true);
        console.log('🔊 [VoiceRecorder] New transcript part:', newText);
        console.log('🔊 [VoiceRecorder] Total accumulated:', accumulatedTranscriptRef.current);
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
      
      // Auto-restart if the user wants continuous recording
      if (shouldAutoRestartRef.current && recognitionRef.current) {
        console.log('🔊 [VoiceRecorder] Auto-restarting recording...');
        setTimeout(() => {
          if (recognitionRef.current) {
            try {
              recognitionRef.current.start();
              setIsRecording(true);
            } catch (error) {
              console.error('Failed to auto-restart recording:', error);
            }
          }
        }, 100);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Only log critical errors, not common ones like "no-speech"
      if (event.error !== 'no-speech') {
        console.warn('Speech recognition error:', event.error);
      }
      
      setIsRecording(false);
      
      // Disable auto-restart on errors
      shouldAutoRestartRef.current = false;
      
      // Handle specific error types silently for common cases
      if (event.error === 'not-allowed') {
        console.warn('Microphone access denied by user');
      } else if (event.error === 'no-speech') {
        // This is a common, non-critical error - just silently handle it
        // No need to log or warn about it
      } else if (event.error === 'network') {
        console.warn('Network error occurred');
      } else if (event.error === 'aborted') {
        // This is also common when stopping manually - no need to warn
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          console.warn('Error stopping recognition on cleanup:', error);
        }
      }
      
      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const startRecording = useCallback(() => {
    if (recognitionRef.current && !isRecording) {
      console.log('🔊 [VoiceRecorder] Starting recording...');
      
      // Enable auto-restart for continuous recording behavior
      shouldAutoRestartRef.current = true;
      
      try {
        // Ensure recognition is stopped before starting again
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore errors from stopping
        }
        
        // Small delay to ensure clean state
        setTimeout(() => {
          if (recognitionRef.current) {
            recognitionRef.current.start();
            setIsRecording(true);
            console.log('🔊 [VoiceRecorder] Recording started successfully');
            
            // Add a timeout to automatically stop if no speech is detected
            // This helps prevent "no-speech" errors and improves UX
            timeoutRef.current = setTimeout(() => {
              if (recognitionRef.current && isRecording) {
                console.log('🔊 [VoiceRecorder] Auto-stopping due to no speech detected');
                try {
                  recognitionRef.current.stop();
                  setIsRecording(false);
                } catch (e) {
                  // Ignore errors from stopping
                }
              }
            }, 10000); // 10 second timeout
          }
        }, 100);
      } catch (error) {
        console.error('Failed to start recording:', error);
        setIsRecording(false);
      }
    }
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current && isRecording) {
      console.log('🔊 [VoiceRecorder] Stopping recording...');
      
      // Disable auto-restart when user manually stops
      shouldAutoRestartRef.current = false;
      
      // Clear the auto-stop timeout if it exists
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      try {
        recognitionRef.current.stop();
        setIsRecording(false);
        
        console.log('🔊 [VoiceRecorder] Recording stopped successfully');
      } catch (error) {
        console.error('Failed to stop recording:', error);
        setIsRecording(false);
      }
    }
  }, [isRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    accumulatedTranscriptRef.current = '';
    setHasSentTranscript(false); // Reset the sent flag
    console.log('🔊 [VoiceRecorder] Transcript cleared');
  }, []);

  const disableAutoRestart = useCallback(() => {
    shouldAutoRestartRef.current = false;
    console.log('🔊 [VoiceRecorder] Auto-restart disabled');
  }, []);

  return {
    isRecording,
    transcript,
    toggleRecording,
    startRecording,
    stopRecording,
    clearTranscript,
    disableAutoRestart,
    isSupported,
    hasSentTranscript,
    accumulatedTranscript: accumulatedTranscriptRef.current
  };
};

export default function VoiceRecorder({ onTranscriptChange, disabled = false, className = '' }: VoiceRecorderProps) {
  const { isRecording, transcript, toggleRecording, isSupported, clearTranscript, hasSentTranscript, accumulatedTranscript } = useVoiceRecorder();

  // Sync transcript with parent component
  useEffect(() => {
    if (transcript) {
      // Only log significant transcript updates to reduce console spam
      if (transcript.length > 10) {
        console.log('🔊 [VoiceRecorder] Sending transcript to parent:', transcript.substring(0, 50) + (transcript.length > 50 ? '...' : ''));
      }
      onTranscriptChange(transcript);
    }
  }, [transcript, onTranscriptChange]);

  if (!isSupported) {
    return (
      <button
        type="button"
        disabled
        className={`p-3 rounded-lg bg-gray-500/20 text-gray-400 cursor-not-allowed ${className}`}
        title="Voice recording not supported in this browser"
      >
        <Mic className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleRecording}
        className={`relative p-3 rounded-lg transition-all duration-200 ${className} ${
          isRecording 
            ? 'bg-red-500/20 border border-red-400/50 text-red-400 shadow-lg shadow-red-500/25' 
            : 'bg-white/10 hover:bg-white/20 text-white'
        }`}
        disabled={disabled}
        title={isRecording ? 'Stop recording' : 'Start voice recording'}
      >
        <Mic className={`w-5 h-5 ${isRecording ? 'animate-pulse' : ''}`} />
        {isRecording && (
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-400 rounded-full animate-ping"></div>
        )}
      </button>
    </div>
  );
}