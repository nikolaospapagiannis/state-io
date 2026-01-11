import { Router, Request, Response } from 'express';
import { db } from './database';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, authenticateToken } from './auth';

const router = Router();

// ============ TYPES ============

export interface PlayerEvent {
  id: string;
  playerId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  timestamp: number;
  sessionId?: string;
}

export interface PlayerSession {
  id: string;
  playerId: string;
  startTime: number;
  endTime: number | null;
  deviceInfo: DeviceInfo;
  screenViews: ScreenView[];
  eventCount: number;
}

export interface DeviceInfo {
  platform: string;
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  language: string;
  timezone: string;
}

export interface ScreenView {
  screen: string;
  enterTime: number;
  exitTime?: number;
  duration?: number;
}

export interface BatchEventPayload {
  events: Array<{
    eventType: string;
    eventData?: Record<string, unknown>;
    timestamp?: number;
  }>;
  sessionId?: string;
}

export interface PlayerMetrics {
  playerId: string;
  date: string; // YYYY-MM-DD
  sessionsCount: number;
  totalSessionDuration: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  territoriesCaptured: number;
  troopsSent: number;
  purchaseCount: number;
  purchaseAmount: number;
  adViews: number;
  socialInteractions: number;
  currentWinStreak: number;
  currentLossStreak: number;
  maxWinStreak: number;
  maxLossStreak: number;
}

// ============ DATABASE INITIALIZATION ============

