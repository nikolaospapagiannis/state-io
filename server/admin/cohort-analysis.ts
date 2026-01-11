import { Router, Response } from 'express';
import { db } from '../database';
import { AdminRequest, requireAdmin, requirePermission, PERMISSIONS } from './auth';

const router = Router();

// Apply admin auth to all routes
router.use(requireAdmin);

// ============ TYPES ============

interface CohortData {
  cohortDate: string;
  cohortSize: number;
  retention: number[];
  revenue: number[];
  avgSessionLength: number[];
  matchesPlayed: number[];
}

interface CohortRetentionRow {
  days: number;
  retained: number;
  total: number;
}

interface CohortRevenueRow {
  days: number;
  revenue: number;
}

interface CohortEngagementRow {
  days: number;
  avgSession: number;
  matches: number;
}

// ============ PREPARED STATEMENTS ============

const cohortQueries = {
  // Get users by registration date (cohort)
  getUsersByRegistrationDate: db.prepare(`
    SELECT date(created_at, 'unixepoch') as cohort_date,
           COUNT(*) as cohort_size
    FROM users
    WHERE created_at >= ? AND created_at < ?
    GROUP BY date(created_at, 'unixepoch')
    ORDER BY cohort_date ASC
  `),

  // Get cohort retention for a specific day
  getCohortRetention: db.prepare(`
    SELECT
      u.id,
      CASE WHEN EXISTS (
        SELECT 1 FROM player_sessions ps
        WHERE ps.player_id = u.id
        AND ps.start_time >= u.created_at + (? * 86400)
        AND ps.start_time < u.created_at + ((? + 1) * 86400)
      ) THEN 1 ELSE 0 END as returned
    FROM users u
    WHERE date(u.created_at, 'unixepoch') = ?
  `),

  // Get revenue by cohort for a specific day range
  getCohortRevenue: db.prepare(`
    SELECT
      COALESCE(SUM(p.price_cents), 0) / 100.0 as revenue
    FROM users u
    LEFT JOIN purchases p ON u.id = p.user_id
      AND p.status = 'completed'
      AND p.created_at >= u.created_at + (? * 86400)
      AND p.created_at < u.created_at + ((? + 1) * 86400)
    WHERE date(u.created_at, 'unixepoch') = ?
  `),

  // Get cumulative revenue by cohort
  getCumulativeRevenue: db.prepare(`
    SELECT
      COALESCE(SUM(p.price_cents), 0) / 100.0 as revenue
    FROM users u
    LEFT JOIN purchases p ON u.id = p.user_id
      AND p.status = 'completed'
      AND p.created_at < u.created_at + (? * 86400)
    WHERE date(u.created_at, 'unixepoch') = ?
  `),

  // Get cohort engagement metrics
  getCohortEngagement: db.prepare(`
    SELECT
      AVG(CASE WHEN ps.end_time IS NOT NULL THEN ps.end_time - ps.start_time ELSE 0 END) as avg_session,
      COUNT(DISTINCT m.id) as matches
    FROM users u
    LEFT JOIN player_sessions ps ON u.id = ps.player_id
      AND ps.start_time >= u.created_at + (? * 86400)
      AND ps.start_time < u.created_at + ((? + 1) * 86400)
    LEFT JOIN match_participants mp ON u.id = mp.user_id
    LEFT JOIN matches m ON mp.match_id = m.id
      AND m.created_at >= u.created_at + (? * 86400)
      AND m.created_at < u.created_at + ((? + 1) * 86400)
    WHERE date(u.created_at, 'unixepoch') = ?
  `),

  // Get paying users by cohort
  getPayingUsersByCohort: db.prepare(`
    SELECT
      date(u.created_at, 'unixepoch') as cohort_date,
      COUNT(DISTINCT u.id) as cohort_size,
      COUNT(DISTINCT CASE WHEN p.id IS NOT NULL THEN u.id END) as paying_users,
      COALESCE(SUM(p.price_cents), 0) / 100.0 as total_revenue
    FROM users u
    LEFT JOIN purchases p ON u.id = p.user_id AND p.status = 'completed'
    WHERE u.created_at >= ? AND u.created_at < ?
    GROUP BY date(u.created_at, 'unixepoch')
    ORDER BY cohort_date ASC
  `),

  // Get lifetime value by cohort
  getLTVByCohort: db.prepare(`
    SELECT
      date(u.created_at, 'unixepoch') as cohort_date,
      COUNT(DISTINCT u.id) as cohort_size,
      COALESCE(SUM(p.price_cents), 0) / 100.0 / COUNT(DISTINCT u.id) as ltv
    FROM users u
    LEFT JOIN purchases p ON u.id = p.user_id AND p.status = 'completed'
    WHERE u.created_at >= ? AND u.created_at < ?
    GROUP BY date(u.created_at, 'unixepoch')
    ORDER BY cohort_date ASC
  `),

  // Get subscription conversion by cohort
  getSubscriptionByCohort: db.prepare(`
    SELECT
      date(u.created_at, 'unixepoch') as cohort_date,
      COUNT(DISTINCT u.id) as cohort_size,
      COUNT(DISTINCT s.user_id) as subscribed_users,
      SUM(CASE WHEN s.tier = 'plus' THEN 1 ELSE 0 END) as plus_count,
      SUM(CASE WHEN s.tier = 'pro' THEN 1 ELSE 0 END) as pro_count,
      SUM(CASE WHEN s.tier = 'elite' THEN 1 ELSE 0 END) as elite_count
    FROM users u
    LEFT JOIN subscriptions s ON u.id = s.user_id
    WHERE u.created_at >= ? AND u.created_at < ?
    GROUP BY date(u.created_at, 'unixepoch')
    ORDER BY cohort_date ASC
  `),

  // Get battle pass conversion by cohort
  getBattlePassByCohort: db.prepare(`
    SELECT
      date(u.created_at, 'unixepoch') as cohort_date,
      COUNT(DISTINCT u.id) as cohort_size,
      COUNT(DISTINCT CASE WHEN bp.tier != 'free' THEN bp.user_id END) as premium_users,
      COUNT(DISTINCT CASE WHEN bp.tier = 'premium' THEN bp.user_id END) as premium_count,
      COUNT(DISTINCT CASE WHEN bp.tier = 'diamond' THEN bp.user_id END) as diamond_count
    FROM users u
    LEFT JOIN battle_pass_progress bp ON u.id = bp.user_id
    WHERE u.created_at >= ? AND u.created_at < ?
    GROUP BY date(u.created_at, 'unixepoch')
    ORDER BY cohort_date ASC
  `),

  // Get user activity level by cohort
  getActivityByCohort: db.prepare(`
    SELECT
      date(u.created_at, 'unixepoch') as cohort_date,
      COUNT(DISTINCT u.id) as cohort_size,
      AVG(COALESCE(user_sessions.session_count, 0)) as avg_sessions,
      AVG(COALESCE(user_matches.match_count, 0)) as avg_matches
    FROM users u
    LEFT JOIN (
      SELECT player_id, COUNT(*) as session_count
      FROM player_sessions
      GROUP BY player_id
    ) user_sessions ON u.id = user_sessions.player_id
    LEFT JOIN (
      SELECT user_id, COUNT(*) as match_count
      FROM match_participants
      GROUP BY user_id
    ) user_matches ON u.id = user_matches.user_id
    WHERE u.created_at >= ? AND u.created_at < ?
    GROUP BY date(u.created_at, 'unixepoch')
    ORDER BY cohort_date ASC
  `),
};

