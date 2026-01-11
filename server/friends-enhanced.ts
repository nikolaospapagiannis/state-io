import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { userQueries, db } from './database';
import { socialQueries } from './social-schema';
import { AuthRequest } from './auth';

const router = Router();

// ============ INTERFACES ============

interface FriendRow {
  user_id: string;
  friend_id: string;
  status: string;
  created_at: number;
}

interface UserRow {
  id: string;
  username: string;
  elo: number;
  avatar: string;
  last_login: number;
}

// ============ HELPER FUNCTIONS ============

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============ FRIENDS MANAGEMENT ============

// Get friends list
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const friends = db.prepare(`
      SELECT f.*, u.username, u.elo, u.avatar, u.last_login
      FROM friends f
      JOIN users u ON (
        CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
      ) = u.id
      WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
    `).all(req.user.id, req.user.id, req.user.id) as Array<FriendRow & UserRow>;

    const now = Math.floor(Date.now() / 1000);
    const onlineThreshold = 5 * 60; // 5 minutes

    res.json({
      friends: friends.map(f => ({
        id: f.user_id === req.user!.id ? f.friend_id : f.user_id,
        username: f.username,
        elo: f.elo,
        avatar: f.avatar,
        online: now - f.last_login < onlineThreshold,
        lastSeen: f.last_login,
        friendSince: f.created_at,
      })),
    });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ error: 'Failed to get friends' });
  }
});

// Get friend requests
router.get('/requests', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const incoming = db.prepare(`
      SELECT f.*, u.username, u.elo, u.avatar
      FROM friends f
      JOIN users u ON f.user_id = u.id
      WHERE f.friend_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `).all(req.user.id) as Array<FriendRow & UserRow>;

    const outgoing = db.prepare(`
      SELECT f.*, u.username, u.elo, u.avatar
      FROM friends f
      JOIN users u ON f.friend_id = u.id
      WHERE f.user_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `).all(req.user.id) as Array<FriendRow & UserRow>;

    res.json({
      incoming: incoming.map(r => ({
        id: r.user_id,
        username: r.username,
        elo: r.elo,
        avatar: r.avatar,
        sentAt: r.created_at,
      })),
      outgoing: outgoing.map(r => ({
        id: r.friend_id,
        username: r.username,
        elo: r.elo,
        avatar: r.avatar,
        sentAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({ error: 'Failed to get friend requests' });
  }
});

// Send friend request
router.post('/request/:userId', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { userId } = req.params;

    if (userId === req.user.id) {
      res.status(400).json({ error: 'Cannot send friend request to yourself' });
      return;
    }

    const targetUser = userQueries.findById.get(userId);
    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if already friends or request exists
    const existing = db.prepare(`
      SELECT * FROM friends
      WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `).get(req.user.id, userId, userId, req.user.id);

    if (existing) {
      res.status(400).json({ error: 'Friend request already exists or you are already friends' });
      return;
    }

    db.prepare(`
      INSERT INTO friends (user_id, friend_id, status)
      VALUES (?, ?, 'pending')
    `).run(req.user.id, userId);

    res.status(201).json({ message: 'Friend request sent' });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// Accept friend request
router.post('/accept/:userId', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { userId } = req.params;

    const request = db.prepare(`
      SELECT * FROM friends
      WHERE user_id = ? AND friend_id = ? AND status = 'pending'
    `).get(userId, req.user.id) as FriendRow | undefined;

    if (!request) {
      res.status(404).json({ error: 'Friend request not found' });
      return;
    }

    db.prepare(`
      UPDATE friends SET status = 'accepted'
      WHERE user_id = ? AND friend_id = ?
    `).run(userId, req.user.id);

    // Add activity for both users
    const activityId1 = uuidv4();
    const activityId2 = uuidv4();
    const activityData = JSON.stringify({ friendId: req.user.id });
    const activityData2 = JSON.stringify({ friendId: userId });

    socialQueries.addActivity.run(activityId1, userId, 'new_friend', activityData);
    socialQueries.addActivity.run(activityId2, req.user.id, 'new_friend', activityData2);

    res.json({ message: 'Friend request accepted' });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// Decline/cancel friend request
router.delete('/request/:userId', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { userId } = req.params;

    const result = db.prepare(`
      DELETE FROM friends
      WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
        AND status = 'pending'
    `).run(req.user.id, userId, userId, req.user.id);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Friend request not found' });
      return;
    }

    res.json({ message: 'Friend request removed' });
  } catch (error) {
    console.error('Remove friend request error:', error);
    res.status(500).json({ error: 'Failed to remove friend request' });
  }
});

// Remove friend
router.delete('/:userId', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { userId } = req.params;

    const result = db.prepare(`
      DELETE FROM friends
      WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
        AND status = 'accepted'
    `).run(req.user.id, userId, userId, req.user.id);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Friend not found' });
      return;
    }

    res.json({ message: 'Friend removed' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// ============ ACTIVITY FEED ============

// Get activity feed
router.get('/activity', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

    const activities = socialQueries.getFriendActivity.all(
      req.user.id,
      req.user.id,
      limit
    ) as Array<{
      id: string;
      user_id: string;
      activity_type: string;
      activity_data: string;
      created_at: number;
      username: string;
      avatar: string;
    }>;

    res.json({
      activities: activities.map(a => ({
        id: a.id,
        userId: a.user_id,
        username: a.username,
        avatar: a.avatar,
        type: a.activity_type,
        data: JSON.parse(a.activity_data),
        timestamp: a.created_at,
      })),
    });
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({ error: 'Failed to get activity feed' });
  }
});

// ============ GIFT SYSTEM ============

// Get pending gifts
router.get('/gifts', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const gifts = socialQueries.getGifts.all(req.user.id) as Array<{
      id: string;
      sender_id: string;
      gift_type: string;
      gift_amount: number;
      message: string | null;
      created_at: number;
      sender_name: string;
      sender_avatar: string;
    }>;

    res.json({
      gifts: gifts.map(g => ({
        id: g.id,
        senderId: g.sender_id,
        senderName: g.sender_name,
        senderAvatar: g.sender_avatar,
        type: g.gift_type,
        amount: g.gift_amount,
        message: g.message,
        sentAt: g.created_at,
      })),
    });
  } catch (error) {
    console.error('Get gifts error:', error);
    res.status(500).json({ error: 'Failed to get gifts' });
  }
});

