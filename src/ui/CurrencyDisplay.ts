/**
 * CurrencyDisplay - Reusable UI component for displaying player currencies
 * Shows gems, coins, and crystals with icons and formatted amounts
 */

import Phaser from 'phaser';
import { currencyService, PlayerCurrencies, CurrencyType } from '../services/CurrencyService';
import { analyticsService } from '../services/AnalyticsService';

export interface CurrencyDisplayConfig {
  x: number;
  y: number;
  showGems?: boolean;
  showCoins?: boolean;
  showCrystals?: boolean;
  compact?: boolean;
  scale?: number;
  onClick?: (currencyType: CurrencyType) => void;
}

export class CurrencyDisplay extends Phaser.GameObjects.Container {
  private currencies: PlayerCurrencies = { gems: 0, coins: 0, crystals: 0, updatedAt: 0 };
  private gemsContainer?: Phaser.GameObjects.Container;
  private coinsContainer?: Phaser.GameObjects.Container;
  private crystalsContainer?: Phaser.GameObjects.Container;
  private gemsText?: Phaser.GameObjects.Text;
  private coinsText?: Phaser.GameObjects.Text;
  private crystalsText?: Phaser.GameObjects.Text;
  private unsubscribe?: () => void;
  private config: CurrencyDisplayConfig;
  private isLoading: boolean = false;
  private loadingIndicator?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: CurrencyDisplayConfig) {
    super(scene, config.x, config.y);

    this.config = {
      showGems: true,
      showCoins: true,
      showCrystals: false,
      compact: false,
      scale: 1,
      ...config,
    };

    scene.add.existing(this);
    this.setScale(this.config.scale!);

    this.createDisplay();
    this.subscribeToUpdates();
    this.fetchCurrencies();
  }

  private createDisplay(): void {
    const spacing = this.config.compact ? 80 : 100;
    let xOffset = 0;

    // Gems display
    if (this.config.showGems) {
      this.gemsContainer = this.createCurrencyItem(xOffset, 'gems', 0x00f5ff);
      this.gemsText = this.gemsContainer.getByName('amount') as Phaser.GameObjects.Text;
      xOffset += spacing;
    }

    // Coins display
    if (this.config.showCoins) {
      this.coinsContainer = this.createCurrencyItem(xOffset, 'coins', 0xffd700);
      this.coinsText = this.coinsContainer.getByName('amount') as Phaser.GameObjects.Text;
      xOffset += spacing;
    }

    // Crystals display
    if (this.config.showCrystals) {
      this.crystalsContainer = this.createCurrencyItem(xOffset, 'crystals', 0xff00ff);
      this.crystalsText = this.crystalsContainer.getByName('amount') as Phaser.GameObjects.Text;
    }
  }

  private createCurrencyItem(x: number, type: CurrencyType, color: number): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, 0);

    // Background pill
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a1a3a, 0.9);
    bg.fillRoundedRect(-5, -15, this.config.compact ? 70 : 90, 30, 15);
    bg.lineStyle(2, color, 0.6);
    bg.strokeRoundedRect(-5, -15, this.config.compact ? 70 : 90, 30, 15);
    container.add(bg);

    // Icon
    const icon = this.scene.add.text(5, 0, this.getIcon(type), {
      fontSize: this.config.compact ? '16px' : '18px',
    }).setOrigin(0, 0.5);
    container.add(icon);

    // Amount text
    const amount = this.scene.add.text(this.config.compact ? 25 : 30, 0, '0', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: this.config.compact ? '14px' : '16px',
      fontStyle: 'bold',
      color: this.getColorHex(color),
    }).setOrigin(0, 0.5);
    amount.setName('amount');
    container.add(amount);

    // Make interactive if onClick provided
    if (this.config.onClick) {
      container.setSize(this.config.compact ? 70 : 90, 30);
      container.setInteractive({ useHandCursor: true });

      container.on('pointerdown', () => {
        analyticsService.trackButtonClick(`currency_${type}`, 'currency_display');
        this.config.onClick!(type);
      });

      container.on('pointerover', () => {
        this.scene.tweens.add({
          targets: container,
          scaleX: 1.05,
          scaleY: 1.05,
          duration: 100,
        });
      });

      container.on('pointerout', () => {
        this.scene.tweens.add({
          targets: container,
          scaleX: 1,
          scaleY: 1,
          duration: 100,
        });
      });
    }

    this.add(container);
    return container;
  }

  private getIcon(type: CurrencyType): string {
    switch (type) {
      case 'gems': return '\u{1F48E}'; // Diamond emoji
      case 'coins': return '\u{1FA99}'; // Coin emoji
      case 'crystals': return '\u{2728}'; // Sparkles emoji
    }
  }

  private getColorHex(color: number): string {
    return '#' + color.toString(16).padStart(6, '0');
  }

  private subscribeToUpdates(): void {
    this.unsubscribe = currencyService.subscribe((currencies) => {
      const oldCurrencies = this.currencies;
      this.currencies = currencies;
      this.updateDisplay(oldCurrencies);
      this.isLoading = false;
      this.hideLoadingIndicator();
    });
  }

  private async fetchCurrencies(): Promise<void> {
    this.isLoading = true;
    this.showLoadingIndicator();

    const currencies = await currencyService.fetchCurrencies();
    if (currencies) {
      this.currencies = currencies;
      this.updateDisplay();
    }

    this.isLoading = false;
    this.hideLoadingIndicator();
  }

  private showLoadingIndicator(): void {
    if (!this.loadingIndicator) {
      this.loadingIndicator = this.scene.add.text(0, 0, '...', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '12px',
        color: '#888888',
      }).setOrigin(0.5);
      this.add(this.loadingIndicator);
    }
    this.loadingIndicator.setVisible(true);
  }

  private hideLoadingIndicator(): void {
    if (this.loadingIndicator) {
      this.loadingIndicator.setVisible(false);
    }
  }

  private updateDisplay(oldCurrencies?: PlayerCurrencies): void {
    if (this.gemsText) {
      const newValue = currencyService.formatCurrency(this.currencies.gems);
      this.gemsText.setText(newValue);

      // Animate if value changed
      if (oldCurrencies && oldCurrencies.gems !== this.currencies.gems) {
        this.animateCurrencyChange(this.gemsContainer!, oldCurrencies.gems < this.currencies.gems);
      }
    }

    if (this.coinsText) {
      const newValue = currencyService.formatCurrency(this.currencies.coins);
      this.coinsText.setText(newValue);

      if (oldCurrencies && oldCurrencies.coins !== this.currencies.coins) {
        this.animateCurrencyChange(this.coinsContainer!, oldCurrencies.coins < this.currencies.coins);
      }
    }

    if (this.crystalsText) {
      const newValue = currencyService.formatCurrency(this.currencies.crystals);
      this.crystalsText.setText(newValue);

      if (oldCurrencies && oldCurrencies.crystals !== this.currencies.crystals) {
        this.animateCurrencyChange(this.crystalsContainer!, oldCurrencies.crystals < this.currencies.crystals);
      }
    }
  }

  private animateCurrencyChange(container: Phaser.GameObjects.Container, isIncrease: boolean): void {
    // Pulse animation
    this.scene.tweens.add({
      targets: container,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 150,
      yoyo: true,
      ease: 'Quad.easeOut',
    });

    // Flash color effect
    const flashColor = isIncrease ? 0x00ff00 : 0xff0000;
    const flash = this.scene.add.graphics();
    flash.fillStyle(flashColor, 0.3);
    flash.fillRoundedRect(container.x - 5, container.y - 15, this.config.compact ? 70 : 90, 30, 15);
    this.add(flash);

    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy(),
    });

    // Floating text for change
    const changeText = isIncrease ? '+' : '';
    const diff = isIncrease ?
      this.currencies.gems - (this.currencies.gems - 1) :
      (this.currencies.gems + 1) - this.currencies.gems;

    const floatingText = this.scene.add.text(
      container.x + 40,
      container.y - 20,
      `${changeText}${diff}`,
      {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: isIncrease ? '#00ff00' : '#ff0000',
      }
    ).setOrigin(0.5);
    this.add(floatingText);

    this.scene.tweens.add({
      targets: floatingText,
      y: container.y - 40,
      alpha: 0,
      duration: 600,
      ease: 'Quad.easeOut',
      onComplete: () => floatingText.destroy(),
    });
  }

  /**
   * Manually refresh currencies from server
   */
  public async refresh(): Promise<void> {
    await this.fetchCurrencies();
  }

  /**
   * Check if player can afford an amount
   */
  public canAfford(type: CurrencyType, amount: number): boolean {
    return currencyService.canAfford(type, amount);
  }

  /**
   * Get current currency value
   */
  public getCurrency(type: CurrencyType): number {
    return this.currencies[type];
  }

  /**
   * Show add currency button (+ icon)
   */
  public showAddButton(type: CurrencyType, onClick: () => void): void {
    let container: Phaser.GameObjects.Container | undefined;

    switch (type) {
      case 'gems':
        container = this.gemsContainer;
        break;
      case 'coins':
        container = this.coinsContainer;
        break;
      case 'crystals':
        container = this.crystalsContainer;
        break;
    }

    if (!container) return;

    const addBtn = this.scene.add.text(
      this.config.compact ? 60 : 80,
      0,
      '+',
      {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#00ff00',
      }
    ).setOrigin(0.5).setInteractive({ useHandCursor: true });

    addBtn.on('pointerdown', () => {
      analyticsService.trackButtonClick(`add_${type}`, 'currency_display');
      onClick();
    });

    container.add(addBtn);
  }

  /**
   * Clean up subscriptions
   */
  public destroy(fromScene?: boolean): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    super.destroy(fromScene);
  }
}
