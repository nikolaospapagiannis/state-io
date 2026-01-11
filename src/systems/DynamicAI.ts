/**
 * Dynamic AI System with DDA Integration
 *
 * This module extends the base AI controller with dynamic difficulty adjustments
 * based on player skill level, engagement, and real-time performance.
 */

import { Territory } from '../entities/Territory';
import { DIFFICULTY_SETTINGS, GAME_SETTINGS, LevelConfig } from '../config/GameConfig';

// ============ Types ============

export interface DifficultySettings {
  aiReactionTimeMultiplier: number;
  aiAggressionMultiplier: number;
  aiEfficiencyMultiplier: number;
  aiCoordinationMultiplier: number;
  targetWinRate: number;
  frustrationRecoveryActive: boolean;
  consecutiveLosses: number;
  consecutiveWins: number;
}

export interface AIDecision {
  source: Territory;
  target: Territory;
  troopCount: number;
}

export interface PerformanceTracker {
  playerTerritoryControlPeak: number;
  playerTerritoryControlHistory: number[];
  playerReactionTimes: number[];
  strategicMoves: number;
  matchStartTime: number;
}

// Default difficulty settings
const DEFAULT_DIFFICULTY: DifficultySettings = {
  aiReactionTimeMultiplier: 1.0,
  aiAggressionMultiplier: 1.0,
  aiEfficiencyMultiplier: 1.0,
  aiCoordinationMultiplier: 1.0,
  targetWinRate: 0.55,
  frustrationRecoveryActive: false,
  consecutiveLosses: 0,
  consecutiveWins: 0,
};

/**
 * Dynamic AI Controller with personalized difficulty
 */
export class DynamicAI {
  private aiId: number;
  private difficulty: 'easy' | 'medium' | 'hard' | 'extreme';
  private thinkTimer = 0;
  private baseSettings: typeof DIFFICULTY_SETTINGS.easy;
  private ddaSettings: DifficultySettings;

  // Real-time adjustment factors
  private adaptiveAggressionFactor = 1.0;
  private adaptiveEfficiencyFactor = 1.0;
  private lastPlayerTerritoryControl = 0;
  private playerIsWinning = false;
  private turnsWithoutAction = 0;

  constructor(
    aiId: number,
    levelConfig: LevelConfig,
    ddaSettings?: DifficultySettings
  ) {
    this.aiId = aiId;
    this.difficulty = levelConfig.difficulty;
    this.baseSettings = DIFFICULTY_SETTINGS[this.difficulty];
    this.ddaSettings = ddaSettings || DEFAULT_DIFFICULTY;

    // Randomize initial think time
    this.thinkTimer = Math.random() * GAME_SETTINGS.AI_THINK_INTERVAL;
  }

  /**
   * Updates DDA settings (e.g., from server)
   */
  public updateDDASettings(settings: DifficultySettings): void {
    this.ddaSettings = settings;

    // Apply frustration recovery immediately if active
    if (settings.frustrationRecoveryActive) {
      this.adaptiveAggressionFactor = 0.6;
      this.adaptiveEfficiencyFactor = 0.7;
    }
  }

  /**
   * Main update loop - returns AI decision or null
   */
  public update(
    delta: number,
    territories: Territory[],
    playerTerritoryControl?: number
  ): AIDecision | null {
    // Track player performance for real-time adjustments
    if (playerTerritoryControl !== undefined) {
      this.adaptToPlayerPerformance(playerTerritoryControl, territories);
    }

    // Calculate effective think interval with DDA
    const baseThinkInterval = GAME_SETTINGS.AI_THINK_INTERVAL * this.baseSettings.aiThinkMultiplier;
    const ddaThinkMultiplier = this.ddaSettings.aiReactionTimeMultiplier;
    const effectiveThinkInterval = baseThinkInterval * ddaThinkMultiplier;

    this.thinkTimer += delta;

    if (this.thinkTimer < effectiveThinkInterval) {
      return null;
    }

    this.thinkTimer = 0;

    // Get territories owned by this AI
    const myTerritories = territories.filter((t) => t.owner === this.aiId);
    if (myTerritories.length === 0) {
      return null; // AI is eliminated
    }

    // Calculate effective attack chance with DDA
    const baseAttackChance = this.baseSettings.aiAttackChance;
    const ddaAggressionMultiplier = this.ddaSettings.aiAggressionMultiplier;
    const effectiveAttackChance = baseAttackChance * ddaAggressionMultiplier * this.adaptiveAggressionFactor;

    // Decide whether to attack
    if (Math.random() > effectiveAttackChance) {
      this.turnsWithoutAction++;

      // Force action if AI has been passive too long
      if (this.turnsWithoutAction < 5) {
        return null;
      }
    }

    this.turnsWithoutAction = 0;

    // Choose best move with DDA-influenced decision making
    return this.decideBestMove(myTerritories, territories);
  }