// Send gift
router.post('/gift', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { friendId, giftType, amount, message } = req.body;

    if (!friendId || !giftType || !amount) {
      res.status(400).json({ error: 'Friend ID, gift type, and amount are required' });
      return;
    }

    if (!['coins', 'gems', 'item'].includes(giftType)) {
      res.status(400).json({ error: 'Invalid gift type' });
      return;
    }

    if (amount < 1) {
      res.status(400).json({ error: 'Invalid amount' });
      return;
    }

    // Check if they are friends
    const friendship = db.prepare(`
      SELECT * FROM friends
      WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
        AND status = 'accepted'
    `).get(req.user.id, friendId, friendId, req.user.id);

    if (!friendship) {
      res.status(403).json({ error: 'You can only send gifts to friends' });
      return;
    }

    // TODO: Check if user has enough currency and deduct it
    // For now, we just record the gift

    const giftId = uuidv4();
    socialQueries.sendGift.run(
      giftId,
      req.user.id,
      friendId,
      giftType,
      amount,
      message || null
    );

    // Add activity
    const activityId = uuidv4();
    const activityData = JSON.stringify({
      giftId,
      giftType,
      amount,
      receiverId: friendId,
    });
    socialQueries.addActivity.run(activityId, req.user.id, 'gift_sent', activityData);

    res.status(201).json({
      message: 'Gift sent successfully',
      giftId,
    });
  } catch (error) {
    console.error('Send gift error:', error);
    res.status(500).json({ error: 'Failed to send gift' });
  }
});

// Claim gift
router.post('/gift/:giftId/claim', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { giftId } = req.params;

    const result = socialQueries.claimGift.run(giftId, req.user.id);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Gift not found or already claimed' });
      return;
    }

    // TODO: Add the gift contents to user's inventory/currency

    res.json({ message: 'Gift claimed successfully' });
  } catch (error) {
    console.error('Claim gift error:', error);
    res.status(500).json({ error: 'Failed to claim gift' });
  }
});

