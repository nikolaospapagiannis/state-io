import { Router, Response } from 'express';
import { db } from './database';
import { AuthRequest } from './auth';

const router = Router();

// ============ TYPES ============

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  points: number;
  hidden: boolean;
  criteria: AchievementCriteria;
  icon: string;
  tier: number; // 1 = bronze, 2 = silver, 3 = gold, 4 = platinum
}

export type AchievementCategory =
  | 'combat'
  | 'collection'
  | 'social'
  | 'progression'
  | 'mastery'
  | 'special';

export interface AchievementCriteria {
  type: string;
  target: number;
  condition?: Record<string, unknown>;
}

export interface PlayerAchievement {
  playerId: string;
  achievementId: string;
  unlockedAt: number | null;
  progress: number;
}

// ============ ACHIEVEMENT DEFINITIONS (50+) ============

export const ACHIEVEMENTS: Achievement[] = [
  // ============ COMBAT ACHIEVEMENTS (15) ============
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Win your first battle',
    category: 'combat',
    points: 10,
    hidden: false,
    criteria: { type: 'wins', target: 1 },
    icon: 'sword',
    tier: 1,
  },
  {
    id: 'winning_streak_3',
    name: 'On a Roll',
    description: 'Win 3 games in a row',
    category: 'combat',
    points: 25,
    hidden: false,
    criteria: { type: 'win_streak', target: 3 },
    icon: 'fire',
    tier: 1,
  },
  {
    id: 'winning_streak_5',
    name: 'Unstoppable',
    description: 'Win 5 games in a row',
    category: 'combat',
    points: 50,
    hidden: false,
    criteria: { type: 'win_streak', target: 5 },
    icon: 'fire',
    tier: 2,
  },
  {
    id: 'winning_streak_10',
    name: 'Dominator',
    description: 'Win 10 games in a row',
    category: 'combat',
    points: 100,
    hidden: false,
    criteria: { type: 'win_streak', target: 10 },
    icon: 'crown',
    tier: 3,
  },
  {
    id: 'total_victories_10',
    name: 'Rising Warrior',
    description: 'Win 10 total games',
    category: 'combat',
    points: 20,
    hidden: false,
    criteria: { type: 'wins', target: 10 },
    icon: 'trophy',
    tier: 1,
  },
  {
    id: 'total_victories_50',
    name: 'Veteran Fighter',
    description: 'Win 50 total games',
    category: 'combat',
    points: 50,
    hidden: false,
    criteria: { type: 'wins', target: 50 },
    icon: 'trophy',
    tier: 2,
  },
  {
    id: 'total_victories_100',
    name: 'Centurion',
    description: 'Win 100 total games',
    category: 'combat',
    points: 100,
    hidden: false,
    criteria: { type: 'wins', target: 100 },
    icon: 'shield',
    tier: 3,
  },
  {
    id: 'total_victories_500',
    name: 'Legendary Commander',
    description: 'Win 500 total games',
    category: 'combat',
    points: 250,
    hidden: false,
    criteria: { type: 'wins', target: 500 },
    icon: 'star',
    tier: 4,
  },
  {
    id: 'total_victories_1000',
    name: 'Immortal Conqueror',
    description: 'Win 1000 total games',
    category: 'combat',
    points: 500,
    hidden: true,
    criteria: { type: 'wins', target: 1000 },
    icon: 'diamond',
    tier: 4,
  },
  {
    id: 'quick_victory',
    name: 'Blitzkrieg',
    description: 'Win a game in under 60 seconds',
    category: 'combat',
    points: 50,
    hidden: false,
    criteria: { type: 'fast_win', target: 60 },
    icon: 'lightning',
    tier: 2,
  },
  {
    id: 'flawless_victory',
    name: 'Flawless Victory',
    description: 'Win without losing any territory',
    category: 'combat',
    points: 75,
    hidden: false,
    criteria: { type: 'flawless', target: 1 },
    icon: 'gem',
    tier: 3,
  },
  {
    id: 'comeback_king',
    name: 'Comeback King',
    description: 'Win after being down to 1 territory',
    category: 'combat',
    points: 100,
    hidden: false,
    criteria: { type: 'comeback', target: 1 },
    icon: 'phoenix',
    tier: 3,
  },
  {
    id: 'territory_capture_100',
    name: 'Territory Hunter',
    description: 'Capture 100 territories total',
    category: 'combat',
    points: 30,
    hidden: false,
    criteria: { type: 'territories_captured', target: 100 },
    icon: 'map',
    tier: 1,
  },
  {
    id: 'territory_capture_1000',
    name: 'Empire Builder',
    description: 'Capture 1000 territories total',
    category: 'combat',
    points: 100,
    hidden: false,
    criteria: { type: 'territories_captured', target: 1000 },
    icon: 'castle',
    tier: 3,
  },
  {
    id: 'troops_sent_10000',
    name: 'Army Commander',
    description: 'Send 10,000 troops into battle',
    category: 'combat',
    points: 40,
    hidden: false,
    criteria: { type: 'troops_sent', target: 10000 },
    icon: 'soldiers',
    tier: 2,
  },

  // ============ COLLECTION ACHIEVEMENTS (10) ============
  {
    id: 'first_skin',
    name: 'Fashion Forward',
    description: 'Unlock your first skin',
    category: 'collection',
    points: 10,
    hidden: false,
    criteria: { type: 'skins_owned', target: 1 },
    icon: 'palette',
    tier: 1,
  },
  {
    id: 'skin_collector_10',
    name: 'Skin Collector',
    description: 'Own 10 different skins',
    category: 'collection',
    points: 50,
    hidden: false,
    criteria: { type: 'skins_owned', target: 10 },
    icon: 'wardrobe',
    tier: 2,
  },
  {
    id: 'skin_collector_25',
    name: 'Fashionista',
    description: 'Own 25 different skins',
    category: 'collection',
    points: 100,
    hidden: false,
    criteria: { type: 'skins_owned', target: 25 },
    icon: 'sparkles',
    tier: 3,
  },
  {
    id: 'rare_collector',
    name: 'Rare Find',
    description: 'Own a rare skin',
    category: 'collection',
    points: 30,
    hidden: false,
    criteria: { type: 'rarity_owned', target: 1, condition: { rarity: 'rare' } },
    icon: 'gem_blue',
    tier: 2,
  },
  {
    id: 'epic_collector',
    name: 'Epic Discovery',
    description: 'Own an epic skin',
    category: 'collection',
    points: 50,
    hidden: false,
    criteria: { type: 'rarity_owned', target: 1, condition: { rarity: 'epic' } },
    icon: 'gem_purple',
    tier: 2,
  },
  {
    id: 'legendary_collector',
    name: 'Legendary Hunter',
    description: 'Own a legendary skin',
    category: 'collection',
    points: 100,
    hidden: false,
    criteria: { type: 'rarity_owned', target: 1, condition: { rarity: 'legendary' } },
    icon: 'gem_gold',
    tier: 3,
  },
  {
    id: 'mythic_collector',
    name: 'Mythic Master',
    description: 'Own a mythic skin',
    category: 'collection',
    points: 200,
    hidden: true,
    criteria: { type: 'rarity_owned', target: 1, condition: { rarity: 'mythic' } },
    icon: 'gem_rainbow',
    tier: 4,
  },
  {
    id: 'complete_set',
    name: 'Set Completionist',
    description: 'Complete a collection set',
    category: 'collection',
    points: 75,
    hidden: false,
    criteria: { type: 'sets_completed', target: 1 },
    icon: 'collection',
    tier: 3,
  },
  {
    id: 'territory_theme',
    name: 'Interior Designer',
    description: 'Unlock 5 territory themes',
    category: 'collection',
    points: 40,
    hidden: false,
    criteria: { type: 'themes_owned', target: 5 },
    icon: 'paint',
    tier: 2,
  },
  {
    id: 'avatar_frames',
    name: 'Frame Collector',
    description: 'Unlock 10 avatar frames',
    category: 'collection',
    points: 50,
    hidden: false,
    criteria: { type: 'frames_owned', target: 10 },
    icon: 'frame',
    tier: 2,
  },

  // ============ SOCIAL ACHIEVEMENTS (8) ============
  {
    id: 'first_friend',
    name: 'Friend Maker',
    description: 'Add your first friend',
    category: 'social',
    points: 15,
    hidden: false,
    criteria: { type: 'friends_count', target: 1 },
    icon: 'handshake',
    tier: 1,
  },
  {
    id: 'social_butterfly',
    name: 'Social Butterfly',
    description: 'Have 10 friends',
    category: 'social',
    points: 30,
    hidden: false,
    criteria: { type: 'friends_count', target: 10 },
    icon: 'butterfly',
    tier: 2,
  },
  {
    id: 'popular',
    name: 'Popular',
    description: 'Have 50 friends',
    category: 'social',
    points: 75,
    hidden: false,
    criteria: { type: 'friends_count', target: 50 },
    icon: 'star',
    tier: 3,
  },
  {
    id: 'clan_member',
    name: 'Clan Member',
    description: 'Join a clan',
    category: 'social',
    points: 20,
    hidden: false,
    criteria: { type: 'in_clan', target: 1 },
    icon: 'flag',
    tier: 1,
  },
  {
    id: 'clan_founder',
    name: 'Clan Founder',
    description: 'Create a clan',
    category: 'social',
    points: 50,
    hidden: false,
    criteria: { type: 'clans_created', target: 1 },
    icon: 'crown',
    tier: 2,
  },
  {
    id: 'gift_giver',
    name: 'Generous Soul',
    description: 'Send 10 gifts to friends',
    category: 'social',
    points: 40,
    hidden: false,
    criteria: { type: 'gifts_sent', target: 10 },
    icon: 'gift',
    tier: 2,
  },
  {
    id: 'team_player',
    name: 'Team Player',
    description: 'Win 25 team games (2v2 or 5v5)',
    category: 'social',
    points: 50,
    hidden: false,
    criteria: { type: 'team_wins', target: 25 },
    icon: 'team',
    tier: 2,
  },
  {
    id: 'clan_champion',
    name: 'Clan Champion',
    description: 'Help your clan win 100 games',
    category: 'social',
    points: 100,
    hidden: false,
    criteria: { type: 'clan_contribution', target: 100 },
    icon: 'medal',
    tier: 3,
  },

  // ============ PROGRESSION ACHIEVEMENTS (12) ============
  {
    id: 'reach_silver',
    name: 'Silver Promotion',
    description: 'Reach Silver rank',
    category: 'progression',
    points: 25,
    hidden: false,
    criteria: { type: 'rank_reached', target: 1, condition: { rank: 'silver' } },
    icon: 'medal_silver',
    tier: 1,
  },
  {
    id: 'reach_gold',
    name: 'Gold Promotion',
    description: 'Reach Gold rank',
    category: 'progression',
    points: 50,
    hidden: false,
    criteria: { type: 'rank_reached', target: 1, condition: { rank: 'gold' } },
    icon: 'medal_gold',
    tier: 2,
  },
  {
    id: 'reach_platinum',
    name: 'Platinum Promotion',
    description: 'Reach Platinum rank',
    category: 'progression',
    points: 75,
    hidden: false,
    criteria: { type: 'rank_reached', target: 1, condition: { rank: 'platinum' } },
    icon: 'medal_platinum',
    tier: 2,
  },
  {
    id: 'reach_diamond',
    name: 'Diamond Promotion',
    description: 'Reach Diamond rank',
    category: 'progression',
    points: 100,
    hidden: false,
    criteria: { type: 'rank_reached', target: 1, condition: { rank: 'diamond' } },
    icon: 'diamond',
    tier: 3,
  },
  {
    id: 'reach_master',
    name: 'Master Promotion',
    description: 'Reach Master rank',
    category: 'progression',
    points: 150,
    hidden: false,
    criteria: { type: 'rank_reached', target: 1, condition: { rank: 'master' } },
    icon: 'crown',
    tier: 3,
  },
  {
    id: 'reach_grandmaster',
    name: 'Grandmaster Promotion',
    description: 'Reach Grandmaster rank',
    category: 'progression',
    points: 200,
    hidden: false,
    criteria: { type: 'rank_reached', target: 1, condition: { rank: 'grandmaster' } },
    icon: 'crown_gold',
    tier: 4,
  },
  {
    id: 'reach_legend',
    name: 'Legend Promotion',
    description: 'Reach Legend rank',
    category: 'progression',
    points: 300,
    hidden: false,
    criteria: { type: 'rank_reached', target: 1, condition: { rank: 'legend' } },
    icon: 'star_legend',
    tier: 4,
  },
  {
    id: 'reach_mythic',
    name: 'Mythic Ascension',
    description: 'Reach Mythic rank',
    category: 'progression',
    points: 500,
    hidden: true,
    criteria: { type: 'rank_reached', target: 1, condition: { rank: 'mythic' } },
    icon: 'mythic',
    tier: 4,
  },
  {
    id: 'level_10',
    name: 'Level 10',
    description: 'Reach account level 10',
    category: 'progression',
    points: 20,
    hidden: false,
    criteria: { type: 'level', target: 10 },
    icon: 'level',
    tier: 1,
  },
  {
    id: 'level_25',
    name: 'Level 25',
    description: 'Reach account level 25',
    category: 'progression',
    points: 50,
    hidden: false,
    criteria: { type: 'level', target: 25 },
    icon: 'level',
    tier: 2,
  },
  {
    id: 'level_50',
    name: 'Level 50',
    description: 'Reach account level 50',
    category: 'progression',
    points: 100,
    hidden: false,
    criteria: { type: 'level', target: 50 },
    icon: 'level_gold',
    tier: 3,
  },
  {
    id: 'level_100',
    name: 'Max Level',
    description: 'Reach account level 100',
    category: 'progression',
    points: 250,
    hidden: false,
    criteria: { type: 'level', target: 100 },
    icon: 'level_max',
    tier: 4,
  },

  // ============ MASTERY ACHIEVEMENTS (10) ============
  {
    id: 'perfect_game',
    name: 'Perfect Game',
    description: 'Win with all territories and 95%+ troops',
    category: 'mastery',
    points: 75,
    hidden: false,
    criteria: { type: 'perfect_game', target: 1 },
    icon: 'perfect',
    tier: 3,
  },
  {
    id: 'speed_demon',
    name: 'Speed Demon',
    description: 'Win 10 games in under 2 minutes each',
    category: 'mastery',
    points: 100,
    hidden: false,
    criteria: { type: 'fast_wins', target: 10, condition: { maxDuration: 120 } },
    icon: 'speed',
    tier: 3,
  },
  {
    id: 'master_strategist',
    name: 'Master Strategist',
    description: 'Win against 4 enemies simultaneously',
    category: 'mastery',
    points: 75,
    hidden: false,
    criteria: { type: 'multi_enemy_win', target: 4 },
    icon: 'brain',
    tier: 3,
  },
  {
    id: 'no_losses',
    name: 'Undefeated',
    description: 'Win 20 games without any losses',
    category: 'mastery',
    points: 150,
    hidden: true,
    criteria: { type: 'wins_without_loss', target: 20 },
    icon: 'shield_gold',
    tier: 4,
  },
  {
    id: 'campaign_master',
    name: 'Campaign Master',
    description: 'Complete all campaign levels with 3 stars',
    category: 'mastery',
    points: 200,
    hidden: false,
    criteria: { type: 'campaign_stars', target: 120 },
    icon: 'stars',
    tier: 4,
  },
  {
    id: 'mode_master_1v1',
    name: '1v1 Master',
    description: 'Win 100 1v1 games',
    category: 'mastery',
    points: 75,
    hidden: false,
    criteria: { type: 'mode_wins', target: 100, condition: { mode: '1v1' } },
    icon: 'duel',
    tier: 3,
  },
  {
    id: 'mode_master_2v2',
    name: '2v2 Master',
    description: 'Win 100 2v2 games',
    category: 'mastery',
    points: 75,
    hidden: false,
    criteria: { type: 'mode_wins', target: 100, condition: { mode: '2v2' } },
    icon: 'duo',
    tier: 3,
  },
  {
    id: 'mode_master_5v5',
    name: '5v5 Master',
    description: 'Win 50 5v5 games',
    category: 'mastery',
    points: 100,
    hidden: false,
    criteria: { type: 'mode_wins', target: 50, condition: { mode: '5v5' } },
    icon: 'army',
    tier: 3,
  },
  {
    id: 'territory_domination',
    name: 'Territory Domination',
    description: 'Control 20 territories in a single game',
    category: 'mastery',
    points: 50,
    hidden: false,
    criteria: { type: 'max_territories', target: 20 },
    icon: 'map_full',
    tier: 2,
  },
  {
    id: 'troop_general',
    name: 'Troop General',
    description: 'Have 500 troops on the field at once',
    category: 'mastery',
    points: 50,
    hidden: false,
    criteria: { type: 'max_troops', target: 500 },
    icon: 'army_large',
    tier: 2,
  },

  // ============ SPECIAL ACHIEVEMENTS (5) ============
  {
    id: 'early_adopter',
    name: 'Early Adopter',
    description: 'Play during the first season',
    category: 'special',
    points: 50,
    hidden: true,
    criteria: { type: 'special', target: 1, condition: { season: 1 } },
    icon: 'pioneer',
    tier: 2,
  },
  {
    id: 'daily_warrior',
    name: 'Daily Warrior',
    description: 'Complete daily quests for 30 consecutive days',
    category: 'special',
    points: 150,
    hidden: false,
    criteria: { type: 'daily_streak', target: 30 },
    icon: 'calendar',
    tier: 3,
  },
  {
    id: 'season_champion',
    name: 'Season Champion',
    description: 'Finish a season in top 100',
    category: 'special',
    points: 200,
    hidden: false,
    criteria: { type: 'season_rank', target: 100 },
    icon: 'trophy_season',
    tier: 4,
  },
  {
    id: 'all_achievements',
    name: 'Completionist',
    description: 'Unlock all other achievements',
    category: 'special',
    points: 500,
    hidden: true,
    criteria: { type: 'achievements_unlocked', target: 54 },
    icon: 'completion',
    tier: 4,
  },
  {
    id: 'secret_discoverer',
    name: 'Secret Discoverer',
    description: 'Find the hidden easter egg',
    category: 'special',
    points: 100,
    hidden: true,
    criteria: { type: 'easter_egg', target: 1 },
    icon: 'egg',
    tier: 3,
  },
];

