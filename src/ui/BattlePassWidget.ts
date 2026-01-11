/**
 * BattlePassWidget - Compact battle pass progress display for menus
 * Shows current level, XP progress bar, and unclaimed rewards indicator
 */

import Phaser from 'phaser';
import { battlePassService, BattlePassData, BattlePassTier } from '../services/BattlePassService';
import { analyticsService } from '../services/AnalyticsService';
import { COLORS } from '../config/GameConfig';

export interface BattlePassWidgetConfig {
  x: number;
  y: number;
  width?: number;
  compact?: boolean;
  onClick?: () => void;
}

export class BattlePassWidget extends Phaser.GameObjects.Container {
  private data: BattlePassData | null = null;
  private config: BattlePassWidgetConfig;
  private unsubscribe?: () => void;
  private isLoading: boolean = false;

  // Display elements
  private background!: Phaser.GameObjects.Graphics;
  private levelText!: Phaser.GameObjects.Text;
  private xpBar!: Phaser.GameObjects.Graphics;
  private xpText!: Phaser.GameObjects.Text;
  private tierBadge!: Phaser.GameObjects.Container;
  private claimIndicator?: Phaser.GameObjects.Container;
  private timeRemainingText!: Phaser.GameObjects.Text;
  private seasonNameText!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: BattlePassWidgetConfig) {
    super(scene, config.x, config.y);

    this.config = {
      width: 280,
      compact: false,
      ...config,
    };

    scene.add.existing(this);
    this.createWidget();
    this.subscribeToUpdates();
    this.fetchData();
  }

  private createWidget(): void {
    const width = this.config.width!;
    const height = this.config.compact ? 60 : 80;

    // Background panel
    this.background = this.scene.add.graphics();
    this.drawBackground(width, height);
    this.add(this.background);

    // Season name (top left)
    this.seasonNameText = this.scene.add.text(10, this.config.compact ? 8 : 10, 'Battle Pass', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: this.config.compact ? '12px' : '14px',
      fontStyle: 'bold',
      color: '#ffffff',
    });
    this.add(this.seasonNameText);

    // Time remaining (top right)
    this.timeRemainingText = this.scene.add.text(width - 10, this.config.compact ? 8 : 10, '', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '11px',
      color: '#ffaa00',
    }).setOrigin(1, 0);
    this.add(this.timeRemainingText);

    // Level display with tier badge
    this.createLevelDisplay(width, height);

    // XP Progress bar
    this.createXPBar(width, height);

    // Make interactive
    if (this.config.onClick) {
      this.setSize(width, height);
      this.setInteractive({ useHandCursor: true });

      this.on('pointerdown', () => {
        analyticsService.trackButtonClick('battlepass_widget', 'menu');
        this.config.onClick!();
      });

      this.on('pointerover', () => {
        this.scene.tweens.add({
          targets: this,
          scaleX: 1.02,
          scaleY: 1.02,
          duration: 100,
        });
        this.background.clear();
        this.drawBackground(width, height, true);
      });

      this.on('pointerout', () => {
        this.scene.tweens.add({
          targets: this,
          scaleX: 1,
          scaleY: 1,
          duration: 100,
        });
        this.background.clear();
        this.drawBackground(width, height, false);
      });
    }
  }

  private drawBackground(width: number, height: number, hover: boolean = false): void {
    this.background.fillStyle(hover ? 0x252545 : COLORS.UI.panel, 0.95);
    this.background.fillRoundedRect(0, 0, width, height, 12);
    this.background.lineStyle(2, COLORS.UI.accent, hover ? 0.8 : 0.5);
    this.background.strokeRoundedRect(0, 0, width, height, 12);
  }

  private createLevelDisplay(width: number, height: number): void {
    const levelY = this.config.compact ? 28 : 35;

    // Tier badge container
    this.tierBadge = this.scene.add.container(10, levelY);

    const badgeBg = this.scene.add.graphics();
    badgeBg.fillStyle(0x888888, 1);
    badgeBg.fillRoundedRect(0, -10, 50, 20, 8);
    this.tierBadge.add(badgeBg);

    const tierText = this.scene.add.text(25, 0, 'FREE', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    tierText.setName('tierText');
    this.tierBadge.add(tierText);

    this.add(this.tierBadge);

    // Level number
    this.levelText = this.scene.add.text(70, levelY, 'Lv. 1', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: this.config.compact ? '14px' : '16px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0, 0.5);
    this.add(this.levelText);
  }

  private createXPBar(width: number, height: number): void {
    const barY = this.config.compact ? 48 : 58;
    const barWidth = width - 20;
    const barHeight = this.config.compact ? 8 : 10;

    this.xpBar = this.scene.add.graphics();
    this.add(this.xpBar);

    // XP text
    this.xpText = this.scene.add.text(10, barY + barHeight / 2, '0/1000 XP', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '10px',
      color: '#aaaacc',
    }).setOrigin(0, 0.5);
    this.add(this.xpText);

    this.drawXPBar(barWidth, barHeight, barY, 0);
  }

  private drawXPBar(width: number, height: number, y: number, progress: number): void {
    this.xpBar.clear();

    // Background bar
    this.xpBar.fillStyle(0x333355, 1);
    this.xpBar.fillRoundedRect(10, y, width, height, height / 2);

    // Progress bar
    if (progress > 0) {
      const progressWidth = Math.max(height, width * Math.min(progress, 1));
      const gradient = this.scene.add.graphics();

      // Gradient effect using multiple fills
      this.xpBar.fillStyle(0x00f5ff, 1);
      this.xpBar.fillRoundedRect(10, y, progressWidth, height, height / 2);

      // Glow effect
      this.xpBar.lineStyle(2, 0x00f5ff, 0.5);
      this.xpBar.strokeRoundedRect(10, y, progressWidth, height, height / 2);
    }
  }

  private subscribeToUpdates(): void {
    this.unsubscribe = battlePassService.subscribe((data) => {
      this.data = data;
      this.updateDisplay();
      this.isLoading = false;
    });
  }

  private async fetchData(): Promise<void> {
    this.isLoading = true;
    const data = await battlePassService.fetchData();
    if (data) {
      this.data = data;
      this.updateDisplay();
    }
    this.isLoading = false;
  }

  private updateDisplay(): void {
    if (!this.data) return;

    // Update season name
    this.seasonNameText.setText(this.data.season.name || 'Battle Pass');

    // Update time remaining
    if (battlePassService.isEndingSoon()) {
      this.timeRemainingText.setColor('#ff3366');
    }
    this.timeRemainingText.setText(battlePassService.formatTimeRemaining());

    // Update level
    this.levelText.setText(`Lv. ${this.data.progress.currentLevel}`);

    // Update tier badge
    this.updateTierBadge(this.data.progress.tier);

    // Update XP bar
    const progress = battlePassService.getProgressPercentage() / 100;
    const barY = this.config.compact ? 48 : 58;
    const barHeight = this.config.compact ? 8 : 10;
    this.drawXPBar(this.config.width! - 20, barHeight, barY, progress);

    // Update XP text
    this.xpText.setText(`${this.data.progress.currentXP}/${this.data.season.xpPerLevel} XP`);

    // Show unclaimed rewards indicator
    this.updateClaimIndicator();
  }

  private updateTierBadge(tier: BattlePassTier): void {
    const tierText = this.tierBadge.getByName('tierText') as Phaser.GameObjects.Text;
    const badgeBg = this.tierBadge.getAt(0) as Phaser.GameObjects.Graphics;

    badgeBg.clear();

    let color: number;
    let text: string;

    switch (tier) {
      case 'premium':
        color = 0xffd700;
        text = 'PREMIUM';
        break;
      case 'diamond':
        color = 0x00f5ff;
        text = 'DIAMOND';
        break;
      default:
        color = 0x888888;
        text = 'FREE';
    }

    badgeBg.fillStyle(color, 1);
    badgeBg.fillRoundedRect(0, -10, 50, 20, 8);
    tierText.setText(text);
  }

  private updateClaimIndicator(): void {
    const unclaimedCount = battlePassService.getUnclaimedRewards().length;

    if (unclaimedCount > 0) {
      if (!this.claimIndicator) {
        this.claimIndicator = this.scene.add.container(this.config.width! - 25, 35);

        // Notification dot
        const dot = this.scene.add.graphics();
        dot.fillStyle(0xff3366, 1);
        dot.fillCircle(0, 0, 10);
        this.claimIndicator.add(dot);

        // Count text
        const countText = this.scene.add.text(0, 0, unclaimedCount.toString(), {
          fontFamily: 'Segoe UI, system-ui, sans-serif',
          fontSize: '10px',
          fontStyle: 'bold',
          color: '#ffffff',
        }).setOrigin(0.5);
        countText.setName('count');
        this.claimIndicator.add(countText);

        // Pulse animation
        this.scene.tweens.add({
          targets: this.claimIndicator,
          scaleX: 1.2,
          scaleY: 1.2,
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });

        this.add(this.claimIndicator);
      } else {
        const countText = this.claimIndicator.getByName('count') as Phaser.GameObjects.Text;
        countText.setText(unclaimedCount.toString());
        this.claimIndicator.setVisible(true);
      }
    } else if (this.claimIndicator) {
      this.claimIndicator.setVisible(false);
    }
  }

  /**
   * Manually refresh data
   */
  public async refresh(): Promise<void> {
    await this.fetchData();
  }

  /**
   * Get current level
   */
  public getCurrentLevel(): number {
    return this.data?.progress.currentLevel ?? 1;
  }

  /**
   * Get current tier
   */
  public getCurrentTier(): BattlePassTier {
    return this.data?.progress.tier ?? 'free';
  }

  /**
   * Check if player has premium
   */
  public isPremium(): boolean {
    return this.data?.progress.isPremium ?? false;
  }

  /**
   * Get unclaimed reward count
   */
  public getUnclaimedCount(): number {
    return battlePassService.getUnclaimedRewards().length;
  }

  /**
   * Clean up
   */
  public destroy(fromScene?: boolean): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    super.destroy(fromScene);
  }
}
