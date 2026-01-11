/**
 * Economy Balancing System
 *
 * This module handles dynamic reward scaling, personalized offers,
 * spending analysis, and progression pacing optimization.
 */

import { Router, Request, Response } from 'express';
import { ddaQueries, userQueries } from './database';
import { AuthRequest, authenticateToken } from './auth';
import { getPlayerSkillProfile } from './dda';
import { getEngagementMetrics } from './edda';

const router = Router();

// ============ Types ============

export interface PlayerEconomy {
  playerId: string;
  totalRewardsEarned: number;
  currentCurrency: number;
  totalSpent: number;
  spendingTier: SpendingTier;
  lastPurchaseTimestamp: number | null;
  daysSinceLastPurchase: number;
  progressionPace: number;
  catchUpBonusActive: boolean;
  personalizedOfferDiscount: number;
}

export type SpendingTier = 'none' | 'minnow' | 'dolphin' | 'whale';

export interface RewardConfig {
  baseReward: number;
  winBonus: number;
  streakBonus: number;
  firstWinBonus: number;
  challengeMultiplier: number;
  catchUpMultiplier: number;
  eventMultiplier: number;
}

export interface PersonalizedOffer {
  id: string;
  name: string;
  description: string;
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
  items: OfferItem[];
  expiresAt: number;
  reason: string;
}

export interface OfferItem {
  type: string;
  id: string;
  name: string;
  quantity: number;
}

export interface ProgressionStatus {
  currentLevel: number;
  currentXP: number;
  xpToNextLevel: number;
  progressPercent: number;
  estimatedTimeToNextLevel: number;
  paceStatus: 'slow' | 'normal' | 'fast';
  recommendations: string[];
}

// ============ Constants ============

const BASE_REWARDS: RewardConfig = {
  baseReward: 10,
  winBonus: 15,
  streakBonus: 5,
  firstWinBonus: 25,
  challengeMultiplier: 1.5,
  catchUpMultiplier: 2.0,
  eventMultiplier: 1.0,
};

const SPENDING_TIER_THRESHOLDS = {
  minnow: 5,    // $5+
  dolphin: 50,  // $50+
  whale: 200,   // $200+
};

const XP_PER_LEVEL = 1000;
const XP_SCALING = 1.1; // Each level requires 10% more XP

// ============ Economy Functions ============

/**
 * Gets or creates player economy profile
 */
export function getPlayerEconomy(playerId: string): PlayerEconomy {
  const existing = ddaQueries.getPlayerEconomy.get(playerId) as {
    player_id: string;
    total_rewards_earned: number;
    current_currency: number;
    total_spent: number;
    spending_tier: string;
    last_purchase_timestamp: number | null;
    days_since_last_purchase: number;
    progression_pace: number;
    catch_up_bonus_active: number;
    personalized_offer_discount: number;
  } | undefined;

  if (existing) {
    // Update days since last purchase
    const now = Math.floor(Date.now() / 1000);
    const daysSinceLastPurchase = existing.last_purchase_timestamp
      ? Math.floor((now - existing.last_purchase_timestamp) / 86400)
      : 999;

    return {
      playerId: existing.player_id,
      totalRewardsEarned: existing.total_rewards_earned,
      currentCurrency: existing.current_currency,
      totalSpent: existing.total_spent,
      spendingTier: existing.spending_tier as SpendingTier,
      lastPurchaseTimestamp: existing.last_purchase_timestamp,
      daysSinceLastPurchase,
      progressionPace: existing.progression_pace,
      catchUpBonusActive: existing.catch_up_bonus_active === 1,
      personalizedOfferDiscount: existing.personalized_offer_discount,
    };
  }

  // Create default economy profile
  const defaultEconomy: PlayerEconomy = {
    playerId,
    totalRewardsEarned: 0,
    currentCurrency: 100, // Starting currency
    totalSpent: 0,
    spendingTier: 'none',
    lastPurchaseTimestamp: null,
    daysSinceLastPurchase: 999,
    progressionPace: 1.0,
    catchUpBonusActive: false,
    personalizedOfferDiscount: 0,
  };

  const now = Math.floor(Date.now() / 1000);
  ddaQueries.upsertPlayerEconomy.run(
    playerId,
    defaultEconomy.totalRewardsEarned,
    defaultEconomy.currentCurrency,
    defaultEconomy.totalSpent,
    defaultEconomy.spendingTier,
    null,
    999,
    defaultEconomy.progressionPace,
    0,
    defaultEconomy.personalizedOfferDiscount
  );

  return defaultEconomy;
}

