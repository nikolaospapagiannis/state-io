import { Router, Response } from 'express';
import { db } from '../database';
import { AdminRequest, requireAdmin, requirePermission, PERMISSIONS } from './auth';

const router = Router();

// Apply admin auth to all routes
router.use(requireAdmin);

// ============ TYPES ============

interface UserMetrics {
  dau: number;
  mau: number;
  newUsersToday: number;
  onlineNow: number;
  sessionsToday: number;
}

interface RevenueMetrics {
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
}

interface EngagementMetrics {
  avgSessionLength: number;
  sessionsPerUser: number;
  retentionD1: number;
  retentionD7: number;
  retentionD30: number;
  matchesPlayed: number;
  avgMatchesPerUser: number;
  winRateAvg: number;
}

interface TimeSeriesDataPoint {
  date: string;
  value: number;
}

interface RevenueByProduct {
  productType: string;
  revenue: number;
  count: number;
  percentage: number;
}

// ============ PREPARED STATEMENTS ============

const analyticsQueries = {
  // DAU - Unique players with sessions today
  getDAU: db.prepare(`
    SELECT COUNT(DISTINCT player_id) as count
    FROM player_sessions
    WHERE start_time >= ?
  `),

  // MAU - Unique players with sessions in last 30 days
  getMAU: db.prepare(`
    SELECT COUNT(DISTINCT player_id) as count
    FROM player_sessions
    WHERE start_time >= ?
  `),

  // New users today
  getNewUsersToday: db.prepare(`
    SELECT COUNT(*) as count
    FROM users
    WHERE created_at >= ?
  `),

  // New users in range
  getNewUsersInRange: db.prepare(`
    SELECT date(created_at, 'unixepoch') as date, COUNT(*) as count
    FROM users
    WHERE created_at >= ? AND created_at < ?
    GROUP BY date(created_at, 'unixepoch')
    ORDER BY date ASC
  `),

  // Online users (active sessions within last 5 minutes)
  getOnlineNow: db.prepare(`
    SELECT COUNT(DISTINCT player_id) as count
    FROM player_sessions
    WHERE end_time IS NULL OR end_time >= ?
  `),

  // Sessions today
  getSessionsToday: db.prepare(`
    SELECT COUNT(*) as count
    FROM player_sessions
    WHERE start_time >= ?
  `),

  // Average session length
  getAvgSessionLength: db.prepare(`
    SELECT AVG(CASE WHEN end_time IS NOT NULL THEN end_time - start_time ELSE 0 END) as avg_duration
    FROM player_sessions
    WHERE start_time >= ? AND end_time IS NOT NULL
  `),

  // Sessions per user
  getSessionsPerUser: db.prepare(`
    SELECT AVG(session_count) as avg_sessions
    FROM (
      SELECT player_id, COUNT(*) as session_count
      FROM player_sessions
      WHERE start_time >= ?
      GROUP BY player_id
    )
  `),

  // Revenue today
  getRevenueToday: db.prepare(`
    SELECT COALESCE(SUM(price_cents), 0) / 100.0 as revenue
    FROM purchases
    WHERE status = 'completed' AND created_at >= ?
  `),

  // Revenue in range
  getRevenueInRange: db.prepare(`
    SELECT COALESCE(SUM(price_cents), 0) / 100.0 as revenue
    FROM purchases
    WHERE status = 'completed' AND created_at >= ? AND created_at < ?
  `),

  // Total revenue
  getTotalRevenue: db.prepare(`
    SELECT COALESCE(SUM(price_cents), 0) / 100.0 as revenue
    FROM purchases
    WHERE status = 'completed'
  `),

  // Daily revenue series
  getDailyRevenue: db.prepare(`
    SELECT date(created_at, 'unixepoch') as date,
           SUM(price_cents) / 100.0 as revenue,
           COUNT(*) as transactions
    FROM purchases
    WHERE status = 'completed' AND created_at >= ?
    GROUP BY date(created_at, 'unixepoch')
    ORDER BY date ASC
  `),

  // Revenue by product type
  getRevenueByProduct: db.prepare(`
    SELECT product_type,
           SUM(price_cents) / 100.0 as revenue,
           COUNT(*) as count
    FROM purchases
    WHERE status = 'completed' AND created_at >= ?
    GROUP BY product_type
    ORDER BY revenue DESC
  `),

  // Paying users count
  getPayingUsersCount: db.prepare(`
    SELECT COUNT(DISTINCT user_id) as count
    FROM purchases
    WHERE status = 'completed'
  `),

  // Total users count
  getTotalUsersCount: db.prepare(`
    SELECT COUNT(*) as count FROM users
  `),

  // ARPPU (Average Revenue Per Paying User)
  getARPPU: db.prepare(`
    SELECT AVG(total_spent) as arppu
    FROM (
      SELECT user_id, SUM(price_cents) / 100.0 as total_spent
      FROM purchases
      WHERE status = 'completed'
      GROUP BY user_id
    )
  `),

  // Matches played today
  getMatchesToday: db.prepare(`
    SELECT COUNT(*) as count
    FROM matches
    WHERE created_at >= ?
  `),

  // Daily matches series
  getDailyMatches: db.prepare(`
    SELECT date(created_at, 'unixepoch') as date, COUNT(*) as count
    FROM matches
    WHERE created_at >= ?
    GROUP BY date(created_at, 'unixepoch')
    ORDER BY date ASC
  `),

  // Average win rate
  getAvgWinRate: db.prepare(`
    SELECT AVG(CASE WHEN wins + losses > 0 THEN wins * 100.0 / (wins + losses) ELSE 50 END) as avg_win_rate
    FROM users
    WHERE wins + losses > 0
  `),

  // Daily DAU series
  getDailyDAU: db.prepare(`
    SELECT date(start_time, 'unixepoch') as date,
           COUNT(DISTINCT player_id) as count
    FROM player_sessions
    WHERE start_time >= ?
    GROUP BY date(start_time, 'unixepoch')
    ORDER BY date ASC
  `),

  // Retention D1 - Users who returned on day 2
  getRetentionD1: db.prepare(`
    SELECT
      CAST(COUNT(DISTINCT CASE WHEN ps.player_id IS NOT NULL THEN u.id END) AS REAL) /
      NULLIF(COUNT(DISTINCT u.id), 0) * 100 as retention
    FROM users u
    LEFT JOIN player_sessions ps ON u.id = ps.player_id
      AND ps.start_time >= u.created_at + 86400
      AND ps.start_time < u.created_at + 172800
    WHERE u.created_at >= ? AND u.created_at < ?
  `),

  // Retention D7 - Users who returned on day 7-8
  getRetentionD7: db.prepare(`
    SELECT
      CAST(COUNT(DISTINCT CASE WHEN ps.player_id IS NOT NULL THEN u.id END) AS REAL) /
      NULLIF(COUNT(DISTINCT u.id), 0) * 100 as retention
    FROM users u
    LEFT JOIN player_sessions ps ON u.id = ps.player_id
      AND ps.start_time >= u.created_at + 604800
      AND ps.start_time < u.created_at + 691200
    WHERE u.created_at >= ? AND u.created_at < ?
  `),

  // Retention D30 - Users who returned on day 30-31
  getRetentionD30: db.prepare(`
    SELECT
      CAST(COUNT(DISTINCT CASE WHEN ps.player_id IS NOT NULL THEN u.id END) AS REAL) /
      NULLIF(COUNT(DISTINCT u.id), 0) * 100 as retention
    FROM users u
    LEFT JOIN player_sessions ps ON u.id = ps.player_id
      AND ps.start_time >= u.created_at + 2592000
      AND ps.start_time < u.created_at + 2678400
    WHERE u.created_at >= ? AND u.created_at < ?
  `),

  // Get subscription metrics
  getActiveSubscriptions: db.prepare(`
    SELECT tier, COUNT(*) as count
    FROM subscriptions
    WHERE status = 'active' AND expires_at > strftime('%s', 'now')
    GROUP BY tier
  `),

  // Get subscription revenue
  getSubscriptionRevenue: db.prepare(`
    SELECT tier,
           SUM(price_cents) / 100.0 as revenue,
           COUNT(*) as count
    FROM subscriptions
    WHERE status = 'active'
    GROUP BY tier
  `),

  // Top spenders
  getTopSpenders: db.prepare(`
    SELECT u.id, u.username, u.avatar,
           SUM(p.price_cents) / 100.0 as total_spent,
           COUNT(p.id) as purchase_count,
           MAX(p.created_at) as last_purchase
    FROM purchases p
    JOIN users u ON p.user_id = u.id
    WHERE p.status = 'completed'
    GROUP BY u.id
    ORDER BY total_spent DESC
    LIMIT ?
  `),

  // Get hourly activity (CCU distribution)
  getHourlyActivity: db.prepare(`
    SELECT strftime('%H', start_time, 'unixepoch') as hour,
           COUNT(DISTINCT player_id) as unique_users
    FROM player_sessions
    WHERE start_time >= ?
    GROUP BY hour
    ORDER BY hour ASC
  `),

  // Peak CCU
  getPeakCCU: db.prepare(`
    SELECT MAX(concurrent) as peak_ccu
    FROM (
      SELECT COUNT(DISTINCT player_id) as concurrent
      FROM player_sessions
      WHERE start_time >= ?
      GROUP BY strftime('%Y-%m-%d %H', start_time, 'unixepoch')
    )
  `),
};

