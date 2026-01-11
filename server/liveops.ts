/**
 * Live-Ops Automation System
 *
 * This module handles event scheduling, content rotation, player segmentation,
 * real-time balance parameters, and emergency maintenance mode.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ddaQueries } from './database';
import { AuthRequest, authenticateToken } from './auth';
import { getPlayerSkillProfile } from './dda';
import { getEngagementMetrics } from './edda';
import { getPlayerEconomy } from './economy';

const router = Router();

// ============ Types ============

export interface LiveOpsEvent {
  id: string;
  name: string;
  description: string | null;
  eventType: EventType;
  startTime: number;
  endTime: number;
  isActive: boolean;
  targetSegments: PlayerSegment[];
  config: EventConfig;
  createdAt: number;
}

export type EventType =
  | 'double_xp'
  | 'bonus_rewards'
  | 'special_challenge'
  | 'limited_mode'
  | 'tournament'
  | 'sale'
  | 'content_drop'
  | 'maintenance';

export type PlayerSegment =
  | 'all'
  | 'new_players'
  | 'returning_players'
  | 'churning_players'
  | 'high_skill'
  | 'low_skill'
  | 'spenders'
  | 'non_spenders'
  | 'vip';

export interface EventConfig {
  multiplier?: number;
  bonusAmount?: number;
  modeId?: string;
  discountPercent?: number;
  requirements?: Record<string, unknown>;
  rewards?: EventReward[];
  maintenanceMessage?: string;
}

export interface EventReward {
  type: string;
  id: string;
  amount: number;
}

export interface LiveParameter {
  key: string;
  value: string;
  description: string | null;
  lastUpdated: number;
}

export interface ScheduledJob {
  eventId: string;
  action: 'start' | 'end';
  scheduledTime: number;
  executed: boolean;
}

// ============ In-Memory State ============

let maintenanceMode = false;
let maintenanceMessage = '';
const scheduledJobs: ScheduledJob[] = [];

// ============ Event Management ============

/**
 * Creates a new live-ops event
 */
export function createEvent(
  name: string,
  description: string | null,
  eventType: EventType,
  startTime: number,
  endTime: number,
  targetSegments: PlayerSegment[],
  config: EventConfig
): LiveOpsEvent {
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);

  // Check if event should be active immediately
  const isActive = startTime <= now && endTime >= now;

  ddaQueries.createEvent.run(
    id,
    name,
    description,
    eventType,
    startTime,
    endTime,
    isActive ? 1 : 0,
    JSON.stringify(targetSegments),
    JSON.stringify(config)
  );

  // Schedule start and end jobs
  if (!isActive && startTime > now) {
    scheduleJob(id, 'start', startTime);
  }
  if (endTime > now) {
    scheduleJob(id, 'end', endTime);
  }

  return {
    id,
    name,
    description,
    eventType,
    startTime,
    endTime,
    isActive,
    targetSegments,
    config,
    createdAt: now,
  };
}

/**
 * Updates an existing event
 */
export function updateEvent(
  eventId: string,
  updates: Partial<LiveOpsEvent>
): LiveOpsEvent | null {
  const existing = ddaQueries.getEventById.get(eventId) as {
    id: string;
    name: string;
    description: string | null;
    event_type: string;
    start_time: number;
    end_time: number;
    is_active: number;
    target_segments: string;
    config: string;
    created_at: number;
  } | undefined;

  if (!existing) return null;

  const updated = {
    name: updates.name ?? existing.name,
    description: updates.description ?? existing.description,
    eventType: updates.eventType ?? existing.event_type,
    startTime: updates.startTime ?? existing.start_time,
    endTime: updates.endTime ?? existing.end_time,
    isActive: updates.isActive ?? existing.is_active === 1,
    targetSegments: updates.targetSegments ?? JSON.parse(existing.target_segments),
    config: updates.config ?? JSON.parse(existing.config),
  };

  ddaQueries.updateEvent.run(
    updated.name,
    updated.description,
    updated.eventType,
    updated.startTime,
    updated.endTime,
    updated.isActive ? 1 : 0,
    JSON.stringify(updated.targetSegments),
    JSON.stringify(updated.config),
    eventId
  );

  return {
    id: eventId,
    ...updated,
    createdAt: existing.created_at,
  };
}

/**
 * Gets all active events for a player
 */
