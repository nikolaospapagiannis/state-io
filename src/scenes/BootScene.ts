import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Nothing to preload in boot scene
  }

  create(): void {
    // Set up game scale for different devices
    this.scale.on('resize', this.handleResize, this);

    // Check for saved progress
    this.loadProgress();

    // Move to preload scene
    this.scene.start('PreloadScene');
  }

  private handleResize(): void {
    // Handle window resize
    const width = this.scale.width;
    const height = this.scale.height;

    // Store dimensions in registry for other scenes
    this.registry.set('gameWidth', width);
    this.registry.set('gameHeight', height);
  }

  private loadProgress(): void {
    try {
      const saved = localStorage.getItem('stateio_progress');
      if (saved) {
        const progress = JSON.parse(saved);
        this.registry.set('unlockedLevels', progress.unlockedLevels || 1);
        this.registry.set('highScores', progress.highScores || {});
        this.registry.set('settings', progress.settings || {
          soundEnabled: true,
          musicEnabled: true,
          vibrationEnabled: true,
        });
      } else {
        // Default values
        this.registry.set('unlockedLevels', 1);
        this.registry.set('highScores', {});
        this.registry.set('settings', {
          soundEnabled: true,
          musicEnabled: true,
          vibrationEnabled: true,
        });
      }
    } catch {
      // Default values on error
      this.registry.set('unlockedLevels', 1);
      this.registry.set('highScores', {});
      this.registry.set('settings', {
        soundEnabled: true,
        musicEnabled: true,
        vibrationEnabled: true,
      });
    }
  }
}
