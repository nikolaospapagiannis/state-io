import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';

export class MenuScene extends Phaser.Scene {
  private titleText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    // Background gradient effect
    this.createBackground();

    // Floating particles
    this.createParticles();

    // Title
    this.createTitle(width, height);

    // Menu buttons
    this.createMenuButtons(width, height);

    // Version text
    this.add.text(width - 10, height - 10, 'v1.0.0', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      color: '#666688',
    }).setOrigin(1, 1);

    // Play ambient sound
    this.playAmbientSound();
  }

  private createBackground(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    // Create gradient background
    const graphics = this.add.graphics();

    // Dark gradient
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

    // Add some decorative circles in background
    for (let i = 0; i < 8; i++) {
      const x = Phaser.Math.Between(50, width - 50);
      const y = Phaser.Math.Between(50, height - 50);
      const size = Phaser.Math.Between(30, 80);
      const alpha = Phaser.Math.FloatBetween(0.03, 0.08);

      const color = Phaser.Math.RND.pick([
        COLORS.PLAYER.primary,
        COLORS.ENEMY_1.primary,
        COLORS.ENEMY_2.primary,
      ]);

      graphics.fillStyle(color, alpha);
      graphics.fillCircle(x, y, size);
    }
  }

  private createParticles(): void {
    this.add.particles(0, 0, 'particle', {
      x: { min: 0, max: this.scale.width },
      y: { min: 0, max: this.scale.height },
      scale: { start: 0.2, end: 0 },
      alpha: { start: 0.6, end: 0 },
      speed: { min: 20, max: 50 },
      lifespan: 4000,
      frequency: 200,
      tint: [COLORS.PLAYER.primary, COLORS.ENEMY_1.primary, COLORS.ENEMY_2.primary],
      blendMode: Phaser.BlendModes.ADD,
    });
  }

  private createTitle(width: number, height: number): void {
    // Main title with glow effect
    const titleY = height * 0.2;

    // Glow text (behind main text)
    this.add.text(width / 2, titleY, 'STATE.IO', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '72px',
      fontStyle: 'bold',
      color: '#00f5ff',
    }).setOrigin(0.5).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD);

    // Main title
    this.titleText = this.add.text(width / 2, titleY, 'STATE.IO', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '72px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(width / 2, titleY + 60, 'CONQUER THE WORLD', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      color: '#8888aa',
    }).setOrigin(0.5);

    // Title animation
    this.tweens.add({
      targets: this.titleText,
      scaleX: 1.02,
      scaleY: 1.02,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private createMenuButtons(width: number, height: number): void {
    const buttonY = height * 0.45;
    const buttonSpacing = 70;

    // Campaign button
    this.createButton(
      width / 2,
      buttonY,
      'CAMPAIGN',
      () => this.scene.start('LevelSelectScene')
    );

    // Play Online button (highlighted)
    this.createButton(
      width / 2,
      buttonY + buttonSpacing,
      'PLAY ONLINE',
      () => this.goToMultiplayer(),
      true // highlighted
    );

    // Settings button
    this.createButton(
      width / 2,
      buttonY + buttonSpacing * 2,
      'SETTINGS',
      () => this.showSettings()
    );

    // How to Play button
    this.createButton(
      width / 2,
      buttonY + buttonSpacing * 3,
      'HOW TO PLAY',
      () => this.showTutorial()
    );
  }

  private async goToMultiplayer(): Promise<void> {
    // Check if already logged in
    const { networkService } = await import('../services/NetworkService');
    const isLoggedIn = await networkService.verifyToken();

    if (isLoggedIn) {
      networkService.connect();
      this.scene.start('LobbyScene');
    } else {
      this.scene.start('LoginScene');
    }
  }

  private createButton(x: number, y: number, text: string, callback: () => void, highlighted = false): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // Button background
    const bg = this.add.graphics();
    if (highlighted) {
      bg.fillStyle(0x005566, 0.9);
      bg.fillRoundedRect(-120, -30, 240, 60, 15);
      bg.lineStyle(3, 0x00f5ff, 1);
      bg.strokeRoundedRect(-120, -30, 240, 60, 15);
    } else {
      bg.fillStyle(COLORS.UI.panel, 0.8);
      bg.fillRoundedRect(-120, -30, 240, 60, 15);
      bg.lineStyle(2, COLORS.UI.accent, 0.8);
      bg.strokeRoundedRect(-120, -30, 240, 60, 15);
    }

    // Button text
    const btnText = this.add.text(0, 0, text, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    container.add([bg, btnText]);

    // Make interactive
    container.setSize(240, 60);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerover', () => {
      this.tweens.add({
        targets: container,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 100,
      });
      btnText.setColor('#00f5ff');
    });

    container.on('pointerout', () => {
      this.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 100,
      });
      btnText.setColor('#ffffff');
    });

    container.on('pointerdown', () => {
      this.tweens.add({
        targets: container,
        scaleX: 0.95,
        scaleY: 0.95,
        duration: 50,
        yoyo: true,
        onComplete: callback,
      });
      this.playClickSound();
    });

    return container;
  }

  private showSettings(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    // Create overlay
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    overlay.setInteractive();

    // Settings panel
    const panel = this.add.container(width / 2, height / 2);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.UI.panel, 0.95);
    bg.fillRoundedRect(-180, -200, 360, 400, 20);
    bg.lineStyle(2, COLORS.UI.accent, 0.8);
    bg.strokeRoundedRect(-180, -200, 360, 400, 20);
    panel.add(bg);

    // Title
    const title = this.add.text(0, -160, 'SETTINGS', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    panel.add(title);

    // Settings options
    const settings = this.registry.get('settings') as {
      soundEnabled: boolean;
      musicEnabled: boolean;
      vibrationEnabled: boolean;
    };

    this.createToggle(panel, 0, -80, 'Sound Effects', settings.soundEnabled, (value) => {
      settings.soundEnabled = value;
      this.saveSettings(settings);
    });

    this.createToggle(panel, 0, -20, 'Music', settings.musicEnabled, (value) => {
      settings.musicEnabled = value;
      this.saveSettings(settings);
    });

    this.createToggle(panel, 0, 40, 'Vibration', settings.vibrationEnabled, (value) => {
      settings.vibrationEnabled = value;
      this.saveSettings(settings);
    });

    // Close button
    const closeBtn = this.add.text(0, 150, 'CLOSE', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#00f5ff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    closeBtn.on('pointerdown', () => {
      this.playClickSound();
      overlay.destroy();
      panel.destroy();
    });

    panel.add(closeBtn);
  }

  private createToggle(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    initialValue: boolean,
    onChange: (value: boolean) => void
  ): void {
    const labelText = this.add.text(x - 80, y, label, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0, 0.5);

    const toggleBg = this.add.graphics();
    const toggleKnob = this.add.graphics();

    const drawToggle = (enabled: boolean) => {
      toggleBg.clear();
      toggleBg.fillStyle(enabled ? COLORS.UI.success : COLORS.UI.panel, 1);
      toggleBg.fillRoundedRect(x + 60, y - 15, 60, 30, 15);
      toggleBg.lineStyle(2, enabled ? COLORS.UI.success : 0x666666, 1);
      toggleBg.strokeRoundedRect(x + 60, y - 15, 60, 30, 15);

      toggleKnob.clear();
      toggleKnob.fillStyle(0xffffff, 1);
      toggleKnob.fillCircle(enabled ? x + 105 : x + 75, y, 12);
    };

    let value = initialValue;
    drawToggle(value);

    const hitArea = this.add.rectangle(x + 90, y, 60, 30);
    hitArea.setInteractive({ useHandCursor: true });

    hitArea.on('pointerdown', () => {
      value = !value;
      drawToggle(value);
      onChange(value);
      this.playClickSound();
    });

    container.add([labelText, toggleBg, toggleKnob, hitArea]);
  }

  private saveSettings(settings: { soundEnabled: boolean; musicEnabled: boolean; vibrationEnabled: boolean }): void {
    this.registry.set('settings', settings);
    try {
      const progress = {
        unlockedLevels: this.registry.get('unlockedLevels'),
        highScores: this.registry.get('highScores'),
        settings,
      };
      localStorage.setItem('stateio_progress', JSON.stringify(progress));
    } catch {
      console.warn('Could not save settings');
    }
  }

  private showTutorial(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    // Create overlay
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    overlay.setInteractive();

    // Tutorial panel
    const panel = this.add.container(width / 2, height / 2);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.UI.panel, 0.95);
    bg.fillRoundedRect(-200, -250, 400, 500, 20);
    bg.lineStyle(2, COLORS.UI.accent, 0.8);
    bg.strokeRoundedRect(-200, -250, 400, 500, 20);
    panel.add(bg);

    // Title
    const title = this.add.text(0, -210, 'HOW TO PLAY', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    panel.add(title);

    // Instructions
    const instructions = [
      '1. Tap your territory and drag\n   to another territory to attack',
      '2. Your territories generate\n   troops over time',
      '3. Capture all enemy territories\n   to win the level',
      '4. Gray territories are neutral\n   and generate no troops',
      '5. Numbers show troop count\n   in each territory',
      '6. Plan carefully - dont spread\n   your forces too thin!',
    ];

    instructions.forEach((text, index) => {
      const instruction = this.add.text(0, -130 + index * 55, text, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '15px',
        color: '#aaaacc',
        align: 'center',
      }).setOrigin(0.5);
      panel.add(instruction);
    });

    // Close button
    const closeBtn = this.add.text(0, 210, 'GOT IT!', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#00f5ff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    closeBtn.on('pointerdown', () => {
      this.playClickSound();
      overlay.destroy();
      panel.destroy();
    });

    panel.add(closeBtn);
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

  private playAmbientSound(): void {
    // Could add ambient music here
  }
}