  /**
   * Adapts AI behavior based on real-time player performance
   */
  private adaptToPlayerPerformance(playerControl: number, _territories: Territory[]): void {
    // Track control delta for future adaptive learning
    this.lastPlayerTerritoryControl = playerControl;

    // Determine if player is winning
    this.playerIsWinning = playerControl > 0.5;

    // Real-time difficulty adjustment based on game state
    if (this.playerIsWinning) {
      // Player is winning - AI should try harder (unless in recovery mode)
      if (!this.ddaSettings.frustrationRecoveryActive) {
        // Gradually increase AI effectiveness
        this.adaptiveAggressionFactor = Math.min(1.3, this.adaptiveAggressionFactor + 0.02);
        this.adaptiveEfficiencyFactor = Math.min(1.2, this.adaptiveEfficiencyFactor + 0.01);
      }
    } else if (playerControl < 0.3) {
      // Player is struggling - ease up
      this.adaptiveAggressionFactor = Math.max(0.5, this.adaptiveAggressionFactor - 0.05);
      this.adaptiveEfficiencyFactor = Math.max(0.6, this.adaptiveEfficiencyFactor - 0.03);
    } else {
      // Balanced state - normalize factors
      this.adaptiveAggressionFactor = this.adaptiveAggressionFactor * 0.95 + 1.0 * 0.05;
      this.adaptiveEfficiencyFactor = this.adaptiveEfficiencyFactor * 0.95 + 1.0 * 0.05;
    }
  }

  /**
   * Decides the best move considering DDA settings
   */
  private decideBestMove(
    myTerritories: Territory[],
    allTerritories: Territory[]
  ): AIDecision | null {
    const possibleMoves: AIDecision[] = [];
    const effectiveEfficiency = this.ddaSettings.aiEfficiencyMultiplier * this.adaptiveEfficiencyFactor;
    const effectiveCoordination = this.ddaSettings.aiCoordinationMultiplier;

    myTerritories.forEach((source) => {
      if (source.troops <= 2) return;

      // Find potential targets
      const targets = allTerritories.filter((t) => t.owner !== this.aiId);

      targets.forEach((target) => {
        const distance = this.getDistance(source, target);
        const score = this.evaluateMove(
          source,
          target,
          distance,
          allTerritories,
          effectiveEfficiency,
          effectiveCoordination
        );

        if (score > 0) {
          const troopCount = this.calculateTroopCount(source, target, effectiveEfficiency);
          possibleMoves.push({
            source,
            target,
            troopCount,
          });
        }
      });
    });

    if (possibleMoves.length === 0) {
      return null;
    }

    // Sort by score
    possibleMoves.sort((a, b) => {
      const scoreA = this.evaluateMove(
        a.source,
        a.target,
        this.getDistance(a.source, a.target),
        allTerritories,
        effectiveEfficiency,
        effectiveCoordination
      );
      const scoreB = this.evaluateMove(
        b.source,
        b.target,
        this.getDistance(b.source, b.target),
        allTerritories,
        effectiveEfficiency,
        effectiveCoordination
      );
      return scoreB - scoreA;
    });

    // DDA: Less optimal decisions for easier difficulty
    const optimalityFactor = effectiveEfficiency * effectiveCoordination;

    if (optimalityFactor < 0.7) {
      // Low skill AI: Pick from top 5 randomly
      const topMoves = possibleMoves.slice(0, 5);
      return topMoves[Math.floor(Math.random() * topMoves.length)];
    } else if (optimalityFactor < 0.9) {
      // Medium skill AI: Pick from top 3
      const topMoves = possibleMoves.slice(0, 3);
      return topMoves[Math.floor(Math.random() * topMoves.length)];
    } else {
      // High skill AI: Usually pick the best, sometimes second best
      if (Math.random() < 0.8) {
        return possibleMoves[0];
      } else {
        return possibleMoves[Math.min(1, possibleMoves.length - 1)];
      }
    }
  }

