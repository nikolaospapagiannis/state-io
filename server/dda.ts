/**
 * Dynamic Difficulty Adjustment (DDA) - Player Skill Assessment System
 *
 * This module calculates and manages player skill ratings separate from ELO.
 * It tracks performance metrics per session and determines skill bands.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ddaQueries, userQueries } from './database';
import { AuthRequest, authenticateToken } from './auth';

const router = Router();

// ============ Types ============

export type SkillBand = 'Beginner' | 'Novice' | 'Intermediate' | 'Advanced' | 'Expert' | 'Master';

export interface PlayerSkillProfile {
  playerId: string;
  skillRating: number;
  skillBand: SkillBand;
  winRate: number;
  avgGameDuration: number;
  avgTerritoryControl: number;
  strategicScore: number;
  gamesAnalyzed: number;
  lastUpdated: number;
}

export interface MatchPerformance {
  matchId: string;
  playerId: string;
  territoryControlPeak: number;
  territoryControlFinal: number;
  troopsEfficiency: number;
  strategicMoves: number;
  reactionTimeAvg: number;
  wasNearWin: boolean;
  wasRageQuit: boolean;
  gameDuration: number;
  won: boolean;
}

export interface DifficultySettings {
  aiReactionTimeMultiplier: number;
  aiAggressionMultiplier: number;
  aiEfficiencyMultiplier: number;
  aiCoordinationMultiplier: number;
  targetWinRate: number;
  frustrationRecoveryActive: boolean;
  consecutiveLosses: number;
  consecutiveWins: number;
}

// ============ Skill Band Thresholds ============

const SKILL_BAND_THRESHOLDS: { band: SkillBand; minRating: number }[] = [
  { band: 'Master', minRating: 2000 },
  { band: 'Expert', minRating: 1600 },
  { band: 'Advanced', minRating: 1300 },
  { band: 'Intermediate', minRating: 1000 },
  { band: 'Novice', minRating: 700 },
  { band: 'Beginner', minRating: 0 },
];

// ============ Skill Assessment Functions ============

/**
 * Determines skill band based on skill rating
 */
export function getSkillBand(skillRating: number): SkillBand {
  for (const threshold of SKILL_BAND_THRESHOLDS) {
    if (skillRating >= threshold.minRating) {
      return threshold.band;
    }
  }
  return 'Beginner';
}

/**
 * Calculates strategic score based on game patterns
 * Strategic score measures: multi-territory attacks, timing, resource management
 */
export function calculateStrategicScore(performance: MatchPerformance): number {
  let score = 0;

  // Territory control consistency (0-30 points)
  const controlDiff = performance.territoryControlPeak - performance.territoryControlFinal;
  if (controlDiff < 0.1) {
    score += 30; // Maintained or grew control
  } else if (controlDiff < 0.3) {
    score += 20;
  } else {
    score += 10;
  }

  // Troop efficiency (0-30 points)
  score += Math.min(30, performance.troopsEfficiency * 30);

  // Strategic moves count (0-20 points)
  score += Math.min(20, performance.strategicMoves * 2);

  // Reaction time bonus (0-20 points) - faster is better
  if (performance.reactionTimeAvg < 500) {
    score += 20;
  } else if (performance.reactionTimeAvg < 1000) {
    score += 15;
  } else if (performance.reactionTimeAvg < 2000) {
    score += 10;
  } else {
    score += 5;
  }

  return Math.min(100, score);
}

/**
 * Updates player skill rating based on match performance
 */
export function calculateSkillRatingChange(
  currentRating: number,
  performance: MatchPerformance,
  opponentAvgRating: number
): number {
  const K = 32; // Base adjustment factor

  // Expected score based on rating difference
  const expectedScore = 1 / (1 + Math.pow(10, (opponentAvgRating - currentRating) / 400));

  // Actual score (0-1 based on performance, not just win/loss)
  let actualScore = performance.won ? 1 : 0;

  // Adjust actual score based on performance quality
  const performanceBonus = calculateStrategicScore(performance) / 100;

  // Near-win bonus for losses
  if (!performance.won && performance.wasNearWin) {
    actualScore += 0.2;
  }

  // Performance multiplier
  const performanceMultiplier = 0.5 + performanceBonus * 0.5;

  // Calculate rating change
  let ratingChange = K * (actualScore - expectedScore) * performanceMultiplier;

  // Prevent excessive losses for beginners
  if (currentRating < 800 && ratingChange < -10) {
    ratingChange = -10;
  }

  // Cap gains for already high-rated players
  if (currentRating > 1800 && ratingChange > 20) {
    ratingChange = 20;
  }

  return Math.round(ratingChange);
}

