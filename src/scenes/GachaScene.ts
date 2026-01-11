import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';
import { currencyService, PlayerCurrencies } from '../services/CurrencyService';

interface GachaItem {
  id: string;
  name: string;
  type: string;
  rarity: string;
  imageKey: string;
  isFeatured?: boolean;
}

interface GachaBanner {
  id: string;
  name: string;
  description: string;
  endDate: number;
  timeRemaining: number;
  featuredItems: string[];
  imageKey: string;
}

interface GachaPull {
  item: GachaItem;
  isFeatured: boolean;
  wasPity: boolean;
  pullNumber: number;
}

interface PityStatus {
  epicPity: number;
  epicPullsRemaining: number;
  legendaryPity: number;
  legendaryPullsRemaining: number;
}

interface BoxCost {
  boxType: string;
  isFreeDaily: boolean;
  cost: { type: string; amount: number } | null;
  multiPullCount: number;
  multiPullDiscount: string;
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const RARITY_COLORS: Record<string, number> = {
  common: 0x888888,
  rare: 0x0088ff,
  epic: 0xaa44ff,
  legendary: 0xffaa00,
  mythic: 0xff3366,
};

const BOX_COLORS: Record<string, number> = {
  common: 0x666666,
  rare: 0x0066cc,
  epic: 0x8800cc,
  legendary: 0xcc8800,
};

export class GachaScene extends Phaser.Scene {
  private currencies: PlayerCurrencies = { gems: 0, coins: 0, crystals: 0, updatedAt: 0 };
  private currencyDisplay!: Phaser.GameObjects.Container;
  private banners: GachaBanner[] = [];
  private currentBannerIndex: number = 0;
  private bannerContainer!: Phaser.GameObjects.Container;
  private boxContainer!: Phaser.GameObjects.Container;
  private pityDisplay!: Phaser.GameObjects.Container;
  private pityStatus: PityStatus | null = null;
  private boxCosts: BoxCost[] = [];
  private selectedBox: string = 'rare';
  private dailyFreeAvailable: boolean = false;
  private isAnimating: boolean = false;
  private resultOverlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: 'GachaScene' });
  }

  async create(): Promise<void> {
    const width = this.scale.width;
    const height = this.scale.height;

    this.createBackground();
    this.createHeader(width);
    this.createCurrencyDisplay(width);
    this.createBannerArea(width);
    this.createBoxSelector(width, height);
    this.createPityDisplay(width, height);
    this.createPullButtons(width, height);
    this.createBackButton();

    await this.loadGachaData();
    await this.loadCurrencies();

    currencyService.subscribe((currencies) => {
      this.currencies = currencies;
      this.updateCurrencyDisplay();
      this.updatePullButtons();
    });
  }

  private createBackground(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    const graphics = this.add.graphics();
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

    // Sparkle effects
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const sparkle = this.add.circle(x, y, 1, 0xffffff, Math.random() * 0.5);
      this.tweens.add({
        targets: sparkle,
        alpha: { from: 0.2, to: 0.8 },
        duration: 1000 + Math.random() * 2000,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private createHeader(width: number): void {
    this.add.text(width / 2, 30, 'SUMMON', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#ffaa00',
    }).setOrigin(0.5);
  }

  private createCurrencyDisplay(width: number): void {
    this.currencyDisplay = this.add.container(width - 20, 30);

    const gemsText = this.add.text(-100, 0, '0', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      color: '#00f5ff',
    }).setOrigin(1, 0.5);
    this.add.text(-105, 0, String.fromCharCode(0x1F48E), { fontSize: '16px' }).setOrigin(1, 0.5);

    const coinsText = this.add.text(0, 0, '0', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      color: '#ffd700',
    }).setOrigin(1, 0.5);
    this.add.text(-5, 0, String.fromCharCode(0x1FA99), { fontSize: '16px' }).setOrigin(1, 0.5);

    this.currencyDisplay.add([gemsText, coinsText]);
    (this.currencyDisplay as Phaser.GameObjects.Container & { gemsText: Phaser.GameObjects.Text; coinsText: Phaser.GameObjects.Text }).gemsText = gemsText;
    (this.currencyDisplay as Phaser.GameObjects.Container & { gemsText: Phaser.GameObjects.Text; coinsText: Phaser.GameObjects.Text }).coinsText = coinsText;
  }

  private updateCurrencyDisplay(): void {
    const display = this.currencyDisplay as Phaser.GameObjects.Container & {
      gemsText?: Phaser.GameObjects.Text;
      coinsText?: Phaser.GameObjects.Text;
    };

    if (display.gemsText) {
      display.gemsText.setText(currencyService.formatCurrency(this.currencies.gems));
    }
    if (display.coinsText) {
      display.coinsText.setText(currencyService.formatCurrency(this.currencies.coins));
    }
  }

  private createBannerArea(width: number): void {
    this.bannerContainer = this.add.container(width / 2, 130);

    // Banner frame
    const frame = this.add.graphics();
    frame.lineStyle(3, 0xffaa00, 0.8);
    frame.strokeRoundedRect(-160, -60, 320, 120, 15);
    this.bannerContainer.add(frame);

    // Placeholder banner
    const bannerBg = this.add.graphics();
    bannerBg.fillStyle(COLORS.UI.panel, 0.8);
    bannerBg.fillRoundedRect(-155, -55, 310, 110, 12);
    this.bannerContainer.add(bannerBg);

    const bannerText = this.add.text(0, 0, 'Loading Banners...', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.bannerContainer.add(bannerText);

    // Navigation arrows
    const leftArrow = this.add.text(-180, 0, '<', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '32px',
      color: '#ffaa00',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const rightArrow = this.add.text(180, 0, '>', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '32px',
      color: '#ffaa00',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    leftArrow.on('pointerdown', () => this.navigateBanner(-1));
    rightArrow.on('pointerdown', () => this.navigateBanner(1));

    this.bannerContainer.add([leftArrow, rightArrow]);
  }

  private navigateBanner(direction: number): void {
    if (this.banners.length === 0) return;

    this.currentBannerIndex += direction;
    if (this.currentBannerIndex < 0) this.currentBannerIndex = this.banners.length - 1;
    if (this.currentBannerIndex >= this.banners.length) this.currentBannerIndex = 0;

    this.updateBannerDisplay();
  }

  private updateBannerDisplay(): void {
    // Clear existing banner content (except frame and arrows)
    this.bannerContainer.list
      .filter(obj => obj !== this.bannerContainer.list[0] && obj !== this.bannerContainer.list[this.bannerContainer.list.length - 1] && obj !== this.bannerContainer.list[this.bannerContainer.list.length - 2])
      .forEach(obj => obj.destroy());

    if (this.banners.length === 0) {
      const noBanner = this.add.text(0, 0, 'No Active Banners', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '18px',
        color: '#888888',
      }).setOrigin(0.5);
      this.bannerContainer.add(noBanner);
      return;
    }

    const banner = this.banners[this.currentBannerIndex];

    const bannerBg = this.add.graphics();
    bannerBg.fillGradientStyle(0x1a1a4a, 0x1a1a4a, 0x3a2a5a, 0x3a2a5a, 0.9);
    bannerBg.fillRoundedRect(-155, -55, 310, 110, 12);
    this.bannerContainer.addAt(bannerBg, 1);

    // Banner name
    const name = this.add.text(0, -35, banner.name, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffaa00',
    }).setOrigin(0.5);
    this.bannerContainer.add(name);

    // Description
    const desc = this.add.text(0, -5, banner.description || 'Rate-up banner', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '12px',
      color: '#cccccc',
      wordWrap: { width: 280 },
    }).setOrigin(0.5);
    this.bannerContainer.add(desc);

    // Time remaining
    const timeText = this.formatTimeRemaining(banner.timeRemaining);
    const timer = this.add.text(0, 35, `Ends in: ${timeText}`, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      color: '#ff6666',
    }).setOrigin(0.5);
    this.bannerContainer.add(timer);

    // Banner indicator dots
    if (this.banners.length > 1) {
      for (let i = 0; i < this.banners.length; i++) {
        const dot = this.add.circle(-((this.banners.length - 1) * 8) + i * 16, 50, 4, i === this.currentBannerIndex ? 0xffaa00 : 0x666666);
        this.bannerContainer.add(dot);
      }
    }
  }

  private formatTimeRemaining(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  private createBoxSelector(width: number, height: number): void {
    this.boxContainer = this.add.container(width / 2, height / 2 - 30);

    const boxes = ['common', 'rare', 'epic', 'legendary'];
    const boxWidth = 70;
    const spacing = 15;
    const totalWidth = boxes.length * boxWidth + (boxes.length - 1) * spacing;
    const startX = -totalWidth / 2 + boxWidth / 2;

    boxes.forEach((boxType, index) => {
      const x = startX + index * (boxWidth + spacing);
      const box = this.createBoxButton(x, 0, boxType);
      this.boxContainer.add(box);
    });
  }

  private createBoxButton(x: number, y: number, boxType: string): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const isSelected = boxType === this.selectedBox;

    // Box background
    const bg = this.add.graphics();
    bg.fillStyle(BOX_COLORS[boxType] || 0x666666, isSelected ? 0.95 : 0.6);
    bg.fillRoundedRect(-30, -40, 60, 80, 10);

    if (isSelected) {
      bg.lineStyle(3, 0xffaa00, 1);
      bg.strokeRoundedRect(-30, -40, 60, 80, 10);
    }

    container.add(bg);

    // Box icon (chest emoji)
    const icon = this.add.text(0, -10, String.fromCharCode(0x1F4E6), {
      fontSize: '28px',
    }).setOrigin(0.5);
    container.add(icon);

    // Label
    const label = this.add.text(0, 25, boxType.charAt(0).toUpperCase() + boxType.slice(1), {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '10px',
      fontStyle: 'bold',
      color: isSelected ? '#ffffff' : '#aaaaaa',
    }).setOrigin(0.5);
    container.add(label);

    // Free badge for common
    if (boxType === 'common' && this.dailyFreeAvailable) {
      const badge = this.add.graphics();
      badge.fillStyle(0x00ff00, 1);
      badge.fillRoundedRect(-25, -40, 50, 16, 5);
      container.add(badge);

      const freeText = this.add.text(0, -32, 'FREE', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#000000',
      }).setOrigin(0.5);
      container.add(freeText);
    }

    container.setSize(60, 80);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerdown', () => {
      this.playClickSound();
      this.selectedBox = boxType;
      this.refreshBoxSelector();
      this.updatePullButtons();
    });

    return container;
  }

  private refreshBoxSelector(): void {
    this.boxContainer.removeAll(true);
    this.createBoxSelector(this.scale.width, this.scale.height);
  }

  private createPityDisplay(width: number, height: number): void {
    this.pityDisplay = this.add.container(width / 2, height / 2 + 60);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.UI.panel, 0.7);
    bg.fillRoundedRect(-140, -25, 280, 50, 10);
    this.pityDisplay.add(bg);

    const pityText = this.add.text(0, 0, 'Loading pity...', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '12px',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.pityDisplay.add(pityText);

    (this.pityDisplay as Phaser.GameObjects.Container & { pityText: Phaser.GameObjects.Text }).pityText = pityText;
  }

  private updatePityDisplay(): void {
    const display = this.pityDisplay as Phaser.GameObjects.Container & { pityText?: Phaser.GameObjects.Text };
    if (!display.pityText || !this.pityStatus) return;

    const epicProgress = 10 - this.pityStatus.epicPullsRemaining;
    const legProgress = 50 - this.pityStatus.legendaryPullsRemaining;

    display.pityText.setText(
      `Epic in ${this.pityStatus.epicPullsRemaining} pulls (${epicProgress}/10) | ` +
      `Legendary in ${this.pityStatus.legendaryPullsRemaining} pulls (${legProgress}/50)`
    );
  }

  private createPullButtons(width: number, height: number): void {
    const y = height - 80;

    // Single pull button
    const singleBtn = this.createPullButton(width / 2 - 90, y, 'Pull x1', false);
    (singleBtn as Phaser.GameObjects.Container & { buttonType: string }).buttonType = 'single';

    // Multi pull button
    const multiBtn = this.createPullButton(width / 2 + 90, y, 'Pull x10', true);
    (multiBtn as Phaser.GameObjects.Container & { buttonType: string }).buttonType = 'multi';

    // View rates button
    const ratesBtn = this.add.text(width / 2, height - 30, 'View Drop Rates', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      color: '#00f5ff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    ratesBtn.on('pointerdown', () => this.showDropRates());
  }

  private createPullButton(x: number, y: number, label: string, isMulti: boolean): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(isMulti ? 0xaa44ff : 0x00aa88, 0.9);
    bg.fillRoundedRect(-70, -25, 140, 50, 12);
    container.add(bg);

    const text = this.add.text(0, -5, label, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    container.add(text);

    const costText = this.add.text(0, 15, 'Loading...', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '12px',
      color: '#cccccc',
    }).setOrigin(0.5);
    container.add(costText);

    container.setSize(140, 50);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerdown', () => {
      if (this.isAnimating) return;
      this.playClickSound();
      this.performPull(isMulti);
    });

    (container as Phaser.GameObjects.Container & { costText: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Graphics }).costText = costText;
    (container as Phaser.GameObjects.Container & { costText: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Graphics }).bg = bg;

    return container;
  }

  private updatePullButtons(): void {
    const cost = this.boxCosts.find(c => c.boxType === this.selectedBox);
    if (!cost) return;

    // Find buttons by iterating scene children
    this.children.list.forEach(child => {
      const container = child as Phaser.GameObjects.Container & {
        buttonType?: string;
        costText?: Phaser.GameObjects.Text;
        bg?: Phaser.GameObjects.Graphics;
      };

      if (container.buttonType === 'single' && container.costText) {
        if (this.selectedBox === 'common' && this.dailyFreeAvailable) {
          container.costText.setText('FREE');
          container.costText.setColor('#00ff00');
        } else if (cost.cost) {
          const icon = cost.cost.type === 'gems' ? String.fromCharCode(0x1F48E) : String.fromCharCode(0x1FA99);
          container.costText.setText(`${icon} ${cost.cost.amount}`);
          container.costText.setColor('#ffffff');
        }
      }

      if (container.buttonType === 'multi' && container.costText && cost.cost) {
        const discountedCost = Math.floor(cost.cost.amount * 10 * 0.9);
        const icon = cost.cost.type === 'gems' ? String.fromCharCode(0x1F48E) : String.fromCharCode(0x1FA99);
        container.costText.setText(`${icon} ${discountedCost} (-10%)`);
      }
    });
  }

  private createBackButton(): void {
    const backBtn = this.add.text(20, 20, '< Back', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      color: '#00f5ff',
    }).setInteractive({ useHandCursor: true });

    backBtn.on('pointerdown', () => {
      this.playClickSound();
      this.scene.start('MenuScene');
    });
  }

  private async loadGachaData(): Promise<void> {
    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // Load banners
      const bannersRes = await fetch(`${SERVER_URL}/api/gacha/banners`, { headers });
      if (bannersRes.ok) {
        const data = await bannersRes.json();
        this.banners = data.banners;
        this.updateBannerDisplay();
      }

      // Load costs
      const costsRes = await fetch(`${SERVER_URL}/api/gacha/costs`, { headers });
      if (costsRes.ok) {
        const data = await costsRes.json();
        this.boxCosts = data.costs;
        this.updatePullButtons();
      }

      // Load pity status
      const pityRes = await fetch(`${SERVER_URL}/api/gacha/pity`, { headers });
      if (pityRes.ok) {
        this.pityStatus = await pityRes.json();
        this.updatePityDisplay();
      }

      // Load daily free status
      const dailyRes = await fetch(`${SERVER_URL}/api/gacha/daily-free`, { headers });
      if (dailyRes.ok) {
        const data = await dailyRes.json();
        this.dailyFreeAvailable = data.available;
        this.refreshBoxSelector();
      }
    } catch (error) {
      console.error('Error loading gacha data:', error);
    }
  }

  private async loadCurrencies(): Promise<void> {
    const currencies = await currencyService.fetchCurrencies();
    if (currencies) {
      this.currencies = currencies;
      this.updateCurrencyDisplay();
      this.updatePullButtons();
    }
  }

  private async performPull(isMulti: boolean): Promise<void> {
    if (this.isAnimating) return;

    const token = localStorage.getItem('token');
    if (!token) {
      this.showError('Please log in to pull');
      return;
    }

    this.isAnimating = true;

    try {
      const endpoint = isMulti ? 'multi-pull' : 'pull';
      const body: Record<string, unknown> = {
        boxType: this.selectedBox,
        bannerId: this.banners[this.currentBannerIndex]?.id || null,
      };

      if (!isMulti && this.selectedBox === 'common' && this.dailyFreeAvailable) {
        body.useFreePull = true;
      }

      const response = await fetch(`${SERVER_URL}/api/gacha/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        this.showError(data.error || 'Pull failed');
        this.isAnimating = false;
        return;
      }

      // Update currencies
      if (data.currencies) {
        this.currencies = { ...data.currencies, updatedAt: Date.now() };
        this.updateCurrencyDisplay();
      }

      // Update pity
      if (data.pity) {
        this.pityStatus = data.pity;
        this.updatePityDisplay();
      }

      // Show results
      if (isMulti) {
        await this.showMultiPullResults(data.pulls, data.summary);
      } else {
        await this.showSinglePullResult(data.pull);
      }

      // Refresh daily free status
      if (!isMulti && this.selectedBox === 'common' && this.dailyFreeAvailable) {
        this.dailyFreeAvailable = false;
        this.refreshBoxSelector();
      }
    } catch (error) {
      console.error('Pull error:', error);
      this.showError('Network error');
    }

    this.isAnimating = false;
  }

  private async showSinglePullResult(pull: GachaPull): Promise<void> {
    const width = this.scale.width;
    const height = this.scale.height;

    this.resultOverlay = this.add.container(0, 0);

    // Dark overlay
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.85);
    overlay.setInteractive();
    this.resultOverlay.add(overlay);

    // Animate opening effect
    const rarityColor = RARITY_COLORS[pull.item.rarity] || RARITY_COLORS.common;

    // Flash effect
    const flash = this.add.rectangle(width / 2, height / 2, width, height, rarityColor, 0);
    this.resultOverlay.add(flash);

    await new Promise<void>(resolve => {
      this.tweens.add({
        targets: flash,
        alpha: { from: 0, to: 0.6 },
        duration: 300,
        yoyo: true,
        onComplete: () => resolve(),
      });
    });

    // Item reveal
    const itemContainer = this.add.container(width / 2, height / 2);
    this.resultOverlay.add(itemContainer);

    // Glow effect
    const glow = this.add.graphics();
    glow.fillStyle(rarityColor, 0.3);
    glow.fillCircle(0, 0, 80);
    itemContainer.add(glow);

    // Item circle
    const itemBg = this.add.graphics();
    itemBg.fillStyle(rarityColor, 0.8);
    itemBg.fillCircle(0, 0, 60);
    itemBg.lineStyle(4, 0xffffff, 0.8);
    itemBg.strokeCircle(0, 0, 60);
    itemContainer.add(itemBg);

    // Item icon
    const icon = this.add.text(0, 0, this.getTypeIcon(pull.item.type), {
      fontSize: '40px',
    }).setOrigin(0.5);
    itemContainer.add(icon);

    // Scale in animation
    itemContainer.setScale(0);
    this.tweens.add({
      targets: itemContainer,
      scaleX: 1,
      scaleY: 1,
      duration: 400,
      ease: 'Back.easeOut',
    });

    // Item name
    const name = this.add.text(width / 2, height / 2 + 100, pull.item.name, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5).setAlpha(0);
    this.resultOverlay.add(name);

    // Rarity text
    const rarity = this.add.text(width / 2, height / 2 + 130, pull.item.rarity.toUpperCase(), {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: Phaser.Display.Color.IntegerToColor(rarityColor).rgba,
    }).setOrigin(0.5).setAlpha(0);
    this.resultOverlay.add(rarity);

    // Badges
    if (pull.isFeatured) {
      const featured = this.add.text(width / 2, height / 2 + 160, 'FEATURED!', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffaa00',
      }).setOrigin(0.5).setAlpha(0);
      this.resultOverlay.add(featured);
      this.tweens.add({ targets: featured, alpha: 1, delay: 600, duration: 300 });
    }

    if (pull.wasPity) {
      const pity = this.add.text(width / 2, height / 2 + (pull.isFeatured ? 185 : 160), 'PITY TRIGGER!', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '14px',
        color: '#00ff88',
      }).setOrigin(0.5).setAlpha(0);
      this.resultOverlay.add(pity);
      this.tweens.add({ targets: pity, alpha: 1, delay: 700, duration: 300 });
    }

    // Fade in text
    this.tweens.add({ targets: name, alpha: 1, delay: 400, duration: 300 });
    this.tweens.add({ targets: rarity, alpha: 1, delay: 500, duration: 300 });

    // Tap to close
    const tapText = this.add.text(width / 2, height - 50, 'Tap to continue', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      color: '#888888',
    }).setOrigin(0.5).setAlpha(0);
    this.resultOverlay.add(tapText);

    this.tweens.add({
      targets: tapText,
      alpha: { from: 0.5, to: 1 },
      delay: 800,
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    // Wait then enable close
    await new Promise<void>(resolve => this.time.delayedCall(500, resolve));

    overlay.once('pointerdown', () => {
      this.resultOverlay?.destroy();
      this.resultOverlay = null;
    });
  }

  private async showMultiPullResults(pulls: GachaPull[], summary: { byRarity: Record<string, number> }): Promise<void> {
    const width = this.scale.width;
    const height = this.scale.height;

    this.resultOverlay = this.add.container(0, 0);

    // Dark overlay
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.9);
    overlay.setInteractive();
    this.resultOverlay.add(overlay);

    // Title
    const title = this.add.text(width / 2, 40, 'SUMMON RESULTS', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#ffaa00',
    }).setOrigin(0.5);
    this.resultOverlay.add(title);

    // Summary
    const summaryText = Object.entries(summary.byRarity)
      .map(([rarity, count]) => `${rarity}: ${count}`)
      .join(' | ');
    const summaryLabel = this.add.text(width / 2, 75, summaryText, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      color: '#cccccc',
    }).setOrigin(0.5);
    this.resultOverlay.add(summaryLabel);

    // Items grid
    const cols = 5;
    const itemSize = 60;
    const spacing = 10;
    const gridWidth = cols * itemSize + (cols - 1) * spacing;
    const startX = (width - gridWidth) / 2 + itemSize / 2;
    const startY = 130;

    // Sort pulls by rarity (best first)
    const rarityOrder = { mythic: 5, legendary: 4, epic: 3, rare: 2, common: 1 };
    const sortedPulls = [...pulls].sort(
      (a, b) => (rarityOrder[b.item.rarity as keyof typeof rarityOrder] || 0) - (rarityOrder[a.item.rarity as keyof typeof rarityOrder] || 0)
    );

    for (let i = 0; i < sortedPulls.length; i++) {
      const pull = sortedPulls[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (itemSize + spacing);
      const y = startY + row * (itemSize + spacing + 20);

      const itemContainer = this.add.container(x, y);
      this.resultOverlay.add(itemContainer);

      const rarityColor = RARITY_COLORS[pull.item.rarity] || RARITY_COLORS.common;

      // Background
      const bg = this.add.graphics();
      bg.fillStyle(rarityColor, 0.6);
      bg.fillRoundedRect(-itemSize / 2, -itemSize / 2, itemSize, itemSize, 8);
      bg.lineStyle(2, rarityColor, 1);
      bg.strokeRoundedRect(-itemSize / 2, -itemSize / 2, itemSize, itemSize, 8);
      itemContainer.add(bg);

      // Icon
      const icon = this.add.text(0, 0, this.getTypeIcon(pull.item.type), {
        fontSize: '24px',
      }).setOrigin(0.5);
      itemContainer.add(icon);

      // Badges
      if (pull.isFeatured) {
        const star = this.add.text(itemSize / 2 - 5, -itemSize / 2 + 5, String.fromCharCode(0x2B50), {
          fontSize: '12px',
        }).setOrigin(0.5);
        itemContainer.add(star);
      }

      // Name
      const name = this.add.text(0, itemSize / 2 + 10, pull.item.name.substring(0, 10), {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '10px',
        color: '#ffffff',
      }).setOrigin(0.5);
      itemContainer.add(name);

      // Animate in
      itemContainer.setScale(0);
      this.tweens.add({
        targets: itemContainer,
        scaleX: 1,
        scaleY: 1,
        delay: i * 100,
        duration: 200,
        ease: 'Back.easeOut',
      });
    }

    // Continue button
    const continueBtn = this.add.container(width / 2, height - 60);
    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x00aa88, 0.9);
    btnBg.fillRoundedRect(-80, -20, 160, 40, 12);
    continueBtn.add(btnBg);

    const btnText = this.add.text(0, 0, 'CONTINUE', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    continueBtn.add(btnText);

    continueBtn.setSize(160, 40);
    continueBtn.setInteractive({ useHandCursor: true });
    this.resultOverlay.add(continueBtn);

    // Fade in button
    continueBtn.setAlpha(0);
    this.tweens.add({
      targets: continueBtn,
      alpha: 1,
      delay: pulls.length * 100 + 500,
      duration: 300,
    });

    continueBtn.on('pointerdown', () => {
      this.playClickSound();
      this.resultOverlay?.destroy();
      this.resultOverlay = null;
    });
  }

  private getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      skin: String.fromCharCode(0x1F3A8),
      territory_theme: String.fromCharCode(0x1F5FA),
      troop_skin: String.fromCharCode(0x2694),
      victory_animation: String.fromCharCode(0x1F389),
      avatar: String.fromCharCode(0x1F464),
      frame: String.fromCharCode(0x1F5BC),
      title: String.fromCharCode(0x1F3C6),
      currency: String.fromCharCode(0x1F4B0),
    };
    return icons[type] || '?';
  }

  private async showDropRates(): Promise<void> {
    const width = this.scale.width;
    const height = this.scale.height;

    try {
      const response = await fetch(`${SERVER_URL}/api/gacha/rates?boxType=${this.selectedBox}`);
      const data = await response.json();

      const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8);
      overlay.setInteractive();

      const panel = this.add.container(width / 2, height / 2);

      const bg = this.add.graphics();
      bg.fillStyle(COLORS.UI.panel, 0.95);
      bg.fillRoundedRect(-160, -180, 320, 360, 15);
      bg.lineStyle(2, 0x00f5ff, 0.8);
      bg.strokeRoundedRect(-160, -180, 320, 360, 15);
      panel.add(bg);

      const title = this.add.text(0, -150, `${this.selectedBox.toUpperCase()} BOX RATES`, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#00f5ff',
      }).setOrigin(0.5);
      panel.add(title);

      // Rates
      let y = -100;
      const rarities = ['mythic', 'legendary', 'epic', 'rare', 'common'];
      for (const rarity of rarities) {
        const rate = data.rates[rarity];
        if (rate === '0%') continue;

        const color = RARITY_COLORS[rarity] || 0xffffff;
        const rarityText = this.add.text(-130, y, rarity.charAt(0).toUpperCase() + rarity.slice(1), {
          fontFamily: 'Segoe UI, system-ui, sans-serif',
          fontSize: '16px',
          color: Phaser.Display.Color.IntegerToColor(color).rgba,
        });
        panel.add(rarityText);

        const rateText = this.add.text(130, y, rate, {
          fontFamily: 'Segoe UI, system-ui, sans-serif',
          fontSize: '16px',
          color: '#ffffff',
        }).setOrigin(1, 0);
        panel.add(rateText);

        y += 30;
      }

      // Pity info
      y += 20;
      const pityTitle = this.add.text(0, y, 'PITY SYSTEM', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffaa00',
      }).setOrigin(0.5);
      panel.add(pityTitle);

      y += 25;
      const pityInfo = this.add.text(0, y, data.pitySystem.description, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '12px',
        color: '#aaaaaa',
        wordWrap: { width: 280 },
        align: 'center',
      }).setOrigin(0.5, 0);
      panel.add(pityInfo);

      // Close button
      const closeBtn = this.add.text(0, 150, 'CLOSE', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#00f5ff',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      panel.add(closeBtn);

      closeBtn.on('pointerdown', () => {
        this.playClickSound();
        overlay.destroy();
        panel.destroy();
      });
    } catch (error) {
      console.error('Error loading rates:', error);
    }
  }

  private showError(message: string): void {
    const width = this.scale.width;
    const height = this.scale.height;

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    overlay.setInteractive();

    const panel = this.add.container(width / 2, height / 2);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.UI.panel, 0.95);
    bg.fillRoundedRect(-140, -60, 280, 120, 15);
    bg.lineStyle(2, 0xff0000, 0.8);
    bg.strokeRoundedRect(-140, -60, 280, 120, 15);
    panel.add(bg);

    const title = this.add.text(0, -30, 'Error', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ff0000',
    }).setOrigin(0.5);
    panel.add(title);

    const text = this.add.text(0, 10, message, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      color: '#ffffff',
      wordWrap: { width: 260 },
    }).setOrigin(0.5);
    panel.add(text);

    const closeBtn = this.add.text(0, 45, 'OK', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      color: '#00f5ff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    panel.add(closeBtn);

    closeBtn.on('pointerdown', () => {
      this.playClickSound();
      overlay.destroy();
      panel.destroy();
    });
  }

  private playClickSound(): void {
    const settings = this.registry.get('settings') as { soundEnabled: boolean } | undefined;
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
}
