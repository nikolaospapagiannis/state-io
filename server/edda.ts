/**
 * Engagement-Oriented Dynamic Difficulty Adjustment (EDDA)
 *
 * This module focuses on maximizing player engagement rather than just challenge.
 * It monitors engagement signals and adjusts difficulty to prevent churn.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ddaQueries, userQueries } from './database';
import { AuthRequest, authenticateToken } from './auth';
import { getPlayerSkillProfile, adjustDifficultyAfterMatch } from './dda';

const router = Router();

// ============ Types ============

export interface EngagementMetrics {
  playerId: string;
  totalSessions: number;
  avgSessionLength: number;
  sessionLengthTrend: number; // Positive = increasing, negative = decreasing
  playFrequencyTrend: number; // Sessions per week trend
  lastSessionTimestamp: number;
  daysSinceLastPlay: number;
  churnRiskScore: number; // 0-100, higher = more likely to churn
  engagementScore: number; // 0-100, overall engagement level
  abTestGroup: string; // For A/B testing different DDA strategies
}

export interface SessionData {
  sessionId: string;
  playerId: string;
  sessionStart: number;
  sessionEnd: number | null;
  matchesPlayed: number;
  wins: number;
  losses: number;
  avgMatchDuration: number;
  avgTerritoryControl: number;
  rageQuitCount: number;
  nearWinCount: number;
  frustrationDetected: boolean;
}

export interface EDDARecommendation {
  shouldReduceDifficulty: boolean;
  shouldShowEncouragement: boolean;
  recommendedBreak: boolean;
  suggestedGameMode: string | null;
  churnIntervention: boolean;
  interventionMessage: string | null;
}

// ============ Constants ============

const AB_TEST_GROUPS = ['control', 'aggressive_dda', 'engagement_first', 'challenge_seeker'];
const CHURN_RISK_THRESHOLDS = {
  LOW: 30,
  MEDIUM: 60,
  HIGH: 80,
};

// ============ Session Management ============

/**
 * Starts a new session for a player
 */
export function startSession(playerId: string): SessionData {
  const sessionId = uuidv4();
  const now = Math.floor(Date.now() / 1000);

  ddaQueries.createSession.run(sessionId, playerId, now);

  return {
    sessionId,
    playerId,
    sessionStart: now,
    sessionEnd: null,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    avgMatchDuration: 0,
    avgTerritoryControl: 0,
    rageQuitCount: 0,
    nearWinCount: 0,
    frustrationDetected: false,
  };
}

/**
 * Updates session with match data
 */
export function updateSessionMatch(
  sessionId: string,
  won: boolean,
  matchDuration: number,
  territoryControl: number,
  wasRageQuit: boolean,
  wasNearWin: boolean
): void {
  const sessions = ddaQueries.getPlayerSessions.all('', 1) as Array<{
    id: string;
    matches_played: number;
    wins: number;
    losses: number;
    avg_match_duration: number;
    avg_territory_control: number;
    rage_quit_count: number;
    near_win_count: number;
  }>;

  // Find the session
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return;

  const n = session.matches_played;
  const newAvgDuration = (session.avg_match_duration * n + matchDuration) / (n + 1);
  const newAvgControl = (session.avg_territory_control * n + territoryControl) / (n + 1);

  // Detect frustration: multiple rage quits or near-wins without victory
  const frustrationDetected =
    session.rage_quit_count >= 2 ||
    (session.near_win_count >= 3 && session.wins === 0);

  const now = Math.floor(Date.now() / 1000);

  ddaQueries.updateSession.run(
    now,
    n + 1,
    session.wins + (won ? 1 : 0),
    session.losses + (won ? 0 : 1),
    newAvgDuration,
    newAvgControl,
    session.rage_quit_count + (wasRageQuit ? 1 : 0),
    session.near_win_count + (wasNearWin ? 1 : 0),
    frustrationDetected ? 1 : 0,
    sessionId
  );
}

/**
 * Ends a session and updates engagement metrics
 */
