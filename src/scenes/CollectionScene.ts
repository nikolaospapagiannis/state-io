import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';
import { networkService } from '../services/NetworkService';

interface CollectionItem {
  id: string;
  type: string;
  name: string;
  description: string;
  rarity: string;
  previewUrl: string;
  unlockMethod: string;
  price: number | null;
  premiumPrice: number | null;
  owned: boolean;
  setId: string | null;
}

interface CollectionSet {
  id: string;
  name: string;
  description: string;
  items: string[];
  ownedCount: number;
  totalCount: number;
  progress: number;
  isComplete: boolean;
  bonus: { type: string; value: number; description: string };
  rarity: string;
}

interface EquippedItems {
  skin: string | null;
  territory_theme: string | null;
  troop_skin: string | null;
  victory_animation: string | null;
  avatar: string | null;
  frame: string | null;
  title: string | null;
  emote1: string | null;
  emote2: string | null;
  emote3: string | null;
}

interface CollectionData {
  items: CollectionItem[];
  equipped: EquippedItems;
  sets: CollectionSet[];
  stats: {
    totalOwned: number;
    totalItems: number;
    byRarity: Record<string, number>;
    completedSets: number;
    totalSets: number;
  };
  activeBonuses: Array<{ type: string; value: number; description: string }>;
}

const RARITY_COLORS: Record<string, number> = {
  common: 0x888888,
  rare: 0x0088ff,
  epic: 0xaa44ff,
  legendary: 0xffaa00,
  mythic: 0xff3366,
};

const TYPE_LABELS: Record<string, string> = {
  skin: 'Skins',
  territory_theme: 'Themes',
  troop_skin: 'Troops',
  victory_animation: 'Victory',
  avatar: 'Avatars',
  frame: 'Frames',
  title: 'Titles',
  emote: 'Emotes',
};

export class CollectionScene extends Phaser.Scene {
  private collectionData: CollectionData | null = null;
  private currentType: string = 'all';
  private currentRarity: string = 'all';
  private scrollY: number = 0;
  private maxScrollY: number = 0;
  private contentContainer!: Phaser.GameObjects.Container;
  private typeButtons: Phaser.GameObjects.Container[] = [];
  private rarityButtons: Phaser.GameObjects.Container[] = [];
  private statsText!: Phaser.GameObjects.Text;
  private loadingText!: Phaser.GameObjects.Text;
  private filteredItems: CollectionItem[] = [];

  constructor() {
    super({ key: 'CollectionScene' });
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    this.createBackground();
    this.createHeader(width);
    this.createTypeFilters(width);
    this.createRarityFilters(width);
    this.createContentArea(width, height);
    this.createBackButton();

    this.loadCollection();
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
  }

  private createHeader(width: number): void {
    this.add.text(width / 2, 40, 'COLLECTION', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#00f5ff',
    }).setOrigin(0.5);

