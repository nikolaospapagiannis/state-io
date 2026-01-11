/**
 * Rate Limiter Middleware
 * Production-grade rate limiting per IP and per user
 * Supports different limits for different endpoint types
 */

import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../auth';

// ============ TYPES ============

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
  blockExpiry: number;
}

interface RateLimitConfig {
  windowMs: number;        // Time window in milliseconds
  maxRequests: number;     // Max requests per window
  blockDurationMs: number; // How long to block after exceeding limit
  keyPrefix: string;       // Prefix for the key (e.g., 'auth', 'api')
}

interface RateLimitStore {
  entries: Map<string, RateLimitEntry>;
  lastCleanup: number;
}

// ============ CONFIGURATION ============

export const RATE_LIMIT_CONFIGS = {
  // Auth endpoints: 5 requests per minute
  auth: {
    windowMs: 60 * 1000,       // 1 minute
    maxRequests: 5,
    blockDurationMs: 5 * 60 * 1000,  // 5 minute block
    keyPrefix: 'auth',
  } as RateLimitConfig,

  // API endpoints: 100 requests per minute
  api: {
    windowMs: 60 * 1000,       // 1 minute
    maxRequests: 100,
    blockDurationMs: 60 * 1000,  // 1 minute block
    keyPrefix: 'api',
  } as RateLimitConfig,

  // Socket events: 60 events per minute
  socket: {
    windowMs: 60 * 1000,       // 1 minute
    maxRequests: 60,
    blockDurationMs: 30 * 1000,  // 30 second block
    keyPrefix: 'socket',
  } as RateLimitConfig,

  // Store/purchase endpoints: 10 requests per minute (sensitive)
  store: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    blockDurationMs: 5 * 60 * 1000,
    keyPrefix: 'store',
  } as RateLimitConfig,

  // Strict mode for brute force protection
  strict: {
    windowMs: 60 * 1000,
    maxRequests: 3,
    blockDurationMs: 15 * 60 * 1000,  // 15 minute block
    keyPrefix: 'strict',
  } as RateLimitConfig,
} as const;

// ============ STORAGE ============

// In-memory store (can be replaced with Redis for distributed systems)
const stores: Map<string, RateLimitStore> = new Map();

function getStore(keyPrefix: string): RateLimitStore {
  let store = stores.get(keyPrefix);
  if (!store) {
    store = {
      entries: new Map(),
      lastCleanup: Date.now(),
    };
    stores.set(keyPrefix, store);
  }
  return store;
}

// Cleanup expired entries every 5 minutes to prevent memory bloat
const CLEANUP_INTERVAL = 5 * 60 * 1000;

function cleanupStore(store: RateLimitStore): void {
  const now = Date.now();
  if (now - store.lastCleanup < CLEANUP_INTERVAL) {
    return;
  }

  for (const [key, entry] of store.entries) {
    // Remove entries that have expired and are not blocked
    if (entry.resetTime < now && !entry.blocked) {
      store.entries.delete(key);
    }
    // Remove entries whose block has expired
    if (entry.blocked && entry.blockExpiry < now) {
      store.entries.delete(key);
    }
  }

  store.lastCleanup = now;
}

// ============ CORE RATE LIMIT LOGIC ============

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter: number | null;
  blocked: boolean;
}

function getClientKey(req: Request, keyPrefix: string): string {
  // Use user ID if authenticated, otherwise use IP
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;

  // Get IP from various headers (proxy-aware)
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.socket?.remoteAddress || 'unknown';

  // Combine prefix, IP, and optional user ID for unique key
  return userId
    ? `${keyPrefix}:user:${userId}:${ip}`
    : `${keyPrefix}:ip:${ip}`;
}

function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const store = getStore(config.keyPrefix);
  cleanupStore(store);

  const now = Date.now();
  let entry = store.entries.get(key);

  // Check if blocked
  if (entry?.blocked && entry.blockExpiry > now) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.blockExpiry,
      retryAfter: Math.ceil((entry.blockExpiry - now) / 1000),
      blocked: true,
    };
  }

  // Clear block if expired
  if (entry?.blocked && entry.blockExpiry <= now) {
    entry.blocked = false;
    entry.count = 0;
    entry.resetTime = now + config.windowMs;
  }

  // Initialize or reset entry if window expired
  if (!entry || entry.resetTime <= now) {
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
      blocked: false,
      blockExpiry: 0,
    };
    store.entries.set(key, entry);
  }

  // Increment count
  entry.count++;

  // Check if over limit
  if (entry.count > config.maxRequests) {
    entry.blocked = true;
    entry.blockExpiry = now + config.blockDurationMs;

    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.blockExpiry,
      retryAfter: Math.ceil(config.blockDurationMs / 1000),
      blocked: true,
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetTime: entry.resetTime,
    retryAfter: null,
    blocked: false,
  };
}

