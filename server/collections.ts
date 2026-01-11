import { Router, Response } from 'express';
import { db } from './database';
import { AuthRequest } from './auth';

const router = Router();

// ============ TYPES ============

export type ItemType = 'skin' | 'territory_theme' | 'troop_skin' | 'victory_animation' | 'avatar' | 'frame' | 'title' | 'emote';
export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type UnlockMethod = 'shop' | 'achievement' | 'season' | 'event' | 'rank' | 'starter' | 'chest';

export interface CollectionItem {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  rarity: ItemRarity;
  previewUrl: string;
  unlockMethod: UnlockMethod;
  price?: number; // In gold
  premiumPrice?: number; // In gems
  achievementId?: string;
  seasonId?: number;
  rankRequired?: string;
  setId?: string;
}

export interface PlayerItem {
  playerId: string;
  itemId: string;
  obtainedAt: number;
  equipped: boolean;
}

export interface CollectionSet {
  id: string;
  name: string;
  description: string;
  items: string[]; // Item IDs
  bonus: SetBonus;
  rarity: ItemRarity;
}

export interface SetBonus {
  type: string;
  value: number;
  description: string;
}

export interface EquippedItems {
  skin: string | null;
  territoryTheme: string | null;
  troopSkin: string | null;
  victoryAnimation: string | null;
  avatar: string | null;
  frame: string | null;
  title: string | null;
  emote1: string | null;
  emote2: string | null;
  emote3: string | null;
}

// ============ ITEM DEFINITIONS ============

