import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { clanQueries, userQueries, db } from './database';
import { socialQueries } from './social-schema';
import { AuthRequest } from './auth';

const router = Router();

// ============ CLAN PERKS CONFIGURATION ============

const CLAN_PERKS = {
  xp_boost: {
    name: 'XP Boost',
    description: 'Bonus XP for all clan members',
    maxLevel: 5,
    costPerLevel: [1000, 2500, 5000, 10000, 25000],
    bonusPerLevel: [5, 10, 15, 20, 25], // percentage
  },
  treasury_capacity: {
    name: 'Treasury Capacity',
    description: 'Increase maximum treasury storage',
    maxLevel: 5,
    costPerLevel: [500, 1500, 3000, 6000, 12000],
    bonusPerLevel: [10000, 25000, 50000, 100000, 250000],
  },
  member_slots: {
    name: 'Member Slots',
    description: 'Increase maximum clan members',
    maxLevel: 5,
    costPerLevel: [2000, 4000, 8000, 16000, 32000],
    bonusPerLevel: [55, 60, 70, 80, 100],
  },
  war_rewards: {
    name: 'War Rewards',
    description: 'Bonus rewards from clan wars',
    maxLevel: 5,
    costPerLevel: [1500, 3000, 6000, 12000, 24000],
    bonusPerLevel: [10, 20, 30, 40, 50], // percentage
  },
  exclusive_skins: {
    name: 'Exclusive Skins',
    description: 'Unlock exclusive clan skins',
    maxLevel: 3,
    costPerLevel: [5000, 15000, 50000],
    bonusPerLevel: [1, 3, 6], // number of skins
  },
};

const CLAN_LEVEL_XP = [
  0, 1000, 3000, 6000, 10000, 15000, 21000, 28000, 36000, 45000,
  55000, 70000, 90000, 115000, 145000, 180000, 220000, 265000, 315000, 370000,
];

// ============ INTERFACES ============

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

interface ClanLevelRow {
  clan_id: string;
  level: number;
  xp: number;
  treasury_coins: number;
  treasury_gems: number;
  total_donations: number;
}

// ============ HELPER FUNCTIONS ============

function hasOfficerPermission(role: string): boolean {
  return ['leader', 'co-leader', 'officer'].includes(role);
}

function hasCoLeaderPermission(role: string): boolean {
  return ['leader', 'co-leader'].includes(role);
}

function calculateLevel(xp: number): number {
  for (let i = CLAN_LEVEL_XP.length - 1; i >= 0; i--) {
    if (xp >= CLAN_LEVEL_XP[i]) {
      return i + 1;
    }
  }
  return 1;
}

function ensureClanLevel(clanId: string): ClanLevelRow {
  let level = socialQueries.getClanLevel.get(clanId) as ClanLevelRow | undefined;
  if (!level) {
    socialQueries.upsertClanLevel.run(clanId, 1, 0, 0, 0, 0);
    level = { clan_id: clanId, level: 1, xp: 0, treasury_coins: 0, treasury_gems: 0, total_donations: 0 };
  }
  return level;
}

// ============ EXISTING ROUTES ============

// Get all clans (paginated)
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const clans = clanQueries.getTopClans.all(limit) as ClanRow[];

    const clansWithLevels = clans.map(clan => {
      const level = socialQueries.getClanLevel.get(clan.id) as ClanLevelRow | undefined;
      return {
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
        level: level?.level || 1,
      };
    });

    res.json({ clans: clansWithLevels });
  } catch (error) {
    console.error('Get clans error:', error);
    res.status(500).json({ error: 'Failed to get clans' });
  }
});

