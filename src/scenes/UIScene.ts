import Phaser from 'phaser';
import { COLORS, LevelConfig } from '../config/GameConfig';

interface UISceneData {
  levelConfig: LevelConfig;
}

export class UIScene extends Phaser.Scene {
  private levelConfig!: LevelConfig;
  private playerTerritoryBar!: Phaser.GameObjects.Graphics;
  private enemyTerritoryBar!: Phaser.GameObjects.Graphics;
  private territoryText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'UIScene' });
  }

  init(data: UISceneData): void {
    this.levelConfig = data.levelConfig;
  }

  create(): void {
    const width = this.scale.width;

    this.createHeader(width);
    this.createTerritoryBar(width);

    // Listen to game scene events
    const gameScene = this.scene.get('GameScene');
    gameScene.events.on('gameStateUpdate', this.updateUI, this);
  }

  private createHeader(width: number): void {
    // Header background
    const header = this.add.graphics();
    header.fillStyle(COLORS.UI.background, 0.95);
    header.fillRect(0, 0, width, 80);
    header.lineStyle(2, COLORS.UI.accent, 0.3);
    header.lineBetween(0, 80, width, 80);

    // Level info
    this.add.text(20, 20, `Level ${this.levelConfig.id}`, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ffffff',
    });

    this.add.text(20, 50, this.levelConfig.name, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      color: '#8888aa',
    });

    // Pause button
    const pauseBtn = this.add.container(width - 50, 40);
    const pauseBg = this.add.graphics();
    pauseBg.fillStyle(COLORS.UI.panel, 0.8);
    pauseBg.fillRoundedRect(-25, -25, 50, 50, 10);
    pauseBg.lineStyle(2, COLORS.UI.accent, 0.5);
    pauseBg.strokeRoundedRect(-25, -25, 50, 50, 10);

    const pauseIcon = this.add.text(0, 0, '⏸', {
      fontSize: '24px',
    }).setOrigin(0.5);

    pauseBtn.add([pauseBg, pauseIcon]);
    pauseBtn.setSize(50, 50);
    pauseBtn.setInteractive({ useHandCursor: true });

    pauseBtn.on('pointerdown', () => {
      this.showPauseMenu();
    });
  }

  private createTerritoryBar(width: number): void {
    const barY = 50;
    const barWidth = 200;
    const barHeight = 20;
    const barX = (width - barWidth) / 2;

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x333344, 0.8);
    bg.fillRoundedRect(barX - 5, barY - 5, barWidth + 10, barHeight + 10, 5);

    // Player bar (left side, cyan)
    this.playerTerritoryBar = this.add.graphics();

    // Enemy bar (right side, red)
    this.enemyTerritoryBar = this.add.graphics();

    // Territory text
    this.territoryText = this.add.text(width / 2, barY + barHeight / 2, '', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Initial update
    this.updateTerritoryBar(1, 1, 1);
  }

  private updateTerritoryBar(playerCount: number, enemyCount: number, neutralCount: number): void {
    const width = this.scale.width;
    const barY = 50;
    const barWidth = 200;
    const barHeight = 20;
    const barX = (width - barWidth) / 2;

    const total = playerCount + enemyCount + neutralCount;
    const playerWidth = (playerCount / total) * barWidth;
    const enemyWidth = (enemyCount / total) * barWidth;

    // Clear and redraw
    this.playerTerritoryBar.clear();
    this.playerTerritoryBar.fillStyle(COLORS.PLAYER.primary, 1);
    this.playerTerritoryBar.fillRoundedRect(barX, barY, playerWidth, barHeight, 3);

    this.enemyTerritoryBar.clear();
    this.enemyTerritoryBar.fillStyle(COLORS.ENEMY_1.primary, 1);
    this.enemyTerritoryBar.fillRoundedRect(barX + barWidth - enemyWidth, barY, enemyWidth, barHeight, 3);

    // Update text
    this.territoryText.setText(`${playerCount} vs ${enemyCount}`);
  }

  private updateUI(state: { playerTerritories: number; enemyTerritories: number; neutralTerritories: number }): void {
    this.updateTerritoryBar(
      state.playerTerritories,
      state.enemyTerritories,
      state.neutralTerritories
    );
  }

  private showPauseMenu(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    // Pause game scene
    this.scene.pause('GameScene');

    // Create overlay
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    overlay.setInteractive();

    // Pause menu panel
    const panel = this.add.container(width / 2, height / 2);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.UI.panel, 0.95);
    bg.fillRoundedRect(-150, -180, 300, 360, 20);
    bg.lineStyle(2, COLORS.UI.accent, 0.8);
    bg.strokeRoundedRect(-150, -180, 300, 360, 20);
    panel.add(bg);

    // Title
    const title = this.add.text(0, -140, 'PAUSED', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    panel.add(title);

    // Resume button
    this.createPauseButton(panel, 0, -50, 'RESUME', () => {
      overlay.destroy();
      panel.destroy();
      this.scene.resume('GameScene');
    });

    // Restart button
    this.createPauseButton(panel, 0, 30, 'RESTART', () => {
      overlay.destroy();
      panel.destroy();
      this.scene.stop('GameScene');
      this.scene.stop('UIScene');
      this.scene.start('GameScene', { levelId: this.levelConfig.id });
    });

    // Menu button
    this.createPauseButton(panel, 0, 110, 'MAIN MENU', () => {
      overlay.destroy();
      panel.destroy();
      this.scene.stop('GameScene');
      this.scene.stop('UIScene');
      this.scene.start('MenuScene');
    });
  }

  private createPauseButton(container: Phaser.GameObjects.Container, x: number, y: number, text: string, callback: () => void): void {
    const btnBg = this.add.graphics();
    btnBg.fillStyle(COLORS.UI.panel, 0.8);
    btnBg.fillRoundedRect(x - 100, y - 25, 200, 50, 12);
    btnBg.lineStyle(2, COLORS.UI.accent, 0.8);
    btnBg.strokeRoundedRect(x - 100, y - 25, 200, 50, 12);

    const btnText = this.add.text(x, y, text, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    const hitArea = this.add.rectangle(x, y, 200, 50);
    hitArea.setInteractive({ useHandCursor: true });

    hitArea.on('pointerover', () => {
      btnText.setColor('#00f5ff');
    });

    hitArea.on('pointerout', () => {
      btnText.setColor('#ffffff');
    });

    hitArea.on('pointerdown', () => {
      this.playClickSound();
      callback();
    });

    container.add([btnBg, btnText, hitArea]);
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

  shutdown(): void {
    // Clean up event listeners
    const gameScene = this.scene.get('GameScene');
    if (gameScene) {
      gameScene.events.off('gameStateUpdate', this.updateUI, this);
    }
  }
}
