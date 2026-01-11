import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from './auth';
import { db } from './database';
import { awardCurrency, getPlayerCurrencies, CurrencyType } from './currency';

const router = Router();

// Types
export type OfferType = 'gem_bundle' | 'starter_pack' | 'limited_time' | 'daily_deal' | 'special';

export interface StoreOffer {
  id: string;
  offer_type: OfferType;
  name: string;
  description: string | null;
  original_price_cents: number | null;
  price_cents: number;
  gems: number;
  coins: number;
  crystals: number;
  bonus_gems: number;
  items: string;
  is_one_time: number;
  is_active: number;
  start_date: number | null;
  end_date: number | null;
  priority: number;
  image_key: string | null;
  created_at: number;
}

export interface Purchase {
  id: string;
  user_id: string;
  product_type: string;
  product_id: string;
  price_cents: number;
  currency: string;
  status: string;
  receipt_data: string | null;
  created_at: number;
}

export interface DailyDeal {
  id: string;
  user_id: string;
  offer_id: string;
  deal_date: string;
  purchased: number;
  created_at: number;
}

// Prepared statements
const storeQueries = {
  getActiveOffers: db.prepare(`
    SELECT * FROM store_offers
    WHERE is_active = 1
    AND (start_date IS NULL OR start_date <= strftime('%s', 'now'))
    AND (end_date IS NULL OR end_date > strftime('%s', 'now'))
    ORDER BY priority DESC, created_at DESC
  `),

  getOffersByType: db.prepare(`
    SELECT * FROM store_offers
    WHERE is_active = 1 AND offer_type = ?
    AND (start_date IS NULL OR start_date <= strftime('%s', 'now'))
    AND (end_date IS NULL OR end_date > strftime('%s', 'now'))
    ORDER BY priority DESC
  `),

  getOfferById: db.prepare(`SELECT * FROM store_offers WHERE id = ?`),

  createOffer: db.prepare(`
    INSERT INTO store_offers (id, offer_type, name, description, original_price_cents, price_cents, gems, coins, crystals, bonus_gems, items, is_one_time, is_active, start_date, end_date, priority, image_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  hasUserPurchased: db.prepare(`
    SELECT * FROM user_purchased_offers WHERE user_id = ? AND offer_id = ?
  `),

  recordUserPurchase: db.prepare(`
    INSERT INTO user_purchased_offers (user_id, offer_id) VALUES (?, ?)
  `),

  getUserPurchasedOffers: db.prepare(`
    SELECT offer_id FROM user_purchased_offers WHERE user_id = ?
  `),

  countOffers: db.prepare(`SELECT COUNT(*) as count FROM store_offers`),
};

const purchaseQueries = {
  create: db.prepare(`
    INSERT INTO purchases (id, user_id, product_type, product_id, price_cents, currency, status, receipt_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getById: db.prepare(`SELECT * FROM purchases WHERE id = ?`),

  getUserPurchases: db.prepare(`
    SELECT * FROM purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `),
};

const dailyDealsQueries = {
  getUserDeals: db.prepare(`
    SELECT dd.*, so.name, so.description, so.price_cents, so.gems, so.coins, so.crystals, so.bonus_gems, so.items, so.image_key
    FROM daily_deals dd
    JOIN store_offers so ON dd.offer_id = so.id
    WHERE dd.user_id = ? AND dd.deal_date = ?
  `),

  createDeal: db.prepare(`
    INSERT INTO daily_deals (id, user_id, offer_id, deal_date)
    VALUES (?, ?, ?, ?)
  `),

  markPurchased: db.prepare(`
    UPDATE daily_deals SET purchased = 1 WHERE id = ?
  `),

  getDealById: db.prepare(`SELECT * FROM daily_deals WHERE id = ?`),
};

// Default offers configuration
const DEFAULT_GEM_BUNDLES = [
  { id: 'gems_small', name: 'Small Gem Pack', gems: 100, bonus: 0, price: 99 },
  { id: 'gems_medium', name: 'Medium Gem Pack', gems: 500, bonus: 50, price: 499 },
  { id: 'gems_large', name: 'Large Gem Pack', gems: 1200, bonus: 200, price: 999 },
  { id: 'gems_huge', name: 'Huge Gem Pack', gems: 2500, bonus: 500, price: 1999 },
  { id: 'gems_mega', name: 'Mega Gem Pack', gems: 6500, bonus: 1500, price: 4999 },
  { id: 'gems_ultra', name: 'Ultra Gem Pack', gems: 14000, bonus: 4000, price: 9999 },
];

const DEFAULT_STARTER_PACKS = [
  {
    id: 'starter_beginner',
    name: 'Beginner Starter Pack',
    description: 'Perfect for new players! Includes gems, coins, and an exclusive skin.',
    gems: 500,
    coins: 5000,
    items: ['skin_starter'],
    price: 499,
  },
  {
    id: 'starter_advanced',
    name: 'Advanced Starter Pack',
    description: 'Level up faster with more gems, coins, and premium skins.',
    gems: 1500,
    coins: 15000,
    items: ['skin_starter', 'skin_premium_1'],
    price: 1499,
  },
  {
    id: 'starter_elite',
    name: 'Elite Starter Pack',
    description: 'The ultimate starter bundle with massive gems, coins, and exclusive content.',
    gems: 5000,
    coins: 50000,
    crystals: 200,
    items: ['skin_starter', 'skin_premium_1', 'skin_elite_1', 'title_elite'],
    price: 4999,
  },
];

// Helper functions
function initializeDefaultOffers(): void {
  const count = storeQueries.countOffers.get() as { count: number };

  if (count.count === 0) {
    // Add gem bundles
    for (const bundle of DEFAULT_GEM_BUNDLES) {
      storeQueries.createOffer.run(
        bundle.id,
        'gem_bundle',
        bundle.name,
        `Get ${bundle.gems} gems${bundle.bonus > 0 ? ` + ${bundle.bonus} bonus gems!` : ''}`,
        null,
        bundle.price,
        bundle.gems,
        0,
        0,
        bundle.bonus,
        '[]',
        0,
        1,
        null,
        null,
        bundle.price, // higher price = higher priority
        `gems_${bundle.gems}`
      );
    }

    // Add starter packs (one-time purchase)
    for (const pack of DEFAULT_STARTER_PACKS) {
      storeQueries.createOffer.run(
        pack.id,
        'starter_pack',
        pack.name,
        pack.description,
        null,
        pack.price,
        pack.gems,
        pack.coins,
        (pack as { crystals?: number }).crystals || 0,
        0,
        JSON.stringify(pack.items),
        1, // one-time purchase
        1,
        null,
        null,
        1000 + pack.price, // starter packs have higher priority
        pack.id
      );
    }

    // Add a limited-time offer (example)
    const now = Math.floor(Date.now() / 1000);
    const sevenDays = 7 * 24 * 60 * 60;

    storeQueries.createOffer.run(
      'limited_weekly_special',
      'limited_time',
      'Weekly Special Bundle',
      '50% OFF! Limited time only!',
      1999, // original price
      999,  // discounted price
      2000,
      20000,
      100,
      500,
      JSON.stringify(['skin_special_weekly']),
      0,
      1,
      now,
      now + sevenDays,
      5000, // high priority
      'limited_weekly'
    );

    console.log('Default store offers initialized');
  }
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function generateDailyDeals(userId: string): void {
  const today = getTodayDate();

  // Check if user already has deals for today
  const existingDeals = dailyDealsQueries.getUserDeals.all(userId, today);
  if (existingDeals.length > 0) {
    return;
  }

  // Get all gem bundles for daily deals
  const gemBundles = storeQueries.getOffersByType.all('gem_bundle') as StoreOffer[];

  // Select 3 random bundles with discounted prices
  const shuffled = [...gemBundles].sort(() => Math.random() - 0.5);
  const selectedDeals = shuffled.slice(0, Math.min(3, shuffled.length));

  for (const offer of selectedDeals) {
    const dealId = uuidv4();
    dailyDealsQueries.createDeal.run(dealId, userId, offer.id, today);
  }
}

function hasUserPurchasedOffer(userId: string, offerId: string): boolean {
  const result = storeQueries.hasUserPurchased.get(userId, offerId);
  return !!result;
}

function grantOfferRewards(userId: string, offer: StoreOffer): void {
  // Grant gems (including bonus)
  const totalGems = offer.gems + offer.bonus_gems;
  if (totalGems > 0) {
    awardCurrency(userId, 'gems', totalGems, `Store purchase: ${offer.name}`, offer.id);
  }

  // Grant coins
  if (offer.coins > 0) {
    awardCurrency(userId, 'coins', offer.coins, `Store purchase: ${offer.name}`, offer.id);
  }

  // Grant crystals
  if (offer.crystals > 0) {
    awardCurrency(userId, 'crystals', offer.crystals, `Store purchase: ${offer.name}`, offer.id);
  }

  // Grant items (in a real implementation, add to user's inventory)
  const items = JSON.parse(offer.items) as string[];
  if (items.length > 0) {
    console.log(`Granting items to user ${userId}:`, items);
    // TODO: Add items to user's inventory
  }
}

// Initialize default offers
initializeDefaultOffers();

// API Routes

// GET /api/store/offers - Get all active offers
router.get('/offers', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const offers = storeQueries.getActiveOffers.all() as StoreOffer[];
    const purchasedOffers = storeQueries.getUserPurchasedOffers.all(req.user.id) as { offer_id: string }[];
    const purchasedIds = new Set(purchasedOffers.map(p => p.offer_id));

    const now = Math.floor(Date.now() / 1000);

    const formattedOffers = offers.map(o => ({
      id: o.id,
      type: o.offer_type,
      name: o.name,
      description: o.description,
      originalPrice: o.original_price_cents,
      price: o.price_cents,
      priceDisplay: `$${(o.price_cents / 100).toFixed(2)}`,
      discountPercent: o.original_price_cents ?
        Math.round((1 - o.price_cents / o.original_price_cents) * 100) : 0,
      gems: o.gems,
      coins: o.coins,
      crystals: o.crystals,
      bonusGems: o.bonus_gems,
      items: JSON.parse(o.items),
      isOneTime: o.is_one_time === 1,
      isPurchased: purchasedIds.has(o.id),
      canPurchase: o.is_one_time !== 1 || !purchasedIds.has(o.id),
      expiresAt: o.end_date,
      timeRemaining: o.end_date ? Math.max(0, o.end_date - now) : null,
      imageKey: o.image_key,
    }));

    // Group by type
    const grouped = {
      gemBundles: formattedOffers.filter(o => o.type === 'gem_bundle'),
      starterPacks: formattedOffers.filter(o => o.type === 'starter_pack'),
      limitedTime: formattedOffers.filter(o => o.type === 'limited_time'),
      special: formattedOffers.filter(o => o.type === 'special'),
    };

    res.json({ offers: formattedOffers, grouped });
  } catch (error) {
    console.error('Get offers error:', error);
    res.status(500).json({ error: 'Failed to get store offers' });
  }
});

// GET /api/store/daily-deals - Get daily deals for user
router.get('/daily-deals', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Generate deals if needed
    generateDailyDeals(req.user.id);

    const today = getTodayDate();
    const deals = dailyDealsQueries.getUserDeals.all(req.user.id, today) as (DailyDeal & StoreOffer)[];

    // Calculate time until reset (midnight UTC)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    const timeUntilReset = Math.floor((tomorrow.getTime() - now.getTime()) / 1000);

    res.json({
      deals: deals.map(d => ({
        dealId: d.id,
        offerId: d.offer_id,
        name: d.name,
        description: d.description,
        price: d.price_cents,
        priceDisplay: `$${(d.price_cents / 100).toFixed(2)}`,
        discountedPrice: Math.floor(d.price_cents * 0.7), // 30% discount on daily deals
        discountedPriceDisplay: `$${(Math.floor(d.price_cents * 0.7) / 100).toFixed(2)}`,
        discountPercent: 30,
        gems: d.gems,
        coins: d.coins,
        crystals: d.crystals,
        bonusGems: d.bonus_gems,
        items: JSON.parse(d.items),
        isPurchased: d.purchased === 1,
        imageKey: d.image_key,
      })),
      timeUntilReset,
      resetTime: tomorrow.toISOString(),
    });
  } catch (error) {
    console.error('Get daily deals error:', error);
    res.status(500).json({ error: 'Failed to get daily deals' });
  }
});