export const COLLECTION_ITEMS: CollectionItem[] = [
  // ============ STARTER ITEMS ============
  {
    id: 'skin_default',
    type: 'skin',
    name: 'Classic',
    description: 'The original territory skin',
    rarity: 'common',
    previewUrl: '/assets/skins/default.png',
    unlockMethod: 'starter',
  },
  {
    id: 'troop_default',
    type: 'troop_skin',
    name: 'Standard Troops',
    description: 'Standard military units',
    rarity: 'common',
    previewUrl: '/assets/troops/default.png',
    unlockMethod: 'starter',
  },
  {
    id: 'avatar_default',
    type: 'avatar',
    name: 'Recruit',
    description: 'Every commander starts somewhere',
    rarity: 'common',
    previewUrl: '/assets/avatars/default.png',
    unlockMethod: 'starter',
  },
  {
    id: 'frame_default',
    type: 'frame',
    name: 'Basic Frame',
    description: 'A simple profile frame',
    rarity: 'common',
    previewUrl: '/assets/frames/default.png',
    unlockMethod: 'starter',
  },
  {
    id: 'title_newbie',
    type: 'title',
    name: 'Newbie',
    description: 'Just starting out',
    rarity: 'common',
    previewUrl: '',
    unlockMethod: 'starter',
  },

  // ============ COMMON SHOP ITEMS ============
  {
    id: 'skin_ocean',
    type: 'skin',
    name: 'Ocean Blue',
    description: 'Deep blue territory colors',
    rarity: 'common',
    previewUrl: '/assets/skins/ocean.png',
    unlockMethod: 'shop',
    price: 500,
  },
  {
    id: 'skin_forest',
    type: 'skin',
    name: 'Forest Green',
    description: 'Natural forest colors',
    rarity: 'common',
    previewUrl: '/assets/skins/forest.png',
    unlockMethod: 'shop',
    price: 500,
  },
  {
    id: 'skin_sunset',
    type: 'skin',
    name: 'Sunset Orange',
    description: 'Warm sunset hues',
    rarity: 'common',
    previewUrl: '/assets/skins/sunset.png',
    unlockMethod: 'shop',
    price: 500,
  },
  {
    id: 'territory_basic_glow',
    type: 'territory_theme',
    name: 'Basic Glow',
    description: 'Subtle glowing edges',
    rarity: 'common',
    previewUrl: '/assets/themes/glow.png',
    unlockMethod: 'shop',
    price: 750,
  },
  {
    id: 'troop_soldiers',
    type: 'troop_skin',
    name: 'Soldiers',
    description: 'Infantry soldiers',
    rarity: 'common',
    previewUrl: '/assets/troops/soldiers.png',
    unlockMethod: 'shop',
    price: 600,
  },

  // ============ RARE ITEMS ============
  {
    id: 'skin_neon_cyan',
    type: 'skin',
    name: 'Neon Cyan',
    description: 'Electric neon colors',
    rarity: 'rare',
    previewUrl: '/assets/skins/neon_cyan.png',
    unlockMethod: 'shop',
    price: 1500,
    setId: 'set_neon',
  },
  {
    id: 'skin_neon_pink',
    type: 'skin',
    name: 'Neon Pink',
    description: 'Hot pink neon glow',
    rarity: 'rare',
    previewUrl: '/assets/skins/neon_pink.png',
    unlockMethod: 'shop',
    price: 1500,
    setId: 'set_neon',
  },
  {
    id: 'territory_neon_pulse',
    type: 'territory_theme',
    name: 'Neon Pulse',
    description: 'Pulsating neon borders',
    rarity: 'rare',
    previewUrl: '/assets/themes/neon_pulse.png',
    unlockMethod: 'shop',
    price: 2000,
    setId: 'set_neon',
  },
  {
    id: 'troop_robots',
    type: 'troop_skin',
    name: 'Battle Robots',
    description: 'Mechanical warriors',
    rarity: 'rare',
    previewUrl: '/assets/troops/robots.png',
    unlockMethod: 'shop',
    price: 1800,
  },
  {
    id: 'victory_confetti',
    type: 'victory_animation',
    name: 'Confetti Burst',
    description: 'Celebration confetti',
    rarity: 'rare',
    previewUrl: '/assets/victory/confetti.png',
    unlockMethod: 'shop',
    price: 2500,
  },
  {
    id: 'avatar_warrior',
    type: 'avatar',
    name: 'Warrior',
    description: 'Battle-hardened warrior',
    rarity: 'rare',
    previewUrl: '/assets/avatars/warrior.png',
    unlockMethod: 'shop',
    price: 1200,
  },
  {
    id: 'frame_gold',
    type: 'frame',
    name: 'Golden Frame',
    description: 'Elegant gold border',
    rarity: 'rare',
    previewUrl: '/assets/frames/gold.png',
    unlockMethod: 'shop',
    price: 1500,
  },
  {
    id: 'emote_gg',
    type: 'emote',
    name: 'GG',
    description: 'Good game!',
    rarity: 'rare',
    previewUrl: '/assets/emotes/gg.png',
    unlockMethod: 'shop',
    price: 800,
  },
  {
    id: 'emote_wave',
    type: 'emote',
    name: 'Wave',
    description: 'Friendly wave',
    rarity: 'rare',
    previewUrl: '/assets/emotes/wave.png',
    unlockMethod: 'shop',
    price: 800,
  },

  // ============ EPIC ITEMS ============
  {
    id: 'skin_galaxy',
    type: 'skin',
    name: 'Galaxy',
    description: 'Cosmic starfield pattern',
    rarity: 'epic',
    previewUrl: '/assets/skins/galaxy.png',
    unlockMethod: 'shop',
    premiumPrice: 500,
    setId: 'set_cosmic',
  },
  {
    id: 'skin_inferno',
    type: 'skin',
    name: 'Inferno',
    description: 'Burning flames of war',
    rarity: 'epic',
    previewUrl: '/assets/skins/inferno.png',
    unlockMethod: 'shop',
    premiumPrice: 500,
    setId: 'set_elements',
  },
  {
    id: 'skin_frozen',
    type: 'skin',
    name: 'Frozen',
    description: 'Icy cold territories',
    rarity: 'epic',
    previewUrl: '/assets/skins/frozen.png',
    unlockMethod: 'shop',
    premiumPrice: 500,
    setId: 'set_elements',
  },
  {
    id: 'territory_aurora',
    type: 'territory_theme',
    name: 'Aurora Borealis',
    description: 'Northern lights effect',
    rarity: 'epic',
    previewUrl: '/assets/themes/aurora.png',
    unlockMethod: 'shop',
    premiumPrice: 650,
    setId: 'set_cosmic',
  },
  {
    id: 'troop_ninjas',
    type: 'troop_skin',
    name: 'Shadow Ninjas',
    description: 'Silent assassins',
    rarity: 'epic',
    previewUrl: '/assets/troops/ninjas.png',
    unlockMethod: 'shop',
    premiumPrice: 600,
  },
  {
    id: 'troop_dragons',
    type: 'troop_skin',
    name: 'Dragon Riders',
    description: 'Warriors on dragons',
    rarity: 'epic',
    previewUrl: '/assets/troops/dragons.png',
    unlockMethod: 'shop',
    premiumPrice: 750,
  },
  {
    id: 'victory_lightning',
    type: 'victory_animation',
    name: 'Lightning Storm',
    description: 'Epic lightning strikes',
    rarity: 'epic',
    previewUrl: '/assets/victory/lightning.png',
    unlockMethod: 'shop',
    premiumPrice: 700,
  },
  {
    id: 'avatar_commander',
    type: 'avatar',
    name: 'Supreme Commander',
    description: 'Military genius',
    rarity: 'epic',
    previewUrl: '/assets/avatars/commander.png',
    unlockMethod: 'shop',
    premiumPrice: 400,
  },
  {
    id: 'frame_diamond',
    type: 'frame',
    name: 'Diamond Frame',
    description: 'Sparkling diamond border',
    rarity: 'epic',
    previewUrl: '/assets/frames/diamond.png',
    unlockMethod: 'shop',
    premiumPrice: 500,
  },
  {
    id: 'title_conqueror',
    type: 'title',
    name: 'The Conqueror',
    description: 'Master of conquest',
    rarity: 'epic',
    previewUrl: '',
    unlockMethod: 'achievement',
    achievementId: 'total_victories_100',
  },

  // ============ LEGENDARY ITEMS ============
  {
    id: 'skin_void',
    type: 'skin',
    name: 'Void',
    description: 'Dark matter from the void',
    rarity: 'legendary',
    previewUrl: '/assets/skins/void.png',
    unlockMethod: 'shop',
    premiumPrice: 1500,
  },
  {
    id: 'skin_celestial',
    type: 'skin',
    name: 'Celestial',
    description: 'Heavenly divine light',
    rarity: 'legendary',
    previewUrl: '/assets/skins/celestial.png',
    unlockMethod: 'shop',
    premiumPrice: 1500,
    setId: 'set_divine',
  },
  {
    id: 'territory_cosmic_rift',
    type: 'territory_theme',
    name: 'Cosmic Rift',
    description: 'Dimensional tear effects',
    rarity: 'legendary',
    previewUrl: '/assets/themes/cosmic_rift.png',
    unlockMethod: 'shop',
    premiumPrice: 2000,
    setId: 'set_cosmic',
  },
  {
    id: 'troop_angels',
    type: 'troop_skin',
    name: 'Angel Warriors',
    description: 'Divine soldiers',
    rarity: 'legendary',
    previewUrl: '/assets/troops/angels.png',
    unlockMethod: 'shop',
    premiumPrice: 1800,
    setId: 'set_divine',
  },
  {
    id: 'victory_supernova',
    type: 'victory_animation',
    name: 'Supernova',
    description: 'Explosive star burst',
    rarity: 'legendary',
    previewUrl: '/assets/victory/supernova.png',
    unlockMethod: 'shop',
    premiumPrice: 2500,
    setId: 'set_cosmic',
  },
  {
    id: 'avatar_emperor',
    type: 'avatar',
    name: 'Emperor',
    description: 'Ruler of empires',
    rarity: 'legendary',
    previewUrl: '/assets/avatars/emperor.png',
    unlockMethod: 'rank',
    rankRequired: 'grandmaster',
  },
  {
    id: 'frame_legendary',
    type: 'frame',
    name: 'Legendary Frame',
    description: 'Animated legendary border',
    rarity: 'legendary',
    previewUrl: '/assets/frames/legendary.png',
    unlockMethod: 'shop',
    premiumPrice: 1500,
  },
  {
    id: 'title_legend',
    type: 'title',
    name: 'The Legend',
    description: 'A true legend',
    rarity: 'legendary',
    previewUrl: '',
    unlockMethod: 'rank',
    rankRequired: 'legend',
  },

  // ============ MYTHIC ITEMS ============
  {
    id: 'skin_primordial',
    type: 'skin',
    name: 'Primordial',
    description: 'Ancient power of creation',
    rarity: 'mythic',
    previewUrl: '/assets/skins/primordial.png',
    unlockMethod: 'achievement',
    achievementId: 'total_victories_1000',
  },
  {
    id: 'territory_dimension',
    type: 'territory_theme',
    name: 'Dimensional Shift',
    description: 'Reality-warping borders',
    rarity: 'mythic',
    previewUrl: '/assets/themes/dimension.png',
    unlockMethod: 'season',
    seasonId: 1,
  },
  {
    id: 'troop_titans',
    type: 'troop_skin',
    name: 'Titans',
    description: 'Ancient titan warriors',
    rarity: 'mythic',
    previewUrl: '/assets/troops/titans.png',
    unlockMethod: 'achievement',
    achievementId: 'campaign_master',
  },
  {
    id: 'victory_big_bang',
    type: 'victory_animation',
    name: 'Big Bang',
    description: 'Universe-creating explosion',
    rarity: 'mythic',
    previewUrl: '/assets/victory/big_bang.png',
    unlockMethod: 'rank',
    rankRequired: 'mythic',
  },
  {
    id: 'avatar_god',
    type: 'avatar',
    name: 'God of War',
    description: 'Supreme deity of battle',
    rarity: 'mythic',
    previewUrl: '/assets/avatars/god.png',
    unlockMethod: 'rank',
    rankRequired: 'mythic',
  },
  {
    id: 'frame_mythic',
    type: 'frame',
    name: 'Mythic Frame',
    description: 'Reality-bending frame',
    rarity: 'mythic',
    previewUrl: '/assets/frames/mythic.png',
    unlockMethod: 'achievement',
    achievementId: 'all_achievements',
  },
  {
    id: 'title_immortal',
    type: 'title',
    name: 'The Immortal',
    description: 'Beyond mortality',
    rarity: 'mythic',
    previewUrl: '',
    unlockMethod: 'rank',
    rankRequired: 'mythic',
  },
];

