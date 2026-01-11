import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';

export type EmoteRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface EmoteOption {
  id: string;
  name: string;
  animation: string;
  duration: number;
  rarity: EmoteRarity;
  cooldown: number;
  cooldownRemaining?: number;
}

// Rarity colors
const RARITY_COLORS: Record<EmoteRarity, { primary: number; glow: number }> = {
  common: { primary: 0x9e9e9e, glow: 0x757575 },
  uncommon: { primary: 0x4caf50, glow: 0x388e3c },
  rare: { primary: 0x2196f3, glow: 0x1976d2 },
  epic: { primary: 0x9c27b0, glow: 0x7b1fa2 },
  legendary: { primary: 0xff9800, glow: 0xf57c00 },
};

export class EmoteWheel extends Phaser.GameObjects.Container {
  private background: Phaser.GameObjects.Graphics;
  private centerCircle: Phaser.GameObjects.Graphics;
  private emotes: EmoteOption[] = [];
  private emoteContainers: Phaser.GameObjects.Container[] = [];
  private selectedIndex = -1;
  private isVisible = false;
  private onSelect: ((emote: EmoteOption) => void) | null = null;
  private radius = 100;
  private centerRadius = 35;
  private cooldownTimers: Map<string, number> = new Map();

  // Default equipped emotes (4 slots)
  private defaultEmotes: EmoteOption[] = [
    { id: 'wave', name: 'Wave', animation: 'wave', duration: 1500, rarity: 'common', cooldown: 5000 },
    { id: 'thumbsup', name: 'Thumbs Up', animation: 'thumbsup', duration: 1200, rarity: 'common', cooldown: 5000 },
    { id: 'question', name: 'Question', animation: 'question', duration: 2000, rarity: 'common', cooldown: 3000 },
    { id: 'exclaim', name: 'Alert', animation: 'exclaim', duration: 2000, rarity: 'common', cooldown: 3000 },
  ];

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.emotes = [...this.defaultEmotes];

    // Create background
    this.background = scene.add.graphics();
    this.add(this.background);

    // Create center circle
    this.centerCircle = scene.add.graphics();
    this.add(this.centerCircle);

    // Setup
    this.createWheel();
    this.setupInput();

    // Initially hidden
    this.setVisible(false);
    this.setAlpha(0);
    this.setDepth(1000);

