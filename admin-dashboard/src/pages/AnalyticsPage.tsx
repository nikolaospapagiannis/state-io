import { useState, useEffect } from 'react';
import {
  TrendingUp,
  Users,
  DollarSign,
  Gamepad2,
  Clock,
  Target,
  Calendar,
} from 'lucide-react';
import { api } from '../services/api';
import { StatCard } from '../components/StatCard';
import { LineChart, BarChart, PieChart } from '../components/Chart';

interface AnalyticsData {
  metrics: any;
  revenue: any[];
  growth: any[];
  retention: any;
  sessionData: any;
}

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(30);

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [metrics, revenue, growth] = await Promise.all([
        api.getMetrics(),
        api.getRevenue(dateRange),
        api.getGrowth(dateRange),
      ]);

      setData({
        metrics,
        revenue: revenue.data || [],
        growth: growth.data || [],
        retention: metrics,
        sessionData: metrics,
      });
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  const retentionData = [
    { label: 'Day 1', value: data?.retention?.retentionD1 || 40, color: '#8b5cf6' },
    { label: 'Day 7', value: data?.retention?.retentionD7 || 25, color: '#6366f1' },
    { label: 'Day 30', value: data?.retention?.retentionD30 || 15, color: '#a855f7' },
  ];

  const platformData = [
    { label: 'iOS', value: 45, color: '#8b5cf6' },
    { label: 'Android', value: 40, color: '#22c55e' },
    { label: 'Web', value: 15, color: '#f59e0b' },
  ];

  const revenueByType = [
    { label: 'IAP', value: 60, color: '#22c55e' },
    { label: 'Ads', value: 25, color: '#3b82f6' },
    { label: 'Subs', value: 15, color: '#8b5cf6' },
  ];

  const hourlyActivity = Array.from({ length: 24 }, (_, i) => ({
    label: `${i}:00`,
    value: Math.floor(Math.random() * 1000) + 200,
  }));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-gray-500">Detailed game performance metrics</p>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(parseInt(e.target.value))}
          className="input"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="MAU"
          value={formatNumber(data?.metrics?.monthlyActive || 0)}
          icon={Users}
          change={8.5}
          color="primary"
        />
        <StatCard
          title="ARPU"
          value={formatCurrency((data?.metrics?.totalRevenue || 0) / (data?.metrics?.monthlyActive || 1))}
          icon={DollarSign}
          change={12.3}
          color="green"
        />
        <StatCard
          title="Avg. Session"
          value={`${Math.round(data?.metrics?.avgSessionLength || 0)} min`}
          icon={Clock}
          change={5.2}
          color="blue"
        />
        <StatCard
          title="Total Matches"
          value={formatNumber(data?.metrics?.totalMatches || 0)}
          icon={Gamepad2}
          change={15.8}
          color="yellow"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Revenue Trend</h3>
            <span className="text-green-400 text-sm">
              +{((data?.metrics?.weeklyRevenue || 0) / 7 * 100).toFixed(1)}% avg daily
            </span>
          </div>
          <LineChart
            data={data?.revenue?.map((d) => ({
              label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              value: d.amount,
            })) || []}
            color="#22c55e"
            height={280}
          />
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">User Growth</h3>
            <span className="text-primary-400 text-sm">
              {formatNumber(data?.metrics?.totalPlayers || 0)} total
            </span>
          </div>
          <LineChart
            data={data?.growth?.map((d) => ({
              label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              value: d.players,
            })) || []}
            color="#8b5cf6"
            height={280}
          />
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Retention Rates</h3>
          <BarChart data={retentionData} height={200} />
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {retentionData.map((item) => (
              <div key={item.label}>
                <p className="text-2xl font-bold text-white">{item.value}%</p>
                <p className="text-xs text-gray-500">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Platform Distribution</h3>
          <PieChart data={platformData} size={150} />
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Revenue by Type</h3>
          <PieChart data={revenueByType} size={150} />
        </div>
      </div>

      {/* Hourly Activity */}
      <div className="card p-6 mb-8">
        <h3 className="text-lg font-semibold text-white mb-4">Hourly Activity (Today)</h3>
        <LineChart data={hourlyActivity} color="#6366f1" height={200} />
      </div>

      {/* Metrics Detail */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-lg bg-primary-600/20">
              <Users className="text-primary-400" size={24} />
            </div>
            <div>
              <p className="text-gray-400 text-sm">DAU / MAU</p>
              <p className="text-xl font-bold text-white">
                {((data?.metrics?.dailyActive || 0) / (data?.metrics?.monthlyActive || 1) * 100).toFixed(1)}%
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Stickiness ratio - how often monthly users engage daily
          </p>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-lg bg-green-600/20">
              <DollarSign className="text-green-400" size={24} />
            </div>
            <div>
              <p className="text-gray-400 text-sm">LTV</p>
              <p className="text-xl font-bold text-white">
                {formatCurrency((data?.metrics?.totalRevenue || 0) / (data?.metrics?.totalPlayers || 1) * 3)}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Estimated lifetime value per user
          </p>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-lg bg-yellow-600/20">
              <Target className="text-yellow-400" size={24} />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Conversion Rate</p>
              <p className="text-xl font-bold text-white">4.2%</p>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Users who made at least one purchase
          </p>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-lg bg-blue-600/20">
              <Gamepad2 className="text-blue-400" size={24} />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Matches/User</p>
              <p className="text-xl font-bold text-white">
                {((data?.metrics?.totalMatches || 0) / (data?.metrics?.totalPlayers || 1)).toFixed(1)}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Average matches played per user
          </p>
        </div>
      </div>
    </div>
  );
}