// ============ COLLECTION SETS ============

export const COLLECTION_SETS: CollectionSet[] = [
  {
    id: 'set_neon',
    name: 'Neon Collection',
    description: 'Electric neon style',
    items: ['skin_neon_cyan', 'skin_neon_pink', 'territory_neon_pulse'],
    bonus: { type: 'xp_boost', value: 5, description: '+5% XP bonus' },
    rarity: 'rare',
  },
  {
    id: 'set_cosmic',
    name: 'Cosmic Collection',
    description: 'Power of the universe',
    items: ['skin_galaxy', 'territory_aurora', 'territory_cosmic_rift', 'victory_supernova'],
    bonus: { type: 'gold_boost', value: 10, description: '+10% Gold bonus' },
    rarity: 'legendary',
  },
  {
    id: 'set_elements',
    name: 'Elemental Collection',
    description: 'Master the elements',
    items: ['skin_inferno', 'skin_frozen'],
    bonus: { type: 'xp_boost', value: 3, description: '+3% XP bonus' },
    rarity: 'epic',
  },
  {
    id: 'set_divine',
    name: 'Divine Collection',
    description: 'Blessed by the gods',
    items: ['skin_celestial', 'troop_angels'],
    bonus: { type: 'territory_gen', value: 2, description: '+2% Troop generation' },
    rarity: 'legendary',
  },
];

