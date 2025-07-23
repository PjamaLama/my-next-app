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

  return (
    <div className="relative h-48 max-h-60 w-full overflow-hidden" style={{ background: 'transparent', border: 'none', boxShadow: 'none', WebkitOverflowScrolling: 'touch', padding: 0, margin: 0 }}>
      {/* Gradient fade top (fully transparent) */}
      <div className="pointer-events-none absolute top-0 left-0 w-full h-8 z-10" style={{background: 'linear-gradient(to bottom,rgba(0,0,0,0) 0%,rgba(0,0,0,0) 100%)'}} />
      {/* Gradient fade bottom (fully transparent) */}
      <div className="pointer-events-none absolute bottom-0 left-0 w-full h-8 z-10" style={{background: 'linear-gradient(to top,rgba(0,0,0,0) 0%,rgba(0,0,0,0) 100%)'}} />
      <div
        ref={containerRef}
        className="h-full w-full overflow-y-auto scrollbar-hide flex flex-col justify-end"
        style={{scrollbarWidth: 'none', msOverflowStyle: 'none', background: 'transparent', padding: 0, margin: 0}}
      >
        <motion.div
          ref={textRef}
          key={displayed}
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="text-base sm:text-base text-gray-100 font-medium leading-relaxed break-words bg-transparent p-0 m-0 border-none shadow-none whitespace-pre-line"
          style={{ margin: 0, padding: 0, background: 'transparent' }}
        >
          {displayed}
        </motion.div>
      </div>
      {/* Hide scrollbar for Webkit browsers */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

VerticalTicker.propTypes = {
  transcript: PropTypes.string.isRequired,
}; 