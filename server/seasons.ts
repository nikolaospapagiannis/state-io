import { Router, Response } from 'express';
import { db } from './database';
import { AuthRequest } from './auth';
import { Division, DIVISIONS, softResetForNewSeason } from './rankings';

const router = Router();

// ============ TYPES ============

export interface Season {
  id: number;
  name: string;
  theme: SeasonTheme;
  startDate: number;
  endDate: number;
  config: SeasonConfig;
  status: SeasonStatus;
}

export type SeasonTheme =
  | 'default'
  | 'winter'
  | 'spring'
  | 'summer'
  | 'autumn'
  | 'neon'
  | 'galactic'
  | 'inferno'
  | 'ocean'
  | 'shadow';

export type SeasonStatus = 'upcoming' | 'active' | 'ended';

export interface SeasonConfig {
  durationDays: number;
  bonusXp: number; // Percentage bonus XP
  specialRules: SeasonRule[];
  passLevels: number;
  passXpPerLevel: number;
}

export interface SeasonRule {
  id: string;
  name: string;
  description: string;
  effect: Record<string, number>;
}

export interface SeasonReward {
  id: number;
  seasonId: number;
  rankTier: Division;
  rewards: RewardItem[];
}

export interface RewardItem {
  type: 'currency' | 'skin' | 'frame' | 'title' | 'emote' | 'xp' | 'chest';
  itemId?: string;
  amount: number;
  name: string;
  rarity?: string;
}

export interface SeasonPass {
  level: number;
  xp: number;
  freeReward: RewardItem | null;
  premiumReward: RewardItem | null;
}

export interface PlayerSeasonProgress {
  playerId: string;
  seasonId: number;
  passLevel: number;
  passXp: number;
  hasPremium: boolean;
  claimedFreeRewards: number[];
  claimedPremiumRewards: number[];
  totalXpEarned: number;
  gamesPlayed: number;
}

// ============ SEASON CONFIGURATION ============

const SEASON_DURATION_DAYS = 50;

const SEASON_THEMES: Record<SeasonTheme, { name: string; colors: string[]; icon: string }> = {
  default: { name: 'Classic', colors: ['#00f5ff', '#ff3366'], icon: 'star' },
  winter: { name: 'Frozen Realm', colors: ['#a5f3fc', '#0891b2'], icon: 'snowflake' },
  spring: { name: 'Bloom Season', colors: ['#86efac', '#f472b6'], icon: 'flower' },
  summer: { name: 'Solar Flare', colors: ['#fbbf24', '#f97316'], icon: 'sun' },
  autumn: { name: 'Harvest Moon', colors: ['#f59e0b', '#dc2626'], icon: 'leaf' },
  neon: { name: 'Cyberpunk', colors: ['#e879f9', '#22d3ee'], icon: 'zap' },
  galactic: { name: 'Cosmic Conquest', colors: ['#8b5cf6', '#06b6d4'], icon: 'galaxy' },
  inferno: { name: 'Infernal War', colors: ['#ef4444', '#f97316'], icon: 'flame' },
  ocean: { name: 'Depths of Abyss', colors: ['#0ea5e9', '#3b82f6'], icon: 'wave' },
  shadow: { name: 'Shadow Realm', colors: ['#6b7280', '#1f2937'], icon: 'moon' },
};

