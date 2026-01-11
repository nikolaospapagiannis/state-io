import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';
import { networkService } from '../services/NetworkService';

interface Achievement {
  id: string;
  name: string;
  description: string;
  category: string;
  points: number;
  hidden: boolean;
  icon: string;
  tier: number;
  unlockedAt: number | null;
  progress: number;
  isUnlocked: boolean;
  criteria: { type: string; target: number };
}

interface AchievementData {
  achievements: Achievement[];
  totalPoints: number;
  unlockedCount: number;
  totalCount: number;
}

const CATEGORY_COLORS: Record<string, number> = {
  combat: 0xff3366,
  collection: 0x00f5ff,
  social: 0x00ff88,
  progression: 0xffaa00,
  mastery: 0xaa44ff,
  special: 0xff00ff,
};

const TIER_COLORS: Record<number, number> = {
  1: 0xcd7f32, // Bronze
  2: 0xc0c0c0, // Silver
  3: 0xffd700, // Gold
  4: 0x00f5ff, // Platinum
};

export class AchievementsScene extends Phaser.Scene {
  private achievements: Achievement[] = [];
  private filteredAchievements: Achievement[] = [];
  private currentCategory: string = 'all';
  private scrollY: number = 0;
  private maxScrollY: number = 0;
  private contentContainer!: Phaser.GameObjects.Container;
  private categoryButtons: Phaser.GameObjects.Container[] = [];
  private statsText!: Phaser.GameObjects.Text;
  private loadingText!: Phaser.GameObjects.Text;
  // Used to track loading state for potential UI updates
  public get isLoadingComplete(): boolean { return !this.isLoading; }
  private isLoading: boolean = true;

  constructor() {
    super({ key: 'AchievementsScene' });
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    this.createBackground();
    this.createHeader(width);
    this.createCategoryFilters(width);
    this.createContentArea(width, height);
    this.createBackButton();

    this.loadAchievements();
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
    this.add.text(width / 2, 40, 'ACHIEVEMENTS', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#00f5ff',
    }).setOrigin(0.5);