// Get clan by ID with full details
router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const clan = clanQueries.findById.get(id) as ClanRow | undefined;

    if (!clan) {
      res.status(404).json({ error: 'Clan not found' });
      return;
    }

    const members = clanQueries.getMembers.all(id) as MemberRow[];
    const level = ensureClanLevel(id);
    const perks = socialQueries.getClanPerks.all(id) as Array<{ perk_type: string; perk_level: number; unlocked_at: number }>;

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
      level: level.level,
      xp: level.xp,
      xpToNextLevel: CLAN_LEVEL_XP[level.level] || null,
      treasury: {
        coins: level.treasury_coins,
        gems: level.treasury_gems,
      },
      totalDonations: level.total_donations,
      perks: perks.map(p => ({
        type: p.perk_type,
        level: p.perk_level,
        maxLevel: CLAN_PERKS[p.perk_type as keyof typeof CLAN_PERKS]?.maxLevel || 0,
        name: CLAN_PERKS[p.perk_type as keyof typeof CLAN_PERKS]?.name || p.perk_type,
      })),
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

    const user = userQueries.findById.get(req.user.id) as { clan_id: string | null } | undefined;
    if (user?.clan_id) {
      res.status(400).json({ error: 'You are already in a clan' });
      return;
    }

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

    const createClanTransaction = db.transaction(() => {
      const clanId = uuidv4();
      clanQueries.create.run(
        clanId,
        name,
        tag.toUpperCase(),
        description || null,
        req.user!.id,
        icon || 'castle',
        color || '#00f5ff'
      );

      clanQueries.addMember.run(clanId, req.user!.id, 'leader');
      userQueries.updateClan.run(clanId, req.user!.id);

      // Initialize clan level
      socialQueries.upsertClanLevel.run(clanId, 1, 0, 0, 0, 0);

      return clanId;
    });

    const clanId = createClanTransaction();

    res.status(201).json({
      message: 'Clan created successfully',
      clan: {
        id: clanId,
        name,
        tag: tag.toUpperCase(),
        description,
        icon: icon || 'castle',
        color: color || '#00f5ff',
        level: 1,
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
    const clan = clanQueries.findById.get(id) as ClanRow | undefined;
    if (!clan) {
      res.status(404).json({ error: 'Clan not found' });
      return;
    }

    const user = userQueries.findById.get(req.user.id) as { clan_id: string | null } | undefined;
    if (user?.clan_id) {
      res.status(400).json({ error: 'You are already in a clan' });
      return;
    }

    const members = clanQueries.getMembers.all(id) as MemberRow[];

    // Check member limit with perk bonus
    const perks = socialQueries.getClanPerks.all(id) as Array<{ perk_type: string; perk_level: number }>;
    const memberSlotsPerk = perks.find(p => p.perk_type === 'member_slots');
    const maxMembers = memberSlotsPerk
      ? CLAN_PERKS.member_slots.bonusPerLevel[memberSlotsPerk.perk_level - 1] || 50
      : 50;

    if (members.length >= maxMembers) {
      res.status(400).json({ error: 'Clan is full' });
      return;
    }

    clanQueries.addMember.run(id, req.user.id, 'member');
    userQueries.updateClan.run(id, req.user.id);
    clanQueries.incrementMemberCount.run(id);

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
    const clan = clanQueries.findById.get(id) as ClanRow | undefined;
    if (!clan) {
      res.status(404).json({ error: 'Clan not found' });
      return;
    }

    const role = clanQueries.getMemberRole.get(id, req.user.id) as { role: string } | undefined;
    if (!role) {
      res.status(400).json({ error: 'You are not in this clan' });
      return;
    }

    if (role.role === 'leader') {
      res.status(400).json({ error: 'Leader cannot leave. Transfer leadership or disband the clan.' });
      return;
    }

    clanQueries.removeMember.run(id, req.user.id);
    userQueries.updateClan.run(null, req.user.id);
    clanQueries.decrementMemberCount.run(id);

    res.json({ message: 'Left clan successfully' });
  } catch (error) {
    console.error('Leave clan error:', error);
    res.status(500).json({ error: 'Failed to leave clan' });
  }
});

// Kick member
router.post('/:id/kick/:userId', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id, userId } = req.params;

    const myRole = clanQueries.getMemberRole.get(id, req.user.id) as { role: string } | undefined;
    if (!myRole || !hasOfficerPermission(myRole.role)) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

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

    // Officers can only kick members, co-leaders can kick officers
    if (myRole.role === 'officer' && targetRole.role !== 'member') {
      res.status(403).json({ error: 'Officers can only kick regular members' });
      return;
    }

    if (myRole.role === 'co-leader' && targetRole.role === 'co-leader') {
      res.status(403).json({ error: 'Co-leaders cannot kick other co-leaders' });
      return;
    }

    clanQueries.removeMember.run(id, userId);
    userQueries.updateClan.run(null, userId);
    clanQueries.decrementMemberCount.run(id);

    res.json({ message: 'Member kicked successfully' });
  } catch (error) {
    console.error('Kick member error:', error);
    res.status(500).json({ error: 'Failed to kick member' });
  }
});

