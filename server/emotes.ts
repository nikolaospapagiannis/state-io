import { Router } from 'express';
import { db } from './database';
import { authenticateToken } from './auth';

export const emoteRouter = Router();

// ============ EMOTE DEFINITIONS ============

export type EmoteRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type EmoteCategory = 'expression' | 'celebration' | 'taunt' | 'tactical' | 'seasonal' | 'exclusive';

export interface Emote {
  id: string;
  name: string;
  category: EmoteCategory;
  rarity: EmoteRarity;
  animation: string; // Animation identifier
  duration: number; // Animation duration in ms
  cooldown: number; // Cooldown in ms
  sound?: string; // Sound effect identifier
  available: boolean; // If false, must be unlocked
  unlockMethod?: {
    type: 'default' | 'level' | 'wins' | 'purchase' | 'battlepass' | 'achievement' | 'seasonal' | 'exclusive';
    value?: number; // Level number, win count, price in gems, etc.
    achievementId?: string;
    seasonId?: string;
  };
  price?: number; // Price in gems if purchasable
  description: string;
}

export const EMOTES: Emote[] = [
  // ============ EXPRESSION EMOTES (10) ============
  { id: 'wave', name: 'Wave', category: 'expression', rarity: 'common', animation: 'wave', duration: 1500, cooldown: 5000, available: true,
    unlockMethod: { type: 'default' }, description: 'A friendly wave' },
  { id: 'thumbsup', name: 'Thumbs Up', category: 'expression', rarity: 'common', animation: 'thumbsup', duration: 1200, cooldown: 5000, available: true,
    unlockMethod: { type: 'default' }, description: 'Show your approval' },
  { id: 'thumbsdown', name: 'Thumbs Down', category: 'expression', rarity: 'common', animation: 'thumbsdown', duration: 1200, cooldown: 5000, available: true,
    unlockMethod: { type: 'default' }, description: 'Show disapproval' },
  { id: 'clap', name: 'Clap', category: 'expression', rarity: 'uncommon', animation: 'clap', duration: 2000, cooldown: 5000, sound: 'clap', available: false,
    unlockMethod: { type: 'level', value: 5 }, description: 'Applause!' },
  { id: 'laugh', name: 'Laugh', category: 'expression', rarity: 'uncommon', animation: 'laugh', duration: 2000, cooldown: 5000, sound: 'laugh', available: false,
    unlockMethod: { type: 'level', value: 10 }, description: 'Ha ha ha!' },
  { id: 'cry', name: 'Cry', category: 'expression', rarity: 'uncommon', animation: 'cry', duration: 2000, cooldown: 5000, available: false,
    unlockMethod: { type: 'level', value: 8 }, description: 'Tears of sadness' },
  { id: 'angry', name: 'Angry', category: 'expression', rarity: 'uncommon', animation: 'angry', duration: 1500, cooldown: 5000, available: false,
    unlockMethod: { type: 'level', value: 12 }, description: 'Grrrr!' },
  { id: 'love', name: 'Love', category: 'expression', rarity: 'rare', animation: 'love', duration: 2000, cooldown: 5000, available: false,
    unlockMethod: { type: 'wins', value: 25 }, description: 'Spread the love' },
  { id: 'shock', name: 'Shocked', category: 'expression', rarity: 'rare', animation: 'shock', duration: 1500, cooldown: 5000, available: false,
    unlockMethod: { type: 'wins', value: 15 }, description: 'Surprised!' },
  { id: 'sleepy', name: 'Sleepy', category: 'expression', rarity: 'rare', animation: 'sleepy', duration: 2500, cooldown: 5000, available: false,
    unlockMethod: { type: 'purchase', value: 100 }, price: 100, description: 'Zzz...' },

  // ============ CELEBRATION EMOTES (8) ============
  { id: 'confetti', name: 'Confetti', category: 'celebration', rarity: 'uncommon', animation: 'confetti', duration: 2500, cooldown: 8000, sound: 'confetti', available: false,
    unlockMethod: { type: 'wins', value: 5 }, description: 'Party time!' },
  { id: 'fireworks', name: 'Fireworks', category: 'celebration', rarity: 'rare', animation: 'fireworks', duration: 3000, cooldown: 10000, sound: 'fireworks', available: false,
    unlockMethod: { type: 'wins', value: 50 }, description: 'Celebrate with fireworks' },
  { id: 'trophy', name: 'Trophy', category: 'celebration', rarity: 'rare', animation: 'trophy', duration: 2000, cooldown: 8000, available: false,
    unlockMethod: { type: 'wins', value: 100 }, description: 'Champion!' },
  { id: 'crown', name: 'Crown', category: 'celebration', rarity: 'epic', animation: 'crown', duration: 2500, cooldown: 10000, available: false,
    unlockMethod: { type: 'achievement', achievementId: 'king_of_hill' }, description: 'Bow to the king' },
  { id: 'dance', name: 'Dance', category: 'celebration', rarity: 'rare', animation: 'dance', duration: 3000, cooldown: 8000, sound: 'music', available: false,
    unlockMethod: { type: 'purchase', value: 200 }, price: 200, description: 'Get your groove on' },
  { id: 'champagne', name: 'Champagne', category: 'celebration', rarity: 'epic', animation: 'champagne', duration: 2500, cooldown: 10000, sound: 'pop', available: false,
    unlockMethod: { type: 'purchase', value: 500 }, price: 500, description: 'Pop the bubbly' },
  { id: 'medal', name: 'Medal', category: 'celebration', rarity: 'uncommon', animation: 'medal', duration: 2000, cooldown: 8000, available: false,
    unlockMethod: { type: 'level', value: 20 }, description: 'Well deserved' },
  { id: 'star', name: 'Superstar', category: 'celebration', rarity: 'rare', animation: 'star', duration: 2000, cooldown: 8000, available: false,
    unlockMethod: { type: 'wins', value: 200 }, description: 'You are a star!' },

  // ============ TAUNT EMOTES (6) ============
  { id: 'taunt_wave', name: 'Bye Bye', category: 'taunt', rarity: 'uncommon', animation: 'taunt_wave', duration: 1500, cooldown: 10000, available: false,
    unlockMethod: { type: 'level', value: 15 }, description: 'See ya later!' },
  { id: 'yawn', name: 'Yawn', category: 'taunt', rarity: 'uncommon', animation: 'yawn', duration: 2000, cooldown: 10000, available: false,
    unlockMethod: { type: 'wins', value: 30 }, description: 'Boring!' },
  { id: 'flex', name: 'Flex', category: 'taunt', rarity: 'rare', animation: 'flex', duration: 2000, cooldown: 10000, available: false,
    unlockMethod: { type: 'wins', value: 75 }, description: 'Show your strength' },
  { id: 'shrug', name: 'Shrug', category: 'taunt', rarity: 'uncommon', animation: 'shrug', duration: 1500, cooldown: 8000, available: false,
    unlockMethod: { type: 'level', value: 18 }, description: 'Whatever...' },
  { id: 'facepalm', name: 'Facepalm', category: 'taunt', rarity: 'rare', animation: 'facepalm', duration: 2000, cooldown: 8000, available: false,
    unlockMethod: { type: 'purchase', value: 150 }, price: 150, description: 'Oh no...' },
  { id: 'dab', name: 'Dab', category: 'taunt', rarity: 'rare', animation: 'dab', duration: 1500, cooldown: 10000, sound: 'woosh', available: false,
    unlockMethod: { type: 'purchase', value: 300 }, price: 300, description: 'Hit the dab' },

  // ============ TACTICAL EMOTES (4) ============
  { id: 'question', name: 'Question', category: 'tactical', rarity: 'common', animation: 'question', duration: 2000, cooldown: 3000, available: true,
    unlockMethod: { type: 'default' }, description: 'What should we do?' },
  { id: 'exclaim', name: 'Alert', category: 'tactical', rarity: 'common', animation: 'exclaim', duration: 2000, cooldown: 3000, available: true,
    unlockMethod: { type: 'default' }, description: 'Pay attention!' },
  { id: 'target', name: 'Target', category: 'tactical', rarity: 'uncommon', animation: 'target', duration: 2500, cooldown: 5000, available: false,
    unlockMethod: { type: 'level', value: 7 }, description: 'Mark the target' },
  { id: 'shield', name: 'Defend', category: 'tactical', rarity: 'uncommon', animation: 'shield', duration: 2500, cooldown: 5000, available: false,
    unlockMethod: { type: 'level', value: 9 }, description: 'Hold the line!' },

  // ============ SEASONAL EMOTES (4) ============
  { id: 'pumpkin', name: 'Pumpkin', category: 'seasonal', rarity: 'rare', animation: 'pumpkin', duration: 2500, cooldown: 8000, available: false,
    unlockMethod: { type: 'seasonal', seasonId: 'halloween_2026' }, description: 'Spooky season!' },
  { id: 'snowflake', name: 'Snowflake', category: 'seasonal', rarity: 'rare', animation: 'snowflake', duration: 2500, cooldown: 8000, available: false,
    unlockMethod: { type: 'seasonal', seasonId: 'winter_2026' }, description: 'Let it snow' },
  { id: 'heart', name: 'Valentine', category: 'seasonal', rarity: 'rare', animation: 'heart', duration: 2000, cooldown: 8000, available: false,
    unlockMethod: { type: 'seasonal', seasonId: 'valentine_2026' }, description: 'Spread the love' },
  { id: 'firework_usa', name: 'Firework', category: 'seasonal', rarity: 'rare', animation: 'firework_usa', duration: 3000, cooldown: 10000, available: false,
    unlockMethod: { type: 'seasonal', seasonId: 'summer_2026' }, description: 'Celebrate!' },

  // ============ EXCLUSIVE EMOTES (3) ============
  { id: 'founders', name: 'Founder Badge', category: 'exclusive', rarity: 'legendary', animation: 'founders', duration: 3000, cooldown: 10000, available: false,
    unlockMethod: { type: 'exclusive' }, description: 'For founding players only' },
  { id: 'esports', name: 'Pro Player', category: 'exclusive', rarity: 'legendary', animation: 'esports', duration: 3000, cooldown: 10000, available: false,
    unlockMethod: { type: 'exclusive' }, description: 'Tournament champion' },
  { id: 'streamer', name: 'Streamer', category: 'exclusive', rarity: 'legendary', animation: 'streamer', duration: 3000, cooldown: 10000, available: false,
    unlockMethod: { type: 'exclusive' }, description: 'Content creator special' },
];

// Rarity colors for UI
export const RARITY_COLORS: Record<EmoteRarity, { primary: number; glow: number; text: string }> = {
  common: { primary: 0x9e9e9e, glow: 0x757575, text: '#9e9e9e' },
  uncommon: { primary: 0x4caf50, glow: 0x388e3c, text: '#4caf50' },
  rare: { primary: 0x2196f3, glow: 0x1976d2, text: '#2196f3' },
  epic: { primary: 0x9c27b0, glow: 0x7b1fa2, text: '#9c27b0' },
  legendary: { primary: 0xff9800, glow: 0xf57c00, text: '#ff9800' },
};

// ============ DATABASE INITIALIZATION ============

export function initEmoteTables(): void {
  // User emote inventory
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_emotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      emote_id TEXT NOT NULL,
      unlocked_at INTEGER NOT NULL,
      unlock_method TEXT NOT NULL,
      usage_count INTEGER DEFAULT 0,
      UNIQUE(user_id, emote_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Emote loadout (equipped emotes)
  db.exec(`
    CREATE TABLE IF NOT EXISTS emote_loadout (
      user_id TEXT PRIMARY KEY,
      slot_1 TEXT DEFAULT 'wave',
      slot_2 TEXT DEFAULT 'thumbsup',
      slot_3 TEXT DEFAULT 'question',
      slot_4 TEXT DEFAULT 'exclaim',
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Emote usage tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS emote_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      emote_id TEXT NOT NULL,
      room_id TEXT,
      used_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Emote analytics
  db.exec(`
    CREATE TABLE IF NOT EXISTS emote_analytics (
      emote_id TEXT PRIMARY KEY,
      total_uses INTEGER DEFAULT 0,
      unique_users INTEGER DEFAULT 0,
      last_used INTEGER
    )
  `);

  console.log('[Emotes] Tables initialized');
}

// ============ EMOTE QUERIES ============

export const emoteQueries = {
  // Get user's unlocked emotes
  getUserEmotes: db.prepare(`
    SELECT * FROM user_emotes WHERE user_id = ?
  `),

  // Check if user has emote
  hasEmote: db.prepare(`
    SELECT 1 FROM user_emotes WHERE user_id = ? AND emote_id = ?
  `),

  // Unlock emote
  unlockEmote: db.prepare(`
    INSERT OR IGNORE INTO user_emotes (user_id, emote_id, unlocked_at, unlock_method)
    VALUES (?, ?, ?, ?)
  `),

  // Get loadout
  getLoadout: db.prepare(`
    SELECT * FROM emote_loadout WHERE user_id = ?
  `),

  // Create default loadout
  createLoadout: db.prepare(`
    INSERT OR IGNORE INTO emote_loadout (user_id, slot_1, slot_2, slot_3, slot_4)
    VALUES (?, 'wave', 'thumbsup', 'question', 'exclaim')
  `),

  // Update loadout
  updateLoadout: db.prepare(`
    INSERT OR REPLACE INTO emote_loadout (user_id, slot_1, slot_2, slot_3, slot_4)
    VALUES (?, ?, ?, ?, ?)
  `),

  // Track emote usage
  trackUsage: db.prepare(`
    INSERT INTO emote_usage (user_id, emote_id, room_id, used_at)
    VALUES (?, ?, ?, ?)
  `),

  // Update usage count
  incrementUsage: db.prepare(`
    UPDATE user_emotes SET usage_count = usage_count + 1 WHERE user_id = ? AND emote_id = ?
  `),

  // Get emote stats
  getEmoteStats: db.prepare(`
    SELECT emote_id, COUNT(*) as uses FROM emote_usage WHERE user_id = ? GROUP BY emote_id ORDER BY uses DESC
  `),

  // Update analytics
  updateAnalytics: db.prepare(`
    INSERT INTO emote_analytics (emote_id, total_uses, unique_users, last_used)
    VALUES (?, 1, 1, ?)
    ON CONFLICT(emote_id) DO UPDATE SET
      total_uses = total_uses + 1,
      last_used = excluded.last_used
  `),
};

// ============ EMOTE COOLDOWNS ============

const emoteCooldowns = new Map<string, Map<string, number>>(); // userId -> emoteId -> lastUsed

export function checkEmoteCooldown(userId: string, emoteId: string): { allowed: boolean; cooldownRemaining: number } {
  const now = Date.now();
  const emote = EMOTES.find(e => e.id === emoteId);

  if (!emote) {
    return { allowed: false, cooldownRemaining: 0 };
  }

  let userCooldowns = emoteCooldowns.get(userId);
  if (!userCooldowns) {
    userCooldowns = new Map();
    emoteCooldowns.set(userId, userCooldowns);
  }

  const lastUsed = userCooldowns.get(emoteId) || 0;
  const cooldownRemaining = Math.max(0, emote.cooldown - (now - lastUsed));

  if (cooldownRemaining > 0) {
    return { allowed: false, cooldownRemaining };
  }

  userCooldowns.set(emoteId, now);
  return { allowed: true, cooldownRemaining: 0 };
}

// ============ HELPER FUNCTIONS ============

export function canUserUseEmote(userId: string, emoteId: string): boolean {
  const emote = EMOTES.find(e => e.id === emoteId);
  if (!emote) return false;

  // Default emotes are always available
  if (emote.available || emote.unlockMethod?.type === 'default') {
    return true;
  }

  // Check if user has unlocked this emote
  const hasEmote = emoteQueries.hasEmote.get(userId, emoteId);
  return !!hasEmote;
}

export function getAvailableEmotesForUser(userId: string): Emote[] {
  const unlockedEmotes = emoteQueries.getUserEmotes.all(userId) as { emote_id: string }[];
  const unlockedIds = new Set(unlockedEmotes.map(e => e.emote_id));

  return EMOTES.filter(emote => {
    if (emote.available || emote.unlockMethod?.type === 'default') {
      return true;
    }
    return unlockedIds.has(emote.id);
  });
}

// ============ API ROUTES ============

// Get all emotes (with unlock status)
emoteRouter.get('/', authenticateToken, (req, res) => {
  const userId = (req as any).user.id;

  const unlockedEmotes = emoteQueries.getUserEmotes.all(userId) as { emote_id: string; usage_count: number }[];
  const unlockedIds = new Set(unlockedEmotes.map(e => e.emote_id));
  const usageMap = new Map(unlockedEmotes.map(e => [e.emote_id, e.usage_count]));

  const emotesWithStatus = EMOTES.map(emote => ({
    ...emote,
    unlocked: emote.available || emote.unlockMethod?.type === 'default' || unlockedIds.has(emote.id),
    usageCount: usageMap.get(emote.id) || 0,
  }));

  res.json({
    emotes: emotesWithStatus,
    categories: ['expression', 'celebration', 'taunt', 'tactical', 'seasonal', 'exclusive'],
    rarities: Object.keys(RARITY_COLORS),
  });
});

// Get user's emote loadout
emoteRouter.get('/loadout', authenticateToken, (req, res) => {
  const userId = (req as any).user.id;

  let loadout = emoteQueries.getLoadout.get(userId) as Record<string, string> | undefined;

  if (!loadout) {
    emoteQueries.createLoadout.run(userId);
    loadout = emoteQueries.getLoadout.get(userId) as Record<string, string>;
  }

  const emoteDetails = {
    slot_1: EMOTES.find(e => e.id === loadout!.slot_1),
    slot_2: EMOTES.find(e => e.id === loadout!.slot_2),
    slot_3: EMOTES.find(e => e.id === loadout!.slot_3),
    slot_4: EMOTES.find(e => e.id === loadout!.slot_4),
  };

  res.json({
    loadout,
    emotes: emoteDetails,
  });
});

// Update loadout
emoteRouter.put('/loadout', authenticateToken, (req, res) => {
  const userId = (req as any).user.id;
  const { slot_1, slot_2, slot_3, slot_4 } = req.body;

  // Validate all emotes exist and user has access
  const slots = [slot_1, slot_2, slot_3, slot_4];
  for (const emoteId of slots) {
    if (emoteId && !canUserUseEmote(userId, emoteId)) {
      return res.status(400).json({ error: `Emote ${emoteId} not unlocked` });
    }
  }

  const currentLoadout = emoteQueries.getLoadout.get(userId) as Record<string, string> | undefined;

  emoteQueries.updateLoadout.run(
    userId,
    slot_1 || currentLoadout?.slot_1 || 'wave',
    slot_2 || currentLoadout?.slot_2 || 'thumbsup',
    slot_3 || currentLoadout?.slot_3 || 'question',
    slot_4 || currentLoadout?.slot_4 || 'exclaim'
  );

  res.json({ success: true });
});

// Purchase emote
emoteRouter.post('/purchase/:emoteId', authenticateToken, async (req, res) => {
  const userId = (req as any).user.id;
  const { emoteId } = req.params;

  const emote = EMOTES.find(e => e.id === emoteId);

  if (!emote) {
    return res.status(404).json({ error: 'Emote not found' });
  }

  if (emote.unlockMethod?.type !== 'purchase' || !emote.price) {
    return res.status(400).json({ error: 'Emote cannot be purchased' });
  }

  // Check if already owned
  if (canUserUseEmote(userId, emoteId)) {
    return res.status(400).json({ error: 'Emote already owned' });
  }

  // Check gems balance (integrate with currency system)
  const user = db.prepare('SELECT gems FROM users WHERE id = ?').get(userId) as { gems: number } | undefined;

  if (!user || user.gems < emote.price) {
    return res.status(400).json({ error: 'Insufficient gems' });
  }

  // Deduct gems and unlock emote
  db.prepare('UPDATE users SET gems = gems - ? WHERE id = ?').run(emote.price, userId);
  emoteQueries.unlockEmote.run(userId, emoteId, Date.now(), 'purchase');

  res.json({
    success: true,
    emote,
    gemsSpent: emote.price,
  });
});

// Get emote usage stats
emoteRouter.get('/stats', authenticateToken, (req, res) => {
  const userId = (req as any).user.id;

  const stats = emoteQueries.getEmoteStats.all(userId) as { emote_id: string; uses: number }[];

  const statsWithDetails = stats.map(s => ({
    emote: EMOTES.find(e => e.id === s.emote_id),
    uses: s.uses,
  }));

  res.json({
    stats: statsWithDetails,
    totalUses: stats.reduce((sum, s) => sum + s.uses, 0),
  });
});

// Unlock emote by achievement/level (internal use)
export function unlockEmoteForUser(userId: string, emoteId: string, method: string): boolean {
  const emote = EMOTES.find(e => e.id === emoteId);
  if (!emote) return false;

  try {
    emoteQueries.unlockEmote.run(userId, emoteId, Date.now(), method);
    return true;
  } catch {
    return false;
  }
}

// Check and unlock level-based emotes
export function checkLevelEmoteUnlocks(userId: string, level: number): Emote[] {
  const unlockedEmotes: Emote[] = [];

  for (const emote of EMOTES) {
    if (emote.unlockMethod?.type === 'level' && emote.unlockMethod.value && level >= emote.unlockMethod.value) {
      if (!canUserUseEmote(userId, emote.id)) {
        if (unlockEmoteForUser(userId, emote.id, 'level')) {
          unlockedEmotes.push(emote);
        }
      }
    }
  }

  return unlockedEmotes;
}

// Check and unlock win-based emotes
export function checkWinEmoteUnlocks(userId: string, totalWins: number): Emote[] {
  const unlockedEmotes: Emote[] = [];

  for (const emote of EMOTES) {
    if (emote.unlockMethod?.type === 'wins' && emote.unlockMethod.value && totalWins >= emote.unlockMethod.value) {
      if (!canUserUseEmote(userId, emote.id)) {
        if (unlockEmoteForUser(userId, emote.id, 'wins')) {
          unlockedEmotes.push(emote);
        }
      }
    }
  }

  return unlockedEmotes;
}

export default emoteRouter;