/**
 * Calculates dynamic reward for a match
 */
export function calculateMatchReward(
  playerId: string,
  won: boolean,
  matchDuration: number,
  territoryControl: number,
  isFirstWinOfDay: boolean,
  activeStreak: number,
  isDailyChallenge: boolean
): {
  baseReward: number;
  bonuses: { type: string; amount: number }[];
  totalReward: number;
  xpEarned: number;
} {
  const economy = getPlayerEconomy(playerId);
  const skill = getPlayerSkillProfile(playerId);
  const engagement = getEngagementMetrics(playerId);

  let baseReward = BASE_REWARDS.baseReward;
  const bonuses: { type: string; amount: number }[] = [];

  // Win bonus
  if (won) {
    bonuses.push({ type: 'win', amount: BASE_REWARDS.winBonus });
  }

  // First win of day bonus
  if (won && isFirstWinOfDay) {
    bonuses.push({ type: 'first_win', amount: BASE_REWARDS.firstWinBonus });
  }

  // Streak bonus
  if (activeStreak > 1) {
    const streakAmount = Math.min(activeStreak * BASE_REWARDS.streakBonus, 50);
    bonuses.push({ type: 'streak', amount: streakAmount });
  }

  // Territory control bonus (0-10 based on performance)
  const controlBonus = Math.floor(territoryControl * 10);
  if (controlBonus > 0) {
    bonuses.push({ type: 'performance', amount: controlBonus });
  }

  // Duration bonus (longer games = more reward, capped)
  const durationBonus = Math.min(Math.floor(matchDuration / 60), 10);
  if (durationBonus > 0) {
    bonuses.push({ type: 'duration', amount: durationBonus });
  }

  // Catch-up bonus for returning players
  if (economy.catchUpBonusActive) {
    const catchUpAmount = Math.floor(baseReward * (BASE_REWARDS.catchUpMultiplier - 1));
    bonuses.push({ type: 'catch_up', amount: catchUpAmount });
  }

  // Daily challenge multiplier
  if (isDailyChallenge) {
    const challengeBonus = Math.floor(baseReward * (BASE_REWARDS.challengeMultiplier - 1));
    bonuses.push({ type: 'challenge', amount: challengeBonus });
  }

  // Skill-based scaling (lower skilled players get slightly more to help progression)
  if (skill.skillBand === 'Beginner' || skill.skillBand === 'Novice') {
    const helpBonus = Math.floor(baseReward * 0.2);
    bonuses.push({ type: 'learning', amount: helpBonus });
  }

  // Calculate total
  const totalBonuses = bonuses.reduce((sum, b) => sum + b.amount, 0);
  const totalReward = baseReward + totalBonuses;

  // Calculate XP
  const xpEarned = Math.floor(totalReward * 10); // 10 XP per currency unit

  return {
    baseReward,
    bonuses,
    totalReward,
    xpEarned,
  };
}

/**
 * Awards currency to player
 */
export function awardCurrency(
  playerId: string,
  amount: number,
  reason: string
): PlayerEconomy {
  const economy = getPlayerEconomy(playerId);

  const newTotalRewards = economy.totalRewardsEarned + amount;
  const newCurrency = economy.currentCurrency + amount;

  ddaQueries.upsertPlayerEconomy.run(
    playerId,
    newTotalRewards,
    newCurrency,
    economy.totalSpent,
    economy.spendingTier,
    economy.lastPurchaseTimestamp,
    economy.daysSinceLastPurchase,
    economy.progressionPace,
    economy.catchUpBonusActive ? 1 : 0,
    economy.personalizedOfferDiscount
  );

  return {
    ...economy,
    totalRewardsEarned: newTotalRewards,
    currentCurrency: newCurrency,
  };
}

