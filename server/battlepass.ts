import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from './auth';
import { db } from './database';
import { awardCurrency, spendCurrency, CurrencyType } from './currency';

const router = Router();

// Types
export type BattlePassTier = 'free' | 'premium' | 'diamond';
export type RewardType = 'gems' | 'coins' | 'crystals' | 'skin' | 'title' | 'avatar_frame' | 'emote';

export interface BattlePassSeason {
  id: string;
  season_number: number;
  name: string;
  start_date: number;
  end_date: number;
  max_level: number;
  xp_per_level: number;
  premium_price: number;  // in cents
  diamond_price: number;  // in cents
  is_active: number;
  created_at: number;
}

export interface BattlePassProgress {
  id: string;
  user_id: string;
  season_id: string;
  current_level: number;
  current_xp: number;
  tier: BattlePassTier;
  claimed_free_rewards: string;
  claimed_premium_rewards: string;
  claimed_diamond_rewards: string;
  purchased_at: number | null;
  created_at: number;
}

export interface BattlePassReward {
  id: string;
  season_id: string;
  level: number;
  tier: BattlePassTier;
  reward_type: RewardType;
  reward_id: string | null;
  reward_amount: number;
}

// Prepared statements
const battlePassQueries = {
  getActiveSeason: db.prepare(`
    SELECT * FROM battle_pass_seasons WHERE is_active = 1 LIMIT 1
  `),

  getSeasonById: db.prepare(`SELECT * FROM battle_pass_seasons WHERE id = ?`),

  createSeason: db.prepare(`
    INSERT INTO battle_pass_seasons (id, season_number, name, start_date, end_date, max_level, xp_per_level, premium_price, diamond_price, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  deactivateAllSeasons: db.prepare(`UPDATE battle_pass_seasons SET is_active = 0`),

  getProgress: db.prepare(`
    SELECT * FROM battle_pass_progress WHERE user_id = ? AND season_id = ?
  `),

  createProgress: db.prepare(`
    INSERT INTO battle_pass_progress (id, user_id, season_id)
    VALUES (?, ?, ?)
  `),

  updateProgress: db.prepare(`
    UPDATE battle_pass_progress
    SET current_level = ?, current_xp = ?, tier = ?, claimed_free_rewards = ?, claimed_premium_rewards = ?, claimed_diamond_rewards = ?, purchased_at = ?
    WHERE id = ?
  `),

  getRewards: db.prepare(`
    SELECT * FROM battle_pass_rewards WHERE season_id = ? ORDER BY level, tier
  `),

  getRewardById: db.prepare(`SELECT * FROM battle_pass_rewards WHERE id = ?`),

  addReward: db.prepare(`
    INSERT INTO battle_pass_rewards (id, season_id, level, tier, reward_type, reward_id, reward_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),

  countSeasons: db.prepare(`SELECT COUNT(*) as count FROM battle_pass_seasons`),
};

// Helper functions
export function getActiveSeason(): BattlePassSeason | null {
  return battlePassQueries.getActiveSeason.get() as BattlePassSeason | null;
}

export function getOrCreateProgress(userId: string, seasonId: string): BattlePassProgress {
  let progress = battlePassQueries.getProgress.get(userId, seasonId) as BattlePassProgress | undefined;

  if (!progress) {
    const progressId = uuidv4();
    battlePassQueries.createProgress.run(progressId, userId, seasonId);
    progress = battlePassQueries.getProgress.get(userId, seasonId) as BattlePassProgress;
  }

  return progress;
}

export function addXP(userId: string, xpAmount: number): {
  success: boolean;
  newLevel: number;
  newXP: number;
  levelsGained: number;
  error?: string;
} {
  const season = getActiveSeason();
  if (!season) {
    return { success: false, newLevel: 1, newXP: 0, levelsGained: 0, error: 'No active season' };
  }

  const progress = getOrCreateProgress(userId, season.id);

  let totalXP = progress.current_xp + xpAmount;
  let currentLevel = progress.current_level;
  const startLevel = currentLevel;

  // Level up calculation
  while (totalXP >= season.xp_per_level && currentLevel < season.max_level) {
    totalXP -= season.xp_per_level;
    currentLevel++;
  }

  // Cap XP at max level
  if (currentLevel >= season.max_level) {
    totalXP = 0;
  }

  const claimedFree = JSON.parse(progress.claimed_free_rewards);
  const claimedPremium = JSON.parse(progress.claimed_premium_rewards);
  const claimedDiamond = JSON.parse(progress.claimed_diamond_rewards);

  battlePassQueries.updateProgress.run(
    currentLevel,
    totalXP,
    progress.tier,
    JSON.stringify(claimedFree),
    JSON.stringify(claimedPremium),
    JSON.stringify(claimedDiamond),
    progress.purchased_at,
    progress.id
  );

  return {
    success: true,
    newLevel: currentLevel,
    newXP: totalXP,
    levelsGained: currentLevel - startLevel
  };
}

function grantReward(userId: string, reward: BattlePassReward): { success: boolean; error?: string } {
  switch (reward.reward_type) {
    case 'gems':
    case 'coins':
    case 'crystals':
      const result = awardCurrency(
        userId,
        reward.reward_type as CurrencyType,
        reward.reward_amount,
        `Battle Pass Level ${reward.level} Reward`,
        reward.id
      );
      return { success: result.success, error: result.error };

    case 'skin':
    case 'title':
    case 'avatar_frame':
    case 'emote':
      // In a real implementation, these would be added to the user's inventory
      // For now, we just return success
      console.log(`Granting ${reward.reward_type} to user ${userId}: ${reward.reward_id}`);
      return { success: true };

    default:
      return { success: false, error: `Unknown reward type: ${reward.reward_type}` };
  }
}

function initializeDefaultSeason(): void {
  const count = battlePassQueries.countSeasons.get() as { count: number };

  if (count.count === 0) {
    const seasonId = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    const thirtyDays = 30 * 24 * 60 * 60;

    battlePassQueries.createSeason.run(
      seasonId,
      1,
      'Season 1: Origins',
      now,
      now + thirtyDays,
      50,
      1000,
      599,
      1199,
      1
    );

    // Add default rewards for each level
    for (let level = 1; level <= 50; level++) {
      // Free tier rewards (every level)
      const freeRewardId = uuidv4();
      if (level % 5 === 0) {
        // Every 5 levels: gems
        battlePassQueries.addReward.run(freeRewardId, seasonId, level, 'free', 'gems', null, 10);
      } else {
        // Other levels: coins
        battlePassQueries.addReward.run(freeRewardId, seasonId, level, 'free', 'coins', null, 100);
      }

      // Premium tier rewards (every level)
      const premiumRewardId = uuidv4();
      if (level % 10 === 0) {
        // Every 10 levels: skin
        battlePassQueries.addReward.run(premiumRewardId, seasonId, level, 'premium', 'skin', `skin_${level}`, 1);
      } else if (level % 5 === 0) {
        // Every 5 levels: gems
        battlePassQueries.addReward.run(premiumRewardId, seasonId, level, 'premium', 'gems', null, 25);
      } else {
        // Other levels: coins
        battlePassQueries.addReward.run(premiumRewardId, seasonId, level, 'premium', 'coins', null, 200);
      }

      // Diamond tier rewards (every 5 levels)
      if (level % 5 === 0) {
        const diamondRewardId = uuidv4();
        if (level === 50) {
          // Final reward: exclusive skin
          battlePassQueries.addReward.run(diamondRewardId, seasonId, level, 'diamond', 'skin', 'skin_legendary', 1);
        } else if (level % 10 === 0) {
          // Every 10 levels: crystals
          battlePassQueries.addReward.run(diamondRewardId, seasonId, level, 'diamond', 'crystals', null, 50);
        } else {
          // Other: gems
          battlePassQueries.addReward.run(diamondRewardId, seasonId, level, 'diamond', 'gems', null, 50);
        }
      }
    }

    console.log('Default battle pass season initialized');
  }
}

// Initialize default season
initializeDefaultSeason();

// API Routes

// GET /api/battlepass/current - Get current season and user progress
router.get('/current', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const season = getActiveSeason();
    if (!season) {
      res.status(404).json({ error: 'No active battle pass season' });
      return;
    }

    const progress = getOrCreateProgress(req.user.id, season.id);
    const rewards = battlePassQueries.getRewards.all(season.id) as BattlePassReward[];

    const claimedFree = JSON.parse(progress.claimed_free_rewards) as number[];
    const claimedPremium = JSON.parse(progress.claimed_premium_rewards) as number[];
    const claimedDiamond = JSON.parse(progress.claimed_diamond_rewards) as number[];

    // Calculate time remaining
    const now = Math.floor(Date.now() / 1000);
    const timeRemaining = Math.max(0, season.end_date - now);

    res.json({
      season: {
        id: season.id,
        number: season.season_number,
        name: season.name,
        startDate: season.start_date,
        endDate: season.end_date,
        maxLevel: season.max_level,
        xpPerLevel: season.xp_per_level,
        premiumPrice: season.premium_price,
        diamondPrice: season.diamond_price,
        timeRemaining,
      },
      progress: {
        currentLevel: progress.current_level,
        currentXP: progress.current_xp,
        xpToNextLevel: season.xp_per_level - progress.current_xp,
        tier: progress.tier,
        isPremium: progress.tier === 'premium' || progress.tier === 'diamond',
        isDiamond: progress.tier === 'diamond',
        purchasedAt: progress.purchased_at,
      },
      rewards: rewards.map(r => ({
        id: r.id,
        level: r.level,
        tier: r.tier,
        type: r.reward_type,
        itemId: r.reward_id,
        amount: r.reward_amount,
        claimed: r.tier === 'free' ? claimedFree.includes(r.level) :
                 r.tier === 'premium' ? claimedPremium.includes(r.level) :
                 claimedDiamond.includes(r.level),
        unlocked: r.level <= progress.current_level,
        canClaim: r.level <= progress.current_level &&
                  !(r.tier === 'free' ? claimedFree.includes(r.level) :
                    r.tier === 'premium' ? claimedPremium.includes(r.level) :
                    claimedDiamond.includes(r.level)) &&
                  (r.tier === 'free' ||
                   (r.tier === 'premium' && (progress.tier === 'premium' || progress.tier === 'diamond')) ||
                   (r.tier === 'diamond' && progress.tier === 'diamond')),
      })),
    });
  } catch (error) {
    console.error('Get battle pass error:', error);
    res.status(500).json({ error: 'Failed to get battle pass data' });
  }
});

