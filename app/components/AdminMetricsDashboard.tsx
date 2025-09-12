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
  sheetsCreated: number;
  avgSessionDuration: number;
  conversionRate: number;
  popularFeatures: Array<{ feature: string; usage: number }>;
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

      {/* Business Impact Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Sheets Created"
          value={metrics.sheetsCreated}
          subtitle="Total Google Sheets generated"
          icon="📊"
          color="purple"
        />
        <MetricCard
          title="Conversion Rate"
          value={`${metrics.conversionRate}%`}
          subtitle="Free to Pro users"
          icon="💰"
          color="green"
        />
        <MetricCard
          title="Avg Session"
          value={`${metrics.avgSessionDuration}m`}
          subtitle="User engagement time"
          icon="⏱️"
          color="blue"
        />
      </div>

      {/* Advanced Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* User Growth & Revenue */}
        <div className="glass rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-green-400">📈</span>
            Revenue Metrics
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-white/60 text-sm">Conversion Rate</span>
              <span className="text-green-400 font-semibold">{metrics.conversionRate}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/60 text-sm">Est. Monthly Revenue</span>
              <span className="text-white font-semibold">${(metrics.totalUsers * metrics.conversionRate * 0.1).toFixed(0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/60 text-sm">Pro Users</span>
              <span className="text-purple-400 font-semibold">{Math.round(metrics.totalUsers * metrics.conversionRate / 100)}</span>
            </div>
          </div>
        </div>

        {/* Feature Usage */}
        <div className="glass rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-blue-400">🚀</span>
            Popular Features
          </h3>
          <div className="space-y-2">
            {metrics.popularFeatures.slice(0, 4).map((feature, index) => (
              <div key={feature.feature} className="flex justify-between items-center">
                <span className="text-white/70 text-sm">{feature.feature}</span>
                <div className="flex items-center gap-2">
                  <div className="w-12 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-400 to-purple-400 rounded-full transition-all duration-500"
                      style={{ width: `${(feature.usage / Math.max(...metrics.popularFeatures.map(f => f.usage))) * 100}%` }}
                    />
                  </div>
                  <span className="text-white text-xs font-medium w-8 text-right">{feature.usage}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System Health */}
        <div className="glass rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-orange-400">⚡</span>
            System Health
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-white/60 text-sm">Avg Session Time</span>
              <span className={`font-semibold ${metrics.avgSessionDuration > 5 ? 'text-green-400' : 'text-orange-400'}`}>
                {metrics.avgSessionDuration}m
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/60 text-sm">Sheets/User</span>
              <span className="text-blue-400 font-semibold">
                {(metrics.totalUsers > 0 ? metrics.sheetsCreated / metrics.totalUsers : 0).toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/60 text-sm">Feedback Response</span>
              <span className={`font-semibold ${metrics.openFeedback < 5 ? 'text-green-400' : 'text-red-400'}`}>
                {metrics.feedbackCount > 0 ? `${((1 - metrics.openFeedback / metrics.feedbackCount) * 100).toFixed(0)}%` : '100%'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Items */}
      <div className="glass rounded-xl p-6 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="text-yellow-400">🎯</span>
          Key Insights & Actions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            {metrics.newUsersToday > 5 && (
              <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <span className="text-green-400">📈</span>
                <div>
                  <div className="text-white text-sm font-medium">High traffic day!</div>
                  <div className="text-white/60 text-xs">{metrics.newUsersToday} new users today</div>
                </div>
              </div>
            )}
            {metrics.conversionRate < 5 && (
              <div className="flex items-center gap-3 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                <span className="text-orange-400">💰</span>
                <div>
                  <div className="text-white text-sm font-medium">Low conversion rate</div>
                  <div className="text-white/60 text-xs">Consider pricing or feature improvements</div>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {metrics.openFeedback > 10 && (
              <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <span className="text-red-400">⚠️</span>
                <div>
                  <div className="text-white text-sm font-medium">High open feedback</div>
                  <div className="text-white/60 text-xs">{metrics.openFeedback} items need attention</div>
                </div>
              </div>
            )}
            {metrics.avgSessionDuration < 3 && (
              <div className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <span className="text-blue-400">🎯</span>
                <div>
                  <div className="text-white text-sm font-medium">Low engagement</div>
                  <div className="text-white/60 text-xs">Users spending only {metrics.avgSessionDuration} minutes</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
