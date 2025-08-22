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
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const shouldAutoRestartRef = useRef(false);

  useEffect(() => {
    // Check if speech recognition is supported
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this browser');
      return;
    }

    setIsSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = false; // Changed to false for more predictable behavior
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // With non-continuous recognition, we get the complete transcript in one event
      let finalTranscript = '';
      let interimTranscript = '';

      // Process all results from this event
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      console.log('🔊 [VoiceRecorder] onresult event:', {
        resultIndex: event.resultIndex,
        resultsLength: event.results.length,
        finalTranscript,
        interimTranscript
      });

      // For non-continuous recognition, we can simply use the final transcript
      if (finalTranscript) {
        finalTranscriptRef.current = finalTranscript;
      }
      
      // Update interim transcript
      interimTranscriptRef.current = interimTranscript;

      // Combine final and interim transcript
      const combinedTranscript = finalTranscriptRef.current + (interimTranscript ? ' ' + interimTranscript : '');
      
      console.log('🔊 [VoiceRecorder] Combined transcript:', {
        final: finalTranscriptRef.current,
        interim: interimTranscriptRef.current,
        combined: combinedTranscript
      });
      
      // Set the transcript immediately since we're not continuous
      if (combinedTranscript.trim()) {
        // Prevent extremely long transcripts (e.g., > 1000 characters)
        if (combinedTranscript.length > 1000) {
          console.warn('🔊 [VoiceRecorder] Transcript too long, stopping recording');
          shouldAutoRestartRef.current = false;
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
          // Truncate the transcript
          const truncatedTranscript = combinedTranscript.substring(0, 1000) + '...';
          setTranscript(truncatedTranscript);
        } else {
          setTranscript(combinedTranscript);
        }
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
      // Clear interim transcript when recording ends
      interimTranscriptRef.current = '';
      
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
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
      
      // Disable auto-restart on errors
      shouldAutoRestartRef.current = false;
      
      // Clear all transcript state on error
      setTranscript('');
      finalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
      
      // Handle specific error types
      if (event.error === 'not-allowed') {
        console.warn('Microphone access denied by user');
      } else if (event.error === 'no-speech') {
        console.warn('No speech detected');
      } else if (event.error === 'network') {
        console.warn('Network error occurred');
      } else if (event.error === 'aborted') {
        console.warn('Speech recognition was aborted');
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
    };
  }, []);

  const startRecording = useCallback(() => {
    if (recognitionRef.current && !isRecording) {
      console.log('🔊 [VoiceRecorder] Starting recording...');
      
      // Reset all transcript state and refs
      setTranscript('');
      finalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
      
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
      
      try {
        recognitionRef.current.stop();
        setIsRecording(false);
        
        // Clear interim transcript when stopping
        interimTranscriptRef.current = '';
        
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
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
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
    isSupported
  };
};

export default function VoiceRecorder({ onTranscriptChange, disabled = false, className = '' }: VoiceRecorderProps) {
  const { isRecording, transcript, toggleRecording, isSupported } = useVoiceRecorder();

  // Sync transcript with parent component
  useEffect(() => {
    if (transcript) {
      console.log('🔊 [VoiceRecorder] Sending transcript to parent:', transcript);
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
  );
}