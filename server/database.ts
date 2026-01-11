import Database from 'better-sqlite3';
import { join } from 'path';

// Initialize SQLite database
const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'game.db');
export const db = new Database(dbPath);

// Enable foreign keys and WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============ CORE TABLES ============

// Users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    elo INTEGER DEFAULT 1000,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    avatar TEXT DEFAULT 'default',
    title TEXT DEFAULT 'Novice',
    clan_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    last_login INTEGER DEFAULT (strftime('%s', 'now')),
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
    icon TEXT DEFAULT 'default',
    color TEXT DEFAULT '#00f5ff',
    elo INTEGER DEFAULT 1000,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    leader_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    member_count INTEGER DEFAULT 1,
    FOREIGN KEY (leader_id) REFERENCES users(id)
  )
`);

// Clan members (for officer roles)
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

// Matches table
db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    map_id INTEGER,
    winner_team INTEGER,
    duration INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    ended_at INTEGER
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

// ============ CURRENCY & MONETIZATION ============

// Player currencies (gems, coins, crystals)
db.exec(`
  CREATE TABLE IF NOT EXISTS player_currencies (
    user_id TEXT PRIMARY KEY,
    gems INTEGER DEFAULT 100,
    coins INTEGER DEFAULT 1000,
    crystals INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Currency transactions for auditing
db.exec(`
  CREATE TABLE IF NOT EXISTS currency_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    currency_type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    transaction_type TEXT NOT NULL,
    description TEXT,
    reference_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Subscriptions (Plus, Pro, Elite)
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tier TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    price_cents INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    auto_renew INTEGER DEFAULT 1,
    cancelled_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// ============ BATTLE PASS ============

// Battle pass seasons
db.exec(`
  CREATE TABLE IF NOT EXISTS battle_pass_seasons (
    id TEXT PRIMARY KEY,
    season_number INTEGER UNIQUE NOT NULL,
    name TEXT NOT NULL,
    start_date INTEGER NOT NULL,
    end_date INTEGER NOT NULL,
    max_level INTEGER DEFAULT 50,
    xp_per_level INTEGER DEFAULT 1000,
    premium_price INTEGER DEFAULT 599,
    diamond_price INTEGER DEFAULT 1199,
    is_active INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

// Battle pass progress
db.exec(`
  CREATE TABLE IF NOT EXISTS battle_pass_progress (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    season_id TEXT NOT NULL,
    current_level INTEGER DEFAULT 1,
    current_xp INTEGER DEFAULT 0,
    tier TEXT DEFAULT 'free',
    claimed_free_rewards TEXT DEFAULT '[]',
    claimed_premium_rewards TEXT DEFAULT '[]',
    claimed_diamond_rewards TEXT DEFAULT '[]',
    purchased_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(user_id, season_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (season_id) REFERENCES battle_pass_seasons(id)
  )
`);

// Battle pass rewards
db.exec(`
  CREATE TABLE IF NOT EXISTS battle_pass_rewards (
    id TEXT PRIMARY KEY,
    season_id TEXT NOT NULL,
    level INTEGER NOT NULL,
    tier TEXT NOT NULL,
    reward_type TEXT NOT NULL,
    reward_id TEXT,
    reward_amount INTEGER DEFAULT 1,
    FOREIGN KEY (season_id) REFERENCES battle_pass_seasons(id)
  )
`);

// ============ STORE & PURCHASES ============

// Store offers (gem bundles, starter packs, limited-time offers)
db.exec(`
  CREATE TABLE IF NOT EXISTS store_offers (
    id TEXT PRIMARY KEY,
    offer_type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    original_price_cents INTEGER,
    price_cents INTEGER NOT NULL,
    gems INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 0,
    crystals INTEGER DEFAULT 0,
    bonus_gems INTEGER DEFAULT 0,
    items TEXT DEFAULT '[]',
    is_one_time INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    start_date INTEGER,
    end_date INTEGER,
    priority INTEGER DEFAULT 0,
    image_key TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

// Track one-time purchases per user
db.exec(`
  CREATE TABLE IF NOT EXISTS user_purchased_offers (
    user_id TEXT NOT NULL,
    offer_id TEXT NOT NULL,
    purchased_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (user_id, offer_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (offer_id) REFERENCES store_offers(id)
  )
`);

// All purchases (IAP transactions)
db.exec(`
  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_type TEXT NOT NULL,
    product_id TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'USD',
    status TEXT DEFAULT 'pending',
    receipt_data TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Daily deals (personalized per user)
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_deals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    offer_id TEXT NOT NULL,
    deal_date TEXT NOT NULL,
    purchased INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (offer_id) REFERENCES store_offers(id)
  )
`);

// ============ ANALYTICS & TRACKING ============

// Player events - raw event log
db.exec(`
  CREATE TABLE IF NOT EXISTS player_events (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT NOT NULL,
    session_id TEXT,
    timestamp INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (player_id) REFERENCES users(id)
  )
`);

// Player sessions
db.exec(`
  CREATE TABLE IF NOT EXISTS player_sessions (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    device_info TEXT NOT NULL,
    screen_views TEXT DEFAULT '[]',
    event_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (player_id) REFERENCES users(id)
  )
`);

// Player metrics - aggregated daily/weekly stats
db.exec(`
  CREATE TABLE IF NOT EXISTS player_metrics (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    date TEXT NOT NULL,
    sessions_count INTEGER DEFAULT 0,
    total_session_duration INTEGER DEFAULT 0,
    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    matches_lost INTEGER DEFAULT 0,
    territories_captured INTEGER DEFAULT 0,
    troops_sent INTEGER DEFAULT 0,
    purchase_count INTEGER DEFAULT 0,
    purchase_amount REAL DEFAULT 0,
    ad_views INTEGER DEFAULT 0,
    social_interactions INTEGER DEFAULT 0,
    current_win_streak INTEGER DEFAULT 0,
    current_loss_streak INTEGER DEFAULT 0,
    max_win_streak INTEGER DEFAULT 0,
    max_loss_streak INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(player_id, date),
    FOREIGN KEY (player_id) REFERENCES users(id)
  )
`);

// Player segmentation table - handled by initSegmentationTables() in segmentation.ts
// (uses different schema with id + player_id columns)

// ============ ACHIEVEMENTS ============

// Achievements table (static data)
db.exec(`
  CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    points INTEGER NOT NULL,
    hidden INTEGER DEFAULT 0,
    criteria TEXT NOT NULL,
    icon TEXT DEFAULT 'trophy',
    tier INTEGER DEFAULT 1
  )
`);

// Player achievements (progress tracking)
db.exec(`
  CREATE TABLE IF NOT EXISTS player_achievements (
    player_id TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    unlocked_at INTEGER,
    progress INTEGER DEFAULT 0,
    PRIMARY KEY (player_id, achievement_id),
    FOREIGN KEY (player_id) REFERENCES users(id),
    FOREIGN KEY (achievement_id) REFERENCES achievements(id)
  )
`);

// Player stats for achievement tracking
db.exec(`
  CREATE TABLE IF NOT EXISTS player_stats (
    player_id TEXT PRIMARY KEY,
    current_win_streak INTEGER DEFAULT 0,
    max_win_streak INTEGER DEFAULT 0,
    territories_captured INTEGER DEFAULT 0,
    troops_sent INTEGER DEFAULT 0,
    fast_wins INTEGER DEFAULT 0,
    perfect_games INTEGER DEFAULT 0,
    comebacks INTEGER DEFAULT 0,
    team_wins INTEGER DEFAULT 0,
    gifts_sent INTEGER DEFAULT 0,
    daily_streak INTEGER DEFAULT 0,
    max_daily_streak INTEGER DEFAULT 0,
    last_daily_completion INTEGER,
    clans_created INTEGER DEFAULT 0,
    mode_wins_1v1 INTEGER DEFAULT 0,
    mode_wins_2v2 INTEGER DEFAULT 0,
    mode_wins_5v5 INTEGER DEFAULT 0,
    max_territories_held INTEGER DEFAULT 0,
    max_troops_on_field INTEGER DEFAULT 0,
    account_level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    FOREIGN KEY (player_id) REFERENCES users(id)
  )
`);

// ============ COLLECTIONS ============

// Items table
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    rarity TEXT NOT NULL,
    preview_url TEXT,
    unlock_method TEXT NOT NULL,
    price INTEGER,
    premium_price INTEGER,
    achievement_id TEXT,
    season_id INTEGER,
    rank_required TEXT,
    set_id TEXT
  )
`);

// Player items
db.exec(`
  CREATE TABLE IF NOT EXISTS player_items (
    player_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    obtained_at INTEGER DEFAULT (strftime('%s', 'now')),
    equipped INTEGER DEFAULT 0,
    PRIMARY KEY (player_id, item_id),
    FOREIGN KEY (player_id) REFERENCES users(id),
    FOREIGN KEY (item_id) REFERENCES items(id)
  )
`);

// Collection sets
db.exec(`
  CREATE TABLE IF NOT EXISTS collection_sets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    items TEXT NOT NULL,
    bonus TEXT NOT NULL,
    rarity TEXT NOT NULL
  )
`);

// Player equipped items
db.exec(`
  CREATE TABLE IF NOT EXISTS player_equipped (
    player_id TEXT PRIMARY KEY,
    skin TEXT,
    territory_theme TEXT,
    troop_skin TEXT,
    victory_animation TEXT,
    avatar TEXT,
    frame TEXT,
    title TEXT,
    emote1 TEXT,
    emote2 TEXT,
    emote3 TEXT,
    FOREIGN KEY (player_id) REFERENCES users(id)
  )
`);

// ============ RANKINGS ============

// Player rankings
db.exec(`
  CREATE TABLE IF NOT EXISTS player_rankings (
    player_id TEXT PRIMARY KEY,
    division TEXT DEFAULT 'bronze',
    subdivision TEXT DEFAULT 'V',
    lp INTEGER DEFAULT 0,
    peak_division TEXT DEFAULT 'bronze',
    peak_subdivision TEXT DEFAULT 'V',
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    last_game INTEGER,
    promotion_series TEXT,
    placement_games INTEGER DEFAULT 0,
    placement_wins INTEGER DEFAULT 0,
    season_id INTEGER DEFAULT 1,
    FOREIGN KEY (player_id) REFERENCES users(id)
  )
`);

// Rank history for end-of-season tracking
db.exec(`
  CREATE TABLE IF NOT EXISTS rank_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT NOT NULL,
    season_id INTEGER NOT NULL,
    final_division TEXT NOT NULL,
    final_subdivision TEXT NOT NULL,
    final_lp INTEGER NOT NULL,
    peak_division TEXT NOT NULL,
    peak_subdivision TEXT NOT NULL,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    rewards_claimed INTEGER DEFAULT 0,
    recorded_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(player_id, season_id),
    FOREIGN KEY (player_id) REFERENCES users(id)
  )
`);

// ============ SEASONS ============

// Seasons table
db.exec(`
  CREATE TABLE IF NOT EXISTS seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    theme TEXT DEFAULT 'default',
    start_date INTEGER NOT NULL,
    end_date INTEGER NOT NULL,
    config TEXT NOT NULL,
    status TEXT DEFAULT 'upcoming',
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

// Season rewards by rank
db.exec(`
  CREATE TABLE IF NOT EXISTS season_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL,
    division TEXT NOT NULL,
    rewards TEXT NOT NULL,
    FOREIGN KEY (season_id) REFERENCES seasons(id)
  )
`);

// Player season progress
db.exec(`
  CREATE TABLE IF NOT EXISTS player_season_progress (
    player_id TEXT NOT NULL,
    season_id INTEGER NOT NULL,
    pass_level INTEGER DEFAULT 1,
    pass_xp INTEGER DEFAULT 0,
    has_premium INTEGER DEFAULT 0,
    claimed_free_rewards TEXT DEFAULT '[]',
    claimed_premium_rewards TEXT DEFAULT '[]',
    total_xp_earned INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    PRIMARY KEY (player_id, season_id),
    FOREIGN KEY (player_id) REFERENCES users(id),
    FOREIGN KEY (season_id) REFERENCES seasons(id)
  )
`);

// ============ QUESTS ============

// Quest templates
db.exec(`
  CREATE TABLE IF NOT EXISTS quest_templates (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    criteria TEXT NOT NULL,
    rewards TEXT NOT NULL,
    difficulty TEXT DEFAULT 'easy',
    weight INTEGER DEFAULT 10
  )
`);

// Player quests
db.exec(`
  CREATE TABLE IF NOT EXISTS player_quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT NOT NULL,
    quest_id TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    completed_at INTEGER,
    expires_at INTEGER NOT NULL,
    claimed INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (player_id) REFERENCES users(id),
    FOREIGN KEY (quest_id) REFERENCES quest_templates(id)
  )
`);

// Quest streaks - handled by initQuestTables() in quests.ts (needs extra columns)

// ============ NOTIFICATIONS ============
// Note: notification tables are handled by initNotificationTables() in notifications.ts

// ============ FOMO & LIVE OPS ============

// Limited time offers
db.exec(`
  CREATE TABLE IF NOT EXISTS limited_offers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    offer_type TEXT NOT NULL,
    items TEXT NOT NULL,
    original_price INTEGER,
    discount_price INTEGER NOT NULL,
    currency TEXT DEFAULT 'gems',
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    max_purchases INTEGER,
    target_segments TEXT DEFAULT '[]',
    is_active INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

// Player offer purchases
db.exec(`
  CREATE TABLE IF NOT EXISTS player_offer_purchases (
    player_id TEXT NOT NULL,
    offer_id TEXT NOT NULL,
    purchased_at INTEGER DEFAULT (strftime('%s', 'now')),
    price_paid INTEGER NOT NULL,
    PRIMARY KEY (player_id, offer_id),
    FOREIGN KEY (player_id) REFERENCES users(id),
    FOREIGN KEY (offer_id) REFERENCES limited_offers(id)
  )
`);

// Events (special game modes, tournaments)
db.exec(`
  CREATE TABLE IF NOT EXISTS live_events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    event_type TEXT NOT NULL,
    config TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    rewards TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

// Player event participation
db.exec(`
  CREATE TABLE IF NOT EXISTS player_event_participation (
    player_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    rewards_claimed TEXT DEFAULT '[]',
    joined_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (player_id, event_id),
    FOREIGN KEY (player_id) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES live_events(id)
  )
`);

// ============ DDA (DYNAMIC DIFFICULTY ADJUSTMENT) ============

// Player DDA profiles
db.exec(`
  CREATE TABLE IF NOT EXISTS player_dda_profiles (
    player_id TEXT PRIMARY KEY,
    skill_rating REAL DEFAULT 1000,
    frustration_index REAL DEFAULT 0,
    engagement_score REAL DEFAULT 50,
    optimal_win_rate REAL DEFAULT 0.5,
    recent_outcomes TEXT DEFAULT '[]',
    matchmaking_bias REAL DEFAULT 0,
    last_updated INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (player_id) REFERENCES users(id)
  )
`);

// ============ INDEXES FOR PERFORMANCE ============

db.exec(`CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_users_clan ON users(clan_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_clans_elo ON clans(elo DESC)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_matches_created ON matches(created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_match_participants_user ON match_participants(user_id)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id, status)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id, status)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_currency_transactions_user ON currency_transactions(user_id, created_at DESC)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, status)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_player_events_player ON player_events(player_id, timestamp DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_player_events_type ON player_events(event_type, timestamp DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_player_events_session ON player_events(session_id)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_player_sessions_player ON player_sessions(player_id, start_time DESC)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_player_metrics_player_date ON player_metrics(player_id, date DESC)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_player_achievements ON player_achievements(player_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_achievements_category ON achievements(category)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_items_type ON items(type)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_items_rarity ON items(rarity)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_player_items ON player_items(player_id)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_rankings_division ON player_rankings(division, subdivision, lp DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_rank_history_season ON rank_history(season_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_rank_history_player ON rank_history(player_id)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_player_quests ON player_quests(player_id, expires_at)`);

// Note: notification indexes are created by initNotificationTables()

db.exec(`CREATE INDEX IF NOT EXISTS idx_limited_offers_active ON limited_offers(is_active, end_time)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_live_events_active ON live_events(is_active, end_time)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_store_offers_active ON store_offers(is_active, offer_type)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_store_offers_dates ON store_offers(start_date, end_date)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_daily_deals_user_date ON daily_deals(user_id, deal_date)`);

// ============ PREPARED STATEMENTS FOR CORE QUERIES ============

export const userQueries = {
  // Lookup queries
  findById: db.prepare('SELECT * FROM users WHERE id = ?'),
  findByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  findByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),

  // Create/Update
  create: db.prepare(`
    INSERT INTO users (id, username, email, password)
    VALUES (?, ?, ?, ?)
  `),
  updateStats: db.prepare(`
    UPDATE users SET elo = ?, wins = ?, losses = ?, draws = ? WHERE id = ?
  `),
  updateElo: db.prepare(`
    UPDATE users SET elo = ?, wins = wins + ?, losses = losses + ? WHERE id = ?
  `),
  updateLastLogin: db.prepare(`
    UPDATE users SET last_login = ? WHERE id = ?
  `),
  updateClan: db.prepare(`UPDATE users SET clan_id = ? WHERE id = ?`),
  updateAvatar: db.prepare(`UPDATE users SET avatar = ? WHERE id = ?`),
  updateTitle: db.prepare(`UPDATE users SET title = ? WHERE id = ?`),

  // Leaderboard
  getTopPlayers: db.prepare(`
    SELECT * FROM users ORDER BY elo DESC LIMIT ?
  `),
  getPlayerRank: db.prepare(`
    SELECT (SELECT COUNT(*) + 1 FROM users WHERE elo > u.elo) as rank
    FROM users u WHERE u.id = ?
  `),
  getProfile: db.prepare(`
    SELECT u.*, c.name as clan_name, c.tag as clan_tag
    FROM users u
    LEFT JOIN clans c ON u.clan_id = c.id
    WHERE u.id = ?
  `),
};

export const clanQueries = {
  // Lookup queries
  findById: db.prepare('SELECT * FROM clans WHERE id = ?'),
  findByName: db.prepare('SELECT * FROM clans WHERE name = ?'),
  findByTag: db.prepare('SELECT * FROM clans WHERE tag = ?'),

  // Create/Update/Delete
  create: db.prepare(`
    INSERT INTO clans (id, name, tag, description, icon, color, leader_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  delete: db.prepare('DELETE FROM clans WHERE id = ?'),
  updateStats: db.prepare(`
    UPDATE clans SET elo = ?, wins = ?, losses = ?, member_count = ? WHERE id = ?
  `),

  // Leaderboard
  getTopClans: db.prepare(`
    SELECT * FROM clans ORDER BY elo DESC LIMIT ?
  `),

  // Member management
  getMembers: db.prepare(`
    SELECT u.id, u.username, u.elo, u.avatar, cm.role, cm.joined_at
    FROM users u
    JOIN clan_members cm ON u.id = cm.user_id
    WHERE cm.clan_id = ?
    ORDER BY cm.role DESC, u.elo DESC
  `),
  addMember: db.prepare(`
    INSERT INTO clan_members (clan_id, user_id, role) VALUES (?, ?, ?)
  `),
  removeMember: db.prepare(`
    DELETE FROM clan_members WHERE clan_id = ? AND user_id = ?
  `),
  deleteMembers: db.prepare(`
    DELETE FROM clan_members WHERE clan_id = ?
  `),
  getMemberRole: db.prepare(`
    SELECT role FROM clan_members WHERE clan_id = ? AND user_id = ?
  `),
  updateMemberRole: db.prepare(`
    UPDATE clan_members SET role = ? WHERE clan_id = ? AND user_id = ?
  `),
  incrementMemberCount: db.prepare(`
    UPDATE clans SET member_count = member_count + 1 WHERE id = ?
  `),
  decrementMemberCount: db.prepare(`
    UPDATE clans SET member_count = member_count - 1 WHERE id = ?
  `),
};

export const matchQueries = {
  create: db.prepare(`
    INSERT INTO matches (id, mode, map_id)
    VALUES (?, ?, ?)
  `),
  end: db.prepare(`
    UPDATE matches SET winner_team = ?, duration = ?, ended_at = strftime('%s', 'now')
    WHERE id = ?
  `),
  addParticipant: db.prepare(`
    INSERT INTO match_participants (match_id, user_id, team)
    VALUES (?, ?, ?)
  `),
  updateParticipant: db.prepare(`
    UPDATE match_participants
    SET elo_change = ?, territories_captured = ?, troops_sent = ?
    WHERE match_id = ? AND user_id = ?
  `),
  getPlayerMatches: db.prepare(`
    SELECT m.*, mp.team, mp.elo_change
    FROM matches m
    JOIN match_participants mp ON m.id = mp.match_id
    WHERE mp.user_id = ?
    ORDER BY m.created_at DESC
    LIMIT ?
  `),
  getMatchDetails: db.prepare(`
    SELECT m.*, mp.*, u.username, u.avatar
    FROM matches m
    JOIN match_participants mp ON m.id = mp.match_id
    JOIN users u ON mp.user_id = u.id
    WHERE m.id = ?
  `),
};

// ============ DDA & ECONOMY TABLES ============

db.exec(`
  CREATE TABLE IF NOT EXISTS player_skill (
    player_id TEXT PRIMARY KEY,
    skill_rating REAL DEFAULT 1000,
    skill_uncertainty REAL DEFAULT 350,
    matches_played INTEGER DEFAULT 0,
    last_updated INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (player_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS match_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT NOT NULL,
    match_id TEXT,
    performance_score REAL,
    territories_captured INTEGER DEFAULT 0,
    territories_lost INTEGER DEFAULT 0,
    troops_sent INTEGER DEFAULT 0,
    match_duration INTEGER,
    is_winner INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (player_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS player_difficulty (
    player_id TEXT PRIMARY KEY,
    base_difficulty REAL DEFAULT 0.5,
    current_difficulty REAL DEFAULT 0.5,
    win_streak INTEGER DEFAULT 0,
    loss_streak INTEGER DEFAULT 0,
    frustration_index REAL DEFAULT 0,
    engagement_score REAL DEFAULT 0.5,
    last_updated INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (player_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS player_economy (
    player_id TEXT PRIMARY KEY,
    spend_tier TEXT DEFAULT 'free',
    total_spent REAL DEFAULT 0,
    last_purchase INTEGER,
    purchase_count INTEGER DEFAULT 0,
    avg_purchase_value REAL DEFAULT 0,
    price_sensitivity REAL DEFAULT 0.5,
    bundle_affinity REAL DEFAULT 0.5,
    preferred_currency TEXT DEFAULT 'gems',
    FOREIGN KEY (player_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS dda_sessions (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    events TEXT DEFAULT '[]',
    metrics TEXT DEFAULT '{}',
    FOREIGN KEY (player_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS engagement_metrics (
    player_id TEXT PRIMARY KEY,
    avg_session_duration REAL DEFAULT 0,
    sessions_per_week REAL DEFAULT 0,
    days_since_last_login INTEGER DEFAULT 0,
    retention_score REAL DEFAULT 50,
    monetization_score REAL DEFAULT 0,
    social_score REAL DEFAULT 0,
    skill_progress REAL DEFAULT 0,
    content_completion REAL DEFAULT 0,
    churn_probability REAL DEFAULT 0,
    lifetime_value REAL DEFAULT 0,
    last_updated INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (player_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS player_personalization (
    player_id TEXT PRIMARY KEY,
    play_style TEXT DEFAULT 'balanced',
    preferred_difficulty TEXT DEFAULT 'medium',
    session_length TEXT DEFAULT 'medium',
    peak_hours TEXT DEFAULT '[]',
    favorite_modes TEXT DEFAULT '[]',
    ui_preferences TEXT DEFAULT '{}',
    notification_preferences TEXT DEFAULT '{}',
    last_updated INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (player_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS liveops_events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    status TEXT DEFAULT 'scheduled',
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS liveops_parameters (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_dda_sessions_player ON dda_sessions(player_id, start_time DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_match_performance_player ON match_performance(player_id, created_at DESC)`);

// ============ DDA QUERIES ============

export const ddaQueries = {
  // Player skill
  getPlayerSkill: db.prepare('SELECT * FROM player_skill WHERE player_id = ?'),
  upsertPlayerSkill: db.prepare(`
    INSERT INTO player_skill (player_id, skill_rating, skill_uncertainty, matches_played, last_updated)
    VALUES (?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(player_id) DO UPDATE SET
      skill_rating = excluded.skill_rating,
      skill_uncertainty = excluded.skill_uncertainty,
      matches_played = excluded.matches_played,
      last_updated = strftime('%s', 'now')
  `),

  // Player difficulty
  getPlayerDifficulty: db.prepare('SELECT * FROM player_difficulty WHERE player_id = ?'),
  upsertPlayerDifficulty: db.prepare(`
    INSERT INTO player_difficulty (player_id, base_difficulty, current_difficulty, win_streak, loss_streak, frustration_index, engagement_score, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(player_id) DO UPDATE SET
      base_difficulty = excluded.base_difficulty,
      current_difficulty = excluded.current_difficulty,
      win_streak = excluded.win_streak,
      loss_streak = excluded.loss_streak,
      frustration_index = excluded.frustration_index,
      engagement_score = excluded.engagement_score,
      last_updated = strftime('%s', 'now')
  `),

  // Match performance
  addMatchPerformance: db.prepare(`
    INSERT INTO match_performance (player_id, match_id, performance_score, territories_captured, territories_lost, troops_sent, match_duration, is_winner)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getPlayerPerformance: db.prepare(`
    SELECT * FROM match_performance WHERE player_id = ? ORDER BY created_at DESC LIMIT ?
  `),

  // Player economy
  getPlayerEconomy: db.prepare('SELECT * FROM player_economy WHERE player_id = ?'),
  upsertPlayerEconomy: db.prepare(`
    INSERT INTO player_economy (player_id, spend_tier, total_spent, last_purchase, purchase_count, avg_purchase_value, price_sensitivity, bundle_affinity, preferred_currency)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      spend_tier = excluded.spend_tier,
      total_spent = excluded.total_spent,
      last_purchase = excluded.last_purchase,
      purchase_count = excluded.purchase_count,
      avg_purchase_value = excluded.avg_purchase_value,
      price_sensitivity = excluded.price_sensitivity,
      bundle_affinity = excluded.bundle_affinity,
      preferred_currency = excluded.preferred_currency
  `),

  // DDA Sessions
  createSession: db.prepare(`
    INSERT INTO dda_sessions (id, player_id, start_time)
    VALUES (?, ?, ?)
  `),
  updateSession: db.prepare(`
    UPDATE dda_sessions SET end_time = ?, events = ?, metrics = ? WHERE id = ?
  `),
  getPlayerSessions: db.prepare(`
    SELECT * FROM dda_sessions WHERE player_id = ? ORDER BY start_time DESC LIMIT ?
  `),

  // Engagement metrics
  getEngagementMetrics: db.prepare('SELECT * FROM engagement_metrics WHERE player_id = ?'),
  upsertEngagementMetrics: db.prepare(`
    INSERT INTO engagement_metrics (player_id, avg_session_duration, sessions_per_week, days_since_last_login, retention_score, monetization_score, social_score, skill_progress, content_completion, churn_probability, lifetime_value, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(player_id) DO UPDATE SET
      avg_session_duration = excluded.avg_session_duration,
      sessions_per_week = excluded.sessions_per_week,
      days_since_last_login = excluded.days_since_last_login,
      retention_score = excluded.retention_score,
      monetization_score = excluded.monetization_score,
      social_score = excluded.social_score,
      skill_progress = excluded.skill_progress,
      content_completion = excluded.content_completion,
      churn_probability = excluded.churn_probability,
      lifetime_value = excluded.lifetime_value,
      last_updated = strftime('%s', 'now')
  `),

  // Player personalization
  getPlayerPersonalization: db.prepare('SELECT * FROM player_personalization WHERE player_id = ?'),
  upsertPlayerPersonalization: db.prepare(`
    INSERT INTO player_personalization (player_id, play_style, preferred_difficulty, session_length, peak_hours, favorite_modes, ui_preferences, notification_preferences, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(player_id) DO UPDATE SET
      play_style = excluded.play_style,
      preferred_difficulty = excluded.preferred_difficulty,
      session_length = excluded.session_length,
      peak_hours = excluded.peak_hours,
      favorite_modes = excluded.favorite_modes,
      ui_preferences = excluded.ui_preferences,
      notification_preferences = excluded.notification_preferences,
      last_updated = strftime('%s', 'now')
  `),

  // LiveOps events
  createEvent: db.prepare(`
    INSERT INTO liveops_events (id, name, type, config, start_time, end_time, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getEventById: db.prepare('SELECT * FROM liveops_events WHERE id = ?'),
  updateEvent: db.prepare(`
    UPDATE liveops_events SET name = ?, type = ?, config = ?, start_time = ?, end_time = ?, status = ?
    WHERE id = ?
  `),
  deleteEvent: db.prepare('DELETE FROM liveops_events WHERE id = ?'),
  getActiveEvents: db.prepare(`
    SELECT * FROM liveops_events WHERE start_time <= ? AND end_time >= ? AND status = 'active'
  `),
  getAllEvents: db.prepare(`
    SELECT * FROM liveops_events ORDER BY start_time DESC LIMIT ?
  `),

  // LiveOps parameters
  getParameter: db.prepare('SELECT * FROM liveops_parameters WHERE key = ?'),
  setParameter: db.prepare(`
    INSERT INTO liveops_parameters (key, value, description, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      description = excluded.description,
      updated_at = excluded.updated_at
  `),
  getAllParameters: db.prepare('SELECT * FROM liveops_parameters'),
};

// ============ INITIALIZATION FUNCTION ============

export function initDatabase(): void {
  console.log('Database initialized with all tables');
}

console.log('Database schema loaded');