// Promote/demote member
router.post('/:id/role/:userId', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id, userId } = req.params;
    const { role } = req.body;

    if (!['member', 'officer', 'co-leader'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    const myRole = clanQueries.getMemberRole.get(id, req.user.id) as { role: string } | undefined;

    // Only leader can assign co-leader, co-leaders can assign officer
    if (role === 'co-leader' && myRole?.role !== 'leader') {
      res.status(403).json({ error: 'Only the leader can assign co-leaders' });
      return;
    }

    if (!hasCoLeaderPermission(myRole?.role || '')) {
      res.status(403).json({ error: 'Only leader or co-leader can change roles' });
      return;
    }

    const targetRole = clanQueries.getMemberRole.get(id, userId) as { role: string } | undefined;
    if (!targetRole) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    if (targetRole.role === 'leader') {
      res.status(400).json({ error: 'Cannot change leader role' });
      return;
    }

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

    const myRole = clanQueries.getMemberRole.get(id, req.user.id) as { role: string } | undefined;
    if (myRole?.role !== 'leader') {
      res.status(403).json({ error: 'Only the leader can transfer leadership' });
      return;
    }

    const targetRole = clanQueries.getMemberRole.get(id, userId) as { role: string } | undefined;
    if (!targetRole) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    const transferLeadership = db.transaction(() => {
      clanQueries.updateMemberRole.run('co-leader', id, req.user!.id);
      clanQueries.updateMemberRole.run('leader', id, userId);
      db.prepare('UPDATE clans SET leader_id = ? WHERE id = ?').run(userId, id);
    });

    transferLeadership();

    res.json({ message: 'Leadership transferred successfully' });
  } catch (error) {
    console.error('Transfer leadership error:', error);
    res.status(500).json({ error: 'Failed to transfer leadership' });
  }
});

// Disband clan
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;
    const clan = clanQueries.findById.get(id) as ClanRow | undefined;
    if (!clan) {
      res.status(404).json({ error: 'Clan not found' });
      return;
    }

    if (clan.leader_id !== req.user.id) {
      res.status(403).json({ error: 'Only the leader can disband the clan' });
      return;
    }

    const disbandClan = db.transaction(() => {
      const members = clanQueries.getMembers.all(id) as MemberRow[];
      members.forEach(member => {
        userQueries.updateClan.run(null, member.id);
      });

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

// ============ CLAN CHAT ============

// Get clan chat history
router.get('/:id/chat', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);

    const role = clanQueries.getMemberRole.get(id, req.user.id);
    if (!role) {
      res.status(403).json({ error: 'You are not a member of this clan' });
      return;
    }

    const messages = socialQueries.getClanChat.all(id, limit) as Array<{
      id: string;
      user_id: string;
      message: string;
      message_type: string;
      created_at: number;
      username: string;
      avatar: string;
    }>;

    res.json({
      messages: messages.reverse().map(m => ({
        id: m.id,
        userId: m.user_id,
        username: m.username,
        avatar: m.avatar,
        message: m.message,
        type: m.message_type,
        timestamp: m.created_at,
      })),
    });
  } catch (error) {
    console.error('Get clan chat error:', error);
    res.status(500).json({ error: 'Failed to get clan chat' });
  }
});

// Send clan message
router.post('/:id/chat', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      res.status(400).json({ error: 'Message cannot be empty' });
      return;
    }

    if (message.length > 500) {
      res.status(400).json({ error: 'Message too long (max 500 characters)' });
      return;
    }

    const role = clanQueries.getMemberRole.get(id, req.user.id);
    if (!role) {
      res.status(403).json({ error: 'You are not a member of this clan' });
      return;
    }

    const messageId = uuidv4();
    socialQueries.addClanMessage.run(messageId, id, req.user.id, message.trim(), 'text');

    res.status(201).json({
      message: 'Message sent',
      messageId,
    });
  } catch (error) {
    console.error('Send clan message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ============ CLAN DONATIONS & TREASURY ============

// Get clan donations
router.get('/:id/donations', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);

    const donations = socialQueries.getClanDonations.all(id, limit) as Array<{
      id: string;
      user_id: string;
      amount: number;
      currency_type: string;
      created_at: number;
      username: string;
    }>;

    const level = ensureClanLevel(id);

    res.json({
      treasury: {
        coins: level.treasury_coins,
        gems: level.treasury_gems,
      },
      totalDonations: level.total_donations,
      recentDonations: donations.map(d => ({
        id: d.id,
        userId: d.user_id,
        username: d.username,
        amount: d.amount,
        currencyType: d.currency_type,
        timestamp: d.created_at,
      })),
    });
  } catch (error) {
    console.error('Get donations error:', error);
    res.status(500).json({ error: 'Failed to get donations' });
  }
});

