import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';

export type ReactionType = 'gg' | 'wp' | 'rematch' | 'close' | 'amazing';

export interface Reaction {
  type: ReactionType;
  label: string;
  icon: string;
  color: number;
}

export interface ReceivedReaction {
  playerId: string;
  username: string;
  team: number;
  reactionType: ReactionType;
}

export class PostGameReactions extends Phaser.GameObjects.Container {
  private background: Phaser.GameObjects.Graphics;
  private reactionButtons: Map<ReactionType, Phaser.GameObjects.Container> = new Map();
  private reactionCounts: Map<ReactionType, number> = new Map();
  private reactionLabels: Map<ReactionType, Phaser.GameObjects.Text> = new Map();
  private playerReactions: Set<ReactionType> = new Set();
  private rematchContainer: Phaser.GameObjects.Container | null = null;
  private rematchProgress: Phaser.GameObjects.Graphics | null = null;
  private rematchCount = 0;
  private totalPlayers = 0;

  private onReaction: ((type: ReactionType) => void) | null = null;

  private static REACTIONS: Reaction[] = [
    { type: 'gg', label: 'GG', icon: 'G', color: 0x00f5ff },
    { type: 'wp', label: 'Well Played', icon: 'W', color: 0x00ff88 },
    { type: 'amazing', label: 'Amazing!', icon: '!', color: 0xffaa00 },
    { type: 'close', label: 'Close Game', icon: '~', color: 0x9933ff },
    { type: 'rematch', label: 'Rematch?', icon: 'R', color: 0xff3366 },
  ];

  private static TEAM_COLORS = [0x00f5ff, 0xff6666, 0x00ff88, 0xffaa00, 0xff00ff, 0xffff00, 0xff8800, 0x8800ff];

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    // Initialize counts
    PostGameReactions.REACTIONS.forEach(r => {
      this.reactionCounts.set(r.type, 0);
    });

    // Create background panel
    this.background = scene.add.graphics();
    this.add(this.background);

    // Create UI
    this.createReactionPanel();

    // Initially hidden
    this.setVisible(false);
    this.setAlpha(0);
    this.setDepth(400);

