/**
 * Personalized Content Delivery System
 *
 * This module provides personalized recommendations, challenges, and content
 * based on player history, skill level, and preferences.
 */

import { Router, Request, Response } from 'express';
import { ddaQueries, userQueries, matchQueries } from './database';
import { AuthRequest, authenticateToken } from './auth';
import { getPlayerSkillProfile, SkillBand } from './dda';
import { getEngagementMetrics } from './edda';

const router = Router();

// ============ Types ============

export interface PersonalizationProfile {
  playerId: string;
  preferredGameMode: string;
  preferredDifficulty: string;
  tutorialProgress: number;
  tutorialPace: number;
  recommendedLevel: number;
  unlockedContent: string[];
  contentUnlockRate: number;
  dailyChallengeDifficulty: string;
}

export interface GameModeRecommendation {
  mode: string;
  reason: string;
  priority: number;
  estimatedWinRate: number;
}

export interface LevelRecommendation {
  levelId: number;
  name: string;
  difficulty: string;
  reason: string;
  estimatedDuration: number;
  matchesPlayerSkill: boolean;
}

export interface DailyChallenge {
  id: string;
  name: string;
  description: string;
  difficulty: string;
  objectives: ChallengeObjective[];
  rewards: ChallengeReward[];
  expiresAt: number;
  personalizedFor: string;
}

export interface ChallengeObjective {
  type: string;
  target: number;
  description: string;
}

export interface ChallengeReward {
  type: string;
  amount: number;
}

export interface ContentRecommendation {
  type: 'level' | 'mode' | 'challenge' | 'tutorial';
  id: string;
  name: string;
  reason: string;
  priority: number;
}

// ============ Level Data ============

const LEVELS = [
  { id: 1, name: 'First Steps', difficulty: 'easy', duration: 120 },
  { id: 2, name: 'Triangle', difficulty: 'easy', duration: 150 },
  { id: 3, name: 'Crossroads', difficulty: 'easy', duration: 180 },
  { id: 4, name: 'Diamond Rush', difficulty: 'easy', duration: 200 },
  { id: 5, name: 'Graduation', difficulty: 'easy', duration: 240 },
  { id: 6, name: 'Fortress', difficulty: 'medium', duration: 300 },
  { id: 7, name: 'Scattered', difficulty: 'medium', duration: 300 },
  { id: 8, name: 'The Crown', difficulty: 'medium', duration: 360 },
  { id: 9, name: 'Pincer', difficulty: 'medium', duration: 360 },
  { id: 10, name: 'Maze Runner', difficulty: 'medium', duration: 400 },
  { id: 11, name: 'Island Hopping', difficulty: 'medium', duration: 420 },
  { id: 12, name: 'Spiral', difficulty: 'hard', duration: 480 },
  { id: 13, name: 'Battlefront', difficulty: 'hard', duration: 480 },
  { id: 14, name: 'Encirclement', difficulty: 'hard', duration: 540 },
  { id: 15, name: 'World Conquest', difficulty: 'hard', duration: 600 },
  // ... more levels
];

const GAME_MODES = [
  { id: '1v1', name: '1 vs 1', skillRequired: 'Beginner' },
  { id: '2v2', name: '2 vs 2', skillRequired: 'Novice' },
  { id: '5v5', name: '5 vs 5', skillRequired: 'Intermediate' },
  { id: 'ffa4', name: 'Free For All 4', skillRequired: 'Advanced' },
  { id: 'ffa8', name: 'Battle Royale 8', skillRequired: 'Expert' },
];

// ============ Personalization Functions ============

/**
 * Gets or creates personalization profile
 */
