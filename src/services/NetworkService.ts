import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export interface User {
  id: string;
  username: string;
  email: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  avatar: string;
  title: string;
  clanId: string | null;
}

export interface RoomPlayer {
  id: string;
  socketId: string;
  username: string;
  elo: number;
  team: number;
  ready: boolean;
  connected: boolean;
}

export interface Room {
  id: string;
  mode: string;
  status: 'waiting' | 'starting' | 'playing' | 'finished';
  players: RoomPlayer[];
  maxPlayers: number;
  teamsCount: number;
  mapId: number;
  hostId: string;
}

export interface TerritoryState {
  id: number;
  owner: number;
  troops: number;
  x: number;
  y: number;
  radius: number;
}

export interface TroopState {
  id: string;
  owner: number;
  count: number;
  fromId: number;
  toId: number;
  progress: number;
}

export interface GameState {
  territories: TerritoryState[];
  troops: TroopState[];
  startedAt: number;
  tickRate: number;
}

export interface ChatMessage {
  socketId: string;
  username: string;
  team?: number;
  message: string;
  timestamp: number;
}

export interface QuickChatMessage {
  socketId: string;
  username: string;
  team: number;
  messageId: string;
  message: string;
  translations: Record<string, string>;
  targetTerritory?: number;
  timestamp: number;
}

export interface EmoteMessage {
  socketId: string;
  username: string;
  team: number;
  emoteId: string;
  emote: {
    name: string;
    animation: string;
    duration: number;
    sound?: string;
    rarity: string;
  };
  targetTerritory?: number;
  timestamp: number;
}

export interface ReactionMessage {
  socketId: string;
  username: string;
  team: number;
  reactionType: 'gg' | 'wp' | 'rematch' | 'close' | 'amazing';
  timestamp: number;
}

export interface RematchUpdate {
  requestCount: number;
  totalPlayers: number;
  requestedBy: string[];
}

export interface ChatRateLimited {
  remaining: number;
  resetIn: number;
  muted: boolean;
  muteRemaining?: number;
}

export interface ChatCooldown {
  messageId: string;
  cooldownRemaining: number;
}

export interface EmoteCooldown {
  emoteId: string;
  cooldownRemaining: number;
}

class NetworkService {
  private socket: Socket | null = null;
  private token: string | null = null;
  private user: User | null = null;

  // Event callbacks
  public onConnect: (() => void) | null = null;
  public onDisconnect: (() => void) | null = null;
  public onError: ((error: { message: string }) => void) | null = null;
  public onOnlineCount: ((count: number) => void) | null = null;

  // Matchmaking callbacks
  public onMatchmakingJoined: ((data: { mode: string; position: number }) => void) | null = null;
  public onMatchmakingLeft: (() => void) | null = null;
  public onMatchFound: ((data: { roomId: string; room: Room }) => void) | null = null;

  // Room callbacks
  public onRoomCreated: ((data: { roomId: string; room: Room }) => void) | null = null;
  public onRoomJoined: ((data: { roomId: string; room: Room }) => void) | null = null;
  public onRoomLeft: (() => void) | null = null;
  public onPlayerJoined: ((player: RoomPlayer) => void) | null = null;
  public onPlayerLeft: ((data: { socketId: string }) => void) | null = null;
  public onPlayerReady: ((data: { socketId: string; ready: boolean }) => void) | null = null;
  public onPlayerTeamChanged: ((data: { socketId: string; team: number }) => void) | null = null;
  public onHostChanged: ((data: { hostId: string }) => void) | null = null;

  // Game callbacks
  public onGameStarted: ((data: { gameState: GameState; players: RoomPlayer[] }) => void) | null = null;
  public onTroopsSent: ((data: { socketId: string; troop: TroopState; fromTroops: number }) => void) | null = null;
  public onTroopArrived: ((data: { troopId: string; territoryId: number; newOwner: number; newTroops: number }) => void) | null = null;
  public onStateUpdate: ((data: { territories: { id: number; owner: number; troops: number }[]; troops: { id: string; progress: number }[] }) => void) | null = null;
  public onPlayerSurrendered: ((data: { socketId: string; username: string }) => void) | null = null;
  public onPlayerDisconnected: ((data: { socketId: string }) => void) | null = null;
  public onGameEnded: ((data: { winnerTeam: number; duration: number; eloChanges: { socketId: string; username: string; eloChange: number }[] }) => void) | null = null;

