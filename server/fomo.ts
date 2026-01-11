import { Router, Response } from 'express';
import { db } from './database';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, authenticateToken } from './auth';
import { SegmentationService, PlayerSegmentType, SpenderTier } from './segmentation';
import { AnalyticsService } from './analytics';

const router = Router();

// ============ TYPES ============

export enum EventType {
  LIMITED_TIME = 'limited_time',
  FLASH_SALE = 'flash_sale',
  SEASONAL = 'seasonal',
  CHALLENGE = 'challenge',
  BATTLE_PASS = 'battle_pass'
}

export interface LimitedTimeEvent {
  id: string;
  name: string;
  description: string;
  type: EventType;
  startTime: number;
  endTime: number;
  rewards: EventReward[];
  requirements?: EventRequirement[];
  targetSegments?: PlayerSegmentType[];
  maxParticipants?: number;
  currentParticipants: number;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

export interface EventReward {
  type: 'coins' | 'gems' | 'skin' | 'title' | 'avatar' | 'chest' | 'boost';
  value: number | string;
  rarity?: 'common' | 'rare' | 'epic' | 'legendary';
  exclusive?: boolean;
}

export interface EventRequirement {
  type: 'matches_won' | 'matches_played' | 'territories_captured' | 'login_days' | 'purchase';
  target: number;
  current?: number;
}

export interface FlashSale {
  id: string;
  playerId: string;
  itemId: string;
  itemName: string;
  originalPrice: number;
  salePrice: number;
  discount: number; // percentage
  currency: 'coins' | 'gems' | 'usd';
  expiresAt: number;
  isPersonalized: boolean;
  viewed: boolean;
  purchased: boolean;
}

export interface DailyStreak {
  playerId: string;
  currentStreak: number;
  longestStreak: number;
  lastClaimDate: string; // YYYY-MM-DD
  todayClaimed: boolean;
  rewards: StreakReward[];
  nextMilestone: number;
  daysUntilExpire: number;
}

export interface StreakReward {
  day: number;
  reward: EventReward;
  claimed: boolean;
  isMilestone: boolean;
}

export interface LastChanceTrigger {
  playerId: string;
  triggerId: string;
  type: 'event_ending' | 'sale_ending' | 'streak_breaking' | 'limited_stock';
  message: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  expiresAt: number;
  actionUrl?: string;
  sent: boolean;
}

// ============ DATABASE INITIALIZATION ============

export function initFomoTables(): void {
  // Limited time events
  db.exec(`
    CREATE TABLE IF NOT EXISTS limited_time_events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      rewards TEXT NOT NULL,
      requirements TEXT,
      target_segments TEXT,
      max_participants INTEGER,
      current_participants INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      metadata TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Event participation
  db.exec(`
    CREATE TABLE IF NOT EXISTS event_participation (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      joined_at INTEGER DEFAULT (strftime('%s', 'now')),
      progress TEXT DEFAULT '{}',
      completed INTEGER DEFAULT 0,
      rewards_claimed INTEGER DEFAULT 0,
      UNIQUE(event_id, player_id),
      FOREIGN KEY (event_id) REFERENCES limited_time_events(id),
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Flash sales
  db.exec(`
    CREATE TABLE IF NOT EXISTS flash_sales (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      original_price REAL NOT NULL,
      sale_price REAL NOT NULL,
      discount INTEGER NOT NULL,
      currency TEXT DEFAULT 'coins',
      expires_at INTEGER NOT NULL,
      is_personalized INTEGER DEFAULT 0,
      viewed INTEGER DEFAULT 0,
      purchased INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Daily login streaks
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_streaks (
      id TEXT PRIMARY KEY,
      player_id TEXT UNIQUE NOT NULL,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      last_claim_date TEXT,
      streak_history TEXT DEFAULT '[]',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Last chance triggers
  db.exec(`
    CREATE TABLE IF NOT EXISTS last_chance_triggers (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      trigger_id TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      urgency TEXT DEFAULT 'medium',
      expires_at INTEGER NOT NULL,
      action_url TEXT,
      sent INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_active ON limited_time_events(is_active, start_time, end_time)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_event_participation_player ON event_participation(player_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_flash_sales_player ON flash_sales(player_id, expires_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_daily_streaks_player ON daily_streaks(player_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_last_chance_player ON last_chance_triggers(player_id, sent)`);

  console.log('FOMO tables initialized');
}

// Initialize tables immediately
initFomoTables();

// ============ PREPARED STATEMENTS ============

const eventQueries = {
  create: db.prepare(`
    INSERT INTO limited_time_events (id, name, description, type, start_time, end_time,
      rewards, requirements, target_segments, max_participants, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getActive: db.prepare(`
    SELECT * FROM limited_time_events
    WHERE is_active = 1 AND start_time <= ? AND end_time > ?
    ORDER BY end_time ASC
  `),

  getById: db.prepare(`
    SELECT * FROM limited_time_events WHERE id = ?
  `),

  updateParticipants: db.prepare(`
    UPDATE limited_time_events SET current_participants = current_participants + ? WHERE id = ?
  `),

  deactivate: db.prepare(`
    UPDATE limited_time_events SET is_active = 0 WHERE id = ?
  `),

  getUpcoming: db.prepare(`
    SELECT * FROM limited_time_events
    WHERE is_active = 1 AND start_time > ?
    ORDER BY start_time ASC
    LIMIT ?
  `),

  getEndingSoon: db.prepare(`
    SELECT * FROM limited_time_events
    WHERE is_active = 1 AND end_time > ? AND end_time < ?
    ORDER BY end_time ASC
  `),
};

const participationQueries = {
  join: db.prepare(`
    INSERT OR IGNORE INTO event_participation (id, event_id, player_id)
    VALUES (?, ?, ?)
  `),

  getByPlayer: db.prepare(`
    SELECT * FROM event_participation WHERE player_id = ?
  `),

  getByEvent: db.prepare(`
    SELECT * FROM event_participation WHERE event_id = ?
  `),

  updateProgress: db.prepare(`
    UPDATE event_participation SET progress = ?, completed = ? WHERE event_id = ? AND player_id = ?
  `),

  claimRewards: db.prepare(`
    UPDATE event_participation SET rewards_claimed = 1 WHERE event_id = ? AND player_id = ?
  `),

  checkParticipation: db.prepare(`
    SELECT * FROM event_participation WHERE event_id = ? AND player_id = ?
  `),
};

const flashSaleQueries = {
  create: db.prepare(`
    INSERT INTO flash_sales (id, player_id, item_id, item_name, original_price, sale_price,
      discount, currency, expires_at, is_personalized)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getActiveForPlayer: db.prepare(`
    SELECT * FROM flash_sales
    WHERE player_id = ? AND expires_at > ? AND purchased = 0
    ORDER BY expires_at ASC
  `),

  markViewed: db.prepare(`
    UPDATE flash_sales SET viewed = 1 WHERE id = ?
  `),

  markPurchased: db.prepare(`
    UPDATE flash_sales SET purchased = 1 WHERE id = ?
  `),

  getById: db.prepare(`
    SELECT * FROM flash_sales WHERE id = ?
  `),
};

const streakQueries = {
  upsert: db.prepare(`
    INSERT INTO daily_streaks (id, player_id, current_streak, longest_streak, last_claim_date, streak_history)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      current_streak = excluded.current_streak,
      longest_streak = MAX(longest_streak, excluded.longest_streak),
      last_claim_date = excluded.last_claim_date,
      streak_history = excluded.streak_history,
      updated_at = strftime('%s', 'now')
  `),

  getByPlayer: db.prepare(`
    SELECT * FROM daily_streaks WHERE player_id = ?
  `),
};

const triggerQueries = {
  create: db.prepare(`
    INSERT INTO last_chance_triggers (id, player_id, trigger_id, type, message, urgency, expires_at, action_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getPending: db.prepare(`
    SELECT * FROM last_chance_triggers
    WHERE player_id = ? AND sent = 0 AND expires_at > ?
    ORDER BY urgency DESC, expires_at ASC
  `),

  markSent: db.prepare(`
    UPDATE last_chance_triggers SET sent = 1 WHERE id = ?
  `),
};

// ============ STREAK REWARDS CONFIGURATION ============

const STREAK_REWARDS: StreakReward[] = [
  { day: 1, reward: { type: 'coins', value: 50 }, claimed: false, isMilestone: false },
  { day: 2, reward: { type: 'coins', value: 75 }, claimed: false, isMilestone: false },
  { day: 3, reward: { type: 'gems', value: 5 }, claimed: false, isMilestone: true },
  { day: 4, reward: { type: 'coins', value: 100 }, claimed: false, isMilestone: false },
  { day: 5, reward: { type: 'coins', value: 125 }, claimed: false, isMilestone: false },
  { day: 6, reward: { type: 'coins', value: 150 }, claimed: false, isMilestone: false },
  { day: 7, reward: { type: 'chest', value: 'rare', rarity: 'rare' }, claimed: false, isMilestone: true },
  { day: 14, reward: { type: 'gems', value: 25 }, claimed: false, isMilestone: true },
  { day: 21, reward: { type: 'chest', value: 'epic', rarity: 'epic' }, claimed: false, isMilestone: true },
  { day: 30, reward: { type: 'skin', value: 'exclusive_monthly', exclusive: true }, claimed: false, isMilestone: true },
];

// ============ FOMO SERVICE ============

export class FomoService {
  // ========== LIMITED TIME EVENTS ==========

  // Create a new limited time event
  static createEvent(event: Omit<LimitedTimeEvent, 'id' | 'currentParticipants' | 'isActive'>): string {
    const eventId = uuidv4();

    eventQueries.create.run(
      eventId,
      event.name,
      event.description,
      event.type,
      event.startTime,
      event.endTime,
      JSON.stringify(event.rewards),
      event.requirements ? JSON.stringify(event.requirements) : null,
      event.targetSegments ? JSON.stringify(event.targetSegments) : null,
      event.maxParticipants || null,
      event.metadata ? JSON.stringify(event.metadata) : null
    );

    return eventId;
  }

  // Get active events for a player
  static getActiveEvents(playerId?: string): LimitedTimeEvent[] {
    const now = Math.floor(Date.now() / 1000);
    const rows = eventQueries.getActive.all(now, now) as Array<{
      id: string;
      name: string;
      description: string;
      type: string;
      start_time: number;
      end_time: number;
      rewards: string;
      requirements: string | null;
      target_segments: string | null;
      max_participants: number | null;
      current_participants: number;
      is_active: number;
      metadata: string | null;
    }>;

    let events = rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type as EventType,
      startTime: row.start_time,
      endTime: row.end_time,
      rewards: JSON.parse(row.rewards),
      requirements: row.requirements ? JSON.parse(row.requirements) : undefined,
      targetSegments: row.target_segments ? JSON.parse(row.target_segments) : undefined,
      maxParticipants: row.max_participants || undefined,
      currentParticipants: row.current_participants,
      isActive: row.is_active === 1,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));

    // Filter by player segment if applicable
    if (playerId) {
      const profile = SegmentationService.getPlayerProfile(playerId);
      if (profile) {
        events = events.filter(event => {
          if (!event.targetSegments || event.targetSegments.length === 0) {
            return true; // No segment restriction
          }
          return event.targetSegments.includes(profile.primarySegment);
        });
      }
    }

    return events;
  }

  // Join an event
  static joinEvent(playerId: string, eventId: string): { success: boolean; error?: string } {
    const event = eventQueries.getById.get(eventId) as { max_participants: number | null; current_participants: number } | undefined;

    if (!event) {
      return { success: false, error: 'Event not found' };
    }

    if (event.max_participants && event.current_participants >= event.max_participants) {
      return { success: false, error: 'Event is full' };
    }

    // Check if already joined
    const existing = participationQueries.checkParticipation.get(eventId, playerId);
    if (existing) {
      return { success: false, error: 'Already joined this event' };
    }

    participationQueries.join.run(uuidv4(), eventId, playerId);
    eventQueries.updateParticipants.run(1, eventId);

    return { success: true };
  }

  // Get events ending soon (for FOMO triggers)
  static getEventsEndingSoon(hoursThreshold = 24): LimitedTimeEvent[] {
    const now = Math.floor(Date.now() / 1000);
    const threshold = now + hoursThreshold * 60 * 60;

    const rows = eventQueries.getEndingSoon.all(now, threshold) as Array<{
      id: string;
      name: string;
      description: string;
      type: string;
      start_time: number;
      end_time: number;
      rewards: string;
      requirements: string | null;
      target_segments: string | null;
      max_participants: number | null;
      current_participants: number;
      is_active: number;
      metadata: string | null;
    }>;

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type as EventType,
      startTime: row.start_time,
      endTime: row.end_time,
      rewards: JSON.parse(row.rewards),
      requirements: row.requirements ? JSON.parse(row.requirements) : undefined,
      targetSegments: row.target_segments ? JSON.parse(row.target_segments) : undefined,
      maxParticipants: row.max_participants || undefined,
      currentParticipants: row.current_participants,
      isActive: row.is_active === 1,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }

  // ========== FLASH SALES ==========

  // Generate personalized flash sale
  static generateFlashSale(playerId: string): FlashSale | null {
    const profile = SegmentationService.getPlayerProfile(playerId);
    const metrics = AnalyticsService.getAggregateMetrics(playerId);

    // Determine sale based on player profile
    let itemId: string;
    let itemName: string;
    let originalPrice: number;
    let discount: number;
    let currency: 'coins' | 'gems' | 'usd' = 'coins';

    // Personalization based on spender tier
    if (profile?.spenderTier === SpenderTier.WHALE || profile?.spenderTier === SpenderTier.SUPER_WHALE) {
      // Premium offers for whales
      itemId = 'legendary_chest_bundle';
      itemName = 'Legendary Chest Bundle (5x)';
      originalPrice = 49.99;
      discount = 40;
      currency = 'usd';
    } else if (profile?.spenderTier === SpenderTier.DOLPHIN) {
      // Mid-tier offers
      itemId = 'epic_chest_bundle';
      itemName = 'Epic Chest Bundle (3x)';
      originalPrice = 19.99;
      discount = 35;
      currency = 'usd';
    } else if (profile?.spenderTier === SpenderTier.MINNOW) {
      // Starter offers
      itemId = 'starter_bundle';
      itemName = 'Starter Value Bundle';
      originalPrice = 4.99;
      discount = 50;
      currency = 'usd';
    } else {
      // Non-spender - coin offers
      if (metrics.totalMatches > 20) {
        itemId = 'coin_doubler';
        itemName = 'Coin Doubler (7 days)';
        originalPrice = 500;
        discount = 30;
        currency = 'gems';
      } else {
        itemId = 'rare_chest';
        itemName = 'Rare Chest';
        originalPrice = 200;
        discount = 25;
        currency = 'gems';
      }
    }

    const salePrice = originalPrice * (1 - discount / 100);
    const expiresAt = Math.floor(Date.now() / 1000) + 4 * 60 * 60; // 4 hours

    const saleId = uuidv4();
    flashSaleQueries.create.run(
      saleId,
      playerId,
      itemId,
      itemName,
      originalPrice,
      salePrice,
      discount,
      currency,
      expiresAt,
      1 // is_personalized
    );

    return {
      id: saleId,
      playerId,
      itemId,
      itemName,
      originalPrice,
      salePrice,
      discount,
      currency,
      expiresAt,
      isPersonalized: true,
      viewed: false,
      purchased: false
    };
  }

  // Get active flash sales for player
  static getActiveFlashSales(playerId: string): FlashSale[] {
    const now = Math.floor(Date.now() / 1000);
    const rows = flashSaleQueries.getActiveForPlayer.all(playerId, now) as Array<{
      id: string;
      player_id: string;
      item_id: string;
      item_name: string;
      original_price: number;
      sale_price: number;
      discount: number;
      currency: string;
      expires_at: number;
      is_personalized: number;
      viewed: number;
      purchased: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      playerId: row.player_id,
      itemId: row.item_id,
      itemName: row.item_name,
      originalPrice: row.original_price,
      salePrice: row.sale_price,
      discount: row.discount,
      currency: row.currency as 'coins' | 'gems' | 'usd',
      expiresAt: row.expires_at,
      isPersonalized: row.is_personalized === 1,
      viewed: row.viewed === 1,
      purchased: row.purchased === 1
    }));
  }

  // Mark flash sale as viewed
  static viewFlashSale(saleId: string): void {
    flashSaleQueries.markViewed.run(saleId);
  }

  // Mark flash sale as purchased
  static purchaseFlashSale(saleId: string): void {
    flashSaleQueries.markPurchased.run(saleId);
  }

  // ========== DAILY STREAKS ==========

  // Get player's daily streak
  static getDailyStreak(playerId: string): DailyStreak {
    const row = streakQueries.getByPlayer.get(playerId) as {
      current_streak: number;
      longest_streak: number;
      last_claim_date: string | null;
      streak_history: string;
    } | undefined;

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let currentStreak = row?.current_streak || 0;
    let longestStreak = row?.longest_streak || 0;
    const lastClaimDate = row?.last_claim_date || null;
    let todayClaimed = false;
    let daysUntilExpire = 1;

    // Check if streak is still valid
    if (lastClaimDate === today) {
      todayClaimed = true;
      daysUntilExpire = 0;
    } else if (lastClaimDate === yesterday) {
      // Streak continues, can claim today
      daysUntilExpire = 1;
    } else if (lastClaimDate) {
      // Streak broken
      currentStreak = 0;
      daysUntilExpire = 0;
    }

    // Build rewards list with claim status
    const claimedHistory: string[] = row?.streak_history ? JSON.parse(row.streak_history) : [];
    const rewards = STREAK_REWARDS.map(r => ({
      ...r,
      claimed: claimedHistory.includes(`day_${r.day}`)
    }));

    // Find next milestone
    const nextMilestone = STREAK_REWARDS
      .filter(r => r.isMilestone && r.day > currentStreak)
      .sort((a, b) => a.day - b.day)[0]?.day || 30;

    return {
      playerId,
      currentStreak,
      longestStreak,
      lastClaimDate: lastClaimDate || '',
      todayClaimed,
      rewards,
      nextMilestone,
      daysUntilExpire
    };
  }

  // Claim daily streak reward
  static claimDailyStreak(playerId: string): { success: boolean; reward?: EventReward; newStreak: number; error?: string } {
    const streak = this.getDailyStreak(playerId);

    if (streak.todayClaimed) {
      return { success: false, newStreak: streak.currentStreak, error: 'Already claimed today' };
    }

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let newStreak: number;
    if (streak.lastClaimDate === yesterday || streak.lastClaimDate === '') {
      newStreak = streak.currentStreak + 1;
    } else {
      newStreak = 1; // Reset streak
    }

    const newLongestStreak = Math.max(streak.longestStreak, newStreak);

    // Get reward for this day
    let reward: EventReward;
    const milestoneReward = STREAK_REWARDS.find(r => r.day === newStreak && r.isMilestone);
    if (milestoneReward) {
      reward = milestoneReward.reward;
    } else {
      // Calculate regular daily reward (escalating)
      const baseCoins = 50;
      const multiplier = 1 + (newStreak - 1) * 0.1; // 10% increase per day
      reward = {
        type: 'coins',
        value: Math.floor(baseCoins * multiplier)
      };
    }

    // Update history
    const existingRow = streakQueries.getByPlayer.get(playerId) as { streak_history: string } | undefined;
    const history: string[] = existingRow?.streak_history ? JSON.parse(existingRow.streak_history) : [];
    history.push(`day_${newStreak}`);

    // Keep only last 30 days
    const trimmedHistory = history.slice(-30);

    streakQueries.upsert.run(
      uuidv4(),
      playerId,
      newStreak,
      newLongestStreak,
      today,
      JSON.stringify(trimmedHistory)
    );

    // Track analytics event
    AnalyticsService.trackEvent(playerId, 'daily_streak_claim', {
      streak: newStreak,
      reward,
      isMilestone: !!milestoneReward
    });

    return {
      success: true,
      reward,
      newStreak
    };
  }

  // ========== LAST CHANCE TRIGGERS ==========

  // Create a last chance trigger
  static createLastChanceTrigger(
    playerId: string,
    type: LastChanceTrigger['type'],
    message: string,
    expiresAt: number,
    urgency: LastChanceTrigger['urgency'] = 'medium',
    actionUrl?: string
  ): string {
    const triggerId = uuidv4();

    triggerQueries.create.run(
      uuidv4(),
      playerId,
      triggerId,
      type,
      message,
      urgency,
      expiresAt,
      actionUrl || null
    );

    return triggerId;
  }

  // Get pending triggers for a player
  static getPendingTriggers(playerId: string): LastChanceTrigger[] {
    const now = Math.floor(Date.now() / 1000);
    const rows = triggerQueries.getPending.all(playerId, now) as Array<{
      id: string;
      player_id: string;
      trigger_id: string;
      type: string;
      message: string;
      urgency: string;
      expires_at: number;
      action_url: string | null;
      sent: number;
    }>;

    return rows.map(row => ({
      playerId: row.player_id,
      triggerId: row.trigger_id,
      type: row.type as LastChanceTrigger['type'],
      message: row.message,
      urgency: row.urgency as LastChanceTrigger['urgency'],
      expiresAt: row.expires_at,
      actionUrl: row.action_url || undefined,
      sent: row.sent === 1
    }));
  }

  // Check and generate triggers for a player
  static async checkAndGenerateTriggers(playerId: string): Promise<LastChanceTrigger[]> {
    const triggers: LastChanceTrigger[] = [];
    const now = Math.floor(Date.now() / 1000);

    // Check for events ending soon
    const endingSoon = this.getEventsEndingSoon(6); // 6 hours
    for (const event of endingSoon) {
      // Check if player is participating
      const participation = participationQueries.checkParticipation.get(event.id, playerId);
      if (participation) {
        const hoursLeft = Math.floor((event.endTime - now) / 3600);
        this.createLastChanceTrigger(
          playerId,
          'event_ending',
          `${event.name} ends in ${hoursLeft} hours! Complete it now!`,
          event.endTime,
          hoursLeft < 2 ? 'critical' : 'high',
          `/events/${event.id}`
        );
      }
    }

    // Check for flash sales ending
    const activeSales = this.getActiveFlashSales(playerId);
    for (const sale of activeSales) {
      const hoursLeft = (sale.expiresAt - now) / 3600;
      if (hoursLeft < 1 && !sale.viewed) {
        this.createLastChanceTrigger(
          playerId,
          'sale_ending',
          `${sale.discount}% off ${sale.itemName} - Only ${Math.floor(hoursLeft * 60)} minutes left!`,
          sale.expiresAt,
          'critical',
          `/shop/flash-sale/${sale.id}`
        );
      }
    }

    // Check for streak about to break
    const streak = this.getDailyStreak(playerId);
    if (!streak.todayClaimed && streak.currentStreak > 0) {
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const expiresAt = Math.floor(endOfDay.getTime() / 1000);

      if (streak.currentStreak >= 3) {
        this.createLastChanceTrigger(
          playerId,
          'streak_breaking',
          `Don't lose your ${streak.currentStreak}-day streak! Claim your reward before midnight!`,
          expiresAt,
          streak.currentStreak >= 7 ? 'critical' : 'high',
          '/daily-rewards'
        );
      }
    }

    return this.getPendingTriggers(playerId);
  }

  // Mark trigger as sent
  static markTriggerSent(triggerId: string): void {
    const row = db.prepare('SELECT id FROM last_chance_triggers WHERE trigger_id = ?').get(triggerId) as { id: string } | undefined;
    if (row) {
      triggerQueries.markSent.run(row.id);
    }
  }
}

// ============ API ROUTES ============

// Get active events
router.get('/active-events', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const playerId = req.user?.id;
    const events = FomoService.getActiveEvents(playerId);

    // Add countdown for each event
    const now = Math.floor(Date.now() / 1000);
    const eventsWithCountdown = events.map(event => ({
      ...event,
      timeRemaining: event.endTime - now,
      hoursRemaining: Math.floor((event.endTime - now) / 3600),
      isEndingSoon: (event.endTime - now) < 24 * 60 * 60
    }));

    res.json({ events: eventsWithCountdown });
  } catch (error) {
    console.error('Get active events error:', error);
    res.status(500).json({ error: 'Failed to get active events' });
  }
});

// Join an event
router.post('/events/:eventId/join', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { eventId } = req.params;
    const result = FomoService.joinEvent(req.user.id, eventId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Join event error:', error);
    res.status(500).json({ error: 'Failed to join event' });
  }
});

// Get daily streak
router.get('/daily-streak', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const streak = FomoService.getDailyStreak(req.user.id);

    res.json(streak);
  } catch (error) {
    console.error('Get streak error:', error);
    res.status(500).json({ error: 'Failed to get daily streak' });
  }
});

// Claim daily streak reward
router.post('/daily-streak/claim', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const result = FomoService.claimDailyStreak(req.user.id);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      reward: result.reward,
      newStreak: result.newStreak
    });
  } catch (error) {
    console.error('Claim streak error:', error);
    res.status(500).json({ error: 'Failed to claim daily streak' });
  }
});