/**
 * Gets or creates player skill profile
 */
export function getPlayerSkillProfile(playerId: string): PlayerSkillProfile {
  const existing = ddaQueries.getPlayerSkill.get(playerId) as {
    player_id: string;
    skill_rating: number;
    skill_band: string;
    win_rate: number;
    avg_game_duration: number;
    avg_territory_control: number;
    strategic_score: number;
    games_analyzed: number;
    last_updated: number;
  } | undefined;

  if (existing) {
    return {
      playerId: existing.player_id,
      skillRating: existing.skill_rating,
      skillBand: existing.skill_band as SkillBand,
      winRate: existing.win_rate,
      avgGameDuration: existing.avg_game_duration,
      avgTerritoryControl: existing.avg_territory_control,
      strategicScore: existing.strategic_score,
      gamesAnalyzed: existing.games_analyzed,
      lastUpdated: existing.last_updated,
    };
  }

  // Create default profile
  const defaultProfile: PlayerSkillProfile = {
    playerId,
    skillRating: 1000,
    skillBand: 'Intermediate',
    winRate: 0,
    avgGameDuration: 0,
    avgTerritoryControl: 0,
    strategicScore: 0,
    gamesAnalyzed: 0,
    lastUpdated: Math.floor(Date.now() / 1000),
  };

  ddaQueries.upsertPlayerSkill.run(
    playerId,
    defaultProfile.skillRating,
    defaultProfile.skillBand,
    defaultProfile.winRate,
    defaultProfile.avgGameDuration,
    defaultProfile.avgTerritoryControl,
    defaultProfile.strategicScore,
    defaultProfile.gamesAnalyzed,
    defaultProfile.lastUpdated
  );

  return defaultProfile;
}

/**
 * Updates player skill profile after a match
 */
export function updatePlayerSkillAfterMatch(
  playerId: string,
  performance: MatchPerformance,
  opponentAvgRating: number
): PlayerSkillProfile {
  const profile = getPlayerSkillProfile(playerId);

  // Calculate new values
  const ratingChange = calculateSkillRatingChange(
    profile.skillRating,
    performance,
    opponentAvgRating
  );

  const newRating = Math.max(0, profile.skillRating + ratingChange);
  const newBand = getSkillBand(newRating);

  // Update running averages
  const n = profile.gamesAnalyzed;
  const newWinRate = (profile.winRate * n + (performance.won ? 1 : 0)) / (n + 1);
  const newAvgDuration = (profile.avgGameDuration * n + performance.gameDuration) / (n + 1);
  const newAvgControl = (profile.avgTerritoryControl * n + performance.territoryControlFinal) / (n + 1);
  const strategicScore = calculateStrategicScore(performance);
  const newStrategicScore = (profile.strategicScore * n + strategicScore) / (n + 1);

  const now = Math.floor(Date.now() / 1000);

  // Update database
  ddaQueries.upsertPlayerSkill.run(
    playerId,
    newRating,
    newBand,
    newWinRate,
    newAvgDuration,
    newAvgControl,
    newStrategicScore,
    n + 1,
    now
  );

  // Record match performance
  ddaQueries.addMatchPerformance.run(
    uuidv4(),
    performance.matchId,
    playerId,
    performance.territoryControlPeak,
    performance.territoryControlFinal,
    performance.troopsEfficiency,
    performance.strategicMoves,
    performance.reactionTimeAvg,
    performance.wasNearWin ? 1 : 0,
    performance.wasRageQuit ? 1 : 0,
    performance.gameDuration
  );

  return {
    playerId,
    skillRating: newRating,
    skillBand: newBand,
    winRate: newWinRate,
    avgGameDuration: newAvgDuration,
    avgTerritoryControl: newAvgControl,
    strategicScore: newStrategicScore,
    gamesAnalyzed: n + 1,
    lastUpdated: now,
  };
}