// ============ HELPER FUNCTIONS ============

function getTodayStartTimestamp(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor(now.getTime() / 1000);
}

function getWeekAgoTimestamp(): number {
  return Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
}

function getMonthAgoTimestamp(): number {
  return Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
}

function getTimestampDaysAgo(days: number): number {
  return Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
}

// ============ API ROUTES ============

// GET /api/admin/analytics/overview - Main dashboard metrics
router.get('/overview', requirePermission(PERMISSIONS.VIEW_ANALYTICS), (req: AdminRequest, res: Response) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const todayStart = getTodayStartTimestamp();
    const weekAgo = getWeekAgoTimestamp();
    const monthAgo = getMonthAgoTimestamp();
    const fiveMinutesAgo = now - 300;

    // User metrics
    const dauResult = analyticsQueries.getDAU.get(todayStart) as { count: number };
    const mauResult = analyticsQueries.getMAU.get(monthAgo) as { count: number };
    const newUsersResult = analyticsQueries.getNewUsersToday.get(todayStart) as { count: number };
    const onlineResult = analyticsQueries.getOnlineNow.get(fiveMinutesAgo) as { count: number };
    const sessionsResult = analyticsQueries.getSessionsToday.get(todayStart) as { count: number };

    const userMetrics: UserMetrics = {
      dau: dauResult.count,
      mau: mauResult.count,
      newUsersToday: newUsersResult.count,
      onlineNow: onlineResult.count,
      sessionsToday: sessionsResult.count,
    };

    // Revenue metrics
    const revenueTodayResult = analyticsQueries.getRevenueToday.get(todayStart) as { revenue: number };
    const revenueWeekResult = analyticsQueries.getRevenueInRange.get(weekAgo, now) as { revenue: number };
    const revenueMonthResult = analyticsQueries.getRevenueInRange.get(monthAgo, now) as { revenue: number };
    const totalRevenueResult = analyticsQueries.getTotalRevenue.get() as { revenue: number };
    const payingUsersResult = analyticsQueries.getPayingUsersCount.get() as { count: number };
    const totalUsersResult = analyticsQueries.getTotalUsersCount.get() as { count: number };
    const arppuResult = analyticsQueries.getARPPU.get() as { arppu: number | null };

    const arpu = totalUsersResult.count > 0
      ? totalRevenueResult.revenue / totalUsersResult.count
      : 0;
    const arppu = arppuResult.arppu || 0;
    const conversionRate = totalUsersResult.count > 0
      ? (payingUsersResult.count / totalUsersResult.count) * 100
      : 0;
    // Simplified LTV estimate: ARPPU * estimated months * retention factor
    const ltv = arppu * 6 * 0.3;

    const revenueMetrics: RevenueMetrics = {
      revenueToday: revenueTodayResult.revenue || 0,
      revenueWeek: revenueWeekResult.revenue || 0,
      revenueMonth: revenueMonthResult.revenue || 0,
      revenueTotal: totalRevenueResult.revenue || 0,
      arpu: Math.round(arpu * 100) / 100,
      arppu: Math.round(arppu * 100) / 100,
      ltv: Math.round(ltv * 100) / 100,
      conversionRate: Math.round(conversionRate * 100) / 100,
      payingUsers: payingUsersResult.count,
      totalUsers: totalUsersResult.count,
    };

    // Engagement metrics
    const avgSessionResult = analyticsQueries.getAvgSessionLength.get(monthAgo) as { avg_duration: number | null };
    const sessionsPerUserResult = analyticsQueries.getSessionsPerUser.get(monthAgo) as { avg_sessions: number | null };
    const matchesTodayResult = analyticsQueries.getMatchesToday.get(todayStart) as { count: number };
    const avgWinRateResult = analyticsQueries.getAvgWinRate.get() as { avg_win_rate: number | null };

    // Calculate retention (using cohort from 30-60 days ago for stable numbers)
    const cohortStart = getTimestampDaysAgo(60);
    const cohortEnd = getTimestampDaysAgo(30);
    const retentionD1Result = analyticsQueries.getRetentionD1.get(cohortStart, cohortEnd) as { retention: number | null };
    const retentionD7Result = analyticsQueries.getRetentionD7.get(cohortStart, cohortEnd) as { retention: number | null };
    const retentionD30Result = analyticsQueries.getRetentionD30.get(cohortStart, cohortEnd) as { retention: number | null };

    const engagementMetrics: EngagementMetrics = {
      avgSessionLength: Math.round(avgSessionResult.avg_duration || 0),
      sessionsPerUser: Math.round((sessionsPerUserResult.avg_sessions || 0) * 100) / 100,
      retentionD1: Math.round((retentionD1Result.retention || 0) * 100) / 100,
      retentionD7: Math.round((retentionD7Result.retention || 0) * 100) / 100,
      retentionD30: Math.round((retentionD30Result.retention || 0) * 100) / 100,
      matchesPlayed: matchesTodayResult.count,
      avgMatchesPerUser: userMetrics.dau > 0
        ? Math.round((matchesTodayResult.count / userMetrics.dau) * 100) / 100
        : 0,
      winRateAvg: Math.round(avgWinRateResult.avg_win_rate || 50),
    };

    res.json({
      timestamp: now,
      userMetrics,
      revenueMetrics,
      engagementMetrics,
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ error: 'Failed to get analytics overview' });
  }
});

