import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import { ddaQueries } from '../database';
import { AdminRequest, requireAdmin, requirePermission, PERMISSIONS } from './auth';
import { logAdminAction } from './dashboard';

const router = Router();

router.use(requireAdmin);

// ============ EVENTS MANAGEMENT ============

// Get all events
router.get('/', requirePermission(PERMISSIONS.MANAGE_EVENTS), (req: AdminRequest, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const status = req.query.status as string;

    let events;
    if (status) {
      events = db.prepare(`
        SELECT * FROM liveops_events WHERE status = ?
        ORDER BY start_time DESC
        LIMIT ?
      `).all(status, limit);
    } else {
      events = ddaQueries.getAllEvents.all(limit);
    }

    res.json({
      events: (events as Array<{
        id: string;
        name: string;
        type: string;
        config: string;
        start_time: number;
        end_time: number;
        status: string;
        created_at: number;
      }>).map(e => ({
        id: e.id,
        name: e.name,
        type: e.type,
        config: JSON.parse(e.config),
        startTime: e.start_time,
        endTime: e.end_time,
        status: e.status,
        createdAt: e.created_at,
      })),
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to get events' });
  }
});

// Get event by ID
router.get('/:eventId', requirePermission(PERMISSIONS.MANAGE_EVENTS), (req: AdminRequest, res: Response) => {
  try {
    const { eventId } = req.params;

    const event = ddaQueries.getEventById.get(eventId) as {
      id: string;
      name: string;
      type: string;
      config: string;
      start_time: number;
      end_time: number;
      status: string;
      created_at: number;
    } | undefined;

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // Get participants
    const participants = db.prepare(`
      SELECT pep.*, u.username, u.avatar
      FROM player_event_participation pep
      JOIN users u ON pep.player_id = u.id
      WHERE pep.event_id = ?
      ORDER BY pep.score DESC
      LIMIT 100
    `).all(eventId) as Array<{
      player_id: string;
      username: string;
      avatar: string;
      score: number;
      games_played: number;
      rewards_claimed: string;
      joined_at: number;
    }>;

    res.json({
      event: {
        id: event.id,
        name: event.name,
        type: event.type,
        config: JSON.parse(event.config),
        startTime: event.start_time,
        endTime: event.end_time,
        status: event.status,
        createdAt: event.created_at,
      },
      participants: participants.map(p => ({
        playerId: p.player_id,
        username: p.username,
        avatar: p.avatar,
        score: p.score,
        gamesPlayed: p.games_played,
        rewardsClaimed: JSON.parse(p.rewards_claimed),
        joinedAt: p.joined_at,
      })),
      participantCount: participants.length,
    });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Failed to get event' });
  }
});

// Create event
router.post('/', requirePermission(PERMISSIONS.MANAGE_EVENTS), (req: AdminRequest, res: Response) => {
  try {
    const { name, type, config, startTime, endTime } = req.body;

    if (!name || !type || !startTime || !endTime) {
      res.status(400).json({ error: 'Name, type, start time, and end time are required' });
      return;
    }

    if (startTime >= endTime) {
      res.status(400).json({ error: 'End time must be after start time' });
      return;
    }

    const eventId = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    let status = 'scheduled';

    if (startTime <= now && endTime > now) {
      status = 'active';
    } else if (endTime <= now) {
      status = 'ended';
    }

    ddaQueries.createEvent.run(
      eventId,
      name,
      type,
      JSON.stringify(config || {}),
      startTime,
      endTime,
      status
    );

    logAdminAction(
      req.admin!.userId,
      'CREATE_EVENT',
      'event',
      eventId,
      { name, type, startTime, endTime },
      req.ip || null
    );

    res.status(201).json({
      message: 'Event created successfully',
      eventId,
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event
router.patch('/:eventId', requirePermission(PERMISSIONS.MANAGE_EVENTS), (req: AdminRequest, res: Response) => {
  try {
    const { eventId } = req.params;
    const { name, type, config, startTime, endTime, status } = req.body;

    const event = ddaQueries.getEventById.get(eventId) as {
      name: string;
      type: string;
      config: string;
      start_time: number;
      end_time: number;
      status: string;
    } | undefined;

    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const newName = name || event.name;
    const newType = type || event.type;
    const newConfig = config ? JSON.stringify(config) : event.config;
    const newStartTime = startTime || event.start_time;
    const newEndTime = endTime || event.end_time;
    const newStatus = status || event.status;

    ddaQueries.updateEvent.run(
      newName,
      newType,
      newConfig,
      newStartTime,
      newEndTime,
      newStatus,
      eventId
    );

    logAdminAction(
      req.admin!.userId,
      'UPDATE_EVENT',
      'event',
      eventId,
      { name, type, config, startTime, endTime, status },
      req.ip || null
    );

    res.json({ message: 'Event updated successfully' });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete event
router.delete('/:eventId', requirePermission(PERMISSIONS.MANAGE_EVENTS), (req: AdminRequest, res: Response) => {
  try {
    const { eventId } = req.params;

    const event = ddaQueries.getEventById.get(eventId);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    ddaQueries.deleteEvent.run(eventId);

    logAdminAction(
      req.admin!.userId,
      'DELETE_EVENT',
      'event',
      eventId,
      null,
      req.ip || null
    );

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// ============ OFFERS MANAGEMENT ============

// Get all offers
router.get('/offers/list', requirePermission(PERMISSIONS.MANAGE_OFFERS), (req: AdminRequest, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const activeOnly = req.query.active === 'true';

    let offers;
    if (activeOnly) {
      offers = db.prepare(`
        SELECT * FROM limited_offers WHERE is_active = 1
        ORDER BY end_time DESC
        LIMIT ?
      `).all(limit);
    } else {
      offers = db.prepare(`
        SELECT * FROM limited_offers
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);
    }

    res.json({
      offers: (offers as Array<{
        id: string;
        name: string;
        description: string | null;
        offer_type: string;
        items: string;
        original_price: number | null;
        discount_price: number;
        currency: string;
        start_time: number;
        end_time: number;
        max_purchases: number | null;
        target_segments: string;
        is_active: number;
        created_at: number;
      }>).map(o => ({
        id: o.id,
        name: o.name,
        description: o.description,
        type: o.offer_type,
        items: JSON.parse(o.items),
        originalPrice: o.original_price,
        discountPrice: o.discount_price,
        currency: o.currency,
        startTime: o.start_time,
        endTime: o.end_time,
        maxPurchases: o.max_purchases,
        targetSegments: JSON.parse(o.target_segments),
        isActive: o.is_active === 1,
        createdAt: o.created_at,
      })),
    });
  } catch (error) {
    console.error('Get offers error:', error);
    res.status(500).json({ error: 'Failed to get offers' });
  }
});

// Create offer
router.post('/offers', requirePermission(PERMISSIONS.MANAGE_OFFERS), (req: AdminRequest, res: Response) => {
  try {
    const {
      name,
      description,
      offerType,
      items,
      originalPrice,
      discountPrice,
      currency,
      startTime,
      endTime,
      maxPurchases,
      targetSegments,
    } = req.body;

    if (!name || !offerType || !discountPrice || !startTime || !endTime) {
      res.status(400).json({ error: 'Name, offer type, discount price, start time, and end time are required' });
      return;
    }

    const offerId = uuidv4();

    db.prepare(`
      INSERT INTO limited_offers (id, name, description, offer_type, items, original_price, discount_price, currency, start_time, end_time, max_purchases, target_segments)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      offerId,
      name,
      description || null,
      offerType,
      JSON.stringify(items || []),
      originalPrice || null,
      discountPrice,
      currency || 'gems',
      startTime,
      endTime,
      maxPurchases || null,
      JSON.stringify(targetSegments || [])
    );

    logAdminAction(
      req.admin!.userId,
      'CREATE_OFFER',
      'offer',
      offerId,
      { name, offerType, discountPrice },
      req.ip || null
    );

    res.status(201).json({
      message: 'Offer created successfully',
      offerId,
    });
  } catch (error) {
    console.error('Create offer error:', error);
    res.status(500).json({ error: 'Failed to create offer' });
  }
});

// Toggle offer active status
router.patch('/offers/:offerId/toggle', requirePermission(PERMISSIONS.MANAGE_OFFERS), (req: AdminRequest, res: Response) => {
  try {
    const { offerId } = req.params;
    const { isActive } = req.body;

    db.prepare(`
      UPDATE limited_offers SET is_active = ? WHERE id = ?
    `).run(isActive ? 1 : 0, offerId);

    logAdminAction(
      req.admin!.userId,
      isActive ? 'ACTIVATE_OFFER' : 'DEACTIVATE_OFFER',
      'offer',
      offerId,
      null,
      req.ip || null
    );

    res.json({ message: isActive ? 'Offer activated' : 'Offer deactivated' });
  } catch (error) {
    console.error('Toggle offer error:', error);
    res.status(500).json({ error: 'Failed to toggle offer' });
  }
});

// ============ NOTIFICATIONS ============

// Send notification to all players
router.post('/notifications/broadcast', requirePermission(PERMISSIONS.SEND_NOTIFICATIONS), (req: AdminRequest, res: Response) => {
  try {
    const { title, message, type, data, targetSegments } = req.body;

    if (!title || !message) {
      res.status(400).json({ error: 'Title and message are required' });
      return;
    }

    // Get target players
    let players;
    if (targetSegments && targetSegments.length > 0) {
      // Filter by segments
      players = db.prepare(`
        SELECT id FROM users WHERE id IN (
          SELECT player_id FROM player_segmentation
          WHERE segment IN (${targetSegments.map(() => '?').join(',')})
        )
      `).all(...targetSegments) as Array<{ id: string }>;
    } else {
      // All players
      players = db.prepare('SELECT id FROM users').all() as Array<{ id: string }>;
    }

    // Create notifications
    const insertNotification = db.prepare(`
      INSERT INTO player_notifications (id, player_id, type, title, message, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((playerIds: string[]) => {
      for (const playerId of playerIds) {
        const notificationId = uuidv4();
        insertNotification.run(
          notificationId,
          playerId,
          type || 'announcement',
          title,
          message,
          data ? JSON.stringify(data) : null
        );
      }
    });

    insertMany(players.map(p => p.id));

    logAdminAction(
      req.admin!.userId,
      'BROADCAST_NOTIFICATION',
      'notification',
      null,
      { title, recipientCount: players.length, targetSegments },
      req.ip || null
    );

    res.json({
      message: 'Notification sent successfully',
      recipientCount: players.length,
    });
  } catch (error) {
    console.error('Broadcast notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Send notification to specific player
router.post('/notifications/send/:playerId', requirePermission(PERMISSIONS.SEND_NOTIFICATIONS), (req: AdminRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const { title, message, type, data } = req.body;

    if (!title || !message) {
      res.status(400).json({ error: 'Title and message are required' });
      return;
    }

    const player = db.prepare('SELECT id FROM users WHERE id = ?').get(playerId);
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const notificationId = uuidv4();
    db.prepare(`
      INSERT INTO player_notifications (id, player_id, type, title, message, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      notificationId,
      playerId,
      type || 'admin',
      title,
      message,
      data ? JSON.stringify(data) : null
    );

    logAdminAction(
      req.admin!.userId,
      'SEND_NOTIFICATION',
      'player',
      playerId,
      { title, notificationId },
      req.ip || null
    );

    res.json({
      message: 'Notification sent successfully',
      notificationId,
    });
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

export { router as eventsRouter };