// Make donation
router.post('/:id/donate', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;
    const { amount, currencyType } = req.body;

    if (!amount || amount < 1) {
      res.status(400).json({ error: 'Invalid donation amount' });
      return;
    }

    if (!['coins', 'gems'].includes(currencyType)) {
      res.status(400).json({ error: 'Invalid currency type' });
      return;
    }

    const role = clanQueries.getMemberRole.get(id, req.user.id);
    if (!role) {
      res.status(403).json({ error: 'You are not a member of this clan' });
      return;
    }

    // TODO: Check if user has enough currency and deduct it
    // For now, we just record the donation

    const donateTransaction = db.transaction(() => {
      const donationId = uuidv4();
      socialQueries.addDonation.run(donationId, id, req.user!.id, amount, currencyType);

      const level = ensureClanLevel(id);
      const newCoins = currencyType === 'coins' ? level.treasury_coins + amount : level.treasury_coins;
      const newGems = currencyType === 'gems' ? level.treasury_gems + amount : level.treasury_gems;
      const newXp = level.xp + Math.floor(amount * (currencyType === 'gems' ? 10 : 1));
      const newLevel = calculateLevel(newXp);

      socialQueries.upsertClanLevel.run(
        id,
        newLevel,
        newXp,
        newCoins,
        newGems,
        level.total_donations + amount
      );

      // Add system message about donation
      const systemMsgId = uuidv4();
      socialQueries.addClanMessage.run(
        systemMsgId,
        id,
        req.user!.id,
        `donated ${amount} ${currencyType} to the treasury!`,
        'system'
      );

      return { donationId, newLevel, leveledUp: newLevel > level.level };
    });

    const result = donateTransaction();

    res.status(201).json({
      message: 'Donation successful',
      donationId: result.donationId,
      leveledUp: result.leveledUp,
      newLevel: result.newLevel,
    });
  } catch (error) {
    console.error('Donate error:', error);
    res.status(500).json({ error: 'Failed to process donation' });
  }
});

// ============ CLAN PERKS ============

// Get clan perks
router.get('/:id/perks', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const level = ensureClanLevel(id);
    const perks = socialQueries.getClanPerks.all(id) as Array<{
      perk_type: string;
      perk_level: number;
      unlocked_at: number;
    }>;

    const perksMap: Record<string, { level: number; unlockedAt: number | null }> = {};
    perks.forEach(p => {
      perksMap[p.perk_type] = { level: p.perk_level, unlockedAt: p.unlocked_at };
    });

    const allPerks = Object.entries(CLAN_PERKS).map(([type, config]) => ({
      type,
      name: config.name,
      description: config.description,
      currentLevel: perksMap[type]?.level || 0,
      maxLevel: config.maxLevel,
      nextLevelCost: perksMap[type]?.level
        ? config.costPerLevel[perksMap[type].level] || null
        : config.costPerLevel[0],
      currentBonus: perksMap[type]?.level
        ? config.bonusPerLevel[perksMap[type].level - 1]
        : 0,
      nextBonus: perksMap[type]?.level
        ? config.bonusPerLevel[perksMap[type].level] || null
        : config.bonusPerLevel[0],
    }));

    res.json({
      clanLevel: level.level,
      treasury: {
        coins: level.treasury_coins,
        gems: level.treasury_gems,
      },
      perks: allPerks,
    });
  } catch (error) {
    console.error('Get perks error:', error);
    res.status(500).json({ error: 'Failed to get perks' });
  }
});