// GET /api/admin/analytics/dau-trend - DAU over time
router.get('/dau-trend', requirePermission(PERMISSIONS.VIEW_ANALYTICS), (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(90, parseInt(req.query.days as string) || 30);
    const startTimestamp = getTimestampDaysAgo(days);

    const dauTrend = analyticsQueries.getDailyDAU.all(startTimestamp) as Array<{ date: string; count: number }>;

    res.json({
      period: `${days} days`,
      data: dauTrend.map(d => ({
        date: d.date,
        dau: d.count,
      })),
    });
  } catch (error) {
    console.error('DAU trend error:', error);
    res.status(500).json({ error: 'Failed to get DAU trend' });
  }
});

// GET /api/admin/analytics/revenue-trend - Revenue over time
router.get('/revenue-trend', requirePermission(PERMISSIONS.VIEW_REVENUE), (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(90, parseInt(req.query.days as string) || 30);
    const startTimestamp = getTimestampDaysAgo(days);

    const revenueTrend = analyticsQueries.getDailyRevenue.all(startTimestamp) as Array<{
      date: string;
      revenue: number;
      transactions: number;
    }>;

    // Calculate cumulative revenue
    let cumulative = 0;
    const dataWithCumulative = revenueTrend.map(d => {
      cumulative += d.revenue;
      return {
        date: d.date,
        revenue: Math.round(d.revenue * 100) / 100,
        transactions: d.transactions,
        cumulative: Math.round(cumulative * 100) / 100,
      };
    });

    res.json({
      period: `${days} days`,
      data: dataWithCumulative,
    });
  } catch (error) {
    console.error('Revenue trend error:', error);
    res.status(500).json({ error: 'Failed to get revenue trend' });
  }
});

