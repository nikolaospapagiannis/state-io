import { Router, Response } from 'express';
import { db } from './database';
import { AuthRequest } from './auth';
import { addSeasonXp } from './seasons';

const router = Router();

// ============ TYPES ============

export type QuestType = 'daily' | 'weekly' | 'monthly';
export type QuestDifficulty = 'easy' | 'medium' | 'hard' | 'epic';

export interface QuestTemplate {
  id: string;
  type: QuestType;
  name: string;
  description: string;
  criteria: QuestCriteria;
  rewards: QuestReward[];
  difficulty: QuestDifficulty;
  weight: number; // Selection probability weight
}

export interface QuestCriteria {
  action: string;
  target: number;
  condition?: Record<string, unknown>;
}

export interface QuestReward {
  type: 'gold' | 'gems' | 'xp' | 'chest' | 'item';
  amount: number;
  itemId?: string;
}

export interface PlayerQuest {
  id: number;
  playerId: string;
  questId: string;
  progress: number;
  completed: boolean;
  completedAt: number | null;
  expiresAt: number;
  claimed: boolean;
}

export interface QuestStreak {
  playerId: string;
  currentStreak: number;
  longestStreak: number;
  lastCompletion: number | null;
  totalCompleted: number;
}

// ============ QUEST TEMPLATES ============