    scene.add.existing(this);
  }

  private createReactionPanel(): void {
    const panelWidth = 320;
    const panelHeight = 140;

    // Draw panel background
    this.background.fillStyle(COLORS.UI.panel, 0.95);
    this.background.fillRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
    this.background.lineStyle(2, COLORS.UI.accent, 0.6);
    this.background.strokeRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);

    // Title
    const title = this.scene.add.text(0, -panelHeight / 2 + 20, 'REACTIONS', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#aaaacc',
    }).setOrigin(0.5);
    this.add(title);

    // Create reaction buttons
    const buttonWidth = 55;
    const buttonHeight = 50;
    const startX = -((PostGameReactions.REACTIONS.length - 1) * buttonWidth) / 2;

    PostGameReactions.REACTIONS.forEach((reaction, index) => {
      const btnX = startX + index * buttonWidth;
      const btnY = 10;

      const btnContainer = this.createReactionButton(reaction, btnX, btnY, buttonWidth - 8, buttonHeight);
      this.add(btnContainer);
      this.reactionButtons.set(reaction.type, btnContainer);
    });

    // Rematch progress (shown below buttons when rematch is clicked)
    this.createRematchProgress();
  }

  private createReactionButton(
    reaction: Reaction,
    x: number,
    y: number,
    width: number,
    height: number
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);

    // Button background
    const bg = this.scene.add.graphics();
    bg.fillStyle(COLORS.UI.background, 0.8);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
    bg.lineStyle(2, reaction.color, 0.6);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
    container.add(bg);

    // Icon
    const icon = this.scene.add.text(0, -8, reaction.icon, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: `#${reaction.color.toString(16).padStart(6, '0')}`,
    }).setOrigin(0.5);
    container.add(icon);

    // Count label
    const countLabel = this.scene.add.text(0, 15, '0', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '12px',
      color: '#888888',
    }).setOrigin(0.5);
    container.add(countLabel);
    this.reactionLabels.set(reaction.type, countLabel);

    // Make interactive
    container.setSize(width, height);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerover', () => {
      if (!this.playerReactions.has(reaction.type)) {
        bg.clear();
        bg.fillStyle(reaction.color, 0.3);
        bg.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
        bg.lineStyle(2, reaction.color, 1);
        bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
      }
    });

    container.on('pointerout', () => {
      if (!this.playerReactions.has(reaction.type)) {
        bg.clear();
        bg.fillStyle(COLORS.UI.background, 0.8);
        bg.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
        bg.lineStyle(2, reaction.color, 0.6);
        bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
      }
    });

    container.on('pointerdown', () => {
      if (!this.playerReactions.has(reaction.type)) {
        this.selectReaction(reaction.type);

        // Animate press
        this.scene.tweens.add({
          targets: container,
          scale: { from: 1, to: 0.9 },
          duration: 50,
          yoyo: true,
        });
      }
    });

    container.setData('bg', bg);
    container.setData('reaction', reaction);

    return container;
  }

  private selectReaction(type: ReactionType): void {
    // Mark as selected
    this.playerReactions.add(type);

    // Update button appearance
    const container = this.reactionButtons.get(type);
    if (container) {
      const bg = container.getData('bg') as Phaser.GameObjects.Graphics;
      const reaction = container.getData('reaction') as Reaction;
      const width = 47;
      const height = 50;

      bg.clear();
      bg.fillStyle(reaction.color, 0.5);
      bg.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
      bg.lineStyle(3, reaction.color, 1);
      bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
    }

    // Increment count locally
    const currentCount = this.reactionCounts.get(type) || 0;
    this.reactionCounts.set(type, currentCount + 1);
    this.updateCountLabel(type);

    // Trigger callback
    if (this.onReaction) {
      this.onReaction(type);
    }
  }

  private updateCountLabel(type: ReactionType): void {
    const label = this.reactionLabels.get(type);
    const count = this.reactionCounts.get(type) || 0;

    if (label) {
      label.setText(count.toString());

      // Animate count change
      this.scene.tweens.add({
        targets: label,
        scale: { from: 1.3, to: 1 },
        duration: 150,
      });
    }
  }

  private createRematchProgress(): void {
    this.rematchContainer = this.scene.add.container(0, 55);
    this.rematchContainer.setVisible(false);

    // Progress bar background
    const progressBg = this.scene.add.graphics();
    progressBg.fillStyle(COLORS.UI.background, 0.8);
    progressBg.fillRoundedRect(-100, -8, 200, 16, 4);
    this.rematchContainer.add(progressBg);

    // Progress bar fill
    this.rematchProgress = this.scene.add.graphics();
    this.rematchContainer.add(this.rematchProgress);

    // Label
    const label = this.scene.add.text(0, 0, 'Waiting for players...', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '10px',
      color: '#888888',
    }).setOrigin(0.5);
    this.rematchContainer.add(label);
    this.rematchContainer.setData('label', label);

    this.add(this.rematchContainer);
  }

  public updateRematchProgress(count: number, total: number): void {
    this.rematchCount = count;
    this.totalPlayers = total;

    if (!this.rematchContainer || !this.rematchProgress) return;

    this.rematchContainer.setVisible(true);

    // Update progress bar
    const progress = total > 0 ? count / total : 0;
    const barWidth = 196;
    const fillWidth = barWidth * progress;

    this.rematchProgress.clear();
    if (fillWidth > 0) {
      this.rematchProgress.fillStyle(0xff3366, 0.8);
      this.rematchProgress.fillRoundedRect(-98, -6, fillWidth, 12, 3);
    }

    // Update label
    const label = this.rematchContainer.getData('label') as Phaser.GameObjects.Text;
    if (label) {
      if (count >= total && total > 0) {
        label.setText('Starting rematch...');
        label.setColor('#00ff88');
      } else {
        label.setText(`${count}/${total} want rematch`);
        label.setColor('#888888');
      }
    }
  }

  public receiveReaction(reaction: ReceivedReaction): void {
    const currentCount = this.reactionCounts.get(reaction.reactionType) || 0;
    this.reactionCounts.set(reaction.reactionType, currentCount + 1);
    this.updateCountLabel(reaction.reactionType);

    // Show floating reaction indicator
    this.showFloatingReaction(reaction);
  }

  private showFloatingReaction(reaction: ReceivedReaction): void {
    const reactionDef = PostGameReactions.REACTIONS.find(r => r.type === reaction.reactionType);
    if (!reactionDef) return;

    const teamColor = PostGameReactions.TEAM_COLORS[reaction.team % PostGameReactions.TEAM_COLORS.length];

    // Random position near center
    const offsetX = Phaser.Math.Between(-100, 100);
    const offsetY = Phaser.Math.Between(-20, 20);

    const floater = this.scene.add.container(offsetX, offsetY);

    // Small bubble
    const bubble = this.scene.add.graphics();
    bubble.fillStyle(COLORS.UI.panel, 0.9);
    bubble.fillRoundedRect(-30, -15, 60, 30, 6);
    bubble.lineStyle(2, teamColor, 0.8);
    bubble.strokeRoundedRect(-30, -15, 60, 30, 6);
    floater.add(bubble);

    // Reaction icon
    const icon = this.scene.add.text(0, 0, reactionDef.icon, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: `#${reactionDef.color.toString(16).padStart(6, '0')}`,
    }).setOrigin(0.5);
    floater.add(icon);

    this.add(floater);
    floater.setDepth(10);

    // Animate
    this.scene.tweens.add({
      targets: floater,
      y: floater.y - 40,
      alpha: { from: 1, to: 0 },
      scale: { from: 1, to: 0.5 },
      duration: 1500,
      ease: 'Power2',
      onComplete: () => {
        floater.destroy();
      },
    });
  }

  public show(callback: (type: ReactionType) => void): void {
    this.onReaction = callback;
    this.playerReactions.clear();

    // Reset counts
    PostGameReactions.REACTIONS.forEach(r => {
      this.reactionCounts.set(r.type, 0);
      this.updateCountLabel(r.type);
    });

    // Reset button states
    this.reactionButtons.forEach((container, type) => {
      const bg = container.getData('bg') as Phaser.GameObjects.Graphics;
      const reaction = container.getData('reaction') as Reaction;
      const width = 47;
      const height = 50;

      bg.clear();
      bg.fillStyle(COLORS.UI.background, 0.8);
      bg.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
      bg.lineStyle(2, reaction.color, 0.6);
      bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
    });

    // Hide rematch progress initially
    if (this.rematchContainer) {
      this.rematchContainer.setVisible(false);
    }

    // Show panel
    this.setVisible(true);
    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      y: this.y + 20,
      duration: 300,
      ease: 'Back.easeOut',
    });
  }

  public hide(): void {
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      y: this.y - 20,
      duration: 200,
      onComplete: () => {
        this.setVisible(false);
      },
    });
  }

  public setTotalPlayers(count: number): void {
    this.totalPlayers = count;
  }

  public reset(): void {
    this.playerReactions.clear();
    this.rematchCount = 0;

    PostGameReactions.REACTIONS.forEach(r => {
      this.reactionCounts.set(r.type, 0);
    });

    if (this.rematchContainer) {
      this.rematchContainer.setVisible(false);
    }
  }
}
