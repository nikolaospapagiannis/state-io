import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from './auth';
import { db } from './database';
import { spendCurrency, awardCurrency, getPlayerCurrencies, CurrencyType } from './currency';

const router = Router();

// ============ TYPES ============

export type BoxType = 'common' | 'rare' | 'epic' | 'legendary';
export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface GachaItem {
  id: string;
  name: string;
  type: string;
  rarity: ItemRarity;
  imageKey: string;
  isFeatured?: boolean;
}

export interface GachaBanner {
  id: string;
  name: string;
  description: string;
  startDate: number;
  endDate: number;
  featuredItems: string[];
  rateUpMultiplier: number;
  imageKey: string;
  isActive: boolean;
}

export interface GachaPull {
  id: string;
  userId: string;
  boxType: BoxType;
  bannerId: string | null;
  itemId: string;
  itemRarity: ItemRarity;
  isFeatured: boolean;
  pullNumber: number;
  wasPity: boolean;
  createdAt: number;
}

export interface PlayerPity {
  userId: string;
  epicPity: number;
  legendaryPity: number;
  lastEpicPull: number;
  lastLegendaryPull: number;
  totalPulls: number;
}

// ============ CONSTANTS ============

// Drop rates (in percentage)
const BASE_DROP_RATES: Record<BoxType, Record<ItemRarity, number>> = {
  common: {
    common: 70,
    rare: 25,
    epic: 4.5,
    legendary: 0.5,
    mythic: 0,
  },
  rare: {
    common: 40,
    rare: 45,
    epic: 12,
    legendary: 2.5,
    mythic: 0.5,
  },
  epic: {
    common: 0,
    rare: 35,
    epic: 50,
    legendary: 12,
    mythic: 3,
  },
  legendary: {
    common: 0,
    rare: 0,
    epic: 40,
    legendary: 45,
    mythic: 15,
  },
};

// Pity thresholds
const EPIC_PITY_THRESHOLD = 10;
const LEGENDARY_PITY_THRESHOLD = 50;

// Box costs
const BOX_COSTS: Record<BoxType, { type: CurrencyType; amount: number } | 'free_daily'> = {
  common: { type: 'coins', amount: 100 },
  rare: { type: 'gems', amount: 50 },
  epic: { type: 'gems', amount: 150 },
  legendary: { type: 'gems', amount: 500 },
};

// Multi-pull discount
const MULTI_PULL_COUNT = 10;
const MULTI_PULL_DISCOUNT = 0.9; // 10% discount

// Regulated regions that require odds display
const REGULATED_REGIONS = ['CN', 'JP', 'KR', 'BE', 'NL'];

// ============ DATABASE INITIALIZATION ============