/**
 * Gets player difficulty settings (for AI adjustment)
 */
export function getPlayerDifficultySettings(playerId: string): DifficultySettings {
  const existing = ddaQueries.getPlayerDifficulty.get(playerId) as {
    player_id: string;
    ai_reaction_time_multiplier: number;
    ai_aggression_multiplier: number;
    ai_efficiency_multiplier: number;
    ai_coordination_multiplier: number;
    target_win_rate: number;
    frustration_recovery_active: number;
    consecutive_losses: number;
    consecutive_wins: number;
    last_difficulty_adjustment: number;
  } | undefined;

  if (existing) {
    return {
      aiReactionTimeMultiplier: existing.ai_reaction_time_multiplier,
      aiAggressionMultiplier: existing.ai_aggression_multiplier,
      aiEfficiencyMultiplier: existing.ai_efficiency_multiplier,
      aiCoordinationMultiplier: existing.ai_coordination_multiplier,
      targetWinRate: existing.target_win_rate,
      frustrationRecoveryActive: existing.frustration_recovery_active === 1,
      consecutiveLosses: existing.consecutive_losses,
      consecutiveWins: existing.consecutive_wins,
    };
  }

  // Create default settings
  const defaultSettings: DifficultySettings = {
    aiReactionTimeMultiplier: 1.0,
    aiAggressionMultiplier: 1.0,
    aiEfficiencyMultiplier: 1.0,
    aiCoordinationMultiplier: 1.0,
    targetWinRate: 0.55,
    frustrationRecoveryActive: false,
    consecutiveLosses: 0,
    consecutiveWins: 0,
  };

  const now = Math.floor(Date.now() / 1000);
  ddaQueries.upsertPlayerDifficulty.run(
    playerId,
    defaultSettings.aiReactionTimeMultiplier,
    defaultSettings.aiAggressionMultiplier,
    defaultSettings.aiEfficiencyMultiplier,
    defaultSettings.aiCoordinationMultiplier,
    defaultSettings.targetWinRate,
    0,
    0,
    0,
    now
  );

  return defaultSettings;
}

/**
 * Adjusts difficulty based on match result
 * Target win rate: 50-60%
 */
