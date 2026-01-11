import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';
import { currencyService, PlayerCurrencies } from '../services/CurrencyService';

interface WheelPrize {
  id: string;
  name: string;
  type: string;
  amount?: number;
  color: string;
  isJackpot: boolean;
  segmentIndex: number;
}

interface SpinResult {
  id: string;
  type: string;
  segmentIndex: number;
  prize: {
    id: string;
    name: string;
    type: string;
    amount?: number;
    isJackpot: boolean;
    color: string;
  };
  bonusMultiplier: number | null;
}

interface JackpotInfo {
  currentAmount: number;
  lastWinAmount: number | null;
  lastWinTime: number | null;
}

interface FreeSpinStatus {
  available: boolean;
  nextFreeSpinTime: number | null;
  consecutiveDays: number;
  cooldownHours: number;
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export class LuckyWheelScene extends Phaser.Scene {
  private currencies: PlayerCurrencies = { gems: 0, coins: 0, crystals: 0, updatedAt: 0 };
  private currencyDisplay!: Phaser.GameObjects.Container;
  private wheelContainer!: Phaser.GameObjects.Container;
  private wheel!: Phaser.GameObjects.Container;
  private pointer!: Phaser.GameObjects.Graphics;
  private prizes: WheelPrize[] = [];
  private jackpot: JackpotInfo | null = null;
  private freeSpin: FreeSpinStatus | null = null;
  private premiumSpinCost: { type: string; amount: number } | null = null;
  private isSpinning: boolean = false;
  private spinButton!: Phaser.GameObjects.Container;
  private jackpotDisplay!: Phaser.GameObjects.Text;
  private freeSpinTimer!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'LuckyWheelScene' });
  }

  async create(): Promise<void> {
    const width = this.scale.width;
    const height = this.scale.height;

    this.createBackground();
    this.createHeader(width);
    this.createCurrencyDisplay(width);
    this.createJackpotDisplay(width);
    this.createWheel(width, height);
    this.createSpinButton(width, height);
    this.createFreeSpinTimer(width, height);
    this.createBackButton();

    await this.loadWheelData();
    await this.loadCurrencies();

    currencyService.subscribe((currencies) => {
      this.currencies = currencies;
      this.updateCurrencyDisplay();
      this.updateSpinButton();
    });

    // Start timer update loop
    this.time.addEvent({
      delay: 1000,
      callback: () => this.updateFreeSpinTimer(),
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
        Phaser.Display.Color.ValueToColor(0x1a0a2e),
        Phaser.Display.Color.ValueToColor(0x2d1b4e),
        100,
        ratio * 100
      );
      graphics.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1);
      graphics.fillRect(0, i, width, 1);
    }

    // Decorative lights
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const light = this.add.circle(x, y, 2, 0xffaa00, Math.random() * 0.5 + 0.2);
      this.tweens.add({
        targets: light,
        alpha: { from: 0.2, to: 0.8 },
        duration: 500 + Math.random() * 1000,
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 1000,
      });
    }
  }

  private createHeader(width: number): void {
    this.add.text(width / 2, 30, 'LUCKY WHEEL', {
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

  private createJackpotDisplay(width: number): void {
    const container = this.add.container(width / 2, 70);

    const bg = this.add.graphics();
    bg.fillStyle(0xff3366, 0.8);
    bg.fillRoundedRect(-100, -18, 200, 36, 10);
    container.add(bg);

    const label = this.add.text(0, -3, 'JACKPOT', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    container.add(label);

    this.jackpotDisplay = this.add.text(0, 10, 'Loading...', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffd700',
    }).setOrigin(0.5);
    container.add(this.jackpotDisplay);

    // Pulsing animation
    this.tweens.add({
      targets: container,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 1000,
      yoyo: true,
      repeat: -1,
    });
  }

  private createWheel(width: number, height: number): void {
    const centerX = width / 2;
    const centerY = height / 2 - 20;
    const radius = Math.min(width, height) * 0.35;

    this.wheelContainer = this.add.container(centerX, centerY);
    this.wheel = this.add.container(0, 0);
    this.wheelContainer.add(this.wheel);

    // Outer ring with lights
    this.createWheelLights(radius + 15);

    // Main wheel background
    const wheelBg = this.add.graphics();
    wheelBg.fillStyle(0x1a1a3a, 1);
    wheelBg.fillCircle(0, 0, radius + 5);
    wheelBg.lineStyle(8, 0xffaa00, 1);
    wheelBg.strokeCircle(0, 0, radius + 5);
    this.wheel.add(wheelBg);

    // Placeholder segments (will be replaced when data loads)
    this.drawWheelSegments(radius);

    // Center hub
    const hub = this.add.graphics();
    hub.fillStyle(0xffaa00, 1);
    hub.fillCircle(0, 0, 30);
    hub.lineStyle(4, 0xffffff, 0.8);
    hub.strokeCircle(0, 0, 30);
    this.wheel.add(hub);

    const hubIcon = this.add.text(0, 0, String.fromCharCode(0x2728), {
      fontSize: '24px',
    }).setOrigin(0.5);
    this.wheel.add(hubIcon);

    // Pointer (arrow)
    this.createPointer(centerX, centerY - radius - 30);
  }

  private createWheelLights(radius: number): void {
    const numLights = 20;
    for (let i = 0; i < numLights; i++) {
      const angle = (i / numLights) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      const light = this.add.circle(x, y, 5, 0xffaa00, 0.8);
      this.wheelContainer.add(light);

      this.tweens.add({
        targets: light,
        alpha: { from: 0.3, to: 1 },
        duration: 300,
        yoyo: true,
        repeat: -1,
        delay: i * 100,
      });
    }
  }

  private drawWheelSegments(radius: number): void {
    if (this.prizes.length === 0) {
      // Default placeholder
      const segmentGraphics = this.add.graphics();
      segmentGraphics.fillStyle(0x3a3a5a, 1);
      segmentGraphics.fillCircle(0, 0, radius);
      this.wheel.addAt(segmentGraphics, 1);
      return;
    }

    const numSegments = this.prizes.length;
    const segmentAngle = (Math.PI * 2) / numSegments;

    for (let i = 0; i < numSegments; i++) {
      const prize = this.prizes[i];
      const startAngle = i * segmentAngle - Math.PI / 2;
      const endAngle = startAngle + segmentAngle;

      const color = parseInt(prize.color.replace('#', ''), 16);

      // Draw segment
      const segment = this.add.graphics();
      segment.fillStyle(color, 0.9);
      segment.beginPath();
      segment.moveTo(0, 0);
      segment.arc(0, 0, radius, startAngle, endAngle);
      segment.closePath();
      segment.fillPath();

      // Segment border
      segment.lineStyle(2, 0xffffff, 0.3);
      segment.beginPath();
      segment.moveTo(0, 0);
      segment.lineTo(Math.cos(startAngle) * radius, Math.sin(startAngle) * radius);
      segment.strokePath();

      this.wheel.addAt(segment, i + 1);

      // Prize text
      const textAngle = startAngle + segmentAngle / 2;
      const textRadius = radius * 0.65;
      const textX = Math.cos(textAngle) * textRadius;
      const textY = Math.sin(textAngle) * textRadius;

      const text = this.add.text(textX, textY, prize.name, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5).setRotation(textAngle + Math.PI / 2);

      this.wheel.add(text);

      // Jackpot star
      if (prize.isJackpot) {
        const starX = Math.cos(textAngle) * (radius * 0.4);
        const starY = Math.sin(textAngle) * (radius * 0.4);
        const star = this.add.text(starX, starY, String.fromCharCode(0x2B50), {
          fontSize: '16px',
        }).setOrigin(0.5);
        this.wheel.add(star);
      }
    }
  }

  private createPointer(x: number, y: number): void {
    this.pointer = this.add.graphics();
    this.pointer.fillStyle(0xff3366, 1);

    // Triangle pointer
    this.pointer.beginPath();
    this.pointer.moveTo(0, 0);
    this.pointer.lineTo(-15, -30);
    this.pointer.lineTo(15, -30);
    this.pointer.closePath();
    this.pointer.fillPath();

    this.pointer.lineStyle(3, 0xffffff, 0.8);
    this.pointer.strokePath();

    this.pointer.setPosition(x, y + 10);
  }

  private createSpinButton(width: number, height: number): void {
    this.spinButton = this.add.container(width / 2, height - 90);

    const bg = this.add.graphics();
    bg.fillStyle(0x00aa88, 0.95);
    bg.fillRoundedRect(-100, -30, 200, 60, 15);
    this.spinButton.add(bg);

    const text = this.add.text(0, -5, 'SPIN!', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.spinButton.add(text);

    const costText = this.add.text(0, 20, 'Loading...', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '12px',
      color: '#cccccc',
    }).setOrigin(0.5);
    this.spinButton.add(costText);

    this.spinButton.setSize(200, 60);
    this.spinButton.setInteractive({ useHandCursor: true });

    this.spinButton.on('pointerdown', () => {
      if (!this.isSpinning) {
        this.playClickSound();
        this.performSpin();
      }
    });

    this.spinButton.on('pointerover', () => {
      if (!this.isSpinning) {
        bg.clear();
        bg.fillStyle(0x00cc99, 0.95);
        bg.fillRoundedRect(-100, -30, 200, 60, 15);
      }
    });

    this.spinButton.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(0x00aa88, 0.95);
      bg.fillRoundedRect(-100, -30, 200, 60, 15);
    });

    (this.spinButton as Phaser.GameObjects.Container & { costText: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Graphics }).costText = costText;
    (this.spinButton as Phaser.GameObjects.Container & { costText: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Graphics }).bg = bg;
  }

  private updateSpinButton(): void {
    const button = this.spinButton as Phaser.GameObjects.Container & {
      costText?: Phaser.GameObjects.Text;
      bg?: Phaser.GameObjects.Graphics;
    };

    if (!button.costText) return;

    if (this.freeSpin?.available) {
      button.costText.setText('FREE SPIN!');
      button.costText.setColor('#00ff00');

      if (button.bg) {
        button.bg.clear();
        button.bg.fillStyle(0x00cc44, 0.95);
        button.bg.fillRoundedRect(-100, -30, 200, 60, 15);
      }
    } else if (this.premiumSpinCost) {
      const icon = this.premiumSpinCost.type === 'gems' ? String.fromCharCode(0x1F48E) : String.fromCharCode(0x1FA99);
      button.costText.setText(`${icon} ${this.premiumSpinCost.amount}`);
      button.costText.setColor('#ffffff');

      const canAfford = this.currencies[this.premiumSpinCost.type as keyof PlayerCurrencies] >= this.premiumSpinCost.amount;
      if (button.bg) {
        button.bg.clear();
        button.bg.fillStyle(canAfford ? 0x00aa88 : 0x666666, 0.95);
        button.bg.fillRoundedRect(-100, -30, 200, 60, 15);
      }
    }
  }

  private createFreeSpinTimer(width: number, height: number): void {
    this.freeSpinTimer = this.add.text(width / 2, height - 30, '', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      color: '#aaaaaa',
    }).setOrigin(0.5);
  }

  private updateFreeSpinTimer(): void {
    if (!this.freeSpin) return;

    if (this.freeSpin.available) {
      this.freeSpinTimer.setText(`Daily streak: ${this.freeSpin.consecutiveDays} days`);
      this.freeSpinTimer.setColor('#00ff00');
    } else if (this.freeSpin.nextFreeSpinTime) {
      const remaining = this.freeSpin.nextFreeSpinTime - Math.floor(Date.now() / 1000);
      if (remaining > 0) {
        const hours = Math.floor(remaining / 3600);
        const mins = Math.floor((remaining % 3600) / 60);
        const secs = remaining % 60;
        this.freeSpinTimer.setText(`Free spin in: ${hours}h ${mins}m ${secs}s`);
        this.freeSpinTimer.setColor('#ffaa00');
      } else {
        // Timer expired, refresh data
        this.loadWheelData();
      }
    }
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

  private async loadWheelData(): Promise<void> {
    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const response = await fetch(`${SERVER_URL}/api/lucky-draw/wheel`, { headers });
      if (response.ok) {
        const data = await response.json();
        this.prizes = data.prizes;
        this.jackpot = data.jackpot;
        this.freeSpin = data.freeSpin;
        this.premiumSpinCost = data.premiumSpinCost;

        // Update wheel
        this.redrawWheel();

        // Update jackpot display
        if (this.jackpot) {
          this.jackpotDisplay.setText(`${this.jackpot.currentAmount.toLocaleString()} Coins`);
        }

        // Update spin button
        this.updateSpinButton();
      }
    } catch (error) {
      console.error('Error loading wheel data:', error);
    }
  }

  private redrawWheel(): void {
    const radius = Math.min(this.scale.width, this.scale.height) * 0.35;

    // Remove old segments (keep lights, bg, hub)
    this.wheel.list.forEach((obj, index) => {
      if (index > 0 && index < this.wheel.list.length - 2) {
        obj.destroy();
      }
    });

    this.drawWheelSegments(radius);
  }

  private async loadCurrencies(): Promise<void> {
    const currencies = await currencyService.fetchCurrencies();
    if (currencies) {
      this.currencies = currencies;
      this.updateCurrencyDisplay();
      this.updateSpinButton();
    }
  }

  private async performSpin(): Promise<void> {
    if (this.isSpinning) return;

    const token = localStorage.getItem('token');
    if (!token) {
      this.showMessage('Please log in to spin', '#ff0000');
      return;
    }

    // Determine spin type
    const spinType = this.freeSpin?.available ? 'free' : 'premium';

    // Check if can afford premium spin
    if (spinType === 'premium' && this.premiumSpinCost) {
      const currency = this.currencies[this.premiumSpinCost.type as keyof PlayerCurrencies];
      if (currency < this.premiumSpinCost.amount) {
        this.showMessage('Not enough gems!', '#ff0000');
        return;
      }
    }

    this.isSpinning = true;
    this.spinButton.setAlpha(0.5);

    try {
      const response = await fetch(`${SERVER_URL}/api/lucky-draw/spin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ spinType }),
      });

      const data = await response.json();

      if (!response.ok) {
        this.showMessage(data.error || 'Spin failed', '#ff0000');
        this.isSpinning = false;
        this.spinButton.setAlpha(1);
        return;
      }

      // Animate the wheel
      await this.animateWheelSpin(data.spin);

      // Update currencies
      if (data.currencies) {
        this.currencies = { ...data.currencies, updatedAt: Date.now() };
        this.updateCurrencyDisplay();
      }

      // Update jackpot
      if (data.jackpot) {
        this.jackpot = data.jackpot;
        this.jackpotDisplay.setText(`${this.jackpot.currentAmount.toLocaleString()} Coins`);
      }

      // Update free spin status
      if (data.nextFreeSpin) {
        this.freeSpin = data.nextFreeSpin;
        this.updateSpinButton();
      }

      // Show result
      this.showSpinResult(data.spin);
    } catch (error) {
      console.error('Spin error:', error);
      this.showMessage('Network error', '#ff0000');
    }

    this.isSpinning = false;
    this.spinButton.setAlpha(1);
  }

  private async animateWheelSpin(result: SpinResult): Promise<void> {
    const numSegments = this.prizes.length;
    const segmentAngle = 360 / numSegments;

    // Calculate target angle
    // We want the winning segment at the top (pointer position)
    const targetSegment = result.segmentIndex;
    const targetAngle = -targetSegment * segmentAngle - segmentAngle / 2;

    // Add extra rotations for effect (5-8 full rotations)
    const extraRotations = 5 + Math.random() * 3;
    const totalRotation = extraRotations * 360 + (360 - targetAngle);

    // Current rotation
    const currentRotation = this.wheel.angle % 360;

    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: this.wheel,
        angle: currentRotation + totalRotation,
        duration: 4000 + Math.random() * 1000,
        ease: 'Cubic.easeOut',
        onComplete: () => resolve(),
      });

      // Play tick sounds during spin
      let tickCount = 0;
      const tickInterval = this.time.addEvent({
        delay: 50,
        callback: () => {
          tickCount++;
          // Slow down tick rate as wheel slows
          if (tickCount > 60) {
            tickInterval.destroy();
          }
          this.playTickSound();
        },
        loop: true,
      });
    });
  }

  private showSpinResult(result: SpinResult): void {
    const width = this.scale.width;
    const height = this.scale.height;

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    overlay.setInteractive();

    const panel = this.add.container(width / 2, height / 2);

    // Background
    const isJackpot = result.prize.isJackpot;
    const bgColor = isJackpot ? 0xff3366 : COLORS.UI.panel;

    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 0.95);
    bg.fillRoundedRect(-140, -120, 280, 240, 20);

    if (isJackpot) {
      bg.lineStyle(4, 0xffd700, 1);
      bg.strokeRoundedRect(-140, -120, 280, 240, 20);
    }

    panel.add(bg);

    // Title
    const title = this.add.text(0, -80, isJackpot ? 'JACKPOT!!!' : 'YOU WON!', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '28px',
      fontStyle: 'bold',
      color: isJackpot ? '#ffd700' : '#00ff88',
    }).setOrigin(0.5);
    panel.add(title);

    // Prize icon
    const prizeIcon = this.getPrizeIcon(result.prize.type);
    const icon = this.add.text(0, -20, prizeIcon, {
      fontSize: '48px',
    }).setOrigin(0.5);
    panel.add(icon);

    // Prize name
    const prizeName = this.add.text(0, 40, result.prize.name, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    panel.add(prizeName);

    // Amount if applicable
    if (result.prize.amount) {
      const amount = this.add.text(0, 70, `+${result.prize.amount.toLocaleString()}`, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '18px',
        color: result.prize.type === 'coins' ? '#ffd700' : '#00f5ff',
      }).setOrigin(0.5);
      panel.add(amount);
    }

    // Bonus multiplier
    if (result.bonusMultiplier && result.bonusMultiplier > 1) {
      const bonus = this.add.text(0, 95, `${result.bonusMultiplier}x Streak Bonus!`, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '14px',
        color: '#00ff88',
      }).setOrigin(0.5);
      panel.add(bonus);
    }

    // Close button
    const closeBtn = this.add.text(0, 100, 'COLLECT', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#00f5ff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    panel.add(closeBtn);

    // Celebrate animation for jackpot
    if (isJackpot) {
      this.createConfetti();
      this.tweens.add({
        targets: panel,
        scaleX: { from: 0, to: 1 },
        scaleY: { from: 0, to: 1 },
        duration: 500,
        ease: 'Back.easeOut',
      });
    } else {
      panel.setScale(0);
      this.tweens.add({
        targets: panel,
        scaleX: 1,
        scaleY: 1,
        duration: 300,
        ease: 'Back.easeOut',
      });
    }

    closeBtn.on('pointerdown', () => {
      this.playClickSound();
      overlay.destroy();
      panel.destroy();
    });
  }

  private getPrizeIcon(type: string): string {
    switch (type) {
      case 'coins':
        return String.fromCharCode(0x1FA99);
      case 'gems':
        return String.fromCharCode(0x1F48E);
      case 'jackpot':
        return String.fromCharCode(0x1F3B0);
      case 'nothing':
        return String.fromCharCode(0x274C);
      case 'item':
        return String.fromCharCode(0x1F381);
      default:
        return String.fromCharCode(0x2728);
    }
  }

  private createConfetti(): void {
    const width = this.scale.width;
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffd700];

    for (let i = 0; i < 50; i++) {
      const x = Math.random() * width;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const confetti = this.add.rectangle(x, -20, 8, 16, color);
      confetti.setRotation(Math.random() * Math.PI);

      this.tweens.add({
        targets: confetti,
        y: this.scale.height + 50,
        x: x + (Math.random() - 0.5) * 200,
        rotation: confetti.rotation + Math.PI * 4 * (Math.random() > 0.5 ? 1 : -1),
        duration: 2000 + Math.random() * 1000,
        delay: Math.random() * 500,
        onComplete: () => confetti.destroy(),
      });
    }
  }

  private showMessage(message: string, color: string): void {
    const width = this.scale.width;

    const text = this.add.text(width / 2, 100, message, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: color,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: text,
      alpha: 0,
      y: 80,
      duration: 2000,
      onComplete: () => text.destroy(),
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

  private playTickSound(): void {
    // Simplified tick sound using Web Audio API
    const settings = this.registry.get('settings') as { soundEnabled: boolean } | undefined;
    if (!settings?.soundEnabled) return;

    try {
      const audioContext = this.registry.get('audioContext') as AudioContext;
      if (!audioContext) return;

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800 + Math.random() * 200;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.05);
    } catch {
      // Ignore audio errors
    }
  }
}