// Season pass rewards (50 levels)
function generateSeasonPassRewards(theme: SeasonTheme): SeasonPass[] {
  const rewards: SeasonPass[] = [];

  for (let level = 1; level <= 50; level++) {
    const pass: SeasonPass = {
      level,
      xp: level * 1000 + (level > 25 ? (level - 25) * 500 : 0),
      freeReward: null,
      premiumReward: null,
    };

    // Free rewards at certain levels
    if (level % 5 === 0) {
      if (level === 50) {
        pass.freeReward = { type: 'skin', itemId: `season_${theme}_free`, amount: 1, name: `${SEASON_THEMES[theme].name} Badge`, rarity: 'rare' };
      } else if (level % 10 === 0) {
        pass.freeReward = { type: 'chest', itemId: 'rare_chest', amount: 1, name: 'Rare Chest' };
      } else {
        pass.freeReward = { type: 'currency', amount: 500, name: 'Gold' };
      }
    } else if (level % 3 === 0) {
      pass.freeReward = { type: 'xp', amount: 100, name: 'Bonus XP' };
    }

    // Premium rewards at every level
    if (level === 1) {
      pass.premiumReward = { type: 'skin', itemId: `season_${theme}_avatar`, amount: 1, name: `${SEASON_THEMES[theme].name} Avatar Frame`, rarity: 'epic' };
    } else if (level === 25) {
      pass.premiumReward = { type: 'skin', itemId: `season_${theme}_troop`, amount: 1, name: `${SEASON_THEMES[theme].name} Troop Skin`, rarity: 'epic' };
    } else if (level === 50) {
      pass.premiumReward = { type: 'skin', itemId: `season_${theme}_legendary`, amount: 1, name: `${SEASON_THEMES[theme].name} Legendary Skin`, rarity: 'legendary' };
    } else if (level % 10 === 0) {
      pass.premiumReward = { type: 'chest', itemId: 'epic_chest', amount: 1, name: 'Epic Chest' };
    } else if (level % 5 === 0) {
      pass.premiumReward = { type: 'currency', amount: 200, name: 'Gems' };
    } else if (level % 2 === 0) {
      pass.premiumReward = { type: 'currency', amount: 1000, name: 'Gold' };
    } else {
      pass.premiumReward = { type: 'xp', amount: 250, name: 'Bonus XP' };
    }

    rewards.push(pass);
  }

  return rewards;
}

// End of season rewards by rank
function getSeasonRewardsByRank(division: Division): RewardItem[] {
  const rewards: RewardItem[] = [];

  // Base gold reward
  const goldByDivision: Record<Division, number> = {
    bronze: 100,
    silver: 250,
    gold: 500,
    platinum: 1000,
    diamond: 2000,
    master: 3500,
    grandmaster: 5000,
    legend: 7500,
    mythic: 10000,
  };

  rewards.push({
    type: 'currency',
    amount: goldByDivision[division],
    name: 'Season Gold',
  });

  // Rank badge/frame
  rewards.push({
    type: 'frame',
    itemId: `rank_frame_${division}`,
    amount: 1,
    name: `${division.charAt(0).toUpperCase() + division.slice(1)} Season Frame`,
    rarity: getDivisionRarity(division),
  });

  // Additional rewards for higher ranks
  if (['diamond', 'master', 'grandmaster', 'legend', 'mythic'].includes(division)) {
    rewards.push({
      type: 'title',
      itemId: `title_season_${division}`,
      amount: 1,
      name: `Season ${division.charAt(0).toUpperCase() + division.slice(1)}`,
    });
  }

  if (['master', 'grandmaster', 'legend', 'mythic'].includes(division)) {
    rewards.push({
      type: 'skin',
      itemId: `rank_skin_${division}`,
      amount: 1,
      name: `${division.charAt(0).toUpperCase() + division.slice(1)} Exclusive Skin`,
      rarity: getDivisionRarity(division),
    });
  }

  if (['grandmaster', 'legend', 'mythic'].includes(division)) {
    rewards.push({
      type: 'emote',
      itemId: `emote_${division}`,
      amount: 1,
      name: `${division.charAt(0).toUpperCase() + division.slice(1)} Emote`,
    });
  }

  if (division === 'mythic') {
    rewards.push({
      type: 'chest',
      itemId: 'legendary_chest',
      amount: 3,
      name: 'Legendary Chest',
    });
  }

  return rewards;
}

function getDivisionRarity(division: Division): string {
  const rarityMap: Record<Division, string> = {
    bronze: 'common',
    silver: 'common',
    gold: 'rare',
    platinum: 'rare',
    diamond: 'epic',
    master: 'epic',
    grandmaster: 'legendary',
    legend: 'legendary',
    mythic: 'mythic',
  };
  return rarityMap[division];
}

