import Phaser from 'phaser';
import { GAME_SETTINGS, PLAYER_COLORS } from '../config/GameConfig';
import { Territory } from './Territory';

export class Troop extends Phaser.GameObjects.Container {
  public owner: number;
  public troopCount: number;
  public sourceTerritory: Territory;
  public targetTerritory: Territory;

  private sprites: Phaser.GameObjects.Image[] = [];
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private arrived = false;

  constructor(
    scene: Phaser.Scene,
    source: Territory,
    target: Territory,
    count: number,
    owner: number
  ) {
    super(scene, source.x, source.y);

    this.sourceTerritory = source;
    this.targetTerritory = target;
    this.troopCount = count;
    this.owner = owner;

    this.createVisuals();
    this.createTrail();

    scene.add.existing(this);
  }

  private createVisuals(): void {
    const textureName = this.owner === 0 ? 'troop_player' : `troop_enemy${this.owner}`;

    // Create multiple dot sprites based on troop count (visual representation)
    const numDots = Math.min(10, Math.ceil(this.troopCount / 5));
    const spacing = 8;

    for (let i = 0; i < numDots; i++) {
      const offsetX = (Math.random() - 0.5) * spacing * 2;
      const offsetY = (Math.random() - 0.5) * spacing * 2;

      const sprite = this.scene.add.image(offsetX, offsetY, textureName);
      sprite.setScale(0.8 + Math.random() * 0.4);
      this.sprites.push(sprite);
      this.add(sprite);
    }

    // Count text above troops
    const countText = this.scene.add.text(0, -20, this.troopCount.toString(), {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.add(countText);
  }

  private createTrail(): void {
    const color = PLAYER_COLORS[this.owner]?.primary || 0xffffff;

    this.trail = this.scene.add.particles(0, 0, 'particle', {
      follow: this,
      scale: { start: 0.4, end: 0 },
      alpha: { start: 0.6, end: 0 },
      speed: 10,
      lifespan: 400,
      frequency: 30,
      tint: color,
      blendMode: Phaser.BlendModes.ADD,
    });
    this.trail.setDepth(-1);
  }

  public update(delta: number): void {
    if (this.arrived) return;

    // Move towards target
    const dx = this.targetTerritory.x - this.x;
    const dy = this.targetTerritory.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < this.targetTerritory.territorySize * 0.5) {
      // Arrived at target
      this.arrived = true;
      this.onArrival();
      return;
    }

    // Normalize and apply speed
    const speed = (GAME_SETTINGS.TROOP_SPEED * delta) / 1000;
    const vx = (dx / distance) * speed;
    const vy = (dy / distance) * speed;

    this.x += vx;
    this.y += vy;

    // Rotate towards target
    const angle = Math.atan2(dy, dx);
    this.setRotation(angle);

    // Animate sprites
    this.sprites.forEach((sprite, index) => {
      const wobble = Math.sin(Date.now() * 0.01 + index) * 2;
      sprite.y = wobble;
    });
  }

  private onArrival(): void {
    // Emit event for game scene to handle
    this.emit('arrived', this);

    // Visual effect
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 200,
      onComplete: () => {
        this.destroy();
      },
    });
  }

  public hasArrived(): boolean {
    return this.arrived;
  }

  public destroy(fromScene?: boolean): void {
    if (this.trail) {
      this.trail.stop();
      this.scene.time.delayedCall(500, () => {
        this.trail?.destroy();
      });
    }
    super.destroy(fromScene);
  }
}
