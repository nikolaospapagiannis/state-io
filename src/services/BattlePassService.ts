/**
 * BattlePassService - Frontend service for managing battle pass functionality
 * Handles season progress, rewards, and tier purchases
 */

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export type BattlePassTier = 'free' | 'premium' | 'diamond';
export type RewardType = 'gems' | 'coins' | 'crystals' | 'skin' | 'title' | 'avatar_frame' | 'emote';

export interface BattlePassSeason {
  id: string;
  number: number;
  name: string;
  startDate: number;
  endDate: number;
  maxLevel: number;
  xpPerLevel: number;
  premiumPrice: number;
  diamondPrice: number;
  timeRemaining: number;
}

export interface BattlePassProgress {
  currentLevel: number;
  currentXP: number;
  xpToNextLevel: number;
  tier: BattlePassTier;
  isPremium: boolean;
  isDiamond: boolean;
  purchasedAt: number | null;
}

export interface BattlePassReward {
  id: string;
  level: number;
  tier: BattlePassTier;
  type: RewardType;
  itemId: string | null;
  amount: number;
  claimed: boolean;
  unlocked: boolean;
  canClaim: boolean;
}

export interface BattlePassData {
  season: BattlePassSeason;
  progress: BattlePassProgress;
  rewards: BattlePassReward[];
}

export interface ClaimResult {
  success: boolean;
  reward?: {
    type: RewardType;
    itemId: string | null;
    amount: number;
  };
  error?: string;
}

export interface PurchaseResult {
  success: boolean;
  tier?: BattlePassTier;
  pricePaid?: number;
  message?: string;
  error?: string;
}

export interface AddXPResult {
  success: boolean;
  xpAdded: number;
  currentLevel: number;
  currentXP: number;
  levelsGained: number;
  error?: string;
}

class BattlePassService {
  private data: BattlePassData | null = null;
  private listeners: Set<(data: BattlePassData) => void> = new Set();

  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Subscribe to battle pass updates
   */
  subscribe(listener: (data: BattlePassData) => void): () => void {
    this.listeners.add(listener);
    if (this.data) {
      listener(this.data);
    }
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    if (this.data) {
      this.listeners.forEach(listener => listener(this.data!));
    }
  }

  /**
   * Get current battle pass data (cached)
   */
  getData(): BattlePassData | null {
    return this.data;
  }

  /**
   * Fetch battle pass data from server
   */
  async fetchData(): Promise<BattlePassData | null> {
    try {
      const response = await fetch(`${SERVER_URL}/api/battlepass/current`, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        console.error('Failed to fetch battle pass data');
        return null;
      }

      const data = await response.json();
      this.data = data;
      this.notifyListeners();
      return this.data;
    } catch (error) {
      console.error('Error fetching battle pass:', error);
      return null;
    }
  }

  /**
   * Claim a reward
   */
  async claimReward(rewardId: string): Promise<ClaimResult> {
    try {
      const response = await fetch(`${SERVER_URL}/api/battlepass/claim`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ rewardId }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error };
      }

      // Refresh data after claiming
      await this.fetchData();