const QUEST_TEMPLATES: QuestTemplate[] = [
  // ============ DAILY QUESTS ============
  // Easy (60% of daily pool)
  {
    id: 'daily_play_1',
    type: 'daily',
    name: 'First Steps',
    description: 'Play 1 game',
    criteria: { action: 'games_played', target: 1 },
    rewards: [{ type: 'gold', amount: 100 }, { type: 'xp', amount: 50 }],
    difficulty: 'easy',
    weight: 20,
  },
  {
    id: 'daily_play_3',
    type: 'daily',
    name: 'Warmonger',
    description: 'Play 3 games',
    criteria: { action: 'games_played', target: 3 },
    rewards: [{ type: 'gold', amount: 200 }, { type: 'xp', amount: 100 }],
    difficulty: 'easy',
    weight: 15,
  },
  {
    id: 'daily_win_1',
    type: 'daily',
    name: 'Victory',
    description: 'Win 1 game',
    criteria: { action: 'wins', target: 1 },
    rewards: [{ type: 'gold', amount: 150 }, { type: 'xp', amount: 75 }],
    difficulty: 'easy',
    weight: 20,
  },
  {
    id: 'daily_territories_10',
    type: 'daily',
    name: 'Conqueror',
    description: 'Capture 10 territories',
    criteria: { action: 'territories_captured', target: 10 },
    rewards: [{ type: 'gold', amount: 100 }, { type: 'xp', amount: 50 }],
    difficulty: 'easy',
    weight: 15,
  },
  {
    id: 'daily_troops_500',
    type: 'daily',
    name: 'Army March',
    description: 'Send 500 troops into battle',
    criteria: { action: 'troops_sent', target: 500 },
    rewards: [{ type: 'gold', amount: 100 }, { type: 'xp', amount: 50 }],
    difficulty: 'easy',
    weight: 15,
  },

  // Medium (30% of daily pool)
  {
    id: 'daily_win_2',
    type: 'daily',
    name: 'Double Victory',
    description: 'Win 2 games',
    criteria: { action: 'wins', target: 2 },
    rewards: [{ type: 'gold', amount: 300 }, { type: 'xp', amount: 150 }],
    difficulty: 'medium',
    weight: 10,
  },
  {
    id: 'daily_play_mode_1v1',
    type: 'daily',
    name: 'Duelist',
    description: 'Play 2 1v1 matches',
    criteria: { action: 'games_played', target: 2, condition: { mode: '1v1' } },
    rewards: [{ type: 'gold', amount: 250 }, { type: 'xp', amount: 125 }],
    difficulty: 'medium',
    weight: 8,
  },
  {
    id: 'daily_play_mode_team',
    type: 'daily',
    name: 'Team Player',
    description: 'Play 2 team games (2v2 or 5v5)',
    criteria: { action: 'games_played', target: 2, condition: { mode: 'team' } },
    rewards: [{ type: 'gold', amount: 250 }, { type: 'xp', amount: 125 }],
    difficulty: 'medium',
    weight: 8,
  },
  {
    id: 'daily_territories_25',
    type: 'daily',
    name: 'Land Grab',
    description: 'Capture 25 territories',
    criteria: { action: 'territories_captured', target: 25 },
    rewards: [{ type: 'gold', amount: 250 }, { type: 'xp', amount: 125 }],
    difficulty: 'medium',
    weight: 7,
  },

  // Hard (10% of daily pool)
  {
    id: 'daily_win_3',
    type: 'daily',
    name: 'Hat Trick',
    description: 'Win 3 games',
    criteria: { action: 'wins', target: 3 },
    rewards: [{ type: 'gold', amount: 500 }, { type: 'xp', amount: 250 }, { type: 'gems', amount: 10 }],
    difficulty: 'hard',
    weight: 5,
  },
  {
    id: 'daily_win_streak_2',
    type: 'daily',
    name: 'Winning Streak',
    description: 'Win 2 games in a row',
    criteria: { action: 'win_streak', target: 2 },
    rewards: [{ type: 'gold', amount: 400 }, { type: 'xp', amount: 200 }, { type: 'gems', amount: 5 }],
    difficulty: 'hard',
    weight: 5,
  },

  // ============ WEEKLY QUESTS ============
  // Medium
  {
    id: 'weekly_play_10',
    type: 'weekly',
    name: 'Active Warrior',
    description: 'Play 10 games this week',
    criteria: { action: 'games_played', target: 10 },
    rewards: [{ type: 'gold', amount: 500 }, { type: 'xp', amount: 300 }],
    difficulty: 'medium',
    weight: 20,
  },
  {
    id: 'weekly_win_5',
    type: 'weekly',
    name: 'Weekly Champion',
    description: 'Win 5 games this week',
    criteria: { action: 'wins', target: 5 },
    rewards: [{ type: 'gold', amount: 600 }, { type: 'xp', amount: 400 }],
    difficulty: 'medium',
    weight: 18,
  },
  {
    id: 'weekly_territories_100',
    type: 'weekly',
    name: 'Empire Builder',
    description: 'Capture 100 territories',
    criteria: { action: 'territories_captured', target: 100 },
    rewards: [{ type: 'gold', amount: 500 }, { type: 'xp', amount: 300 }],
    difficulty: 'medium',
    weight: 15,
  },
  {
    id: 'weekly_troops_5000',
    type: 'weekly',
    name: 'Army General',
    description: 'Send 5000 troops into battle',
    criteria: { action: 'troops_sent', target: 5000 },
    rewards: [{ type: 'gold', amount: 500 }, { type: 'xp', amount: 300 }],
    difficulty: 'medium',
    weight: 15,
  },

  // Hard
  {
    id: 'weekly_win_10',
    type: 'weekly',
    name: 'Unstoppable',
    description: 'Win 10 games this week',
    criteria: { action: 'wins', target: 10 },
    rewards: [{ type: 'gold', amount: 1000 }, { type: 'xp', amount: 600 }, { type: 'gems', amount: 25 }],
    difficulty: 'hard',
    weight: 10,
  },
  {
    id: 'weekly_play_different_modes',
    type: 'weekly',
    name: 'Mode Explorer',
    description: 'Play 3 games in each mode (1v1, 2v2, 5v5)',
    criteria: { action: 'play_all_modes', target: 3 },
    rewards: [{ type: 'gold', amount: 800 }, { type: 'xp', amount: 500 }, { type: 'gems', amount: 15 }],
    difficulty: 'hard',
    weight: 8,
  },
  {
    id: 'weekly_daily_streak_5',
    type: 'weekly',
    name: 'Consistent',
    description: 'Complete daily quests for 5 days',
    criteria: { action: 'daily_completions', target: 5 },
    rewards: [{ type: 'gold', amount: 750 }, { type: 'xp', amount: 500 }, { type: 'gems', amount: 20 }],
    difficulty: 'hard',
    weight: 8,
  },

  // Epic
  {
    id: 'weekly_win_streak_5',
    type: 'weekly',
    name: 'Dominator',
    description: 'Achieve a 5-game winning streak',
    criteria: { action: 'win_streak', target: 5 },
    rewards: [{ type: 'gold', amount: 1500 }, { type: 'xp', amount: 800 }, { type: 'gems', amount: 50 }, { type: 'chest', amount: 1, itemId: 'rare_chest' }],
    difficulty: 'epic',
    weight: 5,
  },

  // ============ MONTHLY QUESTS (Milestones) ============
  {
    id: 'monthly_play_50',
    type: 'monthly',
    name: 'Dedicated Player',
    description: 'Play 50 games this month',
    criteria: { action: 'games_played', target: 50 },
    rewards: [{ type: 'gold', amount: 2000 }, { type: 'xp', amount: 1500 }, { type: 'gems', amount: 50 }],
    difficulty: 'medium',
    weight: 20,
  },
  {
    id: 'monthly_win_25',
    type: 'monthly',
    name: 'Monthly Master',
    description: 'Win 25 games this month',
    criteria: { action: 'wins', target: 25 },
    rewards: [{ type: 'gold', amount: 3000 }, { type: 'xp', amount: 2000 }, { type: 'gems', amount: 75 }],
    difficulty: 'hard',
    weight: 15,
  },
  {
    id: 'monthly_territories_500',
    type: 'monthly',
    name: 'Land Baron',
    description: 'Capture 500 territories',
    criteria: { action: 'territories_captured', target: 500 },
    rewards: [{ type: 'gold', amount: 2500 }, { type: 'xp', amount: 1500 }, { type: 'gems', amount: 60 }],
    difficulty: 'hard',
    weight: 15,
  },
  {
    id: 'monthly_daily_streak_20',
    type: 'monthly',
    name: 'Iron Will',
    description: 'Complete daily quests for 20 days',
    criteria: { action: 'daily_completions', target: 20 },
    rewards: [{ type: 'gold', amount: 5000 }, { type: 'xp', amount: 3000 }, { type: 'gems', amount: 100 }, { type: 'chest', amount: 1, itemId: 'epic_chest' }],
    difficulty: 'epic',
    weight: 10,
  },
  {
    id: 'monthly_win_streak_10',
    type: 'monthly',
    name: 'Legendary Streak',
    description: 'Achieve a 10-game winning streak',
    criteria: { action: 'win_streak', target: 10 },
    rewards: [{ type: 'gold', amount: 5000 }, { type: 'xp', amount: 3000 }, { type: 'gems', amount: 150 }, { type: 'chest', amount: 1, itemId: 'legendary_chest' }],
    difficulty: 'epic',
    weight: 5,
  },
];

