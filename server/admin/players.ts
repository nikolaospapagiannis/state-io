import { Router, Response } from 'express';
import { db, userQueries, clanQueries } from '../database';
import { socialQueries } from '../social-schema';
import { AdminRequest, requireAdmin, requirePermission, PERMISSIONS } from './auth';
import { logAdminAction } from './dashboard';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.use(requireAdmin);

// ============ PLAYER SEARCH & LIST ============

// Search players
router.get('/search', requirePermission(PERMISSIONS.VIEW_PLAYERS), (req: AdminRequest, res: Response) => {
  try {
    const { query, sortBy, order, limit: limitStr, offset: offsetStr } = req.query;
    const limit = Math.min(100, parseInt(limitStr as string) || 50);
    const offset = parseInt(offsetStr as string) || 0;
    const sortField = ['elo', 'wins', 'created_at', 'last_login', 'username'].includes(sortBy as string)
      ? sortBy as string
      : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    let players;
    if (query && (query as string).length > 0) {
      players = db.prepare(`
        SELECT u.*, c.name as clan_name, c.tag as clan_tag
        FROM users u
        LEFT JOIN clans c ON u.clan_id = c.id
        WHERE u.username LIKE ? OR u.email LIKE ? OR u.id = ?
        ORDER BY u.${sortField} ${sortOrder}
        LIMIT ? OFFSET ?
      `).all(`%${query}%`, `%${query}%`, query, limit, offset);
    } else {
      players = db.prepare(`
        SELECT u.*, c.name as clan_name, c.tag as clan_tag
        FROM users u
        LEFT JOIN clans c ON u.clan_id = c.id
        ORDER BY u.${sortField} ${sortOrder}
        LIMIT ? OFFSET ?
      `).all(limit, offset);
    }

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM users
      ${query ? 'WHERE username LIKE ? OR email LIKE ? OR id = ?' : ''}
    `).get(...(query ? [`%${query}%`, `%${query}%`, query] : [])) as { count: number };

    res.json({
      players: (players as Array<Record<string, unknown>>).map(p => ({
        id: p.id,
        username: p.username,
        email: p.email,
        elo: p.elo,
        wins: p.wins,
        losses: p.losses,
        draws: p.draws,
        avatar: p.avatar,
        title: p.title,
        clanId: p.clan_id,
        clanName: p.clan_name,
        clanTag: p.clan_tag,
        createdAt: p.created_at,
        lastLogin: p.last_login,
      })),
      total: total.count,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Search players error:', error);
    res.status(500).json({ error: 'Failed to search players' });
  }
});

// Get player details
router.get('/:playerId', requirePermission(PERMISSIONS.VIEW_PLAYERS), (req: AdminRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    const player = db.prepare(`
      SELECT u.*, c.name as clan_name, c.tag as clan_tag
      FROM users u
      LEFT JOIN clans c ON u.clan_id = c.id
      WHERE u.id = ?
    `).get(playerId) as Record<string, unknown> | undefined;

    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    // Get currencies
    const currencies = db.prepare(`
      SELECT * FROM player_currencies WHERE user_id = ?
    `).get(playerId) as { gems: number; coins: number; crystals: number } | undefined;

    // Get recent matches
    const recentMatches = db.prepare(`
      SELECT m.*, mp.team, mp.elo_change, mp.territories_captured, mp.troops_sent
      FROM matches m
      JOIN match_participants mp ON m.id = mp.match_id
      WHERE mp.user_id = ?
      ORDER BY m.created_at DESC
      LIMIT 10
    `).all(playerId) as Array<Record<string, unknown>>;

    // Get ban status
    const activeBan = socialQueries.getActiveBan.get(playerId) as {
      id: string;
      reason: string;
      ban_type: string;
      expires_at: number | null;
      created_at: number;
    } | undefined;

    // Get reports against this player
    const reports = db.prepare(`
      SELECT COUNT(*) as count FROM player_reports WHERE reported_id = ?
    `).get(playerId) as { count: number };

    // Get subscription status
    const subscription = db.prepare(`
      SELECT * FROM subscriptions
      WHERE user_id = ? AND status = 'active'
      ORDER BY expires_at DESC
      LIMIT 1
    `).get(playerId) as {
      tier: string;
      expires_at: number;
    } | undefined;

    // Get referral info
    const referral = db.prepare(`
      SELECT r.*, u.username as referrer_name
      FROM referrals r
      JOIN users u ON r.referrer_id = u.id
      WHERE r.referred_id = ?
    `).get(playerId) as { referrer_id: string; referrer_name: string; created_at: number } | undefined;

    res.json({
      player: {
        id: player.id,
        username: player.username,
        email: player.email,
        elo: player.elo,
        wins: player.wins,
        losses: player.losses,
        draws: player.draws,
        avatar: player.avatar,
        title: player.title,
        clanId: player.clan_id,
        clanName: player.clan_name,
        clanTag: player.clan_tag,
        createdAt: player.created_at,
        lastLogin: player.last_login,
      },
      currencies: currencies || { gems: 0, coins: 0, crystals: 0 },
      recentMatches: recentMatches.map(m => ({
        id: m.id,
        mode: m.mode,
        winnerTeam: m.winner_team,
        team: m.team,
        eloChange: m.elo_change,
        duration: m.duration,
        createdAt: m.created_at,
      })),
      ban: activeBan ? {
        id: activeBan.id,
        reason: activeBan.reason,
        type: activeBan.ban_type,
        expiresAt: activeBan.expires_at,
        createdAt: activeBan.created_at,
      } : null,
      reportCount: reports.count,
      subscription: subscription ? {
        tier: subscription.tier,
        expiresAt: subscription.expires_at,
      } : null,
      referredBy: referral ? {
        userId: referral.referrer_id,
        username: referral.referrer_name,
        date: referral.created_at,
      } : null,
    });
  } catch (error) {
    console.error('Get player details error:', error);
    res.status(500).json({ error: 'Failed to get player details' });
  }
});

// ============ PLAYER MODIFICATIONS ============

// Update player
router.patch('/:playerId', requirePermission(PERMISSIONS.EDIT_PLAYERS), (req: AdminRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const { elo, gems, coins, crystals, title, avatar } = req.body;

    const player = userQueries.findById.get(playerId);
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (elo !== undefined) {
      updates.push('elo = ?');
      params.push(elo);
    }
    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }
    if (avatar !== undefined) {
      updates.push('avatar = ?');
      params.push(avatar);
    }

    if (updates.length > 0) {
      params.push(playerId);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    // Update currencies
    if (gems !== undefined || coins !== undefined || crystals !== undefined) {
      const currentCurrencies = db.prepare(`
        SELECT * FROM player_currencies WHERE user_id = ?
      `).get(playerId) as { gems: number; coins: number; crystals: number } | undefined;

      if (currentCurrencies) {
        db.prepare(`
          UPDATE player_currencies SET
            gems = COALESCE(?, gems),
            coins = COALESCE(?, coins),
            crystals = COALESCE(?, crystals),
            updated_at = strftime('%s', 'now')
          WHERE user_id = ?
        `).run(gems, coins, crystals, playerId);
      } else {
        db.prepare(`
          INSERT INTO player_currencies (user_id, gems, coins, crystals)
          VALUES (?, ?, ?, ?)
        `).run(playerId, gems || 0, coins || 0, crystals || 0);
      }
    }

    // Log the action
    logAdminAction(
      req.admin!.userId,
      'UPDATE_PLAYER',
      'player',
      playerId,
      { updates: req.body },
      req.ip || null
    );

    res.json({ message: 'Player updated successfully' });
  } catch (error) {
    console.error('Update player error:', error);
    res.status(500).json({ error: 'Failed to update player' });
  }
});

// ============ BANS ============

// Ban player
router.post('/:playerId/ban', requirePermission(PERMISSIONS.BAN_PLAYERS), (req: AdminRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const { reason, type, duration } = req.body;

    if (!reason) {
      res.status(400).json({ error: 'Ban reason is required' });
      return;
    }

    const player = userQueries.findById.get(playerId);
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    // Check for existing active ban
    const existingBan = socialQueries.getActiveBan.get(playerId);
    if (existingBan) {
      res.status(400).json({ error: 'Player already has an active ban' });
      return;
    }

    const banId = uuidv4();
    const banType = type === 'permanent' ? 'permanent' : 'temporary';
    let expiresAt = null;

    if (banType === 'temporary') {
      const durationHours = parseInt(duration) || 24;
      expiresAt = Math.floor(Date.now() / 1000) + durationHours * 60 * 60;
    }

    socialQueries.createBan.run(
      banId,
      playerId,
      req.admin!.userId,
      reason,
      banType,
      expiresAt
    );

    // Log the action
    logAdminAction(
      req.admin!.userId,
      'BAN_PLAYER',
      'player',
      playerId,
      { reason, type: banType, duration, expiresAt },
      req.ip || null
    );

    res.json({
      message: 'Player banned successfully',
      banId,
      expiresAt,
    });
  } catch (error) {
    console.error('Ban player error:', error);
    res.status(500).json({ error: 'Failed to ban player' });
  }
});

// Unban player
router.delete('/:playerId/ban', requirePermission(PERMISSIONS.BAN_PLAYERS), (req: AdminRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    const ban = socialQueries.getActiveBan.get(playerId) as { id: string } | undefined;
    if (!ban) {
      res.status(404).json({ error: 'No active ban found' });
      return;
    }

    // Set expires_at to now to effectively unban
    db.prepare(`
      UPDATE player_bans SET expires_at = strftime('%s', 'now') WHERE id = ?
    `).run(ban.id);

    // Log the action
    logAdminAction(
      req.admin!.userId,
      'UNBAN_PLAYER',
      'player',
      playerId,
      { banId: ban.id },
      req.ip || null
    );

    res.json({ message: 'Player unbanned successfully' });
  } catch (error) {
    console.error('Unban player error:', error);
    res.status(500).json({ error: 'Failed to unban player' });
  }
});

// Get ban history
router.get('/:playerId/bans', requirePermission(PERMISSIONS.VIEW_PLAYERS), (req: AdminRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    const bans = db.prepare(`
      SELECT pb.*, u.username as banned_by_name
      FROM player_bans pb
      JOIN users u ON pb.banned_by = u.id
      WHERE pb.user_id = ?
      ORDER BY pb.created_at DESC
    `).all(playerId) as Array<{
      id: string;
      reason: string;
      ban_type: string;
      expires_at: number | null;
      created_at: number;
      banned_by_name: string;
    }>;

    res.json({
      bans: bans.map(b => ({
        id: b.id,
        reason: b.reason,
        type: b.ban_type,
        expiresAt: b.expires_at,
        createdAt: b.created_at,
        bannedBy: b.banned_by_name,
        active: b.expires_at === null || b.expires_at > Math.floor(Date.now() / 1000),
      })),
    });
  } catch (error) {
    console.error('Get ban history error:', error);
    res.status(500).json({ error: 'Failed to get ban history' });
  }
});

// ============ COMPENSATION ============

// Send compensation to player
router.post('/:playerId/compensate', requirePermission(PERMISSIONS.EDIT_PLAYERS), (req: AdminRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const { gems, coins, crystals, items, reason } = req.body;

    if (!reason) {
      res.status(400).json({ error: 'Compensation reason is required' });
      return;
    }

    const player = userQueries.findById.get(playerId);
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    // Add currencies
    if (gems || coins || crystals) {
      const currentCurrencies = db.prepare(`
        SELECT * FROM player_currencies WHERE user_id = ?
      `).get(playerId) as { gems: number; coins: number; crystals: number } | undefined;

      if (currentCurrencies) {
        db.prepare(`
          UPDATE player_currencies SET
            gems = gems + ?,
            coins = coins + ?,
            crystals = crystals + ?,
            updated_at = strftime('%s', 'now')
          WHERE user_id = ?
        `).run(gems || 0, coins || 0, crystals || 0, playerId);
      } else {
        db.prepare(`
          INSERT INTO player_currencies (user_id, gems, coins, crystals)
          VALUES (?, ?, ?, ?)
        `).run(playerId, gems || 0, coins || 0, crystals || 0);
      }
    }

    // Add items
    if (items && Array.isArray(items)) {
      for (const itemId of items) {
        try {
          db.prepare(`
            INSERT OR IGNORE INTO player_items (player_id, item_id)
            VALUES (?, ?)
          `).run(playerId, itemId);
        } catch {
          // Item might not exist, skip
        }
      }
    }

    // Log the action
    logAdminAction(
      req.admin!.userId,
      'COMPENSATE_PLAYER',
      'player',
      playerId,
      { gems, coins, crystals, items, reason },
      req.ip || null
    );

    res.json({ message: 'Compensation sent successfully' });
  } catch (error) {
    console.error('Compensate player error:', error);
    res.status(500).json({ error: 'Failed to send compensation' });
  }
});

export { router as playersRouter };