      return {
        success: true,
        reward: data.reward,
      };
    } catch (error) {
      console.error('Error claiming reward:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Claim all available rewards
   */
  async claimAllRewards(): Promise<{ claimed: number; rewards: ClaimResult[] }> {
    if (!this.data) {
      await this.fetchData();
    }

    if (!this.data) {
      return { claimed: 0, rewards: [] };
    }

    const claimableRewards = this.data.rewards.filter(r => r.canClaim);
    const results: ClaimResult[] = [];

    for (const reward of claimableRewards) {
      const result = await this.claimReward(reward.id);
      results.push(result);
    }

    return {
      claimed: results.filter(r => r.success).length,
      rewards: results,
    };
  }

  /**
   * Purchase premium or diamond tier
   */
  async purchaseTier(tier: 'premium' | 'diamond'): Promise<PurchaseResult> {
    try {
      const response = await fetch(`${SERVER_URL}/api/battlepass/purchase`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ tier }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error };
      }

      // Refresh data after purchase
      await this.fetchData();

      return {
        success: true,
        tier: data.tier,
        pricePaid: data.pricePaid,
        message: data.message,
      };
    } catch (error) {
      console.error('Error purchasing tier:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Add XP to battle pass
   */
  async addXP(amount: number, source?: string): Promise<AddXPResult> {
    try {
      const response = await fetch(`${SERVER_URL}/api/battlepass/add-xp`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ amount, source }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          xpAdded: 0,
          currentLevel: this.data?.progress.currentLevel ?? 1,
          currentXP: this.data?.progress.currentXP ?? 0,
          levelsGained: 0,
          error: data.error,
        };
      }

      // Update local data
      if (this.data) {
        this.data.progress.currentLevel = data.currentLevel;
        this.data.progress.currentXP = data.currentXP;
        this.data.progress.xpToNextLevel = this.data.season.xpPerLevel - data.currentXP;

        // Update reward unlock status
        this.data.rewards = this.data.rewards.map(r => ({
          ...r,
          unlocked: r.level <= data.currentLevel,
          canClaim: r.level <= data.currentLevel && !r.claimed &&
                    (r.tier === 'free' ||
                     (r.tier === 'premium' && this.data!.progress.isPremium) ||
                     (r.tier === 'diamond' && this.data!.progress.isDiamond)),
        }));

        this.notifyListeners();
      }

      return {
        success: true,
        xpAdded: data.xpAdded,
        currentLevel: data.currentLevel,
        currentXP: data.currentXP,
        levelsGained: data.levelsGained,
      };
    } catch (error) {
      console.error('Error adding XP:', error);
      return {
        success: false,
        xpAdded: 0,
        currentLevel: 1,
        currentXP: 0,
        levelsGained: 0,
        error: 'Network error',
      };
    }
  }

  /**
   * Get rewards for a specific level
   */
  getRewardsForLevel(level: number): BattlePassReward[] {
    if (!this.data) return [];
    return this.data.rewards.filter(r => r.level === level);
  }

  /**
   * Get all unclaimed rewards
   */
  getUnclaimedRewards(): BattlePassReward[] {
    if (!this.data) return [];
    return this.data.rewards.filter(r => r.canClaim);
  }

  /**
   * Get progress percentage
   */
  getProgressPercentage(): number {
    if (!this.data) return 0;
    return (this.data.progress.currentXP / this.data.season.xpPerLevel) * 100;
  }

  /**
   * Get total progress percentage through the season
   */
  getTotalProgressPercentage(): number {
    if (!this.data) return 0;
    const totalXPForSeason = this.data.season.maxLevel * this.data.season.xpPerLevel;
    const currentTotalXP = (this.data.progress.currentLevel - 1) * this.data.season.xpPerLevel + this.data.progress.currentXP;
    return (currentTotalXP / totalXPForSeason) * 100;
  }

  /**
   * Format time remaining
   */
  formatTimeRemaining(): string {
    if (!this.data) return '';

    const seconds = this.data.season.timeRemaining;
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);

    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Check if season is ending soon (less than 7 days)
   */
  isEndingSoon(): boolean {
    if (!this.data) return false;
    return this.data.season.timeRemaining < 7 * 24 * 60 * 60;
  }

  /**
   * Get tier display name
   */
  getTierDisplayName(tier: BattlePassTier): string {
    switch (tier) {
      case 'free': return 'Free';
      case 'premium': return 'Premium';
      case 'diamond': return 'Diamond';
    }
  }

  /**
   * Get tier color
   */
  getTierColor(tier: BattlePassTier): number {
    switch (tier) {
      case 'free': return 0x888888;     // Gray
      case 'premium': return 0xffd700;  // Gold
      case 'diamond': return 0x00f5ff;  // Cyan
    }
  }

  /**
   * Get reward type icon
   */
  getRewardIcon(type: RewardType): string {
    switch (type) {
      case 'gems': return '💎';
      case 'coins': return '🪙';
      case 'crystals': return '✨';
      case 'skin': return '🎨';
      case 'title': return '🏷️';
      case 'avatar_frame': return '🖼️';
      case 'emote': return '😊';
      default: return '🎁';
    }
  }

  /**
   * Clear cached data (on logout)
   */
  clear(): void {
    this.data = null;
    this.listeners.clear();
  }
}

export const battlePassService = new BattlePassService();