// GET /api/admin/analytics/revenue-breakdown - Revenue by product type
router.get('/revenue-breakdown', requirePermission(PERMISSIONS.VIEW_REVENUE), (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(90, parseInt(req.query.days as string) || 30);
    const startTimestamp = getTimestampDaysAgo(days);

    const breakdown = analyticsQueries.getRevenueByProduct.all(startTimestamp) as Array<{
      product_type: string;
      revenue: number;
      count: number;
    }>;

    const totalRevenue = breakdown.reduce((sum, b) => sum + b.revenue, 0);

    const result: RevenueByProduct[] = breakdown.map(b => ({
      productType: b.product_type,
      revenue: Math.round(b.revenue * 100) / 100,
      count: b.count,
      percentage: totalRevenue > 0
        ? Math.round((b.revenue / totalRevenue) * 10000) / 100
        : 0,
    }));

    res.json({
      period: `${days} days`,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      breakdown: result,
    });
  } catch (error) {
    console.error('Revenue breakdown error:', error);
    res.status(500).json({ error: 'Failed to get revenue breakdown' });
  }
});

// GET /api/admin/analytics/subscriptions - Subscription metrics
router.get('/subscriptions', requirePermission(PERMISSIONS.VIEW_REVENUE), (req: AdminRequest, res: Response) => {
  try {
    const activeSubscriptions = analyticsQueries.getActiveSubscriptions.all() as Array<{
      tier: string;
      count: number;
    }>;

    const subscriptionRevenue = analyticsQueries.getSubscriptionRevenue.all() as Array<{
      tier: string;
      revenue: number;
      count: number;
    }>;

    const totalActive = activeSubscriptions.reduce((sum, s) => sum + s.count, 0);
    const totalMRR = activeSubscriptions.reduce((sum, s) => {
      const tierPrices: Record<string, number> = { plus: 4.99, pro: 9.99, elite: 19.99 };
      return sum + (s.count * (tierPrices[s.tier] || 0));
    }, 0);

    res.json({
      totalActive,
      mrr: Math.round(totalMRR * 100) / 100,
      arr: Math.round(totalMRR * 12 * 100) / 100,
      byTier: activeSubscriptions.map(s => ({
        tier: s.tier,
        count: s.count,
        percentage: totalActive > 0
          ? Math.round((s.count / totalActive) * 10000) / 100
          : 0,
      })),
      lifetimeRevenue: subscriptionRevenue.map(s => ({
        tier: s.tier,
        revenue: Math.round(s.revenue * 100) / 100,
        subscriptions: s.count,
      })),
    });
  } catch (error) {
    console.error('Subscription metrics error:', error);
    res.status(500).json({ error: 'Failed to get subscription metrics' });
  }
});

