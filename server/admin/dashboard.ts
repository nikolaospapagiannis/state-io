import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, userQueries, clanQueries, matchQueries } from '../database';
import { socialQueries } from '../social-schema';
import { AdminRequest, requireAdmin, requirePermission, PERMISSIONS } from './auth';

const router = Router();

// Apply admin auth to all routes
router.use(requireAdmin);

// ============ DASHBOARD OVERVIEW ============

// Get dashboard metrics
router.get('/metrics', requirePermission(PERMISSIONS.VIEW_ANALYTICS), (req: AdminRequest, res: Response) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    const weekAgo = now - 7 * 24 * 60 * 60;
    const monthAgo = now - 30 * 24 * 60 * 60;

    // Total users
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };

    // New users today
    const newUsersToday = db.prepare(`
      SELECT COUNT(*) as count FROM users WHERE created_at >= ?
    `).get(todayStart) as { count: number };

    // New users this week
    const newUsersWeek = db.prepare(`
      SELECT COUNT(*) as count FROM users WHERE created_at >= ?
    `).get(weekAgo) as { count: number };

    // Total matches
    const totalMatches = db.prepare('SELECT COUNT(*) as count FROM matches').get() as { count: number };

    // Matches today
    const matchesToday = db.prepare(`
      SELECT COUNT(*) as count FROM matches WHERE created_at >= ?
    `).get(todayStart) as { count: number };

    // Total clans
    const totalClans = db.prepare('SELECT COUNT(*) as count FROM clans').get() as { count: number };

    // Active users (logged in within 7 days)
    const activeUsers = db.prepare(`
      SELECT COUNT(*) as count FROM users WHERE last_login >= ?
    `).get(weekAgo) as { count: number };

    // DAU calculation (unique logins today)
    const dau = db.prepare(`
      SELECT COUNT(DISTINCT player_id) as count FROM player_sessions
      WHERE start_time >= ?
    `).get(todayStart) as { count: number };

    // Get latest daily metrics
    const latestMetrics = socialQueries.getLatestMetrics.get() as {
      date: string;
      dau: number;
      mau: number;
      new_users: number;
      matches_played: number;
      total_revenue: number;
      avg_session_duration: number;
      retention_d1: number;
      retention_d7: number;
      retention_d30: number;
      ccu_peak: number;
    } | undefined;

    // Pending reports
    const pendingReports = db.prepare(`
      SELECT COUNT(*) as count FROM player_reports WHERE status = 'pending'
    `).get() as { count: number };

    res.json({
      overview: {
        totalUsers: totalUsers.count,
        newUsersToday: newUsersToday.count,
        newUsersWeek: newUsersWeek.count,
        totalMatches: totalMatches.count,
        matchesToday: matchesToday.count,
        totalClans: totalClans.count,
        activeUsers: activeUsers.count,
        dau: latestMetrics?.dau || dau.count,
        mau: latestMetrics?.mau || activeUsers.count,
        ccuPeak: latestMetrics?.ccu_peak || 0,
        pendingReports: pendingReports.count,
      },
      retention: latestMetrics ? {
        d1: latestMetrics.retention_d1,
        d7: latestMetrics.retention_d7,
        d30: latestMetrics.retention_d30,
      } : null,
      avgSessionDuration: latestMetrics?.avg_session_duration || 0,
    });
  } catch (error) {
    console.error('Get dashboard metrics error:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Get revenue metrics
router.get('/revenue', requirePermission(PERMISSIONS.VIEW_REVENUE), (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(90, parseInt(req.query.days as string) || 30);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startTimestamp = Math.floor(startDate.getTime() / 1000);

    // Daily revenue
    const dailyRevenue = db.prepare(`
      SELECT
        date(created_at, 'unixepoch') as date,
        SUM(price_cents) / 100.0 as revenue,
        COUNT(*) as transactions
      FROM purchases
      WHERE status = 'completed' AND created_at >= ?
      GROUP BY date(created_at, 'unixepoch')
      ORDER BY date DESC
    `).all(startTimestamp) as Array<{ date: string; revenue: number; transactions: number }>;

    // Total revenue
    const totalRevenue = db.prepare(`
      SELECT SUM(price_cents) / 100.0 as total FROM purchases WHERE status = 'completed'
    `).get() as { total: number | null };

    // Revenue by product type
    const revenueByType = db.prepare(`
      SELECT
        product_type,
        SUM(price_cents) / 100.0 as revenue,
        COUNT(*) as count
      FROM purchases
      WHERE status = 'completed' AND created_at >= ?
      GROUP BY product_type
      ORDER BY revenue DESC
    `).all(startTimestamp) as Array<{ product_type: string; revenue: number; count: number }>;

    // Top spenders
    const topSpenders = db.prepare(`
      SELECT
        u.id, u.username, u.avatar,
        SUM(p.price_cents) / 100.0 as total_spent,
        COUNT(p.id) as purchase_count
      FROM purchases p
      JOIN users u ON p.user_id = u.id
      WHERE p.status = 'completed'
      GROUP BY u.id
      ORDER BY total_spent DESC
      LIMIT 10
    `).all() as Array<{
      id: string;
      username: string;
      avatar: string;
      total_spent: number;
      purchase_count: number;
    }>;

    res.json({
      totalRevenue: totalRevenue.total || 0,
      dailyRevenue,
      revenueByType,
      topSpenders,
    });
  } catch (error) {
    console.error('Get revenue error:', error);
    res.status(500).json({ error: 'Failed to get revenue metrics' });
  }
});

// Get user growth chart data
router.get('/growth', requirePermission(PERMISSIONS.VIEW_ANALYTICS), (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(90, parseInt(req.query.days as string) || 30);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startTimestamp = Math.floor(startDate.getTime() / 1000);

    // Daily new users
    const dailyNewUsers = db.prepare(`
      SELECT
        date(created_at, 'unixepoch') as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= ?
      GROUP BY date(created_at, 'unixepoch')
      ORDER BY date ASC
    `).all(startTimestamp) as Array<{ date: string; count: number }>;

    // Daily matches
    const dailyMatches = db.prepare(`
      SELECT
        date(created_at, 'unixepoch') as date,
        COUNT(*) as count
      FROM matches
      WHERE created_at >= ?
      GROUP BY date(created_at, 'unixepoch')
      ORDER BY date ASC
    `).all(startTimestamp) as Array<{ date: string; count: number }>;

    // DAU trend from daily_metrics
    const dauTrend = db.prepare(`
      SELECT date, dau, mau FROM daily_metrics
      WHERE date >= date(?, 'unixepoch')
      ORDER BY date ASC
    `).all(startTimestamp) as Array<{ date: string; dau: number; mau: number }>;

    res.json({
      dailyNewUsers,
      dailyMatches,
      dauTrend,
    });
  } catch (error) {
    console.error('Get growth error:', error);
    res.status(500).json({ error: 'Failed to get growth data' });
  }
});

