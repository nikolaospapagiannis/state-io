import { Router, Response } from 'express';
import { db } from './database';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, authenticateToken } from './auth';
import { AnalyticsService } from './analytics';
import { SegmentationService, EngagementLevel, PlayerLifecycle, SpenderTier } from './segmentation';

const router = Router();

// ============ TYPES ============

export enum ChurnRiskTier {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ChurnPrediction {
  playerId: string;
  engagementScore: number;       // 0-100
  churnProbability7Day: number;  // 0-1
  churnProbability30Day: number; // 0-1
  riskTier: ChurnRiskTier;
  riskFactors: RiskFactor[];
  protectiveFactors: string[];
  recommendedInterventions: Intervention[];
  lastUpdated: number;
}

export interface RiskFactor {
  factor: string;
  severity: 'low' | 'medium' | 'high';
  weight: number;
  description: string;
}

export interface Intervention {
  type: InterventionType;
  priority: number;
  message?: string;
  offer?: OfferDetails;
  timing?: string;
}

export enum InterventionType {
  PUSH_NOTIFICATION = 'push_notification',
  EMAIL = 'email',
  IN_APP_MESSAGE = 'in_app_message',
  BONUS_REWARD = 'bonus_reward',
  DISCOUNT_OFFER = 'discount_offer',
  SPECIAL_EVENT = 'special_event',
  FRIEND_INVITE = 'friend_invite',
  LOYALTY_REWARD = 'loyalty_reward'
}

export interface OfferDetails {
  type: string;
  value: number;
  currency?: string;
  expiresIn?: number; // hours
}

// ============ DATABASE INITIALIZATION ============

export function initChurnTables(): void {
  // Churn predictions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS churn_predictions (
      id TEXT PRIMARY KEY,
      player_id TEXT UNIQUE NOT NULL,
      engagement_score REAL NOT NULL,
      churn_probability_7d REAL NOT NULL,
      churn_probability_30d REAL NOT NULL,
      risk_tier TEXT NOT NULL,
      risk_factors TEXT NOT NULL,
      protective_factors TEXT NOT NULL,
      recommended_interventions TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Intervention history
  db.exec(`
    CREATE TABLE IF NOT EXISTS intervention_history (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      intervention_type TEXT NOT NULL,
      intervention_data TEXT,
      triggered_by TEXT,
      outcome TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      completed_at INTEGER,
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Churn events (actual churns)
  db.exec(`
    CREATE TABLE IF NOT EXISTS churn_events (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      predicted_probability REAL,
      actual_churn_date INTEGER,
      days_since_last_activity INTEGER,
      lifetime_value REAL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_churn_predictions_player ON churn_predictions(player_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_churn_predictions_tier ON churn_predictions(risk_tier)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_intervention_history_player ON intervention_history(player_id, created_at DESC)`);

  console.log('Churn tables initialized');
}

// Initialize tables immediately
initChurnTables();

// ============ PREPARED STATEMENTS ============

const churnQueries = {
  upsert: db.prepare(`
    INSERT INTO churn_predictions (id, player_id, engagement_score, churn_probability_7d,
      churn_probability_30d, risk_tier, risk_factors, protective_factors, recommended_interventions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      engagement_score = excluded.engagement_score,
      churn_probability_7d = excluded.churn_probability_7d,
      churn_probability_30d = excluded.churn_probability_30d,
      risk_tier = excluded.risk_tier,
      risk_factors = excluded.risk_factors,
      protective_factors = excluded.protective_factors,
      recommended_interventions = excluded.recommended_interventions,
      updated_at = strftime('%s', 'now')
  `),

  getByPlayer: db.prepare(`
    SELECT * FROM churn_predictions WHERE player_id = ?
  `),

  getByRiskTier: db.prepare(`
    SELECT * FROM churn_predictions WHERE risk_tier = ? ORDER BY churn_probability_7d DESC LIMIT ?
  `),

  getHighRisk: db.prepare(`
    SELECT * FROM churn_predictions
    WHERE risk_tier IN ('high', 'critical')
    ORDER BY churn_probability_7d DESC
    LIMIT ?
  `),

  getAll: db.prepare(`
    SELECT * FROM churn_predictions ORDER BY engagement_score ASC LIMIT ?
  `),
};

const interventionQueries = {
  insert: db.prepare(`
    INSERT INTO intervention_history (id, player_id, intervention_type, intervention_data, triggered_by)
    VALUES (?, ?, ?, ?, ?)
  `),

  complete: db.prepare(`
    UPDATE intervention_history SET outcome = ?, completed_at = ? WHERE id = ?
  `),

  getByPlayer: db.prepare(`
    SELECT * FROM intervention_history WHERE player_id = ? ORDER BY created_at DESC LIMIT ?
  `),

  getRecent: db.prepare(`
    SELECT * FROM intervention_history WHERE player_id = ? AND created_at > ? LIMIT 1
  `),
};

// ============ CHURN PREDICTION SERVICE ============

export class ChurnPredictionService {
  // Calculate engagement score (0-100)
  static calculateEngagementScore(playerId: string): number {
    const metrics = AnalyticsService.getAggregateMetrics(playerId);
    const sessions = AnalyticsService.getPlayerSessions(playerId, 30);

    let score = 0;
    const now = Math.floor(Date.now() / 1000);

    // Factor 1: Session recency (up to 25 points)
    if (sessions.length > 0) {
      const lastSession = sessions[0];
      const daysSinceSession = (now - (lastSession.endTime || lastSession.startTime)) / (24 * 60 * 60);

      if (daysSinceSession < 1) {
        score += 25;
      } else if (daysSinceSession < 3) {
        score += 20;
      } else if (daysSinceSession < 7) {
        score += 15;
      } else if (daysSinceSession < 14) {
        score += 10;
      } else if (daysSinceSession < 30) {
        score += 5;
      }
    }

    // Factor 2: Session frequency last 7 days (up to 25 points)
    const sessionsLast7Days = AnalyticsService.getRecentSessionCount(playerId, 7);
    score += Math.min(25, sessionsLast7Days * 4);

    // Factor 3: Session duration (up to 15 points)
    const avgDuration = metrics.avgSessionDuration || 0;
    if (avgDuration >= 600) { // 10+ minutes
      score += 15;
    } else if (avgDuration >= 300) { // 5+ minutes
      score += 10;
    } else if (avgDuration >= 120) { // 2+ minutes
      score += 5;
    }

    // Factor 4: Match activity (up to 15 points)
    const matchesLast7Days = this.getMatchesInLastDays(playerId, 7);
    score += Math.min(15, matchesLast7Days * 3);

    // Factor 5: Social engagement (up to 10 points)
    if (metrics.totalSocial > 0) {
      score += Math.min(10, metrics.totalSocial);
    }

    // Factor 6: Purchase engagement (up to 10 points)
    if (metrics.totalPurchases > 0) {
      score += Math.min(10, metrics.totalPurchases * 2);
    }

    return Math.min(100, Math.max(0, score));
  }

  // Get matches in last N days
  private static getMatchesInLastDays(playerId: string, days: number): number {
    const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM match_participants
      WHERE user_id = ? AND match_id IN (
        SELECT id FROM matches WHERE created_at > ?
      )
    `).get(playerId, since) as { count: number };
    return result?.count || 0;
  }

  // Identify risk factors
  static identifyRiskFactors(playerId: string): RiskFactor[] {
    const factors: RiskFactor[] = [];
    const metrics = AnalyticsService.getAggregateMetrics(playerId);
    const sessions = AnalyticsService.getPlayerSessions(playerId, 30);
    const profile = SegmentationService.getPlayerProfile(playerId);
    const now = Math.floor(Date.now() / 1000);

    // Risk: No recent sessions
    if (sessions.length > 0) {
      const daysSinceSession = (now - (sessions[0].endTime || sessions[0].startTime)) / (24 * 60 * 60);
      if (daysSinceSession > 14) {
        factors.push({
          factor: 'long_absence',
          severity: 'high',
          weight: 0.35,
          description: `No activity in ${Math.floor(daysSinceSession)} days`
        });
      } else if (daysSinceSession > 7) {
        factors.push({
          factor: 'recent_absence',
          severity: 'medium',
          weight: 0.2,
          description: `No activity in ${Math.floor(daysSinceSession)} days`
        });
      }
    }

    // Risk: Declining session frequency
    const sessionsWeek1 = sessions.filter(s =>
      s.startTime > now - 7 * 24 * 60 * 60
    ).length;
    const sessionsWeek2 = sessions.filter(s =>
      s.startTime > now - 14 * 24 * 60 * 60 &&
      s.startTime <= now - 7 * 24 * 60 * 60
    ).length;

    if (sessionsWeek2 > 0 && sessionsWeek1 < sessionsWeek2 * 0.5) {
      factors.push({
        factor: 'declining_frequency',
        severity: 'medium',
        weight: 0.15,
        description: 'Session frequency dropped by 50%+'
      });
    }

    // Risk: Low win rate leading to frustration
    if (metrics.totalMatches > 5 && metrics.winRate < 30) {
      factors.push({
        factor: 'low_win_rate',
        severity: 'medium',
        weight: 0.15,
        description: `Win rate of ${metrics.winRate}% may indicate frustration`
      });
    }

    // Risk: Loss streak
    if (metrics.worstLossStreak >= 5) {
      factors.push({
        factor: 'loss_streak',
        severity: 'high',
        weight: 0.2,
        description: `Current/recent loss streak of ${metrics.worstLossStreak}`
      });
    }

    // Risk: Short sessions (low engagement per session)
    if (metrics.avgSessionDuration > 0 && metrics.avgSessionDuration < 60) {
      factors.push({
        factor: 'short_sessions',
        severity: 'low',
        weight: 0.1,
        description: 'Average session under 1 minute'
      });
    }

    // Risk: No social connections
    if (metrics.totalSocial === 0 && !profile?.segments.find(s => s.type === 'socializer')) {
      factors.push({
        factor: 'no_social_ties',
        severity: 'low',
        weight: 0.1,
        description: 'No clan or social interactions'
      });
    }

    // Risk: At-risk engagement level
    if (profile?.engagementLevel === EngagementLevel.AT_RISK) {
      factors.push({
        factor: 'declining_engagement',
        severity: 'high',
        weight: 0.25,
        description: 'Engagement level marked as at-risk'
      });
    }

    // Risk: Already churned status
    if (profile?.playerLifecycle === PlayerLifecycle.CHURNED) {
      factors.push({
        factor: 'churned_status',
        severity: 'high',
        weight: 0.4,
        description: 'Player already classified as churned'
      });
    }

    return factors;
  }

  // Identify protective factors
  static identifyProtectiveFactors(playerId: string): string[] {
    const factors: string[] = [];
    const metrics = AnalyticsService.getAggregateMetrics(playerId);
    const profile = SegmentationService.getPlayerProfile(playerId);

    // Protective: High spender
    if (profile?.spenderTier === SpenderTier.WHALE || profile?.spenderTier === SpenderTier.SUPER_WHALE) {
      factors.push('High lifetime value - invested in the game');
    }

    // Protective: Clan member
    const user = db.prepare('SELECT clan_id FROM users WHERE id = ?').get(playerId) as { clan_id: string | null } | undefined;
    if (user?.clan_id) {
      factors.push('Active clan member - social ties');
    }

    // Protective: High win rate
    if (metrics.winRate > 55) {
      factors.push(`Strong performance (${metrics.winRate}% win rate)`);
    }

    // Protective: Win streak
    if (metrics.bestWinStreak >= 3) {
      factors.push(`Recent win streak (${metrics.bestWinStreak} wins)`);
    }

    // Protective: Long tenure
    if (profile?.playerLifecycle === PlayerLifecycle.VETERAN) {
      factors.push('Veteran player - long tenure');
    }

    // Protective: Highly engaged
    if (profile?.engagementLevel === EngagementLevel.HIGHLY_ENGAGED) {
      factors.push('Currently highly engaged');
    }

    // Protective: Recent purchase
    if (metrics.totalPurchases > 0) {
      factors.push('Has made purchases - invested');
    }

    return factors;
  }

  // Calculate churn probability
  static calculateChurnProbability(
    engagementScore: number,
    riskFactors: RiskFactor[]
  ): { probability7Day: number; probability30Day: number } {
    // Base probability inversely related to engagement
    let baseProbability = (100 - engagementScore) / 100;

    // Apply risk factor weights
    const totalRiskWeight = riskFactors.reduce((sum, f) => sum + f.weight, 0);
    const riskMultiplier = 1 + totalRiskWeight;

    let probability7Day = Math.min(0.95, baseProbability * riskMultiplier * 0.6);
    let probability30Day = Math.min(0.95, baseProbability * riskMultiplier * 0.85);

    // Adjust based on specific high-risk factors
    const hasChurnedStatus = riskFactors.some(f => f.factor === 'churned_status');
    if (hasChurnedStatus) {
      probability7Day = Math.max(probability7Day, 0.7);
      probability30Day = Math.max(probability30Day, 0.85);
    }

    const hasLongAbsence = riskFactors.some(f => f.factor === 'long_absence');
    if (hasLongAbsence) {
      probability7Day = Math.max(probability7Day, 0.5);
      probability30Day = Math.max(probability30Day, 0.7);
    }

    return {
      probability7Day: Math.round(probability7Day * 100) / 100,
      probability30Day: Math.round(probability30Day * 100) / 100
    };
  }

  // Determine risk tier
  static determineRiskTier(probability7Day: number): ChurnRiskTier {
    if (probability7Day >= 0.7) return ChurnRiskTier.CRITICAL;
    if (probability7Day >= 0.5) return ChurnRiskTier.HIGH;
    if (probability7Day >= 0.3) return ChurnRiskTier.MEDIUM;
    return ChurnRiskTier.LOW;
  }

  // Generate recommended interventions
  static generateInterventions(
    playerId: string,
    riskTier: ChurnRiskTier,
    riskFactors: RiskFactor[],
    engagementScore: number
  ): Intervention[] {
    const interventions: Intervention[] = [];
    const profile = SegmentationService.getPlayerProfile(playerId);

    // Check recent interventions to avoid spam
    const recentIntervention = interventionQueries.getRecent.get(
      playerId,
      Math.floor(Date.now() / 1000) - 24 * 60 * 60 // Last 24 hours
    ) as { id: string } | undefined;

    if (recentIntervention) {
      // Don't spam - return minimal interventions
      return [{
        type: InterventionType.IN_APP_MESSAGE,
        priority: 3,
        message: 'Welcome back! Check out the latest updates.',
        timing: 'next_session'
      }];
    }

    // Critical tier interventions
    if (riskTier === ChurnRiskTier.CRITICAL) {
      interventions.push({
        type: InterventionType.PUSH_NOTIFICATION,
        priority: 1,
        message: 'We miss you! Come back for an exclusive reward!',
        timing: 'immediate'
      });

      interventions.push({
        type: InterventionType.BONUS_REWARD,
        priority: 1,
        offer: {
          type: 'comeback_bonus',
          value: 500,
          currency: 'coins',
          expiresIn: 48
        }
      });

      if (profile?.spenderTier !== SpenderTier.NON_SPENDER) {
        interventions.push({
          type: InterventionType.DISCOUNT_OFFER,
          priority: 2,
          offer: {
            type: 'discount',
            value: 50,
            expiresIn: 24
          }
        });
      }
    }

    // High tier interventions
    if (riskTier === ChurnRiskTier.HIGH) {
      interventions.push({
        type: InterventionType.PUSH_NOTIFICATION,
        priority: 2,
        message: 'Your troops are waiting! A special bonus awaits you.',
        timing: 'optimal_time'
      });

      interventions.push({
        type: InterventionType.BONUS_REWARD,
        priority: 2,
        offer: {
          type: 'login_bonus',
          value: 200,
          currency: 'coins',
          expiresIn: 72
        }
      });
    }

    // Medium tier interventions
    if (riskTier === ChurnRiskTier.MEDIUM) {
      interventions.push({
        type: InterventionType.PUSH_NOTIFICATION,
        priority: 3,
        message: 'New challenges await! Log in to see what\'s new.',
        timing: 'optimal_time'
      });

      // If losing streak is a factor
      if (riskFactors.some(f => f.factor === 'loss_streak' || f.factor === 'low_win_rate')) {
        interventions.push({
          type: InterventionType.SPECIAL_EVENT,
          priority: 2,
          message: 'Easy mode event - boost your win rate!',
          timing: 'next_session'
        });
      }
    }

    // Social interventions for non-social players
    if (riskFactors.some(f => f.factor === 'no_social_ties')) {
      interventions.push({
        type: InterventionType.FRIEND_INVITE,
        priority: 3,
        message: 'Join a clan and earn bonus rewards!',
        offer: {
          type: 'clan_join_bonus',
          value: 100,
          currency: 'coins'
        }
      });
    }

    // Loyalty reward for veterans at risk
    if (profile?.playerLifecycle === PlayerLifecycle.VETERAN && riskTier !== ChurnRiskTier.LOW) {
      interventions.push({
        type: InterventionType.LOYALTY_REWARD,
        priority: 2,
        message: 'Thank you for being a loyal player!',
        offer: {
          type: 'veteran_bonus',
          value: 300,
          currency: 'coins'
        }
      });
    }

    // Sort by priority
    interventions.sort((a, b) => a.priority - b.priority);

    return interventions;
  }

  // Get full churn prediction for a player
  static async predictChurn(playerId: string): Promise<ChurnPrediction> {
    const engagementScore = this.calculateEngagementScore(playerId);
    const riskFactors = this.identifyRiskFactors(playerId);
    const protectiveFactors = this.identifyProtectiveFactors(playerId);
    const { probability7Day, probability30Day } = this.calculateChurnProbability(engagementScore, riskFactors);
    const riskTier = this.determineRiskTier(probability7Day);
    const interventions = this.generateInterventions(playerId, riskTier, riskFactors, engagementScore);

    const now = Math.floor(Date.now() / 1000);

    // Save prediction
    churnQueries.upsert.run(
      uuidv4(),
      playerId,
      engagementScore,
      probability7Day,
      probability30Day,
      riskTier,
      JSON.stringify(riskFactors),
      JSON.stringify(protectiveFactors),
      JSON.stringify(interventions)
    );

    return {
      playerId,
      engagementScore,
      churnProbability7Day: probability7Day,
      churnProbability30Day: probability30Day,
      riskTier,
      riskFactors,
      protectiveFactors,
      recommendedInterventions: interventions,
      lastUpdated: now
    };
  }

  // Get cached prediction
  static getCachedPrediction(playerId: string): ChurnPrediction | null {
    const row = churnQueries.getByPlayer.get(playerId) as {
      player_id: string;
      engagement_score: number;
      churn_probability_7d: number;
      churn_probability_30d: number;
      risk_tier: string;
      risk_factors: string;
      protective_factors: string;
      recommended_interventions: string;
      updated_at: number;
    } | undefined;

    if (!row) return null;

    return {
      playerId: row.player_id,
      engagementScore: row.engagement_score,
      churnProbability7Day: row.churn_probability_7d,
      churnProbability30Day: row.churn_probability_30d,
      riskTier: row.risk_tier as ChurnRiskTier,
      riskFactors: JSON.parse(row.risk_factors),
      protectiveFactors: JSON.parse(row.protective_factors),
      recommendedInterventions: JSON.parse(row.recommended_interventions),
      lastUpdated: row.updated_at
    };
  }

  // Get high risk players
  static getHighRiskPlayers(limit = 100): ChurnPrediction[] {
    const rows = churnQueries.getHighRisk.all(limit) as Array<{
      player_id: string;
      engagement_score: number;
      churn_probability_7d: number;
      churn_probability_30d: number;
      risk_tier: string;
      risk_factors: string;
      protective_factors: string;
      recommended_interventions: string;
      updated_at: number;
    }>;

    return rows.map(row => ({
      playerId: row.player_id,
      engagementScore: row.engagement_score,
      churnProbability7Day: row.churn_probability_7d,
      churnProbability30Day: row.churn_probability_30d,
      riskTier: row.risk_tier as ChurnRiskTier,
      riskFactors: JSON.parse(row.risk_factors),
      protectiveFactors: JSON.parse(row.protective_factors),
      recommendedInterventions: JSON.parse(row.recommended_interventions),
      lastUpdated: row.updated_at
    }));
  }

  // Trigger intervention
  static triggerIntervention(
    playerId: string,
    intervention: Intervention,
    triggeredBy: string = 'system'
  ): string {
    const interventionId = uuidv4();

    interventionQueries.insert.run(
      interventionId,
      playerId,
      intervention.type,
      JSON.stringify(intervention),
      triggeredBy
    );

    return interventionId;
  }

  // Record intervention outcome
  static recordInterventionOutcome(interventionId: string, outcome: string): void {
    interventionQueries.complete.run(
      outcome,
      Math.floor(Date.now() / 1000),
      interventionId
    );
  }

  // Get intervention history for player
  static getInterventionHistory(playerId: string, limit = 20): Array<{
    id: string;
    type: InterventionType;
    data: Intervention;
    triggeredBy: string;
    outcome: string | null;
    createdAt: number;
    completedAt: number | null;
  }> {
    const rows = interventionQueries.getByPlayer.all(playerId, limit) as Array<{
      id: string;
      intervention_type: string;
      intervention_data: string;
      triggered_by: string;
      outcome: string | null;
      created_at: number;
      completed_at: number | null;
    }>;

    return rows.map(row => ({
      id: row.id,
      type: row.intervention_type as InterventionType,
      data: JSON.parse(row.intervention_data || '{}'),
      triggeredBy: row.triggered_by,
      outcome: row.outcome,
      createdAt: row.created_at,
      completedAt: row.completed_at
    }));
  }

  // Batch update all predictions (for daily job)
  static async updateAllPredictions(): Promise<{ updated: number; highRisk: number; errors: number }> {
    const allUsers = db.prepare('SELECT id FROM users').all() as Array<{ id: string }>;

    let updated = 0;
    let highRisk = 0;
    let errors = 0;

    for (const user of allUsers) {
      try {
        const prediction = await this.predictChurn(user.id);
        updated++;

        if (prediction.riskTier === ChurnRiskTier.HIGH || prediction.riskTier === ChurnRiskTier.CRITICAL) {
          highRisk++;
        }
      } catch (error) {
        console.error(`Failed to predict churn for ${user.id}:`, error);
        errors++;
      }
    }

    console.log(`Churn prediction update complete: ${updated} updated, ${highRisk} high risk, ${errors} errors`);
    return { updated, highRisk, errors };
  }
}

// ============ API ROUTES ============

// Get churn risk for a player
router.get('/risk/:playerId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const forceRefresh = req.query.refresh === 'true';

    let prediction: ChurnPrediction | null = null;

    if (!forceRefresh) {
      prediction = ChurnPredictionService.getCachedPrediction(playerId);

      // Refresh if older than 6 hours
      if (prediction) {
        const hoursSinceUpdate = (Date.now() / 1000 - prediction.lastUpdated) / 3600;
        if (hoursSinceUpdate > 6) {
          prediction = null;
        }
      }
    }

    if (!prediction) {
      prediction = await ChurnPredictionService.predictChurn(playerId);
    }

    res.json(prediction);
  } catch (error) {
    console.error('Get churn risk error:', error);
    res.status(500).json({ error: 'Failed to get churn risk' });
  }
});

// Get engagement score only
router.get('/engagement/:playerId', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    const engagementScore = ChurnPredictionService.calculateEngagementScore(playerId);

    res.json({
      playerId,
      engagementScore,
      level: engagementScore >= 75 ? 'high' :
             engagementScore >= 50 ? 'medium' :
             engagementScore >= 25 ? 'low' : 'critical'
    });
  } catch (error) {
    console.error('Get engagement error:', error);
    res.status(500).json({ error: 'Failed to get engagement score' });
  }
});

