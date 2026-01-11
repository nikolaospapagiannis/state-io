import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from './auth';
import { db } from './database';
import { awardCurrency, getPlayerCurrencies } from './currency';

const router = Router();

// ============ TYPES ============

export type AdType = 'rewarded_video' | 'interstitial' | 'banner';
export type RewardType =
  | 'double_rewards'
  | 'free_chest'
  | 'extra_quest'
  | 'speed_up'
  | 'energy_refill'
  | 'coins'
  | 'gems';

export interface AdReward {
  type: RewardType;
  amount?: number;
  duration?: number; // in seconds
  description: string;
}

export interface AdWatchRecord {
  id: string;
  userId: string;
  adType: AdType;
  rewardType: RewardType;
  rewardAmount: number | null;
  completed: boolean;
  watchedAt: number;
}

export interface AdFrequencyCap {
  adType: AdType;
  maxPerHour: number;
  maxPerDay: number;
  cooldownSeconds: number;
}

// ============ CONSTANTS ============

// Ad frequency caps
const AD_FREQUENCY_CAPS: Record<AdType, AdFrequencyCap> = {
  rewarded_video: {
    adType: 'rewarded_video',
    maxPerHour: 10,
    maxPerDay: 30,
    cooldownSeconds: 30,
  },
  interstitial: {
    adType: 'interstitial',
    maxPerHour: 6,
    maxPerDay: 20,
    cooldownSeconds: 60,
  },
  banner: {
    adType: 'banner',
    maxPerHour: 999,
    maxPerDay: 999,
    cooldownSeconds: 0,
  },
};

// Reward configurations
const AD_REWARDS: Record<RewardType, AdReward> = {
  double_rewards: {
    type: 'double_rewards',
    duration: 1800, // 30 minutes
    description: '2x rewards for your next match',
  },
  free_chest: {
    type: 'free_chest',
    description: 'Open a free Common chest',
  },
  extra_quest: {
    type: 'extra_quest',
    description: 'Get one extra daily quest',
  },
  speed_up: {
    type: 'speed_up',
    duration: 600, // 10 minutes
    description: 'Speed up current timer by 10 minutes',
  },
  energy_refill: {
    type: 'energy_refill',
    amount: 5,
    description: 'Refill 5 energy points',
  },
  coins: {
    type: 'coins',
    amount: 100,
    description: 'Earn 100 coins',
  },
  gems: {
    type: 'gems',
    amount: 5,
    description: 'Earn 5 gems',
  },
};

// ============ DATABASE INITIALIZATION ============

export function initAdTables(): void {
  // Ad watch history
  db.exec(`
    CREATE TABLE IF NOT EXISTS ad_watch_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      ad_type TEXT NOT NULL,
      reward_type TEXT NOT NULL,
      reward_amount INTEGER,
      completed INTEGER DEFAULT 0,
      watched_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Active ad boosts (double rewards, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ad_boosts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      boost_type TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Ad-free status tracking (for subscribers)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ad_free_status (
      user_id TEXT PRIMARY KEY,
      is_ad_free INTEGER DEFAULT 0,
      reason TEXT,
      expires_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ad_watch_user ON ad_watch_history(user_id, watched_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ad_boosts_user ON ad_boosts(user_id, expires_at)`);

  console.log('Ad tables initialized');
}

// ============ PREPARED STATEMENTS ============