// POST /api/store/purchase - Purchase an offer
router.post('/purchase', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { offerId, paymentMethod } = req.body;

    if (!offerId) {
      res.status(400).json({ error: 'Offer ID required' });
      return;
    }

    const offer = storeQueries.getOfferById.get(offerId) as StoreOffer | undefined;

    if (!offer) {
      res.status(404).json({ error: 'Offer not found' });
      return;
    }

    if (offer.is_active !== 1) {
      res.status(400).json({ error: 'Offer is not active' });
      return;
    }

    // Check time-limited offers
    const now = Math.floor(Date.now() / 1000);
    if (offer.start_date && offer.start_date > now) {
      res.status(400).json({ error: 'Offer has not started yet' });
      return;
    }
    if (offer.end_date && offer.end_date <= now) {
      res.status(400).json({ error: 'Offer has expired' });
      return;
    }

    // Check one-time purchase
    if (offer.is_one_time === 1 && hasUserPurchasedOffer(req.user.id, offerId)) {
      res.status(400).json({ error: 'You have already purchased this one-time offer' });
      return;
    }

    // In a real implementation, process payment here
    // For simulation, we'll just record the purchase

    const purchaseId = uuidv4();

    // Record the purchase
    purchaseQueries.create.run(
      purchaseId,
      req.user.id,
      'store_offer',
      offerId,
      offer.price_cents,
      'USD',
      'completed',
      JSON.stringify({ paymentMethod: paymentMethod || 'simulated', timestamp: now })
    );

    // Record one-time purchase
    if (offer.is_one_time === 1) {
      storeQueries.recordUserPurchase.run(req.user.id, offerId);
    }

    // Grant rewards
    grantOfferRewards(req.user.id, offer);

    // Get updated currencies
    const currencies = getPlayerCurrencies(req.user.id);

    res.json({
      success: true,
      purchaseId,
      offer: {
        id: offer.id,
        name: offer.name,
        gems: offer.gems + offer.bonus_gems,
        coins: offer.coins,
        crystals: offer.crystals,
        items: JSON.parse(offer.items),
      },
      currencies: {
        gems: currencies.gems,
        coins: currencies.coins,
        crystals: currencies.crystals,
      },
      message: `Successfully purchased ${offer.name}!`,
    });
  } catch (error) {
    console.error('Purchase error:', error);
    res.status(500).json({ error: 'Failed to process purchase' });
  }
});

