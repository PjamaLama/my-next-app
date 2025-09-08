"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { Play, CreditCard, Cog, Users, ArrowRight, Zap } from 'lucide-react';

interface SiteLink {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  hash: string;
}

const siteLinks: SiteLink[] = [
  {
    id: 'try-demo',
    label: 'Try Demo',
    description: 'Test it yourself',
    icon: <Zap className="w-4 h-4" />,
    hash: 'try-demo'
  },
  {
    id: 'demo',
    label: 'Watch Demo',
    description: 'See SheetyAI in action',
    icon: <Play className="w-4 h-4" />,
    hash: 'demo'
  },
  {
    id: 'input-types',
    label: 'Input Methods',
    description: 'Multiple ways to input data',
    icon: <ArrowRight className="w-4 h-4" />,
    hash: 'input-types'
  },
  {
    id: 'features',
    label: 'Features',
    description: 'Powerful AI capabilities',
    icon: <Cog className="w-4 h-4" />,
    hash: 'features'
  },
  {
    id: 'pricing',
    label: 'Pricing',
    description: 'Simple and affordable',
    icon: <CreditCard className="w-4 h-4" />,
    hash: 'pricing'
  },
  {
    id: 'process',
    label: 'How It Works',
    description: '3-step conversion process',
    icon: <Users className="w-4 h-4" />,
    hash: 'process'
  }
];

interface SiteLinksProps {
  className?: string;
}

export default function SiteLinks({ className = '' }: SiteLinksProps) {
  return (
    <div className={`flex flex-wrap justify-center gap-3 ${className}`}>
      {siteLinks.map((link, index) => (
        <motion.a
          key={link.id}
          href={`#${link.hash}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="group bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 rounded-full px-4 py-2 backdrop-blur-sm transition-all duration-300 shadow-lg hover:shadow-white/10 no-underline"
          onClick={(e) => {
            console.log('Site link clicked:', link.hash);
            // Browser handles smooth scrolling for anchor links automatically
          }}
        >
          <div className="flex items-center gap-2 text-white/90 group-hover:text-white">
            <span className="text-emerald-400 group-hover:text-emerald-300">
              {link.icon}
            </span>
            <span className="text-sm font-medium">{link.label}</span>
          </div>
        </motion.a>
      ))}
    </div>
  );
}

// Component for Google Ads integration - simplified version
export function GoogleAdsSiteLinks() {
  return (
    <div className="hidden">
      {/* This component provides structured data for Google Ads site links */}
      {/* The actual site links will be configured in Google Ads dashboard */}
      {siteLinks.map((link) => (
        <link
          key={link.id}
          rel="alternate"
          href={`${typeof window !== 'undefined' ? window.location.origin : ''}/#${link.hash}`}
          title={link.label}
        />
      ))}
    </div>
  );
}