// ============ DATABASE INITIALIZATION ============

export function initAchievementTables(): void {
  // Achievements table (static data)
  db.exec(`
    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      points INTEGER NOT NULL,
      hidden INTEGER DEFAULT 0,
      criteria TEXT NOT NULL,
      icon TEXT DEFAULT 'trophy',
      tier INTEGER DEFAULT 1
    )
  `);

  // Player achievements (progress tracking)
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_achievements (
      player_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      unlocked_at INTEGER,
      progress INTEGER DEFAULT 0,
      PRIMARY KEY (player_id, achievement_id),
      FOREIGN KEY (player_id) REFERENCES users(id),
      FOREIGN KEY (achievement_id) REFERENCES achievements(id)
    )
  `);

  // Player stats for achievement tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_stats (
      player_id TEXT PRIMARY KEY,
      current_win_streak INTEGER DEFAULT 0,
      max_win_streak INTEGER DEFAULT 0,
      territories_captured INTEGER DEFAULT 0,
      troops_sent INTEGER DEFAULT 0,
      fast_wins INTEGER DEFAULT 0,
      perfect_games INTEGER DEFAULT 0,
      comebacks INTEGER DEFAULT 0,
      team_wins INTEGER DEFAULT 0,
      gifts_sent INTEGER DEFAULT 0,
      daily_streak INTEGER DEFAULT 0,
      max_daily_streak INTEGER DEFAULT 0,
      last_daily_completion INTEGER,
      clans_created INTEGER DEFAULT 0,
      mode_wins_1v1 INTEGER DEFAULT 0,
      mode_wins_2v2 INTEGER DEFAULT 0,
      mode_wins_5v5 INTEGER DEFAULT 0,
      max_territories_held INTEGER DEFAULT 0,
      max_troops_on_field INTEGER DEFAULT 0,
      account_level INTEGER DEFAULT 1,
      experience INTEGER DEFAULT 0,
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Create indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_player_achievements ON player_achievements(player_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_achievements_category ON achievements(category)`);

  // Seed achievements into database
  seedAchievements();

  console.log('Achievement tables initialized');
}