// ============ DATABASE INITIALIZATION ============

export function initCollectionTables(): void {
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

  // Create indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_items_type ON items(type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_items_rarity ON items(rarity)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_player_items ON player_items(player_id)`);

  // Seed items and sets
  seedItems();
  seedSets();

  console.log('Collection tables initialized');
}

function seedItems(): void {
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO items (id, type, name, description, rarity, preview_url, unlock_method, price, premium_price, achievement_id, season_id, rank_required, set_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items: CollectionItem[]) => {
    for (const item of items) {
      insertStmt.run(
        item.id,
        item.type,
        item.name,
        item.description,
        item.rarity,
        item.previewUrl,
        item.unlockMethod,
        item.price || null,
        item.premiumPrice || null,
        item.achievementId || null,
        item.seasonId || null,
        item.rankRequired || null,
        item.setId || null
      );
    }
  });

  insertMany(COLLECTION_ITEMS);
}

function seedSets(): void {
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO collection_sets (id, name, description, items, bonus, rarity)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((sets: CollectionSet[]) => {
    for (const set of sets) {
      insertStmt.run(
        set.id,
        set.name,
        set.description,
        JSON.stringify(set.items),
        JSON.stringify(set.bonus),
        set.rarity
      );
    }
  });

  insertMany(COLLECTION_SETS);
}

