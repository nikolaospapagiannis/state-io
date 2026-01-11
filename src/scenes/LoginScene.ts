import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';
import { networkService } from '../services/NetworkService';

export class LoginScene extends Phaser.Scene {
  private emailInput: HTMLInputElement | null = null;
  private passwordInput: HTMLInputElement | null = null;
  private usernameInput: HTMLInputElement | null = null;
  private isRegisterMode = false;
  private formContainer: HTMLDivElement | null = null;

  constructor() {
    super({ key: 'LoginScene' });
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    this.createBackground();
    this.createHeader(width);
    this.createForm(width, height);
    this.createBackButton();
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
    this.add.text(width / 2, 80, 'STATE.IO', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '48px',
      fontStyle: 'bold',
      color: '#00f5ff',
    }).setOrigin(0.5);

    this.add.text(width / 2, 130, 'MULTIPLAYER', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '24px',
      color: '#aaaacc',
    }).setOrigin(0.5);
  }

  private createForm(_width: number, _height: number): void {
    // Create HTML form overlay
    this.formContainer = document.createElement('div');
    this.formContainer.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      background: rgba(20, 20, 40, 0.95);
      padding: 30px;
      border-radius: 15px;
      border: 2px solid rgba(0, 245, 255, 0.3);
      min-width: 300px;
    `;

    this.formContainer.innerHTML = `
      <div id="username-field" style="display: none; margin-bottom: 15px;">
        <input type="text" id="username-input" placeholder="Username" style="
          width: 100%;
          padding: 12px;
          border: 2px solid rgba(0, 245, 255, 0.3);
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.5);
          color: white;
          font-size: 16px;
          outline: none;
          box-sizing: border-box;
        " />
      </div>
      <div style="margin-bottom: 15px;">
        <input type="email" id="email-input" placeholder="Email" style="
          width: 100%;
          padding: 12px;
          border: 2px solid rgba(0, 245, 255, 0.3);
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.5);
          color: white;
          font-size: 16px;
          outline: none;
          box-sizing: border-box;
        " />
      </div>
      <div style="margin-bottom: 20px;">
        <input type="password" id="password-input" placeholder="Password" style="
          width: 100%;
          padding: 12px;
          border: 2px solid rgba(0, 245, 255, 0.3);
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.5);
          color: white;
          font-size: 16px;
          outline: none;
          box-sizing: border-box;
        " />
      </div>
      <button id="submit-btn" style="
        width: 100%;
        padding: 14px;
        border: none;
        border-radius: 8px;
        background: linear-gradient(135deg, #00f5ff, #0088ff);
        color: white;
        font-size: 18px;
        font-weight: bold;
        cursor: pointer;
        margin-bottom: 15px;
      ">LOGIN</button>
      <div style="text-align: center;">
        <span id="toggle-mode" style="color: #00f5ff; cursor: pointer; font-size: 14px;">
          Don't have an account? Register
        </span>
      </div>
      <div id="status-text" style="
        margin-top: 15px;
        text-align: center;
        color: #ff6666;
        font-size: 14px;
        min-height: 20px;
      "></div>
    `;

    document.body.appendChild(this.formContainer);

    // Get input references
    this.emailInput = document.getElementById('email-input') as HTMLInputElement;
    this.passwordInput = document.getElementById('password-input') as HTMLInputElement;
    this.usernameInput = document.getElementById('username-input') as HTMLInputElement;

    const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
    const toggleMode = document.getElementById('toggle-mode') as HTMLSpanElement;
    const usernameField = document.getElementById('username-field') as HTMLDivElement;
    const statusText = document.getElementById('status-text') as HTMLDivElement;

    // Event listeners
    submitBtn.addEventListener('click', () => this.handleSubmit(statusText));

    this.passwordInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleSubmit(statusText);
    });

    toggleMode.addEventListener('click', () => {
      this.isRegisterMode = !this.isRegisterMode;
      usernameField.style.display = this.isRegisterMode ? 'block' : 'none';
      submitBtn.textContent = this.isRegisterMode ? 'REGISTER' : 'LOGIN';
      toggleMode.textContent = this.isRegisterMode
        ? 'Already have an account? Login'
        : "Don't have an account? Register";
      statusText.textContent = '';
    });

    // Focus handling
    this.emailInput?.focus();
  }

  private async handleSubmit(statusText: HTMLDivElement): Promise<void> {
    const email = this.emailInput?.value || '';
    const password = this.passwordInput?.value || '';
    const username = this.usernameInput?.value || '';

    if (!email || !password) {
      statusText.textContent = 'Please fill in all fields';
      return;
    }

    if (this.isRegisterMode && !username) {
      statusText.textContent = 'Please enter a username';
      return;
    }

    statusText.style.color = '#00f5ff';
    statusText.textContent = this.isRegisterMode ? 'Registering...' : 'Logging in...';

    let result;
    if (this.isRegisterMode) {
      result = await networkService.register(username, email, password);
    } else {
      result = await networkService.login(email, password);
    }

    if (result.success) {
      statusText.style.color = '#00ff88';
      statusText.textContent = 'Success! Connecting...';

      // Connect to socket
      networkService.connect();

      // Navigate to lobby
      this.time.delayedCall(500, () => {
        this.cleanupForm();
        this.scene.start('LobbyScene');
      });
    } else {
      statusText.style.color = '#ff6666';
      statusText.textContent = result.error || 'An error occurred';
    }
  }

  private createBackButton(): void {
    const backBtn = this.add.container(60, 50);
    const backBg = this.add.graphics();
    backBg.fillStyle(COLORS.UI.panel, 0.8);
    backBg.fillRoundedRect(-40, -25, 80, 50, 12);
    backBg.lineStyle(2, COLORS.UI.accent, 0.5);
    backBg.strokeRoundedRect(-40, -25, 80, 50, 12);

    const backText = this.add.text(0, 0, '< BACK', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    backBtn.add([backBg, backText]);
    backBtn.setSize(80, 50);
    backBtn.setInteractive({ useHandCursor: true });

    backBtn.on('pointerdown', () => {
      this.cleanupForm();
      this.scene.start('MenuScene');
    });
  }

  private cleanupForm(): void {
    if (this.formContainer) {
      document.body.removeChild(this.formContainer);
      this.formContainer = null;
    }
  }

  shutdown(): void {
    this.cleanupForm();
  }
}
