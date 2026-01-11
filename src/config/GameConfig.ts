import Phaser from 'phaser';

// Color palette - Modern 2026 neon style
export const COLORS = {
  // Player colors (with glow effects)
  PLAYER: {
    primary: 0x00f5ff,    // Cyan
    glow: 0x00d4ff,
    text: '#00f5ff',
  },
  ENEMY_1: {
    primary: 0xff3366,    // Hot pink
    glow: 0xff1a4d,
    text: '#ff3366',
  },
  ENEMY_2: {
    primary: 0xffaa00,    // Orange
    glow: 0xff8800,
    text: '#ffaa00',
  },
  ENEMY_3: {
    primary: 0x9933ff,    // Purple
    glow: 0x7700ff,
    text: '#9933ff',
  },
  ENEMY_4: {
    primary: 0x00ff88,    // Green
    glow: 0x00dd66,
    text: '#00ff88',
  },
  NEUTRAL: {
    primary: 0x4a4a6a,    // Gray-blue
    glow: 0x3a3a5a,
    text: '#6a6a8a',
  },

  // UI Colors
  UI: {
    background: 0x0a0a1a,
    panel: 0x1a1a3a,
    accent: 0x00f5ff,
    warning: 0xff3366,
    success: 0x00ff88,
    text: 0xffffff,
    textDim: 0x8888aa,
  },
};

// All player color arrays for easy access
export const PLAYER_COLORS = [
  COLORS.PLAYER,
  COLORS.ENEMY_1,
  COLORS.ENEMY_2,
  COLORS.ENEMY_3,
  COLORS.ENEMY_4,
];

// Game settings
export const GAME_SETTINGS = {
  // Troop generation
  TROOP_GENERATION_INTERVAL: 1000,  // ms between troop spawns
  TROOP_GENERATION_RATE: 1,         // troops per interval
  TROOP_SPEED: 200,                 // pixels per second

  // Territory
  MIN_TERRITORY_SIZE: 40,
  MAX_TERRITORY_SIZE: 100,
  TERRITORY_PULSE_SPEED: 0.003,

  // Combat
  CAPTURE_THRESHOLD: 0,             // Territory captured when troops <= 0

  // AI
  AI_THINK_INTERVAL: 500,           // ms between AI decisions
  AI_ATTACK_CHANCE: 0.3,            // Base chance to attack

  // Visual
  PARTICLE_COUNT: 50,
  GLOW_INTENSITY: 0.6,

  // Game
  VICTORY_DELAY: 2000,              // ms after winning before showing victory screen

  // Multiplayer
  SERVER_URL: 'http://localhost:3001',
};

// Calculate responsive game dimensions
function getGameDimensions(): { width: number; height: number } {
  const maxWidth = 1920;
  const maxHeight = 1080;
  const minWidth = 360;
  const minHeight = 640;

  let width = Math.min(window.innerWidth, maxWidth);
  let height = Math.min(window.innerHeight, maxHeight);

  width = Math.max(width, minWidth);
  height = Math.max(height, minHeight);

  return { width, height };
}

const dimensions = getGameDimensions();

export const CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: dimensions.width,
  height: dimensions.height,
  backgroundColor: COLORS.UI.background,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    min: {
      width: 360,
      height: 640,
    },
    max: {
      width: 1920,
      height: 1080,
    },
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { x: 0, y: 0 },
    },
  },
  input: {
    activePointers: 3,
    touch: {
      capture: true,
    },
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
    transparent: false,
  },
  audio: {
    disableWebAudio: false,
  },
};

// Level configurations
export interface TerritoryConfig {
  x: number;
  y: number;
  size: number;
  troops: number;
  owner: number;  // -1 = neutral, 0 = player, 1+ = enemy
}

export interface LevelConfig {
  id: number;
  name: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'extreme';
  territories: TerritoryConfig[];
  aiCount: number;
  description?: string;
  campaign?: string;
}

// Campaign definitions
export interface Campaign {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: number;
  levels: number[];  // Level IDs in this campaign
  unlockRequirement?: number;  // Stars needed to unlock
}

export const CAMPAIGNS: Campaign[] = [
  {
    id: 'tutorial',
    name: 'Training Grounds',
    description: 'Learn the basics of conquest',
    icon: '🎓',
    color: 0x00ff88,
    levels: [1, 2, 3, 4, 5],
    unlockRequirement: 0,
  },
  {
    id: 'earth',
    name: 'Earth Campaign',
    description: 'Conquer the home planet',
    icon: '🌍',
    color: 0x00f5ff,
    levels: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    unlockRequirement: 10,
  },
  {
    id: 'mars',
    name: 'Mars Invasion',
    description: 'The red planet awaits',
    icon: '🔴',
    color: 0xff3366,
    levels: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
    unlockRequirement: 25,
  },
  {
    id: 'galaxy',
    name: 'Galactic War',
    description: 'Dominate the galaxy',
    icon: '🌌',
    color: 0x9933ff,
    levels: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35],
    unlockRequirement: 50,
  },
  {
    id: 'championship',
    name: 'Championship',
    description: 'The ultimate challenge',
    icon: '🏆',
    color: 0xffaa00,
    levels: [36, 37, 38, 39, 40],
    unlockRequirement: 80,
  },
];

