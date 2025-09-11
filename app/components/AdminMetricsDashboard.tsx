"use client";

import React, { useEffect, useState } from 'react';
import { useFirebase } from '@/app/providers/FirebaseProvider';

interface MetricsData {
  totalUsers: number;
  newUsersToday: number;
  newUsersWeek: number;
  newUsersMonth: number;
  activeUsers: number;
  feedbackCount: number;
  openFeedback: number;
  totalVotes: number;
}

export default function AdminMetricsDashboard() {
  const { user } = useFirebase();
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/metrics', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to load metrics');
      }

      const data = await response.json();
      if (data.success) {
        setMetrics(data.data);
      } else {
        throw new Error(data.error || 'Failed to load metrics');
      }
    } catch (err: any) {
      console.error('Metrics load error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, [user]);

  const MetricCard = ({
    title,
    value,
    subtitle,
    icon,
    color = "blue"
  }: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: string;
    color?: "blue" | "green" | "purple" | "orange" | "red";
  }) => {
    const colorClasses = {
      blue: "bg-blue-500/20 border-blue-500/30 text-blue-300",
      green: "bg-green-500/20 border-green-500/30 text-green-300",
      purple: "bg-purple-500/20 border-purple-500/30 text-purple-300",
      orange: "bg-orange-500/20 border-orange-500/30 text-orange-300",
      red: "bg-red-500/20 border-red-500/30 text-red-300"
    };

    return (
      <div className={`glass rounded-xl p-6 border border-white/10 ${colorClasses[color]}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-white/60 text-sm">{title}</div>
          <div className="text-2xl">{icon}</div>
        </div>
        <div className="text-3xl font-bold text-white mb-1">{value}</div>
        {subtitle && <div className="text-white/50 text-sm">{subtitle}</div>}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="glass rounded-xl p-6 border border-white/10">
        <div className="text-white/60 text-sm">Loading metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-xl p-6 border border-white/10">
        <div className="text-red-400 text-sm mb-3">Error loading metrics</div>
        <button
          onClick={loadMetrics}
          className="px-4 py-2 bg-red-600/20 border border-red-500/30 text-red-300 rounded-lg hover:bg-red-600/30"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Dashboard Overview</h2>
        <button
          onClick={loadMetrics}
          className="px-4 py-2 bg-white/10 border border-white/10 text-white/80 rounded-lg hover:bg-white/20"
        >
          Refresh
        </button>
      </div>

      {/* User Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Users"
          value={metrics.totalUsers.toLocaleString()}
          subtitle="All registered users"
          icon="👥"
          color="blue"
        />
        <MetricCard
          title="New Today"
          value={metrics.newUsersToday}
          subtitle={`${metrics.newUsersWeek} this week`}
          icon="📈"
          color="green"
        />
        <MetricCard
          title="New This Month"
          value={metrics.newUsersMonth}
          subtitle={`${Math.round((metrics.newUsersMonth / Math.max(metrics.totalUsers, 1)) * 100)}% growth`}
          icon="📊"
          color="purple"
        />
        <MetricCard
          title="Active Users"
          value={metrics.activeUsers}
          subtitle="Last 30 days activity"
          icon="⚡"
          color="orange"
        />
      </div>

      {/* Feedback Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Total Feedback"
          value={metrics.feedbackCount}
          subtitle="All time submissions"
          icon="💬"
          color="blue"
        />
        <MetricCard
          title="Open Feedback"
          value={metrics.openFeedback}
          subtitle={`${Math.round((metrics.openFeedback / Math.max(metrics.feedbackCount, 1)) * 100)}% pending`}
          icon="📋"
          color="orange"
        />
        <MetricCard
          title="Total Votes"
          value={metrics.totalVotes}
          subtitle="Community engagement"
          icon="👍"
          color="green"
        />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-3">User Growth</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Daily growth rate</span>
              <span className="text-white">
                {metrics.totalUsers > 0 ? `${((metrics.newUsersToday / metrics.totalUsers) * 100).toFixed(1)}%` : '0%'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Weekly growth rate</span>
              <span className="text-white">
                {metrics.totalUsers > 0 ? `${((metrics.newUsersWeek / metrics.totalUsers) * 100).toFixed(1)}%` : '0%'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Monthly growth rate</span>
              <span className="text-white">
                {metrics.totalUsers > 0 ? `${((metrics.newUsersMonth / metrics.totalUsers) * 100).toFixed(1)}%` : '0%'}
              </span>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-3">Engagement</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Avg votes per feedback</span>
              <span className="text-white">
                {metrics.feedbackCount > 0 ? (metrics.totalVotes / metrics.feedbackCount).toFixed(1) : '0'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Open feedback rate</span>
              <span className="text-white">
                {metrics.feedbackCount > 0 ? `${((metrics.openFeedback / metrics.feedbackCount) * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">User activity rate</span>
              <span className="text-white">
                {metrics.totalUsers > 0 ? `${((metrics.activeUsers / metrics.totalUsers) * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