// POST /api/battlepass/claim - Claim a reward
router.post('/claim', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { rewardId } = req.body;
    if (!rewardId) {
      res.status(400).json({ error: 'Reward ID required' });
      return;
    }

    const season = getActiveSeason();
    if (!season) {
      res.status(404).json({ error: 'No active battle pass season' });
      return;
    }

    const reward = battlePassQueries.getRewardById.get(rewardId) as BattlePassReward | undefined;
    if (!reward || reward.season_id !== season.id) {
      res.status(404).json({ error: 'Reward not found' });
      return;
    }

    const progress = getOrCreateProgress(req.user.id, season.id);

    // Check if level requirement is met
    if (reward.level > progress.current_level) {
      res.status(400).json({ error: 'Level requirement not met' });
      return;
    }

    // Check tier access
    if (reward.tier === 'premium' && progress.tier === 'free') {
      res.status(400).json({ error: 'Premium pass required' });
      return;
    }
    if (reward.tier === 'diamond' && progress.tier !== 'diamond') {
      res.status(400).json({ error: 'Diamond pass required' });
      return;
    }

    // Check if already claimed
    const claimedFree = JSON.parse(progress.claimed_free_rewards) as number[];
    const claimedPremium = JSON.parse(progress.claimed_premium_rewards) as number[];
    const claimedDiamond = JSON.parse(progress.claimed_diamond_rewards) as number[];

    const claimedArray = reward.tier === 'free' ? claimedFree :
                         reward.tier === 'premium' ? claimedPremium : claimedDiamond;

    if (claimedArray.includes(reward.level)) {
      res.status(400).json({ error: 'Reward already claimed' });
      return;
    }

    // Grant the reward
    const grantResult = grantReward(req.user.id, reward);
    if (!grantResult.success) {
      res.status(500).json({ error: grantResult.error || 'Failed to grant reward' });
      return;
    }

    // Mark as claimed
    claimedArray.push(reward.level);

    battlePassQueries.updateProgress.run(
      progress.current_level,
      progress.current_xp,
      progress.tier,
      JSON.stringify(claimedFree),
      JSON.stringify(claimedPremium),
      JSON.stringify(claimedDiamond),
      progress.purchased_at,
      progress.id
    );

    res.json({
      success: true,
      reward: {
        type: reward.reward_type,
        itemId: reward.reward_id,
        amount: reward.reward_amount,
      },
    });
  } catch (error) {
    console.error('Claim reward error:', error);
    res.status(500).json({ error: 'Failed to claim reward' });
  }
});

