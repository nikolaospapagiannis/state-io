import { db } from './database';

// ============ SOCIAL FEATURES - CLAN ENHANCEMENTS ============

// Clan levels and XP
db.exec(`
  CREATE TABLE IF NOT EXISTS clan_levels (
    clan_id TEXT PRIMARY KEY,
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    treasury_coins INTEGER DEFAULT 0,
    treasury_gems INTEGER DEFAULT 0,
    total_donations INTEGER DEFAULT 0,
    FOREIGN KEY (clan_id) REFERENCES clans(id)
  )
`);

// Clan perks (unlocked at different levels)
db.exec(`
  CREATE TABLE IF NOT EXISTS clan_perks (
    clan_id TEXT NOT NULL,
    perk_type TEXT NOT NULL,
    perk_level INTEGER DEFAULT 0,
    unlocked_at INTEGER,
    PRIMARY KEY (clan_id, perk_type),
    FOREIGN KEY (clan_id) REFERENCES clans(id)
  )
`);

// Clan chat messages
db.exec(`
  CREATE TABLE IF NOT EXISTS clan_chat (
    id TEXT PRIMARY KEY,
    clan_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    message_type TEXT DEFAULT 'text',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (clan_id) REFERENCES clans(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Clan donations
db.exec(`
  CREATE TABLE IF NOT EXISTS clan_donations (
    id TEXT PRIMARY KEY,
    clan_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency_type TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (clan_id) REFERENCES clans(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Clan wars
db.exec(`
  CREATE TABLE IF NOT EXISTS clan_wars (
    id TEXT PRIMARY KEY,
    challenger_clan_id TEXT NOT NULL,
    defender_clan_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    challenger_score INTEGER DEFAULT 0,
    defender_score INTEGER DEFAULT 0,
    winner_clan_id TEXT,
    start_time INTEGER,
    end_time INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (challenger_clan_id) REFERENCES clans(id),
    FOREIGN KEY (defender_clan_id) REFERENCES clans(id)
  )
`);

// Clan war participants
db.exec(`
  CREATE TABLE IF NOT EXISTS clan_war_participants (
    war_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    clan_id TEXT NOT NULL,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    PRIMARY KEY (war_id, user_id),
    FOREIGN KEY (war_id) REFERENCES clan_wars(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (clan_id) REFERENCES clans(id)
  )
`);

// ============ SOCIAL FEATURES - FRIEND ENHANCEMENTS ============

// Friend activity feed
db.exec(`
  CREATE TABLE IF NOT EXISTS friend_activity (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    activity_data TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Friend gifts
db.exec(`
  CREATE TABLE IF NOT EXISTS friend_gifts (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    gift_type TEXT NOT NULL,
    gift_amount INTEGER NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'pending',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    claimed_at INTEGER,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
  )
`);

// Party system
db.exec(`
  CREATE TABLE IF NOT EXISTS parties (
    id TEXT PRIMARY KEY,
    leader_id TEXT NOT NULL,
    mode TEXT,
    status TEXT DEFAULT 'open',
    max_size INTEGER DEFAULT 5,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (leader_id) REFERENCES users(id)
  )
`);

// Party members
db.exec(`
  CREATE TABLE IF NOT EXISTS party_members (
    party_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    ready INTEGER DEFAULT 0,
    joined_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (party_id, user_id),
    FOREIGN KEY (party_id) REFERENCES parties(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Spectator sessions
db.exec(`
  CREATE TABLE IF NOT EXISTS spectator_sessions (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    spectator_id TEXT NOT NULL,
    target_player_id TEXT,
    started_at INTEGER DEFAULT (strftime('%s', 'now')),
    ended_at INTEGER,
    FOREIGN KEY (spectator_id) REFERENCES users(id),
    FOREIGN KEY (target_player_id) REFERENCES users(id)
  )
`);

// Friendly matches (private, no rank change)
db.exec(`
  CREATE TABLE IF NOT EXISTS friendly_matches (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL,
    status TEXT DEFAULT 'waiting',
    mode TEXT DEFAULT '1v1',
    map_id INTEGER,
    invite_code TEXT UNIQUE,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    started_at INTEGER,
    ended_at INTEGER,
    FOREIGN KEY (host_id) REFERENCES users(id)
  )
`);

// ============ REFERRAL SYSTEM ============

// Referral codes
db.exec(`
  CREATE TABLE IF NOT EXISTS referral_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    uses_count INTEGER DEFAULT 0,
    max_uses INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Referrals (who referred whom)
db.exec(`
  CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    referrer_id TEXT NOT NULL,
    referred_id TEXT NOT NULL UNIQUE,
    code_used TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    device_fingerprint TEXT,
    ip_address TEXT,
    qualified_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (referrer_id) REFERENCES users(id),
    FOREIGN KEY (referred_id) REFERENCES users(id)
  )
`);

// Referral milestones
db.exec(`
  CREATE TABLE IF NOT EXISTS referral_milestones (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    milestone_count INTEGER NOT NULL,
    reward_type TEXT NOT NULL,
    reward_amount INTEGER NOT NULL,
    claimed INTEGER DEFAULT 0,
    claimed_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(user_id, milestone_count),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// ============ ADMIN & MODERATION ============

// Admin users
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    user_id TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'moderator',
    permissions TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    created_by TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Admin audit log
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (admin_id) REFERENCES users(id)
  )
`);

// Player reports
db.exec(`
  CREATE TABLE IF NOT EXISTS player_reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    reported_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    description TEXT,
    evidence TEXT,
    status TEXT DEFAULT 'pending',
    assigned_to TEXT,
    resolved_at INTEGER,
    resolution TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (reporter_id) REFERENCES users(id),
    FOREIGN KEY (reported_id) REFERENCES users(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id)
  )
`);

// Player bans
db.exec(`
  CREATE TABLE IF NOT EXISTS player_bans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    banned_by TEXT NOT NULL,
    reason TEXT NOT NULL,
    ban_type TEXT DEFAULT 'temporary',
    expires_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (banned_by) REFERENCES users(id)
  )
`);

// Chat logs for moderation
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    chat_type TEXT NOT NULL,
    chat_id TEXT,
    message TEXT NOT NULL,
    flagged INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Daily metrics (for admin dashboard)
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_metrics (
    date TEXT PRIMARY KEY,
    dau INTEGER DEFAULT 0,
    mau INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    matches_played INTEGER DEFAULT 0,
    total_revenue REAL DEFAULT 0,
    avg_session_duration REAL DEFAULT 0,
    retention_d1 REAL DEFAULT 0,
    retention_d7 REAL DEFAULT 0,
    retention_d30 REAL DEFAULT 0,
    ccu_peak INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

// ============ INDEXES ============

db.exec(`CREATE INDEX IF NOT EXISTS idx_clan_chat_clan ON clan_chat(clan_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_clan_donations_clan ON clan_donations(clan_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_clan_wars_clans ON clan_wars(challenger_clan_id, defender_clan_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_clan_wars_status ON clan_wars(status)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_friend_activity_user ON friend_activity(user_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_friend_gifts_receiver ON friend_gifts(receiver_id, status)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_party_members_user ON party_members(user_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_audit_log ON admin_audit_log(admin_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_player_reports_status ON player_reports(status, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_player_bans_user ON player_bans(user_id)`);

// ============ PREPARED STATEMENTS ============

export const socialQueries = {
  // Clan levels
  getClanLevel: db.prepare('SELECT * FROM clan_levels WHERE clan_id = ?'),
  upsertClanLevel: db.prepare(`
    INSERT INTO clan_levels (clan_id, level, xp, treasury_coins, treasury_gems, total_donations)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(clan_id) DO UPDATE SET
      level = excluded.level,
      xp = excluded.xp,
      treasury_coins = excluded.treasury_coins,
      treasury_gems = excluded.treasury_gems,
      total_donations = excluded.total_donations
  `),

  // Clan perks
  getClanPerks: db.prepare('SELECT * FROM clan_perks WHERE clan_id = ?'),
  upsertClanPerk: db.prepare(`
    INSERT INTO clan_perks (clan_id, perk_type, perk_level, unlocked_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(clan_id, perk_type) DO UPDATE SET
      perk_level = excluded.perk_level,
      unlocked_at = excluded.unlocked_at
  `),

  // Clan chat
  getClanChat: db.prepare(`
    SELECT cc.*, u.username, u.avatar FROM clan_chat cc
    JOIN users u ON cc.user_id = u.id
    WHERE cc.clan_id = ?
    ORDER BY cc.created_at DESC
    LIMIT ?
  `),
  addClanMessage: db.prepare(`
    INSERT INTO clan_chat (id, clan_id, user_id, message, message_type)
    VALUES (?, ?, ?, ?, ?)
  `),

  // Clan donations
  getClanDonations: db.prepare(`
    SELECT cd.*, u.username FROM clan_donations cd
    JOIN users u ON cd.user_id = u.id
    WHERE cd.clan_id = ?
    ORDER BY cd.created_at DESC
    LIMIT ?
  `),
  addDonation: db.prepare(`
    INSERT INTO clan_donations (id, clan_id, user_id, amount, currency_type)
    VALUES (?, ?, ?, ?, ?)
  `),
  getUserTotalDonations: db.prepare(`
    SELECT SUM(amount) as total FROM clan_donations WHERE clan_id = ? AND user_id = ?
  `),

  // Clan wars
  createWar: db.prepare(`
    INSERT INTO clan_wars (id, challenger_clan_id, defender_clan_id, status)
    VALUES (?, ?, ?, 'pending')
  `),
  getWar: db.prepare('SELECT * FROM clan_wars WHERE id = ?'),
  getClanWars: db.prepare(`
    SELECT * FROM clan_wars
    WHERE (challenger_clan_id = ? OR defender_clan_id = ?)
    ORDER BY created_at DESC
    LIMIT ?
  `),
  updateWarStatus: db.prepare(`
    UPDATE clan_wars SET status = ?, start_time = ?, end_time = ?, winner_clan_id = ?
    WHERE id = ?
  `),
  updateWarScore: db.prepare(`
    UPDATE clan_wars SET challenger_score = ?, defender_score = ?
    WHERE id = ?
  `),

  // War participants
  addWarParticipant: db.prepare(`
    INSERT INTO clan_war_participants (war_id, user_id, clan_id)
    VALUES (?, ?, ?)
  `),
  getWarParticipants: db.prepare(`
    SELECT cwp.*, u.username, u.elo FROM clan_war_participants cwp
    JOIN users u ON cwp.user_id = u.id
    WHERE cwp.war_id = ?
  `),
  updateWarParticipant: db.prepare(`
    UPDATE clan_war_participants SET wins = ?, losses = ?, points = ?
    WHERE war_id = ? AND user_id = ?
  `),

  // Friend activity
  addActivity: db.prepare(`
    INSERT INTO friend_activity (id, user_id, activity_type, activity_data)
    VALUES (?, ?, ?, ?)
  `),
  getFriendActivity: db.prepare(`
    SELECT fa.*, u.username, u.avatar FROM friend_activity fa
    JOIN users u ON fa.user_id = u.id
    WHERE fa.user_id IN (
      SELECT friend_id FROM friends WHERE user_id = ? AND status = 'accepted'
      UNION
      SELECT user_id FROM friends WHERE friend_id = ? AND status = 'accepted'
    )
    ORDER BY fa.created_at DESC
    LIMIT ?
  `),

  // Friend gifts
  sendGift: db.prepare(`
    INSERT INTO friend_gifts (id, sender_id, receiver_id, gift_type, gift_amount, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  getGifts: db.prepare(`
    SELECT fg.*, u.username as sender_name, u.avatar as sender_avatar
    FROM friend_gifts fg
    JOIN users u ON fg.sender_id = u.id
    WHERE fg.receiver_id = ? AND fg.status = 'pending'
    ORDER BY fg.created_at DESC
  `),
  claimGift: db.prepare(`
    UPDATE friend_gifts SET status = 'claimed', claimed_at = strftime('%s', 'now')
    WHERE id = ? AND receiver_id = ?
  `),

  // Parties
  createParty: db.prepare(`
    INSERT INTO parties (id, leader_id, mode, max_size)
    VALUES (?, ?, ?, ?)
  `),
  getParty: db.prepare('SELECT * FROM parties WHERE id = ?'),
  updatePartyStatus: db.prepare('UPDATE parties SET status = ? WHERE id = ?'),
  deleteParty: db.prepare('DELETE FROM parties WHERE id = ?'),
  addPartyMember: db.prepare(`
    INSERT INTO party_members (party_id, user_id)
    VALUES (?, ?)
  `),
  removePartyMember: db.prepare(`
    DELETE FROM party_members WHERE party_id = ? AND user_id = ?
  `),
  getPartyMembers: db.prepare(`
    SELECT pm.*, u.username, u.elo, u.avatar FROM party_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.party_id = ?
  `),
  setPartyMemberReady: db.prepare(`
    UPDATE party_members SET ready = ? WHERE party_id = ? AND user_id = ?
  `),
  getUserParty: db.prepare(`
    SELECT p.* FROM parties p
    JOIN party_members pm ON p.id = pm.party_id
    WHERE pm.user_id = ? AND p.status = 'open'
  `),

  // Spectator
  createSpectatorSession: db.prepare(`
    INSERT INTO spectator_sessions (id, match_id, spectator_id, target_player_id)
    VALUES (?, ?, ?, ?)
  `),
  endSpectatorSession: db.prepare(`
    UPDATE spectator_sessions SET ended_at = strftime('%s', 'now')
    WHERE id = ?
  `),
  getMatchSpectators: db.prepare(`
    SELECT ss.*, u.username FROM spectator_sessions ss
    JOIN users u ON ss.spectator_id = u.id
    WHERE ss.match_id = ? AND ss.ended_at IS NULL
  `),

  // Friendly matches
  createFriendlyMatch: db.prepare(`
    INSERT INTO friendly_matches (id, host_id, mode, map_id, invite_code)
    VALUES (?, ?, ?, ?, ?)
  `),
  getFriendlyMatch: db.prepare('SELECT * FROM friendly_matches WHERE id = ?'),
  getFriendlyMatchByCode: db.prepare('SELECT * FROM friendly_matches WHERE invite_code = ? AND status = ?'),
  updateFriendlyMatchStatus: db.prepare(`
    UPDATE friendly_matches SET status = ?, started_at = ?, ended_at = ?
    WHERE id = ?
  `),

  // Referrals
  createReferralCode: db.prepare(`
    INSERT INTO referral_codes (id, user_id, code)
    VALUES (?, ?, ?)
  `),
  getReferralCode: db.prepare('SELECT * FROM referral_codes WHERE user_id = ?'),
  getReferralByCode: db.prepare('SELECT * FROM referral_codes WHERE code = ?'),
  incrementReferralUses: db.prepare(`
    UPDATE referral_codes SET uses_count = uses_count + 1 WHERE code = ?
  `),
  createReferral: db.prepare(`
    INSERT INTO referrals (id, referrer_id, referred_id, code_used, device_fingerprint, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  getReferral: db.prepare('SELECT * FROM referrals WHERE referred_id = ?'),
  getReferralsByReferrer: db.prepare(`
    SELECT r.*, u.username, u.created_at as user_created_at
    FROM referrals r
    JOIN users u ON r.referred_id = u.id
    WHERE r.referrer_id = ?
    ORDER BY r.created_at DESC
  `),
  qualifyReferral: db.prepare(`
    UPDATE referrals SET status = 'qualified', qualified_at = strftime('%s', 'now')
    WHERE id = ?
  `),
  getQualifiedReferralCount: db.prepare(`
    SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ? AND status = 'qualified'
  `),

  // Referral milestones
  createMilestone: db.prepare(`
    INSERT INTO referral_milestones (id, user_id, milestone_count, reward_type, reward_amount)
    VALUES (?, ?, ?, ?, ?)
  `),
  getMilestones: db.prepare(`
    SELECT * FROM referral_milestones WHERE user_id = ? ORDER BY milestone_count ASC
  `),
  claimMilestone: db.prepare(`
    UPDATE referral_milestones SET claimed = 1, claimed_at = strftime('%s', 'now')
    WHERE id = ? AND user_id = ?
  `),

  // Admin
  getAdminUser: db.prepare('SELECT * FROM admin_users WHERE user_id = ?'),
  createAdminUser: db.prepare(`
    INSERT INTO admin_users (user_id, role, permissions, created_by)
    VALUES (?, ?, ?, ?)
  `),
  updateAdminUser: db.prepare(`
    UPDATE admin_users SET role = ?, permissions = ? WHERE user_id = ?
  `),
  deleteAdminUser: db.prepare('DELETE FROM admin_users WHERE user_id = ?'),
  getAllAdmins: db.prepare(`
    SELECT au.*, u.username, u.email FROM admin_users au
    JOIN users u ON au.user_id = u.id
  `),

  // Audit log
  addAuditLog: db.prepare(`
    INSERT INTO admin_audit_log (id, admin_id, action, target_type, target_id, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getAuditLogs: db.prepare(`
    SELECT aal.*, u.username as admin_name FROM admin_audit_log aal
    JOIN users u ON aal.admin_id = u.id
    ORDER BY aal.created_at DESC
    LIMIT ? OFFSET ?
  `),

  // Reports
  createReport: db.prepare(`
    INSERT INTO player_reports (id, reporter_id, reported_id, reason, description, evidence)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  getReport: db.prepare('SELECT * FROM player_reports WHERE id = ?'),
  getReports: db.prepare(`
    SELECT pr.*,
      reporter.username as reporter_name,
      reported.username as reported_name
    FROM player_reports pr
    JOIN users reporter ON pr.reporter_id = reporter.id
    JOIN users reported ON pr.reported_id = reported.id
    WHERE pr.status = ?
    ORDER BY pr.created_at DESC
    LIMIT ? OFFSET ?
  `),
  assignReport: db.prepare(`
    UPDATE player_reports SET assigned_to = ? WHERE id = ?
  `),
  resolveReport: db.prepare(`
    UPDATE player_reports SET status = 'resolved', resolved_at = strftime('%s', 'now'), resolution = ?
    WHERE id = ?
  `),

  // Bans
  createBan: db.prepare(`
    INSERT INTO player_bans (id, user_id, banned_by, reason, ban_type, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  getActiveBan: db.prepare(`
    SELECT * FROM player_bans
    WHERE user_id = ? AND (expires_at IS NULL OR expires_at > strftime('%s', 'now'))
    ORDER BY created_at DESC
    LIMIT 1
  `),
  getBans: db.prepare(`
    SELECT pb.*, u.username, admin.username as banned_by_name
    FROM player_bans pb
    JOIN users u ON pb.user_id = u.id
    JOIN users admin ON pb.banned_by = admin.id
    ORDER BY pb.created_at DESC
    LIMIT ? OFFSET ?
  `),

  // Chat logs
  addChatLog: db.prepare(`
    INSERT INTO chat_logs (id, user_id, chat_type, chat_id, message)
    VALUES (?, ?, ?, ?, ?)
  `),
  flagChatLog: db.prepare(`
    UPDATE chat_logs SET flagged = 1 WHERE id = ?
  `),
  getFlaggedChats: db.prepare(`
    SELECT cl.*, u.username FROM chat_logs cl
    JOIN users u ON cl.user_id = u.id
    WHERE cl.flagged = 1
    ORDER BY cl.created_at DESC
    LIMIT ? OFFSET ?
  `),

  // Daily metrics
  upsertDailyMetrics: db.prepare(`
    INSERT INTO daily_metrics (date, dau, mau, new_users, matches_played, total_revenue, avg_session_duration, retention_d1, retention_d7, retention_d30, ccu_peak)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      dau = excluded.dau,
      mau = excluded.mau,
      new_users = excluded.new_users,
      matches_played = excluded.matches_played,
      total_revenue = excluded.total_revenue,
      avg_session_duration = excluded.avg_session_duration,
      retention_d1 = excluded.retention_d1,
      retention_d7 = excluded.retention_d7,
      retention_d30 = excluded.retention_d30,
      ccu_peak = excluded.ccu_peak
  `),
  getDailyMetrics: db.prepare(`
    SELECT * FROM daily_metrics WHERE date >= ? AND date <= ?
    ORDER BY date DESC
  `),
  getLatestMetrics: db.prepare(`
    SELECT * FROM daily_metrics ORDER BY date DESC LIMIT 1
  `),
};

console.log('Social features schema loaded');
