/**
 * StoreService - Frontend service for managing the in-game store
 * Handles gem bundles, starter packs, limited-time offers, and daily deals
 */

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export type OfferType = 'gem_bundle' | 'starter_pack' | 'limited_time' | 'daily_deal' | 'special';

export interface StoreOffer {
  id: string;
  type: OfferType;
  name: string;
  description: string | null;
  originalPrice: number | null;
  price: number;
  priceDisplay: string;
  discountPercent: number;
  gems: number;
  coins: number;
  crystals: number;
  bonusGems: number;
  items: string[];
  isOneTime: boolean;
  isPurchased: boolean;
  canPurchase: boolean;
  expiresAt: number | null;
  timeRemaining: number | null;
  imageKey: string | null;
}

export interface DailyDeal {
  dealId: string;
  offerId: string;
  name: string;
  description: string | null;
  price: number;
  priceDisplay: string;
  discountedPrice: number;
  discountedPriceDisplay: string;
  discountPercent: number;
  gems: number;
  coins: number;
  crystals: number;
  bonusGems: number;
  items: string[];
  isPurchased: boolean;
  imageKey: string | null;
}

export interface StoreData {
  offers: StoreOffer[];
  grouped: {
    gemBundles: StoreOffer[];
    starterPacks: StoreOffer[];
    limitedTime: StoreOffer[];
    special: StoreOffer[];
  };
}

export interface DailyDealsData {
  deals: DailyDeal[];
  timeUntilReset: number;
  resetTime: string;
}

export interface PurchaseResult {
  success: boolean;
  purchaseId?: string;
  offer?: {
    id: string;
    name: string;
    gems: number;
    coins: number;
    crystals: number;
    items: string[];
  };
  currencies?: {
    gems: number;
    coins: number;
    crystals: number;
  };
  message?: string;
  error?: string;
}

export interface FirstPurchaseBonus {
  eligible: boolean;
  bonusMultiplier: number;
  message: string | null;
}

class StoreService {
  private storeData: StoreData | null = null;
  private dailyDeals: DailyDealsData | null = null;
  private listeners: Set<(data: StoreData) => void> = new Set();

  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Subscribe to store updates
   */
  subscribe(listener: (data: StoreData) => void): () => void {
    this.listeners.add(listener);
    if (this.storeData) {
      listener(this.storeData);
    }
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    if (this.storeData) {
      this.listeners.forEach(listener => listener(this.storeData!));
    }
  }

  /**
   * Get cached store data
   */
  getData(): StoreData | null {
    return this.storeData;
  }

  /**
   * Get cached daily deals
   */
  getDailyDeals(): DailyDealsData | null {
    return this.dailyDeals;
  }

  /**
   * Fetch all store offers
   */
  async fetchOffers(): Promise<StoreData | null> {
    try {
      const response = await fetch(`${SERVER_URL}/api/store/offers`, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        console.error('Failed to fetch store offers');
        return null;
      }

      const data = await response.json();
      this.storeData = data;
      this.notifyListeners();
      return this.storeData;
    } catch (error) {
      console.error('Error fetching store offers:', error);
      return null;
    }
  }

  /**
   * Fetch daily deals
   */
  async fetchDailyDeals(): Promise<DailyDealsData | null> {
    try {
      const response = await fetch(`${SERVER_URL}/api/store/daily-deals`, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        console.error('Failed to fetch daily deals');
        return null;
      }

      const data = await response.json();
      this.dailyDeals = data;
      return this.dailyDeals;
    } catch (error) {
      console.error('Error fetching daily deals:', error);
      return null;
    }
  }

  /**
   * Purchase an offer
   */
  async purchaseOffer(offerId: string, paymentMethod?: string): Promise<PurchaseResult> {
    try {
      const response = await fetch(`${SERVER_URL}/api/store/purchase`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ offerId, paymentMethod }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error };
      }

      // Refresh store data
      await this.fetchOffers();

      return {
        success: true,
        purchaseId: data.purchaseId,
        offer: data.offer,
        currencies: data.currencies,
        message: data.message,
      };
    } catch (error) {
      console.error('Error purchasing offer:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Purchase a daily deal
   */
  async purchaseDailyDeal(dealId: string): Promise<PurchaseResult> {
    try {
      const response = await fetch(`${SERVER_URL}/api/store/purchase-daily-deal`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ dealId }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error };
      }

      // Refresh daily deals
      await this.fetchDailyDeals();

      return {
        success: true,
        purchaseId: data.purchaseId,
        offer: data.offer,
        currencies: data.currencies,
        message: data.message,
      };
    } catch (error) {
      console.error('Error purchasing daily deal:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Check first purchase bonus eligibility
   */
  async checkFirstPurchaseBonus(): Promise<FirstPurchaseBonus> {
    try {
      const response = await fetch(`${SERVER_URL}/api/store/first-purchase-bonus`, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        return { eligible: false, bonusMultiplier: 1.0, message: null };
      }

      return await response.json();
    } catch (error) {
      console.error('Error checking first purchase bonus:', error);
      return { eligible: false, bonusMultiplier: 1.0, message: null };
    }
  }

  /**
   * Get gem bundles
   */
  getGemBundles(): StoreOffer[] {
    return this.storeData?.grouped.gemBundles ?? [];
  }

  /**
   * Get starter packs
   */
  getStarterPacks(): StoreOffer[] {
    return this.storeData?.grouped.starterPacks ?? [];
  }

  /**
   * Get limited-time offers
   */
  getLimitedTimeOffers(): StoreOffer[] {
    return this.storeData?.grouped.limitedTime ?? [];
  }

  /**
   * Get special offers
   */
  getSpecialOffers(): StoreOffer[] {
    return this.storeData?.grouped.special ?? [];
  }

  /**
   * Format price for display
   */
  formatPrice(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  /**
   * Get time remaining string for daily deals
   */
  getTimeUntilReset(): number {
    return this.dailyDeals?.timeUntilReset ?? 0;
  }

  /**
   * Format time remaining
   */
  formatTimeRemaining(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  }

  /**
   * Clear cached data (on logout)
   */
  clear(): void {
    this.storeData = null;
    this.dailyDeals = null;
    this.listeners.clear();
  }
}

export const storeService = new StoreService();