// ============ HELPER FUNCTIONS ============

function getTimestampDaysAgo(days: number): number {
  return Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
}

function getWeeklyCohorts(weeks: number): Array<{ start: number; end: number; label: string }> {
  const cohorts: Array<{ start: number; end: number; label: string }> = [];
  const now = Math.floor(Date.now() / 1000);
  const dayInSeconds = 86400;
  const weekInSeconds = 7 * dayInSeconds;

  for (let i = 0; i < weeks; i++) {
    const end = now - (i * weekInSeconds);
    const start = end - weekInSeconds;
    const startDate = new Date(start * 1000);
    const label = `Week of ${startDate.toISOString().split('T')[0]}`;
    cohorts.push({ start, end, label });
  }

  return cohorts.reverse();
}

// ============ API ROUTES ============

// GET /api/admin/cohorts/retention - Cohort retention analysis
router.get('/retention', requirePermission(PERMISSIONS.VIEW_ANALYTICS), (req: AdminRequest, res: Response) => {
  try {
    const weeks = Math.min(12, parseInt(req.query.weeks as string) || 8);
    const retentionDays = [1, 3, 7, 14, 30];

    // Get weekly cohorts
    const cohorts = getWeeklyCohorts(weeks);
    const now = Math.floor(Date.now() / 1000);

    const cohortData = cohorts.map(cohort => {
      // Get users registered in this cohort
      const users = db.prepare(`
        SELECT id, created_at FROM users
        WHERE created_at >= ? AND created_at < ?
      `).all(cohort.start, cohort.end) as Array<{ id: string; created_at: number }>;

      const cohortSize = users.length;
      if (cohortSize === 0) {
        return {
          cohortLabel: cohort.label,
          cohortSize: 0,
          retention: retentionDays.map(() => null),
        };
      }

      // Calculate retention for each day
      const retention = retentionDays.map(day => {
        // Only calculate if enough time has passed
        const checkTime = cohort.end + (day * 86400);
        if (checkTime > now) {
          return null; // Not enough time has passed
        }

        let retained = 0;
        for (const user of users) {
          const result = db.prepare(`
            SELECT 1 FROM player_sessions
            WHERE player_id = ?
            AND start_time >= ? + (? * 86400)
            AND start_time < ? + ((? + 1) * 86400)
            LIMIT 1
          `).get(user.id, user.created_at, day, user.created_at, day);

          if (result) retained++;
        }

        return Math.round((retained / cohortSize) * 10000) / 100;
      });

      return {
        cohortLabel: cohort.label,
        cohortSize,
        retention,
      };
    });

    res.json({
      retentionDays,
      cohorts: cohortData,
    });
  } catch (error) {
    console.error('Cohort retention error:', error);
    res.status(500).json({ error: 'Failed to get cohort retention data' });
  }
});

