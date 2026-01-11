import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from './auth';
import { db } from './database';
import { spendCurrency, awardCurrency, getPlayerCurrencies, CurrencyType } from './currency';

const router = Router();

// ============ TYPES ============

export type PrizeType = 'coins' | 'gems' | 'item' | 'jackpot' | 'nothing';

export interface WheelPrize {
  id: string;
  name: string;
  type: PrizeType;
  amount?: number;
  itemId?: string;
  weight: number;
  color: string;
  isJackpot: boolean;
}

export interface SpinResult {
  id: string;
  userId: string;
  prizeId: string;
  prizeName: string;
  prizeType: PrizeType;
  prizeAmount: number | null;
  prizeItemId: string | null;
  spinType: 'free' | 'premium';
  segmentIndex: number;
  createdAt: number;
}

export interface JackpotInfo {
  currentAmount: number;
  lastWinner: string | null;
  lastWinAmount: number | null;
  lastWinTime: number | null;
  contributionPerSpin: number;
}

// ============ CONSTANTS ============

// Default wheel configuration
const DEFAULT_WHEEL_PRIZES: WheelPrize[] = [
  { id: 'coins_50', name: '50 Coins', type: 'coins', amount: 50, weight: 25, color: '#FFD700', isJackpot: false },
  { id: 'coins_100', name: '100 Coins', type: 'coins', amount: 100, weight: 20, color: '#FFD700', isJackpot: false },
  { id: 'coins_200', name: '200 Coins', type: 'coins', amount: 200, weight: 10, color: '#FFD700', isJackpot: false },
  { id: 'gems_5', name: '5 Gems', type: 'gems', amount: 5, weight: 15, color: '#00F5FF', isJackpot: false },
  { id: 'gems_10', name: '10 Gems', type: 'gems', amount: 10, weight: 8, color: '#00F5FF', isJackpot: false },
  { id: 'gems_25', name: '25 Gems', type: 'gems', amount: 25, weight: 3, color: '#00F5FF', isJackpot: false },
  { id: 'coins_500', name: '500 Coins', type: 'coins', amount: 500, weight: 5, color: '#FFD700', isJackpot: false },
  { id: 'gems_50', name: '50 Gems', type: 'gems', amount: 50, weight: 1, color: '#AA44FF', isJackpot: false },
  { id: 'nothing', name: 'Try Again', type: 'nothing', weight: 12, color: '#666666', isJackpot: false },
  { id: 'jackpot', name: 'JACKPOT!', type: 'jackpot', weight: 1, color: '#FF3366', isJackpot: true },
];

// Spin costs
const FREE_SPIN_COOLDOWN_HOURS = 24;
const PREMIUM_SPIN_COST: { type: CurrencyType; amount: number } = { type: 'gems', amount: 25 };

// Jackpot configuration
const JACKPOT_BASE = 10000; // Starting jackpot coins
const JACKPOT_CONTRIBUTION = 50; // Coins added per premium spin

// ============ DATABASE INITIALIZATION ============