export function getPersonalizationProfile(playerId: string): PersonalizationProfile {
  const existing = ddaQueries.getPlayerPersonalization.get(playerId) as {
    player_id: string;
    preferred_game_mode: string;
    preferred_difficulty: string;
    tutorial_progress: number;
    tutorial_pace: number;
    recommended_level: number;
    unlocked_content: string;
    content_unlock_rate: number;
    daily_challenge_difficulty: string;
  } | undefined;

  if (existing) {
    return {
      playerId: existing.player_id,
      preferredGameMode: existing.preferred_game_mode,
      preferredDifficulty: existing.preferred_difficulty,
      tutorialProgress: existing.tutorial_progress,
      tutorialPace: existing.tutorial_pace,
      recommendedLevel: existing.recommended_level,
      unlockedContent: JSON.parse(existing.unlocked_content || '[]'),
      contentUnlockRate: existing.content_unlock_rate,
      dailyChallengeDifficulty: existing.daily_challenge_difficulty,
    };
  }

  // Create default profile
  const defaultProfile: PersonalizationProfile = {
    playerId,
    preferredGameMode: '1v1',
    preferredDifficulty: 'medium',
    tutorialProgress: 0,
    tutorialPace: 1.0,
    recommendedLevel: 1,
    unlockedContent: [],
    contentUnlockRate: 1.0,
    dailyChallengeDifficulty: 'medium',
  };

  ddaQueries.upsertPlayerPersonalization.run(
    playerId,
    defaultProfile.preferredGameMode,
    defaultProfile.preferredDifficulty,
    defaultProfile.tutorialProgress,
    defaultProfile.tutorialPace,
    defaultProfile.recommendedLevel,
    JSON.stringify(defaultProfile.unlockedContent),
    defaultProfile.contentUnlockRate,
    defaultProfile.dailyChallengeDifficulty
  );

  return defaultProfile;
}

/**
 * Updates personalization profile
 */
export function updatePersonalizationProfile(
  playerId: string,
  updates: Partial<PersonalizationProfile>
): PersonalizationProfile {
  const current = getPersonalizationProfile(playerId);

  const updated: PersonalizationProfile = {
    ...current,
    ...updates,
  };

  ddaQueries.upsertPlayerPersonalization.run(
    playerId,
    updated.preferredGameMode,
    updated.preferredDifficulty,
    updated.tutorialProgress,
    updated.tutorialPace,
    updated.recommendedLevel,
    JSON.stringify(updated.unlockedContent),
    updated.contentUnlockRate,
    updated.dailyChallengeDifficulty
  );

  return updated;
}

/**
 * Recommends game modes based on player history
 */
export function getGameModeRecommendations(playerId: string): GameModeRecommendation[] {
  const skill = getPlayerSkillProfile(playerId);
  const profile = getPersonalizationProfile(playerId);
  const engagement = getEngagementMetrics(playerId);

  const recommendations: GameModeRecommendation[] = [];

  // Rank skill bands for comparison
  const skillRanks: Record<SkillBand, number> = {
    'Beginner': 0,
    'Novice': 1,
    'Intermediate': 2,
    'Advanced': 3,
    'Expert': 4,
    'Master': 5,
  };

  const playerSkillRank = skillRanks[skill.skillBand];

  for (const mode of GAME_MODES) {
    const modeSkillRank = skillRanks[mode.skillRequired as SkillBand];
    let priority = 50;
    let reason = '';
    let estimatedWinRate = 0.5;

    // Check if mode matches player skill
    if (playerSkillRank >= modeSkillRank) {
      priority += 20;
      reason = 'Matches your skill level';
      estimatedWinRate = 0.5 + (playerSkillRank - modeSkillRank) * 0.05;
    } else {
      priority -= 20;
      reason = 'Challenging mode - may be difficult';
      estimatedWinRate = 0.3;
    }

    // Boost preferred mode
    if (mode.id === profile.preferredGameMode) {
      priority += 15;
      reason = 'Your favorite mode';
    }

    // Variety bonus for modes not played recently
    priority += Math.random() * 10; // Add some variety

    // Engagement-based adjustments
    if (engagement.engagementScore < 40 && mode.id === '1v1') {
      priority += 10;
      reason = 'Quick 1v1 to get back in action';
    }

    recommendations.push({
      mode: mode.id,
      reason,
      priority,
      estimatedWinRate: Math.min(0.8, Math.max(0.2, estimatedWinRate)),
    });
  }

  return recommendations.sort((a, b) => b.priority - a.priority);
}