// GET /api/admin/analytics/top-spenders - Top spending users
router.get('/top-spenders', requirePermission(PERMISSIONS.VIEW_REVENUE), (req: AdminRequest, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

    const topSpenders = analyticsQueries.getTopSpenders.all(limit) as Array<{
      id: string;
      username: string;
      avatar: string;
      total_spent: number;
      purchase_count: number;
      last_purchase: number;
    }>;

    res.json({
      spenders: topSpenders.map((s, i) => ({
        rank: i + 1,
        userId: s.id,
        username: s.username,
        avatar: s.avatar,
        totalSpent: Math.round(s.total_spent * 100) / 100,
        purchaseCount: s.purchase_count,
        avgPurchase: s.purchase_count > 0
          ? Math.round((s.total_spent / s.purchase_count) * 100) / 100
          : 0,
        lastPurchase: s.last_purchase,
      })),
    });
  } catch (error) {
    console.error('Top spenders error:', error);
    res.status(500).json({ error: 'Failed to get top spenders' });
  }
});

// GET /api/admin/analytics/retention - Detailed retention metrics
router.get('/retention', requirePermission(PERMISSIONS.VIEW_ANALYTICS), (req: AdminRequest, res: Response) => {
  try {
    // Calculate retention for different cohorts
    const retentionData: Array<{
      cohortStart: string;
      cohortEnd: string;
      usersInCohort: number;
      d1: number;
      d7: number;
      d30: number;
    }> = [];

    // Get retention for last 4 weekly cohorts
    for (let week = 0; week < 4; week++) {
      const cohortEnd = getTimestampDaysAgo(7 * week + 30);
      const cohortStart = getTimestampDaysAgo(7 * week + 37);

      const usersInCohort = db.prepare(`
        SELECT COUNT(*) as count FROM users WHERE created_at >= ? AND created_at < ?
      `).get(cohortStart, cohortEnd) as { count: number };

      const d1 = analyticsQueries.getRetentionD1.get(cohortStart, cohortEnd) as { retention: number | null };
      const d7 = analyticsQueries.getRetentionD7.get(cohortStart, cohortEnd) as { retention: number | null };
      const d30 = analyticsQueries.getRetentionD30.get(cohortStart, cohortEnd) as { retention: number | null };

      retentionData.push({
        cohortStart: new Date(cohortStart * 1000).toISOString().split('T')[0],
        cohortEnd: new Date(cohortEnd * 1000).toISOString().split('T')[0],
        usersInCohort: usersInCohort.count,
        d1: Math.round((d1.retention || 0) * 100) / 100,
        d7: Math.round((d7.retention || 0) * 100) / 100,
        d30: Math.round((d30.retention || 0) * 100) / 100,
      });
    }

    res.json({
      cohorts: retentionData,
    });
  } catch (error) {
    console.error('Retention metrics error:', error);
    res.status(500).json({ error: 'Failed to get retention metrics' });
  }
});

