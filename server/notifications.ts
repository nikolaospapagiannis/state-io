import { Router, Response } from 'express';
import { db } from './database';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, authenticateToken } from './auth';
import { AnalyticsService } from './analytics';
import { SegmentationService, PlayerSegmentType, EngagementLevel } from './segmentation';
import { ChurnPredictionService, ChurnRiskTier } from './churn';

const router = Router();

// ============ TYPES ============

export enum NotificationType {
  REENGAGEMENT = 'reengagement',
  STREAK_REMINDER = 'streak_reminder',
  EVENT_START = 'event_start',
  EVENT_ENDING = 'event_ending',
  FRIEND_ACTIVITY = 'friend_activity',
  CLAN_ACTIVITY = 'clan_activity',
  REWARD_AVAILABLE = 'reward_available',
  SALE_ALERT = 'sale_alert',
  ACHIEVEMENT = 'achievement',
  CHALLENGE = 'challenge',
  SYSTEM = 'system'
}

export interface NotificationTemplate {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  icon?: string;
  action?: string;
  deepLink?: string;
  targetSegments?: PlayerSegmentType[];
  variables?: string[]; // Placeholders like {username}, {streak}, etc.
}

export interface PlayerNotification {
  id: string;
  playerId: string;
  type: NotificationType;
  templateId?: string;
  title: string;
  body: string;
  icon?: string;
  deepLink?: string;
  priority: 'low' | 'normal' | 'high';
  scheduledFor: number;
  sentAt?: number;
  readAt?: number;
  clickedAt?: number;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'clicked' | 'failed';
  metadata?: Record<string, unknown>;
}

export interface PlayerNotificationPreferences {
  playerId: string;
  enabled: boolean;
  reengagementEnabled: boolean;
  streakRemindersEnabled: boolean;
  eventAlertsEnabled: boolean;
  friendActivityEnabled: boolean;
  saleAlertsEnabled: boolean;
  quietHoursStart?: number; // Hour 0-23
  quietHoursEnd?: number;
  timezone: string;
  optimalSendTime?: number; // Hour 0-23, calculated
  lastNotificationAt?: number;
  dailyLimit: number;
  sentToday: number;
}

export interface ReengagementCampaign {
  id: string;
  name: string;
  targetSegments: PlayerSegmentType[];
  targetEngagement: EngagementLevel[];
  targetChurnRisk: ChurnRiskTier[];
  templateId: string;
  startDate: number;
  endDate: number;
  isActive: boolean;
  sent: number;
  opened: number;
  clicked: number;
  converted: number;
}

// ============ DATABASE INITIALIZATION ============