// ============ PARTY SYSTEM ============

// Get current party
router.get('/party', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const party = socialQueries.getUserParty.get(req.user.id) as {
      id: string;
      leader_id: string;
      mode: string | null;
      status: string;
      max_size: number;
      created_at: number;
    } | undefined;

    if (!party) {
      res.json({ party: null });
      return;
    }

    const members = socialQueries.getPartyMembers.all(party.id) as Array<{
      user_id: string;
      ready: number;
      joined_at: number;
      username: string;
      elo: number;
      avatar: string;
    }>;

    res.json({
      party: {
        id: party.id,
        leaderId: party.leader_id,
        mode: party.mode,
        status: party.status,
        maxSize: party.max_size,
        createdAt: party.created_at,
        members: members.map(m => ({
          userId: m.user_id,
          username: m.username,
          elo: m.elo,
          avatar: m.avatar,
          ready: m.ready === 1,
          joinedAt: m.joined_at,
        })),
      },
    });
  } catch (error) {
    console.error('Get party error:', error);
    res.status(500).json({ error: 'Failed to get party' });
  }
});

// Create party
router.post('/party', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { mode, maxSize } = req.body;

    // Check if user is already in a party
    const existingParty = socialQueries.getUserParty.get(req.user.id);
    if (existingParty) {
      res.status(400).json({ error: 'You are already in a party' });
      return;
    }

    const partyId = uuidv4();
    const size = Math.min(5, Math.max(2, maxSize || 5));

    const createPartyTransaction = db.transaction(() => {
      socialQueries.createParty.run(partyId, req.user!.id, mode || null, size);
      socialQueries.addPartyMember.run(partyId, req.user!.id);
    });

    createPartyTransaction();

    res.status(201).json({
      message: 'Party created',
      partyId,
    });
  } catch (error) {
    console.error('Create party error:', error);
    res.status(500).json({ error: 'Failed to create party' });
  }
});

// Invite to party
router.post('/party/invite/:userId', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { userId } = req.params;

    const party = socialQueries.getUserParty.get(req.user.id) as {
      id: string;
      leader_id: string;
      max_size: number;
    } | undefined;

    if (!party) {
      res.status(400).json({ error: 'You are not in a party' });
      return;
    }

    if (party.leader_id !== req.user.id) {
      res.status(403).json({ error: 'Only the party leader can invite' });
      return;
    }

    // Check if they are friends
    const friendship = db.prepare(`
      SELECT * FROM friends
      WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
        AND status = 'accepted'
    `).get(req.user.id, userId, userId, req.user.id);

    if (!friendship) {
      res.status(403).json({ error: 'You can only invite friends to your party' });
      return;
    }

    // Check if party is full
    const members = socialQueries.getPartyMembers.all(party.id) as Array<{ user_id: string }>;
    if (members.length >= party.max_size) {
      res.status(400).json({ error: 'Party is full' });
      return;
    }

    // Check if user is already in the party
    if (members.some(m => m.user_id === userId)) {
      res.status(400).json({ error: 'User is already in the party' });
      return;
    }

    // Check if user is in another party
    const targetParty = socialQueries.getUserParty.get(userId);
    if (targetParty) {
      res.status(400).json({ error: 'User is already in another party' });
      return;
    }

    // TODO: Send invitation notification instead of auto-joining
    // For now, we auto-add them to the party
    socialQueries.addPartyMember.run(party.id, userId);

    res.json({ message: 'User added to party' });
  } catch (error) {
    console.error('Invite to party error:', error);
    res.status(500).json({ error: 'Failed to invite to party' });
  }
});

