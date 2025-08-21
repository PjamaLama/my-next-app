"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, PanInfo, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { ThumbsUp, ThumbsDown, Forward, X } from 'lucide-react';

interface FeedbackItem {
  id: string;
  title: string;
  description?: string;
  votesCount?: number;
  userVote?: 1 | -1 | 0;
  createdBy?: {
    uid?: string;
    displayName?: string;
    email?: string;
  };
  createdAt?: any; // Can be Firestore timestamp or Date
}

interface SwipeableFeedbackStackProps {
  items: FeedbackItem[];
  onVote: (id: string, value: 1 | -1) => Promise<void>;
  onSkip?: (id: string) => void;
  className?: string;
}

const SWIPE_THRESHOLD = 100;
const SWIPE_UP_THRESHOLD = 80;

// Helper function to format dates
const formatDate = (date: any): string => {
  if (!date) return '';
  
  let dateObj: Date;
  if (date.toDate) {
    // Firestore timestamp
    dateObj = date.toDate();
  } else if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === 'string') {
    dateObj = new Date(date);
  } else {
    return '';
  }
  
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return dateObj.toLocaleDateString();
  }
};

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

  const handleDragEnd = (event: any, info: PanInfo) => {
    // Don't allow swiping if user has already voted
    if (currentItem.userVote !== undefined && currentItem.userVote !== 0) {
      x.set(0);
      y.set(0);
      return;
    }

    const { offset, velocity } = info;
    
    if (Math.abs(offset.x) > SWIPE_THRESHOLD || Math.abs(velocity.x) > 500) {
      // Horizontal swipe
      const direction = offset.x > 0 ? 'right' : 'left';
      setSwipeDirection(direction);
      
      // Animate the swipe and handle vote
      if (direction === 'right') {
        x.set(300);
        handleVote(1);
      } else {
        x.set(-300);
        handleVote(-1);
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

  const handleVote = (value: 1 | -1) => {
    if (isVoting || !currentItem) return;
    
    setIsVoting(true);
    
    // Call the vote function from FeedbackButton
    onVote(currentItem.id, value)
      .then(() => {
        // Move to next card after successful vote
        nextCard();
      })
      .catch((error) => {
        console.error('Vote failed:', error);
        // Reset the card position on error
        x.set(0);
        y.set(0);
        setSwipeDirection(null);
      })
      .finally(() => {
        setIsVoting(false);
      });
  };

  const nextCard = () => {
    setTimeout(() => {
      setCurrentIndex(prev => {
        const nextIndex = prev + 1;
        console.log(`Moving from card ${prev} to ${nextIndex} (total: ${items.length})`);
        return nextIndex;
      });
      // Reset the card state immediately
      setSwipeDirection(null);
      x.set(0);
      y.set(0);
    }, 200);
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
        <p className="text-white/60 mb-4">
          {items.length === 0 
            ? "No feedback items to review right now."
            : "You've reviewed all available feedback items."}
        </p>
        {items.length > 0 && (
          <p className="text-xs text-white/40 mb-4">
            Note: Items you've already voted on are automatically filtered out.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
             {/* Instructions */}
       <div className="text-center mb-4">
         <div className="flex items-center justify-center gap-4 text-xs text-white/60">
           <div className="flex items-center gap-1">
             <div className="w-6 h-6 rounded-full bg-emerald-600/20 flex items-center justify-center">
               <ThumbsUp className="w-3 h-3 text-emerald-400" />
             </div>
             <span>Swipe right to vote up</span>
           </div>
           <div className="flex items-center gap-1">
             <div className="w-6 h-6 rounded-full bg-rose-600/20 flex items-center justify-center">
               <ThumbsDown className="w-3 h-3 text-rose-400" />
             </div>
             <span>Swipe left to vote down</span>
           </div>
           <div className="flex items-center gap-1">
             <div className="w-6 h-6 rounded-full bg-blue-600/20 flex items-center justify-center">
               <Forward className="w-3 h-3 text-blue-400" />
             </div>
             <span>Swipe up to skip</span>
           </div>
         </div>
       </div>

             {/* Progress indicator */}
       <div className="flex justify-center mb-3">
         <div className="flex gap-1">
           {items.map((_, index) => (
             <div
               key={index}
               className={`w-1.5 h-1.5 rounded-full transition-colors ${
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
          drag={currentItem.userVote === undefined || currentItem.userVote === 0}
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          dragElastic={0.8}
          onDragEnd={handleDragEnd}
          style={{
            x: xSpring,
            y: ySpring,
            rotate,
          }}
          className={currentItem.userVote !== undefined && currentItem.userVote !== 0 
            ? "cursor-default touch-none" 
            : "cursor-grab active:cursor-grabbing touch-none"
          }
          whileHover={currentItem.userVote === undefined || currentItem.userVote === 0 ? { scale: 1.02 } : {}}
          whileTap={currentItem.userVote === undefined || currentItem.userVote === 0 ? { scale: 0.98 } : {}}
        >
                     <div className={`relative backdrop-blur-sm border rounded-xl p-3 shadow-xl min-h-[220px] flex flex-col ${
                       currentItem.userVote !== undefined && currentItem.userVote !== 0
                         ? 'bg-zinc-800/60 border-white/5 opacity-80'
                         : 'bg-zinc-900/80 border-white/10'
                     }`}>
            {/* Vote indicators */}
                         {swipeDirection === 'right' && (
               <motion.div
                 initial={{ opacity: 0, scale: 0.8 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className="absolute top-3 right-3 z-10"
               >
                 <div className="w-12 h-12 rounded-full bg-emerald-600/90 flex items-center justify-center">
                   <ThumbsUp className="w-6 h-6 text-white" />
                 </div>
               </motion.div>
             )}
             
             {swipeDirection === 'left' && (
               <motion.div
                 initial={{ opacity: 0, scale: 0.8 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className="absolute top-3 left-3 z-10"
               >
                 <div className="w-12 h-12 rounded-full bg-rose-600/90 flex items-center justify-center">
                   <ThumbsDown className="w-6 h-6 text-white" />
                 </div>
               </motion.div>
             )}

                         {/* Card content */}
             <div className="flex items-start justify-between gap-2 mb-2">
               <div className="flex items-center gap-1">
                 <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs">
                   💬
                 </div>
                 <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300">
                   Feedback
                 </span>
               </div>
               
               <div className="flex items-center gap-1">
                 <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300">
                   Open
                 </span>
               </div>
             </div>

             <h3 className="text-base font-semibold text-white leading-tight mb-2">
               {currentItem.title}
             </h3>

             <p className="text-white/70 text-sm mb-2 flex-1 line-clamp-2">
                {currentItem.description || 'No description provided'}
              </p>

             <div className="mt-auto space-y-1.5">
               {/* Metadata */}
               <div className="flex items-center justify-between text-xs text-white/50">
                 <div className="flex flex-col gap-0.5">
                   <span>
                     {currentItem.createdBy?.displayName 
                       ? `By ${currentItem.createdBy.displayName}` 
                       : 'Anonymous user'}
                   </span>
                   <span>
                     {currentItem.createdAt 
                       ? formatDate(currentItem.createdAt)
                       : 'Recently'}
                   </span>
                 </div>
                 <div className="flex items-center gap-2">
                   <span className="font-semibold">
                     {(currentItem.votesCount || 0).toLocaleString()} votes
                   </span>
                   {currentItem.userVote === 1 && (
                     <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-400">
                       <ThumbsUp className="w-3 h-3" fill="currentColor" />
                       <span className="text-xs">Voted Up</span>
                     </div>
                   )}
                   {currentItem.userVote === -1 && (
                     <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600/20 text-rose-400">
                       <ThumbsDown className="w-3 h-3" fill="currentColor" />
                       <span className="text-xs">Voted Down</span>
                     </div>
                   )}
                 </div>
               </div>

               {/* Manual vote buttons or next button for already voted items */}
               {currentItem.userVote !== undefined && currentItem.userVote !== 0 ? (
                 <div className="flex items-center justify-center">
                   <button
                     onClick={() => nextCard()}
                     className="px-4 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 hover:text-emerald-300 flex items-center gap-2 transition-colors"
                   >
                     <span className="text-sm">Next Item</span>
                     <Forward className="w-3.5 h-3.5" />
                   </button>
                 </div>
               ) : (
                 <div className="flex items-center justify-center gap-1.5">
                   <button
                     onClick={() => {
                       setSwipeDirection('left');
                       x.set(-300);
                       handleVote(-1);
                     }}
                     disabled={isVoting}
                     className="w-8 h-8 rounded-full bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 hover:text-rose-300 flex items-center justify-center transition-colors disabled:opacity-50"
                   >
                     <ThumbsDown className="w-3.5 h-3.5" />
                   </button>
                   
                   <button
                     onClick={() => {
                       setSwipeDirection('up');
                       y.set(-300);
                       if (onSkip) {
                         onSkip(currentItem.id);
                       }
                       nextCard();
                     }}
                     disabled={isVoting}
                     className="w-8 h-8 rounded-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 flex items-center justify-center transition-colors disabled:opacity-50"
                   >
                     <Forward className="w-3.5 h-3.5" />
                   </button>
                   
                   <button
                     onClick={() => {
                       setSwipeDirection('right');
                       x.set(300);
                       handleVote(1);
                     }}
                     disabled={isVoting}
                     className="w-8 h-8 rounded-full bg-emerald-600/20 hover:bg-emerald-500/30 text-emerald-400 hover:text-emerald-300 flex items-center justify-center transition-colors disabled:opacity-50"
                   >
                     <ThumbsUp className="w-3.5 h-3.5" />
                   </button>
                 </div>
               )}
             </div>
          </div>
        </motion.div>
      </div>

             {/* Card counter */}
       <div className="text-center mt-3 text-xs text-white/60">
         {currentIndex + 1} of {items.length}
       </div>
    </div>
  );
}
