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
  connections?: number[];  // indices of connected territories
}

export interface LevelConfig {
  id: number;
  name: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'extreme';
  territories: TerritoryConfig[];
  aiCount: number;
  description?: string;
}

export const LEVELS: LevelConfig[] = [
  // Level 1 - Tutorial: Simple 3 territory
  {
    id: 1,
    name: 'First Steps',
    difficulty: 'easy',
    description: 'Learn the basics of conquest',
    aiCount: 1,
    territories: [
      { x: 0.2, y: 0.5, size: 70, troops: 10, owner: 0 },
      { x: 0.5, y: 0.5, size: 60, troops: 5, owner: -1 },
      { x: 0.8, y: 0.5, size: 70, troops: 10, owner: 1 },
    ],
  },
  // Level 2 - Triangle
  {
    id: 2,
    name: 'Triangle',
    difficulty: 'easy',
    description: 'Control the center',
    aiCount: 1,
    territories: [
      { x: 0.5, y: 0.25, size: 65, troops: 15, owner: -1 },
      { x: 0.25, y: 0.7, size: 70, troops: 10, owner: 0 },
      { x: 0.75, y: 0.7, size: 70, troops: 10, owner: 1 },
      { x: 0.5, y: 0.55, size: 50, troops: 8, owner: -1 },
    ],
  },
  // Level 3 - Cross
  {
    id: 3,
    name: 'Crossroads',
    difficulty: 'easy',
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
  // Level 4 - Diamond
  {
    id: 4,
    name: 'Diamond Rush',
    difficulty: 'medium',
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
  // Level 5 - Hexagon
  {
    id: 5,
    name: 'Hexagon',
    difficulty: 'medium',
    description: 'Six-sided strategy',
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
  // Level 6 - Fortress
  {
    id: 6,
    name: 'Fortress',
    difficulty: 'medium',
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
  // Level 7 - Scattered
  {
    id: 7,
    name: 'Scattered',
    difficulty: 'hard',
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
  // Level 8 - The Crown
  {
    id: 8,
    name: 'The Crown',
    difficulty: 'hard',
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
  // Level 9 - Maze
  {
    id: 9,
    name: 'The Maze',
    difficulty: 'hard',
    description: 'Navigate carefully',
    aiCount: 3,
    territories: [
      { x: 0.1, y: 0.2, size: 50, troops: 10, owner: 0 },
      { x: 0.3, y: 0.2, size: 40, troops: 5, owner: -1 },
      { x: 0.5, y: 0.15, size: 45, troops: 8, owner: 1 },
      { x: 0.7, y: 0.2, size: 40, troops: 5, owner: -1 },
      { x: 0.9, y: 0.2, size: 50, troops: 10, owner: 2 },
      { x: 0.2, y: 0.45, size: 45, troops: 6, owner: -1 },
      { x: 0.5, y: 0.45, size: 55, troops: 12, owner: -1 },
      { x: 0.8, y: 0.45, size: 45, troops: 6, owner: -1 },
      { x: 0.1, y: 0.7, size: 50, troops: 10, owner: 3 },
      { x: 0.35, y: 0.75, size: 40, troops: 5, owner: -1 },
      { x: 0.5, y: 0.8, size: 45, troops: 8, owner: -1 },
      { x: 0.65, y: 0.75, size: 40, troops: 5, owner: -1 },
      { x: 0.9, y: 0.7, size: 50, troops: 8, owner: -1 },
    ],
  },
  // Level 10 - Final Battle
  {
    id: 10,
    name: 'World Conquest',
    difficulty: 'extreme',
    description: 'The ultimate challenge',
    aiCount: 4,
    territories: [
      // Center stronghold
      { x: 0.5, y: 0.5, size: 80, troops: 40, owner: -1 },
      // Inner ring
      { x: 0.5, y: 0.25, size: 55, troops: 15, owner: 1 },
      { x: 0.3, y: 0.4, size: 55, troops: 12, owner: -1 },
      { x: 0.7, y: 0.4, size: 55, troops: 12, owner: 2 },
      { x: 0.3, y: 0.6, size: 55, troops: 12, owner: -1 },
      { x: 0.7, y: 0.6, size: 55, troops: 12, owner: -1 },
      { x: 0.5, y: 0.75, size: 55, troops: 15, owner: 0 },
      // Outer ring
      { x: 0.15, y: 0.25, size: 45, troops: 8, owner: 3 },
      { x: 0.85, y: 0.25, size: 45, troops: 8, owner: 4 },
      { x: 0.1, y: 0.5, size: 50, troops: 10, owner: -1 },
      { x: 0.9, y: 0.5, size: 50, troops: 10, owner: -1 },
      { x: 0.15, y: 0.75, size: 45, troops: 8, owner: -1 },
      { x: 0.85, y: 0.75, size: 45, troops: 8, owner: -1 },
    ],
  },
];

// Difficulty multipliers for AI
export const DIFFICULTY_SETTINGS = {
  easy: {
    aiThinkMultiplier: 1.5,      // AI thinks slower
    aiAttackChance: 0.2,
    aiDefenseWeight: 0.3,
    troopGenMultiplier: 0.8,     // AI generates fewer troops
  },
  medium: {
    aiThinkMultiplier: 1.0,
    aiAttackChance: 0.35,
    aiDefenseWeight: 0.5,
    troopGenMultiplier: 1.0,
  },
  hard: {
    aiThinkMultiplier: 0.8,      // AI thinks faster
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
