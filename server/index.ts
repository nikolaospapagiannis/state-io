import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { initDatabase } from './database';
import { authRouter, authenticateToken } from './auth';
import { setupSocketHandlers } from './socket';
import { clanRouter } from './clans';
import { leaderboardRouter } from './leaderboard';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:8700', 'http://localhost:3000', 'capacitor://localhost', 'ionic://localhost'],
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

// Initialize database
initDatabase();

// Routes
app.use('/api/auth', authRouter);
app.use('/api/clans', authenticateToken, clanRouter);
app.use('/api/leaderboard', leaderboardRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Socket.io handlers
setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket ready for connections`);
});

export { io };