export function getActiveEventsForPlayer(playerId: string): LiveOpsEvent[] {
  const now = Math.floor(Date.now() / 1000);
  const activeEvents = ddaQueries.getActiveEvents.all(now, now) as Array<{
    id: string;
    name: string;
    description: string | null;
    event_type: string;
    start_time: number;
    end_time: number;
    is_active: number;
    target_segments: string;
    config: string;
    created_at: number;
  }>;

  // Get player data for segment matching
  const skill = getPlayerSkillProfile(playerId);
  const engagement = getEngagementMetrics(playerId);
  const economy = getPlayerEconomy(playerId);

  // Filter events by player segment
  return activeEvents
    .map(e => ({
      id: e.id,
      name: e.name,
      description: e.description,
      eventType: e.event_type as EventType,
      startTime: e.start_time,
      endTime: e.end_time,
      isActive: e.is_active === 1,
      targetSegments: JSON.parse(e.target_segments) as PlayerSegment[],
      config: JSON.parse(e.config) as EventConfig,
      createdAt: e.created_at,
    }))
    .filter(event => {
      return event.targetSegments.some(segment =>
        playerMatchesSegment(segment, skill, engagement, economy)
      );
    });
}

/**
 * Checks if player matches a segment
 */
function playerMatchesSegment(
  segment: PlayerSegment,
  skill: ReturnType<typeof getPlayerSkillProfile>,
  engagement: ReturnType<typeof getEngagementMetrics>,
  economy: ReturnType<typeof getPlayerEconomy>
): boolean {
  switch (segment) {
    case 'all':
      return true;

    case 'new_players':
      return skill.gamesAnalyzed < 10;

    case 'returning_players':
      return engagement.daysSinceLastPlay >= 7;

    case 'churning_players':
      return engagement.churnRiskScore >= 60;

    case 'high_skill':
      return skill.skillBand === 'Expert' || skill.skillBand === 'Master';

    case 'low_skill':
      return skill.skillBand === 'Beginner' || skill.skillBand === 'Novice';

    case 'spenders':
      return economy.spendingTier !== 'none';

    case 'non_spenders':
      return economy.spendingTier === 'none';

    case 'vip':
      return economy.spendingTier === 'whale' || economy.spendingTier === 'dolphin';

    default:
      return false;
  }
}

// ============ Job Scheduling ============

/**
 * Schedules a job for event start/end
 */
function scheduleJob(eventId: string, action: 'start' | 'end', scheduledTime: number): void {
  scheduledJobs.push({
    eventId,
    action,
    scheduledTime,
    executed: false,
  });
}

/**
 * Processes scheduled jobs (should be called periodically)
 */
export function processScheduledJobs(): void {
  const now = Math.floor(Date.now() / 1000);

  for (const job of scheduledJobs) {
    if (job.executed) continue;
    if (job.scheduledTime > now) continue;

    // Execute job
    if (job.action === 'start') {
      updateEvent(job.eventId, { isActive: true });
      console.log(`Event ${job.eventId} started`);
    } else {
      updateEvent(job.eventId, { isActive: false });
      console.log(`Event ${job.eventId} ended`);
    }

    job.executed = true;
  }

  // Clean up old executed jobs
  const jobsToRemove = scheduledJobs.filter(j => j.executed);
  for (const job of jobsToRemove) {
    const index = scheduledJobs.indexOf(job);
    if (index > -1) {
      scheduledJobs.splice(index, 1);
    }
  }
}

// ============ Live Parameters ============

/**
 * Gets a live parameter
 */
export function getParameter(key: string): string | null {
  const param = ddaQueries.getParameter.get(key) as {
    key: string;
    value: string;
  } | undefined;

  return param?.value ?? null;
}

/**
 * Sets a live parameter
 */
export function setParameter(key: string, value: string, description?: string): void {
  const now = Math.floor(Date.now() / 1000);
  ddaQueries.setParameter.run(key, value, description ?? null, now);
}

/**
 * Gets all live parameters
 */
export function getAllParameters(): LiveParameter[] {
  const params = ddaQueries.getAllParameters.all() as Array<{
    key: string;
    value: string;
    description: string | null;
    last_updated: number;
  }>;

  return params.map(p => ({
    key: p.key,
    value: p.value,
    description: p.description,
    lastUpdated: p.last_updated,
  }));
}

/**
 * Initializes default live parameters
 */