// Leave party
router.post('/party/leave', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const party = socialQueries.getUserParty.get(req.user.id) as {
      id: string;
      leader_id: string;
    } | undefined;

    if (!party) {
      res.status(400).json({ error: 'You are not in a party' });
      return;
    }

    const leaveTransaction = db.transaction(() => {
      socialQueries.removePartyMember.run(party.id, req.user!.id);

      const remainingMembers = socialQueries.getPartyMembers.all(party.id) as Array<{
        user_id: string;
        joined_at: number;
      }>;

      if (remainingMembers.length === 0) {
        // Delete empty party
        socialQueries.deleteParty.run(party.id);
      } else if (party.leader_id === req.user!.id) {
        // Transfer leadership to oldest member
        const newLeader = remainingMembers.sort((a, b) => a.joined_at - b.joined_at)[0];
        db.prepare('UPDATE parties SET leader_id = ? WHERE id = ?').run(newLeader.user_id, party.id);
      }
    });

    leaveTransaction();

    res.json({ message: 'Left party' });
  } catch (error) {
    console.error('Leave party error:', error);
    res.status(500).json({ error: 'Failed to leave party' });
  }
});

// Set ready status
router.post('/party/ready', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { ready } = req.body;

    const party = socialQueries.getUserParty.get(req.user.id) as { id: string } | undefined;

    if (!party) {
      res.status(400).json({ error: 'You are not in a party' });
      return;
    }

    socialQueries.setPartyMemberReady.run(ready ? 1 : 0, party.id, req.user.id);

    res.json({ message: ready ? 'Marked as ready' : 'Marked as not ready' });
  } catch (error) {
    console.error('Set ready error:', error);
    res.status(500).json({ error: 'Failed to set ready status' });
  }
});

// ============ FRIENDLY MATCHES ============

// Create friendly match
router.post('/friendly-match', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { mode, mapId } = req.body;

    const matchId = uuidv4();
    const inviteCode = generateInviteCode();

    socialQueries.createFriendlyMatch.run(
      matchId,
      req.user.id,
      mode || '1v1',
      mapId || null,
      inviteCode
    );

    res.status(201).json({
      message: 'Friendly match created',
      matchId,
      inviteCode,
    });
  } catch (error) {
    console.error('Create friendly match error:', error);
    res.status(500).json({ error: 'Failed to create friendly match' });
  }
});

// Join friendly match by code
router.post('/friendly-match/join/:code', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { code } = req.params;

    const match = socialQueries.getFriendlyMatchByCode.get(code.toUpperCase(), 'waiting') as {
      id: string;
      host_id: string;
      mode: string;
      map_id: number | null;
    } | undefined;

    if (!match) {
      res.status(404).json({ error: 'Match not found or already started' });
      return;
    }

    // TODO: Actually join the match room via socket
    // For now, just return the match details

    res.json({
      message: 'Joining match',
      matchId: match.id,
      hostId: match.host_id,
      mode: match.mode,
      mapId: match.map_id,
    });
  } catch (error) {
    console.error('Join friendly match error:', error);
    res.status(500).json({ error: 'Failed to join friendly match' });
  }
});

// ============ SPECTATOR MODE ============

// Start spectating a friend
router.post('/spectate/:userId', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { userId } = req.params;

    // Check if they are friends
    const friendship = db.prepare(`
      SELECT * FROM friends
      WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
        AND status = 'accepted'
    `).get(req.user.id, userId, userId, req.user.id);

    if (!friendship) {
      res.status(403).json({ error: 'You can only spectate friends' });
      return;
    }

    // TODO: Check if the friend is actually in a game
    // TODO: Get the actual match ID from socket/game state
    const matchId = 'pending'; // Placeholder

    const sessionId = uuidv4();
    socialQueries.createSpectatorSession.run(sessionId, matchId, req.user.id, userId);

    res.json({
      message: 'Spectating',
      sessionId,
      targetUserId: userId,
    });
  } catch (error) {
    console.error('Start spectating error:', error);
    res.status(500).json({ error: 'Failed to start spectating' });
  }
});

// Stop spectating
router.post('/spectate/stop', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { sessionId } = req.body;

    if (!sessionId) {
      res.status(400).json({ error: 'Session ID is required' });
      return;
    }

    socialQueries.endSpectatorSession.run(sessionId);

    res.json({ message: 'Stopped spectating' });
  } catch (error) {
    console.error('Stop spectating error:', error);
    res.status(500).json({ error: 'Failed to stop spectating' });
  }
});

export { router as friendsEnhancedRouter };