export function endSession(playerId: string, sessionId: string): void {
  const now = Math.floor(Date.now() / 1000);

  // Get session data
  const sessions = ddaQueries.getPlayerSessions.all(playerId, 10) as Array<{
    id: string;
    session_start: number;
    session_end: number | null;
    matches_played: number;
    wins: number;
    losses: number;
    avg_match_duration: number;
    avg_territory_control: number;
    rage_quit_count: number;
    near_win_count: number;
    frustration_detected: number;
  }>;

  const currentSession = sessions.find(s => s.id === sessionId);
  if (!currentSession) return;

  // Update session end time
  ddaQueries.updateSession.run(
    now,
    currentSession.matches_played,
    currentSession.wins,
    currentSession.losses,
    currentSession.avg_match_duration,
    currentSession.avg_territory_control,
    currentSession.rage_quit_count,
    currentSession.near_win_count,
    currentSession.frustration_detected,
    sessionId
  );

  // Update engagement metrics
  updateEngagementMetrics(playerId, sessions);
}

// ============ Engagement Analysis ============

/**
 * Gets or creates engagement metrics for a player
 */
export function getEngagementMetrics(playerId: string): EngagementMetrics {
  const existing = ddaQueries.getEngagementMetrics.get(playerId) as {
    player_id: string;
    total_sessions: number;
    avg_session_length: number;
    session_length_trend: number;
    play_frequency_trend: number;
    last_session_timestamp: number;
    days_since_last_play: number;
    churn_risk_score: number;
    engagement_score: number;
    ab_test_group: string;
  } | undefined;

  if (existing) {
    // Update days since last play
    const now = Math.floor(Date.now() / 1000);
    const daysSinceLastPlay = Math.floor((now - existing.last_session_timestamp) / 86400);

    return {
      playerId: existing.player_id,
      totalSessions: existing.total_sessions,
      avgSessionLength: existing.avg_session_length,
      sessionLengthTrend: existing.session_length_trend,
      playFrequencyTrend: existing.play_frequency_trend,
      lastSessionTimestamp: existing.last_session_timestamp,
      daysSinceLastPlay,
      churnRiskScore: existing.churn_risk_score,
      engagementScore: existing.engagement_score,
      abTestGroup: existing.ab_test_group,
    };
  }

  // Create default metrics with random A/B test group
  const abTestGroup = AB_TEST_GROUPS[Math.floor(Math.random() * AB_TEST_GROUPS.length)];
  const now = Math.floor(Date.now() / 1000);

  const defaultMetrics: EngagementMetrics = {
    playerId,
    totalSessions: 0,
    avgSessionLength: 0,
    sessionLengthTrend: 0,
    playFrequencyTrend: 0,
    lastSessionTimestamp: now,
    daysSinceLastPlay: 0,
    churnRiskScore: 0,
    engagementScore: 50,
    abTestGroup,
  };

  ddaQueries.upsertEngagementMetrics.run(
    playerId,
    defaultMetrics.totalSessions,
    defaultMetrics.avgSessionLength,
    defaultMetrics.sessionLengthTrend,
    defaultMetrics.playFrequencyTrend,
    defaultMetrics.lastSessionTimestamp,
    defaultMetrics.daysSinceLastPlay,
    defaultMetrics.churnRiskScore,
    defaultMetrics.engagementScore,
    defaultMetrics.abTestGroup
  );

  return defaultMetrics;
}

/**
 * Updates engagement metrics based on session history
 */