// Upgrade clan perk
router.post('/:id/perks/:perkType/upgrade', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id, perkType } = req.params;

    const perkConfig = CLAN_PERKS[perkType as keyof typeof CLAN_PERKS];
    if (!perkConfig) {
      res.status(400).json({ error: 'Invalid perk type' });
      return;
    }

    const myRole = clanQueries.getMemberRole.get(id, req.user.id) as { role: string } | undefined;
    if (!hasCoLeaderPermission(myRole?.role || '')) {
      res.status(403).json({ error: 'Only leader or co-leader can upgrade perks' });
      return;
    }

    const upgradeTransaction = db.transaction(() => {
      const level = ensureClanLevel(id);
      const perks = socialQueries.getClanPerks.all(id) as Array<{
        perk_type: string;
        perk_level: number;
      }>;

      const currentPerk = perks.find(p => p.perk_type === perkType);
      const currentLevel = currentPerk?.perk_level || 0;

      if (currentLevel >= perkConfig.maxLevel) {
        throw new Error('Perk is already at max level');
      }

      const upgradeCost = perkConfig.costPerLevel[currentLevel];
      if (level.treasury_gems < upgradeCost) {
        throw new Error(`Not enough gems in treasury (need ${upgradeCost})`);
      }

      // Deduct gems and upgrade perk
      socialQueries.upsertClanLevel.run(
        id,
        level.level,
        level.xp,
        level.treasury_coins,
        level.treasury_gems - upgradeCost,
        level.total_donations
      );

      const now = Math.floor(Date.now() / 1000);
      socialQueries.upsertClanPerk.run(id, perkType, currentLevel + 1, now);

      return { newLevel: currentLevel + 1, cost: upgradeCost };
    });

    try {
      const result = upgradeTransaction();
      res.json({
        message: 'Perk upgraded successfully',
        perkType,
        newLevel: result.newLevel,
        cost: result.cost,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  } catch (error) {
    console.error('Upgrade perk error:', error);
    res.status(500).json({ error: 'Failed to upgrade perk' });
  }
});

// ============ CLAN WARS ============

// Get clan wars
router.get('/:id/wars', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const limit = Math.min(20, parseInt(req.query.limit as string) || 10);

    const wars = socialQueries.getClanWars.all(id, id, limit) as Array<{
      id: string;
      challenger_clan_id: string;
      defender_clan_id: string;
      status: string;
      challenger_score: number;
      defender_score: number;
      winner_clan_id: string | null;
      start_time: number | null;
      end_time: number | null;
      created_at: number;
    }>;

    const warsWithDetails = wars.map(war => {
      const challengerClan = clanQueries.findById.get(war.challenger_clan_id) as ClanRow | undefined;
      const defenderClan = clanQueries.findById.get(war.defender_clan_id) as ClanRow | undefined;

      return {
        id: war.id,
        status: war.status,
        challenger: {
          id: war.challenger_clan_id,
          name: challengerClan?.name || 'Unknown',
          tag: challengerClan?.tag || '???',
          score: war.challenger_score,
        },
        defender: {
          id: war.defender_clan_id,
          name: defenderClan?.name || 'Unknown',
          tag: defenderClan?.tag || '???',
          score: war.defender_score,
        },
        winnerId: war.winner_clan_id,
        startTime: war.start_time,
        endTime: war.end_time,
        createdAt: war.created_at,
      };
    });

    res.json({ wars: warsWithDetails });
  } catch (error) {
    console.error('Get wars error:', error);
    res.status(500).json({ error: 'Failed to get clan wars' });
  }
});

// Declare war
router.post('/:id/war', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;
    const { targetClanId } = req.body;

    if (!targetClanId) {
      res.status(400).json({ error: 'Target clan ID is required' });
      return;
    }

    if (id === targetClanId) {
      res.status(400).json({ error: 'Cannot declare war on your own clan' });
      return;
    }

    const myRole = clanQueries.getMemberRole.get(id, req.user.id) as { role: string } | undefined;
    if (!hasCoLeaderPermission(myRole?.role || '')) {
      res.status(403).json({ error: 'Only leader or co-leader can declare war' });
      return;
    }

    const targetClan = clanQueries.findById.get(targetClanId) as ClanRow | undefined;
    if (!targetClan) {
      res.status(404).json({ error: 'Target clan not found' });
      return;
    }

    // Check if there's already an active war between these clans
    const existingWars = socialQueries.getClanWars.all(id, id, 10) as Array<{
      challenger_clan_id: string;
      defender_clan_id: string;
      status: string;
    }>;

    const activeWar = existingWars.find(w =>
      ['pending', 'active'].includes(w.status) &&
      ((w.challenger_clan_id === id && w.defender_clan_id === targetClanId) ||
       (w.challenger_clan_id === targetClanId && w.defender_clan_id === id))
    );

    if (activeWar) {
      res.status(400).json({ error: 'There is already an active war between these clans' });
      return;
    }

    const warId = uuidv4();
    socialQueries.createWar.run(warId, id, targetClanId);

    res.status(201).json({
      message: 'War declared! Waiting for opponent response.',
      warId,
    });
  } catch (error) {
    console.error('Declare war error:', error);
    res.status(500).json({ error: 'Failed to declare war' });
  }
});

