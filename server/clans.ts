import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { clanQueries, userQueries, db } from './database';
import { AuthRequest } from './auth';

const router = Router();

interface ClanRow {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  leader_id: string;
  elo: number;
  wins: number;
  losses: number;
  created_at: number;
  icon: string;
  color: string;
  member_count?: number;
}

interface MemberRow {
  id: string;
  username: string;
  elo: number;
  avatar: string;
  role: string;
  joined_at: number;
}

// Get all clans (paginated)
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const clans = clanQueries.getTopClans.all(limit) as ClanRow[];

    res.json({
      clans: clans.map(clan => ({
        id: clan.id,
        name: clan.name,
        tag: clan.tag,
        description: clan.description,
        elo: clan.elo,
        wins: clan.wins,
        losses: clan.losses,
        icon: clan.icon,
        color: clan.color,
        memberCount: clan.member_count || 0,
      })),
    });
  } catch (error) {
    console.error('Get clans error:', error);
    res.status(500).json({ error: 'Failed to get clans' });
  }
});

// Get clan by ID
router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const clan = clanQueries.findById.get(id) as ClanRow | undefined;

    if (!clan) {
      res.status(404).json({ error: 'Clan not found' });
      return;
    }

    const members = clanQueries.getMembers.all(id) as MemberRow[];

    res.json({
      id: clan.id,
      name: clan.name,
      tag: clan.tag,
      description: clan.description,
      leaderId: clan.leader_id,
      elo: clan.elo,
      wins: clan.wins,
      losses: clan.losses,
      icon: clan.icon,
      color: clan.color,
      createdAt: clan.created_at,
      members: members.map(m => ({
        id: m.id,
        username: m.username,
        elo: m.elo,
        avatar: m.avatar,
        role: m.role,
        joinedAt: m.joined_at,
      })),
    });
  } catch (error) {
    console.error('Get clan error:', error);
    res.status(500).json({ error: 'Failed to get clan' });
  }
});

// Create clan
router.post('/', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { name, tag, description, icon, color } = req.body;

    // Validation
    if (!name || !tag) {
      res.status(400).json({ error: 'Name and tag are required' });
      return;
    }

    if (name.length < 3 || name.length > 30) {
      res.status(400).json({ error: 'Clan name must be 3-30 characters' });
      return;
    }

    if (tag.length < 2 || tag.length > 5) {
      res.status(400).json({ error: 'Clan tag must be 2-5 characters' });
      return;
    }

    // Check if user already in a clan
    const user = userQueries.findById.get(req.user.id) as { clan_id: string | null } | undefined;
    if (user?.clan_id) {
      res.status(400).json({ error: 'You are already in a clan' });
      return;
    }

    // Check if name/tag taken
    const existingName = clanQueries.findByName.get(name);
    if (existingName) {
      res.status(409).json({ error: 'Clan name already taken' });
      return;
    }

    const existingTag = clanQueries.findByTag.get(tag.toUpperCase());
    if (existingTag) {
      res.status(409).json({ error: 'Clan tag already taken' });
      return;
    }

    // Create clan
    const clanId = uuidv4();
    clanQueries.create.run(
      clanId,
      name,
      tag.toUpperCase(),
      description || null,
      req.user.id,
      icon || '🏰',
      color || '#00f5ff'
    );

    // Add leader as member
    clanQueries.addMember.run(clanId, req.user.id, 'leader');

    // Update user's clan
    userQueries.updateClan.run(clanId, req.user.id);

    res.status(201).json({
      message: 'Clan created successfully',
      clan: {
        id: clanId,
        name,
        tag: tag.toUpperCase(),
        description,
        icon: icon || '🏰',
        color: color || '#00f5ff',
      },
    });
  } catch (error) {
    console.error('Create clan error:', error);
    res.status(500).json({ error: 'Failed to create clan' });
  }
});

// Join clan
router.post('/:id/join', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;

    // Check if clan exists
    const clan = clanQueries.findById.get(id) as ClanRow | undefined;
    if (!clan) {
      res.status(404).json({ error: 'Clan not found' });
      return;
    }

    // Check if user already in a clan
    const user = userQueries.findById.get(req.user.id) as { clan_id: string | null } | undefined;
    if (user?.clan_id) {
      res.status(400).json({ error: 'You are already in a clan' });
      return;
    }

    // Check member limit (50 members max)
    const members = clanQueries.getMembers.all(id) as MemberRow[];
    if (members.length >= 50) {
      res.status(400).json({ error: 'Clan is full' });
      return;
    }

    // Add member
    clanQueries.addMember.run(id, req.user.id, 'member');
    userQueries.updateClan.run(id, req.user.id);

    res.json({ message: 'Joined clan successfully' });
  } catch (error) {
    console.error('Join clan error:', error);
    res.status(500).json({ error: 'Failed to join clan' });
  }
});