export function initializeDefaultParameters(): void {
  const defaults: Array<{ key: string; value: string; description: string }> = [
    { key: 'xp_multiplier', value: '1.0', description: 'Global XP multiplier' },
    { key: 'currency_multiplier', value: '1.0', description: 'Global currency reward multiplier' },
    { key: 'matchmaking_elo_range', value: '200', description: 'ELO range for matchmaking' },
    { key: 'ai_difficulty_scale', value: '1.0', description: 'Global AI difficulty scale' },
    { key: 'troop_generation_rate', value: '1.0', description: 'Base troop generation rate multiplier' },
    { key: 'max_active_events', value: '3', description: 'Maximum concurrent active events' },
    { key: 'daily_challenge_refresh_hour', value: '0', description: 'Hour (UTC) when daily challenges refresh' },
    { key: 'maintenance_mode', value: 'false', description: 'Emergency maintenance mode flag' },
  ];

  for (const param of defaults) {
    const existing = getParameter(param.key);
    if (existing === null) {
      setParameter(param.key, param.value, param.description);
    }
  }
}

// ============ Maintenance Mode ============

/**
 * Enables maintenance mode
 */
export function enableMaintenanceMode(message: string): void {
  maintenanceMode = true;
  maintenanceMessage = message;
  setParameter('maintenance_mode', 'true', 'Emergency maintenance mode');
}

/**
 * Disables maintenance mode
 */
export function disableMaintenanceMode(): void {
  maintenanceMode = false;
  maintenanceMessage = '';
  setParameter('maintenance_mode', 'false', 'Emergency maintenance mode');
}

/**
 * Checks if maintenance mode is active
 */
export function isMaintenanceModeActive(): { active: boolean; message: string } {
  // Check live parameter first (for persistence across restarts)
  const paramValue = getParameter('maintenance_mode');
  if (paramValue === 'true') {
    return { active: true, message: maintenanceMessage || 'System maintenance in progress' };
  }

  return { active: maintenanceMode, message: maintenanceMessage };
}

// ============ Content Rotation ============

/**
 * Gets current content rotation
 */
export function getCurrentContentRotation(): {
  featuredLevels: number[];
  featuredModes: string[];
  specialOffers: string[];
  rotationEndsAt: number;
} {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const hourOfDay = now.getUTCHours();

  // Rotation changes every 6 hours
  const rotationPeriod = Math.floor(hourOfDay / 6);

  // Featured levels rotate daily
  const levelRotations: number[][] = [
    [1, 6, 12], // Sunday
    [2, 7, 13], // Monday
    [3, 8, 14], // Tuesday
    [4, 9, 15], // Wednesday
    [5, 10, 16], // Thursday
    [1, 11, 17], // Friday
    [2, 12, 18], // Saturday
  ];

  // Featured modes rotate every 6 hours
  const modeRotations: string[][] = [
    ['1v1', '2v2'],
    ['5v5', 'ffa4'],
    ['1v1', 'ffa8'],
    ['2v2', '5v5'],
  ];

  // Calculate when rotation ends
  const nextRotationHour = (rotationPeriod + 1) * 6;
  const rotationEndsAt = new Date(now);
  rotationEndsAt.setUTCHours(nextRotationHour, 0, 0, 0);
  if (nextRotationHour >= 24) {
    rotationEndsAt.setUTCDate(rotationEndsAt.getUTCDate() + 1);
    rotationEndsAt.setUTCHours(0, 0, 0, 0);
  }

  return {
    featuredLevels: levelRotations[dayOfWeek],
    featuredModes: modeRotations[rotationPeriod],
    specialOffers: [], // Could be populated from active events
    rotationEndsAt: Math.floor(rotationEndsAt.getTime() / 1000),
  };
}

// ============ Event Scheduling Helpers ============

/**
 * Schedules recurring events
 */
export function scheduleRecurringEvent(
  name: string,
  eventType: EventType,
  cronPattern: {
    dayOfWeek?: number[]; // 0-6
    hour?: number;
    durationHours: number;
  },
  targetSegments: PlayerSegment[],
  config: EventConfig
): string[] {
  const eventIds: string[] = [];
  const now = new Date();

  // Schedule for next 4 weeks
  for (let week = 0; week < 4; week++) {
    const daysToSchedule = cronPattern.dayOfWeek ?? [0, 1, 2, 3, 4, 5, 6];

    for (const day of daysToSchedule) {
      const eventDate = new Date(now);
      eventDate.setUTCDate(eventDate.getUTCDate() + (week * 7) + day);
      eventDate.setUTCHours(cronPattern.hour ?? 0, 0, 0, 0);

      // Skip if in the past
      if (eventDate.getTime() < now.getTime()) continue;

      const startTime = Math.floor(eventDate.getTime() / 1000);
      const endTime = startTime + (cronPattern.durationHours * 3600);

      const event = createEvent(
        `${name} - ${eventDate.toISOString().split('T')[0]}`,
        null,
        eventType,
        startTime,
        endTime,
        targetSegments,
        config
      );

      eventIds.push(event.id);
    }
  }

  return eventIds;
}