// ============ MIDDLEWARE FACTORY ============

export function createRateLimiter(configType: keyof typeof RATE_LIMIT_CONFIGS) {
  const config = RATE_LIMIT_CONFIGS[configType];

  return function rateLimiterMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const key = getClientKey(req, config.keyPrefix);
    const result = checkRateLimit(key, config);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());

    if (!result.allowed) {
      res.setHeader('Retry-After', (result.retryAfter || 60).toString());

      res.status(429).json({
        error: 'Too Many Requests',
        message: result.blocked
          ? 'You have been temporarily blocked due to excessive requests'
          : 'Rate limit exceeded',
        retryAfter: result.retryAfter,
        resetTime: new Date(result.resetTime).toISOString(),
      });
      return;
    }

    next();
  };
}

// ============ PRE-CONFIGURED MIDDLEWARE ============

export const authRateLimiter = createRateLimiter('auth');
export const apiRateLimiter = createRateLimiter('api');
export const storeRateLimiter = createRateLimiter('store');
export const strictRateLimiter = createRateLimiter('strict');

// ============ SOCKET.IO RATE LIMITER ============

// Track socket event rates
const socketRateLimits: Map<string, RateLimitEntry> = new Map();

export function checkSocketRateLimit(socketId: string, userId?: string): RateLimitResult {
  const config = RATE_LIMIT_CONFIGS.socket;
  const key = userId ? `socket:user:${userId}` : `socket:${socketId}`;

  const now = Date.now();
  let entry = socketRateLimits.get(key);

  // Cleanup old entries periodically
  if (socketRateLimits.size > 10000) {
    for (const [k, e] of socketRateLimits) {
      if (e.resetTime < now && !e.blocked) {
        socketRateLimits.delete(k);
      }
    }
  }

  // Check if blocked
  if (entry?.blocked && entry.blockExpiry > now) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.blockExpiry,
      retryAfter: Math.ceil((entry.blockExpiry - now) / 1000),
      blocked: true,
    };
  }

  // Clear block if expired
  if (entry?.blocked && entry.blockExpiry <= now) {
    entry.blocked = false;
    entry.count = 0;
    entry.resetTime = now + config.windowMs;
  }

  // Initialize or reset entry
  if (!entry || entry.resetTime <= now) {
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
      blocked: false,
      blockExpiry: 0,
    };
    socketRateLimits.set(key, entry);
  }

  // Increment count
  entry.count++;

  // Check if over limit
  if (entry.count > config.maxRequests) {
    entry.blocked = true;
    entry.blockExpiry = now + config.blockDurationMs;

    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.blockExpiry,
      retryAfter: Math.ceil(config.blockDurationMs / 1000),
      blocked: true,
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetTime: entry.resetTime,
    retryAfter: null,
    blocked: false,
  };
}

// ============ RATE LIMIT STATS ============

export interface RateLimitStats {
  totalEntries: number;
  blockedEntries: number;
  storeStats: Record<string, { entries: number; blocked: number }>;
}

export function getRateLimitStats(): RateLimitStats {
  const storeStats: Record<string, { entries: number; blocked: number }> = {};
  let totalEntries = 0;
  let blockedEntries = 0;

  for (const [prefix, store] of stores) {
    let blocked = 0;
    for (const entry of store.entries.values()) {
      if (entry.blocked && entry.blockExpiry > Date.now()) {
        blocked++;
      }
    }
    storeStats[prefix] = {
      entries: store.entries.size,
      blocked,
    };
    totalEntries += store.entries.size;
    blockedEntries += blocked;
  }

  // Add socket stats
  let socketBlocked = 0;
  for (const entry of socketRateLimits.values()) {
    if (entry.blocked && entry.blockExpiry > Date.now()) {
      socketBlocked++;
    }
  }
  storeStats['socket'] = {
    entries: socketRateLimits.size,
    blocked: socketBlocked,
  };
  totalEntries += socketRateLimits.size;
  blockedEntries += socketBlocked;

  return {
    totalEntries,
    blockedEntries,
    storeStats,
  };
}

// ============ ADMIN FUNCTIONS ============

export function clearRateLimitForKey(keyPattern: string): number {
  let cleared = 0;

  for (const store of stores.values()) {
    for (const key of store.entries.keys()) {
      if (key.includes(keyPattern)) {
        store.entries.delete(key);
        cleared++;
      }
    }
  }

  for (const key of socketRateLimits.keys()) {
    if (key.includes(keyPattern)) {
      socketRateLimits.delete(key);
      cleared++;
    }
  }

  return cleared;
}

export function clearAllRateLimits(): void {
  for (const store of stores.values()) {
    store.entries.clear();
  }
  socketRateLimits.clear();
}