// GET /api/admin/analytics/matches - Match statistics
router.get('/matches', requirePermission(PERMISSIONS.VIEW_ANALYTICS), (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(90, parseInt(req.query.days as string) || 30);
    const startTimestamp = getTimestampDaysAgo(days);

    const dailyMatches = analyticsQueries.getDailyMatches.all(startTimestamp) as Array<{
      date: string;
      count: number;
    }>;

    // Get match distribution by mode
    const matchesByMode = db.prepare(`
      SELECT mode, COUNT(*) as count
      FROM matches
      WHERE created_at >= ?
      GROUP BY mode
      ORDER BY count DESC
    `).all(startTimestamp) as Array<{ mode: string; count: number }>;

    // Get average match duration
    const avgDuration = db.prepare(`
      SELECT AVG(duration) as avg_duration
      FROM matches
      WHERE created_at >= ? AND duration IS NOT NULL
    `).get(startTimestamp) as { avg_duration: number | null };

    const totalMatches = dailyMatches.reduce((sum, d) => sum + d.count, 0);

    res.json({
      period: `${days} days`,
      totalMatches,
      avgPerDay: totalMatches / days,
      avgDuration: Math.round(avgDuration.avg_duration || 0),
      byMode: matchesByMode.map(m => ({
        mode: m.mode,
        count: m.count,
        percentage: totalMatches > 0
          ? Math.round((m.count / totalMatches) * 10000) / 100
          : 0,
      })),
      daily: dailyMatches.map(d => ({
        date: d.date,
        matches: d.count,
      })),
    });
  } catch (error) {
    console.error('Match statistics error:', error);
    res.status(500).json({ error: 'Failed to get match statistics' });
  }
});

