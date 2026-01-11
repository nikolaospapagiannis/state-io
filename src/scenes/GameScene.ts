import Phaser from 'phaser';
import { Territory, TerritoryData } from '../entities/Territory';
import { Troop } from '../entities/Troop';
import { AIController } from '../systems/AIController';
import { COLORS, GAME_SETTINGS, LEVELS, LevelConfig, PLAYER_COLORS } from '../config/GameConfig';

interface GameSceneData {
  levelId: number;
}

export class GameScene extends Phaser.Scene {
  private territories: Territory[] = [];
  private troops: Troop[] = [];
  private aiControllers: AIController[] = [];
  private levelConfig!: LevelConfig;

  private selectedTerritory: Territory | null = null;
  private dragLine!: Phaser.GameObjects.Graphics;
  private isDragging = false;
  private gameOver = false;

  private particles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private connectionLines!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: GameSceneData): void {
    const levelId = data.levelId || 1;
    this.levelConfig = LEVELS.find((l) => l.id === levelId) || LEVELS[0];

    // Reset state
    this.territories = [];
    this.troops = [];
    this.aiControllers = [];
    this.selectedTerritory = null;
    this.isDragging = false;
    this.gameOver = false;
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    // Create background
    this.createBackground();

    // Create connection lines graphics
    this.connectionLines = this.add.graphics();
    this.connectionLines.setDepth(-2);

    // Create drag line graphics
    this.dragLine = this.add.graphics();
    this.dragLine.setDepth(100);

    // Create background particles
    this.createBackgroundParticles();

    // Create territories
    this.createTerritories(width, height);

    // Create AI controllers
    this.createAIControllers();

    // Set up input
    this.setupInput();

    // Start UI scene
    this.scene.launch('UIScene', { levelConfig: this.levelConfig });

    // Update connection lines initially
    this.updateConnectionLines();
  }

  private createBackground(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    const graphics = this.add.graphics();

    // Gradient background
    for (let i = 0; i < height; i++) {
      const ratio = i / height;
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x0a0a1a),
        Phaser.Display.Color.ValueToColor(0x15152a),
        100,
        ratio * 100
      );
      graphics.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1);
      graphics.fillRect(0, i, width, 1);
    }

    // Grid pattern
    graphics.lineStyle(1, 0x1a1a3a, 0.3);
    const gridSize = 50;
    for (let x = 0; x < width; x += gridSize) {
      graphics.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y < height; y += gridSize) {
      graphics.lineBetween(0, y, width, y);
    }
  }

  private createBackgroundParticles(): void {
    this.particles = this.add.particles(0, 0, 'particle', {
      x: { min: 0, max: this.scale.width },
      y: { min: 0, max: this.scale.height },
      scale: { start: 0.1, end: 0 },
      alpha: { start: 0.4, end: 0 },
      speed: { min: 10, max: 30 },
      lifespan: 5000,
      frequency: 500,
      tint: [0x1a1a3a, 0x2a2a4a],
      blendMode: Phaser.BlendModes.ADD,
    });
    this.particles.setDepth(-3);
  }

  private createTerritories(width: number, height: number): void {
    // Define play area (with padding for UI)
    const playAreaTop = 100;
    const playAreaBottom = height - 50;
    const playAreaLeft = 50;
    const playAreaRight = width - 50;
    const playWidth = playAreaRight - playAreaLeft;
    const playHeight = playAreaBottom - playAreaTop;

    this.levelConfig.territories.forEach((config, index) => {
      const data: TerritoryData = {
        id: index,
        x: playAreaLeft + config.x * playWidth,
        y: playAreaTop + config.y * playHeight,
        size: config.size,
        troops: config.troops,
        owner: config.owner,
      };

      const territory = new Territory(this, data);
      this.territories.push(territory);
    });
  }

  private createAIControllers(): void {
    // Create AI for each enemy
    for (let i = 1; i <= this.levelConfig.aiCount; i++) {
      const hasTerritory = this.territories.some((t) => t.owner === i);
      if (hasTerritory) {
        const ai = new AIController(i, this.levelConfig);
        this.aiControllers.push(ai);
      }
    }
  }

  private setupInput(): void {
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.gameOver) return;

    // Check if clicked on player territory
    const territory = this.getTerritoryAt(pointer.x, pointer.y);

    if (territory && territory.owner === 0 && territory.troops > 1) {
      this.selectedTerritory = territory;
      territory.setSelected(true);
      this.isDragging = true;
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isDragging || !this.selectedTerritory) return;

    // Draw drag line
    this.dragLine.clear();

    const color = COLORS.PLAYER.primary;
    this.dragLine.lineStyle(4, color, 0.8);
    this.dragLine.lineBetween(
      this.selectedTerritory.x,
      this.selectedTerritory.y,
      pointer.x,
      pointer.y
    );

    // Arrow head
    const angle = Math.atan2(
      pointer.y - this.selectedTerritory.y,
      pointer.x - this.selectedTerritory.x
    );
    const arrowSize = 15;
    const arrowAngle = Math.PI / 6;

    this.dragLine.fillStyle(color, 0.8);
    this.dragLine.fillTriangle(
      pointer.x,
      pointer.y,
      pointer.x - arrowSize * Math.cos(angle - arrowAngle),
      pointer.y - arrowSize * Math.sin(angle - arrowAngle),
      pointer.x - arrowSize * Math.cos(angle + arrowAngle),
      pointer.y - arrowSize * Math.sin(angle + arrowAngle)
    );

    // Highlight potential target
    const targetTerritory = this.getTerritoryAt(pointer.x, pointer.y);
    this.territories.forEach((t) => {
      if (t !== this.selectedTerritory) {
        if (t === targetTerritory) {
          t.setAlpha(1.2);
        } else {
          t.setAlpha(1);
        }
      }
    });
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.isDragging || !this.selectedTerritory) {
      this.clearSelection();
      return;
    }

    const targetTerritory = this.getTerritoryAt(pointer.x, pointer.y);

    if (targetTerritory && targetTerritory !== this.selectedTerritory) {
      // Send troops
      this.sendTroops(this.selectedTerritory, targetTerritory, 0);
    }

    this.clearSelection();
  }

  private clearSelection(): void {
    if (this.selectedTerritory) {
      this.selectedTerritory.setSelected(false);
    }
    this.selectedTerritory = null;
    this.isDragging = false;
    this.dragLine.clear();

    // Reset territory alphas
    this.territories.forEach((t) => t.setAlpha(1));
  }

  private getTerritoryAt(x: number, y: number): Territory | null {
    for (const territory of this.territories) {
      const dx = territory.x - x;
      const dy = territory.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < territory.territorySize) {
        return territory;
      }
    }
    return null;
  }

  public sendTroops(source: Territory, target: Territory, owner: number): void {
    if (source.troops <= 1) return;
    if (source.owner !== owner) return;

    const troopsToSend = source.troops - 1;
    source.removeTroops(troopsToSend);

    const troop = new Troop(this, source, target, troopsToSend, owner);
    this.troops.push(troop);

    troop.on('arrived', (arrivedTroop: Troop) => {
      this.handleTroopArrival(arrivedTroop);
    });

    // Play send sound
    this.playSound('attack');
  }

  private handleTroopArrival(troop: Troop): void {
    const target = troop.targetTerritory;
    const count = troop.troopCount;
    const owner = troop.owner;

    // Remove from troops array
    const index = this.troops.indexOf(troop);
    if (index > -1) {
      this.troops.splice(index, 1);
    }

    if (target.owner === owner) {
      // Reinforcement
      target.addTroops(count);
    } else {
      // Attack
      const remaining = target.troops - count;

      if (remaining <= 0) {
        // Territory captured
        target.troops = Math.abs(remaining);
        target.setOwner(owner);
        this.playSound('capture');
        this.updateConnectionLines();
        this.checkGameEnd();
      } else {
        // Territory defended
        target.troops = remaining;
      }
    }
  }

  private updateConnectionLines(): void {
    this.connectionLines.clear();

    // Draw connections between same-owner territories
    const ownerGroups = new Map<number, Territory[]>();

    this.territories.forEach((t) => {
      if (t.owner === -1) return;

      if (!ownerGroups.has(t.owner)) {
        ownerGroups.set(t.owner, []);
      }
      ownerGroups.get(t.owner)!.push(t);
    });

    ownerGroups.forEach((territories, owner) => {
      const color = PLAYER_COLORS[owner]?.primary || 0xffffff;

      for (let i = 0; i < territories.length; i++) {
        for (let j = i + 1; j < territories.length; j++) {
          const t1 = territories[i];
          const t2 = territories[j];
          const distance = Math.sqrt(
            Math.pow(t1.x - t2.x, 2) + Math.pow(t1.y - t2.y, 2)
          );

          // Only connect nearby territories
          if (distance < 300) {
            this.connectionLines.lineStyle(2, color, 0.15);
            this.connectionLines.lineBetween(t1.x, t1.y, t2.x, t2.y);
          }
        }
      }
    });
  }

  update(_time: number, delta: number): void {
    if (this.gameOver) return;

    // Update territories
    this.territories.forEach((territory) => {
      territory.update(delta);
    });

    // Update troops
    this.troops.forEach((troop) => {
      troop.update(delta);
    });

    // Clean up arrived troops
    this.troops = this.troops.filter((troop) => !troop.hasArrived());

    // Update AI
    this.aiControllers.forEach((ai) => {
      const decision = ai.update(delta, this.territories);

      if (decision) {
        this.sendTroops(decision.source, decision.target, ai.getId());
      }
    });

    // Emit game state update for UI
    this.events.emit('gameStateUpdate', this.getGameState());
  }

  private checkGameEnd(): void {
    const playerTerritories = this.territories.filter((t) => t.owner === 0);
    const enemyTerritories = this.territories.filter((t) => t.owner > 0);

    if (playerTerritories.length === 0) {
      // Player lost
      this.endGame(false);
    } else if (enemyTerritories.length === 0) {
      // Player won
      this.endGame(true);
    }
  }

  private endGame(playerWon: boolean): void {
    this.gameOver = true;

    // Play victory/defeat sound
    this.playSound(playerWon ? 'victory' : 'defeat');

    // Wait a moment before showing victory screen
    this.time.delayedCall(GAME_SETTINGS.VICTORY_DELAY, () => {
      // Save progress if player won
      if (playerWon) {
        this.saveProgress();
      }

      // Launch victory scene
      this.scene.stop('UIScene');
      this.scene.start('VictoryScene', {
        won: playerWon,
        levelId: this.levelConfig.id,
        stats: this.getGameStats(),
      });
    });
  }

  private saveProgress(): void {
    try {
      const unlockedLevels = this.registry.get('unlockedLevels') as number || 1;
      const highScores = this.registry.get('highScores') as Record<string, number> || {};
      const settings = this.registry.get('settings');

      // Unlock next level
      const newUnlockedLevels = Math.max(unlockedLevels, this.levelConfig.id + 1);
      this.registry.set('unlockedLevels', newUnlockedLevels);

      // Save high score (percentage of territories captured)
      const score = Math.floor(
        (this.territories.filter((t) => t.owner === 0).length / this.territories.length) * 100
      );
      const currentHighScore = highScores[this.levelConfig.id.toString()] || 0;
      if (score > currentHighScore) {
        highScores[this.levelConfig.id.toString()] = score;
      }
      this.registry.set('highScores', highScores);

      // Persist to localStorage
      const progress = {
        unlockedLevels: newUnlockedLevels,
        highScores,
        settings,
      };
      localStorage.setItem('stateio_progress', JSON.stringify(progress));
    } catch {
      console.warn('Could not save progress');
    }
  }

  private getGameStats(): { territoriesCapture: number; totalTerritories: number; timeElapsed: number } {
    return {
      territoriesCapture: this.territories.filter((t) => t.owner === 0).length,
      totalTerritories: this.territories.length,
      timeElapsed: this.time.now / 1000,
    };
  }

  private getGameState(): { playerTerritories: number; enemyTerritories: number; neutralTerritories: number } {
    return {
      playerTerritories: this.territories.filter((t) => t.owner === 0).length,
      enemyTerritories: this.territories.filter((t) => t.owner > 0).length,
      neutralTerritories: this.territories.filter((t) => t.owner === -1).length,
    };
  }

  private playSound(soundName: string): void {
    const settings = this.registry.get('settings') as { soundEnabled: boolean };
    if (!settings?.soundEnabled) return;

    try {
      const audioContext = this.registry.get('audioContext') as AudioContext;
      const audioBuffers = this.registry.get('audioBuffers') as Record<string, AudioBuffer>;
      const buffer = audioBuffers?.[soundName];

      if (audioContext && buffer) {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start();
      }
    } catch {
      // Ignore audio errors
    }
  }

  shutdown(): void {
    // Clean up
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.off('pointermove', this.onPointerMove, this);
    this.input.off('pointerup', this.onPointerUp, this);

    this.territories.forEach((t) => t.destroy());
    this.troops.forEach((t) => t.destroy());

    this.territories = [];
    this.troops = [];
    this.aiControllers = [];
  }
}