  /**
   * Evaluates a potential move with DDA factors
   */
  private evaluateMove(
    source: Territory,
    target: Territory,
    distance: number,
    allTerritories: Territory[],
    efficiencyFactor: number,
    coordinationFactor: number
  ): number {
    let score = 0;

    const troopsToSend = source.troops - 1;
    const canCapture = troopsToSend > target.troops;

    // Base capture scoring
    if (canCapture) {
      score += 100 * efficiencyFactor;
      score += (troopsToSend - target.troops) * 2 * efficiencyFactor;
    } else if (troopsToSend > target.troops * 0.7) {
      score += 30 * (2 - efficiencyFactor); // Less efficient AI takes more risks
    }

    // Neutral territory preference
    if (target.owner === -1) {
      score += 50;
    }

    // Distance penalty
    const maxDistance = 500;
    const distanceScore = Math.max(0, (maxDistance - distance) / maxDistance * 30);
    score += distanceScore;

    // Territory size value
    score += target.territorySize * 0.3;

    // Defense consideration (modified by efficiency)
    const remainingTroops = 1;
    const nearbyThreats = allTerritories.filter((t) =>
      t.owner !== this.aiId &&
      t.owner !== -1 &&
      this.getDistance(source, t) < 200
    );

    if (nearbyThreats.length > 0) {
      const totalThreat = nearbyThreats.reduce((sum, t) => sum + t.troops, 0);
      const defenseWeight = this.baseSettings.aiDefenseWeight * efficiencyFactor;
      if (remainingTroops < totalThreat * defenseWeight) {
        score -= 50 * efficiencyFactor;
      }
    }

    // Coordination bonus: Attack territories adjacent to other AI-owned territories
    const adjacentOwned = allTerritories.filter((t) =>
      t.owner === this.aiId &&
      t !== source &&
      this.getDistance(target, t) < 150
    );
    score += adjacentOwned.length * 10 * coordinationFactor;

    // Strategic value: territories near neutrals
    const adjacentNeutrals = allTerritories.filter((t) =>
      t.owner === -1 &&
      this.getDistance(target, t) < 150
    );
    score += adjacentNeutrals.length * 10 * coordinationFactor;

    // Player territory targeting (with DDA moderation)
    if (target.owner === 0) {
      // Targeting player - moderated by DDA
      if (this.ddaSettings.frustrationRecoveryActive) {
        score -= 20; // Avoid player during recovery
      } else if (this.playerIsWinning) {
        score += 15 * this.adaptiveAggressionFactor; // Target winning player
      }
    }

    return score;
  }

  /**
   * Calculates troop count to send with DDA factors
   */
  private calculateTroopCount(
    source: Territory,
    target: Territory,
    efficiencyFactor: number
  ): number {
    const available = source.troops - 1;

    // Efficient AI sends optimal amounts; inefficient AI may over/under-commit
    if (efficiencyFactor > 1.1) {
      // Highly efficient: Calculate precisely
      if (available > target.troops + 5) {
        return Math.max(1, Math.floor(available * 0.8));
      } else if (available > target.troops) {
        return available;
      } else {
        return available;
      }
    } else if (efficiencyFactor < 0.8) {
      // Inefficient: Sometimes makes suboptimal choices
      const variance = 0.5 + Math.random() * 0.5;
      return Math.max(1, Math.floor(available * variance));
    } else {
      // Normal efficiency
      if (available > target.troops + 5) {
        return Math.max(1, Math.floor(available * 0.8));
      } else {
        return available;
      }
    }
  }

  /**
   * Gets distance between two territories
   */
  private getDistance(a: Territory, b: Territory): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Gets the AI's ID
   */
  public getId(): number {
    return this.aiId;
  }

  /**
   * Gets troop generation multiplier (affected by DDA)
   */
  public applyDifficultyMultiplier(): number {
    const baseMult = this.baseSettings.troopGenMultiplier;
    const ddaMult = this.ddaSettings.aiEfficiencyMultiplier;

    // In recovery mode, AI generates troops slower
    if (this.ddaSettings.frustrationRecoveryActive) {
      return baseMult * 0.7;
    }

    return baseMult * ddaMult * this.adaptiveEfficiencyFactor;
  }

