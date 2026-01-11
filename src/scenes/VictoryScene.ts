import Phaser from 'phaser';
import { COLORS, LEVELS } from '../config/GameConfig';

interface VictorySceneData {
  won: boolean;
  levelId: number;
  stats: {
    territoriesCapture: number;
    totalTerritories: number;
    timeElapsed: number;
  };
}

export class VictoryScene extends Phaser.Scene {
  private won = false;
  private levelId = 1;
  private stats!: VictorySceneData['stats'];

  constructor() {
    super({ key: 'VictoryScene' });
  }

  init(data: VictorySceneData): void {
    this.won = data.won;
    this.levelId = data.levelId;
    this.stats = data.stats;
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    this.createBackground();

    if (this.won) {
      this.createVictoryDisplay(width, height);
    } else {
      this.createDefeatDisplay(width, height);
    }

    this.createButtons(width, height);
  }

  private createBackground(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    const graphics = this.add.graphics();

    // Gradient background
    const baseColor = this.won ? 0x0a1a0a : 0x1a0a0a;
    const topColor = this.won ? 0x1a3a1a : 0x3a1a1a;

    for (let i = 0; i < height; i++) {
      const ratio = i / height;
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(baseColor),
        Phaser.Display.Color.ValueToColor(topColor),
        100,
        ratio * 100
      );
      graphics.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1);
      graphics.fillRect(0, i, width, 1);
    }

    // Celebratory or somber particles
    const particleColor = this.won ? COLORS.UI.success : COLORS.UI.warning;
    this.add.particles(0, 0, 'particle', {
      x: { min: 0, max: width },
      y: this.won ? -10 : height + 10,
      speedY: this.won ? { min: 50, max: 150 } : { min: -50, max: -150 },
      speedX: { min: -20, max: 20 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 3000,
      frequency: 50,
      tint: particleColor,
      blendMode: Phaser.BlendModes.ADD,
    });
  }

  private createVictoryDisplay(width: number, height: number): void {
    // Victory title with glow
    this.add.text(width / 2, height * 0.15, 'VICTORY!', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '64px',
      fontStyle: 'bold',
      color: '#00ff88',
    }).setOrigin(0.5).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD);

    const title = this.add.text(width / 2, height * 0.15, 'VICTORY!', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '64px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Animate title
    this.tweens.add({
      targets: title,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Stats panel
    this.createStatsPanel(width, height);

    // Stars rating
    this.createStarsRating(width, height * 0.55);
  }

  private createDefeatDisplay(width: number, height: number): void {
    // Defeat title
    const title = this.add.text(width / 2, height * 0.2, 'DEFEATED', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '56px',
      fontStyle: 'bold',
      color: '#ff3366',
    }).setOrigin(0.5);

    // Subtle shake animation
    this.tweens.add({
      targets: title,
      x: width / 2 + 3,
      duration: 100,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        title.x = width / 2;
      },
    });

    // Encouraging message
    this.add.text(width / 2, height * 0.35, 'Try again! You can do it!', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      color: '#8888aa',
    }).setOrigin(0.5);
  }

  private createStatsPanel(width: number, height: number): void {
    const panelY = height * 0.35;

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.UI.panel, 0.8);
    bg.fillRoundedRect(width / 2 - 150, panelY - 50, 300, 100, 15);

    // Level completed
    this.add.text(width / 2, panelY - 30, `Level ${this.levelId} Complete!`, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Territories captured
    this.add.text(width / 2, panelY + 5, `Territories: ${this.stats.territoriesCapture}/${this.stats.totalTerritories}`, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      color: '#aaaacc',
    }).setOrigin(0.5);

    // Time
    const minutes = Math.floor(this.stats.timeElapsed / 60);
    const seconds = Math.floor(this.stats.timeElapsed % 60);
    const timeStr = `Time: ${minutes}:${seconds.toString().padStart(2, '0')}`;

    this.add.text(width / 2, panelY + 30, timeStr, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      color: '#aaaacc',
    }).setOrigin(0.5);
  }

  private createStarsRating(width: number, y: number): void {
    // Calculate stars (1-3 based on performance)
    const percentage = this.stats.territoriesCapture / this.stats.totalTerritories;
    const stars = percentage >= 1 ? 3 : percentage >= 0.7 ? 2 : 1;

    for (let i = 0; i < 3; i++) {
      const x = width / 2 + (i - 1) * 60;
      const isFilled = i < stars;

      const star = this.add.text(x, y, '★', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '48px',
        color: isFilled ? '#ffaa00' : '#333344',
      }).setOrigin(0.5);

      if (isFilled) {
        // Animate filled stars
        this.tweens.add({
          targets: star,
          scaleX: 1.2,
          scaleY: 1.2,
          duration: 300,
          delay: i * 200,
          yoyo: true,
          ease: 'Back.out',
        });
      }
    }
  }

  private createButtons(width: number, height: number): void {
    const buttonY = height * 0.75;

    if (this.won) {
      // Check if there's a next level
      const hasNextLevel = this.levelId < LEVELS.length;

      if (hasNextLevel) {
        // Next Level button
        this.createButton(
          width / 2,
          buttonY,
          'NEXT LEVEL',
          COLORS.UI.success,
          () => {
            this.scene.start('GameScene', { levelId: this.levelId + 1 });
          }
        );

        // Replay button
        this.createButton(
          width / 2,
          buttonY + 70,
          'REPLAY',
          COLORS.UI.accent,
          () => {
            this.scene.start('GameScene', { levelId: this.levelId });
          }
        );
      } else {
        // All levels complete!
        this.add.text(width / 2, buttonY - 30, 'All Levels Complete!', {
          fontFamily: 'Segoe UI, system-ui, sans-serif',
          fontSize: '24px',
          fontStyle: 'bold',
          color: '#ffaa00',
        }).setOrigin(0.5);

        // Replay button
        this.createButton(
          width / 2,
          buttonY + 30,
          'REPLAY',
          COLORS.UI.accent,
          () => {
            this.scene.start('GameScene', { levelId: this.levelId });
          }
        );
      }
    } else {
      // Retry button
      this.createButton(
        width / 2,
        buttonY,
        'TRY AGAIN',
        COLORS.UI.warning,
        () => {
          this.scene.start('GameScene', { levelId: this.levelId });
        }
      );
    }

    // Menu button (always visible)
    this.createButton(
      width / 2,
      buttonY + (this.won ? 140 : 70),
      'MAIN MENU',
      COLORS.UI.panel,
      () => {
        this.scene.start('MenuScene');
      }
    );
  }

  private createButton(x: number, y: number, text: string, color: number, callback: () => void): void {
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(color, 0.9);
    bg.fillRoundedRect(-120, -30, 240, 60, 15);
    bg.lineStyle(2, 0xffffff, 0.3);
    bg.strokeRoundedRect(-120, -30, 240, 60, 15);

    const btnText = this.add.text(0, 0, text, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    container.add([bg, btnText]);
    container.setSize(240, 60);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerover', () => {
      this.tweens.add({
        targets: container,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 100,
      });
    });

    container.on('pointerout', () => {
      this.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 100,
      });
    });

    container.on('pointerdown', () => {
      this.playClickSound();
      this.tweens.add({
        targets: container,
        scaleX: 0.95,
        scaleY: 0.95,
        duration: 50,
        yoyo: true,
        onComplete: callback,
      });
    });
  }

  private playClickSound(): void {
    const settings = this.registry.get('settings') as { soundEnabled: boolean };
    if (!settings?.soundEnabled) return;

    try {
      const audioContext = this.registry.get('audioContext') as AudioContext;
      const audioBuffers = this.registry.get('audioBuffers') as Record<string, AudioBuffer>;
      const buffer = audioBuffers?.click;

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
}
