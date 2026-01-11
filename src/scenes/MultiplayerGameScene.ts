import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';
import { networkService, Room, RoomPlayer, GameState, TerritoryState, TroopState } from '../services/NetworkService';

interface MultiplayerTerritory extends Phaser.GameObjects.Container {
  territoryId: number;
  owner: number;
  troopCount: number;
  radius: number;
  centerX: number;
  centerY: number;
}

interface MultiplayerTroop extends Phaser.GameObjects.Container {
  troopId: string;
  owner: number;
  troopCount: number;
  fromId: number;
  toId: number;
  progress: number;
}

export class MultiplayerGameScene extends Phaser.Scene {
  private gameState: GameState | null = null;
  private players: RoomPlayer[] = [];
  private myTeam = 0;

  private territories: Map<number, MultiplayerTerritory> = new Map();
  private troops: Map<string, MultiplayerTroop> = new Map();

  private selectedTerritory: MultiplayerTerritory | null = null;
  private selectionLine: Phaser.GameObjects.Graphics | null = null;

  private timerText: Phaser.GameObjects.Text | null = null;
  private startTime = 0;

  constructor() {
    super({ key: 'MultiplayerGameScene' });
  }

  init(data: { room?: Room; gameState?: GameState; players?: RoomPlayer[] }): void {
    this.gameState = data.gameState || null;
    this.players = data.players || [];

    // Find my team
    const myPlayer = this.players.find(p => p.socketId === networkService.socketId);
    this.myTeam = myPlayer?.team ?? 0;
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    this.createBackground();
    this.createUI(width, height);
    this.setupNetworkCallbacks();

    if (this.gameState) {
      this.initializeGame(this.gameState);
    }

    this.startTime = Date.now();

    // Selection line graphics
    this.selectionLine = this.add.graphics();
    this.selectionLine.setDepth(50);

    // Input handlers
    this.setupInputHandlers();
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

  private createUI(width: number, _height: number): void {
    // Top bar
    const topBar = this.add.graphics();
    topBar.fillStyle(COLORS.UI.background, 0.9);
    topBar.fillRect(0, 0, width, 50);
    topBar.setDepth(100);

    // Timer
    this.timerText = this.add.text(width / 2, 25, '00:00', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(101);

    // Surrender button
    const surrenderBtn = this.add.container(width - 80, 25);
    const surrenderBg = this.add.graphics();
    surrenderBg.fillStyle(0x660000, 0.9);
    surrenderBg.fillRoundedRect(-60, -18, 120, 36, 8);

    const surrenderText = this.add.text(0, 0, 'SURRENDER', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    surrenderBtn.add([surrenderBg, surrenderText]);
    surrenderBtn.setSize(120, 36);
    surrenderBtn.setInteractive({ useHandCursor: true });
    surrenderBtn.setDepth(101);

    surrenderBtn.on('pointerdown', () => {
      if (window.confirm('Are you sure you want to surrender?')) {
        networkService.surrender();
      }
    });

    // Team colors legend
    const teamColors = [0x00f5ff, 0xff6666, 0x00ff88, 0xffaa00, 0xff00ff, 0xffff00, 0xff8800, 0x8800ff];
    this.players.forEach((player, index) => {
      const color = teamColors[player.team % teamColors.length];
      const x = 20 + index * 150;

      const indicator = this.add.graphics();
      indicator.fillStyle(color, 1);
      indicator.fillCircle(x, 25, 8);
      indicator.setDepth(101);

      this.add.text(x + 15, 25, player.username, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '14px',
        color: '#ffffff',
      }).setOrigin(0, 0.5).setDepth(101);
    });
  }

  private initializeGame(gameState: GameState): void {
    // Create territories
    gameState.territories.forEach(terr => {
      this.createTerritory(terr);
    });

    // Create any existing troops
    gameState.troops.forEach(troop => {
      this.createTroop(troop);
    });
  }

  private createTerritory(state: TerritoryState): void {
    const container = this.add.container(state.x, state.y) as MultiplayerTerritory;
    container.territoryId = state.id;
    container.owner = state.owner;
    container.troopCount = state.troops;
    container.radius = state.radius;
    container.centerX = state.x;
    container.centerY = state.y;

    // Background circle
    const bg = this.add.graphics();
    this.updateTerritoryGraphics(container, bg, state.owner, state.radius);
    container.add(bg);

    // Troop count text
    const countText = this.add.text(0, 0, Math.floor(state.troops).toString(), {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    container.add(countText);

    container.setSize(state.radius * 2, state.radius * 2);
    container.setInteractive({ useHandCursor: true });
    container.setDepth(10);

    this.territories.set(state.id, container);
  }

  private updateTerritoryGraphics(_container: MultiplayerTerritory, graphics: Phaser.GameObjects.Graphics, owner: number, radius: number): void {
    graphics.clear();

    const teamColors = [0x00f5ff, 0xff6666, 0x00ff88, 0xffaa00, 0xff00ff, 0xffff00, 0xff8800, 0x8800ff];
    const color = owner === -1 ? 0x444444 : teamColors[owner % teamColors.length];

    graphics.fillStyle(color, 0.3);
    graphics.fillCircle(0, 0, radius);
    graphics.lineStyle(3, color, 0.8);
    graphics.strokeCircle(0, 0, radius);
  }

  private createTroop(state: TroopState): void {
    const fromTerr = this.territories.get(state.fromId);
    const toTerr = this.territories.get(state.toId);
    if (!fromTerr || !toTerr) return;

    const container = this.add.container(fromTerr.centerX, fromTerr.centerY) as unknown as MultiplayerTroop;
    container.troopId = state.id;
    container.owner = state.owner;
    container.troopCount = state.count;
    container.fromId = state.fromId;
    container.toId = state.toId;
    container.progress = state.progress;

    const teamColors = [0x00f5ff, 0xff6666, 0x00ff88, 0xffaa00, 0xff00ff, 0xffff00, 0xff8800, 0x8800ff];
    const color = teamColors[state.owner % teamColors.length];

    const circle = this.add.graphics();
    circle.fillStyle(color, 0.8);
    circle.fillCircle(0, 0, 15);
    container.add(circle);

    const countText = this.add.text(0, 0, state.count.toString(), {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    container.add(countText);

    container.setDepth(20);
    this.troops.set(state.id, container);
  }

  private setupInputHandlers(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Check if clicked on a territory
      const clickedTerritory = this.getTerritoryAtPosition(pointer.x, pointer.y);

      if (clickedTerritory) {
        if (clickedTerritory.owner === this.myTeam) {
          // Select own territory
          this.selectedTerritory = clickedTerritory;
        } else if (this.selectedTerritory) {
          // Send troops to enemy/neutral territory
          networkService.sendTroops(
            this.selectedTerritory.territoryId,
            clickedTerritory.territoryId,
            0.5 // Send 50% of troops
          );
          this.selectedTerritory = null;
        }
      } else {
        this.selectedTerritory = null;
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.selectedTerritory && this.selectionLine) {
        this.selectionLine.clear();
        this.selectionLine.lineStyle(2, 0x00f5ff, 0.5);
        this.selectionLine.lineBetween(
          this.selectedTerritory.centerX,
          this.selectedTerritory.centerY,
          pointer.x,
          pointer.y
        );
      }
    });

    this.input.on('pointerup', () => {
      this.selectionLine?.clear();
    });
  }

  private getTerritoryAtPosition(x: number, y: number): MultiplayerTerritory | null {
    for (const territory of this.territories.values()) {
      const dist = Phaser.Math.Distance.Between(x, y, territory.centerX, territory.centerY);
      if (dist <= territory.radius) {
        return territory;
      }
    }
    return null;
  }

  private setupNetworkCallbacks(): void {
    networkService.onTroopsSent = (data) => {
      this.createTroop(data.troop);

      // Update source territory troops
      const fromTerr = this.territories.get(data.troop.fromId);
      if (fromTerr) {
        fromTerr.troopCount = data.fromTroops;
        this.updateTerritoryTroopDisplay(fromTerr);
      }
    };

    networkService.onTroopArrived = (data) => {
      // Remove troop
      const troop = this.troops.get(data.troopId);
      if (troop) {
        troop.destroy();
        this.troops.delete(data.troopId);
      }

      // Update territory
      const territory = this.territories.get(data.territoryId);
      if (territory) {
        territory.owner = data.newOwner;
        territory.troopCount = data.newTroops;

        const bg = territory.list[0] as Phaser.GameObjects.Graphics;
        this.updateTerritoryGraphics(territory, bg, data.newOwner, territory.radius);
        this.updateTerritoryTroopDisplay(territory);
      }
    };

    networkService.onStateUpdate = (data) => {
      // Update territories
      data.territories.forEach(terr => {
        const territory = this.territories.get(terr.id);
        if (territory) {
          if (territory.owner !== terr.owner) {
            territory.owner = terr.owner;
            const bg = territory.list[0] as Phaser.GameObjects.Graphics;
            this.updateTerritoryGraphics(territory, bg, terr.owner, territory.radius);
          }
          territory.troopCount = terr.troops;
          this.updateTerritoryTroopDisplay(territory);
        }
      });

      // Update troop positions
      data.troops.forEach(troopData => {
        const troop = this.troops.get(troopData.id);
        if (troop) {
          troop.progress = troopData.progress;
          this.updateTroopPosition(troop);
        }
      });
    };

    networkService.onPlayerSurrendered = (data) => {
      // Show surrender notification
      this.showNotification(`${data.username} surrendered!`);
    };

    networkService.onPlayerDisconnected = (data) => {
      const player = this.players.find(p => p.socketId === data.socketId);
      if (player) {
        this.showNotification(`${player.username} disconnected!`);
      }
    };

    networkService.onGameEnded = (data) => {
      this.showGameOver(data);
    };
  }

  private updateTerritoryTroopDisplay(territory: MultiplayerTerritory): void {
    const text = territory.list[1] as Phaser.GameObjects.Text;
    if (text) {
      text.setText(Math.floor(territory.troopCount).toString());
    }
  }

  private updateTroopPosition(troop: MultiplayerTroop): void {
    const fromTerr = this.territories.get(troop.fromId);
    const toTerr = this.territories.get(troop.toId);
    if (!fromTerr || !toTerr) return;

    const x = Phaser.Math.Linear(fromTerr.centerX, toTerr.centerX, troop.progress);
    const y = Phaser.Math.Linear(fromTerr.centerY, toTerr.centerY, troop.progress);
    troop.setPosition(x, y);
  }

  private showNotification(message: string): void {
    const width = this.scale.width;
    const notification = this.add.text(width / 2, 100, message, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffaa00',
      backgroundColor: '#000000',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setDepth(200);

    this.tweens.add({
      targets: notification,
      alpha: 0,
      y: 80,
      duration: 2000,
      delay: 1000,
      onComplete: () => notification.destroy(),
    });
  }

  private showGameOver(data: { winnerTeam: number; duration: number; eloChanges: { socketId: string; username: string; eloChange: number }[] }): void {
    const width = this.scale.width;
    const height = this.scale.height;

    // Overlay
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.8);
    overlay.fillRect(0, 0, width, height);
    overlay.setDepth(300);

    const isWinner = data.winnerTeam === this.myTeam;

    // Result text
    this.add.text(width / 2, height / 2 - 100, isWinner ? 'VICTORY!' : 'DEFEAT', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '48px',
      fontStyle: 'bold',
      color: isWinner ? '#00ff88' : '#ff6666',
    }).setOrigin(0.5).setDepth(301);

    // Duration
    const minutes = Math.floor(data.duration / 60);
    const seconds = data.duration % 60;
    this.add.text(width / 2, height / 2 - 40, `Duration: ${minutes}:${seconds.toString().padStart(2, '0')}`, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      color: '#aaaacc',
    }).setOrigin(0.5).setDepth(301);

    // ELO changes
    data.eloChanges.forEach((change, index) => {
      const isMe = change.socketId === networkService.socketId;
      const color = change.eloChange >= 0 ? '#00ff88' : '#ff6666';
      const sign = change.eloChange >= 0 ? '+' : '';

      this.add.text(width / 2, height / 2 + 20 + index * 30, `${isMe ? '>>> ' : ''}${change.username}: ${sign}${change.eloChange} ELO${isMe ? ' <<<' : ''}`, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '18px',
        color: isMe ? color : '#ffffff',
      }).setOrigin(0.5).setDepth(301);
    });

    // Back to lobby button
    const backBtn = this.add.container(width / 2, height / 2 + 150);
    const btnBg = this.add.graphics();
    btnBg.fillStyle(COLORS.UI.accent, 0.9);
    btnBg.fillRoundedRect(-80, -25, 160, 50, 12);

    const btnText = this.add.text(0, 0, 'BACK TO LOBBY', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    backBtn.add([btnBg, btnText]);
    backBtn.setSize(160, 50);
    backBtn.setInteractive({ useHandCursor: true });
    backBtn.setDepth(301);

    backBtn.on('pointerdown', () => {
      this.scene.start('LobbyScene');
    });
  }

  update(_time: number, _delta: number): void {
    // Update timer
    if (this.timerText) {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      this.timerText.setText(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }

    // Update troop positions based on progress
    this.troops.forEach(troop => {
      this.updateTroopPosition(troop);
    });
  }

  shutdown(): void {
    networkService.onTroopsSent = null;
    networkService.onTroopArrived = null;
    networkService.onStateUpdate = null;
    networkService.onPlayerSurrendered = null;
    networkService.onPlayerDisconnected = null;
    networkService.onGameEnded = null;
  }
}