/**
 * Recommends levels based on player progress and skill
 */
export function getLevelRecommendations(playerId: string): LevelRecommendation[] {
  const skill = getPlayerSkillProfile(playerId);
  const profile = getPersonalizationProfile(playerId);

  const recommendations: LevelRecommendation[] = [];

  // Get player's match history to determine played levels
  const matches = matchQueries.getPlayerMatches.all(playerId, 50) as Array<{
    map_id: number;
    winner_team: number;
    team: number;
  }>;

  const playedLevels = new Set(matches.map(m => m.map_id));
  const wonLevels = new Set(matches.filter(m => m.winner_team === m.team).map(m => m.map_id));

  // Determine appropriate difficulty
  const difficultyForSkill: Record<SkillBand, string[]> = {
    'Beginner': ['easy'],
    'Novice': ['easy', 'medium'],
    'Intermediate': ['medium'],
    'Advanced': ['medium', 'hard'],
    'Expert': ['hard', 'extreme'],
    'Master': ['extreme'],
  };

  const appropriateDifficulties = difficultyForSkill[skill.skillBand];

  for (const level of LEVELS) {
    let matchesSkill = appropriateDifficulties.includes(level.difficulty);
    let reason = '';

    // Priority for recommended level
    if (level.id === profile.recommendedLevel) {
      reason = 'Recommended next level';
    }
    // Unplayed levels in appropriate difficulty
    else if (!playedLevels.has(level.id) && matchesSkill) {
      reason = 'New level to try';
    }
    // Levels failed before (retry)
    else if (playedLevels.has(level.id) && !wonLevels.has(level.id) && matchesSkill) {
      reason = 'Retry - you can beat this!';
    }
    // Already won, skip unless much harder
    else if (wonLevels.has(level.id)) {
      reason = 'Already completed';
      matchesSkill = false;
    }
    else {
      reason = matchesSkill ? 'Available' : 'May be challenging';
    }

    recommendations.push({
      levelId: level.id,
      name: level.name,
      difficulty: level.difficulty,
      reason,
      estimatedDuration: level.duration,
      matchesPlayerSkill: matchesSkill,
    });
  }

  // Sort: unplayed matching levels first, then retries, then others
  return recommendations.sort((a, b) => {
    if (a.matchesPlayerSkill !== b.matchesPlayerSkill) {
      return a.matchesPlayerSkill ? -1 : 1;
    }
    if (a.reason.includes('Recommended')) return -1;
    if (b.reason.includes('Recommended')) return 1;
    if (a.reason.includes('New') !== b.reason.includes('New')) {
      return a.reason.includes('New') ? -1 : 1;
    }
    return a.levelId - b.levelId;
  });
}

/**
 * Generates personalized daily challenges
 */