const adQueries = {
  // Watch history
  recordWatch: db.prepare(`
    INSERT INTO ad_watch_history (id, user_id, ad_type, reward_type, reward_amount, completed)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  getWatchHistory: db.prepare(`
    SELECT * FROM ad_watch_history
    WHERE user_id = ?
    ORDER BY watched_at DESC
    LIMIT ?
  `),
  getRecentWatches: db.prepare(`
    SELECT * FROM ad_watch_history
    WHERE user_id = ? AND ad_type = ? AND watched_at > ?
  `),
  getTodayWatches: db.prepare(`
    SELECT COUNT(*) as count FROM ad_watch_history
    WHERE user_id = ? AND ad_type = ? AND watched_at > ?
  `),
  getLastWatch: db.prepare(`
    SELECT * FROM ad_watch_history
    WHERE user_id = ? AND ad_type = ?
    ORDER BY watched_at DESC
    LIMIT 1
  `),

  // Boosts
  addBoost: db.prepare(`
    INSERT INTO ad_boosts (id, user_id, boost_type, expires_at) VALUES (?, ?, ?, ?)
  `),
  getActiveBoosts: db.prepare(`
    SELECT * FROM ad_boosts WHERE user_id = ? AND expires_at > ?
  `),
  removeExpiredBoosts: db.prepare(`
    DELETE FROM ad_boosts WHERE expires_at <= ?
  `),

  // Ad-free status
  getAdFreeStatus: db.prepare(`SELECT * FROM ad_free_status WHERE user_id = ?`),
  setAdFreeStatus: db.prepare(`
    INSERT INTO ad_free_status (user_id, is_ad_free, reason, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      is_ad_free = excluded.is_ad_free,
      reason = excluded.reason,
      expires_at = excluded.expires_at
  `),
};

// ============ HELPER FUNCTIONS ============

function getStartOfDay(): number {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return Math.floor(now.getTime() / 1000);
}

function getStartOfHour(): number {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  return Math.floor(now.getTime() / 1000);
}

function isAdFree(userId: string): boolean {
  const status = adQueries.getAdFreeStatus.get(userId) as {
    is_ad_free: number;
    expires_at: number | null;
  } | undefined;

  if (!status) return false;
  if (!status.is_ad_free) return false;
  if (status.expires_at && status.expires_at < Math.floor(Date.now() / 1000)) {
    return false;
  }

  return true;
}

function canWatchAd(userId: string, adType: AdType): {
  canWatch: boolean;
  reason?: string;
  cooldownRemaining?: number;
  watchesToday?: number;
  watchesThisHour?: number;
} {
  // Check if user is ad-free
  if (isAdFree(userId)) {
    return {
      canWatch: false,
      reason: 'You have ad-free status',
    };
  }

  const caps = AD_FREQUENCY_CAPS[adType];
  const now = Math.floor(Date.now() / 1000);
  const startOfDay = getStartOfDay();
  const startOfHour = getStartOfHour();

  // Check cooldown
  const lastWatch = adQueries.getLastWatch.get(userId, adType) as { watched_at: number } | undefined;
  if (lastWatch) {
    const timeSinceLastWatch = now - lastWatch.watched_at;
    if (timeSinceLastWatch < caps.cooldownSeconds) {
      return {
        canWatch: false,
        reason: 'Please wait before watching another ad',
        cooldownRemaining: caps.cooldownSeconds - timeSinceLastWatch,
      };
    }
  }

  // Check hourly cap
  const hourlyWatches = adQueries.getRecentWatches.all(userId, adType, startOfHour) as unknown[];
  if (hourlyWatches.length >= caps.maxPerHour) {
    return {
      canWatch: false,
      reason: `Maximum ${caps.maxPerHour} ${adType} ads per hour`,
      watchesThisHour: hourlyWatches.length,
    };
  }

  // Check daily cap
  const dailyWatches = adQueries.getTodayWatches.get(userId, adType, startOfDay) as { count: number };
  if (dailyWatches.count >= caps.maxPerDay) {
    return {
      canWatch: false,
      reason: `Maximum ${caps.maxPerDay} ${adType} ads per day`,
      watchesToday: dailyWatches.count,
    };
  }

  return {
    canWatch: true,
    watchesToday: dailyWatches.count,
    watchesThisHour: hourlyWatches.length,
  };
}

function grantReward(userId: string, rewardType: RewardType): {
  granted: boolean;
  details: {
    type: RewardType;
    amount?: number;
    duration?: number;
    expiresAt?: number;
  };
} {
  const reward = AD_REWARDS[rewardType];
  const now = Math.floor(Date.now() / 1000);

  switch (rewardType) {
    case 'coins': {
      const amount = reward.amount || 100;
      awardCurrency(userId, 'coins', amount, 'Ad reward', 'ad_coins');
      return {
        granted: true,
        details: { type: rewardType, amount },
      };
    }

    case 'gems': {
      const amount = reward.amount || 5;
      awardCurrency(userId, 'gems', amount, 'Ad reward', 'ad_gems');
      return {
        granted: true,
        details: { type: rewardType, amount },
      };
    }

    case 'double_rewards': {
      const duration = reward.duration || 1800;
      const expiresAt = now + duration;
      const boostId = uuidv4();
      adQueries.addBoost.run(boostId, userId, 'double_rewards', expiresAt);
      return {
        granted: true,
        details: { type: rewardType, duration, expiresAt },
      };
    }

    case 'speed_up': {
      const duration = reward.duration || 600;
      // In a real implementation, this would reduce active timers
      return {
        granted: true,
        details: { type: rewardType, duration },
      };
    }

    case 'free_chest': {
      // Trigger a free gacha pull (handled by gacha system)
      return {
        granted: true,
        details: { type: rewardType },
      };
    }

    case 'extra_quest': {
      // In a real implementation, this would add an extra quest slot
      return {
        granted: true,
        details: { type: rewardType },
      };
    }

    case 'energy_refill': {
      const amount = reward.amount || 5;
      // In a real implementation, this would refill energy
      return {
        granted: true,
        details: { type: rewardType, amount },
      };
    }

    default:
      return {
        granted: false,
        details: { type: rewardType },
      };
  }
}

// ============ API ROUTES ============

// GET /api/ads/status - Get ad availability and status
router.get('/status', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const adFree = isAdFree(req.user.id);
    const now = Math.floor(Date.now() / 1000);

    // Get caps and current usage
    const status = Object.entries(AD_FREQUENCY_CAPS).map(([adType, caps]) => {
      const check = canWatchAd(req.user!.id, adType as AdType);
      return {
        adType,
        canWatch: check.canWatch,
        reason: check.reason,
        cooldownRemaining: check.cooldownRemaining,
        watchesToday: check.watchesToday || 0,
        watchesThisHour: check.watchesThisHour || 0,
        maxPerDay: caps.maxPerDay,
        maxPerHour: caps.maxPerHour,
        cooldownSeconds: caps.cooldownSeconds,
      };
    });

    // Get active boosts
    const boosts = adQueries.getActiveBoosts.all(req.user.id, now) as Array<{
      boost_type: string;
      expires_at: number;
    }>;

    res.json({
      isAdFree: adFree,
      adStatus: status,
      activeBoosts: boosts.map(b => ({
        type: b.boost_type,
        expiresAt: b.expires_at,
        timeRemaining: b.expires_at - now,
      })),
    });
  } catch (error) {
    console.error('Get ad status error:', error);
    res.status(500).json({ error: 'Failed to get ad status' });
  }
});

// GET /api/ads/rewards - Get available ad rewards
router.get('/rewards', (_req: AuthRequest, res: Response) => {
  try {
    const rewards = Object.values(AD_REWARDS).map(r => ({
      type: r.type,
      description: r.description,
      amount: r.amount,
      duration: r.duration,
    }));

    res.json({ rewards });
  } catch (error) {
    console.error('Get rewards error:', error);
    res.status(500).json({ error: 'Failed to get rewards' });
  }
});

// POST /api/ads/request - Request an ad (prepare to watch)
router.post('/request', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { adType, rewardType } = req.body as {
      adType: AdType;
      rewardType: RewardType;
    };

    if (!adType || !['rewarded_video', 'interstitial'].includes(adType)) {
      res.status(400).json({ error: 'Invalid ad type' });
      return;
    }

    if (!rewardType || !AD_REWARDS[rewardType]) {
      res.status(400).json({ error: 'Invalid reward type' });
      return;
    }

    // Check if user can watch
    const check = canWatchAd(req.user.id, adType);
    if (!check.canWatch) {
      res.status(400).json({
        error: check.reason,
        cooldownRemaining: check.cooldownRemaining,
      });
      return;
    }

    // Generate ad session ID
    const adSessionId = uuidv4();
    const estimatedDuration = adType === 'rewarded_video' ? 30 : 5; // seconds

    res.json({
      success: true,
      adSessionId,
      adType,
      rewardType,
      estimatedDuration,
      reward: AD_REWARDS[rewardType],
      // In a real implementation, this would include ad network config
      mockAd: {
        url: null, // Would be real ad URL
        skipEnabled: false,
        closeAfterSeconds: estimatedDuration,
      },
    });
  } catch (error) {
    console.error('Request ad error:', error);
    res.status(500).json({ error: 'Failed to request ad' });
  }
});

// POST /api/ads/complete - Mark ad as completed and grant reward
router.post('/complete', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { adSessionId, adType, rewardType } = req.body as {
      adSessionId: string;
      adType: AdType;
      rewardType: RewardType;
    };

    if (!adSessionId || !adType || !rewardType) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Validate reward type exists
    if (!AD_REWARDS[rewardType]) {
      res.status(400).json({ error: 'Invalid reward type' });
      return;
    }

    // Record the watch
    const watchId = uuidv4();
    const rewardAmount = AD_REWARDS[rewardType].amount || null;
    adQueries.recordWatch.run(
      watchId,
      req.user.id,
      adType,
      rewardType,
      rewardAmount,
      1 // completed
    );

    // Grant reward
    const rewardResult = grantReward(req.user.id, rewardType);

    // Get updated currencies
    const currencies = getPlayerCurrencies(req.user.id);

    // Check remaining watches
    const check = canWatchAd(req.user.id, adType);

    res.json({
      success: true,
      reward: {
        type: rewardType,
        description: AD_REWARDS[rewardType].description,
        ...rewardResult.details,
      },
      currencies: {
        gems: currencies.gems,
        coins: currencies.coins,
        crystals: currencies.crystals,
      },
      nextAdAvailable: check.canWatch,
      cooldownRemaining: check.cooldownRemaining || 0,
      watchesToday: check.watchesToday,
    });
  } catch (error) {
    console.error('Complete ad error:', error);
    res.status(500).json({ error: 'Failed to complete ad' });
  }
});

// POST /api/ads/skip - Mark ad as skipped (no reward)
router.post('/skip', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { adSessionId, adType } = req.body as {
      adSessionId: string;
      adType: AdType;
    };

    // Record as incomplete (no reward)
    const watchId = uuidv4();
    adQueries.recordWatch.run(
      watchId,
      req.user.id,
      adType,
      'none',
      null,
      0 // not completed
    );

    res.json({
      success: true,
      message: 'Ad skipped, no reward granted',
    });
  } catch (error) {
    console.error('Skip ad error:', error);
    res.status(500).json({ error: 'Failed to skip ad' });
  }
});

// GET /api/ads/boosts - Get active boosts
router.get('/boosts', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);

    // Clean up expired boosts
    adQueries.removeExpiredBoosts.run(now);

    // Get active boosts
    const boosts = adQueries.getActiveBoosts.all(req.user.id, now) as Array<{
      id: string;
      boost_type: string;
      expires_at: number;
      created_at: number;
    }>;

    res.json({
      boosts: boosts.map(b => ({
        id: b.id,
        type: b.boost_type,
        expiresAt: b.expires_at,
        timeRemaining: b.expires_at - now,
        createdAt: b.created_at,
      })),
      hasDoubleRewards: boosts.some(b => b.boost_type === 'double_rewards'),
    });
  } catch (error) {
    console.error('Get boosts error:', error);
    res.status(500).json({ error: 'Failed to get boosts' });
  }
});

// GET /api/ads/history - Get ad watch history
router.get('/history', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const history = adQueries.getWatchHistory.all(req.user.id, limit) as Array<{
      id: string;
      ad_type: string;
      reward_type: string;
      reward_amount: number | null;
      completed: number;
      watched_at: number;
    }>;

    res.json({
      history: history.map(h => ({
        id: h.id,
        adType: h.ad_type,
        rewardType: h.reward_type,
        rewardAmount: h.reward_amount,
        completed: h.completed === 1,
        watchedAt: h.watched_at,
      })),
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// GET /api/ads/ad-free - Check ad-free status
router.get('/ad-free', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const status = adQueries.getAdFreeStatus.get(req.user.id) as {
      is_ad_free: number;
      reason: string;
      expires_at: number | null;
    } | undefined;

    const now = Math.floor(Date.now() / 1000);
    const isActive = status?.is_ad_free === 1 && (!status.expires_at || status.expires_at > now);

    res.json({
      isAdFree: isActive,
      reason: isActive ? status?.reason : null,
      expiresAt: isActive ? status?.expires_at : null,
      timeRemaining: isActive && status?.expires_at ? status.expires_at - now : null,
    });
  } catch (error) {
    console.error('Get ad-free status error:', error);
    res.status(500).json({ error: 'Failed to get ad-free status' });
  }
});

// POST /api/ads/set-ad-free - Set ad-free status (internal/admin use)
router.post('/set-ad-free', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { userId, isAdFree, reason, durationDays } = req.body as {
      userId?: string;
      isAdFree: boolean;
      reason: string;
      durationDays?: number;
    };

    // In production, this should check admin permissions
    const targetUserId = userId || req.user.id;

    const expiresAt = durationDays
      ? Math.floor(Date.now() / 1000) + durationDays * 24 * 60 * 60
      : null;

    adQueries.setAdFreeStatus.run(targetUserId, isAdFree ? 1 : 0, reason, expiresAt);

    res.json({
      success: true,
      userId: targetUserId,
      isAdFree,
      reason,
      expiresAt,
    });
  } catch (error) {
    console.error('Set ad-free status error:', error);
    res.status(500).json({ error: 'Failed to set ad-free status' });
  }
});

export { router as adRouter, initAdTables };
