import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
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
 */
export default function VerticalTicker({ transcript, onChange, onKeyDown, placeholder = "Type or speak your message...", disabled = false }) {
  const containerRef = useRef(null);
  const textareaRef = useRef(null);
  const [displayed, setDisplayed] = useState('');
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  // Track which words are new for pulsing
  const [newWordIndices, setNewWordIndices] = useState([]);
  const [prevWordCount, setPrevWordCount] = useState(0);

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
      }
      setNewWordIndices(indices);
      setDisplayed(transcript);
      setPrevWordCount(newWords.length);
      if (indices.length > 0) {
        setTimeout(() => setNewWordIndices([]), 900);
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
    <div className="relative h-32 max-h-40 w-full" style={{ background: 'transparent', border: 'none', boxShadow: 'none', WebkitOverflowScrolling: 'touch', padding: 0, margin: 0 }}>
      {/* Top fade overlay for text fade-out - only show when not focused */}
      {!isFocused && (
        <div className="pointer-events-none absolute top-0 left-0 w-full h-8 z-10 ticker-fade-top" />
      )}
      {/* Bottom fade overlay for text fade-out - only show when not focused */}
      {!isFocused && (
        <div className="pointer-events-none absolute bottom-0 left-0 w-full h-8 z-10 ticker-fade-bottom" />
      )}
      
      <div
        ref={wrapperRef}
        className="h-full w-full overflow-hidden relative"
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
                     text-transparent caret-current z-20 overflow-hidden
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
          }}
        />

        {/* Display layer - shown when not focused or when there's content */}
        {(!isFocused || !displayed) && (
          <div
            className="absolute inset-0 pointer-events-none flex flex-col justify-center items-center p-4"
            style={{ zIndex: 10 }}
          >
            {displayed ? (
              // Show vertical ticker display
              <div className="w-full text-center">
                {/* Previous lines above center */}
                <div className="flex flex-col items-center justify-end mb-2">
                  {lines.slice(0, -1).map((line, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 0.7 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="text-base font-medium leading-relaxed break-words whitespace-pre-line text-gray-600 dark:text-gray-400"
                    >
                      {line}
                    </motion.div>
                  ))}
                </div>
                
                {/* Current/last line centered and highlighted */}
                <motion.div
                  initial={{ opacity: 0.7 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="text-base font-medium leading-relaxed break-words whitespace-pre-line text-gray-900 dark:text-gray-100"
                >
                  {/* Highlight new words in the last line */}
                  {(() => {
                    const words = lines[lines.length - 1].split(/(\s+)/);
                    return words.map((word, i) => (
                      <span
                        key={i}
                        className={newWordIndices.includes(i) && word.trim() !== '' ? 'ticker-word-pulse' : ''}
                        style={{ display: 'inline', transition: 'color 0.3s, filter 0.3s' }}
                      >
                        {word}
                      </span>
                    ));
                  })()}
                </motion.div>
              </div>
            ) : (
              // Show placeholder when empty
              <div className="text-gray-400 dark:text-gray-500 text-base font-medium text-center">
                {placeholder}
              </div>
            )}
          </div>
        )}
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
          background: linear-gradient(to bottom, rgba(255,255,255,0.9) 70%, transparent 100%);
        }
        .dark .ticker-fade-top {
          background: linear-gradient(to bottom, rgba(24,24,27,0.9) 70%, transparent 100%);
        }
        .ticker-fade-bottom {
          pointer-events: none;
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 2rem;
          z-index: 10;
          background: linear-gradient(to top, rgba(255,255,255,0.9) 70%, transparent 100%);
        }
        .dark .ticker-fade-bottom {
          background: linear-gradient(to top, rgba(24,24,27,0.9) 70%, transparent 100%);
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
}; 