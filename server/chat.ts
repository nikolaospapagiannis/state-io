import { Router } from 'express';
import { db } from './database';
import { authenticateToken } from './auth';

export const chatRouter = Router();

// ============ QUICK CHAT MESSAGES ============
// Predefined messages with localization support

export interface QuickChatMessage {
  id: string;
  category: 'greeting' | 'tactical' | 'reaction' | 'postgame';
  key: string;
  translations: Record<string, string>;
  cooldown: number; // milliseconds
  available: boolean; // if false, must be unlocked
  unlockRequirement?: {
    type: 'level' | 'wins' | 'purchase' | 'battlepass';
    value: number;
  };
}

export const QUICK_CHAT_MESSAGES: QuickChatMessage[] = [
  // Greetings
  { id: 'gl', category: 'greeting', key: 'good_luck', cooldown: 5000, available: true,
    translations: { en: 'Good luck!', es: 'Buena suerte!', fr: 'Bonne chance!', de: 'Viel Gluck!', ja: 'Good luck!', zh: 'Good luck!', ko: 'Good luck!', pt: 'Boa sorte!', ru: 'Good luck!', it: 'Buona fortuna!' }},
  { id: 'hf', category: 'greeting', key: 'have_fun', cooldown: 5000, available: true,
    translations: { en: 'Have fun!', es: 'Diviertete!', fr: 'Amusez-vous!', de: 'Viel Spass!', ja: 'Have fun!', zh: 'Have fun!', ko: 'Have fun!', pt: 'Divirta-se!', ru: 'Have fun!', it: 'Divertiti!' }},
  { id: 'hi', category: 'greeting', key: 'hello', cooldown: 5000, available: true,
    translations: { en: 'Hello!', es: 'Hola!', fr: 'Bonjour!', de: 'Hallo!', ja: 'Hello!', zh: 'Hello!', ko: 'Hello!', pt: 'Ola!', ru: 'Hello!', it: 'Ciao!' }},

  // Tactical
  { id: 'help', category: 'tactical', key: 'help', cooldown: 3000, available: true,
    translations: { en: 'Help!', es: 'Ayuda!', fr: 'Aide!', de: 'Hilfe!', ja: 'Help!', zh: 'Help!', ko: 'Help!', pt: 'Ajuda!', ru: 'Help!', it: 'Aiuto!' }},
  { id: 'attack', category: 'tactical', key: 'attack', cooldown: 3000, available: true,
    translations: { en: 'Attack!', es: 'Atacar!', fr: 'Attaquez!', de: 'Angriff!', ja: 'Attack!', zh: 'Attack!', ko: 'Attack!', pt: 'Ataque!', ru: 'Attack!', it: 'Attacca!' }},
  { id: 'defend', category: 'tactical', key: 'defend', cooldown: 3000, available: true,
    translations: { en: 'Defend!', es: 'Defender!', fr: 'Defendez!', de: 'Verteidigen!', ja: 'Defend!', zh: 'Defend!', ko: 'Defend!', pt: 'Defenda!', ru: 'Defend!', it: 'Difendi!' }},
  { id: 'wait', category: 'tactical', key: 'wait', cooldown: 3000, available: true,
    translations: { en: 'Wait!', es: 'Espera!', fr: 'Attendez!', de: 'Warte!', ja: 'Wait!', zh: 'Wait!', ko: 'Wait!', pt: 'Espere!', ru: 'Wait!', it: 'Aspetta!' }},
  { id: 'go', category: 'tactical', key: 'go', cooldown: 3000, available: true,
    translations: { en: 'Go!', es: 'Vamos!', fr: 'Allez!', de: 'Los!', ja: 'Go!', zh: 'Go!', ko: 'Go!', pt: 'Vai!', ru: 'Go!', it: 'Vai!' }},
  { id: 'focus', category: 'tactical', key: 'focus_target', cooldown: 3000, available: false,
    unlockRequirement: { type: 'wins', value: 10 },
    translations: { en: 'Focus target!', es: 'Objetivo!', fr: 'Ciblez!', de: 'Ziel fokussieren!', ja: 'Focus!', zh: 'Focus!', ko: 'Focus!', pt: 'Foco!', ru: 'Focus!', it: 'Concentrati!' }},
  { id: 'retreat', category: 'tactical', key: 'retreat', cooldown: 3000, available: false,
    unlockRequirement: { type: 'level', value: 5 },
    translations: { en: 'Retreat!', es: 'Retirada!', fr: 'Retraite!', de: 'Ruckzug!', ja: 'Retreat!', zh: 'Retreat!', ko: 'Retreat!', pt: 'Recuar!', ru: 'Retreat!', it: 'Ritirata!' }},

  // Reactions
  { id: 'thanks', category: 'reaction', key: 'thanks', cooldown: 5000, available: true,
    translations: { en: 'Thanks!', es: 'Gracias!', fr: 'Merci!', de: 'Danke!', ja: 'Thanks!', zh: 'Thanks!', ko: 'Thanks!', pt: 'Obrigado!', ru: 'Thanks!', it: 'Grazie!' }},
  { id: 'sorry', category: 'reaction', key: 'sorry', cooldown: 5000, available: true,
    translations: { en: 'Sorry!', es: 'Lo siento!', fr: 'Desole!', de: 'Entschuldigung!', ja: 'Sorry!', zh: 'Sorry!', ko: 'Sorry!', pt: 'Desculpe!', ru: 'Sorry!', it: 'Scusa!' }},
  { id: 'nice', category: 'reaction', key: 'nice', cooldown: 5000, available: true,
    translations: { en: 'Nice!', es: 'Genial!', fr: 'Super!', de: 'Toll!', ja: 'Nice!', zh: 'Nice!', ko: 'Nice!', pt: 'Legal!', ru: 'Nice!', it: 'Bello!' }},
  { id: 'wow', category: 'reaction', key: 'wow', cooldown: 5000, available: true,
    translations: { en: 'Wow!', es: 'Guau!', fr: 'Ouah!', de: 'Wow!', ja: 'Wow!', zh: 'Wow!', ko: 'Wow!', pt: 'Uau!', ru: 'Wow!', it: 'Wow!' }},
  { id: 'oops', category: 'reaction', key: 'oops', cooldown: 5000, available: false,
    unlockRequirement: { type: 'level', value: 3 },
    translations: { en: 'Oops!', es: 'Ups!', fr: 'Oups!', de: 'Hoppla!', ja: 'Oops!', zh: 'Oops!', ko: 'Oops!', pt: 'Ops!', ru: 'Oops!', it: 'Ops!' }},
  { id: 'no', category: 'reaction', key: 'no', cooldown: 5000, available: false,
    unlockRequirement: { type: 'level', value: 2 },
    translations: { en: 'No!', es: 'No!', fr: 'Non!', de: 'Nein!', ja: 'No!', zh: 'No!', ko: 'No!', pt: 'Nao!', ru: 'No!', it: 'No!' }},

  // Post-game
  { id: 'gg', category: 'postgame', key: 'gg', cooldown: 0, available: true,
    translations: { en: 'GG!', es: 'Buen juego!', fr: 'Bien joue!', de: 'Gut gespielt!', ja: 'GG!', zh: 'GG!', ko: 'GG!', pt: 'GG!', ru: 'GG!', it: 'GG!' }},
  { id: 'wp', category: 'postgame', key: 'well_played', cooldown: 0, available: true,
    translations: { en: 'Well played!', es: 'Bien jugado!', fr: 'Bien joue!', de: 'Gut gespielt!', ja: 'Well played!', zh: 'Well played!', ko: 'Well played!', pt: 'Bem jogado!', ru: 'Well played!', it: 'Ben giocato!' }},
  { id: 'rematch', category: 'postgame', key: 'rematch', cooldown: 0, available: true,
    translations: { en: 'Rematch?', es: 'Revancha?', fr: 'Revanche?', de: 'Revanche?', ja: 'Rematch?', zh: 'Rematch?', ko: 'Rematch?', pt: 'Revanche?', ru: 'Rematch?', it: 'Rivincita?' }},
  { id: 'goodgame', category: 'postgame', key: 'good_game', cooldown: 0, available: true,
    translations: { en: 'Good game!', es: 'Buen juego!', fr: 'Bien joue!', de: 'Gutes Spiel!', ja: 'Good game!', zh: 'Good game!', ko: 'Good game!', pt: 'Bom jogo!', ru: 'Good game!', it: 'Bella partita!' }},
  { id: 'ez', category: 'postgame', key: 'easy', cooldown: 0, available: false,
    unlockRequirement: { type: 'wins', value: 50 },
    translations: { en: 'EZ', es: 'Facil', fr: 'Facile', de: 'Einfach', ja: 'EZ', zh: 'EZ', ko: 'EZ', pt: 'Facil', ru: 'EZ', it: 'Facile' }},
  { id: 'close', category: 'postgame', key: 'close_game', cooldown: 0, available: false,
    unlockRequirement: { type: 'level', value: 10 },
    translations: { en: 'Close game!', es: 'Muy reñido!', fr: 'Serre!', de: 'Knapp!', ja: 'Close!', zh: 'Close!', ko: 'Close!', pt: 'Apertado!', ru: 'Close!', it: 'Combattuto!' }},
];