export function generateDailyChallenge(playerId: string): DailyChallenge {
  const skill = getPlayerSkillProfile(playerId);
  const profile = getPersonalizationProfile(playerId);
  const engagement = getEngagementMetrics(playerId);

  // Determine challenge difficulty based on skill and engagement
  let difficulty = profile.dailyChallengeDifficulty;
  if (engagement.engagementScore < 30) {
    difficulty = 'easy'; // Make it achievable for disengaged players
  } else if (skill.winRate > 0.7 && engagement.engagementScore > 70) {
    difficulty = 'hard'; // Challenge engaged winning players
  }

  // Generate objectives based on difficulty
  const objectives: ChallengeObjective[] = [];
  const rewards: ChallengeReward[] = [];

  switch (difficulty) {
    case 'easy':
      objectives.push(
        { type: 'win_matches', target: 1, description: 'Win 1 match' },
        { type: 'play_matches', target: 3, description: 'Play 3 matches' }
      );
      rewards.push(
        { type: 'currency', amount: 50 },
        { type: 'xp', amount: 100 }
      );
      break;

    case 'medium':
      objectives.push(
        { type: 'win_matches', target: 3, description: 'Win 3 matches' },
        { type: 'capture_territories', target: 20, description: 'Capture 20 territories' }
      );
      rewards.push(
        { type: 'currency', amount: 100 },
        { type: 'xp', amount: 200 }
      );
      break;

    case 'hard':
      objectives.push(
        { type: 'win_matches', target: 5, description: 'Win 5 matches' },
        { type: 'perfect_victory', target: 1, description: 'Win with 100% territory control' },
        { type: 'fast_victory', target: 1, description: 'Win in under 3 minutes' }
      );
      rewards.push(
        { type: 'currency', amount: 200 },
        { type: 'xp', amount: 400 },
        { type: 'cosmetic', amount: 1 }
      );
      break;

    default:
      objectives.push(
        { type: 'play_matches', target: 2, description: 'Play 2 matches' }
      );
      rewards.push(
        { type: 'currency', amount: 30 }
      );
  }

  // Challenge expires at midnight UTC
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  return {
    id: `daily_${playerId}_${now.toISOString().split('T')[0]}`,
    name: getDailyChallengeName(difficulty),
    description: `Complete today's ${difficulty} challenges`,
    difficulty,
    objectives,
    rewards,
    expiresAt: Math.floor(tomorrow.getTime() / 1000),
    personalizedFor: playerId,
  };
}

/**
 * Calculates adaptive tutorial pacing
 */
export function getAdaptiveTutorialStep(playerId: string): {
  currentStep: number;
  pace: string;
  nextLesson: string;
  skipRecommended: boolean;
} {
  const profile = getPersonalizationProfile(playerId);
  const skill = getPlayerSkillProfile(playerId);

  // Tutorial steps
  const tutorialSteps = [
    'basic_controls',
    'sending_troops',
    'capturing_territories',
    'troop_generation',
    'multi_territory_attacks',
    'defensive_strategy',
    'ai_opponent_basics',
    'advanced_timing',
    'resource_management',
    'multiplayer_intro',
  ];

  // Determine if tutorial should be skipped based on skill
  const skipRecommended = skill.gamesAnalyzed > 5 && skill.winRate > 0.5;

  // Calculate pace
  let pace = 'normal';
  if (profile.tutorialPace > 1.2) pace = 'fast';
  else if (profile.tutorialPace < 0.8) pace = 'slow';

  const currentStep = Math.min(profile.tutorialProgress, tutorialSteps.length - 1);
  const nextLesson = tutorialSteps[currentStep] || 'complete';

  return {
    currentStep,
    pace,
    nextLesson,
    skipRecommended,
  };
}

/**
 * Optimizes content unlock sequencing
 */
export function getContentUnlockRecommendations(playerId: string): ContentRecommendation[] {
  const profile = getPersonalizationProfile(playerId);
  const skill = getPlayerSkillProfile(playerId);
  const engagement = getEngagementMetrics(playerId);

  const recommendations: ContentRecommendation[] = [];

  // Recommend tutorial completion for new players
  if (profile.tutorialProgress < 5) {
    recommendations.push({
      type: 'tutorial',
      id: 'tutorial_basics',
      name: 'Complete Basic Tutorial',
      reason: 'Learn the fundamentals',
      priority: 100,
    });
  }

  // Recommend next level
  const levelRecs = getLevelRecommendations(playerId);
  if (levelRecs.length > 0) {
    const topLevel = levelRecs[0];
    recommendations.push({
      type: 'level',
      id: `level_${topLevel.levelId}`,
      name: topLevel.name,
      reason: topLevel.reason,
      priority: 90,
    });
  }

  // Recommend game mode
  const modeRecs = getGameModeRecommendations(playerId);
  if (modeRecs.length > 0) {
    recommendations.push({
      type: 'mode',
      id: modeRecs[0].mode,
      name: `Play ${modeRecs[0].mode}`,
      reason: modeRecs[0].reason,
      priority: 80,
    });
  }

  // Daily challenge for engaged players
  if (engagement.engagementScore > 30) {
    recommendations.push({
      type: 'challenge',
      id: 'daily',
      name: 'Daily Challenge',
      reason: 'Earn bonus rewards',
      priority: 85,
    });
  }

  return recommendations.sort((a, b) => b.priority - a.priority);
}