export function adjustDifficultyAfterMatch(
  playerId: string,
  won: boolean,
  wasNearWin: boolean = false
): DifficultySettings {
  const settings = getPlayerDifficultySettings(playerId);
  const profile = getPlayerSkillProfile(playerId);

  // Update consecutive counts
  let newConsecutiveLosses = won ? 0 : settings.consecutiveLosses + 1;
  let newConsecutiveWins = won ? settings.consecutiveWins + 1 : 0;

  // Check for frustration (3+ consecutive losses)
  const frustrationRecoveryActive = newConsecutiveLosses >= 3;

  // Calculate adjustment factors based on recent performance
  let reactionTimeMultiplier = settings.aiReactionTimeMultiplier;
  let aggressionMultiplier = settings.aiAggressionMultiplier;
  let efficiencyMultiplier = settings.aiEfficiencyMultiplier;
  let coordinationMultiplier = settings.aiCoordinationMultiplier;

  // If player is losing too much, make AI easier
  if (profile.winRate < 0.45 || frustrationRecoveryActive) {
    // Slower AI reactions (easier for player)
    reactionTimeMultiplier = Math.min(1.5, reactionTimeMultiplier + 0.1);
    // Less aggressive AI
    aggressionMultiplier = Math.max(0.6, aggressionMultiplier - 0.1);
    // Less efficient AI resource management
    efficiencyMultiplier = Math.max(0.6, efficiencyMultiplier - 0.1);
    // Less coordinated AI attacks
    coordinationMultiplier = Math.max(0.6, coordinationMultiplier - 0.1);
  }
  // If player is winning too much, make AI harder
  else if (profile.winRate > 0.65 || newConsecutiveWins >= 5) {
    // Faster AI reactions
    reactionTimeMultiplier = Math.max(0.5, reactionTimeMultiplier - 0.1);
    // More aggressive AI
    aggressionMultiplier = Math.min(1.5, aggressionMultiplier + 0.1);
    // More efficient AI
    efficiencyMultiplier = Math.min(1.5, efficiencyMultiplier + 0.1);
    // Better coordinated AI
    coordinationMultiplier = Math.min(1.5, coordinationMultiplier + 0.1);
  }
  // Near-win provides slight adjustment to keep it engaging
  else if (!won && wasNearWin) {
    // Small adjustment - player was close, keep it interesting
    reactionTimeMultiplier = Math.min(1.2, reactionTimeMultiplier + 0.02);
  }

  const now = Math.floor(Date.now() / 1000);

  const newSettings: DifficultySettings = {
    aiReactionTimeMultiplier: reactionTimeMultiplier,
    aiAggressionMultiplier: aggressionMultiplier,
    aiEfficiencyMultiplier: efficiencyMultiplier,
    aiCoordinationMultiplier: coordinationMultiplier,
    targetWinRate: 0.55,
    frustrationRecoveryActive,
    consecutiveLosses: newConsecutiveLosses,
    consecutiveWins: newConsecutiveWins,
  };

  ddaQueries.upsertPlayerDifficulty.run(
    playerId,
    newSettings.aiReactionTimeMultiplier,
    newSettings.aiAggressionMultiplier,
    newSettings.aiEfficiencyMultiplier,
    newSettings.aiCoordinationMultiplier,
    newSettings.targetWinRate,
    newSettings.frustrationRecoveryActive ? 1 : 0,
    newSettings.consecutiveLosses,
    newSettings.consecutiveWins,
    now
  );

  return newSettings;
}

/**
 * Gets combined DDA data for a player (skill + difficulty)
 */
export function getPlayerDDAData(playerId: string): {
  skill: PlayerSkillProfile;
  difficulty: DifficultySettings;
} {
  return {
    skill: getPlayerSkillProfile(playerId),
    difficulty: getPlayerDifficultySettings(playerId),
  };
}

// ============ API Routes ============

// Get player skill assessment
router.get('/skill/:playerId', (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;

    // Verify player exists
    const user = userQueries.findById.get(playerId);
    if (!user) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const profile = getPlayerSkillProfile(playerId);
    const difficulty = getPlayerDifficultySettings(playerId);

    res.json({
      skill: {
        playerId: profile.playerId,
        skillRating: profile.skillRating,
        skillBand: profile.skillBand,
        winRate: Math.round(profile.winRate * 100),
        avgGameDuration: Math.round(profile.avgGameDuration),
        avgTerritoryControl: Math.round(profile.avgTerritoryControl * 100),
        strategicScore: Math.round(profile.strategicScore),
        gamesAnalyzed: profile.gamesAnalyzed,
      },
      difficulty: {
        aiReactionTimeMultiplier: difficulty.aiReactionTimeMultiplier,
        aiAggressionMultiplier: difficulty.aiAggressionMultiplier,
        aiEfficiencyMultiplier: difficulty.aiEfficiencyMultiplier,
        aiCoordinationMultiplier: difficulty.aiCoordinationMultiplier,
        frustrationRecoveryActive: difficulty.frustrationRecoveryActive,
        consecutiveLosses: difficulty.consecutiveLosses,
        consecutiveWins: difficulty.consecutiveWins,
      },
      skillBandInfo: {
        currentBand: profile.skillBand,
        nextBand: getNextSkillBand(profile.skillBand),
        ratingToNextBand: getRatingToNextBand(profile.skillRating),
      },
    });
  } catch (error) {
    console.error('Get skill error:', error);
    res.status(500).json({ error: 'Failed to get skill data' });
  }
});

