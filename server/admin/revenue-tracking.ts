import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import { AdminRequest, requireAdmin, requirePermission, PERMISSIONS } from './auth';

const router = Router();

// Apply admin auth to all routes
router.use(requireAdmin);

// ============ TYPES ============

interface PurchaseWithAttribution {
  id: string;
  userId: string;
  username: string;
  productType: string;
  productId: string;
  priceCents: number;
  currency: string;
  status: string;
  attribution: PurchaseAttribution | null;
  createdAt: number;
}

interface PurchaseAttribution {
  source: string;
  medium: string;
  campaign: string | null;
  triggerEvent: string | null;
  sessionId: string | null;
}

interface RefundRecord {
  id: string;
  purchaseId: string;
  userId: string;
  amount: number;
  reason: string;
  status: string;
  processedBy: string | null;
  createdAt: number;
  processedAt: number | null;
}

interface SubscriptionChurn {
  tier: string;
  totalSubscribers: number;
  activeSubscribers: number;
  churned: number;
  churnRate: number;
  avgSubscriptionLength: number;
}

// ============ DATABASE INITIALIZATION ============

// Create additional tables for revenue tracking
db.exec(`
  CREATE TABLE IF NOT EXISTS purchase_attribution (
    purchase_id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    medium TEXT NOT NULL,
    campaign TEXT,
    trigger_event TEXT,
    session_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (purchase_id) REFERENCES purchases(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS refunds (
    id TEXT PRIMARY KEY,
    purchase_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    processed_by TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    processed_at INTEGER,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (processed_by) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS subscription_events (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    previous_tier TEXT,
    new_tier TEXT,
    reason TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// Indexes
db.exec(`CREATE INDEX IF NOT EXISTS idx_purchase_attribution_source ON purchase_attribution(source)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_subscription_events_type ON subscription_events(event_type)`);

// ============ PREPARED STATEMENTS ============

const revenueQueries = {
  // Get purchases with attribution
  getPurchasesWithAttribution: db.prepare(`
    SELECT
      p.id, p.user_id, p.product_type, p.product_id, p.price_cents,
      p.currency, p.status, p.created_at,
      u.username,
      pa.source, pa.medium, pa.campaign, pa.trigger_event, pa.session_id
    FROM purchases p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN purchase_attribution pa ON p.id = pa.purchase_id
    WHERE p.created_at >= ?
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `),

  // Add attribution
  addAttribution: db.prepare(`
    INSERT INTO purchase_attribution (purchase_id, source, medium, campaign, trigger_event, session_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  // Get revenue by source
  getRevenueBySource: db.prepare(`
    SELECT
      COALESCE(pa.source, 'organic') as source,
      SUM(p.price_cents) / 100.0 as revenue,
      COUNT(*) as transactions
    FROM purchases p
    LEFT JOIN purchase_attribution pa ON p.id = pa.purchase_id
    WHERE p.status = 'completed' AND p.created_at >= ?
    GROUP BY COALESCE(pa.source, 'organic')
    ORDER BY revenue DESC
  `),

  // Get revenue by medium
  getRevenueByMedium: db.prepare(`
    SELECT
      COALESCE(pa.medium, 'direct') as medium,
      SUM(p.price_cents) / 100.0 as revenue,
      COUNT(*) as transactions
    FROM purchases p
    LEFT JOIN purchase_attribution pa ON p.id = pa.purchase_id
    WHERE p.status = 'completed' AND p.created_at >= ?
    GROUP BY COALESCE(pa.medium, 'direct')
    ORDER BY revenue DESC
  `),

  // Get revenue by campaign
  getRevenueByCampaign: db.prepare(`
    SELECT
      COALESCE(pa.campaign, 'none') as campaign,
      SUM(p.price_cents) / 100.0 as revenue,
      COUNT(*) as transactions
    FROM purchases p
    LEFT JOIN purchase_attribution pa ON p.id = pa.purchase_id
    WHERE p.status = 'completed' AND p.created_at >= ? AND pa.campaign IS NOT NULL
    GROUP BY pa.campaign
    ORDER BY revenue DESC
    LIMIT ?
  `),

  // Get revenue by trigger event
  getRevenueByTrigger: db.prepare(`
    SELECT
      COALESCE(pa.trigger_event, 'unknown') as trigger_event,
      SUM(p.price_cents) / 100.0 as revenue,
      COUNT(*) as transactions
    FROM purchases p
    LEFT JOIN purchase_attribution pa ON p.id = pa.purchase_id
    WHERE p.status = 'completed' AND p.created_at >= ?
    GROUP BY COALESCE(pa.trigger_event, 'unknown')
    ORDER BY revenue DESC
  `),

  // Create refund
  createRefund: db.prepare(`
    INSERT INTO refunds (id, purchase_id, user_id, amount_cents, reason, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `),

  // Get refunds
  getRefunds: db.prepare(`
    SELECT
      r.*, u.username, p.product_type, p.product_id
    FROM refunds r
    JOIN users u ON r.user_id = u.id
    JOIN purchases p ON r.purchase_id = p.id
    WHERE r.created_at >= ?
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `),

  // Get pending refunds
  getPendingRefunds: db.prepare(`
    SELECT
      r.*, u.username, p.product_type, p.product_id
    FROM refunds r
    JOIN users u ON r.user_id = u.id
    JOIN purchases p ON r.purchase_id = p.id
    WHERE r.status = 'pending'
    ORDER BY r.created_at ASC
  `),

  // Process refund
  processRefund: db.prepare(`
    UPDATE refunds
    SET status = ?, processed_by = ?, processed_at = strftime('%s', 'now')
    WHERE id = ?
  `),

  // Update purchase status (for refund)
  updatePurchaseStatus: db.prepare(`
    UPDATE purchases SET status = ? WHERE id = ?
  `),

  // Get refund stats
  getRefundStats: db.prepare(`
    SELECT
      COUNT(*) as total_refunds,
      SUM(amount_cents) / 100.0 as total_amount,
      COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
      COUNT(CASE WHEN status = 'denied' THEN 1 END) as denied,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
    FROM refunds
    WHERE created_at >= ?
  `),

  // Track subscription event
  addSubscriptionEvent: db.prepare(`
    INSERT INTO subscription_events (id, subscription_id, user_id, event_type, previous_tier, new_tier, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),

  // Get subscription events
  getSubscriptionEvents: db.prepare(`
    SELECT se.*, u.username
    FROM subscription_events se
    JOIN users u ON se.user_id = u.id
    WHERE se.created_at >= ?
    ORDER BY se.created_at DESC
    LIMIT ?
  `),

  // Get subscription churn by tier
  getSubscriptionChurn: db.prepare(`
    SELECT
      tier,
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'active' AND expires_at > strftime('%s', 'now') THEN 1 END) as active,
      COUNT(CASE WHEN status IN ('cancelled', 'expired') THEN 1 END) as churned,
      AVG(CASE WHEN cancelled_at IS NOT NULL THEN cancelled_at - started_at ELSE expires_at - started_at END) as avg_length
    FROM subscriptions
    GROUP BY tier
  `),

  // Get monthly recurring revenue
  getMRR: db.prepare(`
    SELECT
      tier,
      COUNT(*) as subscribers,
      SUM(price_cents) / 100.0 as mrr
    FROM subscriptions
    WHERE status = 'active' AND expires_at > strftime('%s', 'now')
    GROUP BY tier
  `),

  // Get churn rate over time
  getChurnOverTime: db.prepare(`
    SELECT
      date(created_at, 'unixepoch') as date,
      COUNT(CASE WHEN event_type = 'cancelled' THEN 1 END) as cancellations,
      COUNT(CASE WHEN event_type = 'renewed' THEN 1 END) as renewals,
      COUNT(CASE WHEN event_type = 'subscribed' THEN 1 END) as new_subscribers
    FROM subscription_events
    WHERE created_at >= ?
    GROUP BY date(created_at, 'unixepoch')
    ORDER BY date ASC
  `),

  // Get product performance
  getProductPerformance: db.prepare(`
    SELECT
      product_type,
      product_id,
      COUNT(*) as sales,
      SUM(price_cents) / 100.0 as revenue,
      AVG(price_cents) / 100.0 as avg_price,
      COUNT(DISTINCT user_id) as unique_buyers
    FROM purchases
    WHERE status = 'completed' AND created_at >= ?
    GROUP BY product_type, product_id
    ORDER BY revenue DESC
    LIMIT ?
  `),

  // Get hourly revenue
  getHourlyRevenue: db.prepare(`
    SELECT
      strftime('%H', created_at, 'unixepoch') as hour,
      SUM(price_cents) / 100.0 as revenue,
      COUNT(*) as transactions
    FROM purchases
    WHERE status = 'completed' AND created_at >= ?
    GROUP BY hour
    ORDER BY hour ASC
  `),

  // Get user lifetime value distribution
  getLTVDistribution: db.prepare(`
    SELECT
      CASE
        WHEN total_spent = 0 THEN '$0'
        WHEN total_spent < 5 THEN '$0.01-$4.99'
        WHEN total_spent < 20 THEN '$5-$19.99'
        WHEN total_spent < 50 THEN '$20-$49.99'
        WHEN total_spent < 100 THEN '$50-$99.99'
        WHEN total_spent < 500 THEN '$100-$499.99'
        ELSE '$500+'
      END as ltv_bracket,
      COUNT(*) as user_count
    FROM (
      SELECT user_id, COALESCE(SUM(price_cents), 0) / 100.0 as total_spent
      FROM purchases
      WHERE status = 'completed'
      GROUP BY user_id
    )
    GROUP BY ltv_bracket
    ORDER BY
      CASE ltv_bracket
        WHEN '$0' THEN 1
        WHEN '$0.01-$4.99' THEN 2
        WHEN '$5-$19.99' THEN 3
        WHEN '$20-$49.99' THEN 4
        WHEN '$50-$99.99' THEN 5
        WHEN '$100-$499.99' THEN 6
        ELSE 7
      END
  `),
};

// ============ HELPER FUNCTIONS ============

function getTimestampDaysAgo(days: number): number {
  return Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
}

// ============ API ROUTES ============

// GET /api/admin/revenue/purchases - Get purchases with attribution
router.get('/purchases', requirePermission(PERMISSIONS.VIEW_REVENUE), (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(90, parseInt(req.query.days as string) || 30);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const startTimestamp = getTimestampDaysAgo(days);

    const purchases = revenueQueries.getPurchasesWithAttribution.all(
      startTimestamp, limit, offset
    ) as Array<{
      id: string;
      user_id: string;
      username: string;
      product_type: string;
      product_id: string;
      price_cents: number;
      currency: string;
      status: string;
      created_at: number;
      source: string | null;
      medium: string | null;
      campaign: string | null;
      trigger_event: string | null;
      session_id: string | null;
    }>;

    res.json({
      period: `${days} days`,
      purchases: purchases.map(p => ({
        id: p.id,
        userId: p.user_id,
        username: p.username,
        productType: p.product_type,
        productId: p.product_id,
        price: p.price_cents / 100,
        currency: p.currency,
        status: p.status,
        attribution: p.source ? {
          source: p.source,
          medium: p.medium,
          campaign: p.campaign,
          triggerEvent: p.trigger_event,
          sessionId: p.session_id,
        } : null,
        createdAt: p.created_at,
      })),
    });
  } catch (error) {
    console.error('Get purchases error:', error);
    res.status(500).json({ error: 'Failed to get purchases' });
  }
});

// GET /api/admin/revenue/attribution - Revenue by attribution
router.get('/attribution', requirePermission(PERMISSIONS.VIEW_REVENUE), (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(90, parseInt(req.query.days as string) || 30);
    const startTimestamp = getTimestampDaysAgo(days);

    const bySource = revenueQueries.getRevenueBySource.all(startTimestamp) as Array<{
      source: string;
      revenue: number;
      transactions: number;
    }>;

    const byMedium = revenueQueries.getRevenueByMedium.all(startTimestamp) as Array<{
      medium: string;
      revenue: number;
      transactions: number;
    }>;

    const byCampaign = revenueQueries.getRevenueByCampaign.all(startTimestamp, 20) as Array<{
      campaign: string;
      revenue: number;
      transactions: number;
    }>;

    const byTrigger = revenueQueries.getRevenueByTrigger.all(startTimestamp) as Array<{
      trigger_event: string;
      revenue: number;
      transactions: number;
    }>;

    const totalRevenue = bySource.reduce((sum, s) => sum + s.revenue, 0);

    res.json({
      period: `${days} days`,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      bySource: bySource.map(s => ({
        source: s.source,
        revenue: Math.round(s.revenue * 100) / 100,
        transactions: s.transactions,
        percentage: totalRevenue > 0
          ? Math.round((s.revenue / totalRevenue) * 10000) / 100
          : 0,
      })),
      byMedium: byMedium.map(m => ({
        medium: m.medium,
        revenue: Math.round(m.revenue * 100) / 100,
        transactions: m.transactions,
        percentage: totalRevenue > 0
          ? Math.round((m.revenue / totalRevenue) * 10000) / 100
          : 0,
      })),
      byCampaign: byCampaign.map(c => ({
        campaign: c.campaign,
        revenue: Math.round(c.revenue * 100) / 100,
        transactions: c.transactions,
      })),
      byTrigger: byTrigger.map(t => ({
        trigger: t.trigger_event,
        revenue: Math.round(t.revenue * 100) / 100,
        transactions: t.transactions,
      })),
    });
  } catch (error) {
    console.error('Get attribution error:', error);
    res.status(500).json({ error: 'Failed to get attribution data' });
  }
});

// POST /api/admin/revenue/attribution - Add attribution to purchase
router.post('/attribution', requirePermission(PERMISSIONS.MANAGE_ECONOMY), (req: AdminRequest, res: Response) => {
  try {
    const { purchaseId, source, medium, campaign, triggerEvent, sessionId } = req.body;

    if (!purchaseId || !source || !medium) {
      res.status(400).json({ error: 'Purchase ID, source, and medium are required' });
      return;
    }

    revenueQueries.addAttribution.run(
      purchaseId,
      source,
      medium,
      campaign || null,
      triggerEvent || null,
      sessionId || null
    );

    res.json({ success: true, message: 'Attribution added' });
  } catch (error) {
    console.error('Add attribution error:', error);
    res.status(500).json({ error: 'Failed to add attribution' });
  }
});

// GET /api/admin/revenue/refunds - Get refunds
router.get('/refunds', requirePermission(PERMISSIONS.VIEW_REVENUE), (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(90, parseInt(req.query.days as string) || 30);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const startTimestamp = getTimestampDaysAgo(days);

    const refunds = revenueQueries.getRefunds.all(startTimestamp, limit, offset) as Array<{
      id: string;
      purchase_id: string;
      user_id: string;
      username: string;
      amount_cents: number;
      reason: string;
      status: string;
      processed_by: string | null;
      created_at: number;
      processed_at: number | null;
      product_type: string;
      product_id: string;
    }>;

    const stats = revenueQueries.getRefundStats.get(startTimestamp) as {
      total_refunds: number;
      total_amount: number | null;
      approved: number;
      denied: number;
      pending: number;
    };

    res.json({
      period: `${days} days`,
      stats: {
        totalRefunds: stats.total_refunds,
        totalAmount: Math.round((stats.total_amount || 0) * 100) / 100,
        approved: stats.approved,
        denied: stats.denied,
        pending: stats.pending,
      },
      refunds: refunds.map(r => ({
        id: r.id,
        purchaseId: r.purchase_id,
        userId: r.user_id,
        username: r.username,
        amount: r.amount_cents / 100,
        reason: r.reason,
        status: r.status,
        productType: r.product_type,
        productId: r.product_id,
        processedBy: r.processed_by,
        createdAt: r.created_at,
        processedAt: r.processed_at,
      })),
    });
  } catch (error) {
    console.error('Get refunds error:', error);
    res.status(500).json({ error: 'Failed to get refunds' });
  }
});

// GET /api/admin/revenue/refunds/pending - Get pending refunds
router.get('/refunds/pending', requirePermission(PERMISSIONS.MANAGE_ECONOMY), (req: AdminRequest, res: Response) => {
  try {
    const refunds = revenueQueries.getPendingRefunds.all() as Array<{
      id: string;
      purchase_id: string;
      user_id: string;
      username: string;
      amount_cents: number;
      reason: string;
      status: string;
      created_at: number;
      product_type: string;
      product_id: string;
    }>;

    res.json({
      pendingCount: refunds.length,
      refunds: refunds.map(r => ({
        id: r.id,
        purchaseId: r.purchase_id,
        userId: r.user_id,
        username: r.username,
        amount: r.amount_cents / 100,
        reason: r.reason,
        productType: r.product_type,
        productId: r.product_id,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error('Get pending refunds error:', error);
    res.status(500).json({ error: 'Failed to get pending refunds' });
  }
});

// POST /api/admin/revenue/refunds - Create refund request
router.post('/refunds', requirePermission(PERMISSIONS.MANAGE_ECONOMY), (req: AdminRequest, res: Response) => {
  try {
    const { purchaseId, userId, amountCents, reason } = req.body;

    if (!purchaseId || !userId || !amountCents || !reason) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    const refundId = uuidv4();
    revenueQueries.createRefund.run(refundId, purchaseId, userId, amountCents, reason);

    res.json({
      success: true,
      refundId,
      message: 'Refund request created',
    });
  } catch (error) {
    console.error('Create refund error:', error);
    res.status(500).json({ error: 'Failed to create refund' });
  }
});

// POST /api/admin/revenue/refunds/:id/process - Process refund
router.post('/refunds/:id/process', requirePermission(PERMISSIONS.MANAGE_ECONOMY), (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'approve' or 'deny'

    if (!action || !['approve', 'deny'].includes(action)) {
      res.status(400).json({ error: 'Action must be "approve" or "deny"' });
      return;
    }

    const status = action === 'approve' ? 'approved' : 'denied';
    revenueQueries.processRefund.run(status, req.admin?.userId || null, id);

    // If approved, update purchase status
    if (action === 'approve') {
      const refund = db.prepare('SELECT purchase_id FROM refunds WHERE id = ?').get(id) as { purchase_id: string } | undefined;
      if (refund) {
        revenueQueries.updatePurchaseStatus.run('refunded', refund.purchase_id);
      }
    }

    res.json({
      success: true,
      message: `Refund ${status}`,
    });
  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

// GET /api/admin/revenue/subscriptions/churn - Subscription churn analysis
router.get('/subscriptions/churn', requirePermission(PERMISSIONS.VIEW_REVENUE), (req: AdminRequest, res: Response) => {
  try {
    const churnByTier = revenueQueries.getSubscriptionChurn.all() as Array<{
      tier: string;
      total: number;
      active: number;
      churned: number;
      avg_length: number | null;
    }>;

    const mrr = revenueQueries.getMRR.all() as Array<{
      tier: string;
      subscribers: number;
      mrr: number;
    }>;

    const totalMRR = mrr.reduce((sum, m) => sum + m.mrr, 0);

    res.json({
      churnByTier: churnByTier.map(c => ({
        tier: c.tier,
        totalSubscribers: c.total,
        activeSubscribers: c.active,
        churned: c.churned,
        churnRate: c.total > 0
          ? Math.round((c.churned / c.total) * 10000) / 100
          : 0,
        avgSubscriptionDays: Math.round((c.avg_length || 0) / 86400),
      })),
      mrr: {
        total: Math.round(totalMRR * 100) / 100,
        byTier: mrr.map(m => ({
          tier: m.tier,
          subscribers: m.subscribers,
          mrr: Math.round(m.mrr * 100) / 100,
        })),
        arr: Math.round(totalMRR * 12 * 100) / 100,
      },
    });
  } catch (error) {
    console.error('Get churn error:', error);
    res.status(500).json({ error: 'Failed to get churn data' });
  }
});

// GET /api/admin/revenue/subscriptions/events - Subscription events
router.get('/subscriptions/events', requirePermission(PERMISSIONS.VIEW_REVENUE), (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(90, parseInt(req.query.days as string) || 30);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const startTimestamp = getTimestampDaysAgo(days);

    const events = revenueQueries.getSubscriptionEvents.all(startTimestamp, limit) as Array<{
      id: string;
      subscription_id: string;
      user_id: string;
      username: string;
      event_type: string;
      previous_tier: string | null;
      new_tier: string | null;
      reason: string | null;
      created_at: number;
    }>;

    const churnOverTime = revenueQueries.getChurnOverTime.all(startTimestamp) as Array<{
      date: string;
      cancellations: number;
      renewals: number;
      new_subscribers: number;
    }>;

    res.json({
      period: `${days} days`,
      events: events.map(e => ({
        id: e.id,
        subscriptionId: e.subscription_id,
        userId: e.user_id,
        username: e.username,
        eventType: e.event_type,
        previousTier: e.previous_tier,
        newTier: e.new_tier,
        reason: e.reason,
        createdAt: e.created_at,
      })),
      churnOverTime: churnOverTime.map(c => ({
        date: c.date,
        cancellations: c.cancellations,
        renewals: c.renewals,
        newSubscribers: c.new_subscribers,
        netChange: c.new_subscribers + c.renewals - c.cancellations,
      })),
    });
  } catch (error) {
    console.error('Get subscription events error:', error);
    res.status(500).json({ error: 'Failed to get subscription events' });
  }
});

// POST /api/admin/revenue/subscriptions/event - Track subscription event
router.post('/subscriptions/event', requirePermission(PERMISSIONS.MANAGE_ECONOMY), (req: AdminRequest, res: Response) => {
  try {
    const { subscriptionId, userId, eventType, previousTier, newTier, reason } = req.body;

    if (!subscriptionId || !userId || !eventType) {
      res.status(400).json({ error: 'Subscription ID, user ID, and event type are required' });
      return;
    }

    const eventId = uuidv4();
    revenueQueries.addSubscriptionEvent.run(
      eventId,
      subscriptionId,
      userId,
      eventType,
      previousTier || null,
      newTier || null,
      reason || null
    );

    res.json({
      success: true,
      eventId,
      message: 'Subscription event tracked',
    });
  } catch (error) {
    console.error('Track subscription event error:', error);
    res.status(500).json({ error: 'Failed to track subscription event' });
  }
});

// GET /api/admin/revenue/products - Product performance
router.get('/products', requirePermission(PERMISSIONS.VIEW_REVENUE), (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(90, parseInt(req.query.days as string) || 30);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const startTimestamp = getTimestampDaysAgo(days);

    const products = revenueQueries.getProductPerformance.all(startTimestamp, limit) as Array<{
      product_type: string;
      product_id: string;
      sales: number;
      revenue: number;
      avg_price: number;
      unique_buyers: number;
    }>;

    res.json({
      period: `${days} days`,
      products: products.map(p => ({
        productType: p.product_type,
        productId: p.product_id,
        sales: p.sales,
        revenue: Math.round(p.revenue * 100) / 100,
        avgPrice: Math.round(p.avg_price * 100) / 100,
        uniqueBuyers: p.unique_buyers,
        revenuePerBuyer: p.unique_buyers > 0
          ? Math.round((p.revenue / p.unique_buyers) * 100) / 100
          : 0,
      })),
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to get product performance' });
  }
});

// GET /api/admin/revenue/hourly - Hourly revenue distribution
router.get('/hourly', requirePermission(PERMISSIONS.VIEW_REVENUE), (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(30, parseInt(req.query.days as string) || 7);
    const startTimestamp = getTimestampDaysAgo(days);

    const hourly = revenueQueries.getHourlyRevenue.all(startTimestamp) as Array<{
      hour: string;
      revenue: number;
      transactions: number;
    }>;

    res.json({
      period: `${days} days`,
      hourly: hourly.map(h => ({
        hour: parseInt(h.hour),
        revenue: Math.round(h.revenue * 100) / 100,
        transactions: h.transactions,
        avgTransaction: h.transactions > 0
          ? Math.round((h.revenue / h.transactions) * 100) / 100
          : 0,
      })),
    });
  } catch (error) {
    console.error('Get hourly revenue error:', error);
    res.status(500).json({ error: 'Failed to get hourly revenue' });
  }
});

// GET /api/admin/revenue/ltv-distribution - LTV distribution
router.get('/ltv-distribution', requirePermission(PERMISSIONS.VIEW_REVENUE), (req: AdminRequest, res: Response) => {
  try {
    const distribution = revenueQueries.getLTVDistribution.all() as Array<{
      ltv_bracket: string;
      user_count: number;
    }>;

    const totalUsers = distribution.reduce((sum, d) => sum + d.user_count, 0);

    res.json({
      distribution: distribution.map(d => ({
        bracket: d.ltv_bracket,
        userCount: d.user_count,
        percentage: totalUsers > 0
          ? Math.round((d.user_count / totalUsers) * 10000) / 100
          : 0,
      })),
      totalUsers,
    });
  } catch (error) {
    console.error('Get LTV distribution error:', error);
    res.status(500).json({ error: 'Failed to get LTV distribution' });
  }
});

export { router as revenueTrackingRouter };