export const LEVELS: LevelConfig[] = [
  // ============ CAMPAIGN 1: TUTORIAL (Levels 1-5) ============
  {
    id: 1,
    name: 'First Steps',
    difficulty: 'easy',
    campaign: 'tutorial',
    description: 'Learn the basics of conquest',
    aiCount: 1,
    territories: [
      { x: 0.2, y: 0.5, size: 70, troops: 10, owner: 0 },
      { x: 0.5, y: 0.5, size: 60, troops: 5, owner: -1 },
      { x: 0.8, y: 0.5, size: 70, troops: 10, owner: 1 },
    ],
  },
  {
    id: 2,
    name: 'Triangle',
    difficulty: 'easy',
    campaign: 'tutorial',
    description: 'Control the center',
    aiCount: 1,
    territories: [
      { x: 0.5, y: 0.25, size: 65, troops: 15, owner: -1 },
      { x: 0.25, y: 0.7, size: 70, troops: 10, owner: 0 },
      { x: 0.75, y: 0.7, size: 70, troops: 10, owner: 1 },
      { x: 0.5, y: 0.55, size: 50, troops: 8, owner: -1 },
    ],
  },
  {
    id: 3,
    name: 'Crossroads',
    difficulty: 'easy',
    campaign: 'tutorial',
    description: 'Multiple paths to victory',
    aiCount: 1,
    territories: [
      { x: 0.5, y: 0.2, size: 55, troops: 8, owner: -1 },
      { x: 0.2, y: 0.5, size: 65, troops: 10, owner: 0 },
      { x: 0.5, y: 0.5, size: 70, troops: 15, owner: -1 },
      { x: 0.8, y: 0.5, size: 65, troops: 10, owner: 1 },
      { x: 0.5, y: 0.8, size: 55, troops: 8, owner: -1 },
    ],
  },
  {
    id: 4,
    name: 'Diamond Rush',
    difficulty: 'easy',
    campaign: 'tutorial',
    description: 'Race to the center',
    aiCount: 1,
    territories: [
      { x: 0.5, y: 0.15, size: 60, troops: 12, owner: 0 },
      { x: 0.25, y: 0.4, size: 50, troops: 6, owner: -1 },
      { x: 0.75, y: 0.4, size: 50, troops: 6, owner: -1 },
      { x: 0.5, y: 0.5, size: 80, troops: 20, owner: -1 },
      { x: 0.25, y: 0.65, size: 50, troops: 6, owner: -1 },
      { x: 0.75, y: 0.65, size: 50, troops: 6, owner: -1 },
      { x: 0.5, y: 0.85, size: 60, troops: 12, owner: 1 },
    ],
  },
  {
    id: 5,
    name: 'Graduation',
    difficulty: 'easy',
    campaign: 'tutorial',
    description: 'Final tutorial challenge',
    aiCount: 2,
    territories: [
      { x: 0.5, y: 0.2, size: 55, troops: 10, owner: 1 },
      { x: 0.25, y: 0.35, size: 55, troops: 8, owner: -1 },
      { x: 0.75, y: 0.35, size: 55, troops: 8, owner: 2 },
      { x: 0.5, y: 0.5, size: 70, troops: 15, owner: -1 },
      { x: 0.25, y: 0.65, size: 55, troops: 8, owner: -1 },
      { x: 0.75, y: 0.65, size: 55, troops: 8, owner: -1 },
      { x: 0.5, y: 0.8, size: 55, troops: 10, owner: 0 },
    ],
  },

  // ============ CAMPAIGN 2: EARTH (Levels 6-15) ============
  {
    id: 6,
    name: 'Fortress',
    difficulty: 'medium',
    campaign: 'earth',
    description: 'Break through the defenses',
    aiCount: 1,
    territories: [
      { x: 0.15, y: 0.5, size: 60, troops: 12, owner: 0 },
      { x: 0.35, y: 0.3, size: 45, troops: 5, owner: -1 },
      { x: 0.35, y: 0.7, size: 45, troops: 5, owner: -1 },
      { x: 0.5, y: 0.5, size: 50, troops: 8, owner: -1 },
      { x: 0.65, y: 0.3, size: 55, troops: 15, owner: 1 },
      { x: 0.65, y: 0.7, size: 55, troops: 15, owner: 1 },
      { x: 0.85, y: 0.5, size: 70, troops: 25, owner: 1 },
    ],
  },
  {
    id: 7,
    name: 'Scattered',
    difficulty: 'medium',
    campaign: 'earth',
    description: 'Control the chaos',
    aiCount: 2,
    territories: [
      { x: 0.15, y: 0.25, size: 50, troops: 8, owner: 0 },
      { x: 0.4, y: 0.2, size: 45, troops: 5, owner: -1 },
      { x: 0.7, y: 0.15, size: 50, troops: 8, owner: 1 },
      { x: 0.85, y: 0.35, size: 45, troops: 5, owner: -1 },
      { x: 0.25, y: 0.45, size: 55, troops: 10, owner: -1 },
      { x: 0.55, y: 0.4, size: 60, troops: 12, owner: -1 },
      { x: 0.75, y: 0.55, size: 55, troops: 10, owner: 2 },
      { x: 0.2, y: 0.7, size: 45, troops: 5, owner: -1 },
      { x: 0.5, y: 0.75, size: 50, troops: 8, owner: -1 },
      { x: 0.8, y: 0.8, size: 45, troops: 5, owner: -1 },
    ],
  },
  {
    id: 8,
    name: 'The Crown',
    difficulty: 'medium',
    campaign: 'earth',
    description: 'Seize the throne',
    aiCount: 2,
    territories: [
      { x: 0.5, y: 0.15, size: 75, troops: 30, owner: -1 },
      { x: 0.3, y: 0.3, size: 50, troops: 10, owner: 1 },
      { x: 0.7, y: 0.3, size: 50, troops: 10, owner: 2 },
      { x: 0.2, y: 0.5, size: 55, troops: 8, owner: -1 },
      { x: 0.5, y: 0.5, size: 60, troops: 12, owner: -1 },
      { x: 0.8, y: 0.5, size: 55, troops: 8, owner: -1 },
      { x: 0.3, y: 0.7, size: 50, troops: 6, owner: -1 },
      { x: 0.5, y: 0.8, size: 60, troops: 12, owner: 0 },
      { x: 0.7, y: 0.7, size: 50, troops: 6, owner: -1 },
    ],
  },
  {
    id: 9,
    name: 'Pincer',
    difficulty: 'medium',
    campaign: 'earth',
    description: 'Caught in the middle',
    aiCount: 2,
    territories: [
      { x: 0.1, y: 0.3, size: 55, troops: 15, owner: 1 },
      { x: 0.1, y: 0.7, size: 55, troops: 15, owner: 1 },
      { x: 0.3, y: 0.5, size: 50, troops: 8, owner: -1 },
      { x: 0.5, y: 0.3, size: 50, troops: 10, owner: 0 },
      { x: 0.5, y: 0.7, size: 50, troops: 10, owner: 0 },
      { x: 0.7, y: 0.5, size: 50, troops: 8, owner: -1 },
      { x: 0.9, y: 0.3, size: 55, troops: 15, owner: 2 },
      { x: 0.9, y: 0.7, size: 55, troops: 15, owner: 2 },
    ],
  },
  {
    id: 10,
    name: 'Maze Runner',
    difficulty: 'medium',
    campaign: 'earth',
    description: 'Navigate the labyrinth',
    aiCount: 2,
    territories: [
      { x: 0.1, y: 0.2, size: 50, troops: 10, owner: 0 },
      { x: 0.3, y: 0.2, size: 40, troops: 5, owner: -1 },
      { x: 0.5, y: 0.15, size: 45, troops: 8, owner: 1 },
      { x: 0.7, y: 0.2, size: 40, troops: 5, owner: -1 },
      { x: 0.9, y: 0.2, size: 50, troops: 10, owner: 2 },
      { x: 0.2, y: 0.45, size: 45, troops: 6, owner: -1 },
      { x: 0.5, y: 0.45, size: 55, troops: 12, owner: -1 },
      { x: 0.8, y: 0.45, size: 45, troops: 6, owner: -1 },
      { x: 0.1, y: 0.7, size: 50, troops: 10, owner: -1 },
      { x: 0.35, y: 0.75, size: 40, troops: 5, owner: -1 },
      { x: 0.5, y: 0.8, size: 45, troops: 8, owner: -1 },
      { x: 0.65, y: 0.75, size: 40, troops: 5, owner: -1 },
      { x: 0.9, y: 0.7, size: 50, troops: 8, owner: -1 },
    ],
  },
  {
    id: 11,
    name: 'Island Hopping',
    difficulty: 'medium',
    campaign: 'earth',
    description: 'Cross the archipelago',
    aiCount: 1,
    territories: [
      { x: 0.1, y: 0.5, size: 60, troops: 15, owner: 0 },
      { x: 0.25, y: 0.3, size: 45, troops: 8, owner: -1 },
      { x: 0.25, y: 0.7, size: 45, troops: 8, owner: -1 },
      { x: 0.4, y: 0.5, size: 50, troops: 10, owner: -1 },
      { x: 0.55, y: 0.35, size: 45, troops: 8, owner: -1 },
      { x: 0.55, y: 0.65, size: 45, troops: 8, owner: -1 },
      { x: 0.7, y: 0.5, size: 50, troops: 10, owner: -1 },
      { x: 0.85, y: 0.3, size: 45, troops: 8, owner: 1 },
      { x: 0.85, y: 0.7, size: 45, troops: 8, owner: 1 },
      { x: 0.95, y: 0.5, size: 60, troops: 20, owner: 1 },
    ],
  },
  {
    id: 12,
    name: 'Spiral',
    difficulty: 'hard',
    campaign: 'earth',
    description: 'Wind your way to victory',
    aiCount: 2,
    territories: [
      { x: 0.5, y: 0.5, size: 70, troops: 25, owner: -1 },
      { x: 0.5, y: 0.25, size: 50, troops: 12, owner: 1 },
      { x: 0.75, y: 0.4, size: 50, troops: 10, owner: -1 },
      { x: 0.7, y: 0.65, size: 50, troops: 10, owner: 2 },
      { x: 0.45, y: 0.75, size: 50, troops: 10, owner: -1 },
      { x: 0.2, y: 0.65, size: 50, troops: 12, owner: 0 },
      { x: 0.25, y: 0.4, size: 50, troops: 10, owner: -1 },
    ],
  },
  {
    id: 13,
    name: 'Battlefront',
    difficulty: 'hard',
    campaign: 'earth',
    description: 'Hold the line',
    aiCount: 2,
    territories: [
      { x: 0.15, y: 0.2, size: 50, troops: 12, owner: 0 },
      { x: 0.15, y: 0.5, size: 55, troops: 15, owner: 0 },
      { x: 0.15, y: 0.8, size: 50, troops: 12, owner: 0 },
      { x: 0.4, y: 0.35, size: 45, troops: 8, owner: -1 },
      { x: 0.4, y: 0.65, size: 45, troops: 8, owner: -1 },
      { x: 0.6, y: 0.35, size: 45, troops: 8, owner: -1 },
      { x: 0.6, y: 0.65, size: 45, troops: 8, owner: -1 },
      { x: 0.85, y: 0.2, size: 50, troops: 12, owner: 1 },
      { x: 0.85, y: 0.5, size: 55, troops: 15, owner: 2 },
      { x: 0.85, y: 0.8, size: 50, troops: 12, owner: 1 },
    ],
  },
  {
    id: 14,
    name: 'Encirclement',
    difficulty: 'hard',
    campaign: 'earth',
    description: 'Break out or perish',
    aiCount: 3,
    territories: [
      { x: 0.5, y: 0.5, size: 65, troops: 20, owner: 0 },
      { x: 0.5, y: 0.2, size: 50, troops: 12, owner: 1 },
      { x: 0.8, y: 0.35, size: 50, troops: 12, owner: 2 },
      { x: 0.8, y: 0.65, size: 50, troops: 12, owner: 3 },
      { x: 0.5, y: 0.8, size: 50, troops: 10, owner: -1 },
      { x: 0.2, y: 0.65, size: 50, troops: 12, owner: 1 },
      { x: 0.2, y: 0.35, size: 50, troops: 12, owner: 2 },
    ],
  },
  {
    id: 15,
    name: 'World Conquest',
    difficulty: 'hard',
    campaign: 'earth',
    description: 'The ultimate Earth challenge',
    aiCount: 4,
    territories: [
      { x: 0.5, y: 0.5, size: 80, troops: 40, owner: -1 },
      { x: 0.5, y: 0.25, size: 55, troops: 15, owner: 1 },
      { x: 0.3, y: 0.4, size: 55, troops: 12, owner: -1 },
      { x: 0.7, y: 0.4, size: 55, troops: 12, owner: 2 },
      { x: 0.3, y: 0.6, size: 55, troops: 12, owner: -1 },
      { x: 0.7, y: 0.6, size: 55, troops: 12, owner: -1 },
      { x: 0.5, y: 0.75, size: 55, troops: 15, owner: 0 },
      { x: 0.15, y: 0.25, size: 45, troops: 8, owner: 3 },
      { x: 0.85, y: 0.25, size: 45, troops: 8, owner: 4 },
      { x: 0.1, y: 0.5, size: 50, troops: 10, owner: -1 },
      { x: 0.9, y: 0.5, size: 50, troops: 10, owner: -1 },
      { x: 0.15, y: 0.75, size: 45, troops: 8, owner: -1 },
      { x: 0.85, y: 0.75, size: 45, troops: 8, owner: -1 },
    ],
  },

  // ============ CAMPAIGN 3: MARS (Levels 16-25) ============
  {
    id: 16,
    name: 'Red Dawn',
    difficulty: 'medium',
    campaign: 'mars',
    description: 'First landing on Mars',
    aiCount: 1,
    territories: [
      { x: 0.2, y: 0.5, size: 60, troops: 15, owner: 0 },
      { x: 0.4, y: 0.3, size: 50, troops: 10, owner: -1 },
      { x: 0.4, y: 0.7, size: 50, troops: 10, owner: -1 },
      { x: 0.6, y: 0.5, size: 55, troops: 12, owner: -1 },
      { x: 0.8, y: 0.3, size: 50, troops: 12, owner: 1 },
      { x: 0.8, y: 0.7, size: 50, troops: 12, owner: 1 },
    ],
  },
  {
    id: 17,
    name: 'Olympus Mons',
    difficulty: 'hard',
    campaign: 'mars',
    description: 'Conquer the mountain',
    aiCount: 2,
    territories: [
      { x: 0.5, y: 0.2, size: 80, troops: 35, owner: -1 },
      { x: 0.25, y: 0.4, size: 50, troops: 10, owner: 1 },
      { x: 0.75, y: 0.4, size: 50, troops: 10, owner: 2 },
      { x: 0.35, y: 0.6, size: 45, troops: 8, owner: -1 },
      { x: 0.65, y: 0.6, size: 45, troops: 8, owner: -1 },
      { x: 0.5, y: 0.8, size: 55, troops: 12, owner: 0 },
    ],
  },
  {
    id: 18,
    name: 'Valles Marineris',
    difficulty: 'hard',
    campaign: 'mars',
    description: 'The great canyon',
    aiCount: 2,
    territories: [
      { x: 0.1, y: 0.5, size: 55, troops: 15, owner: 0 },
      { x: 0.25, y: 0.35, size: 45, troops: 8, owner: -1 },
      { x: 0.25, y: 0.65, size: 45, troops: 8, owner: -1 },
      { x: 0.4, y: 0.5, size: 50, troops: 10, owner: -1 },
      { x: 0.55, y: 0.35, size: 45, troops: 8, owner: 1 },
      { x: 0.55, y: 0.65, size: 45, troops: 8, owner: -1 },
      { x: 0.7, y: 0.5, size: 50, troops: 10, owner: -1 },
      { x: 0.85, y: 0.35, size: 45, troops: 8, owner: -1 },
      { x: 0.85, y: 0.65, size: 45, troops: 8, owner: 2 },
      { x: 0.95, y: 0.5, size: 55, troops: 15, owner: 2 },
    ],
  },
  {
    id: 19,
    name: 'Dust Storm',
    difficulty: 'hard',
    campaign: 'mars',
    description: 'Survive the storm',
    aiCount: 3,
    territories: [
      { x: 0.5, y: 0.5, size: 70, troops: 20, owner: -1 },
      { x: 0.2, y: 0.3, size: 50, troops: 12, owner: 0 },
      { x: 0.8, y: 0.3, size: 50, troops: 12, owner: 1 },
      { x: 0.2, y: 0.7, size: 50, troops: 12, owner: 2 },
      { x: 0.8, y: 0.7, size: 50, troops: 12, owner: 3 },
      { x: 0.5, y: 0.2, size: 45, troops: 8, owner: -1 },
      { x: 0.5, y: 0.8, size: 45, troops: 8, owner: -1 },
    ],
  },
  {
    id: 20,
    name: 'Colony Wars',
    difficulty: 'hard',
    campaign: 'mars',
    description: 'Colony vs colony',
    aiCount: 2,
    territories: [
      { x: 0.15, y: 0.3, size: 55, troops: 15, owner: 0 },
      { x: 0.15, y: 0.7, size: 55, troops: 15, owner: 0 },
      { x: 0.35, y: 0.5, size: 50, troops: 10, owner: -1 },
      { x: 0.5, y: 0.3, size: 45, troops: 8, owner: -1 },
      { x: 0.5, y: 0.7, size: 45, troops: 8, owner: -1 },
      { x: 0.65, y: 0.5, size: 50, troops: 10, owner: -1 },
      { x: 0.85, y: 0.3, size: 55, troops: 15, owner: 1 },
      { x: 0.85, y: 0.7, size: 55, troops: 15, owner: 2 },
    ],
  },
  {
    id: 21, name: 'Phobos Base', difficulty: 'hard', campaign: 'mars', aiCount: 2,
    territories: [
      { x: 0.5, y: 0.15, size: 60, troops: 20, owner: 1 },
      { x: 0.2, y: 0.4, size: 50, troops: 10, owner: -1 },
      { x: 0.5, y: 0.4, size: 55, troops: 12, owner: -1 },
      { x: 0.8, y: 0.4, size: 50, troops: 10, owner: 2 },
      { x: 0.35, y: 0.65, size: 50, troops: 10, owner: -1 },
      { x: 0.65, y: 0.65, size: 50, troops: 10, owner: -1 },
      { x: 0.5, y: 0.85, size: 60, troops: 15, owner: 0 },
    ],
  },
  {
    id: 22, name: 'Deimos Assault', difficulty: 'hard', campaign: 'mars', aiCount: 3,
    territories: [
      { x: 0.5, y: 0.5, size: 75, troops: 30, owner: -1 },
      { x: 0.2, y: 0.25, size: 50, troops: 12, owner: 1 },
      { x: 0.8, y: 0.25, size: 50, troops: 12, owner: 2 },
      { x: 0.2, y: 0.75, size: 50, troops: 12, owner: 3 },
      { x: 0.8, y: 0.75, size: 50, troops: 12, owner: 0 },
      { x: 0.5, y: 0.25, size: 45, troops: 8, owner: -1 },
      { x: 0.5, y: 0.75, size: 45, troops: 8, owner: -1 },
    ],
  },
  {
    id: 23, name: 'Terraforming Wars', difficulty: 'extreme', campaign: 'mars', aiCount: 3,
    territories: [
      { x: 0.5, y: 0.5, size: 80, troops: 40, owner: -1 },
      { x: 0.25, y: 0.25, size: 55, troops: 15, owner: 1 },
      { x: 0.75, y: 0.25, size: 55, troops: 15, owner: 2 },
      { x: 0.25, y: 0.75, size: 55, troops: 15, owner: 3 },
      { x: 0.75, y: 0.75, size: 55, troops: 15, owner: 0 },
      { x: 0.5, y: 0.2, size: 45, troops: 10, owner: -1 },
      { x: 0.2, y: 0.5, size: 45, troops: 10, owner: -1 },
      { x: 0.8, y: 0.5, size: 45, troops: 10, owner: -1 },
      { x: 0.5, y: 0.8, size: 45, troops: 10, owner: -1 },
    ],
  },
  {
    id: 24, name: 'Red Planet Siege', difficulty: 'extreme', campaign: 'mars', aiCount: 4,
    territories: [
      { x: 0.5, y: 0.5, size: 85, troops: 50, owner: -1 },
      { x: 0.15, y: 0.2, size: 50, troops: 12, owner: 1 },
      { x: 0.85, y: 0.2, size: 50, troops: 12, owner: 2 },
      { x: 0.15, y: 0.8, size: 50, troops: 12, owner: 3 },
      { x: 0.85, y: 0.8, size: 50, troops: 12, owner: 4 },
      { x: 0.5, y: 0.2, size: 45, troops: 8, owner: -1 },
      { x: 0.5, y: 0.8, size: 45, troops: 8, owner: 0 },
      { x: 0.2, y: 0.5, size: 45, troops: 8, owner: -1 },
      { x: 0.8, y: 0.5, size: 45, troops: 8, owner: -1 },
    ],
  },
  {
    id: 25, name: 'Mars Domination', difficulty: 'extreme', campaign: 'mars', aiCount: 4,
    territories: [
      { x: 0.5, y: 0.5, size: 90, troops: 60, owner: -1 },
      { x: 0.2, y: 0.2, size: 55, troops: 15, owner: 1 },
      { x: 0.8, y: 0.2, size: 55, troops: 15, owner: 2 },
      { x: 0.2, y: 0.8, size: 55, troops: 15, owner: 3 },
      { x: 0.8, y: 0.8, size: 55, troops: 15, owner: 4 },
      { x: 0.5, y: 0.2, size: 50, troops: 10, owner: -1 },
      { x: 0.5, y: 0.8, size: 50, troops: 10, owner: 0 },
      { x: 0.2, y: 0.5, size: 50, troops: 10, owner: -1 },
      { x: 0.8, y: 0.5, size: 50, troops: 10, owner: -1 },
      { x: 0.35, y: 0.35, size: 40, troops: 6, owner: -1 },
      { x: 0.65, y: 0.35, size: 40, troops: 6, owner: -1 },
      { x: 0.35, y: 0.65, size: 40, troops: 6, owner: -1 },
      { x: 0.65, y: 0.65, size: 40, troops: 6, owner: -1 },
    ],
  },

  // ============ CAMPAIGN 4: GALAXY (Levels 26-35) ============
  {
    id: 26, name: 'Nebula Outpost', difficulty: 'hard', campaign: 'galaxy', aiCount: 2,
    territories: [
      { x: 0.5, y: 0.5, size: 70, troops: 25, owner: -1 },
      { x: 0.2, y: 0.3, size: 55, troops: 12, owner: 0 },
      { x: 0.8, y: 0.3, size: 55, troops: 12, owner: 1 },
      { x: 0.2, y: 0.7, size: 55, troops: 12, owner: 2 },
      { x: 0.8, y: 0.7, size: 55, troops: 10, owner: -1 },
      { x: 0.5, y: 0.2, size: 45, troops: 8, owner: -1 },
      { x: 0.5, y: 0.8, size: 45, troops: 8, owner: -1 },
    ],
  },
  {
    id: 27, name: 'Star Cluster', difficulty: 'hard', campaign: 'galaxy', aiCount: 3,
    territories: [
      { x: 0.5, y: 0.5, size: 75, troops: 30, owner: -1 },
      { x: 0.3, y: 0.25, size: 50, troops: 12, owner: 1 },
      { x: 0.7, y: 0.25, size: 50, troops: 12, owner: 2 },
      { x: 0.15, y: 0.55, size: 50, troops: 12, owner: 0 },
      { x: 0.85, y: 0.55, size: 50, troops: 12, owner: 3 },
      { x: 0.3, y: 0.75, size: 45, troops: 8, owner: -1 },
      { x: 0.7, y: 0.75, size: 45, troops: 8, owner: -1 },
    ],
  },
  {
    id: 28, name: 'Asteroid Belt', difficulty: 'hard', campaign: 'galaxy', aiCount: 2,
    territories: [
      { x: 0.1, y: 0.5, size: 55, troops: 15, owner: 0 },
      { x: 0.25, y: 0.35, size: 40, troops: 6, owner: -1 },
      { x: 0.25, y: 0.65, size: 40, troops: 6, owner: -1 },
      { x: 0.4, y: 0.5, size: 45, troops: 8, owner: -1 },
      { x: 0.55, y: 0.35, size: 40, troops: 6, owner: -1 },
      { x: 0.55, y: 0.65, size: 40, troops: 6, owner: -1 },
      { x: 0.7, y: 0.5, size: 45, troops: 8, owner: -1 },
      { x: 0.85, y: 0.35, size: 40, troops: 6, owner: 1 },
      { x: 0.85, y: 0.65, size: 40, troops: 6, owner: 2 },
      { x: 0.95, y: 0.5, size: 55, troops: 15, owner: 1 },
    ],
  },
  {
    id: 29, name: 'Black Hole', difficulty: 'extreme', campaign: 'galaxy', aiCount: 3,
    territories: [
      { x: 0.5, y: 0.5, size: 85, troops: 50, owner: -1 },
      { x: 0.2, y: 0.2, size: 50, troops: 15, owner: 1 },
      { x: 0.8, y: 0.2, size: 50, troops: 15, owner: 2 },
      { x: 0.5, y: 0.85, size: 55, troops: 15, owner: 0 },
      { x: 0.15, y: 0.6, size: 45, troops: 10, owner: 3 },
      { x: 0.85, y: 0.6, size: 45, troops: 10, owner: -1 },
    ],
  },
  {
    id: 30, name: 'Wormhole', difficulty: 'extreme', campaign: 'galaxy', aiCount: 4,
    territories: [
      { x: 0.25, y: 0.5, size: 70, troops: 25, owner: -1 },
      { x: 0.75, y: 0.5, size: 70, troops: 25, owner: -1 },
      { x: 0.1, y: 0.3, size: 50, troops: 12, owner: 0 },
      { x: 0.1, y: 0.7, size: 50, troops: 12, owner: 1 },
      { x: 0.9, y: 0.3, size: 50, troops: 12, owner: 2 },
      { x: 0.9, y: 0.7, size: 50, troops: 12, owner: 3 },
      { x: 0.5, y: 0.2, size: 45, troops: 8, owner: -1 },
      { x: 0.5, y: 0.8, size: 45, troops: 8, owner: 4 },
    ],
  },
  {
    id: 31, name: 'Supernova', difficulty: 'extreme', campaign: 'galaxy', aiCount: 4,
    territories: [
      { x: 0.5, y: 0.5, size: 90, troops: 60, owner: -1 },
      { x: 0.2, y: 0.2, size: 50, troops: 15, owner: 1 },
      { x: 0.8, y: 0.2, size: 50, troops: 15, owner: 2 },
      { x: 0.2, y: 0.8, size: 50, troops: 15, owner: 3 },
      { x: 0.8, y: 0.8, size: 50, troops: 15, owner: 4 },
      { x: 0.5, y: 0.15, size: 45, troops: 10, owner: 0 },
      { x: 0.15, y: 0.5, size: 45, troops: 10, owner: -1 },
      { x: 0.85, y: 0.5, size: 45, troops: 10, owner: -1 },
      { x: 0.5, y: 0.85, size: 45, troops: 10, owner: -1 },
    ],
  },
  {
    id: 32, name: 'Pulsar', difficulty: 'extreme', campaign: 'galaxy', aiCount: 3,
    territories: [
      { x: 0.5, y: 0.5, size: 80, troops: 45, owner: -1 },
      { x: 0.25, y: 0.3, size: 55, troops: 18, owner: 1 },
      { x: 0.75, y: 0.3, size: 55, troops: 18, owner: 2 },
      { x: 0.5, y: 0.8, size: 55, troops: 18, owner: 0 },
      { x: 0.15, y: 0.6, size: 45, troops: 10, owner: 3 },
      { x: 0.85, y: 0.6, size: 45, troops: 10, owner: -1 },
      { x: 0.35, y: 0.55, size: 40, troops: 8, owner: -1 },
      { x: 0.65, y: 0.55, size: 40, troops: 8, owner: -1 },
    ],
  },
  {
    id: 33, name: 'Quasar', difficulty: 'extreme', campaign: 'galaxy', aiCount: 4,
    territories: [
      { x: 0.5, y: 0.5, size: 85, troops: 55, owner: -1 },
      { x: 0.5, y: 0.15, size: 50, troops: 15, owner: 1 },
      { x: 0.85, y: 0.5, size: 50, troops: 15, owner: 2 },
      { x: 0.5, y: 0.85, size: 50, troops: 15, owner: 0 },
      { x: 0.15, y: 0.5, size: 50, troops: 15, owner: 3 },
      { x: 0.3, y: 0.3, size: 45, troops: 10, owner: 4 },
      { x: 0.7, y: 0.3, size: 45, troops: 10, owner: -1 },
      { x: 0.3, y: 0.7, size: 45, troops: 10, owner: -1 },
      { x: 0.7, y: 0.7, size: 45, troops: 10, owner: -1 },
    ],
  },
  {
    id: 34, name: 'Dark Matter', difficulty: 'extreme', campaign: 'galaxy', aiCount: 4,
    territories: [
      { x: 0.5, y: 0.5, size: 90, troops: 65, owner: -1 },
      { x: 0.2, y: 0.15, size: 55, troops: 18, owner: 1 },
      { x: 0.8, y: 0.15, size: 55, troops: 18, owner: 2 },
      { x: 0.2, y: 0.85, size: 55, troops: 18, owner: 3 },
      { x: 0.8, y: 0.85, size: 55, troops: 18, owner: 4 },
      { x: 0.5, y: 0.25, size: 45, troops: 10, owner: 0 },
      { x: 0.25, y: 0.5, size: 45, troops: 10, owner: -1 },
      { x: 0.75, y: 0.5, size: 45, troops: 10, owner: -1 },
      { x: 0.5, y: 0.75, size: 45, troops: 10, owner: -1 },
    ],
  },
  {
    id: 35, name: 'Galaxy Core', difficulty: 'extreme', campaign: 'galaxy', aiCount: 4,
    territories: [
      { x: 0.5, y: 0.5, size: 95, troops: 80, owner: -1 },
      { x: 0.2, y: 0.2, size: 55, troops: 20, owner: 1 },
      { x: 0.8, y: 0.2, size: 55, troops: 20, owner: 2 },
      { x: 0.2, y: 0.8, size: 55, troops: 20, owner: 3 },
      { x: 0.8, y: 0.8, size: 55, troops: 20, owner: 4 },
      { x: 0.5, y: 0.2, size: 50, troops: 12, owner: 0 },
      { x: 0.2, y: 0.5, size: 50, troops: 12, owner: -1 },
      { x: 0.8, y: 0.5, size: 50, troops: 12, owner: -1 },
      { x: 0.5, y: 0.8, size: 50, troops: 12, owner: -1 },
      { x: 0.35, y: 0.35, size: 40, troops: 8, owner: -1 },
      { x: 0.65, y: 0.35, size: 40, troops: 8, owner: -1 },
      { x: 0.35, y: 0.65, size: 40, troops: 8, owner: -1 },
      { x: 0.65, y: 0.65, size: 40, troops: 8, owner: -1 },
    ],
  },

  // ============ CAMPAIGN 5: CHAMPIONSHIP (Levels 36-40) ============
  {
    id: 36, name: 'Quarter Finals', difficulty: 'extreme', campaign: 'championship', aiCount: 3,
    territories: [
      { x: 0.5, y: 0.5, size: 80, troops: 50, owner: -1 },
      { x: 0.2, y: 0.3, size: 55, troops: 20, owner: 0 },
      { x: 0.8, y: 0.3, size: 55, troops: 20, owner: 1 },
      { x: 0.2, y: 0.7, size: 55, troops: 20, owner: 2 },
      { x: 0.8, y: 0.7, size: 55, troops: 20, owner: 3 },
      { x: 0.5, y: 0.2, size: 45, troops: 12, owner: -1 },
      { x: 0.5, y: 0.8, size: 45, troops: 12, owner: -1 },
    ],
  },
  {
    id: 37, name: 'Semi Finals', difficulty: 'extreme', campaign: 'championship', aiCount: 3,
    territories: [
      { x: 0.5, y: 0.5, size: 85, troops: 60, owner: -1 },
      { x: 0.15, y: 0.5, size: 60, troops: 25, owner: 0 },
      { x: 0.85, y: 0.5, size: 60, troops: 25, owner: 1 },
      { x: 0.5, y: 0.15, size: 55, troops: 20, owner: 2 },
      { x: 0.5, y: 0.85, size: 55, troops: 20, owner: 3 },
      { x: 0.3, y: 0.3, size: 45, troops: 12, owner: -1 },
      { x: 0.7, y: 0.3, size: 45, troops: 12, owner: -1 },
      { x: 0.3, y: 0.7, size: 45, troops: 12, owner: -1 },
      { x: 0.7, y: 0.7, size: 45, troops: 12, owner: -1 },
    ],
  },
  {
    id: 38, name: 'The Finals', difficulty: 'extreme', campaign: 'championship', aiCount: 4,
    territories: [
      { x: 0.5, y: 0.5, size: 90, troops: 70, owner: -1 },
      { x: 0.15, y: 0.25, size: 55, troops: 22, owner: 1 },
      { x: 0.85, y: 0.25, size: 55, troops: 22, owner: 2 },
      { x: 0.15, y: 0.75, size: 55, troops: 22, owner: 3 },
      { x: 0.85, y: 0.75, size: 55, troops: 22, owner: 4 },
      { x: 0.5, y: 0.2, size: 50, troops: 15, owner: 0 },
      { x: 0.25, y: 0.5, size: 45, troops: 10, owner: -1 },
      { x: 0.75, y: 0.5, size: 45, troops: 10, owner: -1 },
      { x: 0.5, y: 0.8, size: 50, troops: 15, owner: -1 },
    ],
  },
  {
    id: 39, name: 'Grand Master', difficulty: 'extreme', campaign: 'championship', aiCount: 4,
    territories: [
      { x: 0.5, y: 0.5, size: 95, troops: 85, owner: -1 },
      { x: 0.2, y: 0.2, size: 60, troops: 25, owner: 1 },
      { x: 0.8, y: 0.2, size: 60, troops: 25, owner: 2 },
      { x: 0.2, y: 0.8, size: 60, troops: 25, owner: 3 },
      { x: 0.8, y: 0.8, size: 60, troops: 25, owner: 4 },
      { x: 0.5, y: 0.2, size: 50, troops: 15, owner: 0 },
      { x: 0.2, y: 0.5, size: 50, troops: 15, owner: -1 },
      { x: 0.8, y: 0.5, size: 50, troops: 15, owner: -1 },
      { x: 0.5, y: 0.8, size: 50, troops: 15, owner: -1 },
      { x: 0.35, y: 0.35, size: 40, troops: 10, owner: -1 },
      { x: 0.65, y: 0.35, size: 40, troops: 10, owner: -1 },
      { x: 0.35, y: 0.65, size: 40, troops: 10, owner: -1 },
      { x: 0.65, y: 0.65, size: 40, troops: 10, owner: -1 },
    ],
  },
  {
    id: 40, name: 'Ultimate Champion', difficulty: 'extreme', campaign: 'championship', aiCount: 4,
    territories: [
      { x: 0.5, y: 0.5, size: 100, troops: 100, owner: -1 },
      { x: 0.15, y: 0.15, size: 60, troops: 30, owner: 1 },
      { x: 0.85, y: 0.15, size: 60, troops: 30, owner: 2 },
      { x: 0.15, y: 0.85, size: 60, troops: 30, owner: 3 },
      { x: 0.85, y: 0.85, size: 60, troops: 30, owner: 4 },
      { x: 0.5, y: 0.15, size: 50, troops: 18, owner: 0 },
      { x: 0.15, y: 0.5, size: 50, troops: 18, owner: -1 },
      { x: 0.85, y: 0.5, size: 50, troops: 18, owner: -1 },
      { x: 0.5, y: 0.85, size: 50, troops: 18, owner: -1 },
      { x: 0.35, y: 0.35, size: 45, troops: 12, owner: -1 },
      { x: 0.65, y: 0.35, size: 45, troops: 12, owner: -1 },
      { x: 0.35, y: 0.65, size: 45, troops: 12, owner: -1 },
      { x: 0.65, y: 0.65, size: 45, troops: 12, owner: -1 },
      { x: 0.5, y: 0.35, size: 40, troops: 10, owner: -1 },
      { x: 0.5, y: 0.65, size: 40, troops: 10, owner: -1 },
    ],
  },
];