// Initialize tables immediately
initCollectionTables();

// ============ QUERIES ============

export const collectionQueries = {
  getAllItems: db.prepare(`SELECT * FROM items`),

  getItemById: db.prepare(`SELECT * FROM items WHERE id = ?`),

  getItemsByType: db.prepare(`SELECT * FROM items WHERE type = ?`),

  getItemsByRarity: db.prepare(`SELECT * FROM items WHERE rarity = ?`),

  getShopItems: db.prepare(`SELECT * FROM items WHERE unlock_method = 'shop'`),

  getPlayerItems: db.prepare(`
    SELECT i.*, pi.obtained_at, pi.equipped
    FROM player_items pi
    JOIN items i ON pi.item_id = i.id
    WHERE pi.player_id = ?
  `),

  getPlayerItemById: db.prepare(`
    SELECT * FROM player_items WHERE player_id = ? AND item_id = ?
  `),

  grantItem: db.prepare(`
    INSERT OR IGNORE INTO player_items (player_id, item_id, obtained_at)
    VALUES (?, ?, ?)
  `),

  getPlayerEquipped: db.prepare(`SELECT * FROM player_equipped WHERE player_id = ?`),

  upsertEquipped: db.prepare(`
    INSERT INTO player_equipped (player_id, skin, territory_theme, troop_skin, victory_animation, avatar, frame, title, emote1, emote2, emote3)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      skin = ?, territory_theme = ?, troop_skin = ?, victory_animation = ?,
      avatar = ?, frame = ?, title = ?, emote1 = ?, emote2 = ?, emote3 = ?
  `),

  getAllSets: db.prepare(`SELECT * FROM collection_sets`),

  getSetById: db.prepare(`SELECT * FROM collection_sets WHERE id = ?`),

  countPlayerItemsByRarity: db.prepare(`
    SELECT i.rarity, COUNT(*) as count
    FROM player_items pi
    JOIN items i ON pi.item_id = i.id
    WHERE pi.player_id = ?
    GROUP BY i.rarity
  `),
};

// ============ COLLECTION FUNCTIONS ============

export function grantStarterItems(playerId: string): void {
  const now = Math.floor(Date.now() / 1000);
  const starterItems = COLLECTION_ITEMS.filter(i => i.unlockMethod === 'starter');

  for (const item of starterItems) {
    collectionQueries.grantItem.run(playerId, item.id, now);
  }

  // Set default equipped
  collectionQueries.upsertEquipped.run(
    playerId,
    'skin_default', null, 'troop_default', null, 'avatar_default', 'frame_default', 'title_newbie', null, null, null,
    'skin_default', null, 'troop_default', null, 'avatar_default', 'frame_default', 'title_newbie', null, null, null
  );
}

export function grantItem(playerId: string, itemId: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const result = collectionQueries.grantItem.run(playerId, itemId, now);
  return result.changes > 0;
}

export function purchaseItem(playerId: string, itemId: string, currency: 'gold' | 'gems'): {
  success: boolean;
  error?: string;
} {
  const item = collectionQueries.getItemById.get(itemId) as {
    id: string;
    price: number | null;
    premium_price: number | null;
    unlock_method: string;
  } | undefined;

  if (!item) {
    return { success: false, error: 'Item not found' };
  }

  if (item.unlock_method !== 'shop') {
    return { success: false, error: 'Item cannot be purchased' };
  }

  // Check if already owned
  const owned = collectionQueries.getPlayerItemById.get(playerId, itemId);
  if (owned) {
    return { success: false, error: 'Item already owned' };
  }

  // Check price
  const price = currency === 'gold' ? item.price : item.premium_price;
  if (!price) {
    return { success: false, error: `Item cannot be purchased with ${currency}` };
  }

  // In a real implementation, deduct currency here
  // For now, just grant the item
  grantItem(playerId, itemId);

  return { success: true };
}