function seedAchievements(): void {
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO achievements (id, name, description, category, points, hidden, criteria, icon, tier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((achievements: Achievement[]) => {
    for (const a of achievements) {
      insertStmt.run(
        a.id,
        a.name,
        a.description,
        a.category,
        a.points,
        a.hidden ? 1 : 0,
        JSON.stringify(a.criteria),
        a.icon,
        a.tier
      );
    }
  });

  insertMany(ACHIEVEMENTS);
}

// Initialize tables immediately
initAchievementTables();

// ============ QUERIES ============

export const achievementQueries = {
  getAll: db.prepare(`SELECT * FROM achievements`),

  getById: db.prepare(`SELECT * FROM achievements WHERE id = ?`),

  getByCategory: db.prepare(`SELECT * FROM achievements WHERE category = ?`),

  getPlayerAchievements: db.prepare(`
    SELECT a.*, pa.unlocked_at, pa.progress
    FROM achievements a
    LEFT JOIN player_achievements pa ON a.id = pa.achievement_id AND pa.player_id = ?
  `),

  getPlayerUnlocked: db.prepare(`
    SELECT a.*, pa.unlocked_at
    FROM achievements a
    INNER JOIN player_achievements pa ON a.id = pa.achievement_id
    WHERE pa.player_id = ? AND pa.unlocked_at IS NOT NULL
  `),

  getPlayerProgress: db.prepare(`
    SELECT achievement_id, progress, unlocked_at
    FROM player_achievements
    WHERE player_id = ?
  `),

  getPlayerTotalPoints: db.prepare(`
    SELECT COALESCE(SUM(a.points), 0) as total_points
    FROM achievements a
    INNER JOIN player_achievements pa ON a.id = pa.achievement_id
    WHERE pa.player_id = ? AND pa.unlocked_at IS NOT NULL
  `),

  upsertProgress: db.prepare(`
    INSERT INTO player_achievements (player_id, achievement_id, progress, unlocked_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(player_id, achievement_id)
    DO UPDATE SET progress = ?, unlocked_at = COALESCE(unlocked_at, ?)
  `),

  unlockAchievement: db.prepare(`
    INSERT INTO player_achievements (player_id, achievement_id, progress, unlocked_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(player_id, achievement_id)
    DO UPDATE SET unlocked_at = COALESCE(unlocked_at, ?), progress = ?
  `),

  getPlayerStats: db.prepare(`SELECT * FROM player_stats WHERE player_id = ?`),

  initPlayerStats: db.prepare(`
    INSERT OR IGNORE INTO player_stats (player_id) VALUES (?)
  `),

  updatePlayerStats: db.prepare(`
    UPDATE player_stats SET
      current_win_streak = ?,
      max_win_streak = ?,
      territories_captured = ?,
      troops_sent = ?,
      fast_wins = ?,
      perfect_games = ?,
      comebacks = ?,
      team_wins = ?,
      gifts_sent = ?,
      daily_streak = ?,
      max_daily_streak = ?,
      last_daily_completion = ?,
      clans_created = ?,
      mode_wins_1v1 = ?,
      mode_wins_2v2 = ?,
      mode_wins_5v5 = ?,
      max_territories_held = ?,
      max_troops_on_field = ?,
      account_level = ?,
      experience = ?
    WHERE player_id = ?
  `),

  // Note: incrementStat needs individual queries per column since column names can't be parameters
  // Use specific increment functions instead
};

// Individual stat increment functions
export function incrementPlayerStat(playerId: string, statName: string, amount: number = 1): void {
  const validStats = [
    'territories_captured', 'troops_sent', 'fast_wins', 'perfect_games', 'comebacks',
    'team_wins', 'gifts_sent', 'clans_created', 'mode_wins_1v1', 'mode_wins_2v2', 'mode_wins_5v5'
  ];
  if (!validStats.includes(statName)) return;

  db.prepare(`UPDATE player_stats SET ${statName} = ${statName} + ? WHERE player_id = ?`).run(amount, playerId);
}

// ============ ACHIEVEMENT CHECKING LOGIC ============

export interface PlayerStatsRow {
  player_id: string;
  current_win_streak: number;
  max_win_streak: number;
  territories_captured: number;
  troops_sent: number;
  fast_wins: number;
  perfect_games: number;
  comebacks: number;
  team_wins: number;
  gifts_sent: number;
  daily_streak: number;
  max_daily_streak: number;
  last_daily_completion: number | null;
  clans_created: number;
  mode_wins_1v1: number;
  mode_wins_2v2: number;
  mode_wins_5v5: number;
  max_territories_held: number;
  max_troops_on_field: number;
  account_level: number;
  experience: number;
}

export function checkAndUnlockAchievements(
  playerId: string,
  context: {
    wins?: number;
    losses?: number;
    friendsCount?: number;
    skinsOwned?: number;
    setsCompleted?: number;
    inClan?: boolean;
    currentRank?: string;
    gameDuration?: number;
    isFlawless?: boolean;
    isComeback?: boolean;
    territoriesCaptured?: number;
    troopsSent?: number;
    isPerfectGame?: boolean;
    mode?: string;
    maxTerritories?: number;
    maxTroops?: number;
    itemsByRarity?: Record<string, number>;
  }
): Achievement[] {
  const unlockedNow: Achievement[] = [];
  const now = Math.floor(Date.now() / 1000);

  // Initialize player stats if not exists
  achievementQueries.initPlayerStats.run(playerId);

  // Get current stats and achievements
  const stats = achievementQueries.getPlayerStats.get(playerId) as PlayerStatsRow | undefined;
  const currentProgress = achievementQueries.getPlayerProgress.all(playerId) as Array<{
    achievement_id: string;
    progress: number;
    unlocked_at: number | null;
  }>;

  const progressMap = new Map(currentProgress.map(p => [p.achievement_id, p]));

  for (const achievement of ACHIEVEMENTS) {
    const existing = progressMap.get(achievement.id);
    if (existing?.unlocked_at) continue; // Already unlocked

    let progress = existing?.progress || 0;
    let shouldUnlock = false;

    const criteria = achievement.criteria;

    switch (criteria.type) {
      case 'wins':
        progress = context.wins || 0;
        shouldUnlock = progress >= criteria.target;
        break;

      case 'win_streak':
        progress = stats?.max_win_streak || 0;
        shouldUnlock = progress >= criteria.target;
        break;

      case 'territories_captured':
        progress = stats?.territories_captured || 0;
        shouldUnlock = progress >= criteria.target;
        break;

      case 'troops_sent':
        progress = stats?.troops_sent || 0;
        shouldUnlock = progress >= criteria.target;
        break;

      case 'fast_win':
        if (context.gameDuration && context.gameDuration <= criteria.target) {
          shouldUnlock = true;
          progress = 1;
        }
        break;

      case 'flawless':
        if (context.isFlawless) {
          shouldUnlock = true;
          progress = 1;
        }
        break;

      case 'comeback':
        if (context.isComeback) {
          progress = (stats?.comebacks || 0) + 1;
          shouldUnlock = progress >= criteria.target;
        }
        break;

      case 'skins_owned':
        progress = context.skinsOwned || 0;
        shouldUnlock = progress >= criteria.target;
        break;

      case 'rarity_owned':
        const rarity = criteria.condition?.rarity as string;
        progress = context.itemsByRarity?.[rarity] || 0;
        shouldUnlock = progress >= criteria.target;
        break;

      case 'sets_completed':
        progress = context.setsCompleted || 0;
        shouldUnlock = progress >= criteria.target;
        break;

      case 'friends_count':
        progress = context.friendsCount || 0;
        shouldUnlock = progress >= criteria.target;
        break;

      case 'in_clan':
        if (context.inClan) {
          shouldUnlock = true;
          progress = 1;
        }
        break;

      case 'clans_created':
        progress = stats?.clans_created || 0;
        shouldUnlock = progress >= criteria.target;
        break;

      case 'gifts_sent':
        progress = stats?.gifts_sent || 0;
        shouldUnlock = progress >= criteria.target;
        break;

      case 'team_wins':
        progress = stats?.team_wins || 0;
        shouldUnlock = progress >= criteria.target;
        break;

      case 'rank_reached':
        const targetRank = criteria.condition?.rank as string;
        if (context.currentRank === targetRank) {
          shouldUnlock = true;
          progress = 1;
        }
        break;

      case 'level':
        progress = stats?.account_level || 1;
        shouldUnlock = progress >= criteria.target;
        break;

      case 'perfect_game':
        if (context.isPerfectGame) {
          progress = (stats?.perfect_games || 0) + 1;
          shouldUnlock = progress >= criteria.target;
        }
        break;

      case 'fast_wins':
        const maxDuration = criteria.condition?.maxDuration as number;
        if (context.gameDuration && context.gameDuration <= maxDuration) {
          progress = (stats?.fast_wins || 0) + 1;
          shouldUnlock = progress >= criteria.target;
        }
        break;

      case 'mode_wins':
        const mode = criteria.condition?.mode as string;
        if (context.mode === mode) {
          if (mode === '1v1') progress = (stats?.mode_wins_1v1 || 0);
          else if (mode === '2v2') progress = (stats?.mode_wins_2v2 || 0);
          else if (mode === '5v5') progress = (stats?.mode_wins_5v5 || 0);
          shouldUnlock = progress >= criteria.target;
        }
        break;

      case 'max_territories':
        progress = Math.max(stats?.max_territories_held || 0, context.maxTerritories || 0);
        shouldUnlock = progress >= criteria.target;
        break;

      case 'max_troops':
        progress = Math.max(stats?.max_troops_on_field || 0, context.maxTroops || 0);
        shouldUnlock = progress >= criteria.target;
        break;

      case 'daily_streak':
        progress = stats?.max_daily_streak || 0;
        shouldUnlock = progress >= criteria.target;
        break;
    }

    // Update progress
    if (shouldUnlock) {
      achievementQueries.unlockAchievement.run(
        playerId, achievement.id, progress, now, now, progress
      );
      unlockedNow.push(achievement);
    } else if (progress > (existing?.progress || 0)) {
      achievementQueries.upsertProgress.run(
        playerId, achievement.id, progress, null, progress, null
      );
    }
  }

  return unlockedNow;
}

// Check for retroactive unlocks on login
export function checkRetroactiveAchievements(playerId: string): Achievement[] {
  // Get user data
  const user = db.prepare(`
    SELECT wins, losses, clan_id FROM users WHERE id = ?
  `).get(playerId) as { wins: number; losses: number; clan_id: string | null } | undefined;

  if (!user) return [];

  // Get friends count
  const friendsResult = db.prepare(`
    SELECT COUNT(*) as count FROM friends
    WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'
  `).get(playerId, playerId) as { count: number };

  // Get items count
  const itemsResult = db.prepare(`
    SELECT COUNT(*) as count FROM player_items WHERE player_id = ?
  `).get(playerId) as { count: number } | undefined;

  // Get items by rarity
  const itemsByRarity: Record<string, number> = {};
  const rarityRows = db.prepare(`
    SELECT i.rarity, COUNT(*) as count
    FROM player_items pi
    JOIN items i ON pi.item_id = i.id
    WHERE pi.player_id = ?
    GROUP BY i.rarity
  `).all(playerId) as Array<{ rarity: string; count: number }>;

  for (const row of rarityRows) {
    itemsByRarity[row.rarity] = row.count;
  }

  return checkAndUnlockAchievements(playerId, {
    wins: user.wins,
    losses: user.losses,
    friendsCount: friendsResult?.count || 0,
    skinsOwned: itemsResult?.count || 0,
    inClan: !!user.clan_id,
    itemsByRarity,
  });
}

// ============ API ROUTES ============

// Get all achievements for a player (with progress)
router.get('/:playerId', (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    const achievements = achievementQueries.getPlayerAchievements.all(playerId) as Array<{
      id: string;
      name: string;
      description: string;
      category: string;
      points: number;
      hidden: number;
      criteria: string;
      icon: string;
      tier: number;
      unlocked_at: number | null;
      progress: number | null;
    }>;

    const totalPoints = achievementQueries.getPlayerTotalPoints.get(playerId) as { total_points: number };

    res.json({
      achievements: achievements.map(a => ({
        id: a.id,
        name: a.hidden && !a.unlocked_at ? '???' : a.name,
        description: a.hidden && !a.unlocked_at ? 'Hidden achievement' : a.description,
        category: a.category,
        points: a.points,
        hidden: a.hidden === 1,
        criteria: a.hidden && !a.unlocked_at ? {} : JSON.parse(a.criteria),
        icon: a.icon,
        tier: a.tier,
        unlockedAt: a.unlocked_at,
        progress: a.progress || 0,
        isUnlocked: a.unlocked_at !== null,
      })),
      totalPoints: totalPoints?.total_points || 0,
      unlockedCount: achievements.filter(a => a.unlocked_at !== null).length,
      totalCount: achievements.length,
    });
  } catch (error) {
    console.error('Get achievements error:', error);
    res.status(500).json({ error: 'Failed to get achievements' });
  }
});