export function initLuckyDrawTables(): void {
  // Lucky wheel configuration
  db.exec(`
    CREATE TABLE IF NOT EXISTS lucky_wheel_config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      prizes TEXT NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Player spin history
  db.exec(`
    CREATE TABLE IF NOT EXISTS lucky_wheel_spins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      prize_id TEXT NOT NULL,
      prize_name TEXT NOT NULL,
      prize_type TEXT NOT NULL,
      prize_amount INTEGER,
      prize_item_id TEXT,
      spin_type TEXT NOT NULL,
      segment_index INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Daily free spin tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS lucky_wheel_free_spins (
      user_id TEXT PRIMARY KEY,
      last_free_spin INTEGER,
      consecutive_days INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Jackpot pool
  db.exec(`
    CREATE TABLE IF NOT EXISTS lucky_wheel_jackpot (
      id TEXT PRIMARY KEY DEFAULT 'global',
      current_amount INTEGER DEFAULT ${JACKPOT_BASE},
      last_winner_id TEXT,
      last_win_amount INTEGER,
      last_win_time INTEGER,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_wheel_spins_user ON lucky_wheel_spins(user_id, created_at DESC)`);

  // Initialize default config and jackpot
  initDefaultConfig();
  initJackpot();

  console.log('Lucky draw tables initialized');
}

// ============ PREPARED STATEMENTS ============

const wheelQueries = {
  // Config
  getConfig: db.prepare(`SELECT * FROM lucky_wheel_config WHERE id = 'default'`),
  setConfig: db.prepare(`
    INSERT INTO lucky_wheel_config (id, prizes, updated_at)
    VALUES ('default', ?, strftime('%s', 'now'))
    ON CONFLICT(id) DO UPDATE SET prizes = excluded.prizes, updated_at = strftime('%s', 'now')
  `),

  // Spins
  recordSpin: db.prepare(`
    INSERT INTO lucky_wheel_spins (id, user_id, prize_id, prize_name, prize_type, prize_amount, prize_item_id, spin_type, segment_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getSpinHistory: db.prepare(`
    SELECT * FROM lucky_wheel_spins WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `),
  countTodaySpins: db.prepare(`
    SELECT COUNT(*) as count FROM lucky_wheel_spins WHERE user_id = ? AND created_at > ?
  `),

  // Free spins
  getFreeSpinStatus: db.prepare(`SELECT * FROM lucky_wheel_free_spins WHERE user_id = ?`),
  updateFreeSpin: db.prepare(`
    INSERT INTO lucky_wheel_free_spins (user_id, last_free_spin, consecutive_days)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      last_free_spin = excluded.last_free_spin,
      consecutive_days = excluded.consecutive_days
  `),

  // Jackpot
  getJackpot: db.prepare(`SELECT * FROM lucky_wheel_jackpot WHERE id = 'global'`),
  updateJackpot: db.prepare(`
    UPDATE lucky_wheel_jackpot
    SET current_amount = ?, updated_at = strftime('%s', 'now')
    WHERE id = 'global'
  `),
  recordJackpotWin: db.prepare(`
    UPDATE lucky_wheel_jackpot
    SET current_amount = ?, last_winner_id = ?, last_win_amount = ?, last_win_time = ?, updated_at = strftime('%s', 'now')
    WHERE id = 'global'
  `),
};

// ============ INITIALIZATION ============

function initDefaultConfig(): void {
  const existing = wheelQueries.getConfig.get();
  if (!existing) {
    wheelQueries.setConfig.run(JSON.stringify(DEFAULT_WHEEL_PRIZES));
    console.log('Default wheel config initialized');
  }
}

function initJackpot(): void {
  const existing = wheelQueries.getJackpot.get();
  if (!existing) {
    db.prepare(`
      INSERT INTO lucky_wheel_jackpot (id, current_amount) VALUES ('global', ?)
    `).run(JACKPOT_BASE);
    console.log('Jackpot initialized');
  }
}

// ============ HELPER FUNCTIONS ============

function getWheelPrizes(): WheelPrize[] {
  const config = wheelQueries.getConfig.get() as { prizes: string } | undefined;
  if (!config) return DEFAULT_WHEEL_PRIZES;
  return JSON.parse(config.prizes);
}

function getStartOfDay(): number {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return Math.floor(now.getTime() / 1000);
}

function canClaimFreeSpin(userId: string): {
  canSpin: boolean;
  nextFreeSpinTime: number | null;
  consecutiveDays: number;
} {
  const status = wheelQueries.getFreeSpinStatus.get(userId) as {
    last_free_spin: number | null;
    consecutive_days: number;
  } | undefined;

  if (!status || !status.last_free_spin) {
    return {
      canSpin: true,
      nextFreeSpinTime: null,
      consecutiveDays: 0,
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const cooldownSeconds = FREE_SPIN_COOLDOWN_HOURS * 60 * 60;
  const nextSpinTime = status.last_free_spin + cooldownSeconds;

  return {
    canSpin: now >= nextSpinTime,
    nextFreeSpinTime: now >= nextSpinTime ? null : nextSpinTime,
    consecutiveDays: status.consecutive_days,
  };
}

function calculateConsecutiveDays(userId: string): number {
  const status = wheelQueries.getFreeSpinStatus.get(userId) as {
    last_free_spin: number | null;
    consecutive_days: number;
  } | undefined;

  if (!status || !status.last_free_spin) {
    return 1;
  }

  const now = Math.floor(Date.now() / 1000);
  const lastSpin = status.last_free_spin;
  const daysSinceLastSpin = Math.floor((now - lastSpin) / (24 * 60 * 60));

  if (daysSinceLastSpin <= 1) {
    // Consecutive day
    return status.consecutive_days + 1;
  } else {
    // Streak broken
    return 1;
  }
}

function selectPrize(prizes: WheelPrize[]): { prize: WheelPrize; segmentIndex: number } {
  const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < prizes.length; i++) {
    random -= prizes[i].weight;
    if (random <= 0) {
      return { prize: prizes[i], segmentIndex: i };
    }
  }

  // Fallback to first prize
  return { prize: prizes[0], segmentIndex: 0 };
}

function grantPrize(userId: string, prize: WheelPrize): {
  granted: boolean;
  amount?: number;
  itemId?: string;
} {
  switch (prize.type) {
    case 'coins':
      if (prize.amount) {
        awardCurrency(userId, 'coins', prize.amount, 'Lucky Wheel', 'lucky_wheel');
        return { granted: true, amount: prize.amount };
      }
      break;

    case 'gems':
      if (prize.amount) {
        awardCurrency(userId, 'gems', prize.amount, 'Lucky Wheel', 'lucky_wheel');
        return { granted: true, amount: prize.amount };
      }
      break;

    case 'jackpot': {
      // Get and reset jackpot
      const jackpot = wheelQueries.getJackpot.get() as { current_amount: number };
      const winAmount = jackpot.current_amount;

      awardCurrency(userId, 'coins', winAmount, 'Lucky Wheel JACKPOT!', 'lucky_wheel_jackpot');

      // Record jackpot win and reset
      const now = Math.floor(Date.now() / 1000);
      wheelQueries.recordJackpotWin.run(JACKPOT_BASE, userId, winAmount, now);

      return { granted: true, amount: winAmount };
    }

    case 'item':
      if (prize.itemId) {
        // Add item to player inventory
        try {
          db.prepare(`
            INSERT OR IGNORE INTO player_items (player_id, item_id) VALUES (?, ?)
          `).run(userId, prize.itemId);
          return { granted: true, itemId: prize.itemId };
        } catch {
          // Item already owned - give coins instead
          awardCurrency(userId, 'coins', 100, 'Duplicate item from Lucky Wheel', 'lucky_wheel');
          return { granted: true, amount: 100 };
        }
      }
      break;

    case 'nothing':
      return { granted: true };
  }

  return { granted: false };
}

function contributeToJackpot(): void {
  const jackpot = wheelQueries.getJackpot.get() as { current_amount: number };
  wheelQueries.updateJackpot.run(jackpot.current_amount + JACKPOT_CONTRIBUTION);
}

// ============ API ROUTES ============

// GET /api/lucky-draw/wheel - Get wheel configuration and prizes
router.get('/wheel', (req: AuthRequest, res: Response) => {
  try {
    const prizes = getWheelPrizes();
    const jackpot = wheelQueries.getJackpot.get() as {
      current_amount: number;
      last_winner_id: string | null;
      last_win_amount: number | null;
      last_win_time: number | null;
    };

    // Get free spin status if authenticated
    let freeSpinStatus = null;
    if (req.user) {
      const status = canClaimFreeSpin(req.user.id);
      freeSpinStatus = {
        available: status.canSpin,
        nextFreeSpinTime: status.nextFreeSpinTime,
        consecutiveDays: status.consecutiveDays,
        cooldownHours: FREE_SPIN_COOLDOWN_HOURS,
      };
    }

    res.json({
      prizes: prizes.map((p, index) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        amount: p.amount,
        color: p.color,
        isJackpot: p.isJackpot,
        segmentIndex: index,
        // Don't expose weights to client
      })),
      segmentCount: prizes.length,
      jackpot: {
        currentAmount: jackpot.current_amount,
        lastWinAmount: jackpot.last_win_amount,
        lastWinTime: jackpot.last_win_time,
      },
      freeSpin: freeSpinStatus,
      premiumSpinCost: PREMIUM_SPIN_COST,
    });
  } catch (error) {
    console.error('Get wheel error:', error);
    res.status(500).json({ error: 'Failed to get wheel configuration' });
  }
});

// GET /api/lucky-draw/status - Get player's spin status
router.get('/status', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const freeSpinStatus = canClaimFreeSpin(req.user.id);
    const currencies = getPlayerCurrencies(req.user.id);
    const startOfDay = getStartOfDay();
    const todaySpins = wheelQueries.countTodaySpins.get(req.user.id, startOfDay) as { count: number };

    res.json({
      freeSpin: {
        available: freeSpinStatus.canSpin,
        nextFreeSpinTime: freeSpinStatus.nextFreeSpinTime,
        consecutiveDays: freeSpinStatus.consecutiveDays,
        bonusMultiplier: Math.min(1 + freeSpinStatus.consecutiveDays * 0.1, 2), // Up to 2x for streak
      },
      premiumSpin: {
        cost: PREMIUM_SPIN_COST,
        canAfford: currencies[PREMIUM_SPIN_COST.type] >= PREMIUM_SPIN_COST.amount,
      },
      spinsToday: todaySpins.count,
      currencies: {
        gems: currencies.gems,
        coins: currencies.coins,
        crystals: currencies.crystals,
      },
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ error: 'Failed to get spin status' });
  }
});

// POST /api/lucky-draw/spin - Perform a spin
router.post('/spin', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { spinType } = req.body as { spinType: 'free' | 'premium' };

    if (!spinType || !['free', 'premium'].includes(spinType)) {
      res.status(400).json({ error: 'Invalid spin type' });
      return;
    }

    // Handle free spin
    if (spinType === 'free') {
      const status = canClaimFreeSpin(req.user.id);
      if (!status.canSpin) {
        res.status(400).json({
          error: 'Free spin not available',
          nextFreeSpinTime: status.nextFreeSpinTime,
        });
        return;
      }

      // Update free spin tracking
      const now = Math.floor(Date.now() / 1000);
      const consecutiveDays = calculateConsecutiveDays(req.user.id);
      wheelQueries.updateFreeSpin.run(req.user.id, now, consecutiveDays);
    } else {
      // Handle premium spin - deduct currency
      const result = spendCurrency(
        req.user.id,
        PREMIUM_SPIN_COST.type,
        PREMIUM_SPIN_COST.amount,
        'Lucky Wheel premium spin',
        'lucky_wheel_spin'
      );

      if (!result.success) {
        res.status(400).json({ error: result.error || 'Insufficient currency' });
        return;
      }

      // Contribute to jackpot
      contributeToJackpot();
    }

    // Select prize
    const prizes = getWheelPrizes();
    const { prize, segmentIndex } = selectPrize(prizes);

    // Apply streak bonus for free spins
    let bonusMultiplier = 1;
    if (spinType === 'free') {
      const status = wheelQueries.getFreeSpinStatus.get(req.user.id) as { consecutive_days: number } | undefined;
      if (status) {
        bonusMultiplier = Math.min(1 + status.consecutive_days * 0.1, 2);
      }
    }

    // Grant prize (with bonus if applicable)
    let prizeAmount = prize.amount;
    if (prizeAmount && (prize.type === 'coins' || prize.type === 'gems') && bonusMultiplier > 1) {
      prizeAmount = Math.floor(prizeAmount * bonusMultiplier);
    }

    const modifiedPrize = { ...prize, amount: prizeAmount };
    const grantResult = grantPrize(req.user.id, modifiedPrize);

    // Record spin
    const spinId = uuidv4();
    wheelQueries.recordSpin.run(
      spinId,
      req.user.id,
      prize.id,
      prize.name,
      prize.type,
      grantResult.amount || null,
      grantResult.itemId || null,
      spinType,
      segmentIndex
    );

    // Get updated data
    const currencies = getPlayerCurrencies(req.user.id);
    const jackpot = wheelQueries.getJackpot.get() as { current_amount: number };
    const newFreeSpinStatus = canClaimFreeSpin(req.user.id);

    res.json({
      success: true,
      spin: {
        id: spinId,
        type: spinType,
        segmentIndex,
        prize: {
          id: prize.id,
          name: prize.name,
          type: prize.type,
          amount: grantResult.amount,
          itemId: grantResult.itemId,
          isJackpot: prize.isJackpot,
          color: prize.color,
        },
        bonusMultiplier: bonusMultiplier > 1 ? bonusMultiplier : null,
      },
      currencies: {
        gems: currencies.gems,
        coins: currencies.coins,
        crystals: currencies.crystals,
      },
      jackpot: {
        currentAmount: jackpot.current_amount,
      },
      nextFreeSpin: {
        available: newFreeSpinStatus.canSpin,
        nextFreeSpinTime: newFreeSpinStatus.nextFreeSpinTime,
        consecutiveDays: newFreeSpinStatus.consecutiveDays,
      },
    });
  } catch (error) {
    console.error('Spin error:', error);
    res.status(500).json({ error: 'Failed to perform spin' });
  }
});

// GET /api/lucky-draw/history - Get spin history
router.get('/history', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const history = wheelQueries.getSpinHistory.all(req.user.id, limit) as Array<{
      id: string;
      prize_id: string;
      prize_name: string;
      prize_type: string;
      prize_amount: number | null;
      prize_item_id: string | null;
      spin_type: string;
      segment_index: number;
      created_at: number;
    }>;

    // Calculate stats
    const stats = {
      totalSpins: history.length,
      freeSpins: history.filter(h => h.spin_type === 'free').length,
      premiumSpins: history.filter(h => h.spin_type === 'premium').length,
      totalCoinsWon: history
        .filter(h => h.prize_type === 'coins' || h.prize_type === 'jackpot')
        .reduce((sum, h) => sum + (h.prize_amount || 0), 0),
      totalGemsWon: history
        .filter(h => h.prize_type === 'gems')
        .reduce((sum, h) => sum + (h.prize_amount || 0), 0),
      jackpotsWon: history.filter(h => h.prize_type === 'jackpot').length,
    };

    res.json({
      history: history.map(h => ({
        id: h.id,
        prizeId: h.prize_id,
        prizeName: h.prize_name,
        prizeType: h.prize_type,
        prizeAmount: h.prize_amount,
        prizeItemId: h.prize_item_id,
        spinType: h.spin_type,
        segmentIndex: h.segment_index,
        createdAt: h.created_at,
      })),
      stats,
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to get spin history' });
  }
});

// GET /api/lucky-draw/jackpot - Get jackpot info
router.get('/jackpot', (_req: AuthRequest, res: Response) => {
  try {
    const jackpot = wheelQueries.getJackpot.get() as {
      current_amount: number;
      last_winner_id: string | null;
      last_win_amount: number | null;
      last_win_time: number | null;
    };

    // Get winner username if exists
    let lastWinnerName = null;
    if (jackpot.last_winner_id) {
      const winner = db.prepare(`SELECT username FROM users WHERE id = ?`).get(jackpot.last_winner_id) as { username: string } | undefined;
      lastWinnerName = winner?.username || 'Anonymous';
    }

    res.json({
      currentAmount: jackpot.current_amount,
      lastWinner: lastWinnerName,
      lastWinAmount: jackpot.last_win_amount,
      lastWinTime: jackpot.last_win_time,
      contributionPerSpin: JACKPOT_CONTRIBUTION,
      baseAmount: JACKPOT_BASE,
    });
  } catch (error) {
    console.error('Get jackpot error:', error);
    res.status(500).json({ error: 'Failed to get jackpot info' });
  }
});

// GET /api/lucky-draw/odds - Get prize odds (for transparency/legal compliance)
router.get('/odds', (_req: AuthRequest, res: Response) => {
  try {
    const prizes = getWheelPrizes();
    const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0);

    const odds = prizes.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      probability: `${((p.weight / totalWeight) * 100).toFixed(2)}%`,
      isJackpot: p.isJackpot,
    }));

    res.json({
      odds,
      totalSegments: prizes.length,
      disclaimer: 'Probabilities are approximate and may vary. Results are randomly generated.',
    });
  } catch (error) {
    console.error('Get odds error:', error);
    res.status(500).json({ error: 'Failed to get odds' });
  }
});

export { router as luckyDrawRouter, initLuckyDrawTables };