// ============ API Routes ============

// Get active events for player
router.get('/events', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const events = getActiveEventsForPlayer(req.user.id);
    const rotation = getCurrentContentRotation();
    const maintenance = isMaintenanceModeActive();

    res.json({
      events: events.map(e => ({
        id: e.id,
        name: e.name,
        description: e.description,
        type: e.eventType,
        endsAt: e.endTime,
        config: e.config,
      })),
      rotation,
      maintenance,
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to get events' });
  }
});

// Get all events (admin)
router.get('/events/all', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const events = ddaQueries.getAllEvents.all(limit) as Array<{
      id: string;
      name: string;
      description: string | null;
      event_type: string;
      start_time: number;
      end_time: number;
      is_active: number;
      target_segments: string;
      config: string;
      created_at: number;
    }>;

    res.json({
      events: events.map(e => ({
        id: e.id,
        name: e.name,
        description: e.description,
        eventType: e.event_type,
        startTime: e.start_time,
        endTime: e.end_time,
        isActive: e.is_active === 1,
        targetSegments: JSON.parse(e.target_segments),
        config: JSON.parse(e.config),
        createdAt: e.created_at,
      })),
    });
  } catch (error) {
    console.error('Get all events error:', error);
    res.status(500).json({ error: 'Failed to get events' });
  }
});

// Create event (admin)
router.post('/schedule', (req: Request, res: Response) => {
  try {
    const { name, description, eventType, startTime, endTime, targetSegments, config } = req.body;

    if (!name || !eventType || !startTime || !endTime) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const event = createEvent(
      name,
      description || null,
      eventType,
      startTime,
      endTime,
      targetSegments || ['all'],
      config || {}
    );

    res.status(201).json({ event });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event (admin)
router.put('/events/:eventId', (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const updates = req.body;

    const updated = updateEvent(eventId, updates);

    if (!updated) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    res.json({ event: updated });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete event (admin)
router.delete('/events/:eventId', (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;

    const existing = ddaQueries.getEventById.get(eventId);
    if (!existing) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    ddaQueries.deleteEvent.run(eventId);

    res.json({ message: 'Event deleted' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Get live parameters (admin)
router.get('/parameters', (req: Request, res: Response) => {
  try {
    const params = getAllParameters();
    res.json({ parameters: params });
  } catch (error) {
    console.error('Get parameters error:', error);
    res.status(500).json({ error: 'Failed to get parameters' });
  }
});

// Update live parameter (admin)
router.post('/parameters', (req: Request, res: Response) => {
  try {
    const { key, value, description } = req.body;

    if (!key || value === undefined) {
      res.status(400).json({ error: 'Key and value required' });
      return;
    }

    setParameter(key, String(value), description);

    res.json({ message: 'Parameter updated', key, value });
  } catch (error) {
    console.error('Set parameter error:', error);
    res.status(500).json({ error: 'Failed to set parameter' });
  }
});

// Enable maintenance mode (admin)
router.post('/maintenance/enable', (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    enableMaintenanceMode(message || 'System maintenance in progress');

    res.json({ message: 'Maintenance mode enabled' });
  } catch (error) {
    console.error('Enable maintenance error:', error);
    res.status(500).json({ error: 'Failed to enable maintenance mode' });
  }
});

// Disable maintenance mode (admin)
router.post('/maintenance/disable', (req: Request, res: Response) => {
  try {
    disableMaintenanceMode();
    res.json({ message: 'Maintenance mode disabled' });
  } catch (error) {
    console.error('Disable maintenance error:', error);
    res.status(500).json({ error: 'Failed to disable maintenance mode' });
  }
});

// Get maintenance status
router.get('/maintenance', (req: Request, res: Response) => {
  try {
    const status = isMaintenanceModeActive();
    res.json(status);
  } catch (error) {
    console.error('Get maintenance status error:', error);
    res.status(500).json({ error: 'Failed to get maintenance status' });
  }
});

// Get content rotation
router.get('/rotation', (req: Request, res: Response) => {
  try {
    const rotation = getCurrentContentRotation();
    res.json({ rotation });
  } catch (error) {
    console.error('Get rotation error:', error);
    res.status(500).json({ error: 'Failed to get content rotation' });
  }
});

// Initialize default parameters on module load
initializeDefaultParameters();

// Start job processor (runs every minute)
setInterval(processScheduledJobs, 60000);

export { router as liveopsRouter };
