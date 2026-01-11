import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  Users,
  DollarSign,
  Gamepad2,
  Clock,
  Target,
  RefreshCw,
  Activity,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  PieChart as PieChartIcon,
  Filter,
  Layers,
} from 'lucide-react';
import { api } from '../services/api';
import { StatCard } from '../components/StatCard';
import { LineChart, BarChart, PieChart } from '../components/Chart';

type TabType = 'overview' | 'cohorts' | 'funnels' | 'revenue';

interface OverviewData {
  userMetrics: {
    dau: number;
    mau: number;
    newUsersToday: number;
    onlineNow: number;
    sessionsToday: number;
  };
  revenueMetrics: {
    revenueToday: number;
    revenueWeek: number;
    revenueMonth: number;
    revenueTotal: number;
    arpu: number;
    arppu: number;
    ltv: number;
    conversionRate: number;
    payingUsers: number;
    totalUsers: number;
  };
  engagementMetrics: {
    avgSessionLength: number;
    sessionsPerUser: number;
    retentionD1: number;
    retentionD7: number;
    retentionD30: number;
    matchesPlayed: number;
    avgMatchesPerUser: number;
    winRateAvg: number;
  };
}

interface RealtimeData {
  onlineNow: number;
  activeMatches: number;
  sessionsToday: number;
  matchesToday: number;
  revenueToday: number;
}

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [dateRange, setDateRange] = useState(30);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [realtime, setRealtime] = useState<RealtimeData | null>(null);
  const [dauTrend, setDauTrend] = useState<any[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<any[]>([]);
  const [revenueBreakdown, setRevenueBreakdown] = useState<any>(null);
  const [cohortRetention, setCohortRetention] = useState<any>(null);
  const [cohortRevenue, setCohortRevenue] = useState<any>(null);
  const [funnels, setFunnels] = useState<any>(null);
  const [selectedFunnel, setSelectedFunnel] = useState<any>(null);
  const [hourlyActivity, setHourlyActivity] = useState<any[]>([]);
  const [matchStats, setMatchStats] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<any>(null);
  const [topSpenders, setTopSpenders] = useState<any[]>([]);
  const [ltvDistribution, setLTVDistribution] = useState<any>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Load overview data
  const loadOverview = useCallback(async () => {
    try {
      const [overviewData, realtimeData, dauData, revenueData, hourlyData] = await Promise.all([
        api.getAnalyticsOverview(),
        api.getRealtimeMetrics(),
        api.getDAUTrend(dateRange),
        api.getRevenueTrend(dateRange),
        api.getHourlyActivity(7),
      ]);

      setOverview(overviewData);
      setRealtime(realtimeData);
      setDauTrend(dauData.data || []);
      setRevenueTrend(revenueData.data || []);
      setHourlyActivity(hourlyData.byHour || []);
    } catch (error) {
      console.error('Failed to load overview:', error);
    }
  }, [dateRange]);

  // Load cohort data
  const loadCohorts = useCallback(async () => {
    try {
      const [retention, revenue] = await Promise.all([
        api.getCohortRetention(8),
        api.getCohortRevenue(8),
      ]);
      setCohortRetention(retention);
      setCohortRevenue(revenue);
    } catch (error) {
      console.error('Failed to load cohorts:', error);
    }
  }, []);

  // Load funnel data
  const loadFunnels = useCallback(async () => {
    try {
      const [funnelsOverview, tutorialFunnel] = await Promise.all([
        api.getFunnelsOverview(dateRange),
        api.getTutorialFunnel(dateRange),
      ]);
      setFunnels(funnelsOverview);
      setSelectedFunnel(tutorialFunnel);
    } catch (error) {
      console.error('Failed to load funnels:', error);
    }
  }, [dateRange]);

  // Load revenue data
  const loadRevenue = useCallback(async () => {
    try {
      const [breakdown, subs, spenders, ltv, matches] = await Promise.all([
        api.getRevenueBreakdown(dateRange),
        api.getSubscriptionMetrics(),
        api.getTopSpenders(10),
        api.getLTVDistribution(),
        api.getMatchStats(dateRange),
      ]);
      setRevenueBreakdown(breakdown);
      setSubscriptions(subs);
      setTopSpenders(spenders.spenders || []);
      setLTVDistribution(ltv);
      setMatchStats(matches);
    } catch (error) {
      console.error('Failed to load revenue:', error);
    }
  }, [dateRange]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await loadOverview();
      if (activeTab === 'cohorts') await loadCohorts();
      if (activeTab === 'funnels') await loadFunnels();
      if (activeTab === 'revenue') await loadRevenue();
      setLoading(false);
    };
    loadData();
  }, [activeTab, dateRange, loadOverview, loadCohorts, loadFunnels, loadRevenue]);

  // Auto-refresh realtime data
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(async () => {
      try {
        const data = await api.getRealtimeMetrics();
        setRealtime(data);
      } catch (error) {
        console.error('Realtime refresh failed:', error);
      }
    }, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ${mins % 60}m`;
    }
    return `${mins}m ${secs}s`;
  };

  const loadFunnelData = async (endpoint: string) => {
    try {
      let data;
      switch (endpoint) {
        case '/tutorial':
          data = await api.getTutorialFunnel(dateRange);
          break;
        case '/first-purchase':
          data = await api.getFirstPurchaseFunnel(dateRange);
          break;
        case '/battle-pass':
          data = await api.getBattlePassFunnel(dateRange);
          break;
        case '/subscription':
          data = await api.getSubscriptionFunnel(dateRange);
          break;
        case '/social':
          data = await api.getSocialFunnel(dateRange);
          break;
        case '/ranked':
          data = await api.getRankedFunnel(dateRange);
          break;
        default:
          data = await api.getTutorialFunnel(dateRange);
      }
      setSelectedFunnel(data);
    } catch (error) {
      console.error('Failed to load funnel:', error);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const retentionData = [
    { label: 'D1', value: overview?.engagementMetrics?.retentionD1 || 0, color: '#8b5cf6' },
    { label: 'D7', value: overview?.engagementMetrics?.retentionD7 || 0, color: '#6366f1' },
    { label: 'D30', value: overview?.engagementMetrics?.retentionD30 || 0, color: '#a855f7' },
  ];

  const revenueByTypeData = revenueBreakdown?.breakdown?.map((b: any, i: number) => ({
    label: b.productType,
    value: b.percentage,
    color: ['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'][i % 5],
  })) || [];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics Dashboard</h1>
          <p className="text-gray-500">Comprehensive game performance metrics</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`btn ${autoRefresh ? 'btn-primary' : 'btn-secondary'} flex items-center gap-2`}
          >
            <RefreshCw size={16} className={autoRefresh ? 'animate-spin' : ''} />
            {autoRefresh ? 'Live' : 'Auto-refresh'}
          </button>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(parseInt(e.target.value))}
            className="input"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8">
        {[
          { id: 'overview', label: 'Overview', icon: Activity },
          { id: 'cohorts', label: 'Cohorts', icon: Layers },
          { id: 'funnels', label: 'Funnels', icon: Filter },
          { id: 'revenue', label: 'Revenue', icon: DollarSign },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-primary-600 text-white'
                : 'bg-dark-700 text-gray-400 hover:text-white'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Real-time Stats Bar */}
      {realtime && (
        <div className="card p-4 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm text-gray-400">Real-time</span>
          </div>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <Zap className="text-yellow-400" size={16} />
              <span className="text-white font-medium">{realtime.onlineNow}</span>
              <span className="text-gray-500 text-sm">online</span>
            </div>
            <div className="flex items-center gap-2">
              <Gamepad2 className="text-blue-400" size={16} />
              <span className="text-white font-medium">{realtime.activeMatches}</span>
              <span className="text-gray-500 text-sm">active matches</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="text-purple-400" size={16} />
              <span className="text-white font-medium">{realtime.sessionsToday}</span>
              <span className="text-gray-500 text-sm">sessions today</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="text-green-400" size={16} />
              <span className="text-white font-medium">{formatCurrency(realtime.revenueToday)}</span>
              <span className="text-gray-500 text-sm">revenue today</span>
            </div>
          </div>
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && overview && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
              title="DAU"
              value={formatNumber(overview.userMetrics.dau)}
              icon={Users}
              change={8.5}
              color="primary"
            />
            <StatCard
              title="MAU"
              value={formatNumber(overview.userMetrics.mau)}
              icon={Users}
              change={5.2}
              color="blue"
            />
            <StatCard
              title="Revenue (Month)"
              value={formatCurrency(overview.revenueMetrics.revenueMonth)}
              icon={DollarSign}
              change={12.3}
              color="green"
            />
            <StatCard
              title="ARPU"
              value={formatCurrency(overview.revenueMetrics.arpu)}
              icon={TrendingUp}
              change={3.8}
              color="yellow"
            />
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">DAU Trend</h3>
                <span className="text-primary-400 text-sm">
                  {formatNumber(overview.userMetrics.dau)} active today
                </span>
              </div>
              <LineChart
                data={dauTrend.map((d: any) => ({
                  label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                  value: d.dau,
                }))}
                color="#8b5cf6"
                height={280}
              />
            </div>

            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Revenue Trend</h3>
                <span className="text-green-400 text-sm">
                  {formatCurrency(overview.revenueMetrics.revenueTotal)} total
                </span>
              </div>
              <LineChart
                data={revenueTrend.map((d: any) => ({
                  label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                  value: d.revenue,
                }))}
                color="#22c55e"
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
              <h3 className="text-lg font-semibold text-white mb-4">Revenue Metrics</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Conversion Rate</span>
                  <span className="text-white font-medium">{overview.revenueMetrics.conversionRate}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">ARPPU</span>
                  <span className="text-white font-medium">{formatCurrency(overview.revenueMetrics.arppu)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Est. LTV</span>
                  <span className="text-white font-medium">{formatCurrency(overview.revenueMetrics.ltv)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Paying Users</span>
                  <span className="text-white font-medium">{formatNumber(overview.revenueMetrics.payingUsers)}</span>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Engagement</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Avg Session</span>
                  <span className="text-white font-medium">{formatDuration(overview.engagementMetrics.avgSessionLength)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Sessions/User</span>
                  <span className="text-white font-medium">{overview.engagementMetrics.sessionsPerUser}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Matches Today</span>
                  <span className="text-white font-medium">{formatNumber(overview.engagementMetrics.matchesPlayed)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Avg Win Rate</span>
                  <span className="text-white font-medium">{overview.engagementMetrics.winRateAvg}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Hourly Activity */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Hourly Activity Distribution (Last 7 Days)</h3>
            <LineChart
              data={hourlyActivity.map((h: any) => ({
                label: `${h.hour}:00`,
                value: h.users,
              }))}
              color="#6366f1"
              height={200}
            />
          </div>
        </>
      )}

      {/* Cohorts Tab */}
      {activeTab === 'cohorts' && cohortRetention && (
        <>
          <div className="card p-6 mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">Cohort Retention Analysis</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400 text-sm">
                    <th className="pb-4">Cohort</th>
                    <th className="pb-4">Size</th>
                    {cohortRetention.retentionDays?.map((day: number) => (
                      <th key={day} className="pb-4 text-center">D{day}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohortRetention.cohorts?.map((cohort: any, i: number) => (
                    <tr key={i} className="border-t border-dark-600">
                      <td className="py-3 text-white">{cohort.cohortLabel}</td>
                      <td className="py-3 text-gray-400">{formatNumber(cohort.cohortSize)}</td>
                      {cohort.retention?.map((ret: number | null, j: number) => (
                        <td key={j} className="py-3 text-center">
                          {ret !== null ? (
                            <span
                              className={`px-2 py-1 rounded text-sm ${
                                ret >= 30
                                  ? 'bg-green-500/20 text-green-400'
                                  : ret >= 15
                                  ? 'bg-yellow-500/20 text-yellow-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}
                            >
                              {ret}%
                            </span>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {cohortRevenue && (
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Cohort LTV Analysis</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-400 text-sm">
                      <th className="pb-4">Cohort</th>
                      <th className="pb-4">Size</th>
                      {cohortRevenue.revenueDays?.map((day: number) => (
                        <th key={day} className="pb-4 text-center">D{day} LTV</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohortRevenue.cohorts?.map((cohort: any, i: number) => (
                      <tr key={i} className="border-t border-dark-600">
                        <td className="py-3 text-white">{cohort.cohortLabel}</td>
                        <td className="py-3 text-gray-400">{formatNumber(cohort.cohortSize)}</td>
                        {cohort.ltv?.map((ltv: number | null, j: number) => (
                          <td key={j} className="py-3 text-center">
                            {ltv !== null ? (
                              <span className="text-green-400">{formatCurrency(ltv)}</span>
                            ) : (
                              <span className="text-gray-600">-</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Funnels Tab */}
      {activeTab === 'funnels' && funnels && (
        <>
          {/* Funnel Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {funnels.funnels?.map((funnel: any) => (
              <button
                key={funnel.name}
                onClick={() => loadFunnelData(funnel.endpoint)}
                className={`card p-4 text-left hover:ring-2 hover:ring-primary-500 transition-all ${
                  selectedFunnel?.name === funnel.name ? 'ring-2 ring-primary-500' : ''
                }`}
              >
                <p className="text-gray-400 text-sm mb-1">{funnel.name}</p>
                <p className="text-2xl font-bold text-white">{funnel.conversionRate}%</p>
                <p className="text-xs text-gray-500">{formatNumber(funnel.completed)} converted</p>
              </button>
            ))}
          </div>

          {/* Selected Funnel Detail */}
          {selectedFunnel && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-white">{selectedFunnel.name}</h3>
                  <p className="text-gray-500">
                    {formatNumber(selectedFunnel.totalStarted)} started,{' '}
                    {formatNumber(selectedFunnel.totalCompleted)} completed ({selectedFunnel.overallConversion}% overall)
                  </p>
                </div>
              </div>

              {/* Funnel Visualization */}
              <div className="space-y-4">
                {selectedFunnel.steps?.map((step: any, i: number) => (
                  <div key={i} className="relative">
                    <div className="flex items-center gap-4">
                      <div className="w-32 text-right text-gray-400 text-sm">{step.step}</div>
                      <div className="flex-1">
                        <div
                          className="h-10 bg-primary-600/30 rounded relative overflow-hidden"
                          style={{ width: `${step.conversionRate}%` }}
                        >
                          <div
                            className="absolute inset-0 bg-primary-600"
                            style={{ width: `${100 - step.dropoffRate}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-24 text-right">
                        <p className="text-white font-medium">{formatNumber(step.count)}</p>
                        <p className="text-gray-500 text-xs">{step.conversionRate}%</p>
                      </div>
                      <div className="w-20 text-right">
                        {step.dropoffRate > 0 && (
                          <span className="text-red-400 text-sm flex items-center justify-end gap-1">
                            <ArrowDownRight size={14} />
                            {step.dropoffRate}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Revenue Tab */}
      {activeTab === 'revenue' && (
        <>
          {/* Revenue Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
              title="Revenue Today"
              value={formatCurrency(overview?.revenueMetrics.revenueToday || 0)}
              icon={DollarSign}
              change={0}
              color="green"
            />
            <StatCard
              title="Revenue This Week"
              value={formatCurrency(overview?.revenueMetrics.revenueWeek || 0)}
              icon={TrendingUp}
              change={0}
              color="blue"
            />
            <StatCard
              title="Revenue This Month"
              value={formatCurrency(overview?.revenueMetrics.revenueMonth || 0)}
              icon={BarChart3}
              change={0}
              color="primary"
            />
            <StatCard
              title="Total Revenue"
              value={formatCurrency(overview?.revenueMetrics.revenueTotal || 0)}
              icon={PieChartIcon}
              change={0}
              color="yellow"
            />
          </div>

          {/* Revenue Breakdown & Subscriptions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Revenue by Product Type</h3>
              {revenueByTypeData.length > 0 ? (
                <PieChart data={revenueByTypeData} size={180} />
              ) : (
                <p className="text-gray-500">No revenue data available</p>
              )}
            </div>

            <div className="card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Subscription Metrics</h3>
              {subscriptions ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Total Active</span>
                    <span className="text-white font-medium">{subscriptions.totalActive}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">MRR</span>
                    <span className="text-green-400 font-medium">{formatCurrency(subscriptions.mrr)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">ARR</span>
                    <span className="text-green-400 font-medium">{formatCurrency(subscriptions.arr)}</span>
                  </div>
                  <div className="border-t border-dark-600 pt-4 mt-4">
                    <p className="text-gray-400 text-sm mb-2">By Tier</p>
                    {subscriptions.byTier?.map((tier: any) => (
                      <div key={tier.tier} className="flex justify-between items-center py-1">
                        <span className="text-white capitalize">{tier.tier}</span>
                        <span className="text-gray-400">{tier.count} ({tier.percentage}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">Loading subscriptions...</p>
              )}
            </div>
          </div>

          {/* Top Spenders & LTV Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Top Spenders</h3>
              <div className="space-y-3">
                {topSpenders.map((spender: any) => (
                  <div key={spender.userId} className="flex items-center justify-between py-2 border-b border-dark-600">
                    <div className="flex items-center gap-3">
                      <span className="text-primary-400 font-bold">#{spender.rank}</span>
                      <span className="text-white">{spender.username}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-green-400 font-medium">{formatCurrency(spender.totalSpent)}</p>
                      <p className="text-gray-500 text-xs">{spender.purchaseCount} purchases</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">LTV Distribution</h3>
              {ltvDistribution?.distribution ? (
                <div className="space-y-3">
                  {ltvDistribution.distribution.map((bucket: any) => (
                    <div key={bucket.bracket} className="flex items-center gap-4">
                      <span className="text-gray-400 w-28 text-sm">{bucket.bracket}</span>
                      <div className="flex-1 h-6 bg-dark-700 rounded overflow-hidden">
                        <div
                          className="h-full bg-primary-600"
                          style={{ width: `${bucket.percentage}%` }}
                        />
                      </div>
                      <span className="text-white text-sm w-16 text-right">{formatNumber(bucket.userCount)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">Loading distribution...</p>
              )}
            </div>
          </div>

          {/* Match Stats */}
          {matchStats && (
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Match Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-gray-400 text-sm">Total Matches</p>
                  <p className="text-2xl font-bold text-white">{formatNumber(matchStats.totalMatches)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Avg Per Day</p>
                  <p className="text-2xl font-bold text-white">{Math.round(matchStats.avgPerDay)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Avg Duration</p>
                  <p className="text-2xl font-bold text-white">{formatDuration(matchStats.avgDuration)}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">By Mode</p>
                  <div className="text-sm">
                    {matchStats.byMode?.slice(0, 3).map((mode: any) => (
                      <span key={mode.mode} className="text-gray-400 mr-2">
                        {mode.mode}: {mode.percentage}%
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