export function equipItem(playerId: string, itemId: string, slot?: string): {
  success: boolean;
  error?: string;
} {
  // Check if player owns the item
  const owned = collectionQueries.getPlayerItemById.get(playerId, itemId);
  if (!owned) {
    return { success: false, error: 'Item not owned' };
  }

  // Get item details
  const item = collectionQueries.getItemById.get(itemId) as {
    id: string;
    type: ItemType;
  } | undefined;

  if (!item) {
    return { success: false, error: 'Item not found' };
  }

  // Get current equipped
  let equipped = collectionQueries.getPlayerEquipped.get(playerId) as {
    skin: string | null;
    territory_theme: string | null;
    troop_skin: string | null;
    victory_animation: string | null;
    avatar: string | null;
    frame: string | null;
    title: string | null;
    emote1: string | null;
    emote2: string | null;
    emote3: string | null;
  } | undefined;

  if (!equipped) {
    equipped = {
      skin: null, territory_theme: null, troop_skin: null, victory_animation: null,
      avatar: null, frame: null, title: null, emote1: null, emote2: null, emote3: null,
    };
  }

  // Update the appropriate slot
  switch (item.type) {
    case 'skin':
      equipped.skin = itemId;
      break;
    case 'territory_theme':
      equipped.territory_theme = itemId;
      break;
    case 'troop_skin':
      equipped.troop_skin = itemId;
      break;
    case 'victory_animation':
      equipped.victory_animation = itemId;
      break;
    case 'avatar':
      equipped.avatar = itemId;
      break;
    case 'frame':
      equipped.frame = itemId;
      break;
    case 'title':
      equipped.title = itemId;
      break;
    case 'emote':
      // Emotes go to a specific slot
      if (slot === 'emote1') equipped.emote1 = itemId;
      else if (slot === 'emote2') equipped.emote2 = itemId;
      else if (slot === 'emote3') equipped.emote3 = itemId;
      else equipped.emote1 = itemId; // Default to slot 1
      break;
    default:
      return { success: false, error: 'Unknown item type' };
  }

  // Save
  collectionQueries.upsertEquipped.run(
    playerId,
    equipped.skin, equipped.territory_theme, equipped.troop_skin, equipped.victory_animation,
    equipped.avatar, equipped.frame, equipped.title, equipped.emote1, equipped.emote2, equipped.emote3,
    equipped.skin, equipped.territory_theme, equipped.troop_skin, equipped.victory_animation,
    equipped.avatar, equipped.frame, equipped.title, equipped.emote1, equipped.emote2, equipped.emote3
  );

  return { success: true };
}

export function getCompletedSets(playerId: string): { setId: string; bonus: SetBonus }[] {
  const playerItems = collectionQueries.getPlayerItems.all(playerId) as Array<{ item_id: string }>;
  const ownedIds = new Set(playerItems.map(i => i.item_id));

  const completedSets: { setId: string; bonus: SetBonus }[] = [];

  for (const set of COLLECTION_SETS) {
    const hasAll = set.items.every(itemId => ownedIds.has(itemId));
    if (hasAll) {
      completedSets.push({ setId: set.id, bonus: set.bonus });
    }
  }

  return completedSets;
}

// ============ API ROUTES ============

