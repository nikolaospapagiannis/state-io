import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from './auth';
import { db } from './database';

const router = Router();

// Types
export type CurrencyType = 'gems' | 'coins' | 'crystals';
export type TransactionType = 'earn' | 'spend' | 'purchase' | 'refund' | 'reward' | 'admin';

export interface PlayerCurrencies {
  user_id: string;
  gems: number;
  coins: number;
  crystals: number;
  updated_at: number;
}

export interface CurrencyTransaction {
  id: string;
  user_id: string;
  currency_type: CurrencyType;
  amount: number;
  balance_after: number;
  transaction_type: TransactionType;
  description: string | null;
  reference_id: string | null;
  created_at: number;
}

// Prepared statements
const currencyQueries = {
  getOrCreate: db.prepare(`
    INSERT INTO player_currencies (user_id) VALUES (?)
    ON CONFLICT(user_id) DO UPDATE SET updated_at = strftime('%s', 'now')
    RETURNING *
  `),

  get: db.prepare(`SELECT * FROM player_currencies WHERE user_id = ?`),

  update: db.prepare(`
    UPDATE player_currencies
    SET gems = ?, coins = ?, crystals = ?, updated_at = strftime('%s', 'now')
    WHERE user_id = ?
  `),

  addTransaction: db.prepare(`
    INSERT INTO currency_transactions (id, user_id, currency_type, amount, balance_after, transaction_type, description, reference_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getTransactions: db.prepare(`
    SELECT * FROM currency_transactions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `),
};

// Helper functions
export function getPlayerCurrencies(userId: string): PlayerCurrencies {
  let currencies = currencyQueries.get.get(userId) as PlayerCurrencies | undefined;

  if (!currencies) {
    currencies = currencyQueries.getOrCreate.get(userId) as PlayerCurrencies;
  }

  return currencies;
}

export function updateCurrency(
  userId: string,
  currencyType: CurrencyType,
  amount: number,
  transactionType: TransactionType,
  description?: string,
  referenceId?: string
): { success: boolean; newBalance: number; error?: string } {
  const currencies = getPlayerCurrencies(userId);

  const currentBalance = currencies[currencyType];
  const newBalance = currentBalance + amount;

  // Check for insufficient funds on spend
  if (amount < 0 && newBalance < 0) {
    return {
      success: false,
      newBalance: currentBalance,
      error: `Insufficient ${currencyType}. Current: ${currentBalance}, Required: ${Math.abs(amount)}`
    };
  }

  // Update the balance
  const updateData: Record<string, number> = {
    gems: currencies.gems,
    coins: currencies.coins,
    crystals: currencies.crystals,
  };
  updateData[currencyType] = newBalance;

  currencyQueries.update.run(updateData.gems, updateData.coins, updateData.crystals, userId);

  // Log the transaction
  const transactionId = uuidv4();
  currencyQueries.addTransaction.run(
    transactionId,
    userId,
    currencyType,
    amount,
    newBalance,
    transactionType,
    description || null,
    referenceId || null
  );

  return { success: true, newBalance };
}

export function spendCurrency(
  userId: string,
  currencyType: CurrencyType,
  amount: number,
  description?: string,
  referenceId?: string
): { success: boolean; newBalance: number; error?: string } {
  if (amount <= 0) {
    return { success: false, newBalance: 0, error: 'Amount must be positive' };
  }
  return updateCurrency(userId, currencyType, -amount, 'spend', description, referenceId);
}

export function earnCurrency(
  userId: string,
  currencyType: CurrencyType,
  amount: number,
  description?: string,
  referenceId?: string
): { success: boolean; newBalance: number; error?: string } {
  if (amount <= 0) {
    return { success: false, newBalance: 0, error: 'Amount must be positive' };
  }
  return updateCurrency(userId, currencyType, amount, 'earn', description, referenceId);
}

export function awardCurrency(
  userId: string,
  currencyType: CurrencyType,
  amount: number,
  description?: string,
  referenceId?: string
): { success: boolean; newBalance: number; error?: string } {
  if (amount <= 0) {
    return { success: false, newBalance: 0, error: 'Amount must be positive' };
  }
  return updateCurrency(userId, currencyType, amount, 'reward', description, referenceId);
}

// API Routes

// GET /api/currency - Get player's currencies
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const currencies = getPlayerCurrencies(req.user.id);

    res.json({
      gems: currencies.gems,
      coins: currencies.coins,
      crystals: currencies.crystals,
      updatedAt: currencies.updated_at,
    });
  } catch (error) {
    console.error('Get currencies error:', error);
    res.status(500).json({ error: 'Failed to get currencies' });
  }
});

// GET /api/currency/transactions - Get transaction history
router.get('/transactions', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const transactions = currencyQueries.getTransactions.all(req.user.id, limit) as CurrencyTransaction[];

    res.json({ transactions });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// POST /api/currency/spend - Spend currency
router.post('/spend', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { currencyType, amount, description, referenceId } = req.body;

    if (!currencyType || !['gems', 'coins', 'crystals'].includes(currencyType)) {
      res.status(400).json({ error: 'Invalid currency type' });
      return;
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ error: 'Amount must be a positive number' });
      return;
    }

    const result = spendCurrency(
      req.user.id,
      currencyType as CurrencyType,
      amount,
      description,
      referenceId
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    const currencies = getPlayerCurrencies(req.user.id);

    res.json({
      success: true,
      newBalance: result.newBalance,
      currencies: {
        gems: currencies.gems,
        coins: currencies.coins,
        crystals: currencies.crystals,
      },
    });
  } catch (error) {
    console.error('Spend currency error:', error);
    res.status(500).json({ error: 'Failed to spend currency' });
  }
});

// POST /api/currency/earn - Earn currency (from gameplay)
router.post('/earn', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { currencyType, amount, description, referenceId } = req.body;

    if (!currencyType || !['gems', 'coins', 'crystals'].includes(currencyType)) {
      res.status(400).json({ error: 'Invalid currency type' });
      return;
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ error: 'Amount must be a positive number' });
      return;
    }

    // Validate earning limits (prevent exploitation)
    const MAX_EARN_AMOUNTS: Record<CurrencyType, number> = {
      gems: 50,      // Max gems per earn call
      coins: 1000,   // Max coins per earn call
      crystals: 0,   // Crystals cannot be earned through gameplay
    };

    if (amount > MAX_EARN_AMOUNTS[currencyType as CurrencyType]) {
      res.status(400).json({
        error: `Cannot earn more than ${MAX_EARN_AMOUNTS[currencyType as CurrencyType]} ${currencyType} at once`
      });
      return;
    }

    if (currencyType === 'crystals') {
      res.status(400).json({ error: 'Crystals can only be obtained through subscription' });
      return;
    }

    const result = earnCurrency(
      req.user.id,
      currencyType as CurrencyType,
      amount,
      description || 'Gameplay reward',
      referenceId
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    const currencies = getPlayerCurrencies(req.user.id);

    res.json({
      success: true,
      earned: amount,
      newBalance: result.newBalance,
      currencies: {
        gems: currencies.gems,
        coins: currencies.coins,
        crystals: currencies.crystals,
      },
    });
  } catch (error) {
    console.error('Earn currency error:', error);
    res.status(500).json({ error: 'Failed to earn currency' });
  }
});

// POST /api/currency/award - Award currency (admin/system only - should be protected in production)
router.post('/award', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { currencyType, amount, description, referenceId } = req.body;

    if (!currencyType || !['gems', 'coins', 'crystals'].includes(currencyType)) {
      res.status(400).json({ error: 'Invalid currency type' });
      return;
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ error: 'Amount must be a positive number' });
      return;
    }

    const result = awardCurrency(
      req.user.id,
      currencyType as CurrencyType,
      amount,
      description || 'System reward',
      referenceId
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    const currencies = getPlayerCurrencies(req.user.id);

    res.json({
      success: true,
      awarded: amount,
      newBalance: result.newBalance,
      currencies: {
        gems: currencies.gems,
        coins: currencies.coins,
        crystals: currencies.crystals,
      },
    });
  } catch (error) {
    console.error('Award currency error:', error);
    res.status(500).json({ error: 'Failed to award currency' });
  }
});

export { router as currencyRouter };
