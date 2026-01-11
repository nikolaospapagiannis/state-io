import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { userQueries } from './database';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'stateio-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
  };
}

// Middleware to verify JWT token
export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string; email: string };
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Register new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      res.status(400).json({ error: 'Username, email, and password are required' });
      return;
    }

    if (username.length < 3 || username.length > 20) {
      res.status(400).json({ error: 'Username must be 3-20 characters' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    // Check if user exists
    const existingEmail = userQueries.findByEmail.get(email);
    if (existingEmail) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const existingUsername = userQueries.findByUsername.get(username);
    if (existingUsername) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    userQueries.create.run(userId, username, email, passwordHash);

    // Generate token
    const token = jwt.sign(
      { id: userId, username, email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: userId,
        username,
        email,
        elo: 1000,
        wins: 0,
        losses: 0,
        draws: 0,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Find user
    const user = userQueries.findByEmail.get(email) as {
      id: string;
      username: string;
      email: string;
      password_hash: string;
      elo: number;
      wins: number;
      losses: number;
      draws: number;
      avatar: string;
      title: string;
      clan_id: string | null;
    } | undefined;

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Update last login
    userQueries.updateLastLogin.run(Math.floor(Date.now() / 1000), user.id);

    // Generate token
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        elo: user.elo,
        wins: user.wins,
        losses: user.losses,
        draws: user.draws,
        avatar: user.avatar,
        title: user.title,
        clanId: user.clan_id,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user profile
router.get('/me', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const profile = userQueries.getProfile.get(req.user.id) as {
      id: string;
      username: string;
      elo: number;
      wins: number;
      losses: number;
      draws: number;
      avatar: string;
      title: string;
      created_at: number;
      clan_name: string | null;
      clan_tag: string | null;
    } | undefined;

    if (!profile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const rank = userQueries.getPlayerRank.get(req.user.id) as { rank: number };

    res.json({
      ...profile,
      rank: rank?.rank || 1,
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Get user profile by ID
router.get('/profile/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const profile = userQueries.getProfile.get(id) as {
      id: string;
      username: string;
      elo: number;
      wins: number;
      losses: number;
      draws: number;
      avatar: string;
      title: string;
      created_at: number;
      clan_name: string | null;
      clan_tag: string | null;
    } | undefined;

    if (!profile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const rank = userQueries.getPlayerRank.get(id) as { rank: number };

    res.json({
      ...profile,
      rank: rank?.rank || 1,
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Verify token
router.get('/verify', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ valid: true, user: req.user });
});

export { router as authRouter };
