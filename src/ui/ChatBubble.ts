import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';

export interface ChatBubbleMessage {
  type: 'quickchat' | 'emote' | 'text';
  content: string;
  emoteAnimation?: string;
  team: number;
  duration?: number;
}

interface QueuedMessage extends ChatBubbleMessage {
  id: number;
}

export class ChatBubble extends Phaser.GameObjects.Container {
  private bubble: Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Text;
  private emoteIcon: Phaser.GameObjects.Text | null = null;
  private messageQueue: QueuedMessage[] = [];
  private currentMessageId = 0;
  private isShowing = false;
  private targetX: number;
  private targetY: number;
  private autoHideTimer: Phaser.Time.TimerEvent | null = null;

  // Team colors for bubble border
  private static TEAM_COLORS = [0x00f5ff, 0xff6666, 0x00ff88, 0xffaa00, 0xff00ff, 0xffff00, 0xff8800, 0x8800ff];

  // Default display duration
  private static DEFAULT_DURATION = 3000;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.targetX = x;
    this.targetY = y;

    // Create bubble graphics
    this.bubble = scene.add.graphics();
    this.add(this.bubble);

    // Create text
    this.text = scene.add.text(0, 0, '', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 120 },
    }).setOrigin(0.5);
    this.add(this.text);

    // Initially hidden
    this.setVisible(false);
    this.setAlpha(0);
    this.setDepth(500);

    scene.add.existing(this);
  }

  public showMessage(message: ChatBubbleMessage): void {
    const queuedMessage: QueuedMessage = {
      ...message,
      id: ++this.currentMessageId,
    };

    this.messageQueue.push(queuedMessage);

    // If not currently showing, display immediately
    if (!this.isShowing) {
      this.displayNextMessage();
    }
  }

  private displayNextMessage(): void {
    if (this.messageQueue.length === 0) {
      this.isShowing = false;
      return;
    }

    const message = this.messageQueue.shift()!;
    this.isShowing = true;

    // Clear any existing timer
    if (this.autoHideTimer) {
      this.autoHideTimer.remove();
      this.autoHideTimer = null;
    }

    // Update content based on message type
    if (message.type === 'emote') {
      this.showEmote(message);
    } else {
      this.showText(message);
    }

    // Animate in
    this.setVisible(true);
    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      y: this.targetY - 60,
      scale: { from: 0.5, to: 1 },
      duration: 200,
      ease: 'Back.easeOut',
    });

    // Auto-hide after duration
    const duration = message.duration || ChatBubble.DEFAULT_DURATION;
    this.autoHideTimer = this.scene.time.delayedCall(duration, () => {
      this.hideAndShowNext();
    });
  }

  private showText(message: ChatBubbleMessage): void {
    // Remove emote icon if present
    if (this.emoteIcon) {
      this.emoteIcon.destroy();
      this.emoteIcon = null;
    }

    // Update text
    this.text.setText(message.content);
    this.text.setPosition(0, 0);
    this.text.setVisible(true);

    // Draw bubble
    this.drawBubble(message.team, this.text.width + 24, this.text.height + 16);
  }

  private showEmote(message: ChatBubbleMessage): void {
    // Hide text
    this.text.setVisible(false);

    // Remove old emote icon
    if (this.emoteIcon) {
      this.emoteIcon.destroy();
    }

    // Create emote icon
    const emoteChar = this.getEmoteChar(message.emoteAnimation || 'wave');
    this.emoteIcon = this.scene.add.text(0, 0, emoteChar, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '32px',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.add(this.emoteIcon);

    // Draw bubble (circular for emotes)
    this.drawEmoteBubble(message.team);

    // Animate emote
    this.animateEmote(message.emoteAnimation || 'wave');
  }

  private getEmoteChar(animation: string): string {
    const emoteChars: Record<string, string> = {
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
      confetti: '*',
      trophy: 'T',
      crown: 'C',
      dance: 'D',
      target: '@',
      shield: '#',
    };
    return emoteChars[animation] || animation.charAt(0).toUpperCase();
  }

  private animateEmote(animation: string): void {
    if (!this.emoteIcon) return;

    // Different animations based on emote type
    switch (animation) {
      case 'wave':
      case 'clap':
        this.scene.tweens.add({
          targets: this.emoteIcon,
          rotation: { from: -0.2, to: 0.2 },
          duration: 200,
          yoyo: true,
          repeat: 3,
        });
        break;

      case 'thumbsup':
      case 'thumbsdown':
        this.scene.tweens.add({
          targets: this.emoteIcon,
          y: { from: 5, to: -5 },
          duration: 150,
          yoyo: true,
          repeat: 2,
        });
        break;

      case 'laugh':
      case 'angry':
        this.scene.tweens.add({
          targets: this.emoteIcon,
          scale: { from: 1, to: 1.3 },
          duration: 100,
          yoyo: true,
          repeat: 4,
        });
        break;

      case 'confetti':
      case 'fireworks':
        this.scene.tweens.add({
          targets: this.emoteIcon,
          scale: { from: 0.5, to: 1.5 },
          alpha: { from: 1, to: 0.7 },
          duration: 300,
          yoyo: true,
          repeat: 2,
        });
        break;

      case 'question':
        this.scene.tweens.add({
          targets: this.emoteIcon,
          y: { from: 0, to: -10 },
          duration: 300,
          yoyo: true,
          repeat: 2,
          ease: 'Bounce.easeOut',
        });
        break;

      default:
        // Default pulse animation
        this.scene.tweens.add({
          targets: this.emoteIcon,
          scale: { from: 1, to: 1.2 },
          duration: 200,
          yoyo: true,
          repeat: 2,
        });
    }
  }

  private drawBubble(team: number, width: number, height: number): void {
    this.bubble.clear();

    const teamColor = ChatBubble.TEAM_COLORS[team % ChatBubble.TEAM_COLORS.length];
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    // Shadow
    this.bubble.fillStyle(0x000000, 0.3);
    this.bubble.fillRoundedRect(-halfWidth + 2, -halfHeight + 2, width, height, 8);

    // Background
    this.bubble.fillStyle(COLORS.UI.panel, 0.95);
    this.bubble.fillRoundedRect(-halfWidth, -halfHeight, width, height, 8);

    // Border
    this.bubble.lineStyle(2, teamColor, 0.9);
    this.bubble.strokeRoundedRect(-halfWidth, -halfHeight, width, height, 8);

    // Tail (pointing down)
    this.bubble.fillStyle(COLORS.UI.panel, 0.95);
    this.bubble.beginPath();
    this.bubble.moveTo(-8, halfHeight);
    this.bubble.lineTo(0, halfHeight + 12);
    this.bubble.lineTo(8, halfHeight);
    this.bubble.closePath();
    this.bubble.fill();

    this.bubble.lineStyle(2, teamColor, 0.9);
    this.bubble.beginPath();
    this.bubble.moveTo(-8, halfHeight);
    this.bubble.lineTo(0, halfHeight + 12);
    this.bubble.lineTo(8, halfHeight);
    this.bubble.stroke();
  }

  private drawEmoteBubble(team: number): void {
    this.bubble.clear();

    const teamColor = ChatBubble.TEAM_COLORS[team % ChatBubble.TEAM_COLORS.length];
    const radius = 30;

    // Shadow
    this.bubble.fillStyle(0x000000, 0.3);
    this.bubble.fillCircle(2, 2, radius);

    // Background
    this.bubble.fillStyle(COLORS.UI.panel, 0.95);
    this.bubble.fillCircle(0, 0, radius);

    // Colored glow ring
    this.bubble.lineStyle(4, teamColor, 0.6);
    this.bubble.strokeCircle(0, 0, radius + 4);

    // Border
    this.bubble.lineStyle(2, teamColor, 0.9);
    this.bubble.strokeCircle(0, 0, radius);
  }

  private hideAndShowNext(): void {
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      y: this.targetY - 80,
      scale: 0.8,
      duration: 150,
      onComplete: () => {
        this.setVisible(false);
        this.setPosition(this.targetX, this.targetY);
        this.displayNextMessage();
      },
    });
  }

  public updatePosition(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;

    if (!this.isShowing) {
      this.setPosition(x, y);
    }
  }

  public clearQueue(): void {
    this.messageQueue = [];
    if (this.autoHideTimer) {
      this.autoHideTimer.remove();
      this.autoHideTimer = null;
    }
    this.hide();
  }

  public hide(): void {
    this.isShowing = false;
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 100,
      onComplete: () => {
        this.setVisible(false);
      },
    });
  }

  public destroy(): void {
    if (this.autoHideTimer) {
      this.autoHideTimer.remove();
    }
    if (this.emoteIcon) {
      this.emoteIcon.destroy();
    }
    super.destroy();
  }
}

// Manager to handle multiple chat bubbles for different players
export class ChatBubbleManager {
  private scene: Phaser.Scene;
  private bubbles: Map<string, ChatBubble> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public showMessage(
    playerId: string,
    x: number,
    y: number,
    message: ChatBubbleMessage
  ): void {
    let bubble = this.bubbles.get(playerId);

    if (!bubble) {
      bubble = new ChatBubble(this.scene, x, y);
      this.bubbles.set(playerId, bubble);
    }

    bubble.updatePosition(x, y);
    bubble.showMessage(message);
  }

  public updatePosition(playerId: string, x: number, y: number): void {
    const bubble = this.bubbles.get(playerId);
    if (bubble) {
      bubble.updatePosition(x, y);
    }
  }

  public clearBubble(playerId: string): void {
    const bubble = this.bubbles.get(playerId);
    if (bubble) {
      bubble.clearQueue();
    }
  }

  public clearAll(): void {
    this.bubbles.forEach(bubble => {
      bubble.clearQueue();
      bubble.destroy();
    });
    this.bubbles.clear();
  }

  public destroy(): void {
    this.clearAll();
  }
}
