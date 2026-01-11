/**
 * SubscriptionService - Frontend service for managing player subscriptions
 * Handles Plus, Pro, and Elite tier subscriptions
 */

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export type SubscriptionTier = 'plus' | 'pro' | 'elite';

export interface SubscriptionBenefits {
  adFree: boolean;
  exclusiveSkins: boolean;
  doubleBattlePassXP: boolean;
  bonusDailyRewards: boolean;
  priorityMatchmaking: boolean;
  customEmotes: boolean;
  monthlyGems: number;
  monthlyCoins: number;
  monthlyCrystals: number;
  xpMultiplier: number;
  coinMultiplier: number;
}

export interface ActiveSubscription {
  id: string;
  tier: SubscriptionTier;
  status: string;
  startedAt: number;
  expiresAt: number;
  autoRenew: boolean;
  benefits: SubscriptionBenefits;
  daysRemaining: number;
}

export interface SubscriptionPurchaseResult {
  success: boolean;
  subscription?: ActiveSubscription;
  message?: string;
  error?: string;
}

export interface SubscriptionTierInfo {
  tier: SubscriptionTier;
  name: string;
  price: number;
  priceDisplay: string;
  benefits: SubscriptionBenefits;
  highlighted?: boolean;
}

const SUBSCRIPTION_TIERS: SubscriptionTierInfo[] = [
  {
    tier: 'plus',
    name: 'Plus',
    price: 499,
    priceDisplay: '$4.99/month',
    benefits: {
      adFree: true,
      exclusiveSkins: false,
      doubleBattlePassXP: false,
      bonusDailyRewards: true,
      priorityMatchmaking: false,
      customEmotes: false,
      monthlyGems: 100,
      monthlyCoins: 1000,
      monthlyCrystals: 0,
      xpMultiplier: 1.25,
      coinMultiplier: 1.1,
    },
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: 999,
    priceDisplay: '$9.99/month',
    highlighted: true,
    benefits: {
      adFree: true,
      exclusiveSkins: true,
      doubleBattlePassXP: true,
      bonusDailyRewards: true,
      priorityMatchmaking: true,
      customEmotes: false,
      monthlyGems: 500,
      monthlyCoins: 5000,
      monthlyCrystals: 50,
      xpMultiplier: 1.5,
      coinMultiplier: 1.25,
    },
  },
  {
    tier: 'elite',
    name: 'Elite',
    price: 1999,
    priceDisplay: '$19.99/month',
    benefits: {
      adFree: true,
      exclusiveSkins: true,
      doubleBattlePassXP: true,
      bonusDailyRewards: true,
      priorityMatchmaking: true,
      customEmotes: true,
      monthlyGems: 1500,
      monthlyCoins: 15000,
      monthlyCrystals: 200,
      xpMultiplier: 2.0,
      coinMultiplier: 1.5,
    },
  },
];

class SubscriptionService {
  private activeSubscription: ActiveSubscription | null = null;
  private listeners: Set<(subscription: ActiveSubscription | null) => void> = new Set();

  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Subscribe to subscription updates
   */
  subscribe(listener: (subscription: ActiveSubscription | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.activeSubscription);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.activeSubscription));
  }

  /**
   * Get current subscription (cached)
   */
  getSubscription(): ActiveSubscription | null {
    return this.activeSubscription;
  }

  /**
   * Get all available subscription tiers
   */
  getTiers(): SubscriptionTierInfo[] {
    return SUBSCRIPTION_TIERS;
  }

  /**
   * Fetch subscription from server
   */
  async fetchSubscription(): Promise<ActiveSubscription | null> {
    try {
      const response = await fetch(`${SERVER_URL}/api/subscriptions`, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          // No active subscription
          this.activeSubscription = null;
          this.notifyListeners();
          return null;
        }
        console.error('Failed to fetch subscription');
        return null;
      }

      const data = await response.json();
      this.activeSubscription = data;
      this.notifyListeners();
      return this.activeSubscription;
    } catch (error) {
      console.error('Error fetching subscription:', error);
      return null;
    }
  }

  /**
   * Purchase a subscription tier
   */
  async purchase(tier: SubscriptionTier): Promise<SubscriptionPurchaseResult> {
    try {
      const response = await fetch(`${SERVER_URL}/api/subscriptions/purchase`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ tier }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error };
      }

      // Refresh subscription data
      await this.fetchSubscription();

      return {
        success: true,
        subscription: this.activeSubscription ?? undefined,
        message: data.message,
      };
    } catch (error) {
      console.error('Error purchasing subscription:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Cancel subscription auto-renewal
   */
  async cancel(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${SERVER_URL}/api/subscriptions/cancel`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error };
      }

      // Refresh subscription data
      await this.fetchSubscription();

      return { success: true };
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Check if player has an active subscription
   */
  isSubscribed(): boolean {
    return this.activeSubscription !== null && this.activeSubscription.status === 'active';
  }

  /**
   * Check if player has a specific tier or higher
   */
  hasTierOrHigher(tier: SubscriptionTier): boolean {
    if (!this.activeSubscription) return false;

    const tierRanks: Record<SubscriptionTier, number> = {
      plus: 1,
      pro: 2,
      elite: 3,
    };

    return tierRanks[this.activeSubscription.tier] >= tierRanks[tier];
  }

  /**
   * Get current benefits
   */
  getBenefits(): SubscriptionBenefits | null {
    return this.activeSubscription?.benefits ?? null;
  }

  /**
   * Get XP multiplier
   */
  getXPMultiplier(): number {
    return this.activeSubscription?.benefits.xpMultiplier ?? 1.0;
  }

  /**
   * Get coin multiplier
   */
  getCoinMultiplier(): number {
    return this.activeSubscription?.benefits.coinMultiplier ?? 1.0;
  }

  /**
   * Check if ads are disabled
   */
  isAdFree(): boolean {
    return this.activeSubscription?.benefits.adFree ?? false;
  }

  /**
   * Get tier display name
   */
  getTierDisplayName(tier: SubscriptionTier): string {
    switch (tier) {
      case 'plus': return 'Plus';
      case 'pro': return 'Pro';
      case 'elite': return 'Elite';
    }
  }

  /**
   * Get tier color
   */
  getTierColor(tier: SubscriptionTier): number {
    switch (tier) {
      case 'plus': return 0x4488ff;   // Blue
      case 'pro': return 0xffd700;    // Gold
      case 'elite': return 0xff00ff;  // Magenta
    }
  }

  /**
   * Format days remaining
   */
  formatDaysRemaining(): string {
    if (!this.activeSubscription) return '';
    const days = this.activeSubscription.daysRemaining;
    if (days === 1) return '1 day';
    return `${days} days`;
  }

  /**
   * Clear cached data (on logout)
   */
  clear(): void {
    this.activeSubscription = null;
    this.listeners.clear();
  }
}

export const subscriptionService = new SubscriptionService();
