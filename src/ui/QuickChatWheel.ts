import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';

export interface QuickChatOption {
  id: string;
  text: string;
  icon?: string;
  category: 'greeting' | 'tactical' | 'reaction' | 'postgame';
}

export class QuickChatWheel extends Phaser.GameObjects.Container {
  private background: Phaser.GameObjects.Graphics;
  private centerCircle: Phaser.GameObjects.Graphics;
  private options: QuickChatOption[] = [];
  private optionContainers: Phaser.GameObjects.Container[] = [];
  private selectedIndex = -1;
  private isVisible = false;
  private onSelect: ((option: QuickChatOption) => void) | null = null;
  private radius = 120;
  private centerRadius = 40;

  // Default quick chat messages
  private defaultOptions: QuickChatOption[] = [
    { id: 'gl', text: 'Good luck!', icon: '!', category: 'greeting' },
    { id: 'attack', text: 'Attack!', icon: '!', category: 'tactical' },
    { id: 'defend', text: 'Defend!', icon: '!', category: 'tactical' },
    { id: 'help', text: 'Help!', icon: '?', category: 'tactical' },
    { id: 'thanks', text: 'Thanks!', icon: '+', category: 'reaction' },
    { id: 'sorry', text: 'Sorry!', icon: '-', category: 'reaction' },
    { id: 'nice', text: 'Nice!', icon: '*', category: 'reaction' },
    { id: 'gg', text: 'GG!', icon: 'G', category: 'postgame' },
  ];

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.options = [...this.defaultOptions];

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
    this.optionContainers.forEach(c => c.destroy());
    this.optionContainers = [];

    const segmentAngle = (Math.PI * 2) / this.options.length;