// POST /api/battlepass/purchase - Purchase premium/diamond pass
router.post('/purchase', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { tier } = req.body;
    if (!tier || !['premium', 'diamond'].includes(tier)) {
      res.status(400).json({ error: 'Invalid tier. Must be "premium" or "diamond"' });
      return;
    }

    const season = getActiveSeason();
    if (!season) {
      res.status(404).json({ error: 'No active battle pass season' });
      return;
    }

    const progress = getOrCreateProgress(req.user.id, season.id);

    // Check if already purchased this tier or higher
    if (progress.tier === 'diamond') {
      res.status(400).json({ error: 'Already own diamond pass' });
      return;
    }
    if (progress.tier === 'premium' && tier === 'premium') {
      res.status(400).json({ error: 'Already own premium pass' });
      return;
    }

    // Calculate price (upgrade from premium to diamond is cheaper)
    let priceCents: number;
    if (tier === 'diamond' && progress.tier === 'premium') {
      priceCents = season.diamond_price - season.premium_price; // Upgrade price
    } else {
      priceCents = tier === 'premium' ? season.premium_price : season.diamond_price;
    }

    // In a real implementation, this would process actual payment
    // For now, we'll use gems as the payment method (1 gem = 1 cent for simplicity)
    const gemsRequired = priceCents;
    const spendResult = spendCurrency(
      req.user.id,
      'gems',
      gemsRequired,
      `Battle Pass ${tier} purchase`,
      season.id
    );

    if (!spendResult.success) {
      res.status(400).json({ error: spendResult.error || 'Insufficient gems' });
      return;
    }

    // Update tier
    const claimedFree = JSON.parse(progress.claimed_free_rewards);
    const claimedPremium = JSON.parse(progress.claimed_premium_rewards);
    const claimedDiamond = JSON.parse(progress.claimed_diamond_rewards);

    battlePassQueries.updateProgress.run(
      progress.current_level,
      progress.current_xp,
      tier,
      JSON.stringify(claimedFree),
      JSON.stringify(claimedPremium),
      JSON.stringify(claimedDiamond),
      Math.floor(Date.now() / 1000),
      progress.id
    );

    res.json({
      success: true,
      tier,
      pricePaid: priceCents,
      message: `Successfully purchased ${tier} battle pass!`,
    });
  } catch (error) {
    console.error('Purchase battle pass error:', error);
    res.status(500).json({ error: 'Failed to purchase battle pass' });
  }
});

// POST /api/battlepass/add-xp - Add XP (from gameplay/challenges)
router.post('/add-xp', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { amount, source } = req.body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ error: 'Amount must be a positive number' });
      return;
    }

    // Limit XP per call to prevent exploitation
    const MAX_XP_PER_CALL = 500;
    if (amount > MAX_XP_PER_CALL) {
      res.status(400).json({ error: `Cannot add more than ${MAX_XP_PER_CALL} XP at once` });
      return;
    }

    const result = addXP(req.user.id, amount);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      xpAdded: amount,
      source: source || 'unknown',
      currentLevel: result.newLevel,
      currentXP: result.newXP,
      levelsGained: result.levelsGained,
    });
  } catch (error) {
    console.error('Add XP error:', error);
    res.status(500).json({ error: 'Failed to add XP' });
  }
});

export { router as battlePassRouter };
