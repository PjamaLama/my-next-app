'use client';

import React from 'react';
import dynamic from 'next/dynamic';
// Auto-register Chart.js components
import 'chart.js/auto';

// Dynamically import chart components client-side only
const DynamicBar = dynamic(() => import('react-chartjs-2').then(m => m.Bar), { ssr: false });
const DynamicLine = dynamic(() => import('react-chartjs-2').then(m => m.Line), { ssr: false });
const DynamicPie = dynamic(() => import('react-chartjs-2').then(m => m.Pie), { ssr: false });

type ChartSpec = {
  kind: 'bar' | 'line' | 'pie';
  title?: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
  options?: Record<string, unknown>;
};

export default function ChartRenderer({ spec }: { spec: ChartSpec }) {
  const data = { labels: spec.labels, datasets: spec.datasets } as any;
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { title: { display: !!spec.title, text: spec.title } },
    ...(spec.options || {})
  } as any;

  const ChartComp = spec.kind === 'bar' ? DynamicBar : spec.kind === 'line' ? DynamicLine : DynamicPie;

  return (
    <div className="relative h-56 sm:h-72">
      <ChartComp data={data} options={options} />
    </div>
  );
}