// ============ DATABASE INITIALIZATION ============

export function initSeasonTables(): void {
  // Seasons table
  db.exec(`
    CREATE TABLE IF NOT EXISTS seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      theme TEXT NOT NULL,
      start_date INTEGER NOT NULL,
      end_date INTEGER NOT NULL,
      config TEXT NOT NULL,
      status TEXT DEFAULT 'upcoming'
    )
  `);

  // Season rewards by rank
  db.exec(`
    CREATE TABLE IF NOT EXISTS season_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL,
      rank_tier TEXT NOT NULL,
      rewards TEXT NOT NULL,
      UNIQUE(season_id, rank_tier),
      FOREIGN KEY (season_id) REFERENCES seasons(id)
    )
  `);

  // Season pass levels
  db.exec(`
    CREATE TABLE IF NOT EXISTS season_pass_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_id INTEGER NOT NULL,
      level INTEGER NOT NULL,
      xp_required INTEGER NOT NULL,
      free_reward TEXT,
      premium_reward TEXT,
      UNIQUE(season_id, level),
      FOREIGN KEY (season_id) REFERENCES seasons(id)
    )
  `);

  // Player season progress
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_season_progress (
      player_id TEXT NOT NULL,
      season_id INTEGER NOT NULL,
      pass_level INTEGER DEFAULT 1,
      pass_xp INTEGER DEFAULT 0,
      has_premium INTEGER DEFAULT 0,
      claimed_free_rewards TEXT DEFAULT '[]',
      claimed_premium_rewards TEXT DEFAULT '[]',
      total_xp_earned INTEGER DEFAULT 0,
      games_played INTEGER DEFAULT 0,
      PRIMARY KEY (player_id, season_id),
      FOREIGN KEY (player_id) REFERENCES users(id),
      FOREIGN KEY (season_id) REFERENCES seasons(id)
    )
  `);

  // Create indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_seasons_status ON seasons(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_season_progress_player ON player_season_progress(player_id)`);

  // Initialize first season if none exists
  initializeFirstSeason();

  console.log('Season tables initialized');
}

function initializeFirstSeason(): void {
  const existingSeason = db.prepare(`SELECT * FROM seasons LIMIT 1`).get();
  if (existingSeason) return;

  const now = Math.floor(Date.now() / 1000);
  const endDate = now + (SEASON_DURATION_DAYS * 24 * 60 * 60);

  const config: SeasonConfig = {
    durationDays: SEASON_DURATION_DAYS,
    bonusXp: 0,
    specialRules: [],
    passLevels: 50,
    passXpPerLevel: 1000,
  };

  const seasonId = db.prepare(`
    INSERT INTO seasons (name, theme, start_date, end_date, config, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('Season 1', 'default', now, endDate, JSON.stringify(config), 'active').lastInsertRowid as number;

  // Add season rewards for each division
  for (const division of DIVISIONS) {
    const rewards = getSeasonRewardsByRank(division.id);
    db.prepare(`
      INSERT INTO season_rewards (season_id, division, rewards)
      VALUES (?, ?, ?)
    `).run(seasonId, division.id, JSON.stringify(rewards));
  }

  // Add season pass levels
  const passRewards = generateSeasonPassRewards('default');
  for (const pass of passRewards) {
    db.prepare(`
      INSERT INTO season_pass_levels (season_id, level, xp_required, free_reward, premium_reward)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      seasonId,
      pass.level,
      pass.xp,
      pass.freeReward ? JSON.stringify(pass.freeReward) : null,
      pass.premiumReward ? JSON.stringify(pass.premiumReward) : null
    );
  }

  console.log(`Season 1 initialized with ${passRewards.length} pass levels`);
}

// Initialize tables immediately
initSeasonTables();

// ============ QUERIES ============

