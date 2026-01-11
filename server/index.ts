import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// Database (initializes tables on import)
import './database';

// Auth
import { authRouter, authenticateToken } from './auth';

// Socket handlers
import { setupSocketHandlers } from './socket';

// Core routers
import { clanRouter } from './clans';
import { leaderboardRouter } from './leaderboard';

// Analytics & Player Profiling
import { analyticsRouter, initAnalyticsTables } from './analytics';
import { segmentationRouter, initSegmentationTables } from './segmentation';
import { churnRouter, initChurnTables } from './churn';

// FOMO & Engagement
import { fomoRouter, initFomoTables } from './fomo';
import { notificationsRouter, initNotificationTables } from './notifications';

// Achievements & Gamification
import { achievementRouter, initAchievementTables } from './achievements';
import { rankingRouter, initRankingTables } from './rankings';
import { seasonRouter, initSeasonTables } from './seasons';
import { questRouter, initQuestTables } from './quests';
import { collectionRouter, initCollectionTables } from './collections';

// Monetization
import { currencyRouter } from './currency';
import { battlePassRouter } from './battlepass';
import { subscriptionRouter } from './subscriptions';
import { storeRouter } from './store';

// Dynamic Difficulty & Economy
import { ddaRouter } from './dda';
import { eddaRouter } from './edda';
import { economyRouter } from './economy';
import { personalizationRouter } from './personalization';
import { liveopsRouter } from './liveops';

// In-Game Communication
import { chatRouter, initChatTables } from './chat';
import { emoteRouter, initEmoteTables } from './emotes';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:8700', 'http://localhost:3000', 'capacitor://localhost', 'ionic://localhost', '*'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: ['http://localhost:8700', 'http://localhost:3000', 'capacitor://localhost', 'ionic://localhost'],
  credentials: true,
}));
app.use(express.json());

// Initialize all module tables
initAnalyticsTables();
initSegmentationTables();
initChurnTables();
initFomoTables();
initNotificationTables();
initAchievementTables();
initRankingTables();
initSeasonTables();
initQuestTables();
initCollectionTables();
initChatTables();
initEmoteTables();

// ============ ROUTES ============

// Auth (public)
app.use('/api/auth', authRouter);

// Leaderboard (public)
app.use('/api/leaderboard', leaderboardRouter);

// Health check (public)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    version: '2.0.0',
    features: [
      'analytics',
      'achievements',
      'battlepass',
      'subscriptions',
      'dda',
      'fomo',
      'seasons',
      'quests',
      'collections',
      'personalization'
    ]
  });
});

// ============ PROTECTED ROUTES ============

// Core gameplay
app.use('/api/clans', authenticateToken, clanRouter);

// Analytics & Player Profiling
app.use('/api/analytics', analyticsRouter);
app.use('/api/player', authenticateToken, segmentationRouter);
app.use('/api/churn', authenticateToken, churnRouter);

// FOMO & Engagement
app.use('/api/fomo', fomoRouter);
app.use('/api/notifications', notificationsRouter);

// Achievements & Gamification
app.use('/api/achievements', achievementRouter);
app.use('/api/rankings', rankingRouter);
app.use('/api/seasons', seasonRouter);
app.use('/api/quests', authenticateToken, questRouter);
app.use('/api/collections', collectionRouter);

// Monetization
app.use('/api/currency', authenticateToken, currencyRouter);
app.use('/api/battlepass', authenticateToken, battlePassRouter);
app.use('/api/subscriptions', authenticateToken, subscriptionRouter);
app.use('/api/store', storeRouter);

// Dynamic Difficulty & Economy
app.use('/api/dda', authenticateToken, ddaRouter);
app.use('/api/edda', authenticateToken, eddaRouter);
app.use('/api/economy', authenticateToken, economyRouter);
app.use('/api/personalization', authenticateToken, personalizationRouter);
app.use('/api/liveops', liveopsRouter);

// In-Game Communication
app.use('/api/chat', chatRouter);
app.use('/api/emotes', emoteRouter);

// ============ SOCKET.IO ============

// Socket.io handlers
setupSocketHandlers(io);

// ============ SERVER START ============

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`
=====================================
   STATE.IO ENTERPRISE SERVER v2.0
=====================================
Port: ${PORT}
WebSocket: Ready
Database: Initialized

Active Systems:
  - Authentication & Authorization
  - Player Analytics & Segmentation
  - Churn Prediction
  - Achievement System (55+ achievements)
  - Battle Pass (50 levels, 3 tiers)
  - Subscription System (Plus/Pro/Elite)
  - Dynamic Difficulty Adjustment
  - Engagement-Optimized DDA
  - FOMO Mechanics Engine
  - Seasonal Rankings (9 divisions)
  - Quest System (Daily/Weekly/Monthly)
  - Collection System (50+ items)
  - Live Operations
  - Personalized Content Delivery
  - Push Notifications
  - In-Game Chat System (Quick Chat)
  - Emote System (35+ emotes)

API Endpoints: 20+ route groups
Real-time: Socket.io multiplayer
=====================================
  `);
});

export { io };
