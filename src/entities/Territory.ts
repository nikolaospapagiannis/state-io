import Phaser from 'phaser';
import { COLORS, GAME_SETTINGS, PLAYER_COLORS } from '../config/GameConfig';

export interface TerritoryData {
  id: number;
  x: number;
  y: number;
  size: number;
  troops: number;
  owner: number; // -1 = neutral, 0 = player, 1+ = enemy
}

export class Territory extends Phaser.GameObjects.Container {
  public id: number;
  public troops: number;
  public owner: number;
  public territorySize: number;

  private background!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Image;
  private troopText!: Phaser.GameObjects.Text;
  private pulseTime = 0;
  private isSelected = false;
  private troopGenerationTimer = 0;
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, data: TerritoryData) {
    super(scene, data.x, data.y);

    this.id = data.id;
    this.troops = data.troops;
    this.owner = data.owner;
    this.territorySize = data.size;

    this.createVisuals();
    this.updateOwnerVisuals();

    scene.add.existing(this);
  }

  private createVisuals(): void {
    // Glow effect (behind main territory)
    this.glow = this.scene.add.image(0, 0, 'glow_neutral');
    this.glow.setScale(this.territorySize / 100 * 1.3);
    this.glow.setAlpha(0.5);
    this.add(this.glow);

    // Main territory circle
    this.background = this.scene.add.image(0, 0, 'territory_neutral');
    this.background.setScale(this.territorySize / 100);
    this.add(this.background);

    // Troop count text
    this.troopText = this.scene.add.text(0, 0, this.troops.toString(), {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.add(this.troopText);

    // Set up interactivity
    this.setSize(this.territorySize * 2, this.territorySize * 2);
    this.setInteractive({ useHandCursor: true });

    // Create particle emitter for this territory
    this.createParticles();
  }

  private createParticles(): void {
    const particleConfig = {
      speed: { min: 10, max: 30 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 1000,
      frequency: -1, // Manual emission only
      blendMode: Phaser.BlendModes.ADD,
    };

    this.particles = this.scene.add.particles(this.x, this.y, 'particle', particleConfig);
    this.particles.setDepth(-1);
  }

  public updateOwnerVisuals(): void {
    const textureSuffix = this.getTextureSuffix();
    this.background.setTexture(`territory_${textureSuffix}`);
    this.glow.setTexture(`glow_${textureSuffix}`);

    // Update text color based on owner
    const color = this.owner === -1 ? COLORS.NEUTRAL.text : PLAYER_COLORS[this.owner]?.text || '#ffffff';
    this.troopText.setColor(color);
  }

  private getTextureSuffix(): string {
    if (this.owner === -1) return 'neutral';
    if (this.owner === 0) return 'player';
    return `enemy${this.owner}`;
  }

  public update(delta: number): void {
    // Pulse animation
    this.pulseTime += delta * GAME_SETTINGS.TERRITORY_PULSE_SPEED;
    const pulse = 1 + Math.sin(this.pulseTime) * 0.03;
    this.background.setScale((this.territorySize / 100) * pulse);

    // Selection glow
    if (this.isSelected) {
      this.glow.setAlpha(0.7 + Math.sin(this.pulseTime * 3) * 0.2);
    } else {
      this.glow.setAlpha(0.4);
    }

    // Troop generation for owned territories (not neutral)
    if (this.owner !== -1) {
      this.troopGenerationTimer += delta;
      if (this.troopGenerationTimer >= GAME_SETTINGS.TROOP_GENERATION_INTERVAL) {
        this.troopGenerationTimer = 0;
        this.addTroops(GAME_SETTINGS.TROOP_GENERATION_RATE);
      }
    }

    // Update troop text
    this.troopText.setText(Math.floor(this.troops).toString());
  }

  public addTroops(amount: number): void {
    this.troops += amount;

    // Emit particle on troop addition
    if (amount > 0 && this.particles) {
      const color = this.owner === -1 ? COLORS.NEUTRAL.primary : PLAYER_COLORS[this.owner]?.primary || 0xffffff;
      this.particles.setPosition(this.x, this.y);
      this.particles.setParticleTint(color);
      this.particles.emitParticle(3);
    }
  }

  public removeTroops(amount: number): number {
    const removed = Math.min(this.troops - 1, amount);
    this.troops -= removed;
    return removed;
  }

  public setSelected(selected: boolean): void {
    this.isSelected = selected;

    if (selected) {
      this.scene.tweens.add({
        targets: this,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: 100,
        ease: 'Back.out',
      });
    } else {
      this.scene.tweens.add({
        targets: this,
        scaleX: 1,
        scaleY: 1,
        duration: 100,
        ease: 'Power2',
      });
    }
  }

  public setOwner(newOwner: number): void {
    const previousOwner = this.owner;
    this.owner = newOwner;
    this.updateOwnerVisuals();

    // Visual feedback for capture
    if (previousOwner !== newOwner) {
      this.scene.tweens.add({
        targets: this,
        scaleX: 1.3,
        scaleY: 1.3,
        duration: 150,
        yoyo: true,
        ease: 'Bounce.out',
      });

      // Emit capture particles
      if (this.particles) {
        const color = newOwner === -1 ? COLORS.NEUTRAL.primary : PLAYER_COLORS[newOwner]?.primary || 0xffffff;
        this.particles.setPosition(this.x, this.y);
        this.particles.setParticleTint(color);
        this.particles.emitParticle(15);
      }
    }
  }

  public getColor(): number {
    if (this.owner === -1) return COLORS.NEUTRAL.primary;
    return PLAYER_COLORS[this.owner]?.primary || 0xffffff;
  }

  public destroy(fromScene?: boolean): void {
    if (this.particles) {
      this.particles.destroy();
    }
    super.destroy(fromScene);
  }
}