export const seasonQueries = {
  getCurrentSeason: db.prepare(`SELECT * FROM seasons WHERE status = 'active' LIMIT 1`),

  getSeasonById: db.prepare(`SELECT * FROM seasons WHERE id = ?`),

  getAllSeasons: db.prepare(`SELECT * FROM seasons ORDER BY id DESC`),

  getSeasonRewards: db.prepare(`SELECT * FROM season_rewards WHERE season_id = ?`),

  getSeasonRewardsByRank: db.prepare(`SELECT * FROM season_rewards WHERE season_id = ? AND division = ?`),

  getSeasonPassLevels: db.prepare(`SELECT * FROM season_pass_levels WHERE season_id = ? ORDER BY level`),

  getPlayerProgress: db.prepare(`SELECT * FROM player_season_progress WHERE player_id = ? AND season_id = ?`),

  upsertPlayerProgress: db.prepare(`
    INSERT INTO player_season_progress (player_id, season_id, pass_level, pass_xp, has_premium, claimed_free_rewards, claimed_premium_rewards, total_xp_earned, games_played)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id, season_id) DO UPDATE SET
      pass_level = ?,
      pass_xp = ?,
      has_premium = ?,
      claimed_free_rewards = ?,
      claimed_premium_rewards = ?,
      total_xp_earned = ?,
      games_played = ?
  `),

  updateSeasonStatus: db.prepare(`UPDATE seasons SET status = ? WHERE id = ?`),

  createSeason: db.prepare(`
    INSERT INTO seasons (name, theme, start_date, end_date, config, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
};

// ============ SEASON MANAGEMENT ============

export function getCurrentSeason(): Season | null {
  const row = seasonQueries.getCurrentSeason.get() as {
    id: number;
    name: string;
    theme: SeasonTheme;
    start_date: number;
    end_date: number;
    config: string;
    status: SeasonStatus;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    theme: row.theme,
    startDate: row.start_date,
    endDate: row.end_date,
    config: JSON.parse(row.config),
    status: row.status,
  };
}

export function checkSeasonTransition(): { ended: Season | null; started: Season | null } {
  const now = Math.floor(Date.now() / 1000);
  const currentSeason = getCurrentSeason();

  if (!currentSeason) {
    // No active season, create one
    const newSeason = createNewSeason();
    return { ended: null, started: newSeason };
  }

  if (now >= currentSeason.endDate) {
    // End current season
    seasonQueries.updateSeasonStatus.run('ended', currentSeason.id);

    // Perform soft reset for rankings
    softResetForNewSeason(currentSeason.id + 1);

    // Create new season
    const newSeason = createNewSeason();

    return { ended: currentSeason, started: newSeason };
  }

  return { ended: null, started: null };
}

function createNewSeason(): Season {
  const now = Math.floor(Date.now() / 1000);
  const endDate = now + (SEASON_DURATION_DAYS * 24 * 60 * 60);

  // Get next season number
  const lastSeason = db.prepare(`SELECT MAX(id) as max_id FROM seasons`).get() as { max_id: number } | undefined;
  const seasonNum = (lastSeason?.max_id || 0) + 1;

  // Pick a theme
  const themes: SeasonTheme[] = ['neon', 'galactic', 'inferno', 'ocean', 'shadow', 'winter', 'spring', 'summer', 'autumn'];
  const theme = themes[(seasonNum - 1) % themes.length];

  const config: SeasonConfig = {
    durationDays: SEASON_DURATION_DAYS,
    bonusXp: 0,
    specialRules: [],
    passLevels: 50,
    passXpPerLevel: 1000,
  };

  const result = seasonQueries.createSeason.run(
    `Season ${seasonNum}`,
    theme,
    now,
    endDate,
    JSON.stringify(config),
    'active'
  );

  const seasonId = result.lastInsertRowid as number;

  // Add season rewards
  for (const division of DIVISIONS) {
    const rewards = getSeasonRewardsByRank(division.id);
    db.prepare(`
      INSERT INTO season_rewards (season_id, division, rewards)
      VALUES (?, ?, ?)
    `).run(seasonId, division.id, JSON.stringify(rewards));
  }

  // Add season pass levels
  const passRewards = generateSeasonPassRewards(theme);
  for (const pass of passRewards) {
    db.prepare(`
      INSERT INTO season_pass_levels (season_id, level, xp_required, free_reward, premium_reward)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      seasonId,
      pass.level,
      pass.xp,
      pass.freeReward ? JSON.stringify(pass.freeReward) : null,
      pass.premiumReward ? JSON.stringify(pass.premiumReward) : null
    );
  }

  return {
    id: seasonId,
    name: `Season ${seasonNum}`,
    theme,
    startDate: now,
    endDate,
    config,
    status: 'active',
  };
}