// GET /api/admin/analytics/hourly-activity - Activity by hour
router.get('/hourly-activity', requirePermission(PERMISSIONS.VIEW_ANALYTICS), (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(30, parseInt(req.query.days as string) || 7);
    const startTimestamp = getTimestampDaysAgo(days);

    const hourlyActivity = analyticsQueries.getHourlyActivity.all(startTimestamp) as Array<{
      hour: string;
      unique_users: number;
    }>;

    const peakCCU = analyticsQueries.getPeakCCU.get(startTimestamp) as { peak_ccu: number | null };

    res.json({
      period: `${days} days`,
      peakCCU: peakCCU.peak_ccu || 0,
      byHour: hourlyActivity.map(h => ({
        hour: parseInt(h.hour),
        users: h.unique_users,
      })),
    });
  } catch (error) {
    console.error('Hourly activity error:', error);
    res.status(500).json({ error: 'Failed to get hourly activity' });
  }
});

// GET /api/admin/analytics/new-users - New user registration trend
router.get('/new-users', requirePermission(PERMISSIONS.VIEW_ANALYTICS), (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(90, parseInt(req.query.days as string) || 30);
    const startTimestamp = getTimestampDaysAgo(days);
    const now = Math.floor(Date.now() / 1000);

    const newUsers = analyticsQueries.getNewUsersInRange.all(startTimestamp, now) as Array<{
      date: string;
      count: number;
    }>;

    const totalNew = newUsers.reduce((sum, d) => sum + d.count, 0);

    res.json({
      period: `${days} days`,
      totalNew,
      avgPerDay: Math.round((totalNew / days) * 100) / 100,
      daily: newUsers.map(d => ({
        date: d.date,
        count: d.count,
      })),
    });
  } catch (error) {
    console.error('New users error:', error);
    res.status(500).json({ error: 'Failed to get new user data' });
  }
});

// GET /api/admin/analytics/realtime - Real-time metrics (for auto-refresh)
router.get('/realtime', requirePermission(PERMISSIONS.VIEW_ANALYTICS), (req: AdminRequest, res: Response) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const fiveMinutesAgo = now - 300;
    const todayStart = getTodayStartTimestamp();

    const onlineNow = analyticsQueries.getOnlineNow.get(fiveMinutesAgo) as { count: number };
    const sessionsToday = analyticsQueries.getSessionsToday.get(todayStart) as { count: number };
    const matchesToday = analyticsQueries.getMatchesToday.get(todayStart) as { count: number };
    const revenueToday = analyticsQueries.getRevenueToday.get(todayStart) as { revenue: number };

    // Active matches (not ended)
    const activeMatches = db.prepare(`
      SELECT COUNT(*) as count FROM matches WHERE ended_at IS NULL
    `).get() as { count: number };

    res.json({
      timestamp: now,
      onlineNow: onlineNow.count,
      activeMatches: activeMatches.count,
      sessionsToday: sessionsToday.count,
      matchesToday: matchesToday.count,
      revenueToday: Math.round((revenueToday.revenue || 0) * 100) / 100,
    });
  } catch (error) {
    console.error('Realtime metrics error:', error);
    res.status(500).json({ error: 'Failed to get realtime metrics' });
  }
});

export { router as analyticsDashboardRouter };