export function initNotificationTables(): void {
  // Notification templates
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_templates (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      icon TEXT,
      action TEXT,
      deep_link TEXT,
      target_segments TEXT,
      variables TEXT,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Player notifications
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_notifications (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      type TEXT NOT NULL,
      template_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      icon TEXT,
      deep_link TEXT,
      priority TEXT DEFAULT 'normal',
      scheduled_for INTEGER NOT NULL,
      sent_at INTEGER,
      read_at INTEGER,
      clicked_at INTEGER,
      status TEXT DEFAULT 'pending',
      metadata TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Player notification preferences
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id TEXT PRIMARY KEY,
      player_id TEXT UNIQUE NOT NULL,
      enabled INTEGER DEFAULT 1,
      reengagement_enabled INTEGER DEFAULT 1,
      streak_reminders_enabled INTEGER DEFAULT 1,
      event_alerts_enabled INTEGER DEFAULT 1,
      friend_activity_enabled INTEGER DEFAULT 1,
      sale_alerts_enabled INTEGER DEFAULT 1,
      quiet_hours_start INTEGER,
      quiet_hours_end INTEGER,
      timezone TEXT DEFAULT 'UTC',
      optimal_send_time INTEGER,
      last_notification_at INTEGER,
      daily_limit INTEGER DEFAULT 5,
      sent_today INTEGER DEFAULT 0,
      last_reset_date TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Re-engagement campaigns
  db.exec(`
    CREATE TABLE IF NOT EXISTS reengagement_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target_segments TEXT NOT NULL,
      target_engagement TEXT NOT NULL,
      target_churn_risk TEXT NOT NULL,
      template_id TEXT NOT NULL,
      start_date INTEGER NOT NULL,
      end_date INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1,
      sent INTEGER DEFAULT 0,
      opened INTEGER DEFAULT 0,
      clicked INTEGER DEFAULT 0,
      converted INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (template_id) REFERENCES notification_templates(id)
    )
  `);

  // Indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_player ON player_notifications(player_id, status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON player_notifications(scheduled_for, status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notification_prefs_player ON notification_preferences(player_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_campaigns_active ON reengagement_campaigns(is_active, start_date, end_date)`);

  // Insert default templates
  insertDefaultTemplates();

  console.log('Notification tables initialized');
}

function insertDefaultTemplates(): void {
  const templates: Omit<NotificationTemplate, 'id'>[] = [
    {
      type: NotificationType.REENGAGEMENT,
      title: 'We miss you, {username}!',
      body: 'Your troops await your command. Come back and claim a special bonus!',
      icon: 'troops',
      deepLink: '/game',
      variables: ['username']
    },
    {
      type: NotificationType.STREAK_REMINDER,
      title: "Don't break your {streak}-day streak!",
      body: 'Claim your daily reward before midnight to keep your streak alive!',
      icon: 'streak',
      deepLink: '/daily-rewards',
      variables: ['streak']
    },
    {
      type: NotificationType.EVENT_START,
      title: 'New Event: {eventName}',
      body: 'A limited-time event has started! Participate now for exclusive rewards.',
      icon: 'event',
      deepLink: '/events/{eventId}',
      variables: ['eventName', 'eventId']
    },
    {
      type: NotificationType.EVENT_ENDING,
      title: '{eventName} ends in {hours} hours!',
      body: "Last chance to complete the event and claim your rewards!",
      icon: 'timer',
      deepLink: '/events/{eventId}',
      variables: ['eventName', 'eventId', 'hours']
    },
    {
      type: NotificationType.FRIEND_ACTIVITY,
      title: '{friendName} just won a match!',
      body: 'Challenge them to see who is the true champion.',
      icon: 'friend',
      deepLink: '/friends/{friendId}',
      variables: ['friendName', 'friendId']
    },
    {
      type: NotificationType.CLAN_ACTIVITY,
      title: 'Your clan needs you!',
      body: '{clanName} is in a clan war. Join the battle!',
      icon: 'clan',
      deepLink: '/clan',
      variables: ['clanName']
    },
    {
      type: NotificationType.REWARD_AVAILABLE,
      title: 'Reward Ready!',
      body: 'You have {count} unclaimed rewards waiting for you.',
      icon: 'gift',
      deepLink: '/rewards',
      variables: ['count']
    },
    {
      type: NotificationType.SALE_ALERT,
      title: 'Flash Sale: {discount}% OFF!',
      body: '{itemName} is on sale for a limited time. Offer expires in {hours} hours!',
      icon: 'sale',
      deepLink: '/shop/flash-sale',
      variables: ['discount', 'itemName', 'hours']
    },
    {
      type: NotificationType.ACHIEVEMENT,
      title: 'Achievement Unlocked!',
      body: 'You earned "{achievementName}"! Claim your reward.',
      icon: 'trophy',
      deepLink: '/achievements',
      variables: ['achievementName']
    },
    {
      type: NotificationType.CHALLENGE,
      title: 'Daily Challenge Available',
      body: 'Complete today\'s challenge: {challengeDesc}',
      icon: 'challenge',
      deepLink: '/challenges',
      variables: ['challengeDesc']
    }
  ];

  const insertTemplate = db.prepare(`
    INSERT OR IGNORE INTO notification_templates (id, type, title, body, icon, deep_link, variables)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const template of templates) {
    insertTemplate.run(
      uuidv4(),
      template.type,
      template.title,
      template.body,
      template.icon || null,
      template.deepLink || null,
      JSON.stringify(template.variables || [])
    );
  }
}

// Initialize tables immediately
initNotificationTables();

// ============ PREPARED STATEMENTS ============

const templateQueries = {
  getByType: db.prepare(`
    SELECT * FROM notification_templates WHERE type = ? AND is_active = 1 LIMIT 1
  `),

  getById: db.prepare(`
    SELECT * FROM notification_templates WHERE id = ?
  `),

  getAll: db.prepare(`
    SELECT * FROM notification_templates WHERE is_active = 1
  `),
};

const notificationQueries = {
  create: db.prepare(`
    INSERT INTO player_notifications (id, player_id, type, template_id, title, body, icon,
      deep_link, priority, scheduled_for, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getPending: db.prepare(`
    SELECT * FROM player_notifications
    WHERE status = 'pending' AND scheduled_for <= ?
    ORDER BY priority DESC, scheduled_for ASC
    LIMIT ?
  `),

  getByPlayer: db.prepare(`
    SELECT * FROM player_notifications
    WHERE player_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `),

  getUnread: db.prepare(`
    SELECT * FROM player_notifications
    WHERE player_id = ? AND status IN ('sent', 'delivered')
    ORDER BY created_at DESC
    LIMIT ?
  `),

  updateStatus: db.prepare(`
    UPDATE player_notifications SET status = ?, sent_at = ? WHERE id = ?
  `),

  markRead: db.prepare(`
    UPDATE player_notifications SET status = 'read', read_at = ? WHERE id = ?
  `),

  markClicked: db.prepare(`
    UPDATE player_notifications SET status = 'clicked', clicked_at = ? WHERE id = ?
  `),

  countPendingForPlayer: db.prepare(`
    SELECT COUNT(*) as count FROM player_notifications
    WHERE player_id = ? AND status = 'pending'
  `),
};

const preferencesQueries = {
  upsert: db.prepare(`
    INSERT INTO notification_preferences (id, player_id, enabled, reengagement_enabled,
      streak_reminders_enabled, event_alerts_enabled, friend_activity_enabled, sale_alerts_enabled,
      quiet_hours_start, quiet_hours_end, timezone, optimal_send_time, daily_limit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      enabled = excluded.enabled,
      reengagement_enabled = excluded.reengagement_enabled,
      streak_reminders_enabled = excluded.streak_reminders_enabled,
      event_alerts_enabled = excluded.event_alerts_enabled,
      friend_activity_enabled = excluded.friend_activity_enabled,
      sale_alerts_enabled = excluded.sale_alerts_enabled,
      quiet_hours_start = excluded.quiet_hours_start,
      quiet_hours_end = excluded.quiet_hours_end,
      timezone = excluded.timezone,
      optimal_send_time = excluded.optimal_send_time,
      daily_limit = excluded.daily_limit,
      updated_at = strftime('%s', 'now')
  `),

  getByPlayer: db.prepare(`
    SELECT * FROM notification_preferences WHERE player_id = ?
  `),

  updateOptimalTime: db.prepare(`
    UPDATE notification_preferences SET optimal_send_time = ?, updated_at = strftime('%s', 'now')
    WHERE player_id = ?
  `),

  incrementSentToday: db.prepare(`
    UPDATE notification_preferences
    SET sent_today = sent_today + 1, last_notification_at = ?
    WHERE player_id = ?
  `),

  resetDailyCount: db.prepare(`
    UPDATE notification_preferences SET sent_today = 0, last_reset_date = ? WHERE last_reset_date != ?
  `),
};

const campaignQueries = {
  create: db.prepare(`
    INSERT INTO reengagement_campaigns (id, name, target_segments, target_engagement,
      target_churn_risk, template_id, start_date, end_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getActive: db.prepare(`
    SELECT * FROM reengagement_campaigns WHERE is_active = 1 AND start_date <= ? AND end_date > ?
  `),

  incrementSent: db.prepare(`
    UPDATE reengagement_campaigns SET sent = sent + 1 WHERE id = ?
  `),

  incrementOpened: db.prepare(`
    UPDATE reengagement_campaigns SET opened = opened + 1 WHERE id = ?
  `),

  incrementClicked: db.prepare(`
    UPDATE reengagement_campaigns SET clicked = clicked + 1 WHERE id = ?
  `),

  incrementConverted: db.prepare(`
    UPDATE reengagement_campaigns SET converted = converted + 1 WHERE id = ?
  `),
};

// ============ NOTIFICATION SERVICE ============

export class NotificationService {
  // Calculate optimal send time for a player based on activity patterns
  static calculateOptimalSendTime(playerId: string): number {
    const sessions = AnalyticsService.getPlayerSessions(playerId, 50);

    if (sessions.length === 0) {
      return 12; // Default to noon
    }

    // Count sessions by hour
    const hourCounts: number[] = new Array(24).fill(0);
    for (const session of sessions) {
      const date = new Date(session.startTime * 1000);
      hourCounts[date.getHours()]++;
    }

    // Find the hour with most activity
    let maxHour = 12;
    let maxCount = 0;
    for (let hour = 0; hour < 24; hour++) {
      if (hourCounts[hour] > maxCount) {
        maxCount = hourCounts[hour];
        maxHour = hour;
      }
    }

    // Send notification 1 hour before typical play time
    const optimalHour = (maxHour - 1 + 24) % 24;

    // Save to preferences
    preferencesQueries.updateOptimalTime.run(optimalHour, playerId);

    return optimalHour;
  }

  // Get player notification preferences
  static getPreferences(playerId: string): PlayerNotificationPreferences {
    const row = preferencesQueries.getByPlayer.get(playerId) as {
      player_id: string;
      enabled: number;
      reengagement_enabled: number;
      streak_reminders_enabled: number;
      event_alerts_enabled: number;
      friend_activity_enabled: number;
      sale_alerts_enabled: number;
      quiet_hours_start: number | null;
      quiet_hours_end: number | null;
      timezone: string;
      optimal_send_time: number | null;
      last_notification_at: number | null;
      daily_limit: number;
      sent_today: number;
    } | undefined;

    if (!row) {
      // Create default preferences
      const id = uuidv4();
      const optimalTime = this.calculateOptimalSendTime(playerId);

      preferencesQueries.upsert.run(
        id, playerId, 1, 1, 1, 1, 1, 1, null, null, 'UTC', optimalTime, 5
      );

      return {
        playerId,
        enabled: true,
        reengagementEnabled: true,
        streakRemindersEnabled: true,
        eventAlertsEnabled: true,
        friendActivityEnabled: true,
        saleAlertsEnabled: true,
        timezone: 'UTC',
        optimalSendTime: optimalTime,
        dailyLimit: 5,
        sentToday: 0
      };
    }

    return {
      playerId: row.player_id,
      enabled: row.enabled === 1,
      reengagementEnabled: row.reengagement_enabled === 1,
      streakRemindersEnabled: row.streak_reminders_enabled === 1,
      eventAlertsEnabled: row.event_alerts_enabled === 1,
      friendActivityEnabled: row.friend_activity_enabled === 1,
      saleAlertsEnabled: row.sale_alerts_enabled === 1,
      quietHoursStart: row.quiet_hours_start || undefined,
      quietHoursEnd: row.quiet_hours_end || undefined,
      timezone: row.timezone,
      optimalSendTime: row.optimal_send_time || undefined,
      lastNotificationAt: row.last_notification_at || undefined,
      dailyLimit: row.daily_limit,
      sentToday: row.sent_today
    };
  }

  // Update player preferences
  static updatePreferences(
    playerId: string,
    updates: Partial<Omit<PlayerNotificationPreferences, 'playerId' | 'sentToday' | 'lastNotificationAt'>>
  ): void {
    const current = this.getPreferences(playerId);

    preferencesQueries.upsert.run(
      uuidv4(),
      playerId,
      updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : (current.enabled ? 1 : 0),
      updates.reengagementEnabled !== undefined ? (updates.reengagementEnabled ? 1 : 0) : (current.reengagementEnabled ? 1 : 0),
      updates.streakRemindersEnabled !== undefined ? (updates.streakRemindersEnabled ? 1 : 0) : (current.streakRemindersEnabled ? 1 : 0),
      updates.eventAlertsEnabled !== undefined ? (updates.eventAlertsEnabled ? 1 : 0) : (current.eventAlertsEnabled ? 1 : 0),
      updates.friendActivityEnabled !== undefined ? (updates.friendActivityEnabled ? 1 : 0) : (current.friendActivityEnabled ? 1 : 0),
      updates.saleAlertsEnabled !== undefined ? (updates.saleAlertsEnabled ? 1 : 0) : (current.saleAlertsEnabled ? 1 : 0),
      updates.quietHoursStart !== undefined ? updates.quietHoursStart : current.quietHoursStart,
      updates.quietHoursEnd !== undefined ? updates.quietHoursEnd : current.quietHoursEnd,
      updates.timezone || current.timezone,
      updates.optimalSendTime !== undefined ? updates.optimalSendTime : current.optimalSendTime,
      updates.dailyLimit !== undefined ? updates.dailyLimit : current.dailyLimit
    );
  }

  // Check if notification can be sent (rate limiting)
  static canSendNotification(playerId: string, type: NotificationType): { canSend: boolean; reason?: string } {
    const prefs = this.getPreferences(playerId);

    // Global disable
    if (!prefs.enabled) {
      return { canSend: false, reason: 'Notifications disabled' };
    }

    // Type-specific disable
    switch (type) {
      case NotificationType.REENGAGEMENT:
        if (!prefs.reengagementEnabled) {
          return { canSend: false, reason: 'Re-engagement notifications disabled' };
        }
        break;
      case NotificationType.STREAK_REMINDER:
        if (!prefs.streakRemindersEnabled) {
          return { canSend: false, reason: 'Streak reminders disabled' };
        }
        break;
      case NotificationType.EVENT_START:
      case NotificationType.EVENT_ENDING:
        if (!prefs.eventAlertsEnabled) {
          return { canSend: false, reason: 'Event alerts disabled' };
        }
        break;
      case NotificationType.FRIEND_ACTIVITY:
        if (!prefs.friendActivityEnabled) {
          return { canSend: false, reason: 'Friend activity notifications disabled' };
        }
        break;
      case NotificationType.SALE_ALERT:
        if (!prefs.saleAlertsEnabled) {
          return { canSend: false, reason: 'Sale alerts disabled' };
        }
        break;
    }

    // Daily limit
    if (prefs.sentToday >= prefs.dailyLimit) {
      return { canSend: false, reason: 'Daily limit reached' };
    }

    // Quiet hours
    if (prefs.quietHoursStart !== undefined && prefs.quietHoursEnd !== undefined) {
      const now = new Date();
      const currentHour = now.getHours();

      if (prefs.quietHoursStart <= prefs.quietHoursEnd) {
        // Normal range (e.g., 22-8)
        if (currentHour >= prefs.quietHoursStart && currentHour < prefs.quietHoursEnd) {
          return { canSend: false, reason: 'Quiet hours active' };
        }
      } else {
        // Overnight range (e.g., 22-8 wraps around midnight)
        if (currentHour >= prefs.quietHoursStart || currentHour < prefs.quietHoursEnd) {
          return { canSend: false, reason: 'Quiet hours active' };
        }
      }
    }

    return { canSend: true };
  }

  // Fill template with variables
  static fillTemplate(
    template: NotificationTemplate,
    variables: Record<string, string | number>
  ): { title: string; body: string; deepLink?: string } {
    let title = template.title;
    let body = template.body;
    let deepLink = template.deepLink;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      title = title.replace(new RegExp(placeholder, 'g'), String(value));
      body = body.replace(new RegExp(placeholder, 'g'), String(value));
      if (deepLink) {
        deepLink = deepLink.replace(new RegExp(placeholder, 'g'), String(value));
      }
    }

    return { title, body, deepLink };
  }

  // Schedule a notification
  static scheduleNotification(
    playerId: string,
    type: NotificationType,
    variables: Record<string, string | number> = {},
    scheduledFor?: number,
    priority: 'low' | 'normal' | 'high' = 'normal',
    metadata?: Record<string, unknown>
  ): { success: boolean; notificationId?: string; error?: string } {
    // Check rate limiting
    const canSend = this.canSendNotification(playerId, type);
    if (!canSend.canSend) {
      return { success: false, error: canSend.reason };
    }

    // Get template
    const template = templateQueries.getByType.get(type) as {
      id: string;
      type: string;
      title: string;
      body: string;
      icon: string | null;
      deep_link: string | null;
      variables: string;
    } | undefined;

    if (!template) {
      return { success: false, error: 'Template not found' };
    }

    // Fill template
    const filled = this.fillTemplate(
      {
        id: template.id,
        type: type,
        title: template.title,
        body: template.body,
        deepLink: template.deep_link || undefined,
        variables: JSON.parse(template.variables || '[]')
      },
      variables
    );

    // Calculate schedule time
    let scheduleTime = scheduledFor || Math.floor(Date.now() / 1000);

    // If not scheduled, use optimal time
    if (!scheduledFor) {
      const prefs = this.getPreferences(playerId);
      if (prefs.optimalSendTime !== undefined) {
        const now = new Date();
        const optimalDate = new Date();
        optimalDate.setHours(prefs.optimalSendTime, 0, 0, 0);

        // If optimal time has passed today, schedule for tomorrow
        if (optimalDate <= now) {
          optimalDate.setDate(optimalDate.getDate() + 1);
        }

        scheduleTime = Math.floor(optimalDate.getTime() / 1000);
      }
    }

    const notificationId = uuidv4();

    notificationQueries.create.run(
      notificationId,
      playerId,
      type,
      template.id,
      filled.title,
      filled.body,
      template.icon,
      filled.deepLink,
      priority,
      scheduleTime,
      metadata ? JSON.stringify(metadata) : null
    );

    return { success: true, notificationId };
  }

  // Send immediate notification (skip scheduling)
  static async sendImmediateNotification(
    playerId: string,
    type: NotificationType,
    variables: Record<string, string | number> = {},
    metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    const result = this.scheduleNotification(
      playerId,
      type,
      variables,
      Math.floor(Date.now() / 1000), // Schedule for now
      'high',
      metadata
    );

    if (!result.success) {
      return result;
    }

    // Process immediately
    await this.processNotification(result.notificationId!);

    return result;
  }

  // Process a single notification (send it)
  static async processNotification(notificationId: string): Promise<boolean> {
    const notification = db.prepare('SELECT * FROM player_notifications WHERE id = ?').get(notificationId) as {
      id: string;
      player_id: string;
      title: string;
      body: string;
      icon: string | null;
      deep_link: string | null;
      priority: string;
    } | undefined;

    if (!notification) {
      return false;
    }

    // In production, integrate with Firebase Cloud Messaging, Apple Push Notification Service, etc.
    // For now, mark as sent and log
    console.log(`[NOTIFICATION] To: ${notification.player_id}, Title: ${notification.title}, Body: ${notification.body}`);

    const now = Math.floor(Date.now() / 1000);
    notificationQueries.updateStatus.run('sent', now, notificationId);
    preferencesQueries.incrementSentToday.run(now, notification.player_id);

    // Track analytics
    AnalyticsService.trackEvent(notification.player_id, 'notification_sent', {
      notificationId,
      title: notification.title
    });

    return true;
  }

  // Process pending notifications (batch job)
  static async processPendingNotifications(limit = 100): Promise<{ processed: number; failed: number }> {
    const now = Math.floor(Date.now() / 1000);
    const pending = notificationQueries.getPending.all(now, limit) as Array<{
      id: string;
      player_id: string;
    }>;

    let processed = 0;
    let failed = 0;

    // Reset daily counts if needed
    const today = new Date().toISOString().split('T')[0];
    preferencesQueries.resetDailyCount.run(today, today);

    for (const notification of pending) {
      try {
        const success = await this.processNotification(notification.id);
        if (success) {
          processed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to process notification ${notification.id}:`, error);
        notificationQueries.updateStatus.run('failed', null, notification.id);
        failed++;
      }
    }

    return { processed, failed };
  }

  // Get player notifications
  static getPlayerNotifications(playerId: string, limit = 50): PlayerNotification[] {
    const rows = notificationQueries.getByPlayer.all(playerId, limit) as Array<{
      id: string;
      player_id: string;
      type: string;
      template_id: string | null;
      title: string;
      body: string;
      icon: string | null;
      deep_link: string | null;
      priority: string;
      scheduled_for: number;
      sent_at: number | null;
      read_at: number | null;
      clicked_at: number | null;
      status: string;
      metadata: string | null;
    }>;

    return rows.map(row => ({
      id: row.id,
      playerId: row.player_id,
      type: row.type as NotificationType,
      templateId: row.template_id || undefined,
      title: row.title,
      body: row.body,
      icon: row.icon || undefined,
      deepLink: row.deep_link || undefined,
      priority: row.priority as 'low' | 'normal' | 'high',
      scheduledFor: row.scheduled_for,
      sentAt: row.sent_at || undefined,
      readAt: row.read_at || undefined,
      clickedAt: row.clicked_at || undefined,
      status: row.status as PlayerNotification['status'],
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }

  // Mark notification as read
  static markAsRead(notificationId: string): void {
    const now = Math.floor(Date.now() / 1000);
    notificationQueries.markRead.run(now, notificationId);
  }

  // Mark notification as clicked
  static markAsClicked(notificationId: string): void {
    const now = Math.floor(Date.now() / 1000);
    notificationQueries.markClicked.run(now, notificationId);

    // Track analytics
    const notification = db.prepare('SELECT player_id FROM player_notifications WHERE id = ?').get(notificationId) as { player_id: string } | undefined;
    if (notification) {
      AnalyticsService.trackEvent(notification.player_id, 'notification_clicked', { notificationId });
    }
  }

  // Create re-engagement campaign
  static createCampaign(campaign: Omit<ReengagementCampaign, 'id' | 'sent' | 'opened' | 'clicked' | 'converted'>): string {
    const campaignId = uuidv4();

    campaignQueries.create.run(
      campaignId,
      campaign.name,
      JSON.stringify(campaign.targetSegments),
      JSON.stringify(campaign.targetEngagement),
      JSON.stringify(campaign.targetChurnRisk),
      campaign.templateId,
      campaign.startDate,
      campaign.endDate
    );

    return campaignId;
  }

  // Run re-engagement campaigns
  static async runCampaigns(): Promise<{ campaignsRun: number; notificationsSent: number }> {
    const now = Math.floor(Date.now() / 1000);
    const activeCampaigns = campaignQueries.getActive.all(now, now) as Array<{
      id: string;
      name: string;
      target_segments: string;
      target_engagement: string;
      target_churn_risk: string;
      template_id: string;
    }>;

    let campaignsRun = 0;
    let notificationsSent = 0;

    for (const campaign of activeCampaigns) {
      const targetSegments: PlayerSegmentType[] = JSON.parse(campaign.target_segments);
      const targetEngagement: EngagementLevel[] = JSON.parse(campaign.target_engagement);
      const targetChurnRisk: ChurnRiskTier[] = JSON.parse(campaign.target_churn_risk);

      // Find matching players
      const allUsers = db.prepare('SELECT id FROM users').all() as Array<{ id: string }>;

      for (const user of allUsers) {
        const profile = SegmentationService.getPlayerProfile(user.id);
        const churnPrediction = ChurnPredictionService.getCachedPrediction(user.id);

        if (!profile || !churnPrediction) continue;

        // Check if player matches targeting
        const segmentMatch = targetSegments.length === 0 || targetSegments.includes(profile.primarySegment);
        const engagementMatch = targetEngagement.length === 0 || targetEngagement.includes(profile.engagementLevel);
        const churnMatch = targetChurnRisk.length === 0 || targetChurnRisk.includes(churnPrediction.riskTier);

        if (segmentMatch && engagementMatch && churnMatch) {
          const user_data = db.prepare('SELECT username FROM users WHERE id = ?').get(user.id) as { username: string } | undefined;

          const result = this.scheduleNotification(
            user.id,
            NotificationType.REENGAGEMENT,
            { username: user_data?.username || 'Commander' },
            undefined,
            'normal',
            { campaignId: campaign.id }
          );

          if (result.success) {
            notificationsSent++;
            campaignQueries.incrementSent.run(campaign.id);
          }
        }
      }

      campaignsRun++;
    }

    return { campaignsRun, notificationsSent };
  }

  // Generate personalized notification for player based on their state
  static async generatePersonalizedNotification(playerId: string): Promise<{ success: boolean; notificationId?: string }> {
    const profile = SegmentationService.getPlayerProfile(playerId);
    const churnPrediction = ChurnPredictionService.getCachedPrediction(playerId);
    const user = db.prepare('SELECT username, clan_id FROM users WHERE id = ?').get(playerId) as {
      username: string;
      clan_id: string | null;
    } | undefined;

    if (!profile || !user) {
      return { success: false };
    }

    // Determine best notification type based on player state
    let type: NotificationType;
    let variables: Record<string, string | number> = { username: user.username };

    if (churnPrediction?.riskTier === ChurnRiskTier.CRITICAL || churnPrediction?.riskTier === ChurnRiskTier.HIGH) {
      type = NotificationType.REENGAGEMENT;
    } else if (profile.primarySegment === PlayerSegmentType.COMPETITOR) {
      type = NotificationType.CHALLENGE;
      variables.challengeDesc = 'Win 3 matches in a row';
    } else if (profile.primarySegment === PlayerSegmentType.SOCIALIZER && user.clan_id) {
      type = NotificationType.CLAN_ACTIVITY;
      const clan = db.prepare('SELECT name FROM clans WHERE id = ?').get(user.clan_id) as { name: string } | undefined;
      variables.clanName = clan?.name || 'your clan';
    } else if (profile.primarySegment === PlayerSegmentType.SPENDER) {
      type = NotificationType.SALE_ALERT;
      variables.discount = 25;
      variables.itemName = 'Premium Bundle';
      variables.hours = 24;
    } else {
      type = NotificationType.STREAK_REMINDER;
      variables.streak = 1; // Default value
    }

    const result = this.scheduleNotification(playerId, type, variables);

    return { success: result.success, notificationId: result.notificationId };
  }
}

// ============ API ROUTES ============

// Send notification
router.post('/send', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { playerId, type, variables, scheduledFor, priority } = req.body;

    const targetPlayer = playerId || req.user.id;

    const result = NotificationService.scheduleNotification(
      targetPlayer,
      type as NotificationType,
      variables || {},
      scheduledFor,
      priority || 'normal'
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      notificationId: result.notificationId
    });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Get notification queue for player
router.get('/queue', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const notifications = NotificationService.getPlayerNotifications(req.user.id, limit);

    res.json({ notifications });
  } catch (error) {
    console.error('Get queue error:', error);
    res.status(500).json({ error: 'Failed to get notification queue' });
  }
});

// Get unread notifications
router.get('/unread', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const rows = notificationQueries.getUnread.all(req.user.id, 20) as Array<{
      id: string;
      title: string;
      body: string;
      icon: string | null;
      deep_link: string | null;
      created_at: number;
    }>;

    res.json({
      notifications: rows.map(row => ({
        id: row.id,
        title: row.title,
        body: row.body,
        icon: row.icon,
        deepLink: row.deep_link,
        createdAt: row.created_at
      })),
      count: rows.length
    });
  } catch (error) {
    console.error('Get unread error:', error);
    res.status(500).json({ error: 'Failed to get unread notifications' });
  }
});