// ============ PLAYER PROGRESS ============

export function addSeasonXp(playerId: string, xpAmount: number): {
  leveledUp: boolean;
  newLevel: number;
  newXp: number;
  unlockedRewards: SeasonPass[];
} {
  const season = getCurrentSeason();
  if (!season) {
    return { leveledUp: false, newLevel: 1, newXp: 0, unlockedRewards: [] };
  }

  // Get or create player progress
  let progress = seasonQueries.getPlayerProgress.get(playerId, season.id) as {
    player_id: string;
    season_id: number;
    pass_level: number;
    pass_xp: number;
    has_premium: number;
    claimed_free_rewards: string;
    claimed_premium_rewards: string;
    total_xp_earned: number;
    games_played: number;
  } | undefined;

  if (!progress) {
    progress = {
      player_id: playerId,
      season_id: season.id,
      pass_level: 1,
      pass_xp: 0,
      has_premium: 0,
      claimed_free_rewards: '[]',
      claimed_premium_rewards: '[]',
      total_xp_earned: 0,
      games_played: 0,
    };
  }

  // Apply bonus XP from season config
  const bonusMultiplier = 1 + (season.config.bonusXp / 100);
  const totalXp = Math.round(xpAmount * bonusMultiplier);

  let newXp = progress.pass_xp + totalXp;
  let newLevel = progress.pass_level;
  let leveledUp = false;
  const unlockedRewards: SeasonPass[] = [];

  // Get pass levels
  const passLevels = seasonQueries.getSeasonPassLevels.all(season.id) as Array<{
    level: number;
    xp_required: number;
    free_reward: string | null;
    premium_reward: string | null;
  }>;

  // Check for level ups
  while (newLevel < 50) {
    const nextLevel = passLevels.find(l => l.level === newLevel + 1);
    if (!nextLevel) break;

    if (newXp >= nextLevel.xp_required) {
      newXp -= nextLevel.xp_required;
      newLevel++;
      leveledUp = true;

      unlockedRewards.push({
        level: newLevel,
        xp: nextLevel.xp_required,
        freeReward: nextLevel.free_reward ? JSON.parse(nextLevel.free_reward) : null,
        premiumReward: nextLevel.premium_reward ? JSON.parse(nextLevel.premium_reward) : null,
      });
    } else {
      break;
    }
  }

  // Cap XP at max level
  if (newLevel >= 50) {
    newXp = 0;
  }

  // Save progress
  seasonQueries.upsertPlayerProgress.run(
    playerId, season.id, newLevel, newXp, progress.has_premium,
    progress.claimed_free_rewards, progress.claimed_premium_rewards,
    progress.total_xp_earned + totalXp, progress.games_played,
    // Update values
    newLevel, newXp, progress.has_premium,
    progress.claimed_free_rewards, progress.claimed_premium_rewards,
    progress.total_xp_earned + totalXp, progress.games_played
  );

  return { leveledUp, newLevel, newXp, unlockedRewards };
}

