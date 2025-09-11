"use client";

import React from 'react';
import { useTrackingPanel } from '../providers/TrackingPanelProvider';
import TrackingStatusPanel from './TrackingStatusPanel';

export default function TrackingStatusPanelWrapper() {
  const { isVisible } = useTrackingPanel();

  // Only render the tracking panel if it's visible (controlled by admin toggle)
  // and we're in development mode (already checked in layout.tsx)
  if (!isVisible) {
    return null;
  }

  return <TrackingStatusPanel />;
}