// Get flash sales
router.get('/flash-sales', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    let sales = FomoService.getActiveFlashSales(req.user.id);

    // Generate a new sale if none exist
    if (sales.length === 0) {
      const newSale = FomoService.generateFlashSale(req.user.id);
      if (newSale) {
        sales = [newSale];
      }
    }

    // Add countdown
    const now = Math.floor(Date.now() / 1000);
    const salesWithCountdown = sales.map(sale => ({
      ...sale,
      timeRemaining: sale.expiresAt - now,
      minutesRemaining: Math.floor((sale.expiresAt - now) / 60)
    }));

    res.json({ sales: salesWithCountdown });
  } catch (error) {
    console.error('Get flash sales error:', error);
    res.status(500).json({ error: 'Failed to get flash sales' });
  }
});

// View flash sale
router.post('/flash-sales/:saleId/view', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;
    FomoService.viewFlashSale(saleId);

    res.json({ success: true });
  } catch (error) {
    console.error('View sale error:', error);
    res.status(500).json({ error: 'Failed to mark sale as viewed' });
  }
});

// Purchase flash sale
router.post('/flash-sales/:saleId/purchase', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;

    // In production, verify payment here
    FomoService.purchaseFlashSale(saleId);

    res.json({ success: true });
  } catch (error) {
    console.error('Purchase sale error:', error);
    res.status(500).json({ error: 'Failed to process purchase' });
  }
});

// Get last chance triggers
router.get('/last-chance', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const triggers = await FomoService.checkAndGenerateTriggers(req.user.id);

    res.json({ triggers });
  } catch (error) {
    console.error('Get triggers error:', error);
    res.status(500).json({ error: 'Failed to get last chance triggers' });
  }
});

// Create limited time event (admin)
router.post('/admin/events', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const eventData = req.body as Omit<LimitedTimeEvent, 'id' | 'currentParticipants' | 'isActive'>;

    if (!eventData.name || !eventData.startTime || !eventData.endTime || !eventData.rewards) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const eventId = FomoService.createEvent(eventData);

    res.json({
      success: true,
      eventId
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

export { router as fomoRouter };
