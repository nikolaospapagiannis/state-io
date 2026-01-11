import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';
import { networkService } from '../services/NetworkService';

interface QuestReward {
  type: string;
  amount: number;
  itemId?: string;
}

interface Quest {
  id: number;
  questId: string;
  name: string;
  description: string;
  progress: number;
  target: number;
  progressPercent: number;
  completed: boolean;
  completedAt: number | null;
  expiresAt: number;
  claimed: boolean;
  rewards: QuestReward[];
  difficulty: string;
}

interface QuestData {
  daily: Quest[];
  weekly: Quest[];
  monthly: Quest[];
  streak: {
    current: number;
    longest: number;
    lastCompletion: number | null;
    totalCompleted: number;
    refreshTokens: number;
    bonusPercent: number;
  };
  dailyReset: number;
  weeklyReset: number;
  monthlyReset: number;
}

const DIFFICULTY_COLORS: Record<string, number> = {
  easy: 0x00ff88,
  medium: 0xffaa00,
  hard: 0xff3366,
  epic: 0xaa44ff,
};

export class QuestsScene extends Phaser.Scene {
  private questData: QuestData | null = null;
  private currentTab: 'daily' | 'weekly' | 'monthly' = 'daily';
  private scrollY: number = 0;
  private maxScrollY: number = 0;
  private contentContainer!: Phaser.GameObjects.Container;
  private tabButtons: Phaser.GameObjects.Container[] = [];
  private streakContainer!: Phaser.GameObjects.Container;
  private timerText!: Phaser.GameObjects.Text;
  private loadingText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'QuestsScene' });
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    this.createBackground();
    this.createHeader(width);
    this.createStreakDisplay(width);
    this.createTabButtons(width);
    this.createContentArea(width, height);
    this.createBackButton();

    this.loadQuests();

    // Update timer every second
    this.time.addEvent({
      delay: 1000,
      callback: this.updateTimer,
      callbackScope: this,
      loop: true,
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
  }

  private createHeader(width: number): void {
    this.add.text(width / 2, 40, 'QUESTS', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#00f5ff',
    }).setOrigin(0.5);

    this.timerText = this.add.text(width / 2, 75, '', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      color: '#ffaa00',
    }).setOrigin(0.5);
  }

  private createStreakDisplay(width: number): void {
    this.streakContainer = this.add.container(width / 2, 105);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.UI.panel, 0.8);
    bg.fillRoundedRect(-150, -20, 300, 40, 10);
    this.streakContainer.add(bg);

    // Will be updated when data loads
  }

  private createTabButtons(width: number): void {
    const tabs: Array<'daily' | 'weekly' | 'monthly'> = ['daily', 'weekly', 'monthly'];
    const buttonWidth = 120;
    const startX = width / 2 - buttonWidth;
    const y = 155;

    tabs.forEach((tab, index) => {
      const x = startX + index * buttonWidth;
      const btn = this.createTabButton(x, y, tab);
      this.tabButtons.push(btn);
    });
  }

  private createTabButton(x: number, y: number, tab: 'daily' | 'weekly' | 'monthly'): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const isSelected = tab === this.currentTab;

    const bg = this.add.graphics();
    bg.fillStyle(isSelected ? COLORS.UI.accent : COLORS.UI.panel, isSelected ? 0.9 : 0.6);
    bg.fillRoundedRect(-50, -18, 100, 36, 10);
    if (isSelected) {
      bg.lineStyle(2, COLORS.UI.accent, 1);
      bg.strokeRoundedRect(-50, -18, 100, 36, 10);
    }

    const label = tab.charAt(0).toUpperCase() + tab.slice(1);
    const text = this.add.text(0, 0, label, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: isSelected ? '#ffffff' : '#aaaacc',
    }).setOrigin(0.5);

    container.add([bg, text]);
    container.setSize(100, 36);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerdown', () => {
      this.currentTab = tab;
      this.refreshTabButtons();
      this.renderQuests();
      this.updateTimer();
    });

    return container;
  }

  private refreshTabButtons(): void {
    this.tabButtons.forEach(btn => btn.destroy());
    this.tabButtons = [];

    const tabs: Array<'daily' | 'weekly' | 'monthly'> = ['daily', 'weekly', 'monthly'];
    const buttonWidth = 120;
    const startX = this.scale.width / 2 - buttonWidth;
    const y = 155;

    tabs.forEach((tab, index) => {
      const x = startX + index * buttonWidth;
      const btn = this.createTabButton(x, y, tab);
      this.tabButtons.push(btn);
    });
  }

  private createContentArea(width: number, height: number): void {
    this.contentContainer = this.add.container(0, 190);

    const maskGraphics = this.make.graphics({});
    maskGraphics.fillStyle(0xffffff);
    maskGraphics.fillRect(0, 190, width, height - 240);
    const mask = maskGraphics.createGeometryMask();
    this.contentContainer.setMask(mask);

    this.loadingText = this.add.text(width / 2, height / 2, 'Loading quests...', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      color: '#aaaacc',
    }).setOrigin(0.5);

    // Scrolling
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: unknown[], _deltaX: number, deltaY: number) => {
      this.scrollY = Phaser.Math.Clamp(this.scrollY + deltaY * 0.5, 0, this.maxScrollY);
      this.contentContainer.y = 190 - this.scrollY;
    });

    let isDragging = false;
    let startY = 0;
    let startScrollY = 0;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y > 190 && pointer.y < this.scale.height - 50) {
        isDragging = true;
        startY = pointer.y;
        startScrollY = this.scrollY;
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (isDragging) {
        const deltaY = startY - pointer.y;
        this.scrollY = Phaser.Math.Clamp(startScrollY + deltaY, 0, this.maxScrollY);
        this.contentContainer.y = 190 - this.scrollY;
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

  private async loadQuests(): Promise<void> {
    try {
      const user = networkService.currentUser;
      if (!user) {
        this.loadingText.setText('Please log in to view quests');
        return;
      }

      const response = await fetch(`http://localhost:3001/api/quests/${user.id}`);
      if (!response.ok) throw new Error('Failed to load');

      this.questData = await response.json();
      this.loadingText.destroy();

      this.updateStreakDisplay();
      this.renderQuests();
      this.updateTimer();
    } catch (error) {
      console.error('Failed to load quests:', error);
      this.loadingText.setText('Failed to load quests');
    }
  }

  private updateStreakDisplay(): void {
    if (!this.questData) return;

    this.streakContainer.removeAll(true);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.UI.panel, 0.8);
    bg.fillRoundedRect(-150, -20, 300, 40, 10);
    this.streakContainer.add(bg);

    // Streak flame icon
    const flame = this.add.text(-120, 0, String.fromCharCode(0x1F525), {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
    }).setOrigin(0.5);
    this.streakContainer.add(flame);

    // Current streak
    const streakText = this.add.text(-85, 0, `${this.questData.streak.current} Day Streak`, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: this.questData.streak.current > 0 ? '#ffaa00' : '#888888',
    }).setOrigin(0, 0.5);
    this.streakContainer.add(streakText);

    // Bonus indicator
    if (this.questData.streak.bonusPercent > 0) {
      const bonus = this.add.text(50, 0, `+${this.questData.streak.bonusPercent}% Bonus`, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '12px',
        color: '#00ff88',
      }).setOrigin(0, 0.5);
      this.streakContainer.add(bonus);
    }

    // Refresh tokens
    const tokens = this.add.text(120, 0, `${this.questData.streak.refreshTokens}`, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#00f5ff',
    }).setOrigin(1, 0.5);
    this.streakContainer.add(tokens);

    const tokenIcon = this.add.text(135, 0, String.fromCharCode(0x21BB), {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      color: '#00f5ff',
    }).setOrigin(0.5);
    this.streakContainer.add(tokenIcon);
  }

  private updateTimer(): void {
    if (!this.questData) return;

    const now = Math.floor(Date.now() / 1000);
    let resetTime: number;
    let label: string;

    switch (this.currentTab) {
      case 'daily':
        resetTime = this.questData.dailyReset;
        label = 'Daily';
        break;
      case 'weekly':
        resetTime = this.questData.weeklyReset;
        label = 'Weekly';
        break;
      case 'monthly':
        resetTime = this.questData.monthlyReset;
        label = 'Monthly';
        break;
    }

    const remaining = resetTime - now;
    if (remaining > 0) {
      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;

      let timeStr: string;
      if (hours > 24) {
        const days = Math.floor(hours / 24);
        timeStr = `${days}d ${hours % 24}h`;
      } else if (hours > 0) {
        timeStr = `${hours}h ${minutes}m`;
      } else {
        timeStr = `${minutes}m ${seconds}s`;
      }

      this.timerText.setText(`${label} Reset: ${timeStr}`);
    } else {
      this.timerText.setText(`${label} quests refreshing...`);
    }
  }

  private renderQuests(): void {
    this.contentContainer.removeAll(true);

    if (!this.questData) return;

    const quests = this.questData[this.currentTab];
    const width = this.scale.width;
    const cardWidth = Math.min(500, width - 40);
    const cardHeight = 100;
    const padding = 12;
    const startX = width / 2;

    if (quests.length === 0) {
      const noQuests = this.add.text(startX, 50, 'No quests available', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '16px',
        color: '#888888',
      }).setOrigin(0.5);
      this.contentContainer.add(noQuests);
      return;
    }

    quests.forEach((quest, index) => {
      const y = index * (cardHeight + padding) + cardHeight / 2;
      const card = this.createQuestCard(startX, y, cardWidth, cardHeight, quest);
      this.contentContainer.add(card);
    });

    this.maxScrollY = Math.max(0, (quests.length * (cardHeight + padding)) - (this.scale.height - 290));
    this.scrollY = 0;
    this.contentContainer.y = 190;
  }

  private createQuestCard(
    x: number,
    y: number,
    width: number,
    height: number,
    quest: Quest
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // Background
    const bg = this.add.graphics();
    const diffColor = DIFFICULTY_COLORS[quest.difficulty] || COLORS.UI.panel;

    if (quest.claimed) {
      bg.fillStyle(0x1a2a3a, 0.5);
    } else if (quest.completed) {
      bg.fillStyle(0x1a3a2a, 0.9);
      bg.lineStyle(2, 0x00ff88, 0.8);
      bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 12);
    } else {
      bg.fillStyle(COLORS.UI.panel, 0.8);
    }
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 12);

    container.add(bg);

    // Difficulty indicator
    const diffIndicator = this.add.graphics();
    diffIndicator.fillStyle(diffColor, 0.8);
    diffIndicator.fillRect(-width / 2, -height / 2, 4, height);
    container.add(diffIndicator);

    // Quest name
    const name = this.add.text(-width / 2 + 20, -25, quest.name, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: quest.claimed ? '#666666' : '#ffffff',
    }).setOrigin(0, 0.5);
    container.add(name);

    // Difficulty badge
    const diffBadge = this.add.text(-width / 2 + 20 + name.width + 10, -25, quest.difficulty.toUpperCase(), {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '10px',
      fontStyle: 'bold',
      color: Phaser.Display.Color.IntegerToColor(diffColor).rgba,
    }).setOrigin(0, 0.5);
    container.add(diffBadge);

    // Description
    const desc = this.add.text(-width / 2 + 20, -5, quest.description, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '12px',
      color: quest.claimed ? '#555555' : '#aaaacc',
    }).setOrigin(0, 0.5);
    container.add(desc);

    // Progress bar
    const progressBg = this.add.graphics();
    progressBg.fillStyle(0x333355, 0.8);
    progressBg.fillRoundedRect(-width / 2 + 20, 10, 250, 8, 4);
    container.add(progressBg);

    const progressFill = this.add.graphics();
    const progressPercent = quest.completed ? 1 : quest.progress / quest.target;
    progressFill.fillStyle(quest.completed ? 0x00ff88 : diffColor, 0.9);
    progressFill.fillRoundedRect(-width / 2 + 20, 10, 250 * progressPercent, 8, 4);
    container.add(progressFill);

    // Progress text
    const progressText = this.add.text(-width / 2 + 280, 14, `${quest.progress}/${quest.target}`, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '11px',
      color: quest.completed ? '#00ff88' : '#aaaacc',
    }).setOrigin(0, 0.5);
    container.add(progressText);

    // Rewards
    const rewardsX = width / 2 - 100;
    quest.rewards.forEach((reward, i) => {
      const rewardText = this.add.text(rewardsX, -25 + i * 18, this.formatReward(reward), {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '12px',
        color: quest.claimed ? '#555555' : '#ffaa00',
      }).setOrigin(0, 0.5);
      container.add(rewardText);
    });

    // Claim button or status
    if (quest.completed && !quest.claimed) {
      const claimBtn = this.add.container(width / 2 - 50, 20);

      const btnBg = this.add.graphics();
      btnBg.fillStyle(0x00aa44, 0.9);
      btnBg.fillRoundedRect(-40, -15, 80, 30, 8);

      const btnText = this.add.text(0, 0, 'CLAIM', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#ffffff',
      }).setOrigin(0.5);

      claimBtn.add([btnBg, btnText]);
      claimBtn.setSize(80, 30);
      claimBtn.setInteractive({ useHandCursor: true });

      claimBtn.on('pointerdown', () => {
        this.claimQuest(quest.id);
      });

      container.add(claimBtn);
    } else if (quest.claimed) {
      const claimedText = this.add.text(width / 2 - 50, 20, 'CLAIMED', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '12px',
        color: '#00ff88',
      }).setOrigin(0.5);
      container.add(claimedText);
    }

    return container;
  }

  private formatReward(reward: QuestReward): string {
    switch (reward.type) {
      case 'gold':
        return `+${reward.amount} Gold`;
      case 'gems':
        return `+${reward.amount} Gems`;
      case 'xp':
        return `+${reward.amount} XP`;
      case 'chest':
        return `+${reward.amount} Chest`;
      default:
        return `+${reward.amount} ${reward.type}`;
    }
  }

  private async claimQuest(questId: number): Promise<void> {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/quests/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ questId }),
      });

      if (!response.ok) throw new Error('Failed to claim');

      const result = await response.json();
      console.log('Quest claimed:', result);

      // Reload quests
      await this.loadQuests();

      // Show reward notification
      this.showRewardNotification(result.rewards, result.streakBonus);
    } catch (error) {
      console.error('Failed to claim quest:', error);
    }
  }

  private showRewardNotification(rewards: QuestReward[], streakBonus: number): void {
    const width = this.scale.width;
    const height = this.scale.height;

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5);
    overlay.setInteractive();

    const panel = this.add.container(width / 2, height / 2);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.UI.panel, 0.95);
    bg.fillRoundedRect(-150, -120, 300, 240, 15);
    bg.lineStyle(2, 0x00ff88, 0.8);
    bg.strokeRoundedRect(-150, -120, 300, 240, 15);
    panel.add(bg);

    const title = this.add.text(0, -90, 'QUEST COMPLETE!', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#00ff88',
    }).setOrigin(0.5);
    panel.add(title);

    rewards.forEach((reward, i) => {
      const rewardText = this.add.text(0, -40 + i * 30, this.formatReward(reward), {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '18px',
        color: '#ffaa00',
      }).setOrigin(0.5);
      panel.add(rewardText);
    });

    if (streakBonus > 0) {
      const bonusText = this.add.text(0, 40, `+${streakBonus}% Streak Bonus Applied!`, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '14px',
        color: '#00ff88',
      }).setOrigin(0.5);
      panel.add(bonusText);
    }

    const closeBtn = this.add.text(0, 90, 'OK', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#00f5ff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    panel.add(closeBtn);

    closeBtn.on('pointerdown', () => {
      overlay.destroy();
      panel.destroy();
    });
  }
}