// GET /api/admin/cohorts/revenue - Cohort revenue analysis
router.get('/revenue', requirePermission(PERMISSIONS.VIEW_REVENUE), (req: AdminRequest, res: Response) => {
  try {
    const weeks = Math.min(12, parseInt(req.query.weeks as string) || 8);
    const revenueDays = [1, 7, 14, 30, 60, 90];

    const cohorts = getWeeklyCohorts(weeks);
    const now = Math.floor(Date.now() / 1000);

    const cohortData = cohorts.map(cohort => {
      // Get users registered in this cohort
      const users = db.prepare(`
        SELECT id, created_at FROM users
        WHERE created_at >= ? AND created_at < ?
      `).all(cohort.start, cohort.end) as Array<{ id: string; created_at: number }>;

      const cohortSize = users.length;
      if (cohortSize === 0) {
        return {
          cohortLabel: cohort.label,
          cohortSize: 0,
          revenue: revenueDays.map(() => null),
          ltv: revenueDays.map(() => null),
        };
      }

      // Calculate cumulative revenue for each day milestone
      const cumulativeRevenue = revenueDays.map(day => {
        const checkTime = cohort.end + (day * 86400);
        if (checkTime > now) {
          return null;
        }

        let totalRevenue = 0;
        for (const user of users) {
          const result = db.prepare(`
            SELECT COALESCE(SUM(price_cents), 0) / 100.0 as revenue
            FROM purchases
            WHERE user_id = ?
            AND status = 'completed'
            AND created_at < ? + (? * 86400)
          `).get(user.id, user.created_at, day) as { revenue: number };

          totalRevenue += result.revenue;
        }

        return Math.round(totalRevenue * 100) / 100;
      });

      // Calculate LTV (revenue per user)
      const ltv = cumulativeRevenue.map(rev =>
        rev !== null ? Math.round((rev / cohortSize) * 100) / 100 : null
      );

      return {
        cohortLabel: cohort.label,
        cohortSize,
        revenue: cumulativeRevenue,
        ltv,
      };
    });

    res.json({
      revenueDays,
      cohorts: cohortData,
    });
  } catch (error) {
    console.error('Cohort revenue error:', error);
    res.status(500).json({ error: 'Failed to get cohort revenue data' });
  }
});