// ============ REAL-TIME STATS ============

// Get current online players (would need socket integration)
router.get('/online', requirePermission(PERMISSIONS.VIEW_ANALYTICS), (req: AdminRequest, res: Response) => {
  try {
    // This would typically get data from the socket server
    // For now, we estimate based on recent session activity
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;

    const recentSessions = db.prepare(`
      SELECT COUNT(DISTINCT player_id) as count
      FROM player_sessions
      WHERE end_time IS NULL OR end_time >= ?
    `).get(fiveMinutesAgo) as { count: number };

    // Active matches
    const activeMatches = db.prepare(`
      SELECT COUNT(*) as count FROM matches WHERE ended_at IS NULL
    `).get() as { count: number };

    res.json({
      onlinePlayers: recentSessions.count,
      activeMatches: activeMatches.count,
      // This would come from socket server in production
      playersInQueue: 0,
      playersInLobby: 0,
    });
  } catch (error) {
    console.error('Get online stats error:', error);
    res.status(500).json({ error: 'Failed to get online stats' });
  }
});

// ============ LEADERBOARDS ============

// Get top players
router.get('/top-players', requirePermission(PERMISSIONS.VIEW_PLAYERS), (req: AdminRequest, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const players = userQueries.getTopPlayers.all(limit) as Array<{
      id: string;
      username: string;
      elo: number;
      wins: number;
      losses: number;
      avatar: string;
      created_at: number;
    }>;

    res.json({
      players: players.map((p, i) => ({
        rank: i + 1,
        id: p.id,
        username: p.username,
        elo: p.elo,
        wins: p.wins,
        losses: p.losses,
        winRate: p.wins + p.losses > 0
          ? Math.round((p.wins / (p.wins + p.losses)) * 100)
          : 0,
        avatar: p.avatar,
        createdAt: p.created_at,
      })),
    });
  } catch (error) {
    console.error('Get top players error:', error);
    res.status(500).json({ error: 'Failed to get top players' });
  }
});

// Get top clans
router.get('/top-clans', requirePermission(PERMISSIONS.VIEW_PLAYERS), (req: AdminRequest, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const clans = clanQueries.getTopClans.all(limit) as Array<{
      id: string;
      name: string;
      tag: string;
      elo: number;
      wins: number;
      losses: number;
      member_count: number;
    }>;

    res.json({
      clans: clans.map((c, i) => ({
        rank: i + 1,
        id: c.id,
        name: c.name,
        tag: c.tag,
        elo: c.elo,
        wins: c.wins,
        losses: c.losses,
        memberCount: c.member_count,
      })),
    });
  } catch (error) {
    console.error('Get top clans error:', error);
    res.status(500).json({ error: 'Failed to get top clans' });
  }
});

// ============ AUDIT LOG ============

// Get audit log
router.get('/audit-log', requirePermission(PERMISSIONS.VIEW_AUDIT_LOG), (req: AdminRequest, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const logs = socialQueries.getAuditLogs.all(limit, offset) as Array<{
      id: string;
      admin_id: string;
      action: string;
      target_type: string | null;
      target_id: string | null;
      details: string | null;
      ip_address: string | null;
      created_at: number;
      admin_name: string;
    }>;

    res.json({
      logs: logs.map(l => ({
        id: l.id,
        adminId: l.admin_id,
        adminName: l.admin_name,
        action: l.action,
        targetType: l.target_type,
        targetId: l.target_id,
        details: l.details ? JSON.parse(l.details) : null,
        ipAddress: l.ip_address,
        timestamp: l.created_at,
      })),
    });
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

// ============ HELPER TO LOG ADMIN ACTIONS ============

export function logAdminAction(
  adminId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Record<string, unknown> | null,
  ipAddress: string | null
): void {
  const logId = uuidv4();
  socialQueries.addAuditLog.run(
    logId,
    adminId,
    action,
    targetType,
    targetId,
    details ? JSON.stringify(details) : null,
    ipAddress
  );
}

export { router as dashboardRouter };
