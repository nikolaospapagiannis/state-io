import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';
import { currencyService, PlayerCurrencies } from '../services/CurrencyService';

interface StoreOffer {
  id: string;
  type: string;
  name: string;
  description: string | null;
  originalPrice: number | null;
  price: number;
  priceDisplay: string;
  discountPercent: number;
  gems: number;
  coins: number;
  crystals: number;
  bonusGems: number;
  items: string[];
  isOneTime: boolean;
  isPurchased: boolean;
  canPurchase: boolean;
  expiresAt: number | null;
  timeRemaining: number | null;
  imageKey: string | null;
}

interface DailyDeal {
  dealId: string;
  offerId: string;
  name: string;
  description: string | null;
  price: number;
  priceDisplay: string;
  discountedPrice: number;
  discountedPriceDisplay: string;
  discountPercent: number;
  gems: number;
  coins: number;
  crystals: number;
  bonusGems: number;
  items: string[];
  isPurchased: boolean;
  imageKey: string | null;
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export class StoreScene extends Phaser.Scene {
  private currencies: PlayerCurrencies = { gems: 0, coins: 0, crystals: 0, updatedAt: 0 };
  private currencyDisplay!: Phaser.GameObjects.Container;
  private tabButtons: Phaser.GameObjects.Container[] = [];
  private contentContainer!: Phaser.GameObjects.Container;
  private currentTab: string = 'gems';
  private scrollY: number = 0;
  private maxScrollY: number = 0;
  private offers: StoreOffer[] = [];
  private dailyDeals: DailyDeal[] = [];
  private timeUntilReset: number = 0;

  constructor() {
    super({ key: 'StoreScene' });
  }

  async create(): Promise<void> {
    const width = this.scale.width;
    const height = this.scale.height;

    // Background
    this.createBackground();

    // Header
    this.createHeader(width);

    // Currency display
    this.createCurrencyDisplay(width);

    // Tab buttons
    this.createTabs(width);

    // Content area
    this.contentContainer = this.add.container(0, 160);

    // Load data
    await this.loadStoreData();
    await this.loadCurrencies();

    // Show initial tab
    this.showTab('gems');

    // Enable scrolling
    this.setupScrolling(height);

    // Subscribe to currency updates
    currencyService.subscribe((currencies) => {
      this.currencies = currencies;
      this.updateCurrencyDisplay();
    });
  }

  private createBackground(): void {
    const width = this.scale.width;
    const height = this.scale.height;

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
  }

  private createHeader(width: number): void {
    // Back button
    const backBtn = this.add.text(20, 20, '< Back', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      color: '#00f5ff',
    }).setInteractive({ useHandCursor: true });

    backBtn.on('pointerdown', () => {
      this.playClickSound();
      this.scene.start('MenuScene');
    });

    // Title
    this.add.text(width / 2, 25, 'STORE', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5, 0);
  }

  private createCurrencyDisplay(width: number): void {
    this.currencyDisplay = this.add.container(width - 20, 25);

    // Gems
    const gemsText = this.add.text(-150, 0, '0', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      color: '#00f5ff',
    }).setOrigin(1, 0);
    this.add.text(-155, 0, '💎', { fontSize: '18px' }).setOrigin(1, 0);