// Mark notification as read
router.post('/:notificationId/read', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { notificationId } = req.params;
    NotificationService.markAsRead(notificationId);

    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Mark notification as clicked
router.post('/:notificationId/click', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { notificationId } = req.params;
    NotificationService.markAsClicked(notificationId);

    res.json({ success: true });
  } catch (error) {
    console.error('Mark clicked error:', error);
    res.status(500).json({ error: 'Failed to mark as clicked' });
  }
});

// Get preferences
router.get('/preferences', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const preferences = NotificationService.getPreferences(req.user.id);

    res.json(preferences);
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// Update preferences
router.put('/preferences', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const updates = req.body;
    NotificationService.updatePreferences(req.user.id, updates);

    const updated = NotificationService.getPreferences(req.user.id);

    res.json({
      success: true,
      preferences: updated
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Process pending notifications (admin/cron)
router.post('/admin/process', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const result = await NotificationService.processPendingNotifications(limit);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Process notifications error:', error);
    res.status(500).json({ error: 'Failed to process notifications' });
  }
});

// Run campaigns (admin/cron)
router.post('/admin/run-campaigns', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await NotificationService.runCampaigns();

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Run campaigns error:', error);
    res.status(500).json({ error: 'Failed to run campaigns' });
  }
});

// Create campaign (admin)
router.post('/admin/campaigns', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const campaign = req.body;

    if (!campaign.name || !campaign.templateId || !campaign.startDate || !campaign.endDate) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const campaignId = NotificationService.createCampaign({
      ...campaign,
      targetSegments: campaign.targetSegments || [],
      targetEngagement: campaign.targetEngagement || [],
      targetChurnRisk: campaign.targetChurnRisk || [],
      isActive: true
    });

    res.json({
      success: true,
      campaignId
    });
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

export { router as notificationsRouter };
