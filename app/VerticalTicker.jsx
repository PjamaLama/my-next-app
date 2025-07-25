import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';

/**
 * VerticalTicker - Live transcript/ticker component that's also editable
 *
 * Props:
 *   transcript: string (updates live from voice)
 *   onChange: function (called when user types)
 *   onKeyDown: function (called on key events)
 *   placeholder: string
 *   disabled: boolean
 *   isRecording: boolean (to trigger border animation)
 */
export default function VerticalTicker({ transcript, onChange, onKeyDown, placeholder = "Type or speak your message...", disabled = false, isRecording = false }) {
  const containerRef = useRef(null);
  const textareaRef = useRef(null);
  const [displayed, setDisplayed] = useState('');
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  // Track which words are new for pulsing
  const [newWordIndices, setNewWordIndices] = useState([]);
  const [prevWordCount, setPrevWordCount] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Animate in new transcript as it grows
  useEffect(() => {
    if (transcript !== displayed) {
      const oldWords = displayed.split(/(\s+)/);
      const newWords = transcript.split(/(\s+)/);
      // Only pulse words that are truly new (not re-pulsing all after a batch)
      let indices = [];
      if (newWords.length > oldWords.length) {
        for (let i = oldWords.length; i < newWords.length; i++) {
          if (newWords[i].trim() !== '') indices.push(i);
        }
        setIsAnimating(true);
      }
      setNewWordIndices(indices);
      setDisplayed(transcript);
      setPrevWordCount(newWords.length);
      if (indices.length > 0) {
        setTimeout(() => {
          setNewWordIndices([]);
          setTimeout(() => setIsAnimating(false), 300);
        }, 900);
      }
    }
  }, [transcript]);

  // Auto-scroll to end as text grows
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [displayed]);

  // Detect overflow
  useEffect(() => {
    if (containerRef.current && textareaRef.current) {
      const container = containerRef.current;
      const textarea = textareaRef.current;
      setIsOverflowing(textarea.scrollHeight > container.clientHeight);
    }
  }, [displayed]);

  // Split transcript into lines
  const lines = displayed.split('\n');
  const wrapperRef = useRef(null);

  // Handle input changes
  const handleChange = (e) => {
    const value = e.target.value;
    setDisplayed(value);
    if (onChange) {
      onChange(e);
    }
  };

  // Handle key events
  const handleKeyDown = (e) => {
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [displayed]);

  return (
    <div className="relative w-full mx-auto px-2 py-1">
      {/* Outer wrapper to contain the border animation */}
      <div className="absolute inset-0 w-full h-full">
        {/* Recording border container - positioned absolutely with precise spacing */}
        {isRecording && (
          <div 
            className="absolute z-50 rounded-2xl recording-border-animation pointer-events-none"
            style={{ 
              top: '-2px', 
              left: '-2px', 
              right: '-2px', 
              bottom: '-2px',
              width: 'calc(100% + 4px)',
              height: 'calc(100% + 4px)'
            }}
          ></div>
        )}
      </div>
    
      <div 
        ref={containerRef}
        className={`relative h-32 max-h-40 w-full rounded-2xl overflow-visible transition-all duration-300
                  ${isAnimating ? 'shadow-glow' : ''}
                  ${isFocused ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''}
                  ${isRecording ? 'recording-active' : ''}`}
        style={{ 
          background: 'transparent',
          boxShadow: 'none',
          WebkitOverflowScrolling: 'touch',
          padding: 0,
          margin: 0,
          width: '100%',
          minWidth: '100%',
          border: isFocused || isRecording ? 'none' : 'none', // Remove any default border
        }}
      >
        {/* Container with padding for content */}
        <div className="relative w-full h-full p-[2px]">
          {/* Enhanced container with glass effect */}
          <div className={`absolute inset-0 bg-white/30 dark:bg-gray-900/30 backdrop-blur-md rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg ${isRecording ? 'recording-border' : ''}`}></div>
          
          {/* Top fade overlay for text fade-out - only show when not focused */}
          {!isFocused && (
            <div className="pointer-events-none absolute top-0 left-0 w-full h-8 z-10 ticker-fade-top rounded-t-2xl" />
          )}
          {/* Bottom fade overlay for text fade-out - only show when not focused */}
          {!isFocused && (
            <div className="pointer-events-none absolute bottom-0 left-0 w-full h-8 z-10 ticker-fade-bottom rounded-b-2xl" />
          )}
          
          <div
            ref={wrapperRef}
            className="h-full w-full overflow-hidden relative rounded-2xl"
            style={{ background: 'transparent', padding: 0, margin: 0 }}
          >
            {/* Invisible textarea for input handling */}
            <textarea
              ref={textareaRef}
              value={displayed}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={disabled}
              placeholder={!displayed ? placeholder : ""}
              className={`absolute inset-0 w-full h-full resize-none bg-transparent border-none outline-none 
                         text-transparent caret-current z-20 overflow-hidden rounded-2xl
                         ${isFocused ? 'text-gray-900 dark:text-gray-100' : 'text-transparent'}
                         placeholder-gray-400 dark:placeholder-gray-500`}
              style={{
                padding: '16px',
                fontSize: '1rem',
                lineHeight: '1.6',
                fontFamily: 'inherit',
                fontWeight: '500',
                textAlign: 'center',
                caretColor: isFocused ? 'currentColor' : 'transparent',
                width: '100%'
              }}
            />

            {/* Display layer - shown when not focused or when there's content */}
            {(!isFocused || !displayed) && (
              <div
                className="absolute inset-0 pointer-events-none flex flex-col justify-center items-center p-4 w-full"
                style={{ zIndex: 10 }}
              >
                {displayed ? (
                  // Show vertical ticker display
                  <div className="w-full text-center">
                    {/* Previous lines above center with improved animation */}
                    <div className="flex flex-col items-center justify-end mb-2 w-full">
                      <AnimatePresence>
                        {lines.slice(0, -1).map((line, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 0.7, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                            className="text-base font-medium leading-relaxed break-words whitespace-pre-line text-gray-600 dark:text-gray-400 w-full"
                          >
                            {line}
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                    
                    {/* Current/last line centered and highlighted with improved animation */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                      className="text-base font-medium leading-relaxed break-words whitespace-pre-line text-gray-900 dark:text-gray-100 w-full"
                    >
                      {/* Highlight new words in the last line with enhanced animation */}
                      {(() => {
                        const words = lines[lines.length - 1].split(/(\s+)/);
                        return words.map((word, i) => (
                          <motion.span
                            key={i}
                            initial={newWordIndices.includes(i) && word.trim() !== '' ? { scale: 0.8, opacity: 0 } : {}}
                            animate={newWordIndices.includes(i) && word.trim() !== '' ? { scale: 1, opacity: 1 } : {}}
                            transition={{ duration: 0.3 }}
                            className={newWordIndices.includes(i) && word.trim() !== '' ? 'ticker-word-pulse' : ''}
                            style={{ display: 'inline', transition: 'color 0.3s, filter 0.3s' }}
                          >
                            {word}
                          </motion.span>
                        ));
                      })()}
                    </motion.div>
                  </div>
                ) : (
                  // Show placeholder when empty with subtle animation
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className="text-gray-400 dark:text-gray-500 text-base font-medium text-center w-full"
                  >
                    {placeholder}
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Styles */}
      <style>{`
        .ticker-fade-top {
          pointer-events: none;
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 2rem;
          z-index: 10;
          background: linear-gradient(to bottom, rgba(255,255,255,0.7) 70%, transparent 100%);
        }
        .dark .ticker-fade-top {
          background: linear-gradient(to bottom, rgba(24,24,27,0.7) 70%, transparent 100%);
        }
        .ticker-fade-bottom {
          pointer-events: none;
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 2rem;
          z-index: 10;
          background: linear-gradient(to top, rgba(255,255,255,0.7) 70%, transparent 100%);
        }
        .dark .ticker-fade-bottom {
          background: linear-gradient(to top, rgba(24,24,27,0.7) 70%, transparent 100%);
        }
        .ticker-word-pulse {
           animation: tickerWordPulse 0.9s cubic-bezier(0.4,0,0.2,1) 1;
           color: #0ff;
           filter: drop-shadow(0 0 12px #0ff) drop-shadow(0 0 6px #38bdf8);
        }
        @keyframes tickerWordPulse {
           0% { color: #0ff; filter: drop-shadow(0 0 24px #0ff) drop-shadow(0 0 12px #38bdf8); }
           60% { color: #38bdf8; filter: drop-shadow(0 0 12px #0ff) drop-shadow(0 0 6px #38bdf8); }
           100% { color: inherit; filter: none; }
        }
        .shadow-glow {
          box-shadow: 0 0 15px 2px rgba(56, 189, 248, 0.3), 0 0 5px 1px rgba(56, 189, 248, 0.2);
        }
        .dark .shadow-glow {
          box-shadow: 0 0 15px 2px rgba(56, 189, 248, 0.2), 0 0 5px 1px rgba(56, 189, 248, 0.1);
        }
        
        /* Recording border animation */
        .recording-border {
          border-width: 1px;
          border-color: rgba(239, 68, 68, 0.5);
          transition: all 0.3s ease;
        }
        
        .recording-border-animation {
          border: 2px solid transparent;
          background: linear-gradient(90deg, #ef4444, #f97316, #f59e0b, #84cc16, #10b981, #06b6d4, #3b82f6, #8b5cf6, #d946ef, #ec4899, #ef4444) border-box;
          background-size: 300% 100%;
          -webkit-mask: 
            linear-gradient(#fff 0 0) padding-box, 
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: destination-out;
          mask-composite: exclude;
          animation: border-rotate 4s linear infinite, border-glow 2s ease-in-out infinite alternate;
          box-sizing: border-box;
          overflow: visible;
          filter: drop-shadow(0 0 3px rgba(239, 68, 68, 0.7)) drop-shadow(0 0 6px rgba(239, 68, 68, 0.5));
          pointer-events: none;
          z-index: 100 !important;
        }
        
        @keyframes border-rotate {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        
        @keyframes border-glow {
          0% { filter: drop-shadow(0 0 3px rgba(239, 68, 68, 0.7)) drop-shadow(0 0 6px rgba(239, 68, 68, 0.5)); }
          50% { filter: drop-shadow(0 0 4px rgba(59, 130, 246, 0.7)) drop-shadow(0 0 8px rgba(59, 130, 246, 0.5)); }
          100% { filter: drop-shadow(0 0 3px rgba(236, 72, 153, 0.7)) drop-shadow(0 0 6px rgba(236, 72, 153, 0.5)); }
        }
        
        .recording-active {
          transform: scale(1.001);
          box-shadow: 0 0 6px 1px rgba(239, 68, 68, 0.15), 0 0 3px 1px rgba(239, 68, 68, 0.2);
          animation: recording-glow 3s ease-in-out infinite alternate;
          transition: all 0.5s ease;
        }
        
        @keyframes recording-glow {
          0% { box-shadow: 0 0 6px 1px rgba(239, 68, 68, 0.15), 0 0 3px 1px rgba(239, 68, 68, 0.2); }
          50% { box-shadow: 0 0 6px 1px rgba(59, 130, 246, 0.15), 0 0 3px 1px rgba(59, 130, 246, 0.2); }
          100% { box-shadow: 0 0 6px 1px rgba(236, 72, 153, 0.15), 0 0 3px 1px rgba(236, 72, 153, 0.2); }
        }
      `}</style>
    </div>
  );
}

VerticalTicker.propTypes = {
  transcript: PropTypes.string.isRequired,
  onChange: PropTypes.func,
  onKeyDown: PropTypes.func,
  placeholder: PropTypes.string,
  disabled: PropTypes.bool,
  isRecording: PropTypes.bool,
}; 