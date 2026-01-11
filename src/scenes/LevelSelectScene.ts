import Phaser from 'phaser';
import { COLORS, LEVELS, LevelConfig } from '../config/GameConfig';

export class LevelSelectScene extends Phaser.Scene {
  private levelButtons: Phaser.GameObjects.Container[] = [];
  private scrollY = 0;
  private maxScroll = 0;
  private isDragging = false;
  private startY = 0;
  private startScroll = 0;

  constructor() {
    super({ key: 'LevelSelectScene' });
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    this.createBackground();
    this.createHeader(width);
    this.createLevelGrid(width, height);
    this.setupScrolling(width, height);
  }

  private createBackground(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    const graphics = this.add.graphics();
    for (let i = 0; i < height; i++) {
      const ratio = i / height;
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x0a0a1a),
        Phaser.Display.Color.ValueToColor(0x1a1a3a),
        100,
        ratio * 100
      );
      graphics.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1);
      graphics.fillRect(0, i, width, 1);
    }
  }

  private createHeader(width: number): void {
    // Back button
    const backBtn = this.add.container(60, 50);
    const backBg = this.add.graphics();
    backBg.fillStyle(COLORS.UI.panel, 0.8);
    backBg.fillRoundedRect(-40, -25, 80, 50, 12);
    backBg.lineStyle(2, COLORS.UI.accent, 0.5);
    backBg.strokeRoundedRect(-40, -25, 80, 50, 12);

    const backText = this.add.text(0, 0, '< BACK', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    backBtn.add([backBg, backText]);
    backBtn.setSize(80, 50);
    backBtn.setInteractive({ useHandCursor: true });
    backBtn.setDepth(100);

    backBtn.on('pointerdown', () => {
      this.playClickSound();
      this.scene.start('MenuScene');
    });

    // Title
    this.add.text(width / 2, 50, 'SELECT LEVEL', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '36px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(100);

    // Header background
    const headerBg = this.add.graphics();
    headerBg.fillStyle(COLORS.UI.background, 0.9);
    headerBg.fillRect(0, 0, width, 100);
    headerBg.setDepth(99);
  }

  private createLevelGrid(width: number, height: number): void {
    const unlockedLevels = this.registry.get('unlockedLevels') as number || 1;
    const highScores = this.registry.get('highScores') as Record<string, number> || {};

    const columns = width > 600 ? 3 : 2;
    const buttonWidth = width > 600 ? 180 : 150;
    const buttonHeight = 120;
    const paddingX = (width - columns * buttonWidth) / (columns + 1);
    const paddingY = 30;
    const startY = 130;

    this.levelButtons = [];

    LEVELS.forEach((level, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);

      const x = paddingX + buttonWidth / 2 + col * (buttonWidth + paddingX);
      const y = startY + buttonHeight / 2 + row * (buttonHeight + paddingY);

      const isUnlocked = index + 1 <= unlockedLevels;
      const highScore = highScores[level.id.toString()];

      const button = this.createLevelButton(x, y, level, isUnlocked, highScore, buttonWidth, buttonHeight);
      this.levelButtons.push(button);
    });

    // Calculate max scroll
    const totalRows = Math.ceil(LEVELS.length / columns);
    const contentHeight = startY + totalRows * (buttonHeight + paddingY);
    this.maxScroll = Math.max(0, contentHeight - height + 50);
  }

  private createLevelButton(
    x: number,
    y: number,
    level: LevelConfig,
    isUnlocked: boolean,
    highScore: number | undefined,
    width: number,
    height: number
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // Background
    const bg = this.add.graphics();
    const bgColor = isUnlocked ? COLORS.UI.panel : 0x2a2a3a;
    bg.fillStyle(bgColor, 0.9);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 15);

    // Border color based on difficulty
    const borderColor = this.getDifficultyColor(level.difficulty);
    bg.lineStyle(3, isUnlocked ? borderColor : 0x444444, isUnlocked ? 1 : 0.5);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 15);

    container.add(bg);

    // Level number
    const levelNum = this.add.text(0, -height / 4, level.id.toString(), {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '36px',
      fontStyle: 'bold',
      color: isUnlocked ? '#ffffff' : '#666666',
    }).setOrigin(0.5);
    container.add(levelNum);

    // Level name
    const levelName = this.add.text(0, height / 8, level.name, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      color: isUnlocked ? '#aaaacc' : '#555555',
    }).setOrigin(0.5);
    container.add(levelName);

    // Difficulty indicator
    const difficultyText = this.add.text(0, height / 3, level.difficulty.toUpperCase(), {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: isUnlocked ? this.getDifficultyColorHex(level.difficulty) : '#555555',
    }).setOrigin(0.5);
    container.add(difficultyText);

    // Stars for completed levels
    if (highScore !== undefined && isUnlocked) {
      const stars = Math.min(3, Math.ceil(highScore / 33));
      for (let i = 0; i < 3; i++) {
        const starX = (i - 1) * 20;
        const starColor = i < stars ? '#ffaa00' : '#333344';
        const star = this.add.text(starX, -height / 2 + 15, '★', {
          fontFamily: 'Segoe UI, system-ui, sans-serif',
          fontSize: '16px',
          color: starColor,
        }).setOrigin(0.5);
        container.add(star);
      }
    }

    // Lock icon for locked levels
    if (!isUnlocked) {
      const lock = this.add.text(0, 0, '🔒', {
        fontSize: '24px',
      }).setOrigin(0.5).setAlpha(0.5);
      container.add(lock);
    }

    // Interactivity
    container.setSize(width, height);
    if (isUnlocked) {
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
        this.startLevel(level.id);
      });
    }

    return container;
  }

  private getDifficultyColor(difficulty: string): number {
    switch (difficulty) {
      case 'easy':
        return COLORS.UI.success;
      case 'medium':
        return COLORS.UI.accent;
      case 'hard':
        return COLORS.ENEMY_2.primary;
      case 'extreme':
        return COLORS.UI.warning;
      default:
        return COLORS.UI.accent;
    }
  }

  private getDifficultyColorHex(difficulty: string): string {
    switch (difficulty) {
      case 'easy':
        return '#00ff88';
      case 'medium':
        return '#00f5ff';
      case 'hard':
        return '#ffaa00';
      case 'extreme':
        return '#ff3366';
      default:
        return '#00f5ff';
    }
  }

  private setupScrolling(_width: number, _height: number): void {
    // Use global input events for scrolling (don't block button clicks)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.isDragging = true;
      this.startY = pointer.y;
      this.startScroll = this.scrollY;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isDragging) {
        const deltaY = pointer.y - this.startY;
        // Only scroll if moved more than 10 pixels (to allow clicks)
        if (Math.abs(deltaY) > 10) {
          this.scrollY = Phaser.Math.Clamp(this.startScroll - deltaY, 0, this.maxScroll);
          this.updateScrollPosition();
        }
      }
    });

    this.input.on('pointerup', () => {
      this.isDragging = false;
    });

    // Mouse wheel support
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      this.scrollY = Phaser.Math.Clamp(this.scrollY + deltaY * 0.5, 0, this.maxScroll);
      this.updateScrollPosition();
    });
  }

  private updateScrollPosition(): void {
    this.levelButtons.forEach((button, _index) => {
      const originalY = button.getData('originalY') || button.y;
      if (!button.getData('originalY')) {
        button.setData('originalY', button.y);
      }
      button.y = originalY - this.scrollY;

      // Hide buttons that are outside the visible area
      const visible = button.y > 80 && button.y < this.scale.height + 50;
      button.setVisible(visible);
    });
  }

  private startLevel(levelId: number): void {
    this.scene.start('GameScene', { levelId });
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