/**
 * Processes a purchase
 */
export function processPurchase(
  playerId: string,
  amountSpent: number, // In real currency (e.g., USD cents)
  currencyReceived: number
): PlayerEconomy {
  const economy = getPlayerEconomy(playerId);
  const now = Math.floor(Date.now() / 1000);

  const newTotalSpent = economy.totalSpent + amountSpent;
  const newCurrency = economy.currentCurrency + currencyReceived;

  // Update spending tier
  let newSpendingTier: SpendingTier = 'none';
  if (newTotalSpent >= SPENDING_TIER_THRESHOLDS.whale * 100) {
    newSpendingTier = 'whale';
  } else if (newTotalSpent >= SPENDING_TIER_THRESHOLDS.dolphin * 100) {
    newSpendingTier = 'dolphin';
  } else if (newTotalSpent >= SPENDING_TIER_THRESHOLDS.minnow * 100) {
    newSpendingTier = 'minnow';
  }

  ddaQueries.upsertPlayerEconomy.run(
    playerId,
    economy.totalRewardsEarned,
    newCurrency,
    newTotalSpent,
    newSpendingTier,
    now,
    0,
    economy.progressionPace,
    0, // Disable catch-up bonus after purchase
    economy.personalizedOfferDiscount
  );

  return {
    ...economy,
    currentCurrency: newCurrency,
    totalSpent: newTotalSpent,
    spendingTier: newSpendingTier,
    lastPurchaseTimestamp: now,
    daysSinceLastPurchase: 0,
  };
}

/**
 * Generates personalized offers
 */
export function generatePersonalizedOffers(playerId: string): PersonalizedOffer[] {
  const economy = getPlayerEconomy(playerId);
  const skill = getPlayerSkillProfile(playerId);
  const engagement = getEngagementMetrics(playerId);

  const offers: PersonalizedOffer[] = [];
  const now = Math.floor(Date.now() / 1000);
  const oneDayFromNow = now + 86400;

  // Calculate base discount based on factors
  let baseDiscount = 0;

  // Returning player discount
  if (engagement.daysSinceLastPlay > 7) {
    baseDiscount += 15;
  }

  // Non-spender incentive
  if (economy.spendingTier === 'none' && engagement.totalSessions > 5) {
    baseDiscount += 20;
  }

  // Churn risk discount
  if (engagement.churnRiskScore > 60) {
    baseDiscount += 10;
  }

  // Cap discount at 40%
  baseDiscount = Math.min(baseDiscount, 40);

  // Starter Pack (for new or non-spending players)
  if (economy.spendingTier === 'none' && economy.totalSpent === 0) {
    const discount = Math.max(50, baseDiscount); // At least 50% for starters
    offers.push({
      id: 'starter_pack',
      name: 'Starter Pack',
      description: 'Perfect for new commanders!',
      originalPrice: 499, // $4.99
      discountedPrice: Math.floor(499 * (1 - discount / 100)),
      discountPercent: discount,
      items: [
        { type: 'currency', id: 'coins', name: 'Gold Coins', quantity: 500 },
        { type: 'cosmetic', id: 'starter_skin', name: 'Commander Skin', quantity: 1 },
      ],
      expiresAt: oneDayFromNow,
      reason: 'First purchase bonus',
    });
  }

  // Returning Player Pack
  if (engagement.daysSinceLastPlay > 7) {
    offers.push({
      id: 'welcome_back',
      name: 'Welcome Back Pack',
      description: 'We missed you!',
      originalPrice: 299,
      discountedPrice: Math.floor(299 * (1 - (baseDiscount + 10) / 100)),
      discountPercent: baseDiscount + 10,
      items: [
        { type: 'currency', id: 'coins', name: 'Gold Coins', quantity: 300 },
        { type: 'boost', id: 'xp_boost', name: '2x XP Boost', quantity: 3 },
      ],
      expiresAt: oneDayFromNow,
      reason: 'Welcome back special',
    });
  }

  // Value Pack (for existing spenders)
  if (economy.spendingTier !== 'none') {
    const tierMultiplier = economy.spendingTier === 'whale' ? 3 :
                          economy.spendingTier === 'dolphin' ? 2 : 1;

    offers.push({
      id: 'value_pack',
      name: 'Value Pack',
      description: 'Best value for commanders',
      originalPrice: 999 * tierMultiplier,
      discountedPrice: Math.floor(999 * tierMultiplier * (1 - baseDiscount / 100)),
      discountPercent: baseDiscount,
      items: [
        { type: 'currency', id: 'coins', name: 'Gold Coins', quantity: 1000 * tierMultiplier },
        { type: 'currency', id: 'gems', name: 'Gems', quantity: 50 * tierMultiplier },
      ],
      expiresAt: oneDayFromNow,
      reason: 'VIP special offer',
    });
  }

  // Skill-based offer
  if (skill.skillBand === 'Expert' || skill.skillBand === 'Master') {
    offers.push({
      id: 'elite_pack',
      name: 'Elite Commander Pack',
      description: 'For the most skilled players',
      originalPrice: 1999,
      discountedPrice: Math.floor(1999 * (1 - baseDiscount / 100)),
      discountPercent: baseDiscount,
      items: [
        { type: 'cosmetic', id: 'elite_skin', name: 'Elite Commander Skin', quantity: 1 },
        { type: 'cosmetic', id: 'elite_trail', name: 'Elite Troop Trail', quantity: 1 },
        { type: 'currency', id: 'coins', name: 'Gold Coins', quantity: 2000 },
      ],
      expiresAt: oneDayFromNow,
      reason: 'Exclusive for elite players',
    });
  }

  return offers;
}

