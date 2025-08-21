"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, PanInfo, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { ThumbsUp, ThumbsDown, SkipForward, X } from 'lucide-react';

interface FeedbackItem {
  id: string;
  title: string;
  description?: string;
  votesCount?: number;
  userVote?: 1 | -1 | 0;
}

interface SwipeableFeedbackStackProps {
  items: FeedbackItem[];
  onVote: (id: string, value: 1 | -1) => Promise<void>;
  onSkip?: (id: string) => void;
  className?: string;
}

const SWIPE_THRESHOLD = 100;
const SWIPE_UP_THRESHOLD = 80;

export default function SwipeableFeedbackStack({ 
  items, 
  onVote, 
  onSkip,
  className = "" 
}: SwipeableFeedbackStackProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVoting, setIsVoting] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | 'up' | null>(null);
  
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const xSpring = useSpring(x, { damping: 20, stiffness: 300 });
  const ySpring = useSpring(y, { damping: 20, stiffness: 300 });

  const currentItem = items[currentIndex];

  const handleDragEnd = async (event: any, info: PanInfo) => {
    const { offset, velocity } = info;
    
    if (Math.abs(offset.x) > SWIPE_THRESHOLD || Math.abs(velocity.x) > 500) {
      // Horizontal swipe
      const direction = offset.x > 0 ? 'right' : 'left';
      setSwipeDirection(direction);
      
      // Animate the swipe
      if (direction === 'right') {
        x.set(300);
        await handleVote(1);
      } else {
        x.set(-300);
        await handleVote(-1);
      }
    } else if (offset.y < -SWIPE_UP_THRESHOLD || velocity.y < -300) {
      // Swipe up to skip
      setSwipeDirection('up');
      y.set(-300);
      if (onSkip) {
        onSkip(currentItem.id);
      }
      nextCard();
    } else {
      // Return to center with spring animation
      x.set(0);
      y.set(0);
    }
  };

  const handleVote = async (value: 1 | -1) => {
    if (isVoting || !currentItem) return;
    
    setIsVoting(true);
    try {
      await onVote(currentItem.id, value);
      nextCard();
    } catch (error) {
      console.error('Vote failed:', error);
    } finally {
      setIsVoting(false);
    }
  };

  const nextCard = () => {
    setTimeout(() => {
      setCurrentIndex(prev => Math.min(prev + 1, items.length - 1));
      setSwipeDirection(null);
      x.set(0);
      y.set(0);
    }, 300);
  };

  const resetStack = () => {
    setCurrentIndex(0);
    setSwipeDirection(null);
    x.set(0);
    y.set(0);
  };

  if (!currentItem) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
        <div className="text-6xl mb-4">🎉</div>
        <h3 className="text-xl font-semibold text-white mb-2">All caught up!</h3>
        <p className="text-white/60 mb-4">You've reviewed all the feedback items.</p>
        <button
          onClick={resetStack}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
        >
          Start Over
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Instructions */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-6 text-sm text-white/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-600/20 flex items-center justify-center">
              <ThumbsUp className="w-4 h-4 text-emerald-400" />
            </div>
            <span>Swipe right to vote up</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-rose-600/20 flex items-center justify-center">
              <ThumbsDown className="w-4 h-4 text-rose-400" />
            </div>
            <span>Swipe left to vote down</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center">
              <SkipForward className="w-4 h-4 text-blue-400" />
            </div>
            <span>Swipe up to skip</span>
          </div>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="flex justify-center mb-4">
        <div className="flex gap-1">
          {items.map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentIndex 
                  ? 'bg-emerald-500' 
                  : index < currentIndex 
                    ? 'bg-emerald-300/50' 
                    : 'bg-white/20'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Card */}
      <div className="relative">
        <motion.div
          drag
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          dragElastic={0.8}
          onDragEnd={handleDragEnd}
          style={{
            x: xSpring,
            y: ySpring,
            rotate,
          }}
          className="cursor-grab active:cursor-grabbing touch-none"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="relative bg-zinc-900/80 backdrop-blur-sm border border-white/10 rounded-2xl p-6 shadow-2xl min-h-[400px] flex flex-col">
            {/* Vote indicators */}
            {swipeDirection === 'right' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute top-4 right-4 z-10"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-600/90 flex items-center justify-center">
                  <ThumbsUp className="w-8 h-8 text-white" />
                </div>
              </motion.div>
            )}
            
            {swipeDirection === 'left' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute top-4 left-4 z-10"
              >
                <div className="w-16 h-16 rounded-full bg-rose-600/90 flex items-center justify-center">
                  <ThumbsDown className="w-8 h-8 text-white" />
                </div>
              </motion.div>
            )}

            {/* Card content */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  currentItem.type === 'feature' ? 'bg-yellow-500/20' :
                  currentItem.type === 'bug' ? 'bg-red-500/20' :
                  'bg-blue-500/20'
                }`}>
                  {currentItem.type === 'feature' ? '💡' : 
                   currentItem.type === 'bug' ? '🐛' : '❓'}
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  currentItem.type === 'feature' ? 'bg-yellow-500/20 text-yellow-300' :
                  currentItem.type === 'bug' ? 'bg-red-500/20 text-red-300' :
                  'bg-blue-500/20 text-blue-300'
                }`}>
                  {currentItem.type}
                </span>
              </div>
              
              <div className="flex items-center gap-1">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  currentItem.status === 'open' ? 'bg-blue-500/20 text-blue-300' :
                  currentItem.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-300' :
                  currentItem.status === 'closed' ? 'bg-gray-500/20 text-gray-300' :
                  'bg-green-500/20 text-green-300'
                }`}>
                  {currentItem.status || 'open'}
                </span>
              </div>
            </div>

            <h3 className="text-xl font-semibold text-white leading-snug mb-3">
              {currentItem.title}
            </h3>

            {currentItem.description && (
              <p className="text-white/70 text-sm mb-4 flex-1">
                {currentItem.description}
              </p>
            )}

            <div className="mt-auto space-y-3">
              {/* Metadata */}
              <div className="flex items-center justify-between text-xs text-white/50">
                <div className="flex items-center gap-3">
                  {currentItem.createdBy?.displayName && (
                    <span>By {currentItem.createdBy.displayName}</span>
                  )}
                  {currentItem.createdAt && (
                    <span>{new Date(currentItem.createdAt).toLocaleDateString()}</span>
                  )}
                </div>
                <span className="font-semibold">
                  {(currentItem.votesCount || 0).toLocaleString()} votes
                </span>
              </div>

              {/* Manual vote buttons */}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => handleVote(-1)}
                  disabled={isVoting}
                  className="w-12 h-12 rounded-full bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 hover:text-rose-300 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <ThumbsDown className="w-5 h-5" />
                </button>
                
                <button
                  onClick={() => onSkip?.(currentItem.id)}
                  disabled={isVoting}
                  className="w-12 h-12 rounded-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
                
                <button
                  onClick={() => handleVote(1)}
                  disabled={isVoting}
                  className="w-12 h-12 rounded-full bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 hover:text-emerald-300 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <ThumbsUp className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Card counter */}
      <div className="text-center mt-4 text-sm text-white/60">
        {currentIndex + 1} of {items.length}
      </div>
    </div>
  );
}