export function initAnalyticsTables(): void {
  // Player events table - raw event log
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_events (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_data TEXT NOT NULL,
      session_id TEXT,
      timestamp INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Player sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_sessions (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      device_info TEXT NOT NULL,
      screen_views TEXT DEFAULT '[]',
      event_count INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Player metrics table - aggregated daily/weekly stats
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_metrics (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      date TEXT NOT NULL,
      sessions_count INTEGER DEFAULT 0,
      total_session_duration INTEGER DEFAULT 0,
      matches_played INTEGER DEFAULT 0,
      matches_won INTEGER DEFAULT 0,
      matches_lost INTEGER DEFAULT 0,
      territories_captured INTEGER DEFAULT 0,
      troops_sent INTEGER DEFAULT 0,
      purchase_count INTEGER DEFAULT 0,
      purchase_amount REAL DEFAULT 0,
      ad_views INTEGER DEFAULT 0,
      social_interactions INTEGER DEFAULT 0,
      current_win_streak INTEGER DEFAULT 0,
      current_loss_streak INTEGER DEFAULT 0,
      max_win_streak INTEGER DEFAULT 0,
      max_loss_streak INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(player_id, date),
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Indexes for analytics queries
  db.exec(`CREATE INDEX IF NOT EXISTS idx_player_events_player ON player_events(player_id, timestamp DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_player_events_type ON player_events(event_type, timestamp DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_player_events_session ON player_events(session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_player_sessions_player ON player_sessions(player_id, start_time DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_player_metrics_player_date ON player_metrics(player_id, date DESC)`);

  console.log('Analytics tables initialized');
}

// Initialize tables immediately
initAnalyticsTables();

// ============ PREPARED STATEMENTS ============

const eventQueries = {
  insert: db.prepare(`
    INSERT INTO player_events (id, player_id, event_type, event_data, session_id, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  getByPlayer: db.prepare(`
    SELECT * FROM player_events
    WHERE player_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `),

  getByType: db.prepare(`
    SELECT * FROM player_events
    WHERE player_id = ? AND event_type = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `),

  getBySession: db.prepare(`
    SELECT * FROM player_events
    WHERE session_id = ?
    ORDER BY timestamp ASC
  `),

  getRecentByType: db.prepare(`
    SELECT * FROM player_events
    WHERE event_type = ? AND timestamp > ?
    ORDER BY timestamp DESC
    LIMIT ?
  `),

  countByTypeInRange: db.prepare(`
    SELECT COUNT(*) as count FROM player_events
    WHERE player_id = ? AND event_type = ? AND timestamp BETWEEN ? AND ?
  `),
};

const sessionQueries = {
  create: db.prepare(`
    INSERT INTO player_sessions (id, player_id, start_time, device_info)
    VALUES (?, ?, ?, ?)
  `),

  end: db.prepare(`
    UPDATE player_sessions
    SET end_time = ?, screen_views = ?, event_count = ?
    WHERE id = ?
  `),

  getActive: db.prepare(`
    SELECT * FROM player_sessions
    WHERE player_id = ? AND end_time IS NULL
    ORDER BY start_time DESC
    LIMIT 1
  `),

  getByPlayer: db.prepare(`
    SELECT * FROM player_sessions
    WHERE player_id = ?
    ORDER BY start_time DESC
    LIMIT ?
  `),

  getRecentByPlayer: db.prepare(`
    SELECT * FROM player_sessions
    WHERE player_id = ? AND start_time > ?
    ORDER BY start_time DESC
  `),

  updateScreenViews: db.prepare(`
    UPDATE player_sessions SET screen_views = ? WHERE id = ?
  `),

  incrementEventCount: db.prepare(`
    UPDATE player_sessions SET event_count = event_count + ? WHERE id = ?
  `),
};

const metricsQueries = {
  upsert: db.prepare(`
    INSERT INTO player_metrics (id, player_id, date, sessions_count, total_session_duration,
      matches_played, matches_won, matches_lost, territories_captured, troops_sent,
      purchase_count, purchase_amount, ad_views, social_interactions,
      current_win_streak, current_loss_streak, max_win_streak, max_loss_streak)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id, date) DO UPDATE SET
      sessions_count = sessions_count + excluded.sessions_count,
      total_session_duration = total_session_duration + excluded.total_session_duration,
      matches_played = matches_played + excluded.matches_played,
      matches_won = matches_won + excluded.matches_won,
      matches_lost = matches_lost + excluded.matches_lost,
      territories_captured = territories_captured + excluded.territories_captured,
      troops_sent = troops_sent + excluded.troops_sent,
      purchase_count = purchase_count + excluded.purchase_count,
      purchase_amount = purchase_amount + excluded.purchase_amount,
      ad_views = ad_views + excluded.ad_views,
      social_interactions = social_interactions + excluded.social_interactions,
      current_win_streak = excluded.current_win_streak,
      current_loss_streak = excluded.current_loss_streak,
      max_win_streak = MAX(max_win_streak, excluded.max_win_streak),
      max_loss_streak = MAX(max_loss_streak, excluded.max_loss_streak),
      updated_at = strftime('%s', 'now')
  `),

  getByPlayer: db.prepare(`
    SELECT * FROM player_metrics
    WHERE player_id = ?
    ORDER BY date DESC
    LIMIT ?
  `),

  getByPlayerDateRange: db.prepare(`
    SELECT * FROM player_metrics
    WHERE player_id = ? AND date BETWEEN ? AND ?
    ORDER BY date ASC
  `),

  getLatest: db.prepare(`
    SELECT * FROM player_metrics
    WHERE player_id = ?
    ORDER BY date DESC
    LIMIT 1
  `),

  getAggregate: db.prepare(`
    SELECT
      SUM(sessions_count) as total_sessions,
      SUM(total_session_duration) as total_duration,
      SUM(matches_played) as total_matches,
      SUM(matches_won) as total_wins,
      SUM(matches_lost) as total_losses,
      SUM(territories_captured) as total_territories,
      SUM(troops_sent) as total_troops,
      SUM(purchase_count) as total_purchases,
      SUM(purchase_amount) as total_spent,
      SUM(ad_views) as total_ads,
      SUM(social_interactions) as total_social,
      MAX(max_win_streak) as best_win_streak,
      MAX(max_loss_streak) as worst_loss_streak
    FROM player_metrics
    WHERE player_id = ?
  `),
};

// ============ ANALYTICS SERVICE ============

export class AnalyticsService {
  // Track a single event
  static trackEvent(
    playerId: string,
    eventType: string,
    eventData: Record<string, unknown> = {},
    sessionId?: string
  ): string {
    const eventId = uuidv4();
    const timestamp = Math.floor(Date.now() / 1000);

    eventQueries.insert.run(
      eventId,
      playerId,
      eventType,
      JSON.stringify(eventData),
      sessionId || null,
      timestamp
    );

    // Update session event count if session exists
    if (sessionId) {
      sessionQueries.incrementEventCount.run(1, sessionId);
    }

    // Process special event types
    this.processEvent(playerId, eventType, eventData);

    return eventId;
  }

  // Batch event ingestion for performance
  static trackEventsBatch(playerId: string, events: BatchEventPayload): string[] {
    const eventIds: string[] = [];
    const timestamp = Math.floor(Date.now() / 1000);

    const insertMany = db.transaction(() => {
      for (const event of events.events) {
        const eventId = uuidv4();
        eventQueries.insert.run(
          eventId,
          playerId,
          event.eventType,
          JSON.stringify(event.eventData || {}),
          events.sessionId || null,
          event.timestamp || timestamp
        );
        eventIds.push(eventId);

        this.processEvent(playerId, event.eventType, event.eventData || {});
      }

      // Update session event count
      if (events.sessionId) {
        sessionQueries.incrementEventCount.run(events.events.length, events.sessionId);
      }
    });

    insertMany();
    return eventIds;
  }

  // Process special events (update metrics)
  private static processEvent(
    playerId: string,
    eventType: string,
    eventData: Record<string, unknown>
  ): void {
    const today = new Date().toISOString().split('T')[0];

    switch (eventType) {
      case 'match_complete': {
        const won = eventData.won as boolean;
        const territories = (eventData.territoriesCaptured as number) || 0;
        const troops = (eventData.troopsSent as number) || 0;

        // Get current streak
        const latestMetrics = metricsQueries.getLatest.get(playerId) as {
          current_win_streak: number;
          current_loss_streak: number;
          max_win_streak: number;
          max_loss_streak: number;
        } | undefined;

        let winStreak = latestMetrics?.current_win_streak || 0;
        let lossStreak = latestMetrics?.current_loss_streak || 0;
        let maxWin = latestMetrics?.max_win_streak || 0;
        let maxLoss = latestMetrics?.max_loss_streak || 0;

        if (won) {
          winStreak++;
          lossStreak = 0;
          maxWin = Math.max(maxWin, winStreak);
        } else {
          lossStreak++;
          winStreak = 0;
          maxLoss = Math.max(maxLoss, lossStreak);
        }

        metricsQueries.upsert.run(
          uuidv4(), playerId, today,
          0, 0, // sessions
          1, // matches played
          won ? 1 : 0, // matches won
          won ? 0 : 1, // matches lost
          territories, troops,
          0, 0, // purchases
          0, // ads
          0, // social
          winStreak, lossStreak, maxWin, maxLoss
        );
        break;
      }

      case 'purchase': {
        const amount = (eventData.amount as number) || 0;
        metricsQueries.upsert.run(
          uuidv4(), playerId, today,
          0, 0, 0, 0, 0, 0, 0,
          1, amount, 0, 0, 0, 0, 0, 0
        );
        break;
      }

      case 'ad_view': {
        metricsQueries.upsert.run(
          uuidv4(), playerId, today,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0
        );
        break;
      }

      case 'social_interaction': {
        metricsQueries.upsert.run(
          uuidv4(), playerId, today,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0
        );
        break;
      }
    }
  }

  // Start a new session
  static startSession(playerId: string, deviceInfo: DeviceInfo): string {
    // End any active sessions first
    const activeSession = sessionQueries.getActive.get(playerId) as { id: string } | undefined;
    if (activeSession) {
      this.endSession(activeSession.id);
    }

    const sessionId = uuidv4();
    const startTime = Math.floor(Date.now() / 1000);

    sessionQueries.create.run(
      sessionId,
      playerId,
      startTime,
      JSON.stringify(deviceInfo)
    );

    // Track session start event
    this.trackEvent(playerId, 'session_start', { deviceInfo }, sessionId);

    return sessionId;
  }

  // End a session
  static endSession(sessionId: string, screenViews: ScreenView[] = []): void {
    const endTime = Math.floor(Date.now() / 1000);

    // Get session to calculate duration
    const session = db.prepare('SELECT * FROM player_sessions WHERE id = ?').get(sessionId) as {
      player_id: string;
      start_time: number;
      event_count: number;
    } | undefined;

    if (!session) return;

    sessionQueries.end.run(
      endTime,
      JSON.stringify(screenViews),
      session.event_count,
      sessionId
    );

    // Update daily metrics with session duration
    const duration = endTime - session.start_time;
    const today = new Date().toISOString().split('T')[0];

    metricsQueries.upsert.run(
      uuidv4(), session.player_id, today,
      1, duration, // sessions count and duration
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    );

    // Track session end event
    this.trackEvent(session.player_id, 'session_end', {
      duration,
      eventCount: session.event_count,
      screenViews
    }, sessionId);
  }

  // Update screen views for active session
  static trackScreenView(sessionId: string, screen: string): void {
    const session = db.prepare('SELECT screen_views FROM player_sessions WHERE id = ?').get(sessionId) as {
      screen_views: string;
    } | undefined;

    if (!session) return;

    const screenViews: ScreenView[] = JSON.parse(session.screen_views || '[]');
    const now = Math.floor(Date.now() / 1000);

    // Close previous screen view
    if (screenViews.length > 0) {
      const lastView = screenViews[screenViews.length - 1];
      if (!lastView.exitTime) {
        lastView.exitTime = now;
        lastView.duration = now - lastView.enterTime;
      }
    }

    // Add new screen view
    screenViews.push({
      screen,
      enterTime: now
    });

    sessionQueries.updateScreenViews.run(JSON.stringify(screenViews), sessionId);
  }

  // Get player events
  static getPlayerEvents(playerId: string, limit = 100): PlayerEvent[] {
    const rows = eventQueries.getByPlayer.all(playerId, limit) as Array<{
      id: string;
      player_id: string;
      event_type: string;
      event_data: string;
      session_id: string | null;
      timestamp: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      playerId: row.player_id,
      eventType: row.event_type,
      eventData: JSON.parse(row.event_data),
      sessionId: row.session_id || undefined,
      timestamp: row.timestamp
    }));
  }

  // Get player sessions
  static getPlayerSessions(playerId: string, limit = 50): PlayerSession[] {
    const rows = sessionQueries.getByPlayer.all(playerId, limit) as Array<{
      id: string;
      player_id: string;
      start_time: number;
      end_time: number | null;
      device_info: string;
      screen_views: string;
      event_count: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      playerId: row.player_id,
      startTime: row.start_time,
      endTime: row.end_time,
      deviceInfo: JSON.parse(row.device_info),
      screenViews: JSON.parse(row.screen_views || '[]'),
      eventCount: row.event_count
    }));
  }

  // Get player metrics for date range
  static getPlayerMetrics(playerId: string, startDate: string, endDate: string): PlayerMetrics[] {
    const rows = metricsQueries.getByPlayerDateRange.all(playerId, startDate, endDate) as Array<{
      player_id: string;
      date: string;
      sessions_count: number;
      total_session_duration: number;
      matches_played: number;
      matches_won: number;
      matches_lost: number;
      territories_captured: number;
      troops_sent: number;
      purchase_count: number;
      purchase_amount: number;
      ad_views: number;
      social_interactions: number;
      current_win_streak: number;
      current_loss_streak: number;
      max_win_streak: number;
      max_loss_streak: number;
    }>;

    return rows.map(row => ({
      playerId: row.player_id,
      date: row.date,
      sessionsCount: row.sessions_count,
      totalSessionDuration: row.total_session_duration,
      matchesPlayed: row.matches_played,
      matchesWon: row.matches_won,
      matchesLost: row.matches_lost,
      territoriesCaptured: row.territories_captured,
      troopsSent: row.troops_sent,
      purchaseCount: row.purchase_count,
      purchaseAmount: row.purchase_amount,
      adViews: row.ad_views,
      socialInteractions: row.social_interactions,
      currentWinStreak: row.current_win_streak,
      currentLossStreak: row.current_loss_streak,
      maxWinStreak: row.max_win_streak,
      maxLossStreak: row.max_loss_streak
    }));
  }

  // Get aggregate lifetime metrics
  static getAggregateMetrics(playerId: string): Record<string, number> {
    const row = metricsQueries.getAggregate.get(playerId) as {
      total_sessions: number;
      total_duration: number;
      total_matches: number;
      total_wins: number;
      total_losses: number;
      total_territories: number;
      total_troops: number;
      total_purchases: number;
      total_spent: number;
      total_ads: number;
      total_social: number;
      best_win_streak: number;
      worst_loss_streak: number;
    } | undefined;

    if (!row) {
      return {
        totalSessions: 0,
        totalDuration: 0,
        totalMatches: 0,
        totalWins: 0,
        totalLosses: 0,
        winRate: 0,
        avgSessionDuration: 0,
        totalTerritories: 0,
        totalTroops: 0,
        totalPurchases: 0,
        totalSpent: 0,
        totalAds: 0,
        totalSocial: 0,
        bestWinStreak: 0,
        worstLossStreak: 0
      };
    }

    return {
      totalSessions: row.total_sessions || 0,
      totalDuration: row.total_duration || 0,
      totalMatches: row.total_matches || 0,
      totalWins: row.total_wins || 0,
      totalLosses: row.total_losses || 0,
      winRate: row.total_matches > 0
        ? Math.round((row.total_wins / row.total_matches) * 100)
        : 0,
      avgSessionDuration: row.total_sessions > 0
        ? Math.round(row.total_duration / row.total_sessions)
        : 0,
      totalTerritories: row.total_territories || 0,
      totalTroops: row.total_troops || 0,
      totalPurchases: row.total_purchases || 0,
      totalSpent: row.total_spent || 0,
      totalAds: row.total_ads || 0,
      totalSocial: row.total_social || 0,
      bestWinStreak: row.best_win_streak || 0,
      worstLossStreak: row.worst_loss_streak || 0
    };
  }

  // Get sessions in last N days
  static getRecentSessionCount(playerId: string, days: number): number {
    const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
    const rows = sessionQueries.getRecentByPlayer.all(playerId, since) as Array<unknown>;
    return rows.length;
  }

  // Get event count by type in range
  static getEventCountInRange(
    playerId: string,
    eventType: string,
    startTime: number,
    endTime: number
  ): number {
    const result = eventQueries.countByTypeInRange.get(
      playerId, eventType, startTime, endTime
    ) as { count: number };
    return result?.count || 0;
  }
}

// ============ API ROUTES ============

// Track events (batch)
router.post('/events', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const payload = req.body as BatchEventPayload;

    if (!payload.events || !Array.isArray(payload.events)) {
      res.status(400).json({ error: 'Events array required' });
      return;
    }

    const eventIds = AnalyticsService.trackEventsBatch(req.user.id, payload);

    res.json({
      success: true,
      eventIds,
      count: eventIds.length
    });
  } catch (error) {
    console.error('Track events error:', error);
    res.status(500).json({ error: 'Failed to track events' });
  }
});

// Start session
router.post('/session/start', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const deviceInfo = req.body.deviceInfo as DeviceInfo;

    if (!deviceInfo) {
      res.status(400).json({ error: 'Device info required' });
      return;
    }

    const sessionId = AnalyticsService.startSession(req.user.id, deviceInfo);

    res.json({
      success: true,
      sessionId
    });
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// End session
router.post('/session/end', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { sessionId, screenViews } = req.body;

    if (!sessionId) {
      res.status(400).json({ error: 'Session ID required' });
      return;
    }

    AnalyticsService.endSession(sessionId, screenViews || []);

    res.json({ success: true });
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// Track screen view
router.post('/session/screen', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { sessionId, screen } = req.body;

    if (!sessionId || !screen) {
      res.status(400).json({ error: 'Session ID and screen name required' });
      return;
    }

    AnalyticsService.trackScreenView(sessionId, screen);

    res.json({ success: true });
  } catch (error) {
    console.error('Track screen error:', error);
    res.status(500).json({ error: 'Failed to track screen view' });
  }
});

// Get player events
router.get('/events/:playerId', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.params.playerId as string;
    const limit = parseInt(String(req.query.limit || '100'));

    const events = AnalyticsService.getPlayerEvents(playerId, limit);

    res.json({ events });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to get events' });
  }
});

// Get player sessions
router.get('/sessions/:playerId', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const sessions = AnalyticsService.getPlayerSessions(playerId, limit);

    res.json({ sessions });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Get player metrics
router.get('/metrics/:playerId', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const { startDate, endDate } = req.query;

    // Default to last 30 days
    const end = (endDate as string) || new Date().toISOString().split('T')[0];
    const start = (startDate as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const metrics = AnalyticsService.getPlayerMetrics(playerId, start, end);
    const aggregate = AnalyticsService.getAggregateMetrics(playerId);

    res.json({
      daily: metrics,
      aggregate
    });
  } catch (error) {
    console.error('Get metrics error:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Get my analytics summary
router.get('/me/summary', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const aggregate = AnalyticsService.getAggregateMetrics(req.user.id);
    const recentSessions = AnalyticsService.getRecentSessionCount(req.user.id, 7);

    // Get last 7 days metrics
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const weeklyMetrics = AnalyticsService.getPlayerMetrics(req.user.id, startDate, endDate);

    res.json({
      lifetime: aggregate,
      last7Days: {
        sessions: recentSessions,
        daily: weeklyMetrics
      }
    });
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ error: 'Failed to get analytics summary' });
  }
});

export { router as analyticsRouter };
