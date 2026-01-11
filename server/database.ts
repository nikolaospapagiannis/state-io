import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'server', 'stateio.db');
export const db = new Database(dbPath);

// Initialize database tables immediately
function initTables(): void {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      elo INTEGER DEFAULT 1000,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      draws INTEGER DEFAULT 0,
      clan_id TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      last_login INTEGER,
      avatar TEXT DEFAULT 'default',
      title TEXT DEFAULT 'Newbie',
      FOREIGN KEY (clan_id) REFERENCES clans(id)
    )
  `);

  // Clans table
  db.exec(`
    CREATE TABLE IF NOT EXISTS clans (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      tag TEXT UNIQUE NOT NULL,
      description TEXT,
      leader_id TEXT NOT NULL,
      elo INTEGER DEFAULT 1000,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      icon TEXT DEFAULT '🏰',
      color TEXT DEFAULT '#00f5ff',
      FOREIGN KEY (leader_id) REFERENCES users(id)
    )
  `);

  // Clan members table
  db.exec(`
    CREATE TABLE IF NOT EXISTS clan_members (
      clan_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at INTEGER DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (clan_id, user_id),
      FOREIGN KEY (clan_id) REFERENCES clans(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Match history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      winner_team INTEGER,
      duration INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      map_id INTEGER
    )
  `);

  // Match participants
  db.exec(`
    CREATE TABLE IF NOT EXISTS match_participants (
      match_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      team INTEGER NOT NULL,
      elo_change INTEGER DEFAULT 0,
      territories_captured INTEGER DEFAULT 0,
      troops_sent INTEGER DEFAULT 0,
      PRIMARY KEY (match_id, user_id),
      FOREIGN KEY (match_id) REFERENCES matches(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Friends table
  db.exec(`
    CREATE TABLE IF NOT EXISTS friends (
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (user_id, friend_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (friend_id) REFERENCES users(id)
    )
  `);

  // Create indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_clan ON users(clan_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_clans_elo ON clans(elo DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_matches_created ON matches(created_at DESC)`);

  console.log('Database initialized');
}

// Initialize tables before preparing statements
initTables();

// Export initDatabase for backward compatibility
export function initDatabase(): void {
  // Tables are already initialized, this is kept for API compatibility
  console.log('Database ready');
}

// User queries
export const userQueries = {
  create: db.prepare(`
    INSERT INTO users (id, username, email, password_hash)
    VALUES (?, ?, ?, ?)
  `),

  findByEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),
  findByUsername: db.prepare(`SELECT * FROM users WHERE username = ?`),
  findById: db.prepare(`SELECT * FROM users WHERE id = ?`),

  updateElo: db.prepare(`
    UPDATE users SET elo = ?, wins = wins + ?, losses = losses + ?
    WHERE id = ?
  `),

  updateLastLogin: db.prepare(`UPDATE users SET last_login = ? WHERE id = ?`),

  getTopPlayers: db.prepare(`
    SELECT id, username, elo, wins, losses, avatar, title, clan_id
    FROM users ORDER BY elo DESC LIMIT ?
  `),

  getPlayerRank: db.prepare(`
    SELECT COUNT(*) + 1 as rank FROM users WHERE elo > (SELECT elo FROM users WHERE id = ?)
  `),

  updateClan: db.prepare(`UPDATE users SET clan_id = ? WHERE id = ?`),

  getProfile: db.prepare(`
    SELECT u.id, u.username, u.elo, u.wins, u.losses, u.draws, u.avatar, u.title, u.created_at,
           c.name as clan_name, c.tag as clan_tag
    FROM users u
    LEFT JOIN clans c ON u.clan_id = c.id
    WHERE u.id = ?
  `),
};

// Clan queries
export const clanQueries = {
  create: db.prepare(`
    INSERT INTO clans (id, name, tag, description, leader_id, icon, color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),

  findByName: db.prepare(`SELECT * FROM clans WHERE name = ?`),
  findByTag: db.prepare(`SELECT * FROM clans WHERE tag = ?`),
  findById: db.prepare(`SELECT * FROM clans WHERE id = ?`),

  getMembers: db.prepare(`
    SELECT u.id, u.username, u.elo, u.avatar, cm.role, cm.joined_at
    FROM clan_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.clan_id = ?
    ORDER BY
      CASE cm.role
        WHEN 'leader' THEN 1
        WHEN 'officer' THEN 2
        ELSE 3
      END, u.elo DESC
  `),

  addMember: db.prepare(`
    INSERT INTO clan_members (clan_id, user_id, role) VALUES (?, ?, ?)
  `),

  removeMember: db.prepare(`
    DELETE FROM clan_members WHERE clan_id = ? AND user_id = ?
  `),

  updateMemberRole: db.prepare(`
    UPDATE clan_members SET role = ? WHERE clan_id = ? AND user_id = ?
  `),

  getMemberRole: db.prepare(`
    SELECT role FROM clan_members WHERE clan_id = ? AND user_id = ?
  `),

  getTopClans: db.prepare(`
    SELECT c.*, COUNT(cm.user_id) as member_count
    FROM clans c
    LEFT JOIN clan_members cm ON c.id = cm.clan_id
    GROUP BY c.id
    ORDER BY c.elo DESC
    LIMIT ?
  `),

  delete: db.prepare(`DELETE FROM clans WHERE id = ?`),
  deleteMembers: db.prepare(`DELETE FROM clan_members WHERE clan_id = ?`),

  updateElo: db.prepare(`
    UPDATE clans SET elo = ?, wins = wins + ?, losses = losses + ? WHERE id = ?
  `),
};

// Match queries
export const matchQueries = {
  create: db.prepare(`
    INSERT INTO matches (id, mode, map_id) VALUES (?, ?, ?)
  `),

  finish: db.prepare(`
    UPDATE matches SET winner_team = ?, duration = ? WHERE id = ?
  `),

  addParticipant: db.prepare(`
    INSERT INTO match_participants (match_id, user_id, team) VALUES (?, ?, ?)
  `),

  updateParticipant: db.prepare(`
    UPDATE match_participants
    SET elo_change = ?, territories_captured = ?, troops_sent = ?
    WHERE match_id = ? AND user_id = ?
  `),

  getPlayerMatches: db.prepare(`
    SELECT m.*, mp.team, mp.elo_change, mp.territories_captured
    FROM matches m
    JOIN match_participants mp ON m.id = mp.match_id
    WHERE mp.user_id = ?
    ORDER BY m.created_at DESC
    LIMIT ?
  `),

  getMatchDetails: db.prepare(`
    SELECT m.*, mp.user_id, mp.team, mp.elo_change, mp.territories_captured, mp.troops_sent,
           u.username, u.avatar
    FROM matches m
    JOIN match_participants mp ON m.id = mp.match_id
    JOIN users u ON mp.user_id = u.id
    WHERE m.id = ?
  `),
};

// Friend queries
export const friendQueries = {
  sendRequest: db.prepare(`
    INSERT OR REPLACE INTO friends (user_id, friend_id, status) VALUES (?, ?, 'pending')
  `),

  acceptRequest: db.prepare(`
    UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?
  `),

  getFriends: db.prepare(`
    SELECT u.id, u.username, u.elo, u.avatar, f.status
    FROM friends f
    JOIN users u ON (f.friend_id = u.id OR f.user_id = u.id) AND u.id != ?
    WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
  `),

  getPendingRequests: db.prepare(`
    SELECT u.id, u.username, u.elo, u.avatar
    FROM friends f
    JOIN users u ON f.user_id = u.id
    WHERE f.friend_id = ? AND f.status = 'pending'
  `),

  removeFriend: db.prepare(`
    DELETE FROM friends
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
  `),
};