// ============ API Routes ============

// Get personalized recommendations
router.get('/:playerId/recommendations', (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;

    // Verify player exists
    const user = userQueries.findById.get(playerId);
    if (!user) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const gameModes = getGameModeRecommendations(playerId);
    const levels = getLevelRecommendations(playerId).slice(0, 5);
    const dailyChallenge = generateDailyChallenge(playerId);
    const tutorial = getAdaptiveTutorialStep(playerId);
    const contentUnlock = getContentUnlockRecommendations(playerId);

    res.json({
      gameModes: gameModes.slice(0, 3),
      levels,
      dailyChallenge,
      tutorial,
      contentUnlock: contentUnlock.slice(0, 4),
    });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

// Get daily challenge
router.get('/:playerId/daily-challenge', (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;
    const challenge = generateDailyChallenge(playerId);

    res.json({ challenge });
  } catch (error) {
    console.error('Get daily challenge error:', error);
    res.status(500).json({ error: 'Failed to get daily challenge' });
  }
});

// Get level recommendations
router.get('/:playerId/levels', (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const levels = getLevelRecommendations(playerId).slice(0, limit);

    res.json({ levels });
  } catch (error) {
    console.error('Get levels error:', error);
    res.status(500).json({ error: 'Failed to get level recommendations' });
  }
});

// Update tutorial progress
router.post('/:playerId/tutorial/complete-step', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { playerId } = req.params;
    if (req.user.id !== playerId) {
      res.status(403).json({ error: 'Cannot update other player\'s progress' });
      return;
    }

    const { stepCompleted, timeSpent } = req.body;
    const profile = getPersonalizationProfile(playerId);

    // Update pace based on time spent
    const expectedTime = 60; // 60 seconds expected per step
    const paceMultiplier = expectedTime / (timeSpent || expectedTime);
    const newPace = (profile.tutorialPace + paceMultiplier) / 2;

    updatePersonalizationProfile(playerId, {
      tutorialProgress: stepCompleted + 1,
      tutorialPace: newPace,
    });

    res.json({
      message: 'Tutorial progress updated',
      nextStep: getAdaptiveTutorialStep(playerId),
    });
  } catch (error) {
    console.error('Update tutorial error:', error);
    res.status(500).json({ error: 'Failed to update tutorial progress' });
  }
});

// Update preferences
router.post('/:playerId/preferences', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { playerId } = req.params;
    if (req.user.id !== playerId) {
      res.status(403).json({ error: 'Cannot update other player\'s preferences' });
      return;
    }

    const { preferredGameMode, preferredDifficulty } = req.body;

    const updated = updatePersonalizationProfile(playerId, {
      preferredGameMode,
      preferredDifficulty,
    });

    res.json({
      message: 'Preferences updated',
      profile: updated,
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// ============ Helper Functions ============

function getDailyChallengeName(difficulty: string): string {
  const names: Record<string, string[]> = {
    easy: ['Warm Up', 'Quick Play', 'Easy Wins'],
    medium: ['Standard Challenge', 'Daily Conquest', 'Regular Mission'],
    hard: ['Expert Challenge', 'Master Quest', 'Elite Mission'],
  };

  const options = names[difficulty] || names.easy;
  return options[Math.floor(Math.random() * options.length)];
}

export { router as personalizationRouter };