    // Coins
    const coinsText = this.add.text(-50, 0, '0', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      color: '#ffd700',
    }).setOrigin(1, 0);
    this.add.text(-55, 0, '🪙', { fontSize: '18px' }).setOrigin(1, 0);

    // Crystals
    const crystalsText = this.add.text(0, 0, '0', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      color: '#ff00ff',
    }).setOrigin(1, 0);
    this.add.text(-5, 0, '✨', { fontSize: '18px' }).setOrigin(1, 0);

    this.currencyDisplay.add([gemsText, coinsText, crystalsText]);
    (this.currencyDisplay as Phaser.GameObjects.Container & { gemsText: Phaser.GameObjects.Text }).gemsText = gemsText;
    (this.currencyDisplay as Phaser.GameObjects.Container & { coinsText: Phaser.GameObjects.Text }).coinsText = coinsText;
    (this.currencyDisplay as Phaser.GameObjects.Container & { crystalsText: Phaser.GameObjects.Text }).crystalsText = crystalsText;
  }

  private updateCurrencyDisplay(): void {
    const display = this.currencyDisplay as Phaser.GameObjects.Container & {
      gemsText?: Phaser.GameObjects.Text;
      coinsText?: Phaser.GameObjects.Text;
      crystalsText?: Phaser.GameObjects.Text;
    };

    if (display.gemsText) {
      display.gemsText.setText(currencyService.formatCurrency(this.currencies.gems));
    }
    if (display.coinsText) {
      display.coinsText.setText(currencyService.formatCurrency(this.currencies.coins));
    }
    if (display.crystalsText) {
      display.crystalsText.setText(currencyService.formatCurrency(this.currencies.crystals));
    }
  }

  private createTabs(width: number): void {
    const tabs = [
      { id: 'gems', label: '💎 Gems' },
      { id: 'starters', label: '🎁 Starters' },
      { id: 'deals', label: '🔥 Daily' },
      { id: 'special', label: '⚡ Special' },
    ];

    const tabWidth = (width - 40) / tabs.length;
    const startX = 20;

    tabs.forEach((tab, index) => {
      const container = this.add.container(startX + tabWidth * index + tabWidth / 2, 80);

      const bg = this.add.graphics();
      bg.fillStyle(COLORS.UI.panel, 0.8);
      bg.fillRoundedRect(-tabWidth / 2 + 5, -20, tabWidth - 10, 40, 10);

      const text = this.add.text(0, 0, tab.label, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
      }).setOrigin(0.5);

      container.add([bg, text]);
      container.setSize(tabWidth - 10, 40);
      container.setInteractive({ useHandCursor: true });

      container.on('pointerdown', () => {
        this.playClickSound();
        this.showTab(tab.id);
      });

      (container as Phaser.GameObjects.Container & { tabId: string; bg: Phaser.GameObjects.Graphics }).tabId = tab.id;
      (container as Phaser.GameObjects.Container & { tabId: string; bg: Phaser.GameObjects.Graphics }).bg = bg;

      this.tabButtons.push(container);
    });
  }

  private updateTabHighlight(): void {
    this.tabButtons.forEach((tab) => {
      const tabData = tab as Phaser.GameObjects.Container & { tabId: string; bg: Phaser.GameObjects.Graphics };
      const isSelected = tabData.tabId === this.currentTab;
      const tabWidth = (this.scale.width - 40) / this.tabButtons.length;

      tabData.bg.clear();
      tabData.bg.fillStyle(isSelected ? 0x005566 : COLORS.UI.panel, isSelected ? 0.95 : 0.8);
      tabData.bg.fillRoundedRect(-tabWidth / 2 + 5, -20, tabWidth - 10, 40, 10);

      if (isSelected) {
        tabData.bg.lineStyle(2, COLORS.UI.accent, 1);
        tabData.bg.strokeRoundedRect(-tabWidth / 2 + 5, -20, tabWidth - 10, 40, 10);
      }
    });
  }

  private showTab(tabId: string): void {
    this.currentTab = tabId;
    this.scrollY = 0;
    this.updateTabHighlight();

    // Clear content
    this.contentContainer.removeAll(true);

    switch (tabId) {
      case 'gems':
        this.showGemBundles();
        break;
      case 'starters':
        this.showStarterPacks();
        break;
      case 'deals':
        this.showDailyDeals();
        break;
      case 'special':
        this.showSpecialOffers();
        break;
    }
  }

  private showGemBundles(): void {
    const gemOffers = this.offers.filter(o => o.type === 'gem_bundle');
    this.renderOfferGrid(gemOffers, 'Get more gems to unlock premium content!');
  }

  private showStarterPacks(): void {
    const starterOffers = this.offers.filter(o => o.type === 'starter_pack');
    this.renderOfferGrid(starterOffers, 'One-time bundles for new players!');
  }

  private showDailyDeals(): void {
    const width = this.scale.width;

    // Timer display
    const timerText = this.add.text(width / 2, 20, `Resets in: ${this.formatTime(this.timeUntilReset)}`, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      color: '#ff6600',
    }).setOrigin(0.5);
    this.contentContainer.add(timerText);

    // Update timer every second
    this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (this.timeUntilReset > 0) {
          this.timeUntilReset--;
          timerText.setText(`Resets in: ${this.formatTime(this.timeUntilReset)}`);
        }
      },
      loop: true,
    });

    // Render deals
    this.renderDailyDealsGrid();
  }

  private showSpecialOffers(): void {
    const specialOffers = this.offers.filter(o => o.type === 'limited_time' || o.type === 'special');
    this.renderOfferGrid(specialOffers, 'Limited-time exclusive offers!');
  }

  private renderOfferGrid(offers: StoreOffer[], subtitle: string): void {
    const width = this.scale.width;
    const cardWidth = (width - 60) / 2;
    const cardHeight = 180;

    // Subtitle
    this.contentContainer.add(this.add.text(width / 2, 10, subtitle, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      color: '#aaaaaa',
    }).setOrigin(0.5));

    if (offers.length === 0) {
      this.contentContainer.add(this.add.text(width / 2, 100, 'No offers available', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '20px',
        color: '#666666',
      }).setOrigin(0.5));
      return;
    }

    offers.forEach((offer, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 30 + col * (cardWidth + 10) + cardWidth / 2;
      const y = 50 + row * (cardHeight + 15) + cardHeight / 2;

      this.createOfferCard(offer, x, y, cardWidth, cardHeight);
    });

    this.maxScrollY = Math.max(0, (Math.ceil(offers.length / 2) * (cardHeight + 15)) - (this.scale.height - 200));
  }

  private renderDailyDealsGrid(): void {
    const width = this.scale.width;
    const cardWidth = (width - 60) / 2;
    const cardHeight = 180;

    if (this.dailyDeals.length === 0) {
      this.contentContainer.add(this.add.text(width / 2, 80, 'No daily deals available', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '20px',
        color: '#666666',
      }).setOrigin(0.5));
      return;
    }

    this.dailyDeals.forEach((deal, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 30 + col * (cardWidth + 10) + cardWidth / 2;
      const y = 80 + row * (cardHeight + 15) + cardHeight / 2;

      this.createDailyDealCard(deal, x, y, cardWidth, cardHeight);
    });

    this.maxScrollY = Math.max(0, (Math.ceil(this.dailyDeals.length / 2) * (cardHeight + 15)) - (this.scale.height - 240));
  }

  private createOfferCard(offer: StoreOffer, x: number, y: number, width: number, height: number): void {
    const container = this.add.container(x, y);

    // Card background
    const bg = this.add.graphics();
    bg.fillStyle(offer.canPurchase ? COLORS.UI.panel : 0x333333, 0.95);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 15);

    if (offer.discountPercent > 0) {
      bg.lineStyle(3, 0xff6600, 1);
    } else {
      bg.lineStyle(2, COLORS.UI.accent, 0.6);
    }
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 15);

    container.add(bg);

    // Discount badge
    if (offer.discountPercent > 0) {
      const badge = this.add.graphics();
      badge.fillStyle(0xff6600, 1);
      badge.fillRoundedRect(-width / 2, -height / 2, 60, 30, { tl: 15, tr: 0, bl: 0, br: 15 });
      container.add(badge);

      const discountText = this.add.text(-width / 2 + 30, -height / 2 + 15, `-${offer.discountPercent}%`, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffffff',
      }).setOrigin(0.5);
      container.add(discountText);
    }

    // Name
    const name = this.add.text(0, -height / 2 + 40, offer.name, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    container.add(name);

    // Gems/coins display
    let rewardY = -10;
    if (offer.gems > 0 || offer.bonusGems > 0) {
      const gemsAmount = offer.gems + offer.bonusGems;
      const gemsDisplay = this.add.text(0, rewardY, `💎 ${gemsAmount}`, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#00f5ff',
      }).setOrigin(0.5);
      container.add(gemsDisplay);

      if (offer.bonusGems > 0) {
        const bonusText = this.add.text(gemsDisplay.x + gemsDisplay.width / 2 + 5, rewardY, `+${offer.bonusGems}`, {
          fontFamily: 'Segoe UI, system-ui, sans-serif',
          fontSize: '14px',
          color: '#00ff00',
        }).setOrigin(0, 0.5);
        container.add(bonusText);
      }
      rewardY += 25;
    }

    if (offer.coins > 0) {
      container.add(this.add.text(0, rewardY, `🪙 ${offer.coins}`, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '18px',
        color: '#ffd700',
      }).setOrigin(0.5));
      rewardY += 22;
    }

    if (offer.crystals > 0) {
      container.add(this.add.text(0, rewardY, `✨ ${offer.crystals}`, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '18px',
        color: '#ff00ff',
      }).setOrigin(0.5));
    }

    // Buy button
    const buyBtn = this.add.container(0, height / 2 - 30);

    const btnBg = this.add.graphics();
    if (offer.canPurchase) {
      btnBg.fillStyle(0x00aa00, 1);
    } else {
      btnBg.fillStyle(0x555555, 1);
    }
    btnBg.fillRoundedRect(-50, -15, 100, 30, 10);

    const priceText = this.add.text(0, 0, offer.isPurchased ? 'OWNED' : offer.priceDisplay, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    buyBtn.add([btnBg, priceText]);
    container.add(buyBtn);

    // Make interactive
    if (offer.canPurchase) {
      buyBtn.setSize(100, 30);
      buyBtn.setInteractive({ useHandCursor: true });

      buyBtn.on('pointerdown', () => {
        this.purchaseOffer(offer);
      });

      buyBtn.on('pointerover', () => {
        btnBg.clear();
        btnBg.fillStyle(0x00cc00, 1);
        btnBg.fillRoundedRect(-50, -15, 100, 30, 10);
      });

      buyBtn.on('pointerout', () => {
        btnBg.clear();
        btnBg.fillStyle(0x00aa00, 1);
        btnBg.fillRoundedRect(-50, -15, 100, 30, 10);
      });
    }

    this.contentContainer.add(container);
  }

  private createDailyDealCard(deal: DailyDeal, x: number, y: number, width: number, height: number): void {
    const container = this.add.container(x, y);

    // Card background
    const bg = this.add.graphics();
    bg.fillStyle(deal.isPurchased ? 0x333333 : COLORS.UI.panel, 0.95);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 15);
    bg.lineStyle(3, 0xff6600, 1);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 15);
    container.add(bg);

    // Discount badge
    const badge = this.add.graphics();
    badge.fillStyle(0xff6600, 1);
    badge.fillRoundedRect(-width / 2, -height / 2, 60, 30, { tl: 15, tr: 0, bl: 0, br: 15 });
    container.add(badge);

    const discountText = this.add.text(-width / 2 + 30, -height / 2 + 15, `-${deal.discountPercent}%`, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    container.add(discountText);

    // Name
    container.add(this.add.text(0, -height / 2 + 40, deal.name, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5));

    // Rewards
    let rewardY = -10;
    if (deal.gems > 0) {
      container.add(this.add.text(0, rewardY, `💎 ${deal.gems + deal.bonusGems}`, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#00f5ff',
      }).setOrigin(0.5));
      rewardY += 22;
    }

    if (deal.coins > 0) {
      container.add(this.add.text(0, rewardY, `🪙 ${deal.coins}`, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '18px',
        color: '#ffd700',
      }).setOrigin(0.5));
    }

    // Prices
    const originalPrice = this.add.text(-20, height / 2 - 50, deal.priceDisplay, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      color: '#888888',
    }).setOrigin(0.5);
    originalPrice.setStroke('#888888', 1);

    // Strikethrough
    const line = this.add.graphics();
    line.lineStyle(2, 0x888888, 1);
    line.lineBetween(originalPrice.x - originalPrice.width / 2, originalPrice.y, originalPrice.x + originalPrice.width / 2, originalPrice.y);
    container.add([originalPrice, line]);

    container.add(this.add.text(20, height / 2 - 50, deal.discountedPriceDisplay, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#00ff00',
    }).setOrigin(0.5));

    // Buy button
    const buyBtn = this.add.container(0, height / 2 - 25);

    const btnBg = this.add.graphics();
    if (!deal.isPurchased) {
      btnBg.fillStyle(0xff6600, 1);
    } else {
      btnBg.fillStyle(0x555555, 1);
    }
    btnBg.fillRoundedRect(-50, -12, 100, 24, 8);

    const btnText = this.add.text(0, 0, deal.isPurchased ? 'CLAIMED' : 'BUY NOW', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    buyBtn.add([btnBg, btnText]);
    container.add(buyBtn);

    if (!deal.isPurchased) {
      buyBtn.setSize(100, 24);
      buyBtn.setInteractive({ useHandCursor: true });

      buyBtn.on('pointerdown', () => {
        this.purchaseDailyDeal(deal);
      });
    }

    this.contentContainer.add(container);
  }

  private async loadStoreData(): Promise<void> {
    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // Load offers
      const offersResponse = await fetch(`${SERVER_URL}/api/store/offers`, { headers });
      if (offersResponse.ok) {
        const data = await offersResponse.json();
        this.offers = data.offers;
      }

      // Load daily deals
      const dealsResponse = await fetch(`${SERVER_URL}/api/store/daily-deals`, { headers });
      if (dealsResponse.ok) {
        const data = await dealsResponse.json();
        this.dailyDeals = data.deals;
        this.timeUntilReset = data.timeUntilReset;
      }
    } catch (error) {
      console.error('Error loading store data:', error);
    }
  }

  private async loadCurrencies(): Promise<void> {
    const currencies = await currencyService.fetchCurrencies();
    if (currencies) {
      this.currencies = currencies;
      this.updateCurrencyDisplay();
    }
  }

  private async purchaseOffer(offer: StoreOffer): Promise<void> {
    this.playClickSound();

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${SERVER_URL}/api/store/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ offerId: offer.id }),
      });

      const data = await response.json();

      if (response.ok) {
        this.showPurchaseSuccess(data);
        await this.loadStoreData();
        await this.loadCurrencies();
        this.showTab(this.currentTab);
      } else {
        this.showError(data.error || 'Purchase failed');
      }
    } catch (error) {
      console.error('Purchase error:', error);
      this.showError('Network error');
    }
  }

  private async purchaseDailyDeal(deal: DailyDeal): Promise<void> {
    this.playClickSound();

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${SERVER_URL}/api/store/purchase-daily-deal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dealId: deal.dealId }),
      });

      const data = await response.json();

      if (response.ok) {
        this.showPurchaseSuccess(data);
        await this.loadStoreData();
        await this.loadCurrencies();
        this.showTab(this.currentTab);
      } else {
        this.showError(data.error || 'Purchase failed');
      }
    } catch (error) {
      console.error('Purchase error:', error);
      this.showError('Network error');
    }
  }

  private showPurchaseSuccess(data: { offer: { name: string; gems: number; coins: number; crystals: number } }): void {
    const width = this.scale.width;
    const height = this.scale.height;

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    overlay.setInteractive();

    const popup = this.add.container(width / 2, height / 2);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.UI.panel, 0.98);
    bg.fillRoundedRect(-150, -100, 300, 200, 20);
    bg.lineStyle(3, 0x00ff00, 1);
    bg.strokeRoundedRect(-150, -100, 300, 200, 20);
    popup.add(bg);

    popup.add(this.add.text(0, -60, 'Purchase Complete!', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#00ff00',
    }).setOrigin(0.5));

    popup.add(this.add.text(0, -20, data.offer.name, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5));

    let rewardText = '';
    if (data.offer.gems > 0) rewardText += `💎 ${data.offer.gems} `;
    if (data.offer.coins > 0) rewardText += `🪙 ${data.offer.coins} `;
    if (data.offer.crystals > 0) rewardText += `✨ ${data.offer.crystals}`;

    popup.add(this.add.text(0, 20, rewardText, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      color: '#ffffff',
    }).setOrigin(0.5));

    const closeBtn = this.add.text(0, 70, 'OK', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#00f5ff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    closeBtn.on('pointerdown', () => {
      this.playClickSound();
      overlay.destroy();
      popup.destroy();
    });

    popup.add(closeBtn);
  }

  private showError(message: string): void {
    const width = this.scale.width;
    const height = this.scale.height;

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    overlay.setInteractive();

    const popup = this.add.container(width / 2, height / 2);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.UI.panel, 0.98);
    bg.fillRoundedRect(-150, -80, 300, 160, 20);
    bg.lineStyle(3, 0xff0000, 1);
    bg.strokeRoundedRect(-150, -80, 300, 160, 20);
    popup.add(bg);

    popup.add(this.add.text(0, -40, 'Error', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ff0000',
    }).setOrigin(0.5));

    popup.add(this.add.text(0, 10, message, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      color: '#ffffff',
      wordWrap: { width: 280 },
    }).setOrigin(0.5));

    const closeBtn = this.add.text(0, 55, 'OK', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#00f5ff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    closeBtn.on('pointerdown', () => {
      this.playClickSound();
      overlay.destroy();
      popup.destroy();
    });

    popup.add(closeBtn);
  }

  private setupScrolling(height: number): void {
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      this.scrollY = Phaser.Math.Clamp(this.scrollY + deltaY * 0.5, 0, this.maxScrollY);
      this.contentContainer.y = 160 - this.scrollY;
    });

    // Touch drag scrolling
    let isDragging = false;
    let startY = 0;
    let startScrollY = 0;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y > 120) {
        isDragging = true;
        startY = pointer.y;
        startScrollY = this.scrollY;
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (isDragging) {
        const deltaY = startY - pointer.y;
        this.scrollY = Phaser.Math.Clamp(startScrollY + deltaY, 0, this.maxScrollY);
        this.contentContainer.y = 160 - this.scrollY;
      }
    });

    this.input.on('pointerup', () => {
      isDragging = false;
    });
  }

  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
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