    this.statsText = this.add.text(width / 2, 75, 'Loading...', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      color: '#aaaacc',
    }).setOrigin(0.5);
  }

  private createTypeFilters(width: number): void {
    const types = ['all', 'skin', 'territory_theme', 'troop_skin', 'avatar', 'frame', 'title'];
    const buttonWidth = 80;
    const buttonsPerRow = Math.min(types.length, Math.floor((width - 40) / buttonWidth));
    const startX = (width - (buttonsPerRow * buttonWidth)) / 2 + buttonWidth / 2;
    const y = 105;

    types.forEach((type, index) => {
      const row = Math.floor(index / buttonsPerRow);
      const col = index % buttonsPerRow;
      const x = startX + col * buttonWidth;
      const btn = this.createTypeButton(x, y + row * 35, type);
      this.typeButtons.push(btn);
    });
  }

  private createTypeButton(x: number, y: number, type: string): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const isSelected = type === this.currentType;

    const bg = this.add.graphics();
    bg.fillStyle(isSelected ? COLORS.UI.accent : COLORS.UI.panel, isSelected ? 0.9 : 0.6);
    bg.fillRoundedRect(-35, -14, 70, 28, 8);
    if (isSelected) {
      bg.lineStyle(2, COLORS.UI.accent, 1);
      bg.strokeRoundedRect(-35, -14, 70, 28, 8);
    }

    const label = type === 'all' ? 'All' : (TYPE_LABELS[type] || type);
    const text = this.add.text(0, 0, label, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: isSelected ? '#ffffff' : '#aaaacc',
    }).setOrigin(0.5);

    container.add([bg, text]);
    container.setSize(70, 28);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerdown', () => {
      this.currentType = type;
      this.refreshFilters();
      this.filterItems();
      this.renderItems();
    });

    return container;
  }

  private createRarityFilters(width: number): void {
    const rarities = ['all', 'common', 'rare', 'epic', 'legendary', 'mythic'];
    const buttonWidth = 90;
    const startX = (width - (rarities.length * buttonWidth)) / 2 + buttonWidth / 2;
    const y = 150;

    rarities.forEach((rarity, index) => {
      const x = startX + index * buttonWidth;
      const btn = this.createRarityButton(x, y, rarity);
      this.rarityButtons.push(btn);
    });
  }

  private createRarityButton(x: number, y: number, rarity: string): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const isSelected = rarity === this.currentRarity;
    const color = rarity === 'all' ? COLORS.UI.accent : (RARITY_COLORS[rarity] || COLORS.UI.panel);

    const bg = this.add.graphics();
    bg.fillStyle(isSelected ? color : COLORS.UI.panel, isSelected ? 0.9 : 0.5);
    bg.fillRoundedRect(-40, -12, 80, 24, 6);
    if (isSelected) {
      bg.lineStyle(2, color, 1);
      bg.strokeRoundedRect(-40, -12, 80, 24, 6);
    }

    const label = rarity.charAt(0).toUpperCase() + rarity.slice(1);
    const text = this.add.text(0, 0, label, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: isSelected ? '#ffffff' : '#888888',
    }).setOrigin(0.5);

    container.add([bg, text]);
    container.setSize(80, 24);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerdown', () => {
      this.currentRarity = rarity;
      this.refreshFilters();
      this.filterItems();
      this.renderItems();
    });

    return container;
  }

  private refreshFilters(): void {
    // Refresh type buttons
    this.typeButtons.forEach(btn => btn.destroy());
    this.typeButtons = [];
    this.createTypeFilters(this.scale.width);

    // Refresh rarity buttons
    this.rarityButtons.forEach(btn => btn.destroy());
    this.rarityButtons = [];
    this.createRarityFilters(this.scale.width);
  }

  private createContentArea(width: number, height: number): void {
    this.contentContainer = this.add.container(0, 185);

    const maskGraphics = this.make.graphics({});
    maskGraphics.fillStyle(0xffffff);
    maskGraphics.fillRect(0, 185, width, height - 235);
    const mask = maskGraphics.createGeometryMask();
    this.contentContainer.setMask(mask);

    this.loadingText = this.add.text(width / 2, height / 2, 'Loading collection...', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      color: '#aaaacc',
    }).setOrigin(0.5);

    // Scrolling
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: unknown[], _deltaX: number, deltaY: number) => {
      this.scrollY = Phaser.Math.Clamp(this.scrollY + deltaY * 0.5, 0, this.maxScrollY);
      this.contentContainer.y = 185 - this.scrollY;
    });

    let isDragging = false;
    let startY = 0;
    let startScrollY = 0;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y > 185 && pointer.y < this.scale.height - 50) {
        isDragging = true;
        startY = pointer.y;
        startScrollY = this.scrollY;
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (isDragging) {
        const deltaY = startY - pointer.y;
        this.scrollY = Phaser.Math.Clamp(startScrollY + deltaY, 0, this.maxScrollY);
        this.contentContainer.y = 185 - this.scrollY;
      }
    });

    this.input.on('pointerup', () => {
      isDragging = false;
    });
  }

  private createBackButton(): void {
    const container = this.add.container(60, 40);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.UI.panel, 0.8);
    bg.fillRoundedRect(-40, -20, 80, 40, 10);

    const text = this.add.text(0, 0, '< BACK', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    container.add([bg, text]);
    container.setSize(80, 40);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerdown', () => {
      this.scene.start('MenuScene');
    });
  }

  private async loadCollection(): Promise<void> {
    try {
      const user = networkService.currentUser;
      if (!user) {
        this.loadingText.setText('Please log in to view collection');
        return;
      }

      const response = await fetch(`http://localhost:3001/api/collections/${user.id}`);
      if (!response.ok) throw new Error('Failed to load');

      this.collectionData = await response.json();
      this.loadingText.destroy();

      this.updateStats();
      this.filterItems();
      this.renderItems();
    } catch (error) {
      console.error('Failed to load collection:', error);
      this.loadingText.setText('Failed to load collection');
    }
  }

  private updateStats(): void {
    if (!this.collectionData) return;

    const { stats } = this.collectionData;
    this.statsText.setText(
      `${stats.totalOwned}/${stats.totalItems} Items | ${stats.completedSets}/${stats.totalSets} Sets Complete`
    );
  }

  private filterItems(): void {
    if (!this.collectionData) return;

    this.filteredItems = this.collectionData.items.filter(item => {
      if (this.currentType !== 'all' && item.type !== this.currentType) return false;
      if (this.currentRarity !== 'all' && item.rarity !== this.currentRarity) return false;
      return true;
    });

    // Sort: owned first, then by rarity (mythic > legendary > epic > rare > common)
    const rarityOrder = { mythic: 5, legendary: 4, epic: 3, rare: 2, common: 1 };
    this.filteredItems.sort((a, b) => {
      if (a.owned !== b.owned) return a.owned ? -1 : 1;
      return (rarityOrder[b.rarity as keyof typeof rarityOrder] || 0) - (rarityOrder[a.rarity as keyof typeof rarityOrder] || 0);
    });
  }

  private renderItems(): void {
    this.contentContainer.removeAll(true);

    if (!this.collectionData) return;

    const width = this.scale.width;
    const cardSize = 100;
    const padding = 10;
    const columns = Math.floor((width - 40) / (cardSize + padding));
    const startX = (width - (columns * (cardSize + padding) - padding)) / 2 + cardSize / 2;

    this.filteredItems.forEach((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + col * (cardSize + padding);
      const y = row * (cardSize + padding + 30) + cardSize / 2;

      const card = this.createItemCard(x, y, cardSize, item);
      this.contentContainer.add(card);
    });

    const rows = Math.ceil(this.filteredItems.length / columns);
    this.maxScrollY = Math.max(0, (rows * (cardSize + padding + 30)) - (this.scale.height - 285));
    this.scrollY = 0;
    this.contentContainer.y = 185;
  }

  private createItemCard(x: number, y: number, size: number, item: CollectionItem): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    const rarityColor = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
    const isEquipped = this.isItemEquipped(item.id);

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(item.owned ? 0x1a2a3a : COLORS.UI.panel, item.owned ? 0.9 : 0.5);
    bg.fillRoundedRect(-size / 2, -size / 2, size, size, 10);

    // Rarity border
    if (item.owned) {
      bg.lineStyle(2, rarityColor, 0.8);
      bg.strokeRoundedRect(-size / 2, -size / 2, size, size, 10);
    }

    container.add(bg);

    // Equipped indicator
    if (isEquipped) {
      const equippedBg = this.add.graphics();
      equippedBg.fillStyle(0x00ff88, 0.9);
      equippedBg.fillRoundedRect(-size / 2, -size / 2, 30, 18, { tl: 10, tr: 0, bl: 0, br: 8 });
      container.add(equippedBg);

      const equippedText = this.add.text(-size / 2 + 15, -size / 2 + 9, 'E', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#000000',
      }).setOrigin(0.5);
      container.add(equippedText);
    }

    // Icon placeholder
    const iconBg = this.add.graphics();
    iconBg.fillStyle(item.owned ? rarityColor : 0x444466, item.owned ? 0.3 : 0.3);
    iconBg.fillCircle(0, -10, 25);
    container.add(iconBg);

    // Type icon (placeholder text)
    const typeIcon = this.getTypeIcon(item.type);
    const icon = this.add.text(0, -10, typeIcon, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      color: item.owned ? '#ffffff' : '#666666',
    }).setOrigin(0.5);
    container.add(icon);

    // Lock icon for unowned
    if (!item.owned) {
      const lock = this.add.text(size / 2 - 12, -size / 2 + 12, String.fromCharCode(0x1F512), {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '14px',
      }).setOrigin(0.5);
      container.add(lock);
    }

    // Name (below card)
    const name = this.add.text(0, size / 2 + 10, item.name, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: item.owned ? '#ffffff' : '#666666',
    }).setOrigin(0.5);
    container.add(name);

    // Rarity label
    const rarityLabel = this.add.text(0, size / 2 + 25, item.rarity.toUpperCase(), {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '9px',
      color: Phaser.Display.Color.IntegerToColor(rarityColor).rgba,
    }).setOrigin(0.5);
    container.add(rarityLabel);

    // Make interactive
    container.setSize(size, size);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerdown', () => {
      this.showItemDetail(item);
    });

    container.on('pointerover', () => {
      this.tweens.add({
        targets: container,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 100,
      });
    });

    container.on('pointerout', () => {
      this.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 100,
      });
    });

    return container;
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
      emote: String.fromCharCode(0x1F600),
    };
    return icons[type] || '?';
  }

  private isItemEquipped(itemId: string): boolean {
    if (!this.collectionData) return false;
    const eq = this.collectionData.equipped;
    return [
      eq.skin, eq.territory_theme, eq.troop_skin, eq.victory_animation,
      eq.avatar, eq.frame, eq.title, eq.emote1, eq.emote2, eq.emote3
    ].includes(itemId);
  }

  private showItemDetail(item: CollectionItem): void {
    const width = this.scale.width;
    const height = this.scale.height;

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    overlay.setInteractive();

    const panel = this.add.container(width / 2, height / 2);

    const bg = this.add.graphics();
    const rarityColor = RARITY_COLORS[item.rarity] || RARITY_COLORS.common;
    bg.fillStyle(COLORS.UI.panel, 0.95);
    bg.fillRoundedRect(-160, -180, 320, 360, 15);
    bg.lineStyle(3, rarityColor, 0.9);
    bg.strokeRoundedRect(-160, -180, 320, 360, 15);
    panel.add(bg);

    // Item preview
    const previewBg = this.add.graphics();
    previewBg.fillStyle(rarityColor, 0.2);
    previewBg.fillCircle(0, -100, 50);
    panel.add(previewBg);

    const typeIcon = this.getTypeIcon(item.type);
    const icon = this.add.text(0, -100, typeIcon, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '40px',
    }).setOrigin(0.5);
    panel.add(icon);

    // Name
    const name = this.add.text(0, -30, item.name, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    panel.add(name);

    // Rarity
    const rarity = this.add.text(0, 0, item.rarity.toUpperCase(), {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: Phaser.Display.Color.IntegerToColor(rarityColor).rgba,
    }).setOrigin(0.5);
    panel.add(rarity);

    // Description
    const desc = this.add.text(0, 35, item.description, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      color: '#aaaacc',
      align: 'center',
      wordWrap: { width: 280 },
    }).setOrigin(0.5, 0);
    panel.add(desc);

    // Unlock method / price
    let unlockText: string;
    if (item.owned) {
      unlockText = 'OWNED';
    } else if (item.unlockMethod === 'shop') {
      if (item.price) {
        unlockText = `${item.price} Gold`;
      } else if (item.premiumPrice) {
        unlockText = `${item.premiumPrice} Gems`;
      } else {
        unlockText = 'Shop';
      }
    } else if (item.unlockMethod === 'achievement') {
      unlockText = 'Achievement Reward';
    } else if (item.unlockMethod === 'season') {
      unlockText = 'Season Reward';
    } else if (item.unlockMethod === 'rank') {
      unlockText = 'Rank Reward';
    } else {
      unlockText = item.unlockMethod;
    }

    const unlockLabel = this.add.text(0, 85, unlockText, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      color: item.owned ? '#00ff88' : '#ffaa00',
    }).setOrigin(0.5);
    panel.add(unlockLabel);

    // Action buttons
    if (item.owned) {
      const isEquipped = this.isItemEquipped(item.id);

      const equipBtn = this.add.container(0, 130);
      const btnBg = this.add.graphics();
      btnBg.fillStyle(isEquipped ? 0x666666 : 0x00aa44, 0.9);
      btnBg.fillRoundedRect(-60, -18, 120, 36, 10);

      const btnText = this.add.text(0, 0, isEquipped ? 'EQUIPPED' : 'EQUIP', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffffff',
      }).setOrigin(0.5);

      equipBtn.add([btnBg, btnText]);

      if (!isEquipped) {
        equipBtn.setSize(120, 36);
        equipBtn.setInteractive({ useHandCursor: true });
        equipBtn.on('pointerdown', () => {
          this.equipItem(item.id);
          overlay.destroy();
          panel.destroy();
        });
      }

      panel.add(equipBtn);
    } else if (item.unlockMethod === 'shop' && (item.price || item.premiumPrice)) {
      const buyBtn = this.add.container(0, 130);
      const btnBg = this.add.graphics();
      btnBg.fillStyle(0xffaa00, 0.9);
      btnBg.fillRoundedRect(-60, -18, 120, 36, 10);

      const btnText = this.add.text(0, 0, 'PURCHASE', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#000000',
      }).setOrigin(0.5);

      buyBtn.add([btnBg, btnText]);
      buyBtn.setSize(120, 36);
      buyBtn.setInteractive({ useHandCursor: true });
      buyBtn.on('pointerdown', () => {
        this.purchaseItem(item.id, item.price ? 'gold' : 'gems');
        overlay.destroy();
        panel.destroy();
      });

      panel.add(buyBtn);
    }

    // Close button
    const closeBtn = this.add.text(0, 160, 'CLOSE', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      color: '#aaaacc',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    panel.add(closeBtn);

    closeBtn.on('pointerdown', () => {
      overlay.destroy();
      panel.destroy();
    });
  }

  private async equipItem(itemId: string): Promise<void> {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/collections/equip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ itemId }),
      });

      if (!response.ok) throw new Error('Failed to equip');

      await this.loadCollection();
    } catch (error) {
      console.error('Failed to equip item:', error);
    }
  }

  private async purchaseItem(itemId: string, currency: 'gold' | 'gems'): Promise<void> {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/collections/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ itemId, currency }),
      });

      if (!response.ok) throw new Error('Failed to purchase');

      await this.loadCollection();
    } catch (error) {
      console.error('Failed to purchase item:', error);
    }
  }
}