export function initGachaTables(): void {
  // Gacha items pool
  db.exec(`
    CREATE TABLE IF NOT EXISTS gacha_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      rarity TEXT NOT NULL,
      image_key TEXT,
      is_available INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Gacha banners (rate-up events)
  db.exec(`
    CREATE TABLE IF NOT EXISTS gacha_banners (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      start_date INTEGER NOT NULL,
      end_date INTEGER NOT NULL,
      featured_items TEXT NOT NULL DEFAULT '[]',
      rate_up_multiplier REAL DEFAULT 2.0,
      image_key TEXT,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Player pity counters
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_gacha_pity (
      user_id TEXT PRIMARY KEY,
      epic_pity INTEGER DEFAULT 0,
      legendary_pity INTEGER DEFAULT 0,
      last_epic_pull INTEGER,
      last_legendary_pull INTEGER,
      total_pulls INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Pull history
  db.exec(`
    CREATE TABLE IF NOT EXISTS gacha_pulls (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      box_type TEXT NOT NULL,
      banner_id TEXT,
      item_id TEXT NOT NULL,
      item_rarity TEXT NOT NULL,
      is_featured INTEGER DEFAULT 0,
      pull_number INTEGER NOT NULL,
      was_pity INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (item_id) REFERENCES gacha_items(id)
    )
  `);

  // Daily free box tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS gacha_daily_free (
      user_id TEXT NOT NULL,
      box_type TEXT NOT NULL,
      claim_date TEXT NOT NULL,
      claimed_at INTEGER DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (user_id, box_type, claim_date),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_gacha_pulls_user ON gacha_pulls(user_id, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_gacha_banners_active ON gacha_banners(is_active, end_date)`);

  // Initialize default items if empty
  initDefaultGachaItems();

  console.log('Gacha tables initialized');
}

// ============ PREPARED STATEMENTS ============

const gachaQueries = {
  // Items
  getItemsByRarity: db.prepare(`SELECT * FROM gacha_items WHERE rarity = ? AND is_available = 1`),
  getItemById: db.prepare(`SELECT * FROM gacha_items WHERE id = ?`),
  getAllItems: db.prepare(`SELECT * FROM gacha_items WHERE is_available = 1`),

  // Banners
  getActiveBanners: db.prepare(`
    SELECT * FROM gacha_banners
    WHERE is_active = 1 AND start_date <= ? AND end_date > ?
    ORDER BY created_at DESC
  `),
  getBannerById: db.prepare(`SELECT * FROM gacha_banners WHERE id = ?`),

  // Pity
  getPity: db.prepare(`SELECT * FROM player_gacha_pity WHERE user_id = ?`),
  upsertPity: db.prepare(`
    INSERT INTO player_gacha_pity (user_id, epic_pity, legendary_pity, last_epic_pull, last_legendary_pull, total_pulls)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      epic_pity = excluded.epic_pity,
      legendary_pity = excluded.legendary_pity,
      last_epic_pull = excluded.last_epic_pull,
      last_legendary_pull = excluded.last_legendary_pull,
      total_pulls = excluded.total_pulls
  `),

  // Pulls
  recordPull: db.prepare(`
    INSERT INTO gacha_pulls (id, user_id, box_type, banner_id, item_id, item_rarity, is_featured, pull_number, was_pity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getPullHistory: db.prepare(`
    SELECT gp.*, gi.name as item_name, gi.type as item_type, gi.image_key
    FROM gacha_pulls gp
    JOIN gacha_items gi ON gp.item_id = gi.id
    WHERE gp.user_id = ?
    ORDER BY gp.created_at DESC
    LIMIT ?
  `),
  countPullsByRarity: db.prepare(`
    SELECT item_rarity, COUNT(*) as count
    FROM gacha_pulls
    WHERE user_id = ?
    GROUP BY item_rarity
  `),

  // Daily free
  checkDailyFree: db.prepare(`
    SELECT * FROM gacha_daily_free WHERE user_id = ? AND box_type = ? AND claim_date = ?
  `),
  claimDailyFree: db.prepare(`
    INSERT INTO gacha_daily_free (user_id, box_type, claim_date) VALUES (?, ?, ?)
  `),

  // Item creation
  createItem: db.prepare(`
    INSERT OR IGNORE INTO gacha_items (id, name, type, rarity, image_key) VALUES (?, ?, ?, ?, ?)
  `),
  countItems: db.prepare(`SELECT COUNT(*) as count FROM gacha_items`),
};

// ============ DEFAULT ITEMS ============

function initDefaultGachaItems(): void {
  const count = gachaQueries.countItems.get() as { count: number };
  if (count.count > 0) return;

  const items = [
    // Common items
    { id: 'skin_basic_1', name: 'Basic Blue', type: 'skin', rarity: 'common' },
    { id: 'skin_basic_2', name: 'Basic Red', type: 'skin', rarity: 'common' },
    { id: 'skin_basic_3', name: 'Basic Green', type: 'skin', rarity: 'common' },
    { id: 'avatar_soldier_1', name: 'Soldier Avatar', type: 'avatar', rarity: 'common' },
    { id: 'avatar_soldier_2', name: 'Commander Avatar', type: 'avatar', rarity: 'common' },
    { id: 'coins_100', name: '100 Coins', type: 'currency', rarity: 'common' },
    { id: 'coins_200', name: '200 Coins', type: 'currency', rarity: 'common' },

    // Rare items
    { id: 'skin_camo_1', name: 'Desert Camo', type: 'skin', rarity: 'rare' },
    { id: 'skin_camo_2', name: 'Forest Camo', type: 'skin', rarity: 'rare' },
    { id: 'skin_neon_1', name: 'Neon Blue', type: 'skin', rarity: 'rare' },
    { id: 'troop_knight', name: 'Knight Troops', type: 'troop_skin', rarity: 'rare' },
    { id: 'frame_silver', name: 'Silver Frame', type: 'frame', rarity: 'rare' },
    { id: 'title_warrior', name: 'Warrior Title', type: 'title', rarity: 'rare' },
    { id: 'gems_10', name: '10 Gems', type: 'currency', rarity: 'rare' },

    // Epic items
    { id: 'skin_galaxy_1', name: 'Galaxy Skin', type: 'skin', rarity: 'epic' },
    { id: 'skin_fire_1', name: 'Inferno Skin', type: 'skin', rarity: 'epic' },
    { id: 'skin_ice_1', name: 'Frost Skin', type: 'skin', rarity: 'epic' },
    { id: 'troop_robot', name: 'Robot Troops', type: 'troop_skin', rarity: 'epic' },
    { id: 'territory_lava', name: 'Lava Territory', type: 'territory_theme', rarity: 'epic' },
    { id: 'frame_gold', name: 'Gold Frame', type: 'frame', rarity: 'epic' },
    { id: 'victory_fireworks', name: 'Fireworks Victory', type: 'victory_animation', rarity: 'epic' },
    { id: 'gems_50', name: '50 Gems', type: 'currency', rarity: 'epic' },

    // Legendary items
    { id: 'skin_dragon', name: 'Dragon Emperor', type: 'skin', rarity: 'legendary' },
    { id: 'skin_void', name: 'Void Walker', type: 'skin', rarity: 'legendary' },
    { id: 'skin_celestial', name: 'Celestial Guardian', type: 'skin', rarity: 'legendary' },
    { id: 'troop_dragons', name: 'Dragon Troops', type: 'troop_skin', rarity: 'legendary' },
    { id: 'territory_crystal', name: 'Crystal Palace', type: 'territory_theme', rarity: 'legendary' },
    { id: 'frame_diamond', name: 'Diamond Frame', type: 'frame', rarity: 'legendary' },
    { id: 'title_conqueror', name: 'Supreme Conqueror', type: 'title', rarity: 'legendary' },
    { id: 'gems_200', name: '200 Gems', type: 'currency', rarity: 'legendary' },

    // Mythic items
    { id: 'skin_primordial', name: 'Primordial God', type: 'skin', rarity: 'mythic' },
    { id: 'skin_cosmic', name: 'Cosmic Entity', type: 'skin', rarity: 'mythic' },
    { id: 'troop_angels', name: 'Angelic Legion', type: 'troop_skin', rarity: 'mythic' },
    { id: 'territory_eden', name: 'Garden of Eden', type: 'territory_theme', rarity: 'mythic' },
    { id: 'victory_ascension', name: 'Divine Ascension', type: 'victory_animation', rarity: 'mythic' },
    { id: 'title_legend', name: 'Living Legend', type: 'title', rarity: 'mythic' },
  ];

  for (const item of items) {
    gachaQueries.createItem.run(item.id, item.name, item.type, item.rarity, `gacha_${item.id}`);
  }

  console.log('Default gacha items initialized');
}

// ============ HELPER FUNCTIONS ============

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function getPlayerPity(userId: string): PlayerPity {
  let pity = gachaQueries.getPity.get(userId) as PlayerPity | undefined;
  if (!pity) {
    pity = {
      userId,
      epicPity: 0,
      legendaryPity: 0,
      lastEpicPull: 0,
      lastLegendaryPull: 0,
      totalPulls: 0,
    };
  }
  return pity;
}

function updatePity(pity: PlayerPity): void {
  gachaQueries.upsertPity.run(
    pity.userId,
    pity.epicPity,
    pity.legendaryPity,
    pity.lastEpicPull,
    pity.lastLegendaryPull,
    pity.totalPulls
  );
}

function calculateDropRates(
  boxType: BoxType,
  pity: PlayerPity,
  banner: GachaBanner | null
): Record<ItemRarity, number> {
  const baseRates = { ...BASE_DROP_RATES[boxType] };

  // Apply pity boosts
  if (pity.epicPity >= EPIC_PITY_THRESHOLD - 1) {
    // Guaranteed epic on next pull
    baseRates.common = 0;
    baseRates.rare = 0;
    baseRates.epic = 100 - baseRates.legendary - baseRates.mythic;
  }

  if (pity.legendaryPity >= LEGENDARY_PITY_THRESHOLD - 1) {
    // Guaranteed legendary on next pull
    baseRates.common = 0;
    baseRates.rare = 0;
    baseRates.epic = 0;
    baseRates.legendary = 100 - baseRates.mythic;
  }

  // Soft pity: Increase rates as approaching threshold
  if (pity.epicPity >= 7 && pity.epicPity < EPIC_PITY_THRESHOLD - 1) {
    const boost = (pity.epicPity - 6) * 3; // +3% per pull after 7
    baseRates.epic += boost;
    baseRates.common = Math.max(0, baseRates.common - boost);
  }

  if (pity.legendaryPity >= 40 && pity.legendaryPity < LEGENDARY_PITY_THRESHOLD - 1) {
    const boost = (pity.legendaryPity - 39) * 2; // +2% per pull after 40
    baseRates.legendary += boost;
    baseRates.rare = Math.max(0, baseRates.rare - boost);
  }

  return baseRates;
}

function rollRarity(rates: Record<ItemRarity, number>): ItemRarity {
  const roll = Math.random() * 100;
  let cumulative = 0;

  const rarities: ItemRarity[] = ['mythic', 'legendary', 'epic', 'rare', 'common'];

  for (const rarity of rarities) {
    cumulative += rates[rarity];
    if (roll < cumulative) {
      return rarity;
    }
  }

  return 'common';
}

function selectItem(
  rarity: ItemRarity,
  banner: GachaBanner | null
): { item: GachaItem; isFeatured: boolean } {
  const items = gachaQueries.getItemsByRarity.all(rarity) as Array<{
    id: string;
    name: string;
    type: string;
    rarity: string;
    image_key: string;
  }>;

  if (items.length === 0) {
    // Fallback to any item
    const allItems = gachaQueries.getAllItems.all() as typeof items;
    const item = allItems[Math.floor(Math.random() * allItems.length)];
    return {
      item: {
        id: item.id,
        name: item.name,
        type: item.type,
        rarity: item.rarity as ItemRarity,
        imageKey: item.image_key,
      },
      isFeatured: false,
    };
  }

  // Check for banner rate-up
  if (banner) {
    const featuredItems = JSON.parse(banner.featured_items || '[]') as string[];
    const featuredInPool = items.filter(i => featuredItems.includes(i.id));

    if (featuredInPool.length > 0 && Math.random() < 0.5) {
      // 50% chance to get featured item of matching rarity
      const featured = featuredInPool[Math.floor(Math.random() * featuredInPool.length)];
      return {
        item: {
          id: featured.id,
          name: featured.name,
          type: featured.type,
          rarity: featured.rarity as ItemRarity,
          imageKey: featured.image_key,
          isFeatured: true,
        },
        isFeatured: true,
      };
    }
  }

  const selected = items[Math.floor(Math.random() * items.length)];
  return {
    item: {
      id: selected.id,
      name: selected.name,
      type: selected.type,
      rarity: selected.rarity as ItemRarity,
      imageKey: selected.image_key,
    },
    isFeatured: false,
  };
}

function grantItem(userId: string, item: GachaItem): void {
  // Handle currency items
  if (item.type === 'currency') {
    if (item.id.startsWith('coins_')) {
      const amount = parseInt(item.id.replace('coins_', ''));
      awardCurrency(userId, 'coins', amount, 'Gacha reward', item.id);
    } else if (item.id.startsWith('gems_')) {
      const amount = parseInt(item.id.replace('gems_', ''));
      awardCurrency(userId, 'gems', amount, 'Gacha reward', item.id);
    }
  } else {
    // Add to player's collection
    try {
      db.prepare(`
        INSERT OR IGNORE INTO player_items (player_id, item_id) VALUES (?, ?)
      `).run(userId, item.id);
    } catch {
      // Item already owned - give duplicate compensation
      const dupeCoins = {
        common: 50,
        rare: 150,
        epic: 500,
        legendary: 2000,
        mythic: 5000,
      };
      awardCurrency(userId, 'coins', dupeCoins[item.rarity], 'Duplicate item compensation', item.id);
    }
  }
}

function performPull(
  userId: string,
  boxType: BoxType,
  bannerId: string | null
): { item: GachaItem; isFeatured: boolean; wasPity: boolean; pullNumber: number } {
  const pity = getPlayerPity(userId);
  const banner = bannerId ? gachaQueries.getBannerById.get(bannerId) as GachaBanner | undefined : null;

  const rates = calculateDropRates(boxType, pity, banner || null);
  const rarity = rollRarity(rates);
  const { item, isFeatured } = selectItem(rarity, banner || null);

  // Check pity
  const wasPity =
    (rarity === 'epic' && pity.epicPity >= EPIC_PITY_THRESHOLD - 1) ||
    (rarity === 'legendary' && pity.legendaryPity >= LEGENDARY_PITY_THRESHOLD - 1);

  // Update pity counters
  pity.totalPulls++;
  const pullNumber = pity.totalPulls;

  if (rarity === 'epic' || rarity === 'legendary' || rarity === 'mythic') {
    pity.epicPity = 0;
    pity.lastEpicPull = pity.totalPulls;
  } else {
    pity.epicPity++;
  }

  if (rarity === 'legendary' || rarity === 'mythic') {
    pity.legendaryPity = 0;
    pity.lastLegendaryPull = pity.totalPulls;
  } else {
    pity.legendaryPity++;
  }

  updatePity(pity);

  // Record pull
  const pullId = uuidv4();
  gachaQueries.recordPull.run(
    pullId,
    userId,
    boxType,
    bannerId,
    item.id,
    item.rarity,
    isFeatured ? 1 : 0,
    pullNumber,
    wasPity ? 1 : 0
  );

  // Grant item
  grantItem(userId, item);

  return { item, isFeatured, wasPity, pullNumber };
}

// ============ API ROUTES ============

// GET /api/gacha/rates - Get drop rates (legal compliance)
router.get('/rates', (req: AuthRequest, res: Response) => {
  try {
    const region = req.query.region as string;
    const boxType = (req.query.boxType as BoxType) || 'rare';

    const rates = BASE_DROP_RATES[boxType];
    const showDetailed = REGULATED_REGIONS.includes(region);

    res.json({
      boxType,
      rates: {
        common: `${rates.common}%`,
        rare: `${rates.rare}%`,
        epic: `${rates.epic}%`,
        legendary: `${rates.legendary}%`,
        mythic: `${rates.mythic}%`,
      },
      pitySystem: {
        epicGuarantee: EPIC_PITY_THRESHOLD,
        legendaryGuarantee: LEGENDARY_PITY_THRESHOLD,
        description: showDetailed
          ? `Guaranteed Epic item within ${EPIC_PITY_THRESHOLD} pulls. Guaranteed Legendary item within ${LEGENDARY_PITY_THRESHOLD} pulls. Soft pity increases rates after 7 and 40 pulls respectively.`
          : 'Pity system ensures rare drops within guaranteed pull counts.',
      },
      showDetailedOdds: showDetailed,
      disclaimer:
        'These rates apply to the random selection process. Individual results may vary.',
    });
  } catch (error) {
    console.error('Get rates error:', error);
    res.status(500).json({ error: 'Failed to get rates' });
  }
});

// GET /api/gacha/banners - Get active banners
router.get('/banners', (req: AuthRequest, res: Response) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const banners = gachaQueries.getActiveBanners.all(now, now) as Array<{
      id: string;
      name: string;
      description: string;
      start_date: number;
      end_date: number;
      featured_items: string;
      rate_up_multiplier: number;
      image_key: string;
    }>;

    res.json({
      banners: banners.map(b => ({
        id: b.id,
        name: b.name,
        description: b.description,
        startDate: b.start_date,
        endDate: b.end_date,
        timeRemaining: b.end_date - now,
        featuredItems: JSON.parse(b.featured_items),
        rateUpMultiplier: b.rate_up_multiplier,
        imageKey: b.image_key,
      })),
    });
  } catch (error) {
    console.error('Get banners error:', error);
    res.status(500).json({ error: 'Failed to get banners' });
  }
});

// GET /api/gacha/pity - Get player pity status
router.get('/pity', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const pity = getPlayerPity(req.user.id);

    res.json({
      epicPity: pity.epicPity,
      epicGuarantee: EPIC_PITY_THRESHOLD,
      epicPullsRemaining: Math.max(0, EPIC_PITY_THRESHOLD - pity.epicPity),
      legendaryPity: pity.legendaryPity,
      legendaryGuarantee: LEGENDARY_PITY_THRESHOLD,
      legendaryPullsRemaining: Math.max(0, LEGENDARY_PITY_THRESHOLD - pity.legendaryPity),
      totalPulls: pity.totalPulls,
    });
  } catch (error) {
    console.error('Get pity error:', error);
    res.status(500).json({ error: 'Failed to get pity status' });
  }
});

// GET /api/gacha/costs - Get box costs
router.get('/costs', (_req: AuthRequest, res: Response) => {
  try {
    const costs = Object.entries(BOX_COSTS).map(([boxType, cost]) => ({
      boxType,
      ...(cost === 'free_daily'
        ? { isFreeDaily: true, cost: null }
        : { isFreeDaily: false, cost }),
      multiPullCount: MULTI_PULL_COUNT,
      multiPullDiscount: `${(1 - MULTI_PULL_DISCOUNT) * 100}%`,
    }));

    res.json({ costs });
  } catch (error) {
    console.error('Get costs error:', error);
    res.status(500).json({ error: 'Failed to get costs' });
  }
});

// GET /api/gacha/daily-free - Check daily free box status
router.get('/daily-free', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const today = getTodayDate();
    const claimed = gachaQueries.checkDailyFree.get(req.user.id, 'common', today);

    res.json({
      available: !claimed,
      boxType: 'common',
      resetTime: new Date(new Date().setUTCHours(24, 0, 0, 0)).toISOString(),
    });
  } catch (error) {
    console.error('Get daily free error:', error);
    res.status(500).json({ error: 'Failed to get daily free status' });
  }
});