// Leave clan
router.post('/:id/leave', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;

    // Check if clan exists
    const clan = clanQueries.findById.get(id) as ClanRow | undefined;
    if (!clan) {
      res.status(404).json({ error: 'Clan not found' });
      return;
    }

    // Check if user is in this clan
    const role = clanQueries.getMemberRole.get(id, req.user.id) as { role: string } | undefined;
    if (!role) {
      res.status(400).json({ error: 'You are not in this clan' });
      return;
    }

    // Leader cannot leave, must transfer or disband
    if (role.role === 'leader') {
      res.status(400).json({ error: 'Leader cannot leave. Transfer leadership or disband the clan.' });
      return;
    }

    // Remove member
    clanQueries.removeMember.run(id, req.user.id);
    userQueries.updateClan.run(null, req.user.id);

    res.json({ message: 'Left clan successfully' });
  } catch (error) {
    console.error('Leave clan error:', error);
    res.status(500).json({ error: 'Failed to leave clan' });
  }
});

// Kick member (leader/officer only)
router.post('/:id/kick/:userId', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id, userId } = req.params;

    // Check permissions
    const myRole = clanQueries.getMemberRole.get(id, req.user.id) as { role: string } | undefined;
    if (!myRole || !['leader', 'officer'].includes(myRole.role)) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    // Cannot kick yourself or the leader
    if (userId === req.user.id) {
      res.status(400).json({ error: 'Cannot kick yourself' });
      return;
    }

    const targetRole = clanQueries.getMemberRole.get(id, userId) as { role: string } | undefined;
    if (!targetRole) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    if (targetRole.role === 'leader') {
      res.status(403).json({ error: 'Cannot kick the leader' });
      return;
    }

    // Officers can only kick members
    if (myRole.role === 'officer' && targetRole.role === 'officer') {
      res.status(403).json({ error: 'Officers cannot kick other officers' });
      return;
    }

    // Kick member
    clanQueries.removeMember.run(id, userId);
    userQueries.updateClan.run(null, userId);

    res.json({ message: 'Member kicked successfully' });
  } catch (error) {
    console.error('Kick member error:', error);
    res.status(500).json({ error: 'Failed to kick member' });
  }
});

// Promote/demote member (leader only)
router.post('/:id/role/:userId', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id, userId } = req.params;
    const { role } = req.body;

    if (!['member', 'officer'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    // Check if leader
    const myRole = clanQueries.getMemberRole.get(id, req.user.id) as { role: string } | undefined;
    if (myRole?.role !== 'leader') {
      res.status(403).json({ error: 'Only the leader can change roles' });
      return;
    }

    // Check target exists
    const targetRole = clanQueries.getMemberRole.get(id, userId) as { role: string } | undefined;
    if (!targetRole) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    if (targetRole.role === 'leader') {
      res.status(400).json({ error: 'Cannot change leader role' });
      return;
    }

    // Update role
    clanQueries.updateMemberRole.run(role, id, userId);

    res.json({ message: 'Role updated successfully' });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Transfer leadership
router.post('/:id/transfer/:userId', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id, userId } = req.params;

    // Check if leader
    const myRole = clanQueries.getMemberRole.get(id, req.user.id) as { role: string } | undefined;
    if (myRole?.role !== 'leader') {
      res.status(403).json({ error: 'Only the leader can transfer leadership' });
      return;
    }

    // Check target exists
    const targetRole = clanQueries.getMemberRole.get(id, userId) as { role: string } | undefined;
    if (!targetRole) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    // Transfer
    const transferLeadership = db.transaction(() => {
      clanQueries.updateMemberRole.run('officer', id, req.user!.id);
      clanQueries.updateMemberRole.run('leader', id, userId);

      // Update clan leader_id
      db.prepare('UPDATE clans SET leader_id = ? WHERE id = ?').run(userId, id);
    });

    transferLeadership();

    res.json({ message: 'Leadership transferred successfully' });
  } catch (error) {
    console.error('Transfer leadership error:', error);
    res.status(500).json({ error: 'Failed to transfer leadership' });
  }
});

// Disband clan (leader only)
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;

    // Check if leader
    const clan = clanQueries.findById.get(id) as ClanRow | undefined;
    if (!clan) {
      res.status(404).json({ error: 'Clan not found' });
      return;
    }

    if (clan.leader_id !== req.user.id) {
      res.status(403).json({ error: 'Only the leader can disband the clan' });
      return;
    }

    // Disband
    const disbandClan = db.transaction(() => {
      // Remove all members' clan association
      const members = clanQueries.getMembers.all(id) as MemberRow[];
      members.forEach(member => {
        userQueries.updateClan.run(null, member.id);
      });

      // Delete members and clan
      clanQueries.deleteMembers.run(id);
      clanQueries.delete.run(id);
    });

    disbandClan();

    res.json({ message: 'Clan disbanded successfully' });
  } catch (error) {
    console.error('Disband clan error:', error);
    res.status(500).json({ error: 'Failed to disband clan' });
  }
});

export { router as clanRouter };
