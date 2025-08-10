"use client";

import React, { useEffect } from 'react';

export default function ReportPage() {
  useEffect(() => {
    try { if (typeof window !== 'undefined') window.location.replace('/'); } catch {}
  }, []);
  return null;
}