/**
 * Checks and activates catch-up mechanics for returning players
 */
export function checkCatchUpBonus(playerId: string): {
  activated: boolean;
  bonusDescription: string | null;
  duration: number | null;
} {
  const economy = getPlayerEconomy(playerId);
  const engagement = getEngagementMetrics(playerId);

  // Activate catch-up for players who haven't played in 7+ days
  if (engagement.daysSinceLastPlay >= 7 && !economy.catchUpBonusActive) {
    ddaQueries.upsertPlayerEconomy.run(
      playerId,
      economy.totalRewardsEarned,
      economy.currentCurrency,
      economy.totalSpent,
      economy.spendingTier,
      economy.lastPurchaseTimestamp,
      engagement.daysSinceLastPlay,
      economy.progressionPace,
      1, // Activate catch-up
      economy.personalizedOfferDiscount
    );

    return {
      activated: true,
      bonusDescription: '2x rewards for your next 5 matches!',
      duration: 5, // 5 matches
    };
  }

  return {
    activated: false,
    bonusDescription: null,
    duration: null,
  };
}

/**
 * Gets progression status
 */
export function getProgressionStatus(playerId: string): ProgressionStatus {
  const economy = getPlayerEconomy(playerId);
  const skill = getPlayerSkillProfile(playerId);

  // Calculate level from total XP (rewards earned * 10)
  const totalXP = economy.totalRewardsEarned * 10;
  let level = 1;
  let xpForCurrentLevel = 0;
  let xpNeeded = XP_PER_LEVEL;

  while (xpForCurrentLevel + xpNeeded <= totalXP) {
    xpForCurrentLevel += xpNeeded;
    level++;
    xpNeeded = Math.floor(XP_PER_LEVEL * Math.pow(XP_SCALING, level - 1));
  }

  const currentLevelXP = totalXP - xpForCurrentLevel;
  const progressPercent = Math.floor((currentLevelXP / xpNeeded) * 100);

  // Estimate time to next level based on progression pace
  const avgXPPerGame = 150; // Estimated average
  const gamesToNextLevel = Math.ceil((xpNeeded - currentLevelXP) / avgXPPerGame);
  const avgGameDuration = skill.avgGameDuration || 300;
  const estimatedTimeToNextLevel = gamesToNextLevel * avgGameDuration;

  // Determine pace status
  let paceStatus: 'slow' | 'normal' | 'fast' = 'normal';
  if (economy.progressionPace < 0.8) paceStatus = 'slow';
  else if (economy.progressionPace > 1.2) paceStatus = 'fast';

  // Generate recommendations
  const recommendations: string[] = [];
  if (paceStatus === 'slow') {
    recommendations.push('Complete daily challenges for bonus XP');
    recommendations.push('Try to maintain win streaks');
  }
  if (progressPercent > 80) {
    recommendations.push('Almost there! One more win to level up!');
  }

  return {
    currentLevel: level,
    currentXP: currentLevelXP,
    xpToNextLevel: xpNeeded,
    progressPercent,
    estimatedTimeToNextLevel,
    paceStatus,
    recommendations,
  };
}

