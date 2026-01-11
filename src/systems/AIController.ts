import { Territory } from '../entities/Territory';
import { DIFFICULTY_SETTINGS, GAME_SETTINGS, LevelConfig } from '../config/GameConfig';

export interface AIDecision {
  source: Territory;
  target: Territory;
  troopCount: number;
}

export class AIController {
  private aiId: number;
  private difficulty: 'easy' | 'medium' | 'hard' | 'extreme';
  private thinkTimer = 0;
  private settings: typeof DIFFICULTY_SETTINGS.easy;

  constructor(aiId: number, levelConfig: LevelConfig) {
    this.aiId = aiId;
    this.difficulty = levelConfig.difficulty;
    this.settings = DIFFICULTY_SETTINGS[this.difficulty];

    // Randomize initial think time
    this.thinkTimer = Math.random() * GAME_SETTINGS.AI_THINK_INTERVAL;
  }

  public update(delta: number, territories: Territory[]): AIDecision | null {
    this.thinkTimer += delta;

    const thinkInterval = GAME_SETTINGS.AI_THINK_INTERVAL * this.settings.aiThinkMultiplier;

    if (this.thinkTimer < thinkInterval) {
      return null;
    }

    this.thinkTimer = 0;

    // Get territories owned by this AI
    const myTerritories = territories.filter((t) => t.owner === this.aiId);
    if (myTerritories.length === 0) {
      return null; // AI is dead
    }

    // Decide whether to attack
    if (Math.random() > this.settings.aiAttackChance) {
      return null; // Skip this turn
    }

    // Choose best move
    return this.decideBestMove(myTerritories, territories);
  }

  private decideBestMove(myTerritories: Territory[], allTerritories: Territory[]): AIDecision | null {
    const possibleMoves: AIDecision[] = [];

    myTerritories.forEach((source) => {
      if (source.troops <= 2) return; // Need troops to attack

      // Find potential targets
      const targets = allTerritories.filter((t) => t.owner !== this.aiId);

      targets.forEach((target) => {
        const distance = this.getDistance(source, target);
        const score = this.evaluateMove(source, target, distance, allTerritories);

        if (score > 0) {
          const troopCount = this.calculateTroopCount(source, target);
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

    // Sort by score and pick best or random good one
    possibleMoves.sort((a, b) => {
      const scoreA = this.evaluateMove(a.source, a.target, this.getDistance(a.source, a.target), allTerritories);
      const scoreB = this.evaluateMove(b.source, b.target, this.getDistance(b.source, b.target), allTerritories);
      return scoreB - scoreA;
    });

    // Pick from top moves with some randomness
    const topMoves = possibleMoves.slice(0, 3);
    return topMoves[Math.floor(Math.random() * topMoves.length)];
  }

  private evaluateMove(source: Territory, target: Territory, distance: number, allTerritories: Territory[]): number {
    let score = 0;

    // Prefer targets we can capture
    const troopsToSend = source.troops - 1;
    const canCapture = troopsToSend > target.troops;

    if (canCapture) {
      score += 100;

      // Bonus for weak targets
      score += (troopsToSend - target.troops) * 2;
    } else if (troopsToSend > target.troops * 0.7) {
      // Might weaken significantly
      score += 30;
    }

    // Prefer neutral territories (easier to capture)
    if (target.owner === -1) {
      score += 50;
    }

    // Prefer closer territories
    const maxDistance = 500;
    const distanceScore = Math.max(0, (maxDistance - distance) / maxDistance * 30);
    score += distanceScore;

    // Consider territory size (larger = more valuable)
    score += target.territorySize * 0.3;

    // Defense consideration - don't attack if it would leave us weak
    const remainingTroops = 1;
    const nearbyThreats = allTerritories.filter((t) =>
      t.owner !== this.aiId &&
      t.owner !== -1 &&
      this.getDistance(source, t) < 200
    );

    if (nearbyThreats.length > 0) {
      const totalThreat = nearbyThreats.reduce((sum, t) => sum + t.troops, 0);
      if (remainingTroops < totalThreat * this.settings.aiDefenseWeight) {
        score -= 50;
      }
    }

    // Strategic value - territories surrounded by neutrals are good
    const adjacentNeutrals = allTerritories.filter((t) =>
      t.owner === -1 &&
      this.getDistance(target, t) < 150
    );
    score += adjacentNeutrals.length * 10;

    return score;
  }

  private calculateTroopCount(source: Territory, target: Territory): number {
    const available = source.troops - 1;

    // Always send enough to capture if possible
    if (available > target.troops + 5) {
      // Send most troops but leave some defense
      return Math.max(1, Math.floor(available * 0.8));
    } else if (available > target.troops) {
      // Send just enough to capture
      return available;
    } else {
      // Harassment attack - send all we can
      return available;
    }
  }

  private getDistance(a: Territory, b: Territory): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  public getId(): number {
    return this.aiId;
  }

  public applyDifficultyMultiplier(): number {
    return this.settings.troopGenMultiplier;
  }
}