    scene.add.existing(this);
  }

  private createWheel(): void {
    // Clear existing
    this.background.clear();
    this.centerCircle.clear();
    this.emoteContainers.forEach(c => c.destroy());
    this.emoteContainers = [];

    const segmentAngle = (Math.PI * 2) / 4; // Always 4 slots

    // Draw 4 quadrants
    for (let i = 0; i < 4; i++) {
      const emote = this.emotes[i];
      const startAngle = i * segmentAngle - Math.PI / 2 - segmentAngle / 2;
      const endAngle = startAngle + segmentAngle;

      const rarityColor = emote ? RARITY_COLORS[emote.rarity] : RARITY_COLORS.common;
      const isOnCooldown = emote && this.isEmoteOnCooldown(emote.id);

      // Segment background
      const fillColor = isOnCooldown ? 0x333333 : COLORS.UI.panel;
      this.background.fillStyle(fillColor, 0.9);
      this.background.beginPath();
      this.background.moveTo(0, 0);
      this.background.arc(0, 0, this.radius, startAngle, endAngle, false);
      this.background.closePath();
      this.background.fill();

      // Rarity border
      this.background.lineStyle(3, rarityColor.primary, isOnCooldown ? 0.3 : 0.8);
      this.background.beginPath();
      this.background.arc(0, 0, this.radius - 2, startAngle + 0.05, endAngle - 0.05, false);
      this.background.stroke();

      // Segment divider
      this.background.lineStyle(2, COLORS.UI.accent, 0.3);
      this.background.beginPath();
      this.background.moveTo(0, 0);
      this.background.lineTo(Math.cos(startAngle) * this.radius, Math.sin(startAngle) * this.radius);
      this.background.stroke();

      if (emote) {
        // Create emote container
        const midAngle = startAngle + segmentAngle / 2;
        const emoteDist = this.radius * 0.6;
        const emoteX = Math.cos(midAngle) * emoteDist;
        const emoteY = Math.sin(midAngle) * emoteDist;

        const emoteContainer = this.scene.add.container(emoteX, emoteY);

        // Emote icon (using first letter as placeholder)
        const iconBg = this.scene.add.graphics();
        iconBg.fillStyle(rarityColor.primary, isOnCooldown ? 0.3 : 0.6);
        iconBg.fillCircle(0, 0, 22);

        const icon = this.scene.add.text(0, 0, this.getEmoteIcon(emote.animation), {
          fontFamily: 'Segoe UI, system-ui, sans-serif',
          fontSize: '20px',
          color: isOnCooldown ? '#666666' : '#ffffff',
        }).setOrigin(0.5);

        // Cooldown overlay
        if (isOnCooldown) {
          const cooldownRemaining = this.getCooldownRemaining(emote.id);
          const cooldownText = this.scene.add.text(0, 25, `${(cooldownRemaining / 1000).toFixed(1)}s`, {
            fontFamily: 'Segoe UI, system-ui, sans-serif',
            fontSize: '10px',
            color: '#ff6666',
          }).setOrigin(0.5);
          emoteContainer.add(cooldownText);
        }

        emoteContainer.add([iconBg, icon]);
        emoteContainer.setData('index', i);
        emoteContainer.setData('emote', emote);

        this.add(emoteContainer);
        this.emoteContainers.push(emoteContainer);
      }
    }

    // Center circle
    this.centerCircle.fillStyle(COLORS.UI.background, 0.95);
    this.centerCircle.fillCircle(0, 0, this.centerRadius);
    this.centerCircle.lineStyle(2, COLORS.UI.accent, 0.6);
    this.centerCircle.strokeCircle(0, 0, this.centerRadius);

    // Center text
    const centerText = this.scene.add.text(0, 0, 'X', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#888888',
    }).setOrigin(0.5);
    this.add(centerText);

    // Outer ring
    this.background.lineStyle(2, COLORS.UI.accent, 0.6);
    this.background.strokeCircle(0, 0, this.radius);
  }

  private getEmoteIcon(animation: string): string {
    const icons: Record<string, string> = {
      wave: '!',
      thumbsup: '+',
      thumbsdown: '-',
      clap: '*',
      laugh: '^',
      cry: '~',
      angry: '!',
      love: '<3',
      shock: 'O',
      question: '?',
      exclaim: '!',
      target: '@',
      shield: '#',
      confetti: '*',
      fireworks: '*',
      trophy: 'T',
      crown: 'C',
      dance: 'D',
      medal: 'M',
      star: '*',
      taunt_wave: '~',
      yawn: 'z',
      flex: 'F',
      shrug: '?',
      facepalm: 'X',
      dab: 'D',
    };
    return icons[animation] || animation.charAt(0).toUpperCase();
  }

  private setupInput(): void {
    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isVisible) return;

      const dx = pointer.x - this.x;
      const dy = pointer.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < this.centerRadius) {
        this.setSelectedIndex(-1);
      } else if (dist < this.radius) {
        let angle = Math.atan2(dy, dx) + Math.PI / 2;
        if (angle < 0) angle += Math.PI * 2;

        const segmentAngle = (Math.PI * 2) / 4;
        const index = Math.floor(angle / segmentAngle);
        this.setSelectedIndex(index % 4);
      } else {
        this.setSelectedIndex(-1);
      }
    });
  }

  private setSelectedIndex(index: number): void {
    if (this.selectedIndex === index) return;

    // Deselect previous
    if (this.selectedIndex >= 0 && this.selectedIndex < this.emoteContainers.length) {
      const prev = this.emoteContainers[this.selectedIndex];
      this.scene.tweens.add({
        targets: prev,
        scale: 1,
        duration: 80,
      });
    }

    this.selectedIndex = index;

    // Select new
    if (index >= 0 && index < this.emoteContainers.length) {
      const emote = this.emotes[index];
      if (emote && !this.isEmoteOnCooldown(emote.id)) {
        const curr = this.emoteContainers[index];
        this.scene.tweens.add({
          targets: curr,
          scale: 1.3,
          duration: 80,
        });
      }

      this.highlightSegment(index);
    } else {
      this.createWheel();
    }
  }

  private highlightSegment(highlightIndex: number): void {
    this.background.clear();

    const segmentAngle = (Math.PI * 2) / 4;

    for (let i = 0; i < 4; i++) {
      const emote = this.emotes[i];
      const startAngle = i * segmentAngle - Math.PI / 2 - segmentAngle / 2;
      const endAngle = startAngle + segmentAngle;

      const rarityColor = emote ? RARITY_COLORS[emote.rarity] : RARITY_COLORS.common;
      const isOnCooldown = emote && this.isEmoteOnCooldown(emote.id);
      const isHighlighted = i === highlightIndex && !isOnCooldown;

      const fillColor = isHighlighted ? rarityColor.primary : (isOnCooldown ? 0x333333 : COLORS.UI.panel);
      const alpha = isHighlighted ? 0.7 : 0.9;

      this.background.fillStyle(fillColor, alpha);
      this.background.beginPath();
      this.background.moveTo(0, 0);
      this.background.arc(0, 0, this.radius, startAngle, endAngle, false);
      this.background.closePath();
      this.background.fill();

      this.background.lineStyle(3, rarityColor.primary, isOnCooldown ? 0.3 : 0.8);
      this.background.beginPath();
      this.background.arc(0, 0, this.radius - 2, startAngle + 0.05, endAngle - 0.05, false);
      this.background.stroke();

      this.background.lineStyle(2, COLORS.UI.accent, 0.3);
      this.background.beginPath();
      this.background.moveTo(0, 0);
      this.background.lineTo(Math.cos(startAngle) * this.radius, Math.sin(startAngle) * this.radius);
      this.background.stroke();
    }

    this.background.lineStyle(2, COLORS.UI.accent, 0.6);
    this.background.strokeCircle(0, 0, this.radius);
  }

  public show(x: number, y: number, callback: (emote: EmoteOption) => void): void {
    this.setPosition(x, y);
    this.onSelect = callback;
    this.selectedIndex = -1;
    this.isVisible = true;
    this.setVisible(true);

    // Refresh cooldown display
    this.createWheel();

    // Clamp to screen
    const padding = this.radius + 20;
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    this.x = Phaser.Math.Clamp(this.x, padding, width - padding);
    this.y = Phaser.Math.Clamp(this.y, padding, height - padding);

    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      scale: { from: 0.5, to: 1 },
      duration: 120,
      ease: 'Back.easeOut',
    });

    this.scene.input.once('pointerup', () => {
      this.confirmSelection();
    });
  }

  public hide(): void {
    if (!this.isVisible) return;

    this.isVisible = false;

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scale: 0.5,
      duration: 80,
      onComplete: () => {
        this.setVisible(false);
      },
    });
  }

  private confirmSelection(): void {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.emotes.length) {
      const emote = this.emotes[this.selectedIndex];
      if (emote && !this.isEmoteOnCooldown(emote.id)) {
        // Start cooldown
        this.startCooldown(emote.id, emote.cooldown);

        if (this.onSelect) {
          this.onSelect(emote);
        }
      }
    }
    this.hide();
  }

  public setEmotes(emotes: EmoteOption[]): void {
    this.emotes = emotes.slice(0, 4);
    while (this.emotes.length < 4) {
      this.emotes.push(this.defaultEmotes[this.emotes.length]);
    }
    this.createWheel();
  }

  public getEmotes(): EmoteOption[] {
    return [...this.emotes];
  }

  public isOpen(): boolean {
    return this.isVisible;
  }

  // Cooldown management
  private isEmoteOnCooldown(emoteId: string): boolean {
    const cooldownEnd = this.cooldownTimers.get(emoteId);
    return cooldownEnd ? Date.now() < cooldownEnd : false;
  }

  private getCooldownRemaining(emoteId: string): number {
    const cooldownEnd = this.cooldownTimers.get(emoteId);
    return cooldownEnd ? Math.max(0, cooldownEnd - Date.now()) : 0;
  }

  private startCooldown(emoteId: string, duration: number): void {
    this.cooldownTimers.set(emoteId, Date.now() + duration);
  }

  public setCooldown(emoteId: string, remainingMs: number): void {
    this.cooldownTimers.set(emoteId, Date.now() + remainingMs);
    this.createWheel();
  }

  public clearCooldowns(): void {
    this.cooldownTimers.clear();
    this.createWheel();
  }
}