  // Chat callbacks
  public onChatMessage: ((message: ChatMessage) => void) | null = null;
  public onQuickChatReceived: ((message: QuickChatMessage) => void) | null = null;
  public onChatRateLimited: ((data: ChatRateLimited) => void) | null = null;
  public onChatCooldown: ((data: ChatCooldown) => void) | null = null;

  // Emote callbacks
  public onEmoteReceived: ((message: EmoteMessage) => void) | null = null;
  public onEmoteCooldown: ((data: EmoteCooldown) => void) | null = null;

  // Reaction callbacks
  public onReactionReceived: ((message: ReactionMessage) => void) | null = null;
  public onRematchUpdate: ((data: RematchUpdate) => void) | null = null;
  public onRematchStarted: ((data: { roomId: string; room: Room }) => void) | null = null;

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  get currentUser(): User | null {
    return this.user;
  }

  get socketId(): string | null {
    return this.socket?.id ?? null;
  }

  // ============ AUTH ============

  async register(username: string, email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const response = await fetch(`${SERVER_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error };
      }

      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('token', data.token);

      return { success: true, user: data.user };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async login(email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const response = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error };
      }

      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('token', data.token);

      return { success: true, user: data.user };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async verifyToken(): Promise<boolean> {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) return false;

    try {
      const response = await fetch(`${SERVER_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${storedToken}` },
      });

      if (!response.ok) {
        localStorage.removeItem('token');
        return false;
      }

      const data = await response.json();
      this.token = storedToken;
      this.user = data;
      return true;
    } catch {
      localStorage.removeItem('token');
      return false;
    }
  }

  logout(): void {
    this.token = null;
    this.user = null;
    localStorage.removeItem('token');
    this.disconnect();
  }

  // ============ SOCKET CONNECTION ============

  connect(): void {
    if (this.socket?.connected) return;

    this.socket = io(SERVER_URL, {
      auth: { token: this.token },
      transports: ['websocket', 'polling'],
    });

    this.setupSocketListeners();
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.onConnect?.();
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.onDisconnect?.();
    });

    this.socket.on('error', (error: { message: string }) => {
      console.error('Socket error:', error);
      this.onError?.(error);
    });

    this.socket.on('online:count', (count: number) => {
      this.onOnlineCount?.(count);
    });

    // Matchmaking
    this.socket.on('matchmaking:joined', (data) => this.onMatchmakingJoined?.(data));
    this.socket.on('matchmaking:left', () => this.onMatchmakingLeft?.());
    this.socket.on('matchmaking:found', (data) => this.onMatchFound?.(data));

    // Room
    this.socket.on('room:created', (data) => this.onRoomCreated?.(data));
    this.socket.on('room:joined', (data) => this.onRoomJoined?.(data));
    this.socket.on('room:left', () => this.onRoomLeft?.());
    this.socket.on('room:playerJoined', (data) => this.onPlayerJoined?.(data.player));
    this.socket.on('room:playerLeft', (data) => this.onPlayerLeft?.(data));
    this.socket.on('room:playerReady', (data) => this.onPlayerReady?.(data));
    this.socket.on('room:playerTeamChanged', (data) => this.onPlayerTeamChanged?.(data));
    this.socket.on('room:hostChanged', (data) => this.onHostChanged?.(data));

    // Game
    this.socket.on('game:started', (data) => this.onGameStarted?.(data));
    this.socket.on('game:troopsSent', (data) => this.onTroopsSent?.(data));
    this.socket.on('game:troopArrived', (data) => this.onTroopArrived?.(data));
    this.socket.on('game:stateUpdate', (data) => this.onStateUpdate?.(data));
    this.socket.on('game:playerSurrendered', (data) => this.onPlayerSurrendered?.(data));
    this.socket.on('game:playerDisconnected', (data) => this.onPlayerDisconnected?.(data));
    this.socket.on('game:ended', (data) => this.onGameEnded?.(data));

    // Chat
    this.socket.on('chat:message', (message) => this.onChatMessage?.(message));
    this.socket.on('quickchat:received', (data) => this.onQuickChatReceived?.(data));
    this.socket.on('chat:rateLimited', (data) => this.onChatRateLimited?.(data));
    this.socket.on('chat:cooldown', (data) => this.onChatCooldown?.(data));

    // Emotes
    this.socket.on('emote:received', (data) => this.onEmoteReceived?.(data));
    this.socket.on('emote:cooldown', (data) => this.onEmoteCooldown?.(data));

    // Reactions
    this.socket.on('reaction:received', (data) => this.onReactionReceived?.(data));
    this.socket.on('rematch:update', (data) => this.onRematchUpdate?.(data));
    this.socket.on('rematch:started', (data) => this.onRematchStarted?.(data));
  }

  // ============ MATCHMAKING ============

  joinMatchmaking(mode: string): void {
    this.socket?.emit('matchmaking:join', mode);
  }

  leaveMatchmaking(): void {
    this.socket?.emit('matchmaking:leave');
  }

  // ============ ROOM ============

  createRoom(mode: string, mapId?: number): void {
    this.socket?.emit('room:create', { mode, mapId });
  }

  joinRoom(roomId: string): void {
    this.socket?.emit('room:join', roomId);
  }

  leaveRoom(): void {
    this.socket?.emit('room:leave');
  }

  setReady(ready: boolean): void {
    this.socket?.emit('room:ready', ready);
  }

  changeTeam(team: number): void {
    this.socket?.emit('room:changeTeam', team);
  }

  // ============ GAME ============

  sendTroops(fromId: number, toId: number, percentage: number): void {
    this.socket?.emit('game:sendTroops', { fromId, toId, percentage });
  }

  surrender(): void {
    this.socket?.emit('game:surrender');
  }

  // ============ CHAT ============

  sendChatMessage(message: string): void {
    this.socket?.emit('chat:send', message);
  }

  sendQuickChat(messageId: string, targetTerritory?: number): void {
    this.socket?.emit('quickchat:send', { messageId, targetTerritory });
  }

  // ============ EMOTES ============

  sendEmote(emoteId: string, targetTerritory?: number): void {
    this.socket?.emit('emote:send', { emoteId, targetTerritory });
  }

  // ============ REACTIONS ============

  sendReaction(reactionType: 'gg' | 'wp' | 'rematch' | 'close' | 'amazing'): void {
    this.socket?.emit('reaction:send', { reactionType });
  }

  // ============ MUTING ============

  mutePlayer(targetSocketId: string): void {
    this.socket?.emit('chat:mute', { targetSocketId });
  }

  // ============ API CALLS ============

  async getLeaderboard(type: 'players' | 'clans' = 'players', limit = 50): Promise<unknown[]> {
    try {
      const response = await fetch(`${SERVER_URL}/api/leaderboard/${type}?limit=${limit}`);
      const data = await response.json();
      return data.leaderboard || [];
    } catch {
      return [];
    }
  }

  async getPlayerStats(playerId: string): Promise<unknown | null> {
    try {
      const response = await fetch(`${SERVER_URL}/api/leaderboard/player/${playerId}/stats`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async getClans(limit = 20): Promise<unknown[]> {
    try {
      const response = await fetch(`${SERVER_URL}/api/clans?limit=${limit}`, {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      });
      const data = await response.json();
      return data.clans || [];
    } catch {
      return [];
    }
  }

  async getClan(clanId: string): Promise<unknown | null> {
    try {
      const response = await fetch(`${SERVER_URL}/api/clans/${clanId}`, {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async createClan(name: string, tag: string, description?: string, icon?: string, color?: string): Promise<{ success: boolean; clan?: unknown; error?: string }> {
    try {
      const response = await fetch(`${SERVER_URL}/api/clans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ name, tag, description, icon, color }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error };
      }

      return { success: true, clan: data.clan };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  async joinClan(clanId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${SERVER_URL}/api/clans/${clanId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error };
      }

      return { success: true };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  async leaveClan(clanId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${SERVER_URL}/api/clans/${clanId}/leave`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error };
      }

      return { success: true };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }
}

export const networkService = new NetworkService();
