import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { userQueries, matchQueries, clanQueries } from './database';
import { QUICK_CHAT_MESSAGES, filterProfanity, checkRateLimit, checkQuickChatCooldown, chatQueries } from './chat';
import { EMOTES, checkEmoteCooldown, canUserUseEmote, emoteQueries } from './emotes';

const JWT_SECRET = process.env.JWT_SECRET || 'stateio-secret-key-change-in-production';

interface Player {
  id: string;
  socketId: string;
  username: string;
  elo: number;
  team: number;
  ready: boolean;
  connected: boolean;
}

interface GameRoom {
  id: string;
  mode: string;
  status: 'waiting' | 'starting' | 'playing' | 'finished';
  players: Map<string, Player>;
  maxPlayers: number;
  teamsCount: number;
  mapId: number;
  hostId: string;
  gameState: GameState | null;
  createdAt: number;
}

interface GameState {
  territories: TerritoryState[];
  troops: TroopState[];
  startedAt: number;
  tickRate: number;
}

interface TerritoryState {
  id: number;
  owner: number;
  troops: number;
  x: number;
  y: number;
  radius: number;
}

interface TroopState {
  id: string;
  owner: number;
  count: number;
  fromId: number;
  toId: number;
  progress: number;
}

interface MatchmakingEntry {
  socketId: string;
  userId: string;
  username: string;
  elo: number;
  mode: string;
  queuedAt: number;
}

// Global state
const rooms = new Map<string, GameRoom>();
const playerRooms = new Map<string, string>(); // socketId -> roomId
const matchmakingQueue: MatchmakingEntry[] = [];
const onlinePlayers = new Map<string, { socketId: string; userId: string; username: string; elo: number }>();

// Game mode configurations
const GAME_MODES: Record<string, { teamSize: number; teams: number }> = {
  '1v1': { teamSize: 1, teams: 2 },
  '2v2': { teamSize: 2, teams: 2 },
  '5v5': { teamSize: 5, teams: 2 },
  'ffa4': { teamSize: 1, teams: 4 },
  'ffa8': { teamSize: 1, teams: 8 },
};