// ============ PROFANITY FILTER ============

const PROFANITY_PATTERNS: RegExp[] = [
  // Common profanity (patterns to catch variations)
  /\b(f+[u@]+[c(]+[k]+|f+[*]+k+)\b/gi,
  /\b(s+h+[i!1]+[t]+)\b/gi,
  /\b(a+[s$]+[s$]+)\b/gi,
  /\b(b+[i!1]+[t]+c+h+)\b/gi,
  /\b(d+[i!1]+c+k+)\b/gi,
  /\b(c+[u]+n+t+)\b/gi,
  /\b(n+[i!1]+g+g+[e3a]+r*)\b/gi,
  /\b(f+a+g+g*o*t*)\b/gi,
  /\b(r+[e3]+t+[a@]+r+d+)\b/gi,
  /\b(wh+[o0]+r+[e3]+)\b/gi,
  /\b(sl+[u]+t+)\b/gi,
  /\b(k+y+s+)\b/gi,
  /\b(k+[i!1]+l+l+ *y+o+u+r+ *s+e+l+f+)\b/gi,
  /\b(d+[i!1]+e+)\b/gi,
  // Spam patterns
  /(.)\1{5,}/g, // Repeated characters
  /(..+?)\1{3,}/g, // Repeated patterns
];

const REPLACEMENT_CHARS = ['*', '#', '@', '!', '$'];

export function filterProfanity(text: string): { filtered: string; containsProfanity: boolean } {
  let filtered = text;
  let containsProfanity = false;

  for (const pattern of PROFANITY_PATTERNS) {
    if (pattern.test(filtered)) {
      containsProfanity = true;
      filtered = filtered.replace(pattern, (match) => {
        return match.split('').map(() =>
          REPLACEMENT_CHARS[Math.floor(Math.random() * REPLACEMENT_CHARS.length)]
        ).join('');
      });
    }
  }

  return { filtered, containsProfanity };
}

// ============ RATE LIMITING ============

interface RateLimitEntry {
  count: number;
  firstMessage: number;
  lastMessage: number;
  warnings: number;
  muted: boolean;
  mutedUntil: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

const RATE_LIMIT_CONFIG = {
  messagesPerWindow: 10,
  windowMs: 10000, // 10 seconds
  quickChatCooldown: 2000, // 2 seconds between quick chats
  warningThreshold: 3,
  muteDuration: 60000, // 1 minute mute
  muteDurationMultiplier: 2, // Each mute is 2x longer
};

export function checkRateLimit(userId: string): { allowed: boolean; remaining: number; resetIn: number; muted: boolean; muteRemaining?: number } {
  const now = Date.now();
  let entry = rateLimits.get(userId);

  if (!entry) {
    entry = { count: 0, firstMessage: now, lastMessage: now, warnings: 0, muted: false, mutedUntil: 0 };
    rateLimits.set(userId, entry);
  }

  // Check if muted
  if (entry.muted) {
    if (now < entry.mutedUntil) {
      return { allowed: false, remaining: 0, resetIn: 0, muted: true, muteRemaining: entry.mutedUntil - now };
    }
    // Unmute
    entry.muted = false;
    entry.mutedUntil = 0;
  }

  // Reset window if expired
  if (now - entry.firstMessage > RATE_LIMIT_CONFIG.windowMs) {
    entry.count = 0;
    entry.firstMessage = now;
  }

  // Check rate limit
  const remaining = RATE_LIMIT_CONFIG.messagesPerWindow - entry.count;
  const resetIn = RATE_LIMIT_CONFIG.windowMs - (now - entry.firstMessage);

  if (remaining <= 0) {
    entry.warnings++;

    // Mute if too many warnings
    if (entry.warnings >= RATE_LIMIT_CONFIG.warningThreshold) {
      const muteDuration = RATE_LIMIT_CONFIG.muteDuration * Math.pow(RATE_LIMIT_CONFIG.muteDurationMultiplier, entry.warnings - RATE_LIMIT_CONFIG.warningThreshold);
      entry.muted = true;
      entry.mutedUntil = now + muteDuration;
      entry.warnings = 0;
      return { allowed: false, remaining: 0, resetIn, muted: true, muteRemaining: muteDuration };
    }

    return { allowed: false, remaining: 0, resetIn, muted: false };
  }

  // Allow message
  entry.count++;
  entry.lastMessage = now;
  return { allowed: true, remaining: remaining - 1, resetIn, muted: false };
}

// Quick chat specific cooldowns
const quickChatCooldowns = new Map<string, Map<string, number>>(); // userId -> messageId -> lastUsed

export function checkQuickChatCooldown(userId: string, messageId: string): { allowed: boolean; cooldownRemaining: number } {
  const now = Date.now();
  const message = QUICK_CHAT_MESSAGES.find(m => m.id === messageId);

  if (!message) {
    return { allowed: false, cooldownRemaining: 0 };
  }

  let userCooldowns = quickChatCooldowns.get(userId);
  if (!userCooldowns) {
    userCooldowns = new Map();
    quickChatCooldowns.set(userId, userCooldowns);
  }

  const lastUsed = userCooldowns.get(messageId) || 0;
  const cooldownRemaining = Math.max(0, message.cooldown - (now - lastUsed));

  if (cooldownRemaining > 0) {
    return { allowed: false, cooldownRemaining };
  }

  userCooldowns.set(messageId, now);
  return { allowed: true, cooldownRemaining: 0 };
}

// ============ DATABASE INITIALIZATION ============

export function initChatTables(): void {
  // Chat history for moderation
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'quick_chat',
      message_id TEXT,
      custom_message TEXT,
      filtered_message TEXT,
      contained_profanity INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Chat reports
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id TEXT NOT NULL,
      reported_user_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      chat_history_id INTEGER,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at INTEGER,
      action_taken TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (reporter_id) REFERENCES users(id),
      FOREIGN KEY (reported_user_id) REFERENCES users(id),
      FOREIGN KEY (chat_history_id) REFERENCES chat_history(id)
    )
  `);

  // User chat preferences
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_preferences (
      user_id TEXT PRIMARY KEY,
      mute_all INTEGER DEFAULT 0,
      mute_enemies INTEGER DEFAULT 0,
      quick_chat_only INTEGER DEFAULT 0,
      preferred_language TEXT DEFAULT 'en',
      unlocked_messages TEXT DEFAULT '[]',
      equipped_quick_chat TEXT DEFAULT '["gl","attack","defend","help","thanks","sorry","nice","gg"]',
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Mute/ban records
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_restrictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      restriction_type TEXT NOT NULL,
      reason TEXT,
      issued_by TEXT,
      issued_at INTEGER NOT NULL,
      expires_at INTEGER,
      active INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  console.log('[Chat] Tables initialized');
}

// ============ CHAT QUERIES ============

export const chatQueries = {
  // Log chat message
  logMessage: db.prepare(`
    INSERT INTO chat_history (user_id, room_id, message_type, message_id, custom_message, filtered_message, contained_profanity, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  // Get user chat preferences
  getPreferences: db.prepare(`
    SELECT * FROM chat_preferences WHERE user_id = ?
  `),

  // Create/update preferences
  upsertPreferences: db.prepare(`
    INSERT OR REPLACE INTO chat_preferences (user_id, mute_all, mute_enemies, quick_chat_only, preferred_language, unlocked_messages, equipped_quick_chat)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),

  // Get unlocked messages
  getUnlockedMessages: db.prepare(`
    SELECT unlocked_messages FROM chat_preferences WHERE user_id = ?
  `),

  // Unlock message
  unlockMessage: db.prepare(`
    UPDATE chat_preferences SET unlocked_messages = ? WHERE user_id = ?
  `),

  // Report chat
  createReport: db.prepare(`
    INSERT INTO chat_reports (reporter_id, reported_user_id, room_id, chat_history_id, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  // Get active restriction
  getActiveRestriction: db.prepare(`
    SELECT * FROM chat_restrictions
    WHERE user_id = ? AND active = 1 AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY issued_at DESC LIMIT 1
  `),

  // Add restriction
  addRestriction: db.prepare(`
    INSERT INTO chat_restrictions (user_id, restriction_type, reason, issued_by, issued_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
};

// ============ API ROUTES ============

// Get quick chat messages
chatRouter.get('/messages', (_req, res) => {
  res.json({
    messages: QUICK_CHAT_MESSAGES,
    categories: ['greeting', 'tactical', 'reaction', 'postgame'],
  });
});

// Get user chat preferences
chatRouter.get('/preferences', authenticateToken, (req, res) => {
  const userId = (req as any).user.id;

  let prefs = chatQueries.getPreferences.get(userId) as Record<string, unknown> | undefined;

  if (!prefs) {
    // Create default preferences
    const defaultEquipped = JSON.stringify(['gl', 'attack', 'defend', 'help', 'thanks', 'sorry', 'nice', 'gg']);
    chatQueries.upsertPreferences.run(userId, 0, 0, 0, 'en', '[]', defaultEquipped);
    prefs = chatQueries.getPreferences.get(userId) as Record<string, unknown>;
  }

  res.json({
    ...prefs,
    unlocked_messages: JSON.parse(prefs.unlocked_messages as string || '[]'),
    equipped_quick_chat: JSON.parse(prefs.equipped_quick_chat as string || '[]'),
  });
});

// Update chat preferences
chatRouter.put('/preferences', authenticateToken, (req, res) => {
  const userId = (req as any).user.id;
  const { mute_all, mute_enemies, quick_chat_only, preferred_language, equipped_quick_chat } = req.body;

  const currentPrefs = chatQueries.getPreferences.get(userId) as Record<string, unknown> | undefined;

  chatQueries.upsertPreferences.run(
    userId,
    mute_all ?? currentPrefs?.mute_all ?? 0,
    mute_enemies ?? currentPrefs?.mute_enemies ?? 0,
    quick_chat_only ?? currentPrefs?.quick_chat_only ?? 0,
    preferred_language ?? currentPrefs?.preferred_language ?? 'en',
    currentPrefs?.unlocked_messages ?? '[]',
    equipped_quick_chat ? JSON.stringify(equipped_quick_chat) : currentPrefs?.equipped_quick_chat ?? '[]'
  );

  res.json({ success: true });
});

// Report a player for chat abuse
chatRouter.post('/report', authenticateToken, (req, res) => {
  const reporterId = (req as any).user.id;
  const { reported_user_id, room_id, chat_history_id, reason } = req.body;

  if (!reported_user_id || !room_id || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  chatQueries.createReport.run(
    reporterId,
    reported_user_id,
    room_id,
    chat_history_id || null,
    reason,
    Date.now()
  );

  res.json({ success: true, message: 'Report submitted' });
});

// Check if user can send messages
chatRouter.get('/status', authenticateToken, (req, res) => {
  const userId = (req as any).user.id;

  const restriction = chatQueries.getActiveRestriction.get(userId, Date.now()) as Record<string, unknown> | undefined;
  const rateLimit = checkRateLimit(userId);

  res.json({
    canChat: !restriction && rateLimit.allowed,
    restriction: restriction ? {
      type: restriction.restriction_type,
      reason: restriction.reason,
      expiresAt: restriction.expires_at,
    } : null,
    rateLimit: {
      remaining: rateLimit.remaining,
      resetIn: rateLimit.resetIn,
      muted: rateLimit.muted,
      muteRemaining: rateLimit.muteRemaining,
    },
  });
});

export default chatRouter;