export function claimSeasonReward(playerId: string, level: number, isPremium: boolean): RewardItem | null {
  const season = getCurrentSeason();
  if (!season) return null;

  const progress = seasonQueries.getPlayerProgress.get(playerId, season.id) as {
    pass_level: number;
    has_premium: number;
    claimed_free_rewards: string;
    claimed_premium_rewards: string;
    total_xp_earned: number;
    games_played: number;
  } | undefined;

  if (!progress) return null;

  // Check if level is unlocked
  if (progress.pass_level < level) return null;

  // Check premium access for premium rewards
  if (isPremium && !progress.has_premium) return null;

  // Check if already claimed
  const claimedRewards = JSON.parse(isPremium ? progress.claimed_premium_rewards : progress.claimed_free_rewards) as number[];
  if (claimedRewards.includes(level)) return null;

  // Get the reward
  const passLevel = db.prepare(`
    SELECT * FROM season_pass_levels WHERE season_id = ? AND level = ?
  `).get(season.id, level) as {
    free_reward: string | null;
    premium_reward: string | null;
  } | undefined;

  if (!passLevel) return null;

  const rewardJson = isPremium ? passLevel.premium_reward : passLevel.free_reward;
  if (!rewardJson) return null;

  const reward = JSON.parse(rewardJson) as RewardItem;

  // Mark as claimed
  claimedRewards.push(level);

  if (isPremium) {
    seasonQueries.upsertPlayerProgress.run(
      playerId, season.id, progress.pass_level, 0, progress.has_premium,
      progress.claimed_free_rewards, JSON.stringify(claimedRewards),
      progress.total_xp_earned, progress.games_played,
      progress.pass_level, 0, progress.has_premium,
      progress.claimed_free_rewards, JSON.stringify(claimedRewards),
      progress.total_xp_earned, progress.games_played
    );
  } else {
    seasonQueries.upsertPlayerProgress.run(
      playerId, season.id, progress.pass_level, 0, progress.has_premium,
      JSON.stringify(claimedRewards), progress.claimed_premium_rewards,
      progress.total_xp_earned, progress.games_played,
      progress.pass_level, 0, progress.has_premium,
      JSON.stringify(claimedRewards), progress.claimed_premium_rewards,
      progress.total_xp_earned, progress.games_played
    );
  }

  return reward;
}

// ============ API ROUTES ============

// Get current season
router.get('/current', (_req: AuthRequest, res: Response) => {
  try {
    // Check for season transition
    const transition = checkSeasonTransition();

    const season = getCurrentSeason();
    if (!season) {
      res.status(404).json({ error: 'No active season' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const themeConfig = SEASON_THEMES[season.theme];

    res.json({
      id: season.id,
      name: season.name,
      theme: season.theme,
      themeName: themeConfig.name,
      themeColors: themeConfig.colors,
      themeIcon: themeConfig.icon,
      startDate: season.startDate,
      endDate: season.endDate,
      daysRemaining: Math.max(0, Math.ceil((season.endDate - now) / (24 * 60 * 60))),
      config: season.config,
      status: season.status,
      justStarted: transition.started?.id === season.id,
    });
  } catch (error) {
    console.error('Get current season error:', error);
    res.status(500).json({ error: 'Failed to get current season' });
  }
});

// Get season by ID
router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const row = seasonQueries.getSeasonById.get(parseInt(id)) as {
      id: number;
      name: string;
      theme: SeasonTheme;
      start_date: number;
      end_date: number;
      config: string;
      status: SeasonStatus;
    } | undefined;

    if (!row) {
      res.status(404).json({ error: 'Season not found' });
      return;
    }

    const themeConfig = SEASON_THEMES[row.theme];

    res.json({
      id: row.id,
      name: row.name,
      theme: row.theme,
      themeName: themeConfig.name,
      themeColors: themeConfig.colors,
      themeIcon: themeConfig.icon,
      startDate: row.start_date,
      endDate: row.end_date,
      config: JSON.parse(row.config),
      status: row.status,
    });
  } catch (error) {
    console.error('Get season error:', error);
    res.status(500).json({ error: 'Failed to get season' });
  }
});