// POST /api/gacha/pull - Perform a single pull
router.post('/pull', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { boxType, bannerId, useFreePull } = req.body as {
      boxType: BoxType;
      bannerId?: string;
      useFreePull?: boolean;
    };

    if (!boxType || !['common', 'rare', 'epic', 'legendary'].includes(boxType)) {
      res.status(400).json({ error: 'Invalid box type' });
      return;
    }

    // Check for free daily pull
    if (useFreePull && boxType === 'common') {
      const today = getTodayDate();
      const claimed = gachaQueries.checkDailyFree.get(req.user.id, 'common', today);

      if (claimed) {
        res.status(400).json({ error: 'Daily free pull already claimed' });
        return;
      }

      // Claim daily free
      gachaQueries.claimDailyFree.run(req.user.id, 'common', today);
    } else {
      // Check and deduct currency
      const cost = BOX_COSTS[boxType];
      if (cost === 'free_daily') {
        res.status(400).json({ error: 'Use useFreePull flag for free boxes' });
        return;
      }

      const result = spendCurrency(
        req.user.id,
        cost.type,
        cost.amount,
        `Gacha pull: ${boxType} box`,
        'gacha_pull'
      );

      if (!result.success) {
        res.status(400).json({ error: result.error || 'Insufficient currency' });
        return;
      }
    }

    // Perform pull
    const pullResult = performPull(req.user.id, boxType, bannerId || null);

    // Get updated currencies and pity
    const currencies = getPlayerCurrencies(req.user.id);
    const pity = getPlayerPity(req.user.id);

    res.json({
      success: true,
      pull: {
        item: pullResult.item,
        isFeatured: pullResult.isFeatured,
        wasPity: pullResult.wasPity,
        pullNumber: pullResult.pullNumber,
      },
      pity: {
        epicPity: pity.epicPity,
        epicPullsRemaining: Math.max(0, EPIC_PITY_THRESHOLD - pity.epicPity),
        legendaryPity: pity.legendaryPity,
        legendaryPullsRemaining: Math.max(0, LEGENDARY_PITY_THRESHOLD - pity.legendaryPity),
      },
      currencies: {
        gems: currencies.gems,
        coins: currencies.coins,
        crystals: currencies.crystals,
      },
    });
  } catch (error) {
    console.error('Pull error:', error);
    res.status(500).json({ error: 'Failed to perform pull' });
  }
});

