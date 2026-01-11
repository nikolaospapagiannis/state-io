import { Router, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from './auth';
import { db } from './database';
import { awardCurrency, getPlayerCurrencies } from './currency';

const router = Router();

// Types
export type SubscriptionTier = 'plus' | 'pro' | 'elite';
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'pending';

export interface Subscription {
  id: string;
  user_id: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  price_cents: number;
  started_at: number;
  expires_at: number;
  auto_renew: number;
  cancelled_at: number | null;
  created_at: number;
}

export interface SubscriptionTierConfig {
  id: SubscriptionTier;
  name: string;
  priceCents: number;
  monthlyGems: number;
  monthlyCrystals: number;
  benefits: string[];
  xpMultiplier: number;
  coinMultiplier: number;
  adFree: boolean;
  exclusiveContent: boolean;
  priorityMatchmaking: boolean;
  customProfile: boolean;
}

// Subscription tier configurations
export const SUBSCRIPTION_TIERS: Record<SubscriptionTier, SubscriptionTierConfig> = {
  plus: {
    id: 'plus',
    name: 'Plus',
    priceCents: 499,
    monthlyGems: 100,
    monthlyCrystals: 50,
    benefits: [
      'Ad-free experience',
      '100 gems per month',
      '50 crystals per month',
      '10% XP bonus',
      'Exclusive "Plus" badge',
    ],
    xpMultiplier: 1.1,
    coinMultiplier: 1.0,
    adFree: true,
    exclusiveContent: false,
    priorityMatchmaking: false,
    customProfile: false,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceCents: 999,
    monthlyGems: 300,
    monthlyCrystals: 150,
    benefits: [
      'All Plus benefits',
      '300 gems per month',
      '150 crystals per month',
      '25% XP bonus',
      '10% coin bonus',
      'Priority matchmaking',
      'Exclusive "Pro" badge',
      'Monthly exclusive skin',
    ],
    xpMultiplier: 1.25,
    coinMultiplier: 1.1,
    adFree: true,
    exclusiveContent: true,
    priorityMatchmaking: true,
    customProfile: false,
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    priceCents: 1999,
    monthlyGems: 750,
    monthlyCrystals: 400,
    benefits: [
      'All Pro benefits',
      '750 gems per month',
      '400 crystals per month',
      '50% XP bonus',
      '25% coin bonus',
      'Custom profile effects',
      'Exclusive "Elite" badge',
      'Early access to new content',
      'Direct developer feedback channel',
    ],
    xpMultiplier: 1.5,
    coinMultiplier: 1.25,
    adFree: true,
    exclusiveContent: true,
    priorityMatchmaking: true,
    customProfile: true,
  },
};

// Prepared statements
const subscriptionQueries = {
  getActive: db.prepare(`
    SELECT * FROM subscriptions
    WHERE user_id = ? AND status = 'active' AND expires_at > strftime('%s', 'now')
    ORDER BY expires_at DESC
    LIMIT 1
  `),

  getById: db.prepare(`SELECT * FROM subscriptions WHERE id = ?`),

  create: db.prepare(`
    INSERT INTO subscriptions (id, user_id, tier, status, price_cents, started_at, expires_at, auto_renew)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  update: db.prepare(`
    UPDATE subscriptions
    SET status = ?, expires_at = ?, auto_renew = ?, cancelled_at = ?
    WHERE id = ?
  `),

  getExpiring: db.prepare(`
    SELECT * FROM subscriptions
    WHERE status = 'active' AND auto_renew = 1 AND expires_at <= ?
  `),

  getUserHistory: db.prepare(`
    SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `),

  expireOldSubscriptions: db.prepare(`
    UPDATE subscriptions
    SET status = 'expired'
    WHERE status = 'active' AND expires_at <= strftime('%s', 'now')
  `),
};

// Helper functions
export function getActiveSubscription(userId: string): Subscription | null {
  // First, expire any old subscriptions
  subscriptionQueries.expireOldSubscriptions.run();

  return subscriptionQueries.getActive.get(userId) as Subscription | null;
}

export function hasActiveSubscription(userId: string): boolean {
  return getActiveSubscription(userId) !== null;
}

export function getSubscriptionTier(userId: string): SubscriptionTier | null {
  const subscription = getActiveSubscription(userId);
  return subscription ? subscription.tier as SubscriptionTier : null;
}

export function getSubscriptionBenefits(userId: string): SubscriptionTierConfig | null {
  const tier = getSubscriptionTier(userId);
  return tier ? SUBSCRIPTION_TIERS[tier] : null;
}

export function getXPMultiplier(userId: string): number {
  const benefits = getSubscriptionBenefits(userId);
  return benefits ? benefits.xpMultiplier : 1.0;
}

export function getCoinMultiplier(userId: string): number {
  const benefits = getSubscriptionBenefits(userId);
  return benefits ? benefits.coinMultiplier : 1.0;
}

export function isAdFree(userId: string): boolean {
  const benefits = getSubscriptionBenefits(userId);
  return benefits ? benefits.adFree : false;
}

export function hasPriorityMatchmaking(userId: string): boolean {
  const benefits = getSubscriptionBenefits(userId);
  return benefits ? benefits.priorityMatchmaking : false;
}

function grantMonthlyRewards(userId: string, tier: SubscriptionTier): void {
  const config = SUBSCRIPTION_TIERS[tier];

  if (config.monthlyGems > 0) {
    awardCurrency(userId, 'gems', config.monthlyGems, `${config.name} subscription monthly gems`);
  }

  if (config.monthlyCrystals > 0) {
    awardCurrency(userId, 'crystals', config.monthlyCrystals, `${config.name} subscription monthly crystals`);
  }
}

function processAutoRenewal(subscription: Subscription): { success: boolean; error?: string } {
  const tier = subscription.tier as SubscriptionTier;
  const config = SUBSCRIPTION_TIERS[tier];

  // In a real implementation, this would charge the payment method
  // For now, we simulate with gems
  const currencies = getPlayerCurrencies(subscription.user_id);

  if (currencies.gems < config.priceCents) {
    // Can't afford renewal
    subscriptionQueries.update.run(
      'expired',
      subscription.expires_at,
      0,
      Math.floor(Date.now() / 1000),
      subscription.id
    );
    return { success: false, error: 'Insufficient funds for renewal' };
  }

  // Extend subscription
  const newExpiresAt = subscription.expires_at + (30 * 24 * 60 * 60);

  subscriptionQueries.update.run(
    'active',
    newExpiresAt,
    subscription.auto_renew,
    null,
    subscription.id
  );

  // Grant monthly rewards
  grantMonthlyRewards(subscription.user_id, tier);

  return { success: true };
}

// Auto-renewal check (should be called periodically in production)
export function processAutoRenewals(): void {
  const now = Math.floor(Date.now() / 1000);
  const expiring = subscriptionQueries.getExpiring.all(now) as Subscription[];

  for (const subscription of expiring) {
    processAutoRenewal(subscription);
  }
}

// Middleware to check subscription status
export function requireSubscription(minTier?: SubscriptionTier) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const subscription = getActiveSubscription(req.user.id);

    if (!subscription) {
      res.status(403).json({ error: 'Active subscription required' });
      return;
    }

    if (minTier) {
      const tierOrder: SubscriptionTier[] = ['plus', 'pro', 'elite'];
      const userTierIndex = tierOrder.indexOf(subscription.tier as SubscriptionTier);
      const requiredTierIndex = tierOrder.indexOf(minTier);

      if (userTierIndex < requiredTierIndex) {
        res.status(403).json({
          error: `${SUBSCRIPTION_TIERS[minTier].name} subscription or higher required`
        });
        return;
      }
    }

    next();
  };
}

// API Routes

// GET /api/subscription - Get current subscription status
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const subscription = getActiveSubscription(req.user.id);

    if (!subscription) {
      res.json({
        active: false,
        tiers: Object.values(SUBSCRIPTION_TIERS).map(t => ({
          id: t.id,
          name: t.name,
          priceCents: t.priceCents,
          priceDisplay: `$${(t.priceCents / 100).toFixed(2)}/month`,
          benefits: t.benefits,
        })),
      });
      return;
    }

    const config = SUBSCRIPTION_TIERS[subscription.tier as SubscriptionTier];
    const now = Math.floor(Date.now() / 1000);

    res.json({
      active: true,
      subscription: {
        id: subscription.id,
        tier: subscription.tier,
        tierName: config.name,
        status: subscription.status,
        startedAt: subscription.started_at,
        expiresAt: subscription.expires_at,
        daysRemaining: Math.max(0, Math.ceil((subscription.expires_at - now) / (24 * 60 * 60))),
        autoRenew: subscription.auto_renew === 1,
        cancelledAt: subscription.cancelled_at,
      },
      benefits: {
        xpMultiplier: config.xpMultiplier,
        coinMultiplier: config.coinMultiplier,
        adFree: config.adFree,
        exclusiveContent: config.exclusiveContent,
        priorityMatchmaking: config.priorityMatchmaking,
        customProfile: config.customProfile,
        monthlyGems: config.monthlyGems,
        monthlyCrystals: config.monthlyCrystals,
      },
      allTiers: Object.values(SUBSCRIPTION_TIERS).map(t => ({
        id: t.id,
        name: t.name,
        priceCents: t.priceCents,
        priceDisplay: `$${(t.priceCents / 100).toFixed(2)}/month`,
        benefits: t.benefits,
        current: t.id === subscription.tier,
      })),
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

// GET /api/subscription/history - Get subscription history
router.get('/history', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const history = subscriptionQueries.getUserHistory.all(req.user.id, limit) as Subscription[];

    res.json({
      history: history.map(s => ({
        id: s.id,
        tier: s.tier,
        tierName: SUBSCRIPTION_TIERS[s.tier as SubscriptionTier]?.name || s.tier,
        status: s.status,
        priceCents: s.price_cents,
        startedAt: s.started_at,
        expiresAt: s.expires_at,
        autoRenew: s.auto_renew === 1,
        cancelledAt: s.cancelled_at,
        createdAt: s.created_at,
      })),
    });
  } catch (error) {
    console.error('Get subscription history error:', error);
    res.status(500).json({ error: 'Failed to get subscription history' });
  }
});

// POST /api/subscription/purchase - Purchase a subscription
router.post('/purchase', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { tier } = req.body;

    if (!tier || !['plus', 'pro', 'elite'].includes(tier)) {
      res.status(400).json({ error: 'Invalid tier. Must be "plus", "pro", or "elite"' });
      return;
    }

    const existingSubscription = getActiveSubscription(req.user.id);
    if (existingSubscription) {
      // Handle upgrade/downgrade
      const currentTierOrder = ['plus', 'pro', 'elite'].indexOf(existingSubscription.tier);
      const newTierOrder = ['plus', 'pro', 'elite'].indexOf(tier);

      if (newTierOrder <= currentTierOrder) {
        res.status(400).json({
          error: 'You already have this tier or a higher tier. Cancel current subscription first to downgrade.'
        });
        return;
      }

      // Upgrade - cancel current and start new
      subscriptionQueries.update.run(
        'cancelled',
        existingSubscription.expires_at,
        0,
        Math.floor(Date.now() / 1000),
        existingSubscription.id
      );
    }

    const config = SUBSCRIPTION_TIERS[tier as SubscriptionTier];

    // In a real implementation, this would process actual payment
    // For simulation, we use gems (1 gem = 1 cent)
    const currencies = getPlayerCurrencies(req.user.id);
    if (currencies.gems < config.priceCents) {
      res.status(400).json({
        error: `Insufficient gems. Need ${config.priceCents}, have ${currencies.gems}`
      });
      return;
    }

    // Deduct gems (simulated payment)
    // Note: In production, use actual payment processing
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + (30 * 24 * 60 * 60); // 30 days

    const subscriptionId = uuidv4();
    subscriptionQueries.create.run(
      subscriptionId,
      req.user.id,
      tier,
      'active',
      config.priceCents,
      now,
      expiresAt,
      1 // auto-renew enabled by default
    );

    // Grant initial monthly rewards
    grantMonthlyRewards(req.user.id, tier as SubscriptionTier);

    res.json({
      success: true,
      subscription: {
        id: subscriptionId,
        tier,
        tierName: config.name,
        status: 'active',
        startedAt: now,
        expiresAt,
        autoRenew: true,
      },
      message: `Successfully subscribed to ${config.name}!`,
    });
  } catch (error) {
    console.error('Purchase subscription error:', error);
    res.status(500).json({ error: 'Failed to purchase subscription' });
  }
});

// POST /api/subscription/cancel - Cancel subscription
router.post('/cancel', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const subscription = getActiveSubscription(req.user.id);

    if (!subscription) {
      res.status(404).json({ error: 'No active subscription found' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);

    // Cancel by disabling auto-renew - subscription remains active until expiry
    subscriptionQueries.update.run(
      'cancelled',
      subscription.expires_at,
      0,
      now,
      subscription.id
    );

    res.json({
      success: true,
      message: 'Subscription cancelled. You will retain benefits until the end of your billing period.',
      expiresAt: subscription.expires_at,
      daysRemaining: Math.max(0, Math.ceil((subscription.expires_at - now) / (24 * 60 * 60))),
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// POST /api/subscription/toggle-auto-renew - Toggle auto-renewal
router.post('/toggle-auto-renew', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const subscription = getActiveSubscription(req.user.id);

    if (!subscription) {
      res.status(404).json({ error: 'No active subscription found' });
      return;
    }

    if (subscription.status === 'cancelled') {
      res.status(400).json({ error: 'Cannot modify cancelled subscription' });
      return;
    }

    const newAutoRenew = subscription.auto_renew === 1 ? 0 : 1;

    subscriptionQueries.update.run(
      subscription.status,
      subscription.expires_at,
      newAutoRenew,
      subscription.cancelled_at,
      subscription.id
    );

    res.json({
      success: true,
      autoRenew: newAutoRenew === 1,
      message: newAutoRenew === 1 ?
        'Auto-renewal enabled. Your subscription will renew automatically.' :
        'Auto-renewal disabled. Your subscription will expire at the end of the billing period.',
    });
  } catch (error) {
    console.error('Toggle auto-renew error:', error);
    res.status(500).json({ error: 'Failed to toggle auto-renewal' });
  }
});

// GET /api/subscription/benefits - Get benefits for authenticated user
router.get('/benefits', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const benefits = getSubscriptionBenefits(req.user.id);

    if (!benefits) {
      res.json({
        subscribed: false,
        xpMultiplier: 1.0,
        coinMultiplier: 1.0,
        adFree: false,
        exclusiveContent: false,
        priorityMatchmaking: false,
        customProfile: false,
      });
      return;
    }

    res.json({
      subscribed: true,
      tier: benefits.id,
      tierName: benefits.name,
      xpMultiplier: benefits.xpMultiplier,
      coinMultiplier: benefits.coinMultiplier,
      adFree: benefits.adFree,
      exclusiveContent: benefits.exclusiveContent,
      priorityMatchmaking: benefits.priorityMatchmaking,
      customProfile: benefits.customProfile,
    });
  } catch (error) {
    console.error('Get benefits error:', error);
    res.status(500).json({ error: 'Failed to get subscription benefits' });
  }
});

export { router as subscriptionRouter };