export function setupSocketHandlers(io: Server): void {
  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      // Allow guest connections for spectating/menu
      socket.data.guest = true;
      socket.data.socketId = `guest-${uuidv4().substring(0, 8)}`;
      return next();
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string; email: string };
      socket.data.userId = decoded.id;
      socket.data.username = decoded.username;
      socket.data.guest = false;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id} (${socket.data.guest ? 'guest' : socket.data.username})`);

    // Register authenticated user as online
    if (!socket.data.guest) {
      const user = userQueries.findById.get(socket.data.userId) as { elo: number } | undefined;
      onlinePlayers.set(socket.id, {
        socketId: socket.id,
        userId: socket.data.userId,
        username: socket.data.username,
        elo: user?.elo || 1000,
      });

      // Broadcast online count
      io.emit('online:count', onlinePlayers.size);
    }

    // Get online players count
    socket.on('online:get', () => {
      socket.emit('online:count', onlinePlayers.size);
    });

    // ============ MATCHMAKING ============

    socket.on('matchmaking:join', (mode: string) => {
      if (socket.data.guest) {
        socket.emit('error', { message: 'Please login to play online' });
        return;
      }

      if (!GAME_MODES[mode]) {
        socket.emit('error', { message: 'Invalid game mode' });
        return;
      }

      // Check if already in queue or room
      if (playerRooms.has(socket.id)) {
        socket.emit('error', { message: 'Already in a game' });
        return;
      }

      const existingEntry = matchmakingQueue.find(e => e.socketId === socket.id);
      if (existingEntry) {
        socket.emit('error', { message: 'Already in queue' });
        return;
      }

      const user = userQueries.findById.get(socket.data.userId) as { elo: number } | undefined;
      const entry: MatchmakingEntry = {
        socketId: socket.id,
        userId: socket.data.userId,
        username: socket.data.username,
        elo: user?.elo || 1000,
        mode,
        queuedAt: Date.now(),
      };

      matchmakingQueue.push(entry);
      socket.emit('matchmaking:joined', { mode, position: matchmakingQueue.filter(e => e.mode === mode).length });

      // Try to create a match
      tryCreateMatch(io, mode);
    });

    socket.on('matchmaking:leave', () => {
      const index = matchmakingQueue.findIndex(e => e.socketId === socket.id);
      if (index !== -1) {
        matchmakingQueue.splice(index, 1);
        socket.emit('matchmaking:left');
      }
    });

    // ============ ROOM MANAGEMENT ============

    socket.on('room:create', (options: { mode: string; mapId?: number }) => {
      if (socket.data.guest) {
        socket.emit('error', { message: 'Please login to create rooms' });
        return;
      }

      const { mode, mapId } = options;
      if (!GAME_MODES[mode]) {
        socket.emit('error', { message: 'Invalid game mode' });
        return;
      }

      const modeConfig = GAME_MODES[mode];
      const roomId = uuidv4().substring(0, 8).toUpperCase();
      const user = userQueries.findById.get(socket.data.userId) as { elo: number } | undefined;

      const room: GameRoom = {
        id: roomId,
        mode,
        status: 'waiting',
        players: new Map(),
        maxPlayers: modeConfig.teamSize * modeConfig.teams,
        teamsCount: modeConfig.teams,
        mapId: mapId || Math.floor(Math.random() * 40) + 1,
        hostId: socket.id,
        gameState: null,
        createdAt: Date.now(),
      };

      const player: Player = {
        id: socket.data.userId,
        socketId: socket.id,
        username: socket.data.username,
        elo: user?.elo || 1000,
        team: 0,
        ready: false,
        connected: true,
      };

      room.players.set(socket.id, player);
      rooms.set(roomId, room);
      playerRooms.set(socket.id, roomId);

      socket.join(roomId);
      socket.emit('room:created', { roomId, room: serializeRoom(room) });
    });

    socket.on('room:join', (roomId: string) => {
      if (socket.data.guest) {
        socket.emit('error', { message: 'Please login to join rooms' });
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      if (room.status !== 'waiting') {
        socket.emit('error', { message: 'Game already in progress' });
        return;
      }

      if (room.players.size >= room.maxPlayers) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }

      const user = userQueries.findById.get(socket.data.userId) as { elo: number } | undefined;
      const player: Player = {
        id: socket.data.userId,
        socketId: socket.id,
        username: socket.data.username,
        elo: user?.elo || 1000,
        team: assignTeam(room),
        ready: false,
        connected: true,
      };

      room.players.set(socket.id, player);
      playerRooms.set(socket.id, roomId);

      socket.join(roomId);
      socket.emit('room:joined', { roomId, room: serializeRoom(room) });
      socket.to(roomId).emit('room:playerJoined', { player: serializePlayer(player) });
    });

    socket.on('room:leave', () => {
      handlePlayerLeaveRoom(io, socket);
    });

    socket.on('room:ready', (ready: boolean) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.get(socket.id);
      if (!player) return;

      player.ready = ready;
      io.to(roomId).emit('room:playerReady', { socketId: socket.id, ready });

      // Check if all players are ready
      if (room.players.size >= 2 && Array.from(room.players.values()).every(p => p.ready)) {
        startGame(io, room);
      }
    });

    socket.on('room:changeTeam', (team: number) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room || room.status !== 'waiting') return;

      const player = room.players.get(socket.id);
      if (!player) return;

      if (team >= 0 && team < room.teamsCount) {
        player.team = team;
        io.to(roomId).emit('room:playerTeamChanged', { socketId: socket.id, team });
      }
    });

    // ============ GAME ACTIONS ============

    socket.on('game:sendTroops', (data: { fromId: number; toId: number; percentage: number }) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room || room.status !== 'playing' || !room.gameState) return;

      const player = room.players.get(socket.id);
      if (!player) return;

      const { fromId, toId, percentage } = data;
      const fromTerritory = room.gameState.territories.find(t => t.id === fromId);
      const toTerritory = room.gameState.territories.find(t => t.id === toId);

      if (!fromTerritory || !toTerritory) return;
      if (fromTerritory.owner !== player.team) return;

      const troopsToSend = Math.floor(fromTerritory.troops * Math.min(1, Math.max(0, percentage)));
      if (troopsToSend <= 0) return;

      fromTerritory.troops -= troopsToSend;

      const troop: TroopState = {
        id: uuidv4(),
        owner: player.team,
        count: troopsToSend,
        fromId,
        toId,
        progress: 0,
      };

      room.gameState.troops.push(troop);

      io.to(roomId).emit('game:troopsSent', {
        socketId: socket.id,
        troop,
        fromTroops: fromTerritory.troops,
      });
    });

    socket.on('game:surrender', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room || room.status !== 'playing') return;

      const player = room.players.get(socket.id);
      if (!player) return;

      // Mark player as surrendered
      player.connected = false;
      io.to(roomId).emit('game:playerSurrendered', { socketId: socket.id, username: player.username });

      // Check if game should end
      checkGameEnd(io, room);
    });

    // ============ QUICK CHAT ============

    socket.on('quickchat:send', (data: { messageId: string; targetTerritory?: number }) => {
      if (socket.data.guest) return;

      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.get(socket.id);
      if (!player) return;

      const { messageId, targetTerritory } = data;

      // Validate message exists
      const message = QUICK_CHAT_MESSAGES.find(m => m.id === messageId);
      if (!message) {
        socket.emit('error', { message: 'Invalid quick chat message' });
        return;
      }

      // Check rate limit
      const rateLimit = checkRateLimit(socket.data.userId);
      if (!rateLimit.allowed) {
        socket.emit('chat:rateLimited', {
          remaining: rateLimit.remaining,
          resetIn: rateLimit.resetIn,
          muted: rateLimit.muted,
          muteRemaining: rateLimit.muteRemaining,
        });
        return;
      }

      // Check message-specific cooldown
      const cooldown = checkQuickChatCooldown(socket.data.userId, messageId);
      if (!cooldown.allowed) {
        socket.emit('chat:cooldown', {
          messageId,
          cooldownRemaining: cooldown.cooldownRemaining,
        });
        return;
      }

      // Check if message is unlocked for user (if not default available)
      if (!message.available && message.unlockRequirement) {
        // TODO: Check unlock status from chat preferences
      }

      // Log the message for moderation
      chatQueries.logMessage.run(
        socket.data.userId,
        roomId,
        'quick_chat',
        messageId,
        null,
        null,
        0,
        Date.now()
      );

      // Broadcast to room
      io.to(roomId).emit('quickchat:received', {
        socketId: socket.id,
        username: player.username,
        team: player.team,
        messageId,
        message: message.translations['en'], // Default to English
        translations: message.translations,
        targetTerritory,
        timestamp: Date.now(),
      });
    });

    // Custom text chat (for lobbies/post-game)
    socket.on('chat:send', (message: string) => {
      if (socket.data.guest) return;

      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.get(socket.id);
      if (!player) return;

      // Check rate limit
      const rateLimit = checkRateLimit(socket.data.userId);
      if (!rateLimit.allowed) {
        socket.emit('chat:rateLimited', {
          remaining: rateLimit.remaining,
          resetIn: rateLimit.resetIn,
          muted: rateLimit.muted,
          muteRemaining: rateLimit.muteRemaining,
        });
        return;
      }

      // Sanitize and filter message
      const sanitized = message.substring(0, 200).trim();
      if (!sanitized) return;

      const { filtered, containsProfanity } = filterProfanity(sanitized);

      // Log the message
      chatQueries.logMessage.run(
        socket.data.userId,
        roomId,
        'custom',
        null,
        sanitized,
        filtered,
        containsProfanity ? 1 : 0,
        Date.now()
      );

      io.to(roomId).emit('chat:message', {
        socketId: socket.id,
        username: player.username,
        team: player.team,
        message: filtered, // Send filtered message
        timestamp: Date.now(),
      });
    });

    // ============ EMOTES ============

    socket.on('emote:send', (data: { emoteId: string; targetTerritory?: number }) => {
      if (socket.data.guest) return;

      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.get(socket.id);
      if (!player) return;

      const { emoteId, targetTerritory } = data;

      // Validate emote exists
      const emote = EMOTES.find(e => e.id === emoteId);
      if (!emote) {
        socket.emit('error', { message: 'Invalid emote' });
        return;
      }

      // Check if user has access to this emote
      if (!canUserUseEmote(socket.data.userId, emoteId)) {
        socket.emit('error', { message: 'Emote not unlocked' });
        return;
      }

      // Check cooldown
      const cooldown = checkEmoteCooldown(socket.data.userId, emoteId);
      if (!cooldown.allowed) {
        socket.emit('emote:cooldown', {
          emoteId,
          cooldownRemaining: cooldown.cooldownRemaining,
        });
        return;
      }

      // Track usage
      emoteQueries.trackUsage.run(socket.data.userId, emoteId, roomId, Date.now());
      emoteQueries.incrementUsage.run(socket.data.userId, emoteId);
      emoteQueries.updateAnalytics.run(emoteId, Date.now());

      // Broadcast to room
      io.to(roomId).emit('emote:received', {
        socketId: socket.id,
        username: player.username,
        team: player.team,
        emoteId,
        emote: {
          name: emote.name,
          animation: emote.animation,
          duration: emote.duration,
          sound: emote.sound,
          rarity: emote.rarity,
        },
        targetTerritory,
        timestamp: Date.now(),
      });
    });

    // ============ POST-GAME REACTIONS ============

    socket.on('reaction:send', (data: { reactionType: 'gg' | 'wp' | 'rematch' | 'close' | 'amazing' }) => {
      if (socket.data.guest) return;

      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room || room.status !== 'finished') return;

      const player = room.players.get(socket.id);
      if (!player) return;

      const { reactionType } = data;

      // Validate reaction type
      const validReactions = ['gg', 'wp', 'rematch', 'close', 'amazing'];
      if (!validReactions.includes(reactionType)) {
        socket.emit('error', { message: 'Invalid reaction' });
        return;
      }

      // Broadcast to room
      io.to(roomId).emit('reaction:received', {
        socketId: socket.id,
        username: player.username,
        team: player.team,
        reactionType,
        timestamp: Date.now(),
      });

      // If rematch, handle rematch request
      if (reactionType === 'rematch') {
        handleRematchRequest(io, room, socket.id);
      }
    });

    // ============ MUTING ============

    socket.on('chat:mute', (data: { targetSocketId: string }) => {
      if (socket.data.guest) return;

      // Client-side muting (store in user preferences)
      socket.emit('chat:muted', { targetSocketId: data.targetSocketId });
    });

    // ============ DISCONNECT ============

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);

      // Remove from online players
      onlinePlayers.delete(socket.id);
      io.emit('online:count', onlinePlayers.size);

      // Remove from matchmaking queue
      const queueIndex = matchmakingQueue.findIndex(e => e.socketId === socket.id);
      if (queueIndex !== -1) {
        matchmakingQueue.splice(queueIndex, 1);
      }

      // Handle room disconnect
      handlePlayerLeaveRoom(io, socket);
    });
  });

  // Matchmaking interval
  setInterval(() => {
    for (const mode of Object.keys(GAME_MODES)) {
      tryCreateMatch(io, mode);
    }
  }, 2000);

  // Game tick interval
  setInterval(() => {
    for (const room of rooms.values()) {
      if (room.status === 'playing' && room.gameState) {
        updateGameState(io, room);
      }
    }
  }, 100); // 10 ticks per second
}

function tryCreateMatch(io: Server, mode: string): void {
  const modeConfig = GAME_MODES[mode];
  const requiredPlayers = modeConfig.teamSize * modeConfig.teams;
  const modePlayers = matchmakingQueue.filter(e => e.mode === mode);

  if (modePlayers.length >= requiredPlayers) {
    // Sort by elo for balanced matchmaking
    modePlayers.sort((a, b) => a.elo - b.elo);

    const selectedPlayers = modePlayers.slice(0, requiredPlayers);
    const roomId = uuidv4().substring(0, 8).toUpperCase();

    const room: GameRoom = {
      id: roomId,
      mode,
      status: 'waiting',
      players: new Map(),
      maxPlayers: requiredPlayers,
      teamsCount: modeConfig.teams,
      mapId: Math.floor(Math.random() * 40) + 1,
      hostId: selectedPlayers[0].socketId,
      gameState: null,
      createdAt: Date.now(),
    };

    // Assign players to teams
    selectedPlayers.forEach((entry, index) => {
      const team = index % modeConfig.teams;
      const player: Player = {
        id: entry.userId,
        socketId: entry.socketId,
        username: entry.username,
        elo: entry.elo,
        team,
        ready: true, // Auto-ready for matchmaking
        connected: true,
      };

      room.players.set(entry.socketId, player);
      playerRooms.set(entry.socketId, roomId);

      // Remove from queue
      const queueIndex = matchmakingQueue.findIndex(e => e.socketId === entry.socketId);
      if (queueIndex !== -1) {
        matchmakingQueue.splice(queueIndex, 1);
      }

      // Join socket room
      const socket = io.sockets.sockets.get(entry.socketId);
      if (socket) {
        socket.join(roomId);
      }
    });

    rooms.set(roomId, room);

    // Notify players
    io.to(roomId).emit('matchmaking:found', { roomId, room: serializeRoom(room) });

    // Start game after short delay
    setTimeout(() => {
      if (rooms.has(roomId)) {
        startGame(io, room);
      }
    }, 3000);
  }
}

function startGame(io: Server, room: GameRoom): void {
  room.status = 'playing';

  // Generate initial game state
  room.gameState = generateGameState(room);

  // Create match record
  matchQueries.create.run(room.id, room.mode, room.mapId);

  // Add participants
  room.players.forEach(player => {
    matchQueries.addParticipant.run(room.id, player.id, player.team);
  });

  io.to(room.id).emit('game:started', {
    gameState: room.gameState,
    players: Array.from(room.players.values()).map(serializePlayer),
  });
}

function generateGameState(room: GameRoom): GameState {
  const territories: TerritoryState[] = [];
  const teamCount = room.teamsCount;
  const playersPerTeam = Math.ceil(room.players.size / teamCount);

  // Generate territories based on team count
  const centerX = 400;
  const centerY = 300;
  const radius = 200;

  // Create starting territories for each team
  for (let team = 0; team < teamCount; team++) {
    const angle = (team / teamCount) * Math.PI * 2 - Math.PI / 2;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    territories.push({
      id: team,
      owner: team,
      troops: 50 * playersPerTeam,
      x,
      y,
      radius: 40,
    });
  }

  // Add neutral territories
  const neutralCount = Math.min(20, 5 + room.players.size * 2);
  for (let i = 0; i < neutralCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 150;
    const x = centerX + Math.cos(angle) * dist;
    const y = centerY + Math.sin(angle) * dist;

    territories.push({
      id: teamCount + i,
      owner: -1, // Neutral
      troops: Math.floor(5 + Math.random() * 30),
      x,
      y,
      radius: 25 + Math.random() * 20,
    });
  }

  return {
    territories,
    troops: [],
    startedAt: Date.now(),
    tickRate: 10,
  };
}

function updateGameState(io: Server, room: GameRoom): void {
  if (!room.gameState) return;

  const state = room.gameState;

  // Update troops movement
  const arrivedTroops: TroopState[] = [];
  state.troops = state.troops.filter(troop => {
    troop.progress += 0.02; // Movement speed

    if (troop.progress >= 1) {
      arrivedTroops.push(troop);
      return false;
    }
    return true;
  });

  // Process arrived troops
  for (const troop of arrivedTroops) {
    const target = state.territories.find(t => t.id === troop.toId);
    if (!target) continue;

    if (target.owner === troop.owner || target.owner === -1) {
      // Reinforce
      if (target.owner === -1) target.owner = troop.owner;
      target.troops += troop.count;
    } else {
      // Attack
      if (troop.count > target.troops) {
        target.troops = troop.count - target.troops;
        target.owner = troop.owner;
      } else {
        target.troops -= troop.count;
        if (target.troops === 0) {
          target.owner = -1;
        }
      }
    }

    io.to(room.id).emit('game:troopArrived', {
      troopId: troop.id,
      territoryId: target.id,
      newOwner: target.owner,
      newTroops: target.troops,
    });
  }

  // Generate troops for owned territories
  const now = Date.now();
  if (now - state.startedAt > 1000) {
    state.territories.forEach(territory => {
      if (territory.owner >= 0) {
        territory.troops += 0.1; // Troop generation rate
      }
    });
  }

  // Broadcast state update
  io.to(room.id).emit('game:stateUpdate', {
    territories: state.territories.map(t => ({
      id: t.id,
      owner: t.owner,
      troops: Math.floor(t.troops),
    })),
    troops: state.troops.map(t => ({
      id: t.id,
      progress: t.progress,
    })),
  });

  checkGameEnd(io, room);
}

function checkGameEnd(io: Server, room: GameRoom): void {
  if (!room.gameState || room.status !== 'playing') return;

  const activeTeams = new Set<number>();
  room.gameState.territories.forEach(t => {
    if (t.owner >= 0) activeTeams.add(t.owner);
  });

  // Also check connected players
  const connectedTeams = new Set<number>();
  room.players.forEach(p => {
    if (p.connected) connectedTeams.add(p.team);
  });

  // Intersect active teams with connected teams
  const remainingTeams = [...activeTeams].filter(t => connectedTeams.has(t));

  if (remainingTeams.length <= 1) {
    const winnerTeam = remainingTeams[0] ?? -1;
    endGame(io, room, winnerTeam);
  }
}

function endGame(io: Server, room: GameRoom, winnerTeam: number): void {
  room.status = 'finished';

  const duration = room.gameState ? Math.floor((Date.now() - room.gameState.startedAt) / 1000) : 0;

  // Update match record
  matchQueries.finish.run(winnerTeam, duration, room.id);

  // Calculate ELO changes
  const K = 32;
  const winners: Player[] = [];
  const losers: Player[] = [];

  room.players.forEach(player => {
    if (player.team === winnerTeam) {
      winners.push(player);
    } else {
      losers.push(player);
    }
  });

  const avgWinnerElo = winners.reduce((sum, p) => sum + p.elo, 0) / winners.length || 1000;
  const avgLoserElo = losers.reduce((sum, p) => sum + p.elo, 0) / losers.length || 1000;

  const expectedWinner = 1 / (1 + Math.pow(10, (avgLoserElo - avgWinnerElo) / 400));
  const eloChange = Math.round(K * (1 - expectedWinner));

  // Update player stats
  room.players.forEach(player => {
    const isWinner = player.team === winnerTeam;
    const change = isWinner ? eloChange : -eloChange;
    const newElo = Math.max(0, player.elo + change);

    userQueries.updateElo.run(newElo, isWinner ? 1 : 0, isWinner ? 0 : 1, player.id);
    matchQueries.updateParticipant.run(change, 0, 0, room.id, player.id);
  });

  io.to(room.id).emit('game:ended', {
    winnerTeam,
    duration,
    eloChanges: Array.from(room.players.values()).map(p => ({
      socketId: p.socketId,
      username: p.username,
      eloChange: p.team === winnerTeam ? eloChange : -eloChange,
    })),
  });

  // Cleanup after delay
  setTimeout(() => {
    room.players.forEach((_, socketId) => {
      playerRooms.delete(socketId);
    });
    rooms.delete(room.id);
  }, 30000);
}

function handlePlayerLeaveRoom(io: Server, socket: Socket): void {
  const roomId = playerRooms.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) {
    playerRooms.delete(socket.id);
    return;
  }

  const player = room.players.get(socket.id);
  if (!player) return;

  if (room.status === 'waiting') {
    // Remove player from waiting room
    room.players.delete(socket.id);
    socket.leave(roomId);
    playerRooms.delete(socket.id);

    if (room.players.size === 0) {
      rooms.delete(roomId);
    } else {
      // Transfer host if needed
      if (room.hostId === socket.id) {
        room.hostId = room.players.keys().next().value!;
        io.to(roomId).emit('room:hostChanged', { hostId: room.hostId });
      }
      io.to(roomId).emit('room:playerLeft', { socketId: socket.id });
    }
  } else if (room.status === 'playing') {
    // Mark as disconnected but keep in game
    player.connected = false;
    io.to(roomId).emit('game:playerDisconnected', { socketId: socket.id });
    checkGameEnd(io, room);
  }

  socket.emit('room:left');
}

function assignTeam(room: GameRoom): number {
  const teamCounts: number[] = new Array(room.teamsCount).fill(0);
  room.players.forEach(p => {
    teamCounts[p.team]++;
  });

  // Find team with least players
  let minTeam = 0;
  let minCount = teamCounts[0];
  for (let i = 1; i < room.teamsCount; i++) {
    if (teamCounts[i] < minCount) {
      minCount = teamCounts[i];
      minTeam = i;
    }
  }
  return minTeam;
}

function serializeRoom(room: GameRoom): object {
  return {
    id: room.id,
    mode: room.mode,
    status: room.status,
    players: Array.from(room.players.values()).map(serializePlayer),
    maxPlayers: room.maxPlayers,
    teamsCount: room.teamsCount,
    mapId: room.mapId,
    hostId: room.hostId,
  };
}

function serializePlayer(player: Player): object {
  return {
    id: player.id,
    socketId: player.socketId,
    username: player.username,
    elo: player.elo,
    team: player.team,
    ready: player.ready,
    connected: player.connected,
  };
}

// ============ REMATCH HANDLING ============

const rematchRequests = new Map<string, Set<string>>(); // roomId -> set of socketIds who want rematch

function handleRematchRequest(io: Server, room: GameRoom, socketId: string): void {
  const roomId = room.id;

  if (!rematchRequests.has(roomId)) {
    rematchRequests.set(roomId, new Set());
  }

  const requests = rematchRequests.get(roomId)!;
  requests.add(socketId);

  // Notify room of rematch request count
  io.to(roomId).emit('rematch:update', {
    requestCount: requests.size,
    totalPlayers: room.players.size,
    requestedBy: Array.from(requests),
  });

  // Check if all players want rematch
  const connectedPlayers = Array.from(room.players.values()).filter(p => p.connected);
  if (requests.size >= connectedPlayers.length && connectedPlayers.length >= 2) {
    // Create new room with same settings
    const newRoomId = uuidv4().substring(0, 8).toUpperCase();

    const newRoom: GameRoom = {
      id: newRoomId,
      mode: room.mode,
      status: 'waiting',
      players: new Map(),
      maxPlayers: room.maxPlayers,
      teamsCount: room.teamsCount,
      mapId: Math.floor(Math.random() * 40) + 1, // New random map
      hostId: connectedPlayers[0].socketId,
      gameState: null,
      createdAt: Date.now(),
    };

    // Move players to new room
    connectedPlayers.forEach(player => {
      const newPlayer: Player = {
        ...player,
        ready: false,
      };

      newRoom.players.set(player.socketId, newPlayer);
      playerRooms.set(player.socketId, newRoomId);

      const socket = io.sockets.sockets.get(player.socketId);
      if (socket) {
        socket.leave(roomId);
        socket.join(newRoomId);
      }
    });

    rooms.set(newRoomId, newRoom);
    rematchRequests.delete(roomId);

    // Notify players of rematch
    io.to(newRoomId).emit('rematch:started', {
      roomId: newRoomId,
      room: serializeRoom(newRoom),
    });
  }
}