function updateEngagementMetrics(playerId: string, sessions: Array<{
  session_start: number;
  session_end: number | null;
  matches_played: number;
}>): void {
  if (sessions.length === 0) return;

  const now = Math.floor(Date.now() / 1000);
  const metrics = getEngagementMetrics(playerId);

  // Calculate session lengths
  const sessionLengths = sessions
    .filter(s => s.session_end !== null)
    .map(s => (s.session_end! - s.session_start) / 60); // In minutes

  const avgSessionLength = sessionLengths.length > 0
    ? sessionLengths.reduce((a, b) => a + b, 0) / sessionLengths.length
    : 0;

  // Calculate session length trend (comparing recent to older sessions)
  let sessionLengthTrend = 0;
  if (sessionLengths.length >= 4) {
    const recentAvg = (sessionLengths[0] + sessionLengths[1]) / 2;
    const olderAvg = (sessionLengths[2] + sessionLengths[3]) / 2;
    sessionLengthTrend = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;
  }

  // Calculate play frequency trend
  const sessionTimestamps = sessions.map(s => s.session_start).sort((a, b) => b - a);
  let playFrequencyTrend = 0;
  if (sessionTimestamps.length >= 4) {
    const recentGap = sessionTimestamps[0] - sessionTimestamps[1];
    const olderGap = sessionTimestamps[2] - sessionTimestamps[3];
    playFrequencyTrend = recentGap > 0 ? (olderGap - recentGap) / recentGap : 0;
  }

  // Calculate churn risk score
  const churnRiskScore = calculateChurnRisk(
    metrics.daysSinceLastPlay,
    sessionLengthTrend,
    playFrequencyTrend,
    sessions
  );

  // Calculate engagement score
  const engagementScore = calculateEngagementScore(
    avgSessionLength,
    sessionLengthTrend,
    playFrequencyTrend,
    sessions
  );

  ddaQueries.upsertEngagementMetrics.run(
    playerId,
    sessions.length,
    avgSessionLength,
    sessionLengthTrend,
    playFrequencyTrend,
    now,
    0, // Just played, so 0 days
    churnRiskScore,
    engagementScore,
    metrics.abTestGroup
  );
}

/**
 * Calculates churn risk score (0-100)
 */
function calculateChurnRisk(
  daysSinceLastPlay: number,
  sessionLengthTrend: number,
  playFrequencyTrend: number,
  sessions: Array<{ frustration_detected?: number }>
): number {
  let risk = 0;

  // Days since last play (0-40 points)
  if (daysSinceLastPlay > 14) risk += 40;
  else if (daysSinceLastPlay > 7) risk += 30;
  else if (daysSinceLastPlay > 3) risk += 15;
  else if (daysSinceLastPlay > 1) risk += 5;

  // Decreasing session length (0-25 points)
  if (sessionLengthTrend < -0.3) risk += 25;
  else if (sessionLengthTrend < -0.15) risk += 15;
  else if (sessionLengthTrend < 0) risk += 5;

  // Decreasing play frequency (0-20 points)
  if (playFrequencyTrend < -0.3) risk += 20;
  else if (playFrequencyTrend < -0.15) risk += 10;
  else if (playFrequencyTrend < 0) risk += 5;

  // Recent frustration (0-15 points)
  const recentFrustration = sessions
    .slice(0, 3)
    .filter(s => s.frustration_detected === 1).length;
  risk += recentFrustration * 5;

  return Math.min(100, risk);
}

/**
 * Calculates engagement score (0-100)
 */