// POST /api/gacha/multi-pull - Perform 10 pulls
router.post('/multi-pull', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { boxType, bannerId } = req.body as {
      boxType: BoxType;
      bannerId?: string;
    };

    if (!boxType || !['common', 'rare', 'epic', 'legendary'].includes(boxType)) {
      res.status(400).json({ error: 'Invalid box type' });
      return;
    }

    // Calculate discounted cost
    const baseCost = BOX_COSTS[boxType];
    if (baseCost === 'free_daily') {
      res.status(400).json({ error: 'Cannot multi-pull free boxes' });
      return;
    }

    const totalCost = Math.floor(baseCost.amount * MULTI_PULL_COUNT * MULTI_PULL_DISCOUNT);

    // Check and deduct currency
    const result = spendCurrency(
      req.user.id,
      baseCost.type,
      totalCost,
      `Gacha multi-pull: ${MULTI_PULL_COUNT}x ${boxType} box`,
      'gacha_multi_pull'
    );

    if (!result.success) {
      res.status(400).json({ error: result.error || 'Insufficient currency' });
      return;
    }

    // Perform 10 pulls
    const pulls: Array<{
      item: GachaItem;
      isFeatured: boolean;
      wasPity: boolean;
      pullNumber: number;
    }> = [];

    for (let i = 0; i < MULTI_PULL_COUNT; i++) {
      const pullResult = performPull(req.user.id, boxType, bannerId || null);
      pulls.push(pullResult);
    }

    // Get updated currencies and pity
    const currencies = getPlayerCurrencies(req.user.id);
    const pity = getPlayerPity(req.user.id);

    // Summary
    const summary = {
      total: pulls.length,
      byRarity: {} as Record<ItemRarity, number>,
      featured: pulls.filter(p => p.isFeatured).length,
      pityTriggers: pulls.filter(p => p.wasPity).length,
    };

    for (const pull of pulls) {
      summary.byRarity[pull.item.rarity] = (summary.byRarity[pull.item.rarity] || 0) + 1;
    }

    res.json({
      success: true,
      pulls: pulls.map(p => ({
        item: p.item,
        isFeatured: p.isFeatured,
        wasPity: p.wasPity,
        pullNumber: p.pullNumber,
      })),
      summary,
      pity: {
        epicPity: pity.epicPity,
        epicPullsRemaining: Math.max(0, EPIC_PITY_THRESHOLD - pity.epicPity),
        legendaryPity: pity.legendaryPity,
        legendaryPullsRemaining: Math.max(0, LEGENDARY_PITY_THRESHOLD - pity.legendaryPity),
      },
      currencies: {
        gems: currencies.gems,
        coins: currencies.coins,
        crystals: currencies.crystals,
      },
      costPaid: totalCost,
      costSaved: baseCost.amount * MULTI_PULL_COUNT - totalCost,
    });
  } catch (error) {
    console.error('Multi-pull error:', error);
    res.status(500).json({ error: 'Failed to perform multi-pull' });
  }
});