// Get player collection
router.get('/:playerId', (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    // Get all items with ownership status
    const allItems = collectionQueries.getAllItems.all() as Array<{
      id: string;
      type: ItemType;
      name: string;
      description: string;
      rarity: ItemRarity;
      preview_url: string;
      unlock_method: UnlockMethod;
      price: number | null;
      premium_price: number | null;
      achievement_id: string | null;
      season_id: number | null;
      rank_required: string | null;
      set_id: string | null;
    }>;

    const playerItems = collectionQueries.getPlayerItems.all(playerId) as Array<{
      id: string;
      obtained_at: number;
      equipped: number;
    }>;

    const ownedIds = new Set(playerItems.map(i => i.id));

    // Get equipped items
    const equipped = collectionQueries.getPlayerEquipped.get(playerId) as {
      skin: string | null;
      territory_theme: string | null;
      troop_skin: string | null;
      victory_animation: string | null;
      avatar: string | null;
      frame: string | null;
      title: string | null;
      emote1: string | null;
      emote2: string | null;
      emote3: string | null;
    } | undefined;

    // Get completed sets
    const completedSets = getCompletedSets(playerId);

    // Get all sets with progress
    const allSets = collectionQueries.getAllSets.all() as Array<{
      id: string;
      name: string;
      description: string;
      items: string;
      bonus: string;
      rarity: ItemRarity;
    }>;

    // Count by rarity
    const rarityCounts = collectionQueries.countPlayerItemsByRarity.all(playerId) as Array<{
      rarity: ItemRarity;
      count: number;
    }>;

    res.json({
      items: allItems.map(item => ({
        id: item.id,
        type: item.type,
        name: item.name,
        description: item.description,
        rarity: item.rarity,
        previewUrl: item.preview_url,
        unlockMethod: item.unlock_method,
        price: item.price,
        premiumPrice: item.premium_price,
        achievementId: item.achievement_id,
        seasonId: item.season_id,
        rankRequired: item.rank_required,
        setId: item.set_id,
        owned: ownedIds.has(item.id),
      })),
      equipped: equipped || {
        skin: null, territoryTheme: null, troopSkin: null, victoryAnimation: null,
        avatar: null, frame: null, title: null, emote1: null, emote2: null, emote3: null,
      },
      sets: allSets.map(set => {
        const setItems = JSON.parse(set.items) as string[];
        const ownedInSet = setItems.filter(id => ownedIds.has(id)).length;
        const isComplete = completedSets.some(cs => cs.setId === set.id);

        return {
          id: set.id,
          name: set.name,
          description: set.description,
          items: setItems,
          ownedCount: ownedInSet,
          totalCount: setItems.length,
          progress: Math.round((ownedInSet / setItems.length) * 100),
          isComplete,
          bonus: JSON.parse(set.bonus),
          rarity: set.rarity,
        };
      }),
      stats: {
        totalOwned: playerItems.length,
        totalItems: allItems.length,
        byRarity: Object.fromEntries(rarityCounts.map(r => [r.rarity, r.count])),
        completedSets: completedSets.length,
        totalSets: allSets.length,
      },
      activeBonuses: completedSets.map(cs => cs.bonus),
    });
  } catch (error) {
    console.error('Get collection error:', error);
    res.status(500).json({ error: 'Failed to get collection' });
  }
});

// Get shop items
router.get('/shop/items', (_req: AuthRequest, res: Response) => {
  try {
    const items = collectionQueries.getShopItems.all() as Array<{
      id: string;
      type: ItemType;
      name: string;
      description: string;
      rarity: ItemRarity;
      preview_url: string;
      price: number | null;
      premium_price: number | null;
      set_id: string | null;
    }>;

    res.json({
      items: items.map(item => ({
        id: item.id,
        type: item.type,
        name: item.name,
        description: item.description,
        rarity: item.rarity,
        previewUrl: item.preview_url,
        price: item.price,
        premiumPrice: item.premium_price,
        setId: item.set_id,
      })),
    });
  } catch (error) {
    console.error('Get shop items error:', error);
    res.status(500).json({ error: 'Failed to get shop items' });
  }
});

// Purchase item
router.post('/purchase', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { itemId, currency } = req.body as { itemId: string; currency: 'gold' | 'gems' };

    const result = purchaseItem(req.user.id, itemId, currency);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Purchase item error:', error);
    res.status(500).json({ error: 'Failed to purchase item' });
  }
});

// Equip item
router.post('/equip', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { itemId, slot } = req.body as { itemId: string; slot?: string };

    const result = equipItem(req.user.id, itemId, slot);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Equip item error:', error);
    res.status(500).json({ error: 'Failed to equip item' });
  }
});

// Get items by type
router.get('/type/:type', (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.params;

    const items = collectionQueries.getItemsByType.all(type) as Array<{
      id: string;
      type: ItemType;
      name: string;
      description: string;
      rarity: ItemRarity;
      preview_url: string;
      unlock_method: UnlockMethod;
      price: number | null;
      premium_price: number | null;
    }>;

    res.json({
      items: items.map(item => ({
        id: item.id,
        type: item.type,
        name: item.name,
        description: item.description,
        rarity: item.rarity,
        previewUrl: item.preview_url,
        unlockMethod: item.unlock_method,
        price: item.price,
        premiumPrice: item.premium_price,
      })),
    });
  } catch (error) {
    console.error('Get items by type error:', error);
    res.status(500).json({ error: 'Failed to get items' });
  }
});

export { router as collectionRouter };