// Difficulty multipliers for AI
export const DIFFICULTY_SETTINGS = {
  easy: {
    aiThinkMultiplier: 1.5,
    aiAttackChance: 0.2,
    aiDefenseWeight: 0.3,
    troopGenMultiplier: 0.8,
  },
  medium: {
    aiThinkMultiplier: 1.0,
    aiAttackChance: 0.35,
    aiDefenseWeight: 0.5,
    troopGenMultiplier: 1.0,
  },
  hard: {
    aiThinkMultiplier: 0.8,
    aiAttackChance: 0.5,
    aiDefenseWeight: 0.6,
    troopGenMultiplier: 1.1,
  },
  extreme: {
    aiThinkMultiplier: 0.6,
    aiAttackChance: 0.65,
    aiDefenseWeight: 0.7,
    troopGenMultiplier: 1.2,
  },
};

// Multiplayer game modes
export interface GameMode {
  id: string;
  name: string;
  description: string;
  teamSize: number;
  teams: number;
  icon: string;
}

export const GAME_MODES: GameMode[] = [
  { id: '1v1', name: '1 vs 1', description: 'Classic duel', teamSize: 1, teams: 2, icon: '⚔️' },
  { id: '2v2', name: '2 vs 2', description: 'Team battle', teamSize: 2, teams: 2, icon: '👥' },
  { id: '5v5', name: '5 vs 5', description: 'Epic war', teamSize: 5, teams: 2, icon: '🏰' },
  { id: 'ffa4', name: 'FFA 4', description: 'Free for all', teamSize: 1, teams: 4, icon: '💀' },
  { id: 'ffa8', name: 'FFA 8', description: 'Battle royale', teamSize: 1, teams: 8, icon: '👑' },
];

// Rank definitions
export interface Rank {
  id: string;
  name: string;
  minElo: number;
  icon: string;
  color: number;
}

export const RANKS: Rank[] = [
  { id: 'bronze', name: 'Bronze', minElo: 0, icon: '🥉', color: 0xcd7f32 },
  { id: 'silver', name: 'Silver', minElo: 1000, icon: '🥈', color: 0xc0c0c0 },
  { id: 'gold', name: 'Gold', minElo: 1200, icon: '🥇', color: 0xffd700 },
  { id: 'platinum', name: 'Platinum', minElo: 1400, icon: '💎', color: 0x00f5ff },
  { id: 'diamond', name: 'Diamond', minElo: 1600, icon: '💠', color: 0x00ffff },
  { id: 'master', name: 'Master', minElo: 1800, icon: '🏆', color: 0xff00ff },
  { id: 'grandmaster', name: 'Grand Master', minElo: 2000, icon: '👑', color: 0xffaa00 },
  { id: 'legend', name: 'Legend', minElo: 2200, icon: '⭐', color: 0xff3366 },
];

export function getRankByElo(elo: number): Rank {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (elo >= RANKS[i].minElo) {
      return RANKS[i];
    }
  }
  return RANKS[0];
}
