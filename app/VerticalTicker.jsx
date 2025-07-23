import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';

/**
 * VerticalTicker - Live transcript/ticker component for Next.js using Framer Motion.
 *
 * Props:
 *   transcript: string (updates live)
 */
export default function VerticalTicker({ transcript }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [displayed, setDisplayed] = useState('');
  const [isOverflowing, setIsOverflowing] = useState(false);

  // Animate in new transcript as it grows
  useEffect(() => {
    setDisplayed(transcript);
  }, [transcript]);

  // Auto-scroll to end as text grows
  useEffect(() => {
    if (containerRef.current && textRef.current) {
      containerRef.current.scrollTo({
        left: 0,
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [displayed]);

  // Detect overflow
  useEffect(() => {
    if (containerRef.current && textRef.current) {
      const container = containerRef.current;
      const text = textRef.current;
      setIsOverflowing(text.scrollHeight > container.clientHeight);
    }
  }, [displayed]);

  // Split transcript into lines
  const lines = displayed.split('\n');
  const wrapperRef = useRef(null);
  const lineRefs = useRef([]);

  // Calculate the height of the last line for vertical alignment
  const [lastLineHeight, setLastLineHeight] = useState(0);
  useEffect(() => {
    if (lineRefs.current[lines.length - 1]) {
      setLastLineHeight(lineRefs.current[lines.length - 1].offsetHeight || 0);
    }
  }, [displayed, lines.length]);

  // Refs for each line
  const [spacerHeight, setSpacerHeight] = useState(0);

  // Calculate spacer height to center the last line
  useEffect(() => {
    if (!wrapperRef.current || lines.length === 0) return;
    let prevHeight = 0;
    for (let i = 0; i < lines.length - 1; i++) {
      const ref = lineRefs.current[i];
      if (ref) prevHeight += ref.offsetHeight;
    }
    const wrapperHeight = wrapperRef.current.clientHeight;
    const lastLineRef = lineRefs.current[lines.length - 1];
    const lastLineHeight = lastLineRef ? lastLineRef.offsetHeight : 0;
    setSpacerHeight(Math.max(0, (wrapperHeight / 2) - (lastLineHeight / 2) - prevHeight - 8));
  }, [displayed, lines.length]);

  return (
    <div className="relative h-32 max-h-40 w-full overflow-hidden" style={{ background: 'transparent', border: 'none', boxShadow: 'none', WebkitOverflowScrolling: 'touch', padding: 0, margin: 0 }}>
      {/* Top fade overlay for text fade-out */}
      <div className="pointer-events-none absolute top-0 left-0 w-full h-8 z-10 ticker-fade-top" />
      {/* Bottom fade overlay for text fade-out */}
      <div className="pointer-events-none absolute bottom-0 left-0 w-full h-8 z-10 ticker-fade-bottom" />
      <div
        ref={wrapperRef}
        className="h-full w-full overflow-hidden relative"
        style={{ background: 'transparent', padding: 0, margin: 0 }}
      >
        {/* Previous lines above center */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: `calc(50% + ${lastLineHeight / 2}px)`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
            width: '100%',
            pointerEvents: 'none',
          }}
        >
          {lines.slice(0, -1).map((line, idx) => (
            <motion.div
              key={idx}
              ref={el => lineRefs.current[idx] = el}
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className={`text-base sm:text-base font-medium leading-relaxed break-words bg-transparent border-none shadow-none whitespace-pre-line w-full text-center`}
              style={{ margin: 0, padding: 0 }}
            >
              {line}
            </motion.div>
          ))}
        </div>
        {/* Current line centered */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: '100%',
            pointerEvents: 'none',
          }}
        >
          <motion.div
            ref={el => lineRefs.current[lines.length - 1] = el}
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={`text-base sm:text-base font-medium leading-relaxed break-words bg-transparent border-none shadow-none whitespace-pre-line w-full text-center`}
            style={{ margin: 0, padding: 0 }}
          >
            {lines[lines.length - 1]}
          </motion.div>
        </div>
      </div>
      {/* Hide scrollbar for Webkit browsers */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .ticker-fade-top {
          pointer-events: none;
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 2rem;
          z-index: 10;
          background: linear-gradient(to bottom, var(--box-bg) 70%, transparent 100%);
        }
        .ticker-fade-bottom {
          pointer-events: none;
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 2rem;
          z-index: 10;
          background: linear-gradient(to top, var(--box-bg) 70%, transparent 100%);
        }
      `}</style>
    </div>
  );
}

VerticalTicker.propTypes = {
  transcript: PropTypes.string.isRequired,
}; 