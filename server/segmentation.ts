import { Router, Response } from 'express';
import { db } from './database';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, authenticateToken } from './auth';
import { AnalyticsService } from './analytics';

const router = Router();

// ============ TYPES ============

export enum PlayerSegmentType {
  ACHIEVER = 'achiever',      // Progression focused
  SOCIALIZER = 'socializer',  // Clan/friend focused
  COMPETITOR = 'competitor',  // Ranked/competitive focused
  EXPLORER = 'explorer',      // Variety seeker
  SPENDER = 'spender'         // Whale detection
}

export interface SegmentScore {
  type: PlayerSegmentType;
  score: number;          // 0-100
  confidence: number;     // 0-1
  lastUpdated: number;
}

export interface PlayerProfile {
  playerId: string;
  primarySegment: PlayerSegmentType;
  segments: SegmentScore[];
  spenderTier: SpenderTier;
  engagementLevel: EngagementLevel;
  playerLifecycle: PlayerLifecycle;
  lastUpdated: number;
}

export enum SpenderTier {
  NON_SPENDER = 'non_spender',
  MINNOW = 'minnow',        // $1-10
  DOLPHIN = 'dolphin',      // $10-100
  WHALE = 'whale',          // $100-1000
  SUPER_WHALE = 'super_whale' // $1000+
}

export enum EngagementLevel {
  DORMANT = 'dormant',      // No activity in 14+ days
  AT_RISK = 'at_risk',      // Activity declining
  CASUAL = 'casual',        // 1-2 sessions/week
  REGULAR = 'regular',      // 3-5 sessions/week
  HIGHLY_ENGAGED = 'highly_engaged' // Daily
}

export enum PlayerLifecycle {
  NEW = 'new',              // First 7 days
  LEARNING = 'learning',    // Day 7-30
  ESTABLISHED = 'established', // Day 30-90
  VETERAN = 'veteran',      // Day 90+
  CHURNED = 'churned',      // No activity 30+ days
  RESURRECTED = 'resurrected' // Returned after churn
}

// ============ DATABASE INITIALIZATION ============

export function initSegmentationTables(): void {
  // Player segments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_segments (
      id TEXT PRIMARY KEY,
      player_id TEXT UNIQUE NOT NULL,
      primary_segment TEXT NOT NULL,
      segment_scores TEXT NOT NULL,
      spender_tier TEXT DEFAULT 'non_spender',
      engagement_level TEXT DEFAULT 'casual',
      player_lifecycle TEXT DEFAULT 'new',
      total_spent REAL DEFAULT 0,
      days_since_install INTEGER DEFAULT 0,
      days_since_last_session INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Segment history for trend analysis
  db.exec(`
    CREATE TABLE IF NOT EXISTS segment_history (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      date TEXT NOT NULL,
      segment_scores TEXT NOT NULL,
      primary_segment TEXT NOT NULL,
      engagement_level TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(player_id, date),
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_player_segments_player ON player_segments(player_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_player_segments_primary ON player_segments(primary_segment)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_player_segments_spender ON player_segments(spender_tier)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_segment_history_player_date ON segment_history(player_id, date DESC)`);

  console.log('Segmentation tables initialized');
}

// Initialize tables immediately to ensure they exist before preparing statements
initSegmentationTables();

// ============ PREPARED STATEMENTS ============

const segmentQueries = {
  upsert: db.prepare(`
    INSERT INTO player_segments (id, player_id, primary_segment, segment_scores, spender_tier,
      engagement_level, player_lifecycle, total_spent, days_since_install, days_since_last_session)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      primary_segment = excluded.primary_segment,
      segment_scores = excluded.segment_scores,
      spender_tier = excluded.spender_tier,
      engagement_level = excluded.engagement_level,
      player_lifecycle = excluded.player_lifecycle,
      total_spent = excluded.total_spent,
      days_since_install = excluded.days_since_install,
      days_since_last_session = excluded.days_since_last_session,
      updated_at = strftime('%s', 'now')
  `),

  getByPlayer: db.prepare(`
    SELECT * FROM player_segments WHERE player_id = ?
  `),

  getBySegment: db.prepare(`
    SELECT * FROM player_segments WHERE primary_segment = ? LIMIT ?
  `),

  getBySpenderTier: db.prepare(`
    SELECT * FROM player_segments WHERE spender_tier = ? LIMIT ?
  `),

  getByEngagement: db.prepare(`
    SELECT * FROM player_segments WHERE engagement_level = ? LIMIT ?
  `),

  getAll: db.prepare(`
    SELECT * FROM player_segments ORDER BY updated_at DESC LIMIT ?
  `),

  countBySegment: db.prepare(`
    SELECT primary_segment, COUNT(*) as count FROM player_segments GROUP BY primary_segment
  `),

  countBySpenderTier: db.prepare(`
    SELECT spender_tier, COUNT(*) as count FROM player_segments GROUP BY spender_tier
  `),

  countByEngagement: db.prepare(`
    SELECT engagement_level, COUNT(*) as count FROM player_segments GROUP BY engagement_level
  `),
};

const historyQueries = {
  insert: db.prepare(`
    INSERT OR REPLACE INTO segment_history (id, player_id, date, segment_scores, primary_segment, engagement_level)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  getByPlayer: db.prepare(`
    SELECT * FROM segment_history WHERE player_id = ? ORDER BY date DESC LIMIT ?
  `),
};

// ============ SEGMENTATION SERVICE ============

export class SegmentationService {
  // Calculate segment scores for a player
  static async calculateSegmentScores(playerId: string): Promise<SegmentScore[]> {
    const metrics = AnalyticsService.getAggregateMetrics(playerId);
    const sessions = AnalyticsService.getPlayerSessions(playerId, 30);
    const events = AnalyticsService.getPlayerEvents(playerId, 500);

    const scores: SegmentScore[] = [];
    const now = Math.floor(Date.now() / 1000);

    // ============ ACHIEVER SCORE ============
    // Based on: progression, level completion, unlocks, consistent play
    let achieverScore = 0;
    let achieverDataPoints = 0;

    // Win rate contribution
    if (metrics.totalMatches > 0) {
      achieverScore += (metrics.winRate || 0) * 0.3;
      achieverDataPoints++;
    }

    // Match volume (more matches = more achievement focused)
    const matchesPerDay = metrics.totalMatches / Math.max(1, metrics.totalSessions);
    achieverScore += Math.min(30, matchesPerDay * 10);
    achieverDataPoints++;

    // Streaks indicate achievement focus
    achieverScore += Math.min(20, (metrics.bestWinStreak || 0) * 2);
    achieverDataPoints++;

    // Territory capture efficiency
    const avgTerritories = metrics.totalTerritories / Math.max(1, metrics.totalMatches);
    achieverScore += Math.min(20, avgTerritories * 2);
    achieverDataPoints++;

    scores.push({
      type: PlayerSegmentType.ACHIEVER,
      score: Math.min(100, achieverScore),
      confidence: Math.min(1, achieverDataPoints / 4),
      lastUpdated: now
    });

    // ============ SOCIALIZER SCORE ============
    // Based on: clan activity, friend interactions, chat usage
    let socializerScore = 0;
    let socializerDataPoints = 0;

    // Social interactions from metrics
    socializerScore += Math.min(40, (metrics.totalSocial || 0) * 2);
    socializerDataPoints++;

    // Check clan membership
    const user = db.prepare('SELECT clan_id FROM users WHERE id = ?').get(playerId) as { clan_id: string | null } | undefined;
    if (user?.clan_id) {
      socializerScore += 30;
      socializerDataPoints++;
    }

    // Chat events
    const chatEvents = events.filter(e => e.eventType === 'chat_message').length;
    socializerScore += Math.min(20, chatEvents);
    socializerDataPoints++;

    // Friend invites
    const inviteEvents = events.filter(e =>
      e.eventType === 'friend_invite' || e.eventType === 'clan_invite'
    ).length;
    socializerScore += Math.min(10, inviteEvents * 2);
    socializerDataPoints++;

    scores.push({
      type: PlayerSegmentType.SOCIALIZER,
      score: Math.min(100, socializerScore),
      confidence: Math.min(1, socializerDataPoints / 4),
      lastUpdated: now
    });

    // ============ COMPETITOR SCORE ============
    // Based on: ranked play, ELO progression, competitive events
    let competitorScore = 0;
    let competitorDataPoints = 0;

    // High match volume indicates competition focus
    if (metrics.totalMatches > 20) {
      competitorScore += 20;
    } else if (metrics.totalMatches > 10) {
      competitorScore += 10;
    }
    competitorDataPoints++;

    // Win rate importance for competitors
    if (metrics.winRate > 60) {
      competitorScore += 30;
    } else if (metrics.winRate > 50) {
      competitorScore += 20;
    } else if (metrics.winRate > 40) {
      competitorScore += 10;
    }
    competitorDataPoints++;

    // Session frequency indicates dedication
    const sessionsLast7Days = AnalyticsService.getRecentSessionCount(playerId, 7);
    if (sessionsLast7Days >= 7) {
      competitorScore += 25; // Daily player
    } else if (sessionsLast7Days >= 4) {
      competitorScore += 15;
    } else if (sessionsLast7Days >= 2) {
      competitorScore += 5;
    }
    competitorDataPoints++;

    // Match duration suggests serious play
    const matchEvents = events.filter(e => e.eventType === 'match_complete');
    const avgMatchDuration = matchEvents.reduce((sum, e) =>
      sum + ((e.eventData.duration as number) || 0), 0) / Math.max(1, matchEvents.length);
    if (avgMatchDuration > 300) { // 5+ minutes avg
      competitorScore += 15;
    }
    competitorDataPoints++;

    // ELO changes tracked
    const userElo = db.prepare('SELECT elo FROM users WHERE id = ?').get(playerId) as { elo: number } | undefined;
    if (userElo && userElo.elo > 1200) {
      competitorScore += 10;
    }
    competitorDataPoints++;

    scores.push({
      type: PlayerSegmentType.COMPETITOR,
      score: Math.min(100, competitorScore),
      confidence: Math.min(1, competitorDataPoints / 5),
      lastUpdated: now
    });

    // ============ EXPLORER SCORE ============
    // Based on: variety of modes played, maps explored, feature usage
    let explorerScore = 0;
    let explorerDataPoints = 0;

    // Variety of event types
    const uniqueEventTypes = new Set(events.map(e => e.eventType)).size;
    explorerScore += Math.min(30, uniqueEventTypes * 2);
    explorerDataPoints++;

    // Different screens visited
    const screenViews = new Set<string>();
    sessions.forEach(session => {
      session.screenViews?.forEach(sv => screenViews.add(sv.screen));
    });
    explorerScore += Math.min(30, screenViews.size * 5);
    explorerDataPoints++;

    // Game mode variety
    const modeEvents = events.filter(e => e.eventType === 'match_start');
    const uniqueModes = new Set(modeEvents.map(e => e.eventData.mode as string)).size;
    explorerScore += Math.min(25, uniqueModes * 8);
    explorerDataPoints++;

    // Feature exploration events
    const explorationEvents = events.filter(e =>
      e.eventType.includes('view') ||
      e.eventType.includes('open') ||
      e.eventType.includes('explore')
    ).length;
    explorerScore += Math.min(15, explorationEvents);
    explorerDataPoints++;

    scores.push({
      type: PlayerSegmentType.EXPLORER,
      score: Math.min(100, explorerScore),
      confidence: Math.min(1, explorerDataPoints / 4),
      lastUpdated: now
    });

    // ============ SPENDER SCORE ============
    // Based on: purchase history, purchase frequency, ARPU
    let spenderScore = 0;
    let spenderDataPoints = 0;

    const totalSpent = metrics.totalSpent || 0;
    const purchaseCount = metrics.totalPurchases || 0;

    // Amount spent
    if (totalSpent >= 1000) {
      spenderScore += 50;
    } else if (totalSpent >= 100) {
      spenderScore += 35;
    } else if (totalSpent >= 10) {
      spenderScore += 20;
    } else if (totalSpent > 0) {
      spenderScore += 10;
    }
    spenderDataPoints++;

    // Purchase frequency
    if (purchaseCount >= 10) {
      spenderScore += 30;
    } else if (purchaseCount >= 5) {
      spenderScore += 20;
    } else if (purchaseCount >= 2) {
      spenderScore += 10;
    } else if (purchaseCount >= 1) {
      spenderScore += 5;
    }
    spenderDataPoints++;

    // Recent purchase activity
    const recentPurchases = events.filter(e =>
      e.eventType === 'purchase' &&
      e.timestamp > now - 7 * 24 * 60 * 60
    ).length;
    spenderScore += Math.min(20, recentPurchases * 5);
    spenderDataPoints++;

    scores.push({
      type: PlayerSegmentType.SPENDER,
      score: Math.min(100, spenderScore),
      confidence: Math.min(1, spenderDataPoints / 3),
      lastUpdated: now
    });

    return scores;
  }

  // Determine spender tier
  static determineSpenderTier(totalSpent: number): SpenderTier {
    if (totalSpent >= 1000) return SpenderTier.SUPER_WHALE;
    if (totalSpent >= 100) return SpenderTier.WHALE;
    if (totalSpent >= 10) return SpenderTier.DOLPHIN;
    if (totalSpent > 0) return SpenderTier.MINNOW;
    return SpenderTier.NON_SPENDER;
  }

  // Determine engagement level
  static determineEngagementLevel(playerId: string): EngagementLevel {
    const sessionsLast7Days = AnalyticsService.getRecentSessionCount(playerId, 7);
    const sessionsLast14Days = AnalyticsService.getRecentSessionCount(playerId, 14);

    if (sessionsLast14Days === 0) {
      return EngagementLevel.DORMANT;
    }

    // Check if activity is declining (at risk)
    if (sessionsLast7Days === 0 && sessionsLast14Days > 0) {
      return EngagementLevel.AT_RISK;
    }

    if (sessionsLast7Days >= 7) {
      return EngagementLevel.HIGHLY_ENGAGED;
    }

    if (sessionsLast7Days >= 3) {
      return EngagementLevel.REGULAR;
    }

    return EngagementLevel.CASUAL;
  }

  // Determine player lifecycle stage
  static determineLifecycle(playerId: string): PlayerLifecycle {
    const user = db.prepare('SELECT created_at FROM users WHERE id = ?').get(playerId) as {
      created_at: number;
    } | undefined;

    if (!user) return PlayerLifecycle.NEW;

    const now = Math.floor(Date.now() / 1000);
    const daysSinceInstall = Math.floor((now - user.created_at) / (24 * 60 * 60));

    // Check for churn first
    const sessionsLast30Days = AnalyticsService.getRecentSessionCount(playerId, 30);
    if (sessionsLast30Days === 0 && daysSinceInstall > 30) {
      return PlayerLifecycle.CHURNED;
    }

    // Check for resurrection (was churned but came back)
    const sessions = AnalyticsService.getPlayerSessions(playerId, 10);
    if (sessions.length >= 2) {
      const lastSession = sessions[0];
      const secondLastSession = sessions[1];
      const gapDays = Math.floor((lastSession.startTime - (secondLastSession.endTime || secondLastSession.startTime)) / (24 * 60 * 60));
      if (gapDays > 30) {
        return PlayerLifecycle.RESURRECTED;
      }
    }

    // Normal lifecycle stages
    if (daysSinceInstall <= 7) return PlayerLifecycle.NEW;
    if (daysSinceInstall <= 30) return PlayerLifecycle.LEARNING;
    if (daysSinceInstall <= 90) return PlayerLifecycle.ESTABLISHED;
    return PlayerLifecycle.VETERAN;
  }

  // Update player profile
  static async updatePlayerProfile(playerId: string): Promise<PlayerProfile> {
    const scores = await this.calculateSegmentScores(playerId);
    const metrics = AnalyticsService.getAggregateMetrics(playerId);

    // Determine primary segment (highest score with sufficient confidence)
    const validScores = scores.filter(s => s.confidence >= 0.5);
    const sortedScores = validScores.sort((a, b) => b.score - a.score);
    const primarySegment = sortedScores[0]?.type || PlayerSegmentType.EXPLORER;

    const spenderTier = this.determineSpenderTier(metrics.totalSpent || 0);
    const engagementLevel = this.determineEngagementLevel(playerId);
    const lifecycle = this.determineLifecycle(playerId);

    const user = db.prepare('SELECT created_at FROM users WHERE id = ?').get(playerId) as {
      created_at: number;
    } | undefined;

    const now = Math.floor(Date.now() / 1000);
    const daysSinceInstall = user ? Math.floor((now - user.created_at) / (24 * 60 * 60)) : 0;

    const sessions = AnalyticsService.getPlayerSessions(playerId, 1);
    const daysSinceLastSession = sessions.length > 0
      ? Math.floor((now - (sessions[0].endTime || sessions[0].startTime)) / (24 * 60 * 60))
      : daysSinceInstall;

    // Save to database
    segmentQueries.upsert.run(
      uuidv4(),
      playerId,
      primarySegment,
      JSON.stringify(scores),
      spenderTier,
      engagementLevel,
      lifecycle,
      metrics.totalSpent || 0,
      daysSinceInstall,
      daysSinceLastSession
    );

    // Save history
    const today = new Date().toISOString().split('T')[0];
    historyQueries.insert.run(
      uuidv4(),
      playerId,
      today,
      JSON.stringify(scores),
      primarySegment,
      engagementLevel
    );

    return {
      playerId,
      primarySegment,
      segments: scores,
      spenderTier,
      engagementLevel,
      playerLifecycle: lifecycle,
      lastUpdated: now
    };
  }

  // Get player profile
  static getPlayerProfile(playerId: string): PlayerProfile | null {
    const row = segmentQueries.getByPlayer.get(playerId) as {
      player_id: string;
      primary_segment: string;
      segment_scores: string;
      spender_tier: string;
      engagement_level: string;
      player_lifecycle: string;
      updated_at: number;
    } | undefined;

    if (!row) return null;

    return {
      playerId: row.player_id,
      primarySegment: row.primary_segment as PlayerSegmentType,
      segments: JSON.parse(row.segment_scores),
      spenderTier: row.spender_tier as SpenderTier,
      engagementLevel: row.engagement_level as EngagementLevel,
      playerLifecycle: row.player_lifecycle as PlayerLifecycle,
      lastUpdated: row.updated_at
    };
  }

  // Get players by segment
  static getPlayersBySegment(segment: PlayerSegmentType, limit = 100): PlayerProfile[] {
    const rows = segmentQueries.getBySegment.all(segment, limit) as Array<{
      player_id: string;
      primary_segment: string;
      segment_scores: string;
      spender_tier: string;
      engagement_level: string;
      player_lifecycle: string;
      updated_at: number;
    }>;

    return rows.map(row => ({
      playerId: row.player_id,
      primarySegment: row.primary_segment as PlayerSegmentType,
      segments: JSON.parse(row.segment_scores),
      spenderTier: row.spender_tier as SpenderTier,
      engagementLevel: row.engagement_level as EngagementLevel,
      playerLifecycle: row.player_lifecycle as PlayerLifecycle,
      lastUpdated: row.updated_at
    }));
  }

  // Get whales
  static getWhales(limit = 50): PlayerProfile[] {
    const whaleRows = segmentQueries.getBySpenderTier.all(SpenderTier.WHALE, limit) as Array<{
      player_id: string;
      primary_segment: string;
      segment_scores: string;
      spender_tier: string;
      engagement_level: string;
      player_lifecycle: string;
      updated_at: number;
    }>;

    const superWhaleRows = segmentQueries.getBySpenderTier.all(SpenderTier.SUPER_WHALE, limit) as Array<{
      player_id: string;
      primary_segment: string;
      segment_scores: string;
      spender_tier: string;
      engagement_level: string;
      player_lifecycle: string;
      updated_at: number;
    }>;

    const allRows = [...superWhaleRows, ...whaleRows].slice(0, limit);

    return allRows.map(row => ({
      playerId: row.player_id,
      primarySegment: row.primary_segment as PlayerSegmentType,
      segments: JSON.parse(row.segment_scores),
      spenderTier: row.spender_tier as SpenderTier,
      engagementLevel: row.engagement_level as EngagementLevel,
      playerLifecycle: row.player_lifecycle as PlayerLifecycle,
      lastUpdated: row.updated_at
    }));
  }

  // Get segment distribution stats
  static getSegmentDistribution(): Record<string, number> {
    const rows = segmentQueries.countBySegment.all() as Array<{
      primary_segment: string;
      count: number;
    }>;

    const distribution: Record<string, number> = {};
    rows.forEach(row => {
      distribution[row.primary_segment] = row.count;
    });

    return distribution;
  }

  // Get spender distribution stats
  static getSpenderDistribution(): Record<string, number> {
    const rows = segmentQueries.countBySpenderTier.all() as Array<{
      spender_tier: string;
      count: number;
    }>;

    const distribution: Record<string, number> = {};
    rows.forEach(row => {
      distribution[row.spender_tier] = row.count;
    });

    return distribution;
  }

  // Get engagement distribution stats
  static getEngagementDistribution(): Record<string, number> {
    const rows = segmentQueries.countByEngagement.all() as Array<{
      engagement_level: string;
      count: number;
    }>;

    const distribution: Record<string, number> = {};
    rows.forEach(row => {
      distribution[row.engagement_level] = row.count;
    });

    return distribution;
  }

  // Batch update all player segments (for daily job)
  static async updateAllSegments(): Promise<{ updated: number; errors: number }> {
    const allUsers = db.prepare('SELECT id FROM users').all() as Array<{ id: string }>;

    let updated = 0;
    let errors = 0;

    for (const user of allUsers) {
      try {
        await this.updatePlayerProfile(user.id);
        updated++;
      } catch (error) {
        console.error(`Failed to update segment for ${user.id}:`, error);
        errors++;
      }
    }

    console.log(`Segment update complete: ${updated} updated, ${errors} errors`);
    return { updated, errors };
  }
}

// ============ API ROUTES ============

// Get player segment profile
router.get('/:playerId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    let profile = SegmentationService.getPlayerProfile(playerId);

    // If no profile exists, calculate it now
    if (!profile) {
      profile = await SegmentationService.updatePlayerProfile(playerId);
    }

    res.json(profile);
  } catch (error) {
    console.error('Get segment profile error:', error);
    res.status(500).json({ error: 'Failed to get segment profile' });
  }
});

// Update player segment (force recalculation)
router.post('/:playerId/update', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    const profile = await SegmentationService.updatePlayerProfile(playerId);

    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('Update segment error:', error);
    res.status(500).json({ error: 'Failed to update segment' });
  }
});

// Get players by segment
router.get('/by-type/:segment', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const segment = req.params.segment as PlayerSegmentType;
    const limit = parseInt(req.query.limit as string) || 100;

    const players = SegmentationService.getPlayersBySegment(segment, limit);

    res.json({ players, count: players.length });
  } catch (error) {
    console.error('Get by segment error:', error);
    res.status(500).json({ error: 'Failed to get players by segment' });
  }
});

// Get whales
router.get('/spenders/whales', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const whales = SegmentationService.getWhales(limit);

    res.json({ whales, count: whales.length });
  } catch (error) {
    console.error('Get whales error:', error);
    res.status(500).json({ error: 'Failed to get whales' });
  }
});

// Get distribution stats
router.get('/stats/distribution', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const segmentDist = SegmentationService.getSegmentDistribution();
    const spenderDist = SegmentationService.getSpenderDistribution();
    const engagementDist = SegmentationService.getEngagementDistribution();

    res.json({
      segments: segmentDist,
      spenders: spenderDist,
      engagement: engagementDist
    });
  } catch (error) {
    console.error('Get distribution error:', error);
    res.status(500).json({ error: 'Failed to get distribution stats' });
  }
});

// Trigger batch update (admin only)
router.post('/admin/batch-update', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    // In production, add admin role check here

    const result = await SegmentationService.updateAllSegments();

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Batch update error:', error);
    res.status(500).json({ error: 'Failed to batch update segments' });
  }
});

export { router as segmentationRouter };