// POST /api/store/purchase-daily-deal - Purchase a daily deal
router.post('/purchase-daily-deal', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { dealId } = req.body;

    if (!dealId) {
      res.status(400).json({ error: 'Deal ID required' });
      return;
    }

    const deal = dailyDealsQueries.getDealById.get(dealId) as DailyDeal | undefined;

    if (!deal) {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }

    if (deal.user_id !== req.user.id) {
      res.status(403).json({ error: 'This deal belongs to another user' });
      return;
    }

    if (deal.deal_date !== getTodayDate()) {
      res.status(400).json({ error: 'This deal has expired' });
      return;
    }

    if (deal.purchased === 1) {
      res.status(400).json({ error: 'Deal already purchased' });
      return;
    }

    const offer = storeQueries.getOfferById.get(deal.offer_id) as StoreOffer | undefined;

    if (!offer) {
      res.status(404).json({ error: 'Offer not found' });
      return;
    }

    // Calculate discounted price (30% off)
    const discountedPrice = Math.floor(offer.price_cents * 0.7);

    // Record the purchase
    const purchaseId = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    purchaseQueries.create.run(
      purchaseId,
      req.user.id,
      'daily_deal',
      deal.offer_id,
      discountedPrice,
      'USD',
      'completed',
      JSON.stringify({ dealId, originalPrice: offer.price_cents, timestamp: now })
    );

    // Mark deal as purchased
    dailyDealsQueries.markPurchased.run(dealId);

    // Grant rewards
    grantOfferRewards(req.user.id, offer);

    // Get updated currencies
    const currencies = getPlayerCurrencies(req.user.id);

    res.json({
      success: true,
      purchaseId,
      pricePaid: discountedPrice,
      savings: offer.price_cents - discountedPrice,
      offer: {
        id: offer.id,
        name: offer.name,
        gems: offer.gems + offer.bonus_gems,
        coins: offer.coins,
        crystals: offer.crystals,
        items: JSON.parse(offer.items),
      },
      currencies: {
        gems: currencies.gems,
        coins: currencies.coins,
        crystals: currencies.crystals,
      },
      message: `Successfully purchased ${offer.name} at 30% off!`,
    });
  } catch (error) {
    console.error('Purchase daily deal error:', error);
    res.status(500).json({ error: 'Failed to purchase daily deal' });
  }
});