// Respond to war declaration
router.post('/:id/war/:warId/respond', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id, warId } = req.params;
    const { accept } = req.body;

    const myRole = clanQueries.getMemberRole.get(id, req.user.id) as { role: string } | undefined;
    if (!hasCoLeaderPermission(myRole?.role || '')) {
      res.status(403).json({ error: 'Only leader or co-leader can respond to war' });
      return;
    }

    const war = socialQueries.getWar.get(warId) as {
      id: string;
      challenger_clan_id: string;
      defender_clan_id: string;
      status: string;
    } | undefined;

    if (!war) {
      res.status(404).json({ error: 'War not found' });
      return;
    }

    if (war.defender_clan_id !== id) {
      res.status(403).json({ error: 'Only the defending clan can respond' });
      return;
    }

    if (war.status !== 'pending') {
      res.status(400).json({ error: 'War is no longer pending' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const warDuration = 24 * 60 * 60; // 24 hours

    if (accept) {
      socialQueries.updateWarStatus.run('active', now, now + warDuration, null, warId);
      res.json({ message: 'War accepted! The battle begins!' });
    } else {
      socialQueries.updateWarStatus.run('declined', null, null, null, warId);
      res.json({ message: 'War declined.' });
    }
  } catch (error) {
    console.error('Respond to war error:', error);
    res.status(500).json({ error: 'Failed to respond to war' });
  }
});

// Get war details
router.get('/:id/war/:warId', (req: AuthRequest, res: Response) => {
  try {
    const { warId } = req.params;

    const war = socialQueries.getWar.get(warId) as {
      id: string;
      challenger_clan_id: string;
      defender_clan_id: string;
      status: string;
      challenger_score: number;
      defender_score: number;
      winner_clan_id: string | null;
      start_time: number | null;
      end_time: number | null;
      created_at: number;
    } | undefined;

    if (!war) {
      res.status(404).json({ error: 'War not found' });
      return;
    }

    const participants = socialQueries.getWarParticipants.all(warId) as Array<{
      user_id: string;
      clan_id: string;
      wins: number;
      losses: number;
      points: number;
      username: string;
      elo: number;
    }>;

    const challengerClan = clanQueries.findById.get(war.challenger_clan_id) as ClanRow;
    const defenderClan = clanQueries.findById.get(war.defender_clan_id) as ClanRow;

    res.json({
      id: war.id,
      status: war.status,
      challenger: {
        id: war.challenger_clan_id,
        name: challengerClan?.name,
        tag: challengerClan?.tag,
        score: war.challenger_score,
        participants: participants
          .filter(p => p.clan_id === war.challenger_clan_id)
          .map(p => ({
            userId: p.user_id,
            username: p.username,
            elo: p.elo,
            wins: p.wins,
            losses: p.losses,
            points: p.points,
          })),
      },
      defender: {
        id: war.defender_clan_id,
        name: defenderClan?.name,
        tag: defenderClan?.tag,
        score: war.defender_score,
        participants: participants
          .filter(p => p.clan_id === war.defender_clan_id)
          .map(p => ({
            userId: p.user_id,
            username: p.username,
            elo: p.elo,
            wins: p.wins,
            losses: p.losses,
            points: p.points,
          })),
      },
      winnerId: war.winner_clan_id,
      startTime: war.start_time,
      endTime: war.end_time,
      createdAt: war.created_at,
    });
  } catch (error) {
    console.error('Get war details error:', error);
    res.status(500).json({ error: 'Failed to get war details' });
  }
});

export { router as clanEnhancedRouter };