  /**
   * Gets current DDA settings for debugging/UI
   */
  public getDDAInfo(): {
    reactionTime: number;
    aggression: number;
    efficiency: number;
    coordination: number;
    adaptiveAggression: number;
    adaptiveEfficiency: number;
    recoveryMode: boolean;
  } {
    return {
      reactionTime: this.ddaSettings.aiReactionTimeMultiplier,
      aggression: this.ddaSettings.aiAggressionMultiplier,
      efficiency: this.ddaSettings.aiEfficiencyMultiplier,
      coordination: this.ddaSettings.aiCoordinationMultiplier,
      adaptiveAggression: this.adaptiveAggressionFactor,
      adaptiveEfficiency: this.adaptiveEfficiencyFactor,
      recoveryMode: this.ddaSettings.frustrationRecoveryActive,
    };
  }
}

/**
 * Performance tracker for DDA feedback
 */
export class MatchPerformanceTracker {
  private startTime: number;
  private territoryControlHistory: number[] = [];
  private territoryControlPeak = 0;
  private reactionTimes: number[] = [];
  private strategicMoves = 0;
  private lastActionTime: number;

  constructor() {
    this.startTime = Date.now();
    this.lastActionTime = this.startTime;
  }

  /**
   * Records a territory control sample
   */
  public recordTerritoryControl(control: number): void {
    this.territoryControlHistory.push(control);
    if (control > this.territoryControlPeak) {
      this.territoryControlPeak = control;
    }
  }

  /**
   * Records a player action (for reaction time tracking)
   */
  public recordPlayerAction(): void {
    const now = Date.now();
    const reactionTime = now - this.lastActionTime;
    this.lastActionTime = now;

    // Only track reasonable reaction times (100ms - 10s)
    if (reactionTime >= 100 && reactionTime <= 10000) {
      this.reactionTimes.push(reactionTime);
    }
  }

  /**
   * Records a strategic move (multi-target, timed attack, etc.)
   */
  public recordStrategicMove(): void {
    this.strategicMoves++;
  }

  /**
   * Gets average reaction time
   */
  public getAverageReactionTime(): number {
    if (this.reactionTimes.length === 0) return 1000;
    return this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length;
  }

  /**
   * Checks if this was a near-win (had >60% control at some point but lost)
   */
  public wasNearWin(won: boolean): boolean {
    if (won) return false;
    return this.territoryControlPeak > 0.6;
  }

  /**
   * Calculates troop efficiency (how effectively troops were used)
   */
  public calculateTroopsEfficiency(
    totalTroopsSent: number,
    territoriesCaptured: number
  ): number {
    if (totalTroopsSent === 0) return 0.5;
    const efficiency = territoriesCaptured / (totalTroopsSent / 100);
    return Math.min(1, Math.max(0, efficiency));
  }

  /**
   * Gets final performance data for server submission
   */
  public getPerformanceData(
    won: boolean,
    finalTerritoryControl: number,
    totalTroopsSent: number,
    territoriesCaptured: number
  ): {
    territoryControlPeak: number;
    territoryControlFinal: number;
    troopsEfficiency: number;
    strategicMoves: number;
    reactionTimeAvg: number;
    wasNearWin: boolean;
    gameDuration: number;
  } {
    return {
      territoryControlPeak: this.territoryControlPeak,
      territoryControlFinal: finalTerritoryControl,
      troopsEfficiency: this.calculateTroopsEfficiency(totalTroopsSent, territoriesCaptured),
      strategicMoves: this.strategicMoves,
      reactionTimeAvg: this.getAverageReactionTime(),
      wasNearWin: this.wasNearWin(won),
      gameDuration: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }
}

/**
 * Fetches DDA settings from server
 */
export async function fetchDDASettings(
  playerId: string,
  serverUrl: string
): Promise<DifficultySettings | null> {
  try {
    const response = await fetch(`${serverUrl}/api/dda/difficulty/${playerId}`);
    if (!response.ok) return null;

    const data = await response.json();
    return data.settings as DifficultySettings;
  } catch (error) {
    console.warn('Failed to fetch DDA settings:', error);
    return null;
  }
}

/**
 * Submits match performance to server
 */
export async function submitMatchPerformance(
  matchId: string,
  performanceData: ReturnType<MatchPerformanceTracker['getPerformanceData']>,
  won: boolean,
  opponentAvgRating: number,
  serverUrl: string,
  token: string
): Promise<boolean> {
  try {
    const response = await fetch(`${serverUrl}/api/dda/record-match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        matchId,
        ...performanceData,
        won,
        opponentAvgRating,
      }),
    });

    return response.ok;
  } catch (error) {
    console.warn('Failed to submit match performance:', error);
    return false;
  }
}