    this.statsText = this.add.text(width / 2, 75, 'Loading...', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      color: '#aaaacc',
    }).setOrigin(0.5);
  }

  private createCategoryFilters(width: number): void {
    const categories = ['all', 'combat', 'collection', 'social', 'progression', 'mastery', 'special'];
    const buttonWidth = 90;
    const startX = (width - (categories.length * buttonWidth)) / 2 + buttonWidth / 2;
    const y = 115;

    categories.forEach((category, index) => {
      const x = startX + index * buttonWidth;
      const btn = this.createCategoryButton(x, y, category);
      this.categoryButtons.push(btn);
    });
  }

  private createCategoryButton(x: number, y: number, category: string): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const isSelected = category === this.currentCategory;

    const bg = this.add.graphics();
    const color = category === 'all' ? COLORS.UI.accent : (CATEGORY_COLORS[category] || COLORS.UI.panel);
    bg.fillStyle(isSelected ? color : COLORS.UI.panel, isSelected ? 0.9 : 0.6);
    bg.fillRoundedRect(-40, -15, 80, 30, 8);
    if (isSelected) {
      bg.lineStyle(2, color, 1);
      bg.strokeRoundedRect(-40, -15, 80, 30, 8);
    }

    const label = category.charAt(0).toUpperCase() + category.slice(1);
    const text = this.add.text(0, 0, label, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: isSelected ? '#ffffff' : '#aaaacc',
    }).setOrigin(0.5);

    container.add([bg, text]);
    container.setSize(80, 30);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerdown', () => {
      this.currentCategory = category;
      this.refreshCategoryButtons();
      this.filterAchievements();
      this.renderAchievements();
    });

    return container;
  }

  private refreshCategoryButtons(): void {
    this.categoryButtons.forEach(btn => btn.destroy());
    this.categoryButtons = [];

    const categories = ['all', 'combat', 'collection', 'social', 'progression', 'mastery', 'special'];
    const buttonWidth = 90;
    const startX = (this.scale.width - (categories.length * buttonWidth)) / 2 + buttonWidth / 2;
    const y = 115;

    categories.forEach((category, index) => {
      const x = startX + index * buttonWidth;
      const btn = this.createCategoryButton(x, y, category);
      this.categoryButtons.push(btn);
    });
  }

  private createContentArea(width: number, height: number): void {
    this.contentContainer = this.add.container(0, 150);

    // Create scrollable mask
    const maskGraphics = this.make.graphics({});
    maskGraphics.fillStyle(0xffffff);
    maskGraphics.fillRect(0, 150, width, height - 200);
    const mask = maskGraphics.createGeometryMask();
    this.contentContainer.setMask(mask);

    // Loading text
    this.loadingText = this.add.text(width / 2, height / 2, 'Loading achievements...', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      color: '#aaaacc',
    }).setOrigin(0.5);

    // Enable scrolling
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: unknown[], _deltaX: number, deltaY: number) => {
      this.scrollY = Phaser.Math.Clamp(this.scrollY + deltaY * 0.5, 0, this.maxScrollY);
      this.contentContainer.y = 150 - this.scrollY;
    });

    // Touch/drag scrolling
    let isDragging = false;
    let startY = 0;
    let startScrollY = 0;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y > 150 && pointer.y < this.scale.height - 50) {
        isDragging = true;
        startY = pointer.y;
        startScrollY = this.scrollY;
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (isDragging) {
        const deltaY = startY - pointer.y;
        this.scrollY = Phaser.Math.Clamp(startScrollY + deltaY, 0, this.maxScrollY);
        this.contentContainer.y = 150 - this.scrollY;
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

  private async loadAchievements(): Promise<void> {
    try {
      const user = networkService.currentUser;
      if (!user) {
        this.loadingText.setText('Please log in to view achievements');
        return;
      }

      const response = await fetch(`http://localhost:3001/api/achievements/${user.id}`);
      if (!response.ok) throw new Error('Failed to load');

      const data: AchievementData = await response.json();

      this.achievements = data.achievements;
      this.isLoading = false;
      this.loadingText.destroy();

      this.statsText.setText(
        `${data.unlockedCount}/${data.totalCount} Unlocked | ${data.totalPoints} Points`
      );

      this.filterAchievements();
      this.renderAchievements();
    } catch (error) {
      console.error('Failed to load achievements:', error);
      this.loadingText.setText('Failed to load achievements');
    }
  }

  private filterAchievements(): void {
    if (this.currentCategory === 'all') {
      this.filteredAchievements = [...this.achievements];
    } else {
      this.filteredAchievements = this.achievements.filter(a => a.category === this.currentCategory);
    }

    // Sort: unlocked first, then by tier, then by points
    this.filteredAchievements.sort((a, b) => {
      if (a.isUnlocked !== b.isUnlocked) return a.isUnlocked ? -1 : 1;
      if (a.tier !== b.tier) return b.tier - a.tier;
      return b.points - a.points;
    });
  }

  private renderAchievements(): void {
    this.contentContainer.removeAll(true);

    const width = this.scale.width;
    const cardWidth = Math.min(500, width - 40);
    const cardHeight = 80;
    const padding = 10;
    const startX = width / 2;

    this.filteredAchievements.forEach((achievement, index) => {
      const y = index * (cardHeight + padding) + cardHeight / 2;
      const card = this.createAchievementCard(startX, y, cardWidth, cardHeight, achievement);
      this.contentContainer.add(card);
    });

    this.maxScrollY = Math.max(0, (this.filteredAchievements.length * (cardHeight + padding)) - (this.scale.height - 250));
    this.scrollY = 0;
    this.contentContainer.y = 150;
  }

  private createAchievementCard(
    x: number,
    y: number,
    width: number,
    height: number,
    achievement: Achievement
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // Background
    const bg = this.add.graphics();
    const isUnlocked = achievement.isUnlocked;
    const tierColor = TIER_COLORS[achievement.tier] || TIER_COLORS[1];
    const categoryColor = CATEGORY_COLORS[achievement.category] || COLORS.UI.panel;

    bg.fillStyle(isUnlocked ? 0x1a2a3a : COLORS.UI.panel, isUnlocked ? 0.9 : 0.6);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 12);

    if (isUnlocked) {
      bg.lineStyle(2, tierColor, 0.8);
      bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 12);
    }

    container.add(bg);

    // Category indicator
    const categoryIndicator = this.add.graphics();
    categoryIndicator.fillStyle(categoryColor, 0.8);
    categoryIndicator.fillRect(-width / 2, -height / 2, 4, height);
    container.add(categoryIndicator);

    // Icon placeholder (colored circle based on tier)
    const iconCircle = this.add.graphics();
    iconCircle.fillStyle(isUnlocked ? tierColor : 0x444466, isUnlocked ? 1 : 0.5);
    iconCircle.fillCircle(-width / 2 + 45, 0, 25);
    container.add(iconCircle);

    // Checkmark for unlocked
    if (isUnlocked) {
      const check = this.add.text(-width / 2 + 45, 0, String.fromCharCode(0x2713), {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#ffffff',
      }).setOrigin(0.5);
      container.add(check);
    } else {
      const lock = this.add.text(-width / 2 + 45, 0, '?', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#666688',
      }).setOrigin(0.5);
      container.add(lock);
    }

    // Name
    const name = this.add.text(-width / 2 + 85, -15, achievement.name, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: isUnlocked ? '#ffffff' : '#888888',
    }).setOrigin(0, 0.5);
    container.add(name);

    // Description
    const desc = this.add.text(-width / 2 + 85, 10, achievement.description, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '12px',
      color: isUnlocked ? '#aaaacc' : '#666666',
    }).setOrigin(0, 0.5);
    container.add(desc);

    // Points
    const points = this.add.text(width / 2 - 20, -15, `${achievement.points}`, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: isUnlocked ? '#ffaa00' : '#666666',
    }).setOrigin(1, 0.5);
    container.add(points);

    const pointsLabel = this.add.text(width / 2 - 20, 8, 'points', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '10px',
      color: '#888888',
    }).setOrigin(1, 0.5);
    container.add(pointsLabel);

    // Progress bar for incomplete achievements
    if (!isUnlocked && achievement.criteria.target > 1) {
      const progressBg = this.add.graphics();
      progressBg.fillStyle(0x333355, 0.8);
      progressBg.fillRoundedRect(-width / 2 + 85, 25, 200, 6, 3);
      container.add(progressBg);

      const progressFill = this.add.graphics();
      const progressPercent = Math.min(1, achievement.progress / achievement.criteria.target);
      progressFill.fillStyle(categoryColor, 0.8);
      progressFill.fillRoundedRect(-width / 2 + 85, 25, 200 * progressPercent, 6, 3);
      container.add(progressFill);

      const progressText = this.add.text(-width / 2 + 290, 28, `${achievement.progress}/${achievement.criteria.target}`, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '10px',
        color: '#aaaacc',
      }).setOrigin(0, 0.5);
      container.add(progressText);
    }

    // Unlock date for unlocked achievements
    if (isUnlocked && achievement.unlockedAt) {
      const date = new Date(achievement.unlockedAt * 1000);
      const dateStr = date.toLocaleDateString();
      const dateText = this.add.text(-width / 2 + 85, 28, `Unlocked: ${dateStr}`, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '10px',
        color: '#00ff88',
      }).setOrigin(0, 0.5);
      container.add(dateText);
    }

    return container;
  }
}