// Get achievements by category
router.get('/category/:category', (req: AuthRequest, res: Response) => {
  try {
    const { category } = req.params;
    const achievements = achievementQueries.getByCategory.all(category) as Achievement[];

    res.json({
      achievements: achievements.map(a => ({
        ...a,
        criteria: JSON.parse(a.criteria as unknown as string),
        hidden: a.hidden,
      })),
    });
  } catch (error) {
    console.error('Get category achievements error:', error);
    res.status(500).json({ error: 'Failed to get achievements' });
  }
});

// Check and update achievements after an event
router.post('/check', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { event, data } = req.body as { event: string; data: Record<string, unknown> };

    // Build context based on event type
    const context: Record<string, unknown> = { ...data };

    // Get current user stats
    const user = db.prepare(`SELECT wins, losses, clan_id FROM users WHERE id = ?`).get(req.user.id) as {
      wins: number;
      losses: number;
      clan_id: string | null
    } | undefined;

    if (user) {
      context.wins = user.wins;
      context.losses = user.losses;
      context.inClan = !!user.clan_id;
    }

    const unlockedAchievements = checkAndUnlockAchievements(req.user.id, context);

    res.json({
      unlocked: unlockedAchievements.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        points: a.points,
        icon: a.icon,
        tier: a.tier,
      })),
      count: unlockedAchievements.length,
    });
  } catch (error) {
    console.error('Check achievements error:', error);
    res.status(500).json({ error: 'Failed to check achievements' });
  }
});

