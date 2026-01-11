import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';

export class PreloadScene extends Phaser.Scene {
  private loadingBar!: Phaser.GameObjects.Graphics;
  private progressBox!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload(): void {
    this.createLoadingUI();
    this.generateAssets();
    this.createAudioAssets();
  }

  private createLoadingUI(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const centerX = width / 2;
    const centerY = height / 2;

    // Progress box background
    this.progressBox = this.add.graphics();
    this.progressBox.fillStyle(0x1a1a3a, 0.8);
    this.progressBox.fillRoundedRect(centerX - 160, centerY - 15, 320, 30, 15);

    // Loading bar
    this.loadingBar = this.add.graphics();

    // Update HTML loading bar
    this.load.on('progress', (value: number) => {
      this.loadingBar.clear();
      this.loadingBar.fillStyle(COLORS.PLAYER.primary, 1);
      this.loadingBar.fillRoundedRect(centerX - 155, centerY - 10, 310 * value, 20, 10);

      // Update HTML loading bar
      const htmlBar = document.getElementById('loading-bar');
      const htmlText = document.getElementById('loading-text');
      if (htmlBar) {
        htmlBar.style.width = `${value * 100}%`;
      }
      if (htmlText) {
        htmlText.textContent = `Loading... ${Math.floor(value * 100)}%`;
      }
    });

    this.load.on('complete', () => {
      // Hide HTML loading screen
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.classList.add('hidden');
        setTimeout(() => {
          loadingScreen.style.display = 'none';
        }, 500);
      }
    });
  }

  private generateAssets(): void {
    // Generate territory graphics
    this.generateTerritoryTextures();

    // Generate particle textures
    this.generateParticleTextures();

    // Generate troop textures
    this.generateTroopTextures();

    // Generate UI textures
    this.generateUITextures();
  }

  private generateTerritoryTextures(): void {
    const colors = [
      { name: 'player', color: COLORS.PLAYER.primary },
      { name: 'enemy1', color: COLORS.ENEMY_1.primary },
      { name: 'enemy2', color: COLORS.ENEMY_2.primary },
      { name: 'enemy3', color: COLORS.ENEMY_3.primary },
      { name: 'enemy4', color: COLORS.ENEMY_4.primary },
      { name: 'neutral', color: COLORS.NEUTRAL.primary },
    ];

    colors.forEach(({ name, color }) => {
      // Main territory circle
      const size = 200;
      const graphics = this.add.graphics();

      // Outer glow
      graphics.fillStyle(color, 0.2);
      graphics.fillCircle(size / 2, size / 2, size / 2);

      // Inner fill
      graphics.fillStyle(color, 0.8);
      graphics.fillCircle(size / 2, size / 2, size / 2 - 10);

      // Border
      graphics.lineStyle(4, color, 1);
      graphics.strokeCircle(size / 2, size / 2, size / 2 - 5);

      // Inner highlight
      graphics.fillStyle(0xffffff, 0.2);
      graphics.fillCircle(size / 2 - 20, size / 2 - 20, size / 6);

      graphics.generateTexture(`territory_${name}`, size, size);
      graphics.destroy();

      // Glow effect texture
      const glowGraphics = this.add.graphics();
      glowGraphics.fillStyle(color, 0.3);
      glowGraphics.fillCircle(size / 2, size / 2, size / 2);
      glowGraphics.fillStyle(color, 0.1);
      glowGraphics.fillCircle(size / 2, size / 2, size / 2 + 20);
      glowGraphics.generateTexture(`glow_${name}`, size + 40, size + 40);
      glowGraphics.destroy();
    });
  }

  private generateParticleTextures(): void {
    // Small circular particle
    const particleSize = 16;
    const graphics = this.add.graphics();

    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(particleSize / 2, particleSize / 2, particleSize / 2);
    graphics.generateTexture('particle', particleSize, particleSize);
    graphics.destroy();

    // Star particle
    const starGraphics = this.add.graphics();
    starGraphics.fillStyle(0xffffff, 1);
    this.drawStar(starGraphics, 12, 12, 5, 12, 6);
    starGraphics.generateTexture('star_particle', 24, 24);
    starGraphics.destroy();

    // Glow particle
    const glowParticle = this.add.graphics();
    for (let i = 8; i >= 1; i--) {
      glowParticle.fillStyle(0xffffff, i / 16);
      glowParticle.fillCircle(16, 16, i * 2);
    }
    glowParticle.generateTexture('glow_particle', 32, 32);
    glowParticle.destroy();
  }

  private drawStar(
    graphics: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    spikes: number,
    outerRadius: number,
    innerRadius: number
  ): void {
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;

    graphics.beginPath();
    graphics.moveTo(cx, cy - outerRadius);

    for (let i = 0; i < spikes; i++) {
      let x = cx + Math.cos(rot) * outerRadius;
      let y = cy + Math.sin(rot) * outerRadius;
      graphics.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      graphics.lineTo(x, y);
      rot += step;
    }

    graphics.lineTo(cx, cy - outerRadius);
    graphics.closePath();
    graphics.fillPath();
  }

  private generateTroopTextures(): void {
    const colors = [
      { name: 'player', color: COLORS.PLAYER.primary },
      { name: 'enemy1', color: COLORS.ENEMY_1.primary },
      { name: 'enemy2', color: COLORS.ENEMY_2.primary },
      { name: 'enemy3', color: COLORS.ENEMY_3.primary },
      { name: 'enemy4', color: COLORS.ENEMY_4.primary },
    ];

    colors.forEach(({ name, color }) => {
      const size = 20;
      const graphics = this.add.graphics();

      // Troop dot with glow
      graphics.fillStyle(color, 0.4);
      graphics.fillCircle(size / 2, size / 2, size / 2);

      graphics.fillStyle(color, 1);
      graphics.fillCircle(size / 2, size / 2, size / 3);

      graphics.fillStyle(0xffffff, 0.5);
      graphics.fillCircle(size / 2 - 2, size / 2 - 2, size / 8);

      graphics.generateTexture(`troop_${name}`, size, size);
      graphics.destroy();
    });
  }

  private generateUITextures(): void {
    // Button texture
    const buttonWidth = 200;
    const buttonHeight = 60;
    const btnGraphics = this.add.graphics();

    btnGraphics.fillStyle(COLORS.UI.panel, 1);
    btnGraphics.fillRoundedRect(0, 0, buttonWidth, buttonHeight, 15);
    btnGraphics.lineStyle(3, COLORS.UI.accent, 1);
    btnGraphics.strokeRoundedRect(0, 0, buttonWidth, buttonHeight, 15);

    btnGraphics.generateTexture('button', buttonWidth, buttonHeight);
    btnGraphics.destroy();

    // Panel texture
    const panelGraphics = this.add.graphics();
    panelGraphics.fillStyle(COLORS.UI.panel, 0.9);
    panelGraphics.fillRoundedRect(0, 0, 300, 400, 20);
    panelGraphics.lineStyle(2, COLORS.UI.accent, 0.5);
    panelGraphics.strokeRoundedRect(0, 0, 300, 400, 20);
    panelGraphics.generateTexture('panel', 300, 400);
    panelGraphics.destroy();

    // Arrow for troop movement
    const arrowGraphics = this.add.graphics();
    arrowGraphics.fillStyle(0xffffff, 1);
    arrowGraphics.fillTriangle(30, 0, 30, 20, 0, 10);
    arrowGraphics.generateTexture('arrow', 30, 20);
    arrowGraphics.destroy();
  }

  private createAudioAssets(): void {
    // Generate simple audio using Web Audio API
    // We'll create placeholder sound data that can be replaced with real audio files

    // Create audio context for generating sounds
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    // Helper to create a simple beep sound
    const createBeep = (frequency: number, duration: number, type: OscillatorType = 'sine'): AudioBuffer => {
      const sampleRate = audioContext.sampleRate;
      const length = sampleRate * duration;
      const buffer = audioContext.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const envelope = Math.exp(-3 * t / duration);

        let sample = 0;
        switch (type) {
          case 'sine':
            sample = Math.sin(2 * Math.PI * frequency * t);
            break;
          case 'square':
            sample = Math.sign(Math.sin(2 * Math.PI * frequency * t));
            break;
          case 'sawtooth':
            sample = 2 * (t * frequency - Math.floor(0.5 + t * frequency));
            break;
          case 'triangle':
            sample = Math.abs(4 * (t * frequency - Math.floor(t * frequency + 0.5))) - 1;
            break;
        }

        data[i] = sample * envelope * 0.3;
      }

      return buffer;
    };

    // Create sound buffers
    const sounds: Record<string, AudioBuffer> = {
      click: createBeep(800, 0.1, 'sine'),
      capture: createBeep(600, 0.3, 'triangle'),
      attack: createBeep(400, 0.2, 'sawtooth'),
      victory: createBeep(1000, 0.5, 'sine'),
      defeat: createBeep(200, 0.8, 'sine'),
      spawn: createBeep(1200, 0.1, 'sine'),
    };

    // Store audio data in registry for later use
    this.registry.set('audioContext', audioContext);
    this.registry.set('audioBuffers', sounds);
  }

  create(): void {
    // Clean up loading graphics
    this.loadingBar.destroy();
    this.progressBox.destroy();

    // Add a small delay for visual polish
    this.time.delayedCall(200, () => {
      this.scene.start('MenuScene');
    });
  }
}