// GET /api/admin/cohorts/engagement - Cohort engagement analysis
router.get('/engagement', requirePermission(PERMISSIONS.VIEW_ANALYTICS), (req: AdminRequest, res: Response) => {
  try {
    const weeks = Math.min(12, parseInt(req.query.weeks as string) || 8);

    const cohorts = getWeeklyCohorts(weeks);
    const now = Math.floor(Date.now() / 1000);

    const cohortData = cohorts.map(cohort => {
      // Get users registered in this cohort
      const users = db.prepare(`
        SELECT id, created_at FROM users
        WHERE created_at >= ? AND created_at < ?
      `).all(cohort.start, cohort.end) as Array<{ id: string; created_at: number }>;

      const cohortSize = users.length;
      if (cohortSize === 0) {
        return {
          cohortLabel: cohort.label,
          cohortSize: 0,
          avgSessions: 0,
          avgMatches: 0,
          avgSessionDuration: 0,
          avgWinRate: 0,
        };
      }

      // Get aggregate engagement metrics
      const engagement = db.prepare(`
        SELECT
          AVG(COALESCE(user_stats.session_count, 0)) as avg_sessions,
          AVG(COALESCE(user_stats.total_duration, 0)) as avg_duration,
          AVG(COALESCE(user_matches.match_count, 0)) as avg_matches,
          AVG(CASE WHEN u.wins + u.losses > 0 THEN u.wins * 100.0 / (u.wins + u.losses) ELSE 50 END) as avg_win_rate
        FROM users u
        LEFT JOIN (
          SELECT player_id, COUNT(*) as session_count,
                 SUM(CASE WHEN end_time IS NOT NULL THEN end_time - start_time ELSE 0 END) as total_duration
          FROM player_sessions
          GROUP BY player_id
        ) user_stats ON u.id = user_stats.player_id
        LEFT JOIN (
          SELECT user_id, COUNT(*) as match_count
          FROM match_participants
          GROUP BY user_id
        ) user_matches ON u.id = user_matches.user_id
        WHERE u.created_at >= ? AND u.created_at < ?
      `).get(cohort.start, cohort.end) as {
        avg_sessions: number | null;
        avg_duration: number | null;
        avg_matches: number | null;
        avg_win_rate: number | null;
      };

      return {
        cohortLabel: cohort.label,
        cohortSize,
        avgSessions: Math.round((engagement.avg_sessions || 0) * 100) / 100,
        avgMatches: Math.round((engagement.avg_matches || 0) * 100) / 100,
        avgSessionDuration: Math.round(engagement.avg_duration || 0),
        avgWinRate: Math.round(engagement.avg_win_rate || 50),
      };
    });

    res.json({
      cohorts: cohortData,
    });
  } catch (error) {
    console.error('Cohort engagement error:', error);
    res.status(500).json({ error: 'Failed to get cohort engagement data' });
  }
});

// GET /api/admin/cohorts/conversion - Cohort conversion analysis
router.get('/conversion', requirePermission(PERMISSIONS.VIEW_REVENUE), (req: AdminRequest, res: Response) => {
  try {
    const weeks = Math.min(12, parseInt(req.query.weeks as string) || 8);
    const startTimestamp = getTimestampDaysAgo(weeks * 7);
    const now = Math.floor(Date.now() / 1000);

    // Get paying users by cohort (weekly)
    const cohorts = getWeeklyCohorts(weeks);

    const cohortData = cohorts.map(cohort => {
      const result = db.prepare(`
        SELECT
          COUNT(DISTINCT u.id) as cohort_size,
          COUNT(DISTINCT CASE WHEN p.id IS NOT NULL THEN u.id END) as paying_users,
          COUNT(DISTINCT CASE WHEN s.id IS NOT NULL THEN u.id END) as subscribed_users,
          COUNT(DISTINCT CASE WHEN bp.tier != 'free' AND bp.tier IS NOT NULL THEN u.id END) as battle_pass_users,
          COALESCE(SUM(p.price_cents), 0) / 100.0 as total_revenue
        FROM users u
        LEFT JOIN purchases p ON u.id = p.user_id AND p.status = 'completed'
        LEFT JOIN subscriptions s ON u.id = s.user_id
        LEFT JOIN battle_pass_progress bp ON u.id = bp.user_id
        WHERE u.created_at >= ? AND u.created_at < ?
      `).get(cohort.start, cohort.end) as {
        cohort_size: number;
        paying_users: number;
        subscribed_users: number;
        battle_pass_users: number;
        total_revenue: number;
      };

      const cohortSize = result.cohort_size || 0;

      return {
        cohortLabel: cohort.label,
        cohortSize,
        payingUsers: result.paying_users || 0,
        payerConversion: cohortSize > 0
          ? Math.round((result.paying_users / cohortSize) * 10000) / 100
          : 0,
        subscribedUsers: result.subscribed_users || 0,
        subscriptionConversion: cohortSize > 0
          ? Math.round((result.subscribed_users / cohortSize) * 10000) / 100
          : 0,
        battlePassUsers: result.battle_pass_users || 0,
        battlePassConversion: cohortSize > 0
          ? Math.round((result.battle_pass_users / cohortSize) * 10000) / 100
          : 0,
        totalRevenue: Math.round(result.total_revenue * 100) / 100,
        arpu: cohortSize > 0
          ? Math.round((result.total_revenue / cohortSize) * 100) / 100
          : 0,
        arppu: result.paying_users > 0
          ? Math.round((result.total_revenue / result.paying_users) * 100) / 100
          : 0,
      };
    });

    res.json({
      cohorts: cohortData,
    });
  } catch (error) {
    console.error('Cohort conversion error:', error);
    res.status(500).json({ error: 'Failed to get cohort conversion data' });
  }
});