// Get player stats
router.get('/stats/:playerId', (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    achievementQueries.initPlayerStats.run(playerId);
    const stats = achievementQueries.getPlayerStats.get(playerId) as PlayerStatsRow | undefined;

    if (!stats) {
      res.status(404).json({ error: 'Stats not found' });
      return;
    }

    res.json({
      playerId: stats.player_id,
      winStreak: {
        current: stats.current_win_streak,
        max: stats.max_win_streak,
      },
      combat: {
        territoriesCaptured: stats.territories_captured,
        troopsSent: stats.troops_sent,
        fastWins: stats.fast_wins,
        perfectGames: stats.perfect_games,
        comebacks: stats.comebacks,
      },
      social: {
        teamWins: stats.team_wins,
        giftsSent: stats.gifts_sent,
        clansCreated: stats.clans_created,
      },
      streaks: {
        dailyCurrent: stats.daily_streak,
        dailyMax: stats.max_daily_streak,
        lastDaily: stats.last_daily_completion,
      },
      modes: {
        '1v1': stats.mode_wins_1v1,
        '2v2': stats.mode_wins_2v2,
        '5v5': stats.mode_wins_5v5,
      },
      records: {
        maxTerritories: stats.max_territories_held,
        maxTroops: stats.max_troops_on_field,
      },
      progression: {
        level: stats.account_level,
        experience: stats.experience,
      },
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export { router as achievementRouter };