// Get high risk players
router.get('/high-risk', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;

    const highRiskPlayers = ChurnPredictionService.getHighRiskPlayers(limit);

    res.json({
      players: highRiskPlayers,
      count: highRiskPlayers.length
    });
  } catch (error) {
    console.error('Get high risk error:', error);
    res.status(500).json({ error: 'Failed to get high risk players' });
  }
});

// Trigger intervention for player
router.post('/intervene/:playerId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { playerId } = req.params;
    const { intervention } = req.body as { intervention: Intervention };

    if (!intervention) {
      res.status(400).json({ error: 'Intervention details required' });
      return;
    }

    const interventionId = ChurnPredictionService.triggerIntervention(
      playerId,
      intervention,
      req.user.id
    );

    res.json({
      success: true,
      interventionId
    });
  } catch (error) {
    console.error('Trigger intervention error:', error);
    res.status(500).json({ error: 'Failed to trigger intervention' });
  }
});

// Record intervention outcome
router.post('/intervention/:interventionId/outcome', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { interventionId } = req.params;
    const { outcome } = req.body as { outcome: string };

    if (!outcome) {
      res.status(400).json({ error: 'Outcome required' });
      return;
    }

    ChurnPredictionService.recordInterventionOutcome(interventionId, outcome);

    res.json({ success: true });
  } catch (error) {
    console.error('Record outcome error:', error);
    res.status(500).json({ error: 'Failed to record outcome' });
  }
});

// Get intervention history
router.get('/interventions/:playerId', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;

    const history = ChurnPredictionService.getInterventionHistory(playerId, limit);

    res.json({ interventions: history });
  } catch (error) {
    console.error('Get interventions error:', error);
    res.status(500).json({ error: 'Failed to get intervention history' });
  }
});

// Batch update all predictions (admin)
router.post('/admin/batch-update', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await ChurnPredictionService.updateAllPredictions();

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Batch update error:', error);
    res.status(500).json({ error: 'Failed to batch update predictions' });
  }
});

export { router as churnRouter };