function calculateEngagementScore(
  avgSessionLength: number,
  sessionLengthTrend: number,
  playFrequencyTrend: number,
  sessions: Array<{ matches_played: number; wins: number }>
): number {
  let score = 50; // Start neutral

  // Session length bonus (up to +20)
  if (avgSessionLength > 30) score += 20;
  else if (avgSessionLength > 15) score += 15;
  else if (avgSessionLength > 5) score += 10;
  else score -= 5;

  // Session length trend bonus (up to +15)
  if (sessionLengthTrend > 0.2) score += 15;
  else if (sessionLengthTrend > 0.1) score += 10;
  else if (sessionLengthTrend > 0) score += 5;
  else if (sessionLengthTrend < -0.1) score -= 10;

  // Play frequency trend bonus (up to +15)
  if (playFrequencyTrend > 0.2) score += 15;
  else if (playFrequencyTrend > 0.1) score += 10;
  else if (playFrequencyTrend > 0) score += 5;
  else if (playFrequencyTrend < -0.1) score -= 10;

  // Recent activity bonus
  const recentMatches = sessions.slice(0, 3)
    .reduce((sum, s) => sum + s.matches_played, 0);
  if (recentMatches > 10) score += 10;
  else if (recentMatches > 5) score += 5;

  // Win rate in recent sessions
  const recentWins = sessions.slice(0, 3).reduce((sum, s) => sum + s.wins, 0);
  const recentTotal = sessions.slice(0, 3)
    .reduce((sum, s) => sum + s.matches_played, 0);
  if (recentTotal > 0) {
    const winRate = recentWins / recentTotal;
    if (winRate > 0.4 && winRate < 0.7) score += 10; // Good balance
    else if (winRate < 0.2 || winRate > 0.9) score -= 5; // Too extreme
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Detects rage quit based on game metrics
 */
export function detectRageQuit(
  gameDuration: number,
  territoryControlAtEnd: number,
  playerSurrendered: boolean,
  matchAvgDuration: number
): boolean {
  // Rage quit indicators:
  // 1. Game ended very quickly (< 30% of average)
  // 2. Player had significant territory but surrendered
  // 3. Disconnection while not losing

  if (playerSurrendered) {
    // Surrendered with good territory control = likely rage quit
    if (territoryControlAtEnd > 0.3) return true;

    // Very quick surrender
    if (gameDuration < matchAvgDuration * 0.3) return true;
  }

  return false;
}

/**
 * Detects near-win experience
 */
export function detectNearWin(
  territoryControlPeak: number,
  territoryControlFinal: number,
  won: boolean
): boolean {
  if (won) return false;

  // Had majority control at some point but lost
  if (territoryControlPeak > 0.6 && territoryControlFinal < 0.5) return true;

  // Was very close to winning
  if (territoryControlPeak > 0.8) return true;

  return false;
}

/**
 * Gets EDDA recommendations for a player
 */
export function getEDDARecommendations(playerId: string): EDDARecommendation {
  const engagement = getEngagementMetrics(playerId);
  const skill = getPlayerSkillProfile(playerId);

  const recommendation: EDDARecommendation = {
    shouldReduceDifficulty: false,
    shouldShowEncouragement: false,
    recommendedBreak: false,
    suggestedGameMode: null,
    churnIntervention: false,
    interventionMessage: null,
  };

  // Apply A/B test group strategies
  switch (engagement.abTestGroup) {
    case 'aggressive_dda':
      // More aggressive difficulty reduction on losses
      if (skill.winRate < 0.4) {
        recommendation.shouldReduceDifficulty = true;
      }
      break;

    case 'engagement_first':
      // Prioritize keeping sessions going
      if (engagement.engagementScore < 40) {
        recommendation.shouldShowEncouragement = true;
        recommendation.shouldReduceDifficulty = true;
      }
      break;

    case 'challenge_seeker':
      // Less difficulty reduction, more encouragement
      if (skill.winRate < 0.3) {
        recommendation.shouldShowEncouragement = true;
      }
      break;

    default: // control
      // Standard behavior
      break;
  }

  // Churn intervention
  if (engagement.churnRiskScore > CHURN_RISK_THRESHOLDS.HIGH) {
    recommendation.churnIntervention = true;
    recommendation.shouldReduceDifficulty = true;
    recommendation.interventionMessage = 'Welcome back! We\'ve prepared some easier challenges for you.';
  } else if (engagement.churnRiskScore > CHURN_RISK_THRESHOLDS.MEDIUM) {
    recommendation.churnIntervention = true;
    recommendation.interventionMessage = 'We missed you! Check out the new daily challenges.';
  }

  // Returning player bonus
  if (engagement.daysSinceLastPlay > 3) {
    recommendation.shouldShowEncouragement = true;
    recommendation.shouldReduceDifficulty = true;
  }

  // Frustration detection from recent sessions
  if (engagement.engagementScore < 30) {
    recommendation.recommendedBreak = true;
    recommendation.suggestedGameMode = 'Practice';
  }

  return recommendation;
}

// ============ API Routes ============

// Get engagement metrics
router.get('/metrics/:playerId', (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;
    const metrics = getEngagementMetrics(playerId);
    const recommendations = getEDDARecommendations(playerId);

    res.json({
      metrics: {
        totalSessions: metrics.totalSessions,
        avgSessionLength: Math.round(metrics.avgSessionLength),
        sessionLengthTrend: metrics.sessionLengthTrend > 0 ? 'increasing' : metrics.sessionLengthTrend < 0 ? 'decreasing' : 'stable',
        playFrequencyTrend: metrics.playFrequencyTrend > 0 ? 'increasing' : metrics.playFrequencyTrend < 0 ? 'decreasing' : 'stable',
        daysSinceLastPlay: metrics.daysSinceLastPlay,
        engagementScore: Math.round(metrics.engagementScore),
        churnRiskLevel: getChurnRiskLevel(metrics.churnRiskScore),
      },
      recommendations,
      abTestGroup: metrics.abTestGroup,
    });
  } catch (error) {
    console.error('Get engagement metrics error:', error);
    res.status(500).json({ error: 'Failed to get engagement metrics' });
  }
});

// Start session
router.post('/session/start', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const session = startSession(req.user.id);
    const recommendations = getEDDARecommendations(req.user.id);

    res.json({
      sessionId: session.sessionId,
      recommendations,
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

    const { sessionId } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID required' });
      return;
    }

    endSession(req.user.id, sessionId);

    res.json({ message: 'Session ended successfully' });
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// Record session match
router.post('/session/match', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const {
      sessionId,
      won,
      matchDuration,
      territoryControl,
      territoryControlPeak,
      playerSurrendered,
      matchAvgDuration,
    } = req.body;

    if (!sessionId) {
      res.status(400).json({ error: 'Session ID required' });
      return;
    }

    const wasRageQuit = detectRageQuit(
      matchDuration || 0,
      territoryControl || 0,
      playerSurrendered || false,
      matchAvgDuration || 300
    );

    const wasNearWin = detectNearWin(
      territoryControlPeak || 0,
      territoryControl || 0,
      won || false
    );

    updateSessionMatch(
      sessionId,
      won || false,
      matchDuration || 0,
      territoryControl || 0,
      wasRageQuit,
      wasNearWin
    );

    // Apply EDDA adjustments
    const recommendations = getEDDARecommendations(req.user.id);

    if (recommendations.shouldReduceDifficulty) {
      adjustDifficultyAfterMatch(req.user.id, won, wasNearWin);
    }

    res.json({
      wasRageQuit,
      wasNearWin,
      recommendations,
    });
  } catch (error) {
    console.error('Record session match error:', error);
    res.status(500).json({ error: 'Failed to record session match' });
  }
});

// Get A/B test results (admin endpoint)
router.get('/ab-test/results', (req: Request, res: Response) => {
  try {
    // This would aggregate engagement data by A/B test group
    // For now, return placeholder data
    res.json({
      groups: AB_TEST_GROUPS.map(group => ({
        name: group,
        playerCount: 0, // Would query from database
        avgEngagementScore: 0,
        avgChurnRisk: 0,
        avgWinRate: 0,
      })),
      recommendation: 'Collect more data before drawing conclusions',
    });
  } catch (error) {
    console.error('Get A/B test results error:', error);
    res.status(500).json({ error: 'Failed to get A/B test results' });
  }
});

// ============ Helper Functions ============

function getChurnRiskLevel(score: number): string {
  if (score >= CHURN_RISK_THRESHOLDS.HIGH) return 'high';
  if (score >= CHURN_RISK_THRESHOLDS.MEDIUM) return 'medium';
  if (score >= CHURN_RISK_THRESHOLDS.LOW) return 'low';
  return 'minimal';
}

export { router as eddaRouter };
