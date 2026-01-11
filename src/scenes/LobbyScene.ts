import Phaser from 'phaser';
import { COLORS, GAME_MODES } from '../config/GameConfig';
import { networkService, Room, RoomPlayer } from '../services/NetworkService';

export class LobbyScene extends Phaser.Scene {
  private currentRoom: Room | null = null;
  private onlineText: Phaser.GameObjects.Text | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;
  private playerListContainer: Phaser.GameObjects.Container | null = null;
  private isInQueue = false;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    this.createBackground();
    this.createHeader(width);
    this.createUserInfo(width);
    this.createGameModeButtons(width, height);
    this.createBackButton();
    this.setupNetworkCallbacks();

    // Get initial online count
    networkService.connect();
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
    this.add.text(width / 2, 40, 'MULTIPLAYER LOBBY', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#00f5ff',
    }).setOrigin(0.5);

    this.onlineText = this.add.text(width - 20, 40, 'Online: 0', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      color: '#00ff88',
    }).setOrigin(1, 0.5);

    this.statusText = this.add.text(width / 2, 80, '', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      color: '#ffaa00',
    }).setOrigin(0.5);
  }

  private createUserInfo(width: number): void {
    const user = networkService.currentUser;
    if (!user) return;

    const container = this.add.container(width / 2, 120);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.UI.panel, 0.8);
    bg.fillRoundedRect(-150, -30, 300, 60, 10);

    const userText = this.add.text(0, -8, user.username, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    const eloText = this.add.text(0, 15, `ELO: ${user.elo} | W: ${user.wins} L: ${user.losses}`, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      color: '#aaaacc',
    }).setOrigin(0.5);

    container.add([bg, userText, eloText]);
  }

  private createGameModeButtons(width: number, _height: number): void {
    const modes = GAME_MODES.filter(m => ['1v1', '2v2', '5v5'].includes(m.id));
    const buttonWidth = 180;
    const buttonHeight = 100;
    const startY = 200;
    const spacing = 20;

    modes.forEach((mode, index) => {
      const x = width / 2 - (modes.length - 1) * (buttonWidth + spacing) / 2 + index * (buttonWidth + spacing);
      const y = startY + buttonHeight / 2;

      this.createModeButton(x, y, mode, buttonWidth, buttonHeight);
    });

    // Quick Match button
    this.createQuickMatchButton(width / 2, startY + buttonHeight + 80);

    // Create/Join Room buttons
    this.createRoomButtons(width, startY + buttonHeight + 160);
  }

  private createModeButton(x: number, y: number, mode: { id: string; name: string; description: string }, width: number, height: number): void {
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.UI.panel, 0.9);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 15);
    bg.lineStyle(2, COLORS.UI.accent, 0.5);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 15);

    const modeText = this.add.text(0, -15, mode.name, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    const descText = this.add.text(0, 20, mode.description, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '12px',
      color: '#aaaacc',
    }).setOrigin(0.5);

    container.add([bg, modeText, descText]);
    container.setSize(width, height);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerover', () => {
      this.tweens.add({ targets: container, scaleX: 1.05, scaleY: 1.05, duration: 100 });
    });

    container.on('pointerout', () => {
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 100 });
    });

    container.on('pointerdown', () => {
      this.joinMatchmaking(mode.id);
    });
  }

  private createQuickMatchButton(x: number, y: number): void {
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(0x00aa44, 0.9);
    bg.fillRoundedRect(-100, -25, 200, 50, 12);
    bg.lineStyle(2, 0x00ff88, 0.8);
    bg.strokeRoundedRect(-100, -25, 200, 50, 12);

    const text = this.add.text(0, 0, 'QUICK MATCH', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    container.add([bg, text]);
    container.setSize(200, 50);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerdown', () => {
      // Quick match joins 1v1 by default
      this.joinMatchmaking('1v1');
    });
  }

  private createRoomButtons(width: number, y: number): void {
    // Create Room button
    const createBtn = this.add.container(width / 2 - 110, y);
    const createBg = this.add.graphics();
    createBg.fillStyle(COLORS.UI.panel, 0.9);
    createBg.fillRoundedRect(-90, -25, 180, 50, 12);
    createBg.lineStyle(2, COLORS.UI.accent, 0.5);
    createBg.strokeRoundedRect(-90, -25, 180, 50, 12);

    const createText = this.add.text(0, 0, 'CREATE ROOM', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    createBtn.add([createBg, createText]);
    createBtn.setSize(180, 50);
    createBtn.setInteractive({ useHandCursor: true });

    createBtn.on('pointerdown', () => {
      this.showCreateRoomDialog();
    });

    // Join Room button
    const joinBtn = this.add.container(width / 2 + 110, y);
    const joinBg = this.add.graphics();
    joinBg.fillStyle(COLORS.UI.panel, 0.9);
    joinBg.fillRoundedRect(-90, -25, 180, 50, 12);
    joinBg.lineStyle(2, COLORS.UI.accent, 0.5);
    joinBg.strokeRoundedRect(-90, -25, 180, 50, 12);

    const joinText = this.add.text(0, 0, 'JOIN ROOM', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    joinBtn.add([joinBg, joinText]);
    joinBtn.setSize(180, 50);
    joinBtn.setInteractive({ useHandCursor: true });

    joinBtn.on('pointerdown', () => {
      this.showJoinRoomDialog();
    });
  }

  private joinMatchmaking(mode: string): void {
    if (this.isInQueue) {
      networkService.leaveMatchmaking();
      this.isInQueue = false;
      this.statusText?.setText('');
      return;
    }

    networkService.joinMatchmaking(mode);
    this.isInQueue = true;
    this.statusText?.setText(`Searching for ${mode} match...`);
  }

  private showCreateRoomDialog(): void {
    // Simple prompt for room creation
    const mode = window.prompt('Enter game mode (1v1, 2v2, 5v5):', '1v1');
    if (mode && ['1v1', '2v2', '5v5'].includes(mode)) {
      networkService.createRoom(mode);
      this.statusText?.setText('Creating room...');
    }
  }

  private showJoinRoomDialog(): void {
    const roomId = window.prompt('Enter room code:');
    if (roomId) {
      networkService.joinRoom(roomId.toUpperCase());
      this.statusText?.setText('Joining room...');
    }
  }

  private createBackButton(): void {
    const backBtn = this.add.container(60, 40);
    const backBg = this.add.graphics();
    backBg.fillStyle(COLORS.UI.panel, 0.8);
    backBg.fillRoundedRect(-40, -20, 80, 40, 10);

    const backText = this.add.text(0, 0, '< BACK', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    backBtn.add([backBg, backText]);
    backBtn.setSize(80, 40);
    backBtn.setInteractive({ useHandCursor: true });

    backBtn.on('pointerdown', () => {
      if (this.isInQueue) {
        networkService.leaveMatchmaking();
      }
      networkService.disconnect();
      this.scene.start('MenuScene');
    });
  }

  private setupNetworkCallbacks(): void {
    networkService.onOnlineCount = (count) => {
      this.onlineText?.setText(`Online: ${count}`);
    };

    networkService.onMatchmakingJoined = (data) => {
      this.statusText?.setText(`In queue for ${data.mode} (Position: ${data.position})`);
    };

    networkService.onMatchmakingLeft = () => {
      this.isInQueue = false;
      this.statusText?.setText('');
    };

    networkService.onMatchFound = (data) => {
      this.isInQueue = false;
      this.currentRoom = data.room;
      this.statusText?.setText('Match found! Starting game...');

      this.time.delayedCall(1000, () => {
        this.scene.start('MultiplayerGameScene', { room: data.room });
      });
    };

    networkService.onRoomCreated = (data) => {
      this.currentRoom = data.room;
      this.showRoomScreen(data.room);
    };

    networkService.onRoomJoined = (data) => {
      this.currentRoom = data.room;
      this.showRoomScreen(data.room);
    };

    networkService.onError = (error) => {
      this.statusText?.setText(`Error: ${error.message}`);
      this.time.delayedCall(3000, () => {
        this.statusText?.setText('');
      });
    };

    networkService.onGameStarted = (data) => {
      this.scene.start('MultiplayerGameScene', {
        room: this.currentRoom,
        gameState: data.gameState,
        players: data.players,
      });
    };
  }

  private showRoomScreen(room: Room): void {
    // Clear existing content and show room waiting screen
    this.children.removeAll();
    this.createBackground();

    const width = this.scale.width;
    const height = this.scale.height;

    // Room header
    this.add.text(width / 2, 50, `ROOM: ${room.id}`, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#00f5ff',
    }).setOrigin(0.5);

    this.add.text(width / 2, 90, `${room.mode} | ${room.players.length}/${room.maxPlayers} Players`, {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '18px',
      color: '#aaaacc',
    }).setOrigin(0.5);

    // Player list
    this.playerListContainer = this.add.container(width / 2, 200);
    this.updatePlayerList(room.players);

    // Ready button
    const isHost = room.hostId === networkService.socketId;
    this.createReadyButton(width / 2, height - 100, isHost);

    // Leave button
    this.createLeaveRoomButton(60, 50);

    // Setup room callbacks
    this.setupRoomCallbacks();
  }

  private updatePlayerList(players: RoomPlayer[]): void {
    if (!this.playerListContainer) return;
    this.playerListContainer.removeAll(true);

    players.forEach((player, index) => {
      const y = index * 60;
      const bg = this.add.graphics();
      bg.fillStyle(COLORS.UI.panel, 0.8);
      bg.fillRoundedRect(-150, y - 25, 300, 50, 10);

      if (player.ready) {
        bg.lineStyle(2, 0x00ff88, 0.8);
        bg.strokeRoundedRect(-150, y - 25, 300, 50, 10);
      }

      const teamColor = player.team === 0 ? '#00f5ff' : '#ff6666';
      const nameText = this.add.text(-100, y, player.username, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: teamColor,
      }).setOrigin(0, 0.5);

      const eloText = this.add.text(80, y, `ELO: ${player.elo}`, {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '14px',
        color: '#aaaacc',
      }).setOrigin(0, 0.5);

      const statusText = this.add.text(130, y, player.ready ? 'READY' : 'WAITING', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '12px',
        color: player.ready ? '#00ff88' : '#ffaa00',
      }).setOrigin(1, 0.5);

      this.playerListContainer?.add([bg, nameText, eloText, statusText]);
    });
  }

  private createReadyButton(x: number, y: number, _isHost: boolean): void {
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(0x00aa44, 0.9);
    bg.fillRoundedRect(-80, -25, 160, 50, 12);

    const text = this.add.text(0, 0, 'READY', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    container.add([bg, text]);
    container.setSize(160, 50);
    container.setInteractive({ useHandCursor: true });

    let isReady = false;
    container.on('pointerdown', () => {
      isReady = !isReady;
      networkService.setReady(isReady);
      text.setText(isReady ? 'NOT READY' : 'READY');
      bg.clear();
      bg.fillStyle(isReady ? 0xaa4400 : 0x00aa44, 0.9);
      bg.fillRoundedRect(-80, -25, 160, 50, 12);
    });
  }

  private createLeaveRoomButton(x: number, y: number): void {
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.UI.panel, 0.8);
    bg.fillRoundedRect(-40, -20, 80, 40, 10);

    const text = this.add.text(0, 0, 'LEAVE', {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ff6666',
    }).setOrigin(0.5);

    container.add([bg, text]);
    container.setSize(80, 40);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerdown', () => {
      networkService.leaveRoom();
      this.currentRoom = null;
      this.scene.restart();
    });
  }

  private setupRoomCallbacks(): void {
    networkService.onPlayerJoined = (player) => {
      if (this.currentRoom) {
        this.currentRoom.players.push(player);
        this.updatePlayerList(this.currentRoom.players);
      }
    };

    networkService.onPlayerLeft = (data) => {
      if (this.currentRoom) {
        this.currentRoom.players = this.currentRoom.players.filter(p => p.socketId !== data.socketId);
        this.updatePlayerList(this.currentRoom.players);
      }
    };

    networkService.onPlayerReady = (data) => {
      if (this.currentRoom) {
        const player = this.currentRoom.players.find(p => p.socketId === data.socketId);
        if (player) {
          player.ready = data.ready;
          this.updatePlayerList(this.currentRoom.players);
        }
      }
    };

    networkService.onRoomLeft = () => {
      this.currentRoom = null;
      this.scene.restart();
    };
  }

  shutdown(): void {
    // Clean up callbacks
    networkService.onOnlineCount = null;
    networkService.onMatchmakingJoined = null;
    networkService.onMatchmakingLeft = null;
    networkService.onMatchFound = null;
    networkService.onRoomCreated = null;
    networkService.onRoomJoined = null;
    networkService.onError = null;
    networkService.onPlayerJoined = null;
    networkService.onPlayerLeft = null;
    networkService.onPlayerReady = null;
    networkService.onRoomLeft = null;
    networkService.onGameStarted = null;
  }
}