// Get difficulty settings for game start
router.get('/difficulty/:playerId', (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;
    const difficulty = getPlayerDifficultySettings(playerId);

    res.json({
      settings: difficulty,
      adjustments: {
        description: getDifficultyDescription(difficulty),
        isRecoveryMode: difficulty.frustrationRecoveryActive,
      },
    });
  } catch (error) {
    console.error('Get difficulty error:', error);
    res.status(500).json({ error: 'Failed to get difficulty settings' });
  }
});

// Record match performance (called after game ends)
router.post('/record-match', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const {
      matchId,
      territoryControlPeak,
      territoryControlFinal,
      troopsEfficiency,
      strategicMoves,
      reactionTimeAvg,
      wasNearWin,
      wasRageQuit,
      gameDuration,
      won,
      opponentAvgRating,
    } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const performance: MatchPerformance = {
      matchId,
      playerId: req.user.id,
      territoryControlPeak: territoryControlPeak || 0,
      territoryControlFinal: territoryControlFinal || 0,
      troopsEfficiency: troopsEfficiency || 0.5,
      strategicMoves: strategicMoves || 0,
      reactionTimeAvg: reactionTimeAvg || 1000,
      wasNearWin: wasNearWin || false,
      wasRageQuit: wasRageQuit || false,
      gameDuration: gameDuration || 0,
      won: won || false,
    };

    const updatedSkill = updatePlayerSkillAfterMatch(
      req.user.id,
      performance,
      opponentAvgRating || 1000
    );

    const updatedDifficulty = adjustDifficultyAfterMatch(
      req.user.id,
      won,
      wasNearWin
    );

    res.json({
      message: 'Match performance recorded',
      skill: updatedSkill,
      difficulty: updatedDifficulty,
    });
  } catch (error) {
    console.error('Record match error:', error);
    res.status(500).json({ error: 'Failed to record match performance' });
  }
});

// Get performance history
router.get('/history/:playerId', (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;
    const limit = Math.min(50, parseInt(req.query.limit as string) || 10);

    const performances = ddaQueries.getPlayerPerformance.all(playerId, limit) as Array<{
      id: string;
      match_id: string;
      player_id: string;
      territory_control_peak: number;
      territory_control_final: number;
      troops_efficiency: number;
      strategic_moves: number;
      reaction_time_avg: number;
      was_near_win: number;
      was_rage_quit: number;
      game_duration: number;
      created_at: number;
    }>;

    res.json({
      performances: performances.map(p => ({
        matchId: p.match_id,
        territoryControlPeak: p.territory_control_peak,
        territoryControlFinal: p.territory_control_final,
        troopsEfficiency: p.troops_efficiency,
        strategicMoves: p.strategic_moves,
        reactionTimeAvg: p.reaction_time_avg,
        wasNearWin: p.was_near_win === 1,
        wasRageQuit: p.was_rage_quit === 1,
        gameDuration: p.game_duration,
        createdAt: p.created_at,
      })),
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to get performance history' });
  }
});

// ============ Helper Functions ============

function getNextSkillBand(currentBand: SkillBand): SkillBand | null {
  const index = SKILL_BAND_THRESHOLDS.findIndex(t => t.band === currentBand);
  if (index <= 0) return null;
  return SKILL_BAND_THRESHOLDS[index - 1].band;
}

function getRatingToNextBand(currentRating: number): number | null {
  for (const threshold of SKILL_BAND_THRESHOLDS) {
    if (currentRating < threshold.minRating) {
      return threshold.minRating - currentRating;
    }
  }
  return null;
}

function getDifficultyDescription(settings: DifficultySettings): string {
  const avgMultiplier = (
    settings.aiReactionTimeMultiplier +
    (2 - settings.aiAggressionMultiplier) +
    (2 - settings.aiEfficiencyMultiplier) +
    (2 - settings.aiCoordinationMultiplier)
  ) / 4;

  if (settings.frustrationRecoveryActive) {
    return 'Recovery Mode - AI difficulty reduced to help you get back on track';
  }

  if (avgMultiplier > 1.2) {
    return 'Easy - AI is being gentler to match your skill level';
  } else if (avgMultiplier > 0.9) {
    return 'Balanced - AI is matched to your skill level';
  } else {
    return 'Challenging - AI is providing extra challenge for experienced players';
  }
}

export { router as ddaRouter };