// GET /api/gacha/history - Get pull history
router.get('/history', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const history = gachaQueries.getPullHistory.all(req.user.id, limit) as Array<{
      id: string;
      box_type: string;
      banner_id: string;
      item_id: string;
      item_rarity: string;
      item_name: string;
      item_type: string;
      image_key: string;
      is_featured: number;
      pull_number: number;
      was_pity: number;
      created_at: number;
    }>;

    const stats = gachaQueries.countPullsByRarity.all(req.user.id) as Array<{
      item_rarity: string;
      count: number;
    }>;

    res.json({
      history: history.map(h => ({
        id: h.id,
        boxType: h.box_type,
        bannerId: h.banner_id,
        item: {
          id: h.item_id,
          name: h.item_name,
          type: h.item_type,
          rarity: h.item_rarity,
          imageKey: h.image_key,
        },
        isFeatured: h.is_featured === 1,
        pullNumber: h.pull_number,
        wasPity: h.was_pity === 1,
        createdAt: h.created_at,
      })),
      stats: {
        totalPulls: stats.reduce((sum, s) => sum + s.count, 0),
        byRarity: Object.fromEntries(stats.map(s => [s.item_rarity, s.count])),
      },
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to get pull history' });
  }
});

// GET /api/gacha/items - Get all gacha items (for showcasing)
router.get('/items', (_req: AuthRequest, res: Response) => {
  try {
    const items = gachaQueries.getAllItems.all() as Array<{
      id: string;
      name: string;
      type: string;
      rarity: string;
      image_key: string;
    }>;

    // Group by rarity
    const grouped: Record<string, typeof items> = {
      mythic: [],
      legendary: [],
      epic: [],
      rare: [],
      common: [],
    };

    for (const item of items) {
      if (grouped[item.rarity]) {
        grouped[item.rarity].push(item);
      }
    }

    res.json({
      items: items.map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        rarity: i.rarity,
        imageKey: i.image_key,
      })),
      grouped,
      totalCount: items.length,
    });
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ error: 'Failed to get items' });
  }
});

export { router as gachaRouter, initGachaTables };