// ============ CONSTANTS ============

const DAILY_QUEST_COUNT = 3;
const WEEKLY_QUEST_COUNT = 7;
const MONTHLY_QUEST_COUNT = 5;
const REFRESH_TOKEN_COST = 50; // gems

// ============ DATABASE INITIALIZATION ============

export function initQuestTables(): void {
  // Quest templates (static data)
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_templates (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      criteria TEXT NOT NULL,
      rewards TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      weight INTEGER DEFAULT 10
    )
  `);

  // Player quests (active/completed quests)
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      quest_id TEXT NOT NULL,
      progress INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      completed_at INTEGER,
      expires_at INTEGER NOT NULL,
      claimed INTEGER DEFAULT 0,
      FOREIGN KEY (player_id) REFERENCES users(id),
      FOREIGN KEY (quest_id) REFERENCES quest_templates(id)
    )
  `);

  // Quest streaks
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_streaks (
      player_id TEXT PRIMARY KEY,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      last_completion INTEGER,
      total_completed INTEGER DEFAULT 0,
      weekly_refresh_tokens INTEGER DEFAULT 1,
      last_token_refresh INTEGER,
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Create indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_player_quests ON player_quests(player_id, expires_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_type ON quest_templates(type)`);

  // Seed quest templates
  seedQuestTemplates();

  console.log('Quest tables initialized');
}

function seedQuestTemplates(): void {
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO quest_templates (id, type, name, description, criteria, rewards, difficulty, weight)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((templates: QuestTemplate[]) => {
    for (const t of templates) {
      insertStmt.run(
        t.id,
        t.type,
        t.name,
        t.description,
        JSON.stringify(t.criteria),
        JSON.stringify(t.rewards),
        t.difficulty,
        t.weight
      );
    }
  });

  insertMany(QUEST_TEMPLATES);
}

// Initialize tables immediately
initQuestTables();

// ============ QUERIES ============

export const questQueries = {
  getTemplatesByType: db.prepare(`SELECT * FROM quest_templates WHERE type = ?`),

  getPlayerQuests: db.prepare(`
    SELECT pq.*, qt.name, qt.description, qt.criteria, qt.rewards, qt.difficulty
    FROM player_quests pq
    JOIN quest_templates qt ON pq.quest_id = qt.id
    WHERE pq.player_id = ? AND pq.expires_at > ?
    ORDER BY pq.expires_at, pq.completed
  `),

  getPlayerActiveQuests: db.prepare(`
    SELECT pq.*, qt.name, qt.description, qt.criteria, qt.rewards, qt.difficulty, qt.type
    FROM player_quests pq
    JOIN quest_templates qt ON pq.quest_id = qt.id
    WHERE pq.player_id = ? AND pq.expires_at > ? AND pq.claimed = 0
  `),

  getPlayerQuestById: db.prepare(`
    SELECT pq.*, qt.rewards
    FROM player_quests pq
    JOIN quest_templates qt ON pq.quest_id = qt.id
    WHERE pq.id = ? AND pq.player_id = ?
  `),

  insertQuest: db.prepare(`
    INSERT INTO player_quests (player_id, quest_id, progress, expires_at)
    VALUES (?, ?, 0, ?)
  `),

  updateQuestProgress: db.prepare(`
    UPDATE player_quests SET progress = ?, completed = ?, completed_at = ?
    WHERE id = ?
  `),

  claimQuest: db.prepare(`UPDATE player_quests SET claimed = 1 WHERE id = ?`),

  deleteExpiredQuests: db.prepare(`DELETE FROM player_quests WHERE expires_at < ?`),

  getStreak: db.prepare(`SELECT * FROM quest_streaks WHERE player_id = ?`),

  upsertStreak: db.prepare(`
    INSERT INTO quest_streaks (player_id, current_streak, longest_streak, last_completion, total_completed, weekly_refresh_tokens, last_token_refresh)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      current_streak = ?,
      longest_streak = ?,
      last_completion = ?,
      total_completed = ?,
      weekly_refresh_tokens = ?,
      last_token_refresh = ?
  `),

  countPlayerQuestsByType: db.prepare(`
    SELECT COUNT(*) as count FROM player_quests pq
    JOIN quest_templates qt ON pq.quest_id = qt.id
    WHERE pq.player_id = ? AND qt.type = ? AND pq.expires_at > ?
  `),
};

// ============ QUEST MANAGEMENT ============

export function getQuestExpiration(type: QuestType): number {
  const now = new Date();
  const nowTimestamp = Math.floor(now.getTime() / 1000);

  switch (type) {
    case 'daily': {
      // Expires at midnight UTC
      const midnight = new Date(now);
      midnight.setUTCHours(24, 0, 0, 0);
      return Math.floor(midnight.getTime() / 1000);
    }
    case 'weekly': {
      // Expires at next Monday midnight UTC
      const nextMonday = new Date(now);
      nextMonday.setUTCHours(0, 0, 0, 0);
      nextMonday.setUTCDate(nextMonday.getUTCDate() + ((8 - nextMonday.getUTCDay()) % 7 || 7));
      return Math.floor(nextMonday.getTime() / 1000);
    }
    case 'monthly': {
      // Expires at first of next month midnight UTC
      const nextMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0);
      return Math.floor(nextMonth.getTime() / 1000);
    }
    default:
      return nowTimestamp + 24 * 60 * 60;
  }
}

function selectRandomQuests(type: QuestType, count: number): QuestTemplate[] {
  const templates = questQueries.getTemplatesByType.all(type) as Array<{
    id: string;
    type: QuestType;
    name: string;
    description: string;
    criteria: string;
    rewards: string;
    difficulty: QuestDifficulty;
    weight: number;
  }>;

  // Weighted random selection
  const totalWeight = templates.reduce((sum, t) => sum + t.weight, 0);
  const selected: QuestTemplate[] = [];
  const usedIds = new Set<string>();

  while (selected.length < count && usedIds.size < templates.length) {
    let random = Math.random() * totalWeight;

    for (const template of templates) {
      if (usedIds.has(template.id)) continue;

      random -= template.weight;
      if (random <= 0) {
        usedIds.add(template.id);
        selected.push({
          ...template,
          criteria: JSON.parse(template.criteria),
          rewards: JSON.parse(template.rewards),
        });
        break;
      }
    }
  }

  return selected;
}

export function generatePlayerQuests(playerId: string): void {
  const now = Math.floor(Date.now() / 1000);

  // Clean up expired quests
  questQueries.deleteExpiredQuests.run(now);

  // Check each quest type
  const types: { type: QuestType; count: number }[] = [
    { type: 'daily', count: DAILY_QUEST_COUNT },
    { type: 'weekly', count: WEEKLY_QUEST_COUNT },
    { type: 'monthly', count: MONTHLY_QUEST_COUNT },
  ];

  for (const { type, count } of types) {
    const existingCount = questQueries.countPlayerQuestsByType.get(playerId, type, now) as { count: number };

    if (existingCount.count < count) {
      const needed = count - existingCount.count;
      const quests = selectRandomQuests(type, needed);
      const expiration = getQuestExpiration(type);

      for (const quest of quests) {
        questQueries.insertQuest.run(playerId, quest.id, expiration);
      }
    }
  }
}

export function updateQuestProgress(
  playerId: string,
  action: string,
  amount: number,
  condition?: Record<string, unknown>
): { updated: PlayerQuest[]; completed: PlayerQuest[] } {
  const now = Math.floor(Date.now() / 1000);

  // Get active quests
  const quests = questQueries.getPlayerActiveQuests.all(playerId, now) as Array<{
    id: number;
    quest_id: string;
    progress: number;
    completed: number;
    expires_at: number;
    claimed: number;
    name: string;
    description: string;
    criteria: string;
    rewards: string;
    difficulty: QuestDifficulty;
    type: QuestType;
  }>;

  const updated: PlayerQuest[] = [];
  const completed: PlayerQuest[] = [];

  for (const quest of quests) {
    if (quest.completed) continue;

    const criteria = JSON.parse(quest.criteria) as QuestCriteria;

    // Check if this action applies to this quest
    if (criteria.action !== action) continue;

    // Check conditions if any
    if (criteria.condition && condition) {
      let matches = true;
      for (const [key, value] of Object.entries(criteria.condition)) {
        if (key === 'mode' && value === 'team') {
          // Special case: team modes
          if (!['2v2', '5v5'].includes(condition.mode as string)) {
            matches = false;
            break;
          }
        } else if (condition[key] !== value) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
    }

    // Update progress
    const newProgress = quest.progress + amount;
    const isCompleted = newProgress >= criteria.target;

    questQueries.updateQuestProgress.run(
      Math.min(newProgress, criteria.target),
      isCompleted ? 1 : 0,
      isCompleted ? now : null,
      quest.id
    );

    const questData: PlayerQuest = {
      id: quest.id,
      playerId,
      questId: quest.quest_id,
      progress: Math.min(newProgress, criteria.target),
      completed: isCompleted,
      completedAt: isCompleted ? now : null,
      expiresAt: quest.expires_at,
      claimed: false,
    };

    updated.push(questData);
    if (isCompleted) {
      completed.push(questData);
    }
  }

  return { updated, completed };
}

export function claimQuestReward(playerId: string, questId: number): {
  success: boolean;
  rewards?: QuestReward[];
  streakBonus?: number;
  error?: string;
} {
  const quest = questQueries.getPlayerQuestById.get(questId, playerId) as {
    id: number;
    quest_id: string;
    progress: number;
    completed: number;
    completed_at: number | null;
    expires_at: number;
    claimed: number;
    rewards: string;
  } | undefined;

  if (!quest) {
    return { success: false, error: 'Quest not found' };
  }

  if (!quest.completed) {
    return { success: false, error: 'Quest not completed' };
  }

  if (quest.claimed) {
    return { success: false, error: 'Reward already claimed' };
  }

  // Claim the quest
  questQueries.claimQuest.run(questId);

  const rewards = JSON.parse(quest.rewards) as QuestReward[];

  // Update streak
  const streak = updateStreak(playerId);

  // Apply streak bonus (up to 50% at 10+ days)
  const streakBonus = Math.min(50, streak.current * 5);
  if (streakBonus > 0) {
    for (const reward of rewards) {
      if (['gold', 'xp'].includes(reward.type)) {
        reward.amount = Math.round(reward.amount * (1 + streakBonus / 100));
      }
    }
  }

  // Add XP to season pass
  const xpReward = rewards.find(r => r.type === 'xp');
  if (xpReward) {
    addSeasonXp(playerId, xpReward.amount);
  }

  return { success: true, rewards, streakBonus };
}

function updateStreak(playerId: string): { current: number; longest: number } {
  const now = Math.floor(Date.now() / 1000);
  const today = Math.floor(now / (24 * 60 * 60));

  let streak = questQueries.getStreak.get(playerId) as {
    player_id: string;
    current_streak: number;
    longest_streak: number;
    last_completion: number | null;
    total_completed: number;
    weekly_refresh_tokens: number;
    last_token_refresh: number | null;
  } | undefined;

  if (!streak) {
    streak = {
      player_id: playerId,
      current_streak: 0,
      longest_streak: 0,
      last_completion: null,
      total_completed: 0,
      weekly_refresh_tokens: 1,
      last_token_refresh: null,
    };
  }

  const lastDay = streak.last_completion ? Math.floor(streak.last_completion / (24 * 60 * 60)) : 0;

  let newStreak = streak.current_streak;
  if (lastDay === today) {
    // Already completed today, no change
  } else if (lastDay === today - 1) {
    // Consecutive day
    newStreak++;
  } else {
    // Streak broken
    newStreak = 1;
  }

  const newLongest = Math.max(streak.longest_streak, newStreak);

  questQueries.upsertStreak.run(
    playerId,
    newStreak, newLongest, now, streak.total_completed + 1, streak.weekly_refresh_tokens, streak.last_token_refresh,
    newStreak, newLongest, now, streak.total_completed + 1, streak.weekly_refresh_tokens, streak.last_token_refresh
  );

  return { current: newStreak, longest: newLongest };
}

export function refreshQuest(playerId: string, questId: number, usePremiumToken: boolean): {
  success: boolean;
  newQuest?: QuestTemplate;
  error?: string;
} {
  const now = Math.floor(Date.now() / 1000);

  // Get the quest to refresh
  const quest = questQueries.getPlayerQuestById.get(questId, playerId) as {
    id: number;
    quest_id: string;
    completed: number;
    expires_at: number;
  } | undefined;

  if (!quest) {
    return { success: false, error: 'Quest not found' };
  }

  if (quest.completed) {
    return { success: false, error: 'Cannot refresh completed quest' };
  }

  // Get quest type
  const template = QUEST_TEMPLATES.find(t => t.id === quest.quest_id);
  if (!template) {
    return { success: false, error: 'Quest template not found' };
  }

  // Only daily quests can be refreshed
  if (template.type !== 'daily') {
    return { success: false, error: 'Only daily quests can be refreshed' };
  }

  // Check refresh token or premium
  if (!usePremiumToken) {
    // Use free weekly token
    const streak = questQueries.getStreak.get(playerId) as {
      weekly_refresh_tokens: number;
      last_token_refresh: number | null;
    } | undefined;

    if (!streak || streak.weekly_refresh_tokens <= 0) {
      return { success: false, error: 'No refresh tokens available' };
    }

    // Use token
    questQueries.upsertStreak.run(
      playerId,
      0, 0, null, 0, streak.weekly_refresh_tokens - 1, now,
      0, 0, null, 0, streak.weekly_refresh_tokens - 1, now
    );
  }

  // Delete old quest and create new one
  db.prepare(`DELETE FROM player_quests WHERE id = ?`).run(questId);

  const newQuests = selectRandomQuests('daily', 1);
  if (newQuests.length === 0) {
    return { success: false, error: 'No quests available' };
  }

  const newQuest = newQuests[0];
  questQueries.insertQuest.run(playerId, newQuest.id, quest.expires_at);

  return { success: true, newQuest };
}

// ============ API ROUTES ============

// Get player quests
router.get('/:playerId', (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const now = Math.floor(Date.now() / 1000);

    // Generate quests if needed
    generatePlayerQuests(playerId);

    const quests = questQueries.getPlayerQuests.all(playerId, now) as Array<{
      id: number;
      quest_id: string;
      progress: number;
      completed: number;
      completed_at: number | null;
      expires_at: number;
      claimed: number;
      name: string;
      description: string;
      criteria: string;
      rewards: string;
      difficulty: QuestDifficulty;
    }>;

    // Get streak info
    const streak = questQueries.getStreak.get(playerId) as {
      current_streak: number;
      longest_streak: number;
      last_completion: number | null;
      total_completed: number;
      weekly_refresh_tokens: number;
    } | undefined;

    // Group by type
    const daily = quests.filter(q => {
      const template = QUEST_TEMPLATES.find(t => t.id === q.quest_id);
      return template?.type === 'daily';
    });
    const weekly = quests.filter(q => {
      const template = QUEST_TEMPLATES.find(t => t.id === q.quest_id);
      return template?.type === 'weekly';
    });
    const monthly = quests.filter(q => {
      const template = QUEST_TEMPLATES.find(t => t.id === q.quest_id);
      return template?.type === 'monthly';
    });

    res.json({
      daily: daily.map(q => formatQuest(q)),
      weekly: weekly.map(q => formatQuest(q)),
      monthly: monthly.map(q => formatQuest(q)),
      streak: {
        current: streak?.current_streak || 0,
        longest: streak?.longest_streak || 0,
        lastCompletion: streak?.last_completion,
        totalCompleted: streak?.total_completed || 0,
        refreshTokens: streak?.weekly_refresh_tokens || 1,
        bonusPercent: Math.min(50, (streak?.current_streak || 0) * 5),
      },
      dailyReset: getQuestExpiration('daily'),
      weeklyReset: getQuestExpiration('weekly'),
      monthlyReset: getQuestExpiration('monthly'),
    });
  } catch (error) {
    console.error('Get quests error:', error);
    res.status(500).json({ error: 'Failed to get quests' });
  }
});

function formatQuest(quest: {
  id: number;
  quest_id: string;
  progress: number;
  completed: number;
  completed_at: number | null;
  expires_at: number;
  claimed: number;
  name: string;
  description: string;
  criteria: string;
  rewards: string;
  difficulty: QuestDifficulty;
}) {
  const criteria = JSON.parse(quest.criteria) as QuestCriteria;
  return {
    id: quest.id,
    questId: quest.quest_id,
    name: quest.name,
    description: quest.description,
    progress: quest.progress,
    target: criteria.target,
    progressPercent: Math.round((quest.progress / criteria.target) * 100),
    completed: quest.completed === 1,
    completedAt: quest.completed_at,
    expiresAt: quest.expires_at,
    claimed: quest.claimed === 1,
    rewards: JSON.parse(quest.rewards),
    difficulty: quest.difficulty,
  };
}

// Complete quest (claim reward)
router.post('/complete', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { questId } = req.body as { questId: number };

    const result = claimQuestReward(req.user.id, questId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      rewards: result.rewards,
      streakBonus: result.streakBonus,
    });
  } catch (error) {
    console.error('Complete quest error:', error);
    res.status(500).json({ error: 'Failed to complete quest' });
  }
});

// Refresh a quest
router.post('/refresh', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { questId, usePremium } = req.body as { questId: number; usePremium: boolean };

    const result = refreshQuest(req.user.id, questId, usePremium);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      newQuest: result.newQuest,
    });
  } catch (error) {
    console.error('Refresh quest error:', error);
    res.status(500).json({ error: 'Failed to refresh quest' });
  }
});

// Update quest progress (called from game events)
router.post('/progress', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { action, amount, condition } = req.body as {
      action: string;
      amount: number;
      condition?: Record<string, unknown>;
    };

    const result = updateQuestProgress(req.user.id, action, amount, condition);

    res.json({
      updated: result.updated.length,
      completed: result.completed.map(q => ({
        id: q.id,
        questId: q.questId,
      })),
    });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

export { router as questRouter };