// GET /api/admin/cohorts/daily - Daily cohort overview
router.get('/daily', requirePermission(PERMISSIONS.VIEW_ANALYTICS), (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(60, parseInt(req.query.days as string) || 30);
    const startTimestamp = getTimestampDaysAgo(days);
    const now = Math.floor(Date.now() / 1000);

    // Get daily cohorts with key metrics
    const dailyCohorts = db.prepare(`
      SELECT
        date(u.created_at, 'unixepoch') as cohort_date,
        COUNT(DISTINCT u.id) as cohort_size,
        COUNT(DISTINCT CASE WHEN p.id IS NOT NULL THEN u.id END) as paying_users,
        COALESCE(SUM(p.price_cents), 0) / 100.0 as total_revenue,
        AVG(COALESCE(sessions.session_count, 0)) as avg_sessions
      FROM users u
      LEFT JOIN purchases p ON u.id = p.user_id AND p.status = 'completed'
      LEFT JOIN (
        SELECT player_id, COUNT(*) as session_count
        FROM player_sessions
        GROUP BY player_id
      ) sessions ON u.id = sessions.player_id
      WHERE u.created_at >= ?
      GROUP BY date(u.created_at, 'unixepoch')
      ORDER BY cohort_date ASC
    `).all(startTimestamp) as Array<{
      cohort_date: string;
      cohort_size: number;
      paying_users: number;
      total_revenue: number;
      avg_sessions: number | null;
    }>;

    res.json({
      period: `${days} days`,
      cohorts: dailyCohorts.map(c => ({
        date: c.cohort_date,
        cohortSize: c.cohort_size,
        payingUsers: c.paying_users,
        conversionRate: c.cohort_size > 0
          ? Math.round((c.paying_users / c.cohort_size) * 10000) / 100
          : 0,
        totalRevenue: Math.round(c.total_revenue * 100) / 100,
        ltv: c.cohort_size > 0
          ? Math.round((c.total_revenue / c.cohort_size) * 100) / 100
          : 0,
        avgSessions: Math.round((c.avg_sessions || 0) * 100) / 100,
      })),
    });
  } catch (error) {
    console.error('Daily cohort error:', error);
    res.status(500).json({ error: 'Failed to get daily cohort data' });
  }
});

// GET /api/admin/cohorts/ltv-curve - LTV curve by cohort age
router.get('/ltv-curve', requirePermission(PERMISSIONS.VIEW_REVENUE), (req: AdminRequest, res: Response) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const daysToTrack = [1, 3, 7, 14, 30, 60, 90, 180];

    // Get users from 6 months ago to have full data
    const sixMonthsAgo = getTimestampDaysAgo(180);
    const threeMonthsAgo = getTimestampDaysAgo(90);

    const users = db.prepare(`
      SELECT id, created_at FROM users
      WHERE created_at >= ? AND created_at < ?
    `).all(sixMonthsAgo, threeMonthsAgo) as Array<{ id: string; created_at: number }>;

    const cohortSize = users.length;
    if (cohortSize === 0) {
      res.json({
        daysToTrack,
        ltvCurve: daysToTrack.map(() => 0),
        cohortSize: 0,
      });
      return;
    }

    // Calculate cumulative LTV at each day
    const ltvCurve = daysToTrack.map(day => {
      let totalRevenue = 0;
      for (const user of users) {
        const result = db.prepare(`
          SELECT COALESCE(SUM(price_cents), 0) / 100.0 as revenue
          FROM purchases
          WHERE user_id = ?
          AND status = 'completed'
          AND created_at < ? + (? * 86400)
        `).get(user.id, user.created_at, day) as { revenue: number };

        totalRevenue += result.revenue;
      }

      return Math.round((totalRevenue / cohortSize) * 100) / 100;
    });

    res.json({
      daysToTrack,
      ltvCurve,
      cohortSize,
      cohortPeriod: '3-6 months ago',
    });
  } catch (error) {
    console.error('LTV curve error:', error);
    res.status(500).json({ error: 'Failed to get LTV curve data' });
  }
});

export { router as cohortAnalysisRouter };
