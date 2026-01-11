import { useState, useEffect } from 'react';
import {
  Users,
  DollarSign,
  Gamepad2,
  TrendingUp,
  Activity,
  Clock,
} from 'lucide-react';
import { api } from '../services/api';
import { StatCard } from '../components/StatCard';
import { LineChart, BarChart, PieChart } from '../components/Chart';
import { DataTable } from '../components/DataTable';

interface Metrics {
  totalPlayers: number;
  dailyActive: number;
  weeklyActive: number;
  monthlyActive: number;
  currentlyOnline: number;
  totalRevenue: number;
  dailyRevenue: number;
  weeklyRevenue: number;
  totalMatches: number;
  avgSessionLength: number;
  retentionD1: number;
  retentionD7: number;
  retentionD30: number;
}

interface RevenueData {
  date: string;
  amount: number;
}

interface GrowthData {
  date: string;
  players: number;
  matches: number;
}

interface TopPlayer {
  id: string;
  username: string;
  trophies: number;
  total_spent: number;
  matches_played: number;
}

export function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [growthData, setGrowthData] = useState<GrowthData[]>([]);
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [metricsRes, revenueRes, growthRes, playersRes] = await Promise.all([
        api.getMetrics(),
        api.getRevenue(30),
        api.getGrowth(30),
        api.getTopPlayers(10),
      ]);

      setMetrics(metricsRes);
      setRevenueData(revenueRes.data || []);
      setGrowthData(growthRes.data || []);
      setTopPlayers(playersRes.players || []);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
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
    { label: 'D1', value: metrics?.retentionD1 || 0, color: '#8b5cf6' },
    { label: 'D7', value: metrics?.retentionD7 || 0, color: '#6366f1' },
    { label: 'D30', value: metrics?.retentionD30 || 0, color: '#a855f7' },
  ];

  const platformData = [
    { label: 'iOS', value: 45, color: '#8b5cf6' },
    { label: 'Android', value: 40, color: '#22c55e' },
    { label: 'Web', value: 15, color: '#f59e0b' },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-500">Overview of your game metrics</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Players"
          value={formatNumber(metrics?.totalPlayers || 0)}
          icon={Users}
          change={12.5}
          color="primary"
        />
        <StatCard
          title="Daily Active"
          value={formatNumber(metrics?.dailyActive || 0)}
          icon={Activity}
          change={8.2}
          color="green"
        />
        <StatCard
          title="Currently Online"
          value={formatNumber(metrics?.currentlyOnline || 0)}
          icon={Gamepad2}
          change={-2.4}
          color="blue"
        />
        <StatCard
          title="Daily Revenue"
          value={formatCurrency(metrics?.dailyRevenue || 0)}
          icon={DollarSign}
          change={15.8}
          color="yellow"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue Chart */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Revenue (30 days)</h3>
          <LineChart
            data={revenueData.map((d) => ({
              label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              value: d.amount,
            }))}
            color="#22c55e"
            height={250}
          />
        </div>

        {/* Player Growth Chart */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Player Growth (30 days)</h3>
          <LineChart
            data={growthData.map((d) => ({
              label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              value: d.players,
            }))}
            color="#8b5cf6"
            height={250}
          />
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-lg bg-primary-600/20">
              <TrendingUp className="text-primary-400" size={24} />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Monthly Active</p>
              <p className="text-2xl font-bold text-white">{formatNumber(metrics?.monthlyActive || 0)}</p>
            </div>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">WAU</span>
            <span className="text-white">{formatNumber(metrics?.weeklyActive || 0)}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-lg bg-green-600/20">
              <DollarSign className="text-green-400" size={24} />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Total Revenue</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(metrics?.totalRevenue || 0)}</p>
            </div>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Weekly</span>
            <span className="text-white">{formatCurrency(metrics?.weeklyRevenue || 0)}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-lg bg-blue-600/20">
              <Clock className="text-blue-400" size={24} />
            </div>
            <div>
              <p className="text-gray-400 text-sm">Avg. Session</p>
              <p className="text-2xl font-bold text-white">{Math.round(metrics?.avgSessionLength || 0)} min</p>
            </div>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Total Matches</span>
            <span className="text-white">{formatNumber(metrics?.totalMatches || 0)}</span>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Retention */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Retention Rates</h3>
          <BarChart data={retentionData} height={180} />
        </div>

        {/* Platform Distribution */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Platform Distribution</h3>
          <PieChart data={platformData} size={140} />
        </div>

        {/* Top Players */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Top Players</h3>
          <div className="space-y-3">
            {topPlayers.slice(0, 5).map((player, index) => (
              <div key={player.id} className="flex items-center gap-3">
                <span className="text-gray-500 w-6">{index + 1}.</span>
                <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-sm font-medium">
                  {player.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{player.username}</p>
                  <p className="text-gray-500 text-xs">{player.trophies} trophies</p>
                </div>
                <span className="text-green-400 text-sm">${player.total_spent}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