// GET /api/store/purchases - Get user's purchase history
router.get('/purchases', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const purchases = purchaseQueries.getUserPurchases.all(req.user.id, limit) as Purchase[];

    res.json({
      purchases: purchases.map(p => ({
        id: p.id,
        productType: p.product_type,
        productId: p.product_id,
        price: p.price_cents,
        priceDisplay: `$${(p.price_cents / 100).toFixed(2)}`,
        currency: p.currency,
        status: p.status,
        createdAt: p.created_at,
      })),
    });
  } catch (error) {
    console.error('Get purchases error:', error);
    res.status(500).json({ error: 'Failed to get purchase history' });
  }
});

// GET /api/store/first-purchase-bonus - Check if user is eligible for first purchase bonus
router.get('/first-purchase-bonus', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const purchases = purchaseQueries.getUserPurchases.all(req.user.id, 1) as Purchase[];
    const isFirstPurchase = purchases.length === 0;

    res.json({
      eligible: isFirstPurchase,
      bonusMultiplier: isFirstPurchase ? 2.0 : 1.0,
      message: isFirstPurchase ?
        'First purchase bonus! Get DOUBLE gems on your first purchase!' :
        null,
    });
  } catch (error) {
    console.error('Check first purchase bonus error:', error);
    res.status(500).json({ error: 'Failed to check first purchase bonus' });
  }
});

export { router as storeRouter };