// ============ API Routes ============

// Get reward calculation for a match
router.get('/rewards/:playerId', (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;
    const economy = getPlayerEconomy(playerId);
    const progression = getProgressionStatus(playerId);

    res.json({
      currency: {
        current: economy.currentCurrency,
        totalEarned: economy.totalRewardsEarned,
      },
      progression,
      spendingTier: economy.spendingTier,
      catchUpActive: economy.catchUpBonusActive,
    });
  } catch (error) {
    console.error('Get rewards error:', error);
    res.status(500).json({ error: 'Failed to get rewards data' });
  }
});

// Calculate and award match rewards
router.post('/rewards/match', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const {
      won,
      matchDuration,
      territoryControl,
      isFirstWinOfDay,
      activeStreak,
      isDailyChallenge,
    } = req.body;

    const reward = calculateMatchReward(
      req.user.id,
      won || false,
      matchDuration || 0,
      territoryControl || 0,
      isFirstWinOfDay || false,
      activeStreak || 0,
      isDailyChallenge || false
    );

    // Award the currency
    const updatedEconomy = awardCurrency(req.user.id, reward.totalReward, 'match_reward');

    res.json({
      reward,
      newBalance: updatedEconomy.currentCurrency,
    });
  } catch (error) {
    console.error('Award match reward error:', error);
    res.status(500).json({ error: 'Failed to award match reward' });
  }
});

// Get personalized offers
router.get('/offers/:playerId', (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;
    const offers = generatePersonalizedOffers(playerId);

    res.json({ offers });
  } catch (error) {
    console.error('Get offers error:', error);
    res.status(500).json({ error: 'Failed to get offers' });
  }
});

// Check catch-up bonus
router.get('/catch-up/:playerId', (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;
    const catchUp = checkCatchUpBonus(playerId);

    res.json(catchUp);
  } catch (error) {
    console.error('Check catch-up error:', error);
    res.status(500).json({ error: 'Failed to check catch-up bonus' });
  }
});

// Get progression status
router.get('/progression/:playerId', (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;
    const progression = getProgressionStatus(playerId);

    res.json({ progression });
  } catch (error) {
    console.error('Get progression error:', error);
    res.status(500).json({ error: 'Failed to get progression status' });
  }
});

// Process purchase (would normally have payment verification)
router.post('/purchase', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { amountSpent, currencyReceived, offerId } = req.body;

    if (!amountSpent || !currencyReceived) {
      res.status(400).json({ error: 'Invalid purchase data' });
      return;
    }

    // In production, verify payment with payment provider here

    const updatedEconomy = processPurchase(
      req.user.id,
      amountSpent,
      currencyReceived
    );

    res.json({
      message: 'Purchase successful',
      newBalance: updatedEconomy.currentCurrency,
      spendingTier: updatedEconomy.spendingTier,
    });
  } catch (error) {
    console.error('Process purchase error:', error);
    res.status(500).json({ error: 'Failed to process purchase' });
  }
});

export { router as economyRouter };