    // Draw background segments
    this.options.forEach((option, index) => {
      const startAngle = index * segmentAngle - Math.PI / 2 - segmentAngle / 2;
      const endAngle = startAngle + segmentAngle;

      // Segment background
      this.background.fillStyle(COLORS.UI.panel, 0.9);
      this.background.beginPath();
      this.background.moveTo(0, 0);
      this.background.arc(0, 0, this.radius, startAngle, endAngle, false);
      this.background.closePath();
      this.background.fill();

      // Segment border
      this.background.lineStyle(2, COLORS.UI.accent, 0.5);
      this.background.beginPath();
      this.background.moveTo(0, 0);
      this.background.arc(0, 0, this.radius, startAngle, endAngle, false);
      this.background.closePath();
      this.background.stroke();

      // Create option container
      const midAngle = startAngle + segmentAngle / 2;
      const optionDist = this.radius * 0.65;
      const optX = Math.cos(midAngle) * optionDist;
      const optY = Math.sin(midAngle) * optionDist;

      const optContainer = this.scene.add.container(optX, optY);

      // Option text
      const text = this.scene.add.text(0, 0, option.text, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
      }).setOrigin(0.5);

      // Category color indicator
      const categoryColors: Record<string, number> = {
        greeting: 0x00ff88,
        tactical: 0xff6666,
        reaction: 0xffaa00,
        postgame: 0x00f5ff,
      };

      const categoryDot = this.scene.add.graphics();
      categoryDot.fillStyle(categoryColors[option.category] || 0xffffff, 1);
      categoryDot.fillCircle(0, -15, 4);

      optContainer.add([categoryDot, text]);
      optContainer.setData('index', index);
      optContainer.setData('option', option);

      this.add(optContainer);
      this.optionContainers.push(optContainer);
    });

    // Center circle (cancel area)
    this.centerCircle.fillStyle(COLORS.UI.background, 0.95);
    this.centerCircle.fillCircle(0, 0, this.centerRadius);
    this.centerCircle.lineStyle(3, COLORS.UI.accent, 0.8);
    this.centerCircle.strokeCircle(0, 0, this.centerRadius);

    // X symbol in center
    const cancelText = this.scene.add.text(0, 0, 'X', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ff6666',
    }).setOrigin(0.5);
    this.add(cancelText);

    // Outer ring
    this.background.lineStyle(3, COLORS.UI.accent, 0.8);
    this.background.strokeCircle(0, 0, this.radius);
  }

  private setupInput(): void {
    // Track pointer movement
    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isVisible) return;

      const dx = pointer.x - this.x;
      const dy = pointer.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < this.centerRadius) {
        // In center (cancel)
        this.setSelectedIndex(-1);
      } else if (dist < this.radius) {
        // In wheel area
        let angle = Math.atan2(dy, dx) + Math.PI / 2;
        if (angle < 0) angle += Math.PI * 2;

        const segmentAngle = (Math.PI * 2) / this.options.length;
        const index = Math.floor(angle / segmentAngle);
        this.setSelectedIndex(index % this.options.length);
      } else {
        this.setSelectedIndex(-1);
      }
    });
  }

  private setSelectedIndex(index: number): void {
    if (this.selectedIndex === index) return;

    // Deselect previous
    if (this.selectedIndex >= 0 && this.selectedIndex < this.optionContainers.length) {
      const prev = this.optionContainers[this.selectedIndex];
      this.scene.tweens.add({
        targets: prev,
        scale: 1,
        duration: 100,
      });
    }

    this.selectedIndex = index;

    // Select new
    if (index >= 0 && index < this.optionContainers.length) {
      const curr = this.optionContainers[index];
      this.scene.tweens.add({
        targets: curr,
        scale: 1.2,
        duration: 100,
      });

      // Redraw with highlight
      this.highlightSegment(index);
    } else {
      this.createWheel(); // Reset highlight
    }
  }

  private highlightSegment(index: number): void {
    this.background.clear();

    const segmentAngle = (Math.PI * 2) / this.options.length;

    this.options.forEach((option, i) => {
      const startAngle = i * segmentAngle - Math.PI / 2 - segmentAngle / 2;
      const endAngle = startAngle + segmentAngle;

      const isHighlighted = i === index;
      const fillColor = isHighlighted ? COLORS.UI.accent : COLORS.UI.panel;
      const alpha = isHighlighted ? 0.8 : 0.9;

      this.background.fillStyle(fillColor, alpha);
      this.background.beginPath();
      this.background.moveTo(0, 0);
      this.background.arc(0, 0, this.radius, startAngle, endAngle, false);
      this.background.closePath();
      this.background.fill();

      this.background.lineStyle(2, COLORS.UI.accent, 0.5);
      this.background.beginPath();
      this.background.moveTo(0, 0);
      this.background.arc(0, 0, this.radius, startAngle, endAngle, false);
      this.background.closePath();
      this.background.stroke();
    });

    // Outer ring
    this.background.lineStyle(3, COLORS.UI.accent, 0.8);
    this.background.strokeCircle(0, 0, this.radius);
  }

  public show(x: number, y: number, callback: (option: QuickChatOption) => void): void {
    this.setPosition(x, y);
    this.onSelect = callback;
    this.selectedIndex = -1;
    this.isVisible = true;
    this.setVisible(true);

    // Clamp to screen bounds
    const padding = this.radius + 20;
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    this.x = Phaser.Math.Clamp(this.x, padding, width - padding);
    this.y = Phaser.Math.Clamp(this.y, padding, height - padding);

    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      scale: { from: 0.5, to: 1 },
      duration: 150,
      ease: 'Back.easeOut',
    });

    // Listen for release
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
      duration: 100,
      onComplete: () => {
        this.setVisible(false);
      },
    });
  }

  private confirmSelection(): void {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.options.length) {
      const option = this.options[this.selectedIndex];
      if (this.onSelect) {
        this.onSelect(option);
      }
    }
    this.hide();
  }

  public setOptions(options: QuickChatOption[]): void {
    this.options = options.slice(0, 8); // Max 8 options
    this.createWheel();
  }

  public getOptions(): QuickChatOption[] {
    return [...this.options];
  }

  public isOpen(): boolean {
    return this.isVisible;
  }
}