// Get season rewards by rank
router.get('/:id/rewards', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const rewards = seasonQueries.getSeasonRewards.all(parseInt(id)) as Array<{
      id: number;
      season_id: number;
      rank_tier: Division;
      rewards: string;
    }>;

    res.json({
      rewards: rewards.map(r => ({
        rankTier: r.rank_tier,
        rankName: DIVISIONS.find(d => d.id === r.rank_tier)?.name || r.rank_tier,
        items: JSON.parse(r.rewards),
      })),
    });
  } catch (error) {
    console.error('Get season rewards error:', error);
    res.status(500).json({ error: 'Failed to get season rewards' });
  }
});

// Get season pass levels
router.get('/:id/pass', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const levels = seasonQueries.getSeasonPassLevels.all(parseInt(id)) as Array<{
      level: number;
      xp_required: number;
      free_reward: string | null;
      premium_reward: string | null;
    }>;

    res.json({
      levels: levels.map(l => ({
        level: l.level,
        xpRequired: l.xp_required,
        freeReward: l.free_reward ? JSON.parse(l.free_reward) : null,
        premiumReward: l.premium_reward ? JSON.parse(l.premium_reward) : null,
      })),
    });
  } catch (error) {
    console.error('Get season pass error:', error);
    res.status(500).json({ error: 'Failed to get season pass' });
  }
});

// Get player season progress
router.get('/progress/:playerId', (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    const season = getCurrentSeason();
    if (!season) {
      res.status(404).json({ error: 'No active season' });
      return;
    }

    const progress = seasonQueries.getPlayerProgress.get(playerId, season.id) as {
      pass_level: number;
      pass_xp: number;
      has_premium: number;
      claimed_free_rewards: string;
      claimed_premium_rewards: string;
      total_xp_earned: number;
      games_played: number;
    } | undefined;

    if (!progress) {
      res.json({
        seasonId: season.id,
        passLevel: 1,
        passXp: 0,
        hasPremium: false,
        claimedFreeRewards: [],
        claimedPremiumRewards: [],
        totalXpEarned: 0,
        gamesPlayed: 0,
        xpToNextLevel: 1000,
      });
      return;
    }

    // Get XP for next level
    const nextLevel = db.prepare(`
      SELECT xp_required FROM season_pass_levels WHERE season_id = ? AND level = ?
    `).get(season.id, progress.pass_level + 1) as { xp_required: number } | undefined;

    res.json({
      seasonId: season.id,
      passLevel: progress.pass_level,
      passXp: progress.pass_xp,
      hasPremium: progress.has_premium === 1,
      claimedFreeRewards: JSON.parse(progress.claimed_free_rewards),
      claimedPremiumRewards: JSON.parse(progress.claimed_premium_rewards),
      totalXpEarned: progress.total_xp_earned,
      gamesPlayed: progress.games_played,
      xpToNextLevel: nextLevel?.xp_required || 0,
    });
  } catch (error) {
    console.error('Get player progress error:', error);
    res.status(500).json({ error: 'Failed to get player progress' });
  }
});

// Claim season pass reward
router.post('/claim', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { level, isPremium } = req.body as { level: number; isPremium: boolean };

    const reward = claimSeasonReward(req.user.id, level, isPremium);

    if (!reward) {
      res.status(400).json({ error: 'Cannot claim reward' });
      return;
    }

    res.json({
      success: true,
      reward,
    });
  } catch (error) {
    console.error('Claim reward error:', error);
    res.status(500).json({ error: 'Failed to claim reward' });
  }
});

// Get all seasons history
router.get('/', (_req: AuthRequest, res: Response) => {
  try {
    const seasons = seasonQueries.getAllSeasons.all() as Array<{
      id: number;
      name: string;
      theme: SeasonTheme;
      start_date: number;
      end_date: number;
      config: string;
      status: SeasonStatus;
    }>;

    res.json({
      seasons: seasons.map(s => ({
        id: s.id,
        name: s.name,
        theme: s.theme,
        themeName: SEASON_THEMES[s.theme].name,
        startDate: s.start_date,
        endDate: s.end_date,
        status: s.status,
      })),
    });
  } catch (error) {
    console.error('Get seasons error:', error);
    res.status(500).json({ error: 'Failed to get seasons' });
  }
});

export { router as seasonRouter };
