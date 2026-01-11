/**
 * CurrencyService - Frontend service for managing player currencies
 * Handles gems (hard currency), coins (soft currency), and crystals (subscription-exclusive)
 */

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export type CurrencyType = 'gems' | 'coins' | 'crystals';

export interface PlayerCurrencies {
  gems: number;
  coins: number;
  crystals: number;
  updatedAt: number;
}

export interface CurrencyTransaction {
  id: string;
  currencyType: CurrencyType;
  amount: number;
  balanceAfter: number;
  transactionType: string;
  description: string | null;
  referenceId: string | null;
  createdAt: number;
}

export interface SpendResult {
  success: boolean;
  newBalance: number;
  currencies: PlayerCurrencies;
  error?: string;
}

export interface EarnResult {
  success: boolean;
  earned: number;
  newBalance: number;
  currencies: PlayerCurrencies;
  error?: string;
}

class CurrencyService {
  private currencies: PlayerCurrencies | null = null;
  private listeners: Set<(currencies: PlayerCurrencies) => void> = new Set();

  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Subscribe to currency updates
   */
  subscribe(listener: (currencies: PlayerCurrencies) => void): () => void {
    this.listeners.add(listener);
    if (this.currencies) {
      listener(this.currencies);
    }
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    if (this.currencies) {
      this.listeners.forEach(listener => listener(this.currencies!));
    }
  }

  /**
   * Get current currencies (cached or fetch)
   */
  getCurrencies(): PlayerCurrencies | null {
    return this.currencies;
  }

  /**
   * Fetch currencies from server
   */
  async fetchCurrencies(): Promise<PlayerCurrencies | null> {
    try {
      const response = await fetch(`${SERVER_URL}/api/currency`, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        console.error('Failed to fetch currencies');
        return null;
      }

      const data = await response.json();
      this.currencies = {
        gems: data.gems,
        coins: data.coins,
        crystals: data.crystals,
        updatedAt: data.updatedAt,
      };

      this.notifyListeners();
      return this.currencies;
    } catch (error) {
      console.error('Error fetching currencies:', error);
      return null;
    }
  }

  /**
   * Spend currency
   */
  async spend(
    currencyType: CurrencyType,
    amount: number,
    description?: string,
    referenceId?: string
  ): Promise<SpendResult> {
    try {
      const response = await fetch(`${SERVER_URL}/api/currency/spend`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ currencyType, amount, description, referenceId }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          newBalance: this.currencies?.[currencyType] ?? 0,
          currencies: this.currencies ?? { gems: 0, coins: 0, crystals: 0, updatedAt: 0 },
          error: data.error,
        };
      }

      this.currencies = {
        ...data.currencies,
        updatedAt: Date.now(),
      };

      this.notifyListeners();

      return {
        success: true,
        newBalance: data.newBalance,
        currencies: this.currencies!,
      };
    } catch (error) {
      console.error('Error spending currency:', error);
      return {
        success: false,
        newBalance: 0,
        currencies: this.currencies ?? { gems: 0, coins: 0, crystals: 0, updatedAt: 0 },
        error: 'Network error',
      };
    }
  }

  /**
   * Earn currency from gameplay
   */
  async earn(
    currencyType: CurrencyType,
    amount: number,
    description?: string,
    referenceId?: string
  ): Promise<EarnResult> {
    try {
      const response = await fetch(`${SERVER_URL}/api/currency/earn`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ currencyType, amount, description, referenceId }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          earned: 0,
          newBalance: this.currencies?.[currencyType] ?? 0,
          currencies: this.currencies ?? { gems: 0, coins: 0, crystals: 0, updatedAt: 0 },
          error: data.error,
        };
      }

      this.currencies = {
        ...data.currencies,
        updatedAt: Date.now(),
      };

      this.notifyListeners();

      return {
        success: true,
        earned: data.earned,
        newBalance: data.newBalance,
        currencies: this.currencies!,
      };
    } catch (error) {
      console.error('Error earning currency:', error);
      return {
        success: false,
        earned: 0,
        newBalance: 0,
        currencies: this.currencies ?? { gems: 0, coins: 0, crystals: 0, updatedAt: 0 },
        error: 'Network error',
      };
    }
  }

  /**
   * Get transaction history
   */
  async getTransactions(limit: number = 50): Promise<CurrencyTransaction[]> {
    try {
      const response = await fetch(`${SERVER_URL}/api/currency/transactions?limit=${limit}`, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.transactions.map((t: Record<string, unknown>) => ({
        id: t.id,
        currencyType: t.currency_type as CurrencyType,
        amount: t.amount,
        balanceAfter: t.balance_after,
        transactionType: t.transaction_type,
        description: t.description,
        referenceId: t.reference_id,
        createdAt: t.created_at,
      }));
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return [];
    }
  }

  /**
   * Check if player can afford a purchase
   */
  canAfford(currencyType: CurrencyType, amount: number): boolean {
    if (!this.currencies) return false;
    return this.currencies[currencyType] >= amount;
  }

  /**
   * Format currency for display
   */
  formatCurrency(amount: number): string {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}K`;
    }
    return amount.toString();
  }

  /**
   * Get currency icon/emoji
   */
  getCurrencyIcon(currencyType: CurrencyType): string {
    switch (currencyType) {
      case 'gems': return '💎';
      case 'coins': return '🪙';
      case 'crystals': return '✨';
      default: return '💰';
    }
  }

  /**
   * Get currency color
   */
  getCurrencyColor(currencyType: CurrencyType): number {
    switch (currencyType) {
      case 'gems': return 0x00f5ff;    // Cyan
      case 'coins': return 0xffd700;   // Gold
      case 'crystals': return 0xff00ff; // Magenta
      default: return 0xffffff;
    }
  }

  /**
   * Clear cached data (on logout)
   */
  clear(): void {
    this.currencies = null;
    this.listeners.clear();
  }
}

export const currencyService = new CurrencyService();
