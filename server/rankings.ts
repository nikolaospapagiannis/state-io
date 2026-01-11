import { Router, Response } from 'express';
import { db } from './database';
import { AuthRequest } from './auth';

const router = Router();

// ============ TYPES ============

export type Division =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'master'
  | 'grandmaster'
  | 'legend'
  | 'mythic';

export type Subdivision = 'V' | 'IV' | 'III' | 'II' | 'I';

export interface RankInfo {
  division: Division;
  subdivision: Subdivision;
  lp: number;
  displayName: string;
  color: string;
  icon: string;
  minElo: number;
  maxElo: number;
}

export interface PlayerRanking {
  playerId: string;
  division: Division;
  subdivision: Subdivision;
  lp: number;
  peakDivision: Division;
  peakSubdivision: Subdivision;
  gamesPlayed: number;
  gamesWon: number;
  lastGame: number;
  promotionSeries: PromotionSeries | null;
  placementGames: number;
  placementWins: number;
  isInPlacement: boolean;
  decayWarning: boolean;
}

export interface PromotionSeries {
  targetDivision: Division;
  targetSubdivision: Subdivision;
  wins: number;
  losses: number;
  gamesNeeded: number;
}

export interface RankChange {
  oldDivision: Division;
  oldSubdivision: Subdivision;
  oldLp: number;
  newDivision: Division;
  newSubdivision: Subdivision;
  newLp: number;
  lpChange: number;
  promoted: boolean;
  demoted: boolean;
  seriesStarted: boolean;
  seriesWon: boolean;
  seriesLost: boolean;
}

// ============ RANK CONFIGURATION ============

export const DIVISIONS: {
  id: Division;
  name: string;
  color: string;
  icon: string;
  eloBase: number;
  eloPerSubdiv: number;
  hasSubdivisions: boolean;
}[] = [
  { id: 'bronze', name: 'Bronze', color: '#cd7f32', icon: 'medal_bronze', eloBase: 0, eloPerSubdiv: 100, hasSubdivisions: true },
  { id: 'silver', name: 'Silver', color: '#c0c0c0', icon: 'medal_silver', eloBase: 500, eloPerSubdiv: 100, hasSubdivisions: true },
  { id: 'gold', name: 'Gold', color: '#ffd700', icon: 'medal_gold', eloBase: 1000, eloPerSubdiv: 100, hasSubdivisions: true },
  { id: 'platinum', name: 'Platinum', color: '#00f5ff', icon: 'medal_platinum', eloBase: 1500, eloPerSubdiv: 100, hasSubdivisions: true },
  { id: 'diamond', name: 'Diamond', color: '#b9f2ff', icon: 'diamond', eloBase: 2000, eloPerSubdiv: 100, hasSubdivisions: true },
  { id: 'master', name: 'Master', color: '#aa44ff', icon: 'crown', eloBase: 2500, eloPerSubdiv: 100, hasSubdivisions: true },
  { id: 'grandmaster', name: 'Grandmaster', color: '#ff4444', icon: 'crown_gold', eloBase: 3000, eloPerSubdiv: 100, hasSubdivisions: true },
  { id: 'legend', name: 'Legend', color: '#ff00ff', icon: 'star_legend', eloBase: 3500, eloPerSubdiv: 100, hasSubdivisions: true },
  { id: 'mythic', name: 'Mythic', color: '#ffaa00', icon: 'mythic', eloBase: 4000, eloPerSubdiv: 200, hasSubdivisions: true },
];

export const SUBDIVISIONS: Subdivision[] = ['V', 'IV', 'III', 'II', 'I'];

const RANK_DECAY_DAYS = 14;
const PLACEMENT_GAMES = 10;
const LP_PER_WIN_BASE = 25;
const LP_PER_LOSS_BASE = 20;
const PROMO_WINS_NEEDED_SUBDIV = 2; // Best of 3
const PROMO_WINS_NEEDED_DIV = 3; // Best of 5

// ============ DATABASE INITIALIZATION ============

export function initRankingTables(): void {
  // Player rankings
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_rankings (
      player_id TEXT PRIMARY KEY,
      division TEXT DEFAULT 'bronze',
      subdivision TEXT DEFAULT 'V',
      lp INTEGER DEFAULT 0,
      peak_division TEXT DEFAULT 'bronze',
      peak_subdivision TEXT DEFAULT 'V',
      games_played INTEGER DEFAULT 0,
      games_won INTEGER DEFAULT 0,
      last_game INTEGER,
      promotion_series TEXT,
      placement_games INTEGER DEFAULT 0,
      placement_wins INTEGER DEFAULT 0,
      season_id INTEGER DEFAULT 1,
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Rank history for end-of-season tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS rank_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      season_id INTEGER NOT NULL,
      final_division TEXT NOT NULL,
      final_subdivision TEXT NOT NULL,
      final_lp INTEGER NOT NULL,
      peak_division TEXT NOT NULL,
      peak_subdivision TEXT NOT NULL,
      games_played INTEGER DEFAULT 0,
      games_won INTEGER DEFAULT 0,
      rewards_claimed INTEGER DEFAULT 0,
      recorded_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(player_id, season_id),
      FOREIGN KEY (player_id) REFERENCES users(id)
    )
  `);

  // Create indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rankings_division ON player_rankings(division, subdivision, lp DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rank_history_season ON rank_history(season_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rank_history_player ON rank_history(player_id)`);

  console.log('Ranking tables initialized');
}

// Initialize tables immediately
initRankingTables();

// ============ QUERIES ============

export const rankingQueries = {
  getPlayerRanking: db.prepare(`SELECT * FROM player_rankings WHERE player_id = ?`),

  upsertRanking: db.prepare(`
    INSERT INTO player_rankings (player_id, division, subdivision, lp, peak_division, peak_subdivision, games_played, games_won, last_game, promotion_series, placement_games, placement_wins, season_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      division = ?,
      subdivision = ?,
      lp = ?,
      peak_division = ?,
      peak_subdivision = ?,
      games_played = ?,
      games_won = ?,
      last_game = ?,
      promotion_series = ?,
      placement_games = ?,
      placement_wins = ?,
      season_id = ?
  `),

  getLeaderboard: db.prepare(`
    SELECT pr.*, u.username, u.avatar
    FROM player_rankings pr
    JOIN users u ON pr.player_id = u.id
    WHERE pr.placement_games >= ?
    ORDER BY
      CASE pr.division
        WHEN 'mythic' THEN 9
        WHEN 'legend' THEN 8
        WHEN 'grandmaster' THEN 7
        WHEN 'master' THEN 6
        WHEN 'diamond' THEN 5
        WHEN 'platinum' THEN 4
        WHEN 'gold' THEN 3
        WHEN 'silver' THEN 2
        WHEN 'bronze' THEN 1
        ELSE 0
      END DESC,
      CASE pr.subdivision
        WHEN 'I' THEN 5
        WHEN 'II' THEN 4
        WHEN 'III' THEN 3
        WHEN 'IV' THEN 2
        WHEN 'V' THEN 1
        ELSE 0
      END DESC,
      pr.lp DESC
    LIMIT ?
    OFFSET ?
  `),

  getPlayerRank: db.prepare(`
    SELECT COUNT(*) + 1 as rank
    FROM player_rankings
    WHERE placement_games >= ?
    AND (
      CASE division
        WHEN 'mythic' THEN 9 WHEN 'legend' THEN 8 WHEN 'grandmaster' THEN 7
        WHEN 'master' THEN 6 WHEN 'diamond' THEN 5 WHEN 'platinum' THEN 4
        WHEN 'gold' THEN 3 WHEN 'silver' THEN 2 WHEN 'bronze' THEN 1
        ELSE 0
      END > CASE (SELECT division FROM player_rankings WHERE player_id = ?)
        WHEN 'mythic' THEN 9 WHEN 'legend' THEN 8 WHEN 'grandmaster' THEN 7
        WHEN 'master' THEN 6 WHEN 'diamond' THEN 5 WHEN 'platinum' THEN 4
        WHEN 'gold' THEN 3 WHEN 'silver' THEN 2 WHEN 'bronze' THEN 1
        ELSE 0
      END
      OR (
        division = (SELECT division FROM player_rankings WHERE player_id = ?)
        AND (
          CASE subdivision
            WHEN 'I' THEN 5 WHEN 'II' THEN 4 WHEN 'III' THEN 3
            WHEN 'IV' THEN 2 WHEN 'V' THEN 1
            ELSE 0
          END > CASE (SELECT subdivision FROM player_rankings WHERE player_id = ?)
            WHEN 'I' THEN 5 WHEN 'II' THEN 4 WHEN 'III' THEN 3
            WHEN 'IV' THEN 2 WHEN 'V' THEN 1
            ELSE 0
          END
          OR (
            subdivision = (SELECT subdivision FROM player_rankings WHERE player_id = ?)
            AND lp > (SELECT lp FROM player_rankings WHERE player_id = ?)
          )
        )
      )
    )
  `),

  getDecayingPlayers: db.prepare(`
    SELECT player_id, division, subdivision, lp, last_game
    FROM player_rankings
    WHERE last_game < ?
    AND division IN ('diamond', 'master', 'grandmaster', 'legend', 'mythic')
    AND placement_games >= ?
  `),

  saveRankHistory: db.prepare(`
    INSERT OR REPLACE INTO rank_history (player_id, season_id, final_division, final_subdivision, final_lp, peak_division, peak_subdivision, games_played, games_won)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getRankHistory: db.prepare(`
    SELECT * FROM rank_history
    WHERE player_id = ?
    ORDER BY season_id DESC
    LIMIT ?
  `),
};

// ============ HELPER FUNCTIONS ============

export function getDivisionIndex(division: Division): number {
  return DIVISIONS.findIndex(d => d.id === division);
}

export function getSubdivisionIndex(subdivision: Subdivision): number {
  return SUBDIVISIONS.indexOf(subdivision);
}

export function getRankFromElo(elo: number): { division: Division; subdivision: Subdivision; lp: number } {
  // Find the division
  let divisionIndex = 0;
  for (let i = DIVISIONS.length - 1; i >= 0; i--) {
    if (elo >= DIVISIONS[i].eloBase) {
      divisionIndex = i;
      break;
    }
  }

  const division = DIVISIONS[divisionIndex];
  const eloInDivision = elo - division.eloBase;
  const subdivIndex = Math.min(4, Math.floor(eloInDivision / division.eloPerSubdiv));
  const lp = eloInDivision % division.eloPerSubdiv;

  return {
    division: division.id,
    subdivision: SUBDIVISIONS[4 - subdivIndex], // Reverse because V < IV < III < II < I
    lp,
  };
}

export function getEloFromRank(division: Division, subdivision: Subdivision, lp: number): number {
  const divisionConfig = DIVISIONS.find(d => d.id === division);
  if (!divisionConfig) return 0;

  const subdivIndex = 4 - getSubdivisionIndex(subdivision); // Reverse
  return divisionConfig.eloBase + (subdivIndex * divisionConfig.eloPerSubdiv) + lp;
}

export function getRankDisplayName(division: Division, subdivision: Subdivision): string {
  const divisionConfig = DIVISIONS.find(d => d.id === division);
  if (!divisionConfig) return 'Unknown';
  return `${divisionConfig.name} ${subdivision}`;
}

export function isHigherRank(
  div1: Division, sub1: Subdivision,
  div2: Division, sub2: Subdivision
): boolean {
  const divIdx1 = getDivisionIndex(div1);
  const divIdx2 = getDivisionIndex(div2);

  if (divIdx1 !== divIdx2) return divIdx1 > divIdx2;

  const subIdx1 = getSubdivisionIndex(sub1);
  const subIdx2 = getSubdivisionIndex(sub2);

  return subIdx1 < subIdx2; // Lower index = higher rank (I > II > III > IV > V)
}

// ============ RANK CHANGE LOGIC ============

export function calculateRankChange(
  playerId: string,
  won: boolean,
  opponentElo: number,
  currentSeason: number
): RankChange {
  // Get or create player ranking
  let ranking = rankingQueries.getPlayerRanking.get(playerId) as {
    player_id: string;
    division: Division;
    subdivision: Subdivision;
    lp: number;
    peak_division: Division;
    peak_subdivision: Subdivision;
    games_played: number;
    games_won: number;
    last_game: number;
    promotion_series: string | null;
    placement_games: number;
    placement_wins: number;
    season_id: number;
  } | undefined;

  const now = Math.floor(Date.now() / 1000);

  if (!ranking) {
    // Initialize new player
    ranking = {
      player_id: playerId,
      division: 'bronze',
      subdivision: 'V',
      lp: 0,
      peak_division: 'bronze',
      peak_subdivision: 'V',
      games_played: 0,
      games_won: 0,
      last_game: now,
      promotion_series: null,
      placement_games: 0,
      placement_wins: 0,
      season_id: currentSeason,
    };
  }

  const oldDivision = ranking.division;
  const oldSubdivision = ranking.subdivision;
  const oldLp = ranking.lp;

  let newDivision = ranking.division;
  let newSubdivision = ranking.subdivision;
  let newLp = ranking.lp;
  let lpChange = 0;
  let promoted = false;
  let demoted = false;
  let seriesStarted = false;
  let seriesWon = false;
  let seriesLost = false;

  // Handle placement games
  if (ranking.placement_games < PLACEMENT_GAMES) {
    ranking.placement_games++;
    if (won) ranking.placement_wins++;

    if (ranking.placement_games === PLACEMENT_GAMES) {
      // Calculate initial rank based on placement performance
      const winRate = ranking.placement_wins / PLACEMENT_GAMES;
      const baseElo = 1000; // Silver V
      const placementElo = baseElo + Math.round((winRate - 0.5) * 500);
      const initialRank = getRankFromElo(Math.max(0, placementElo));

      newDivision = initialRank.division;
      newSubdivision = initialRank.subdivision;
      newLp = initialRank.lp;
    }

    // Save and return early for placement games
    saveRanking(playerId, {
      division: newDivision,
      subdivision: newSubdivision,
      lp: newLp,
      peakDivision: ranking.peak_division,
      peakSubdivision: ranking.peak_subdivision,
      gamesPlayed: ranking.games_played + 1,
      gamesWon: ranking.games_won + (won ? 1 : 0),
      lastGame: now,
      promotionSeries: null,
      placementGames: ranking.placement_games,
      placementWins: ranking.placement_wins,
      seasonId: currentSeason,
    });

    return {
      oldDivision,
      oldSubdivision,
      oldLp,
      newDivision,
      newSubdivision,
      newLp,
      lpChange: 0,
      promoted: false,
      demoted: false,
      seriesStarted: false,
      seriesWon: false,
      seriesLost: false,
    };
  }

  // Parse promotion series if exists
  let promoSeries: PromotionSeries | null = null;
  if (ranking.promotion_series) {
    promoSeries = JSON.parse(ranking.promotion_series);
  }

  // Calculate LP change based on performance
  const currentElo = getEloFromRank(ranking.division, ranking.subdivision, ranking.lp);
  const eloDiff = opponentElo - currentElo;
  const expectedScore = 1 / (1 + Math.pow(10, eloDiff / 400));

  if (won) {
    // LP gained scales with opponent strength
    lpChange = Math.round(LP_PER_WIN_BASE * (1 + (eloDiff / 400)));
    lpChange = Math.max(10, Math.min(40, lpChange));
  } else {
    // LP lost scales inversely with opponent strength
    lpChange = -Math.round(LP_PER_LOSS_BASE * (1 - (eloDiff / 800)));
    lpChange = Math.min(-10, Math.max(-30, lpChange));
  }

  // Handle promotion series
  if (promoSeries) {
    if (won) {
      promoSeries.wins++;
      if (promoSeries.wins >= promoSeries.gamesNeeded) {
        // Series won - promote
        seriesWon = true;
        promoted = true;
        newDivision = promoSeries.targetDivision;
        newSubdivision = promoSeries.targetSubdivision;
        newLp = 0;
        promoSeries = null;
      }
    } else {
      promoSeries.losses++;
      const maxLosses = promoSeries.gamesNeeded === 3 ? 3 : 2;
      if (promoSeries.losses >= maxLosses) {
        // Series lost - reset to 75 LP
        seriesLost = true;
        newLp = 75;
        promoSeries = null;
      }
    }
  } else {
    // Normal LP change
    newLp = ranking.lp + lpChange;

    // Check for promotion
    if (newLp >= 100) {
      const nextRank = getNextRank(ranking.division, ranking.subdivision);
      if (nextRank) {
        // Start promotion series
        const isNewDivision = nextRank.division !== ranking.division;
        promoSeries = {
          targetDivision: nextRank.division,
          targetSubdivision: nextRank.subdivision,
          wins: 0,
          losses: 0,
          gamesNeeded: isNewDivision ? PROMO_WINS_NEEDED_DIV : PROMO_WINS_NEEDED_SUBDIV,
        };
        seriesStarted = true;
        newLp = 100; // Cap at 100 during series
      } else {
        // At max rank, just accumulate LP
        newLp = Math.min(999, newLp);
      }
    }

    // Check for demotion
    if (newLp < 0) {
      const prevRank = getPreviousRank(ranking.division, ranking.subdivision);
      if (prevRank) {
        // Demote
        demoted = true;
        newDivision = prevRank.division;
        newSubdivision = prevRank.subdivision;
        newLp = 75 + newLp; // Transfer negative LP
        newLp = Math.max(0, newLp);
      } else {
        // At minimum rank, cap at 0
        newLp = 0;
      }
    }
  }

  // Update peak rank if higher
  let peakDivision = ranking.peak_division;
  let peakSubdivision = ranking.peak_subdivision;

  if (isHigherRank(newDivision, newSubdivision, peakDivision, peakSubdivision)) {
    peakDivision = newDivision;
    peakSubdivision = newSubdivision;
  }

  // Save updated ranking
  saveRanking(playerId, {
    division: newDivision,
    subdivision: newSubdivision,
    lp: newLp,
    peakDivision,
    peakSubdivision,
    gamesPlayed: ranking.games_played + 1,
    gamesWon: ranking.games_won + (won ? 1 : 0),
    lastGame: now,
    promotionSeries: promoSeries,
    placementGames: ranking.placement_games,
    placementWins: ranking.placement_wins,
    seasonId: currentSeason,
  });

  return {
    oldDivision,
    oldSubdivision,
    oldLp,
    newDivision,
    newSubdivision,
    newLp,
    lpChange,
    promoted,
    demoted,
    seriesStarted,
    seriesWon,
    seriesLost,
  };
}

function getNextRank(division: Division, subdivision: Subdivision): { division: Division; subdivision: Subdivision } | null {
  const subIdx = getSubdivisionIndex(subdivision);
  const divIdx = getDivisionIndex(division);

  if (subIdx > 0) {
    // Move to next subdivision (IV -> III, etc.)
    return { division, subdivision: SUBDIVISIONS[subIdx - 1] };
  } else if (divIdx < DIVISIONS.length - 1) {
    // Move to next division
    return { division: DIVISIONS[divIdx + 1].id, subdivision: 'V' };
  }

  return null; // At max rank
}

function getPreviousRank(division: Division, subdivision: Subdivision): { division: Division; subdivision: Subdivision } | null {
  const subIdx = getSubdivisionIndex(subdivision);
  const divIdx = getDivisionIndex(division);

  if (subIdx < SUBDIVISIONS.length - 1) {
    // Move to previous subdivision (II -> III, etc.)
    return { division, subdivision: SUBDIVISIONS[subIdx + 1] };
  } else if (divIdx > 0) {
    // Move to previous division
    return { division: DIVISIONS[divIdx - 1].id, subdivision: 'I' };
  }

  return null; // At min rank
}

function saveRanking(playerId: string, data: {
  division: Division;
  subdivision: Subdivision;
  lp: number;
  peakDivision: Division;
  peakSubdivision: Subdivision;
  gamesPlayed: number;
  gamesWon: number;
  lastGame: number;
  promotionSeries: PromotionSeries | null;
  placementGames: number;
  placementWins: number;
  seasonId: number;
}): void {
  const promoSeriesJson = data.promotionSeries ? JSON.stringify(data.promotionSeries) : null;

  rankingQueries.upsertRanking.run(
    playerId,
    data.division, data.subdivision, data.lp,
    data.peakDivision, data.peakSubdivision,
    data.gamesPlayed, data.gamesWon, data.lastGame,
    promoSeriesJson, data.placementGames, data.placementWins, data.seasonId,
    // Update values
    data.division, data.subdivision, data.lp,
    data.peakDivision, data.peakSubdivision,
    data.gamesPlayed, data.gamesWon, data.lastGame,
    promoSeriesJson, data.placementGames, data.placementWins, data.seasonId
  );
}

// ============ RANK DECAY ============

export function processRankDecay(): number {
  const now = Math.floor(Date.now() / 1000);
  const decayThreshold = now - (RANK_DECAY_DAYS * 24 * 60 * 60);

  const decayingPlayers = rankingQueries.getDecayingPlayers.all(decayThreshold, PLACEMENT_GAMES) as Array<{
    player_id: string;
    division: Division;
    subdivision: Subdivision;
    lp: number;
    last_game: number;
  }>;

  let decayedCount = 0;

  for (const player of decayingPlayers) {
    // Calculate decay amount (10 LP per day after grace period)
    const daysInactive = Math.floor((now - player.last_game) / (24 * 60 * 60));
    const decayDays = daysInactive - RANK_DECAY_DAYS;
    const decayAmount = decayDays * 10;

    if (decayAmount > 0) {
      let newLp = player.lp - decayAmount;
      let newDivision = player.division;
      let newSubdivision = player.subdivision;

      // Handle demotion from decay
      while (newLp < 0) {
        const prevRank = getPreviousRank(newDivision, newSubdivision);
        if (prevRank && getDivisionIndex(prevRank.division) >= getDivisionIndex('diamond')) {
          // Can only decay within Diamond+
          newDivision = prevRank.division;
          newSubdivision = prevRank.subdivision;
          newLp = 75 + newLp;
        } else {
          // Hit Diamond V floor
          newLp = 0;
          break;
        }
      }

      // Get current ranking for other fields
      const current = rankingQueries.getPlayerRanking.get(player.player_id) as {
        peak_division: Division;
        peak_subdivision: Subdivision;
        games_played: number;
        games_won: number;
        placement_games: number;
        placement_wins: number;
        season_id: number;
      };

      if (current) {
        saveRanking(player.player_id, {
          division: newDivision,
          subdivision: newSubdivision,
          lp: newLp,
          peakDivision: current.peak_division,
          peakSubdivision: current.peak_subdivision,
          gamesPlayed: current.games_played,
          gamesWon: current.games_won,
          lastGame: player.last_game,
          promotionSeries: null, // Clear any series on decay
          placementGames: current.placement_games,
          placementWins: current.placement_wins,
          seasonId: current.season_id,
        });

        decayedCount++;
      }
    }
  }

  return decayedCount;
}

// ============ SEASON RESET ============

export function softResetForNewSeason(seasonId: number): number {
  // Get all players with rankings
  const players = db.prepare(`
    SELECT * FROM player_rankings WHERE placement_games >= ?
  `).all(PLACEMENT_GAMES) as Array<{
    player_id: string;
    division: Division;
    subdivision: Subdivision;
    lp: number;
    peak_division: Division;
    peak_subdivision: Subdivision;
    games_played: number;
    games_won: number;
  }>;

  let resetCount = 0;

  for (const player of players) {
    // Save current rank to history
    rankingQueries.saveRankHistory.run(
      player.player_id,
      seasonId - 1, // Previous season
      player.division,
      player.subdivision,
      player.lp,
      player.peak_division,
      player.peak_subdivision,
      player.games_played,
      player.games_won
    );

    // Soft reset formula: (current_elo + base_elo) / 2
    const currentElo = getEloFromRank(player.division, player.subdivision, player.lp);
    const baseElo = 1000; // Silver V
    const newElo = Math.round((currentElo + baseElo) / 2);
    const newRank = getRankFromElo(newElo);

    // Reset to new placement (need to play placement games again)
    saveRanking(player.player_id, {
      division: newRank.division,
      subdivision: newRank.subdivision,
      lp: newRank.lp,
      peakDivision: newRank.division,
      peakSubdivision: newRank.subdivision,
      gamesPlayed: 0,
      gamesWon: 0,
      lastGame: Math.floor(Date.now() / 1000),
      promotionSeries: null,
      placementGames: 0, // Reset placement games
      placementWins: 0,
      seasonId,
    });

    resetCount++;
  }

  return resetCount;
}

// ============ API ROUTES ============

// Get leaderboard
router.get('/leaderboard', (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const leaderboard = rankingQueries.getLeaderboard.all(PLACEMENT_GAMES, limit, offset) as Array<{
      player_id: string;
      division: Division;
      subdivision: Subdivision;
      lp: number;
      peak_division: Division;
      peak_subdivision: Subdivision;
      games_played: number;
      games_won: number;
      last_game: number;
      username: string;
      avatar: string;
    }>;

    res.json({
      leaderboard: leaderboard.map((player, index) => {
        const divisionConfig = DIVISIONS.find(d => d.id === player.division);
        return {
          rank: offset + index + 1,
          playerId: player.player_id,
          username: player.username,
          avatar: player.avatar,
          division: player.division,
          subdivision: player.subdivision,
          lp: player.lp,
          displayRank: getRankDisplayName(player.division, player.subdivision),
          color: divisionConfig?.color || '#ffffff',
          icon: divisionConfig?.icon || 'medal',
          peakDivision: player.peak_division,
          peakSubdivision: player.peak_subdivision,
          gamesPlayed: player.games_played,
          gamesWon: player.games_won,
          winRate: player.games_played > 0
            ? Math.round((player.games_won / player.games_played) * 100)
            : 0,
        };
      }),
      total: leaderboard.length,
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// Get player ranking
router.get('/:playerId', (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    const ranking = rankingQueries.getPlayerRanking.get(playerId) as {
      player_id: string;
      division: Division;
      subdivision: Subdivision;
      lp: number;
      peak_division: Division;
      peak_subdivision: Subdivision;
      games_played: number;
      games_won: number;
      last_game: number;
      promotion_series: string | null;
      placement_games: number;
      placement_wins: number;
      season_id: number;
    } | undefined;

    if (!ranking) {
      res.status(404).json({ error: 'Player ranking not found' });
      return;
    }

    const divisionConfig = DIVISIONS.find(d => d.id === ranking.division);
    const promoSeries = ranking.promotion_series ? JSON.parse(ranking.promotion_series) : null;

    // Calculate rank position
    const rankResult = rankingQueries.getPlayerRank.all(
      PLACEMENT_GAMES, playerId, playerId, playerId, playerId, playerId
    ) as { rank: number }[];

    const now = Math.floor(Date.now() / 1000);
    const daysSinceLastGame = Math.floor((now - ranking.last_game) / (24 * 60 * 60));
    const decayWarning = daysSinceLastGame >= RANK_DECAY_DAYS - 3 &&
      getDivisionIndex(ranking.division) >= getDivisionIndex('diamond');

    res.json({
      playerId: ranking.player_id,
      division: ranking.division,
      subdivision: ranking.subdivision,
      lp: ranking.lp,
      displayRank: getRankDisplayName(ranking.division, ranking.subdivision),
      color: divisionConfig?.color || '#ffffff',
      icon: divisionConfig?.icon || 'medal',
      peakDivision: ranking.peak_division,
      peakSubdivision: ranking.peak_subdivision,
      peakDisplayRank: getRankDisplayName(ranking.peak_division, ranking.peak_subdivision),
      gamesPlayed: ranking.games_played,
      gamesWon: ranking.games_won,
      winRate: ranking.games_played > 0
        ? Math.round((ranking.games_won / ranking.games_played) * 100)
        : 0,
      lastGame: ranking.last_game,
      promotionSeries: promoSeries,
      placementGames: ranking.placement_games,
      placementWins: ranking.placement_wins,
      isInPlacement: ranking.placement_games < PLACEMENT_GAMES,
      placementProgress: `${ranking.placement_games}/${PLACEMENT_GAMES}`,
      leaderboardRank: rankResult[0]?.rank || 0,
      decayWarning,
      daysSinceLastGame,
      seasonId: ranking.season_id,
    });
  } catch (error) {
    console.error('Get player ranking error:', error);
    res.status(500).json({ error: 'Failed to get player ranking' });
  }
});

// Get rank history
router.get('/:playerId/history', (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const limit = Math.min(20, parseInt(req.query.limit as string) || 10);

    const history = rankingQueries.getRankHistory.all(playerId, limit) as Array<{
      id: number;
      player_id: string;
      season_id: number;
      final_division: Division;
      final_subdivision: Subdivision;
      final_lp: number;
      peak_division: Division;
      peak_subdivision: Subdivision;
      games_played: number;
      games_won: number;
      rewards_claimed: number;
      recorded_at: number;
    }>;

    res.json({
      history: history.map(h => ({
        seasonId: h.season_id,
        finalRank: getRankDisplayName(h.final_division, h.final_subdivision),
        finalDivision: h.final_division,
        finalSubdivision: h.final_subdivision,
        finalLp: h.final_lp,
        peakRank: getRankDisplayName(h.peak_division, h.peak_subdivision),
        peakDivision: h.peak_division,
        peakSubdivision: h.peak_subdivision,
        gamesPlayed: h.games_played,
        gamesWon: h.games_won,
        winRate: h.games_played > 0 ? Math.round((h.games_won / h.games_played) * 100) : 0,
        rewardsClaimed: h.rewards_claimed === 1,
        recordedAt: h.recorded_at,
      })),
    });
  } catch (error) {
    console.error('Get rank history error:', error);
    res.status(500).json({ error: 'Failed to get rank history' });
  }
});

// Get all divisions info
router.get('/info/divisions', (_req: AuthRequest, res: Response) => {
  res.json({
    divisions: DIVISIONS.map(d => ({
      id: d.id,
      name: d.name,
      color: d.color,
      icon: d.icon,
      subdivisions: SUBDIVISIONS,
    })),
    placementGamesRequired: PLACEMENT_GAMES,
    rankDecayDays: RANK_DECAY_DAYS,
    lpPerWin: LP_PER_WIN_BASE,
    lpPerLoss: LP_PER_LOSS_BASE,
  });
});

export { router as rankingRouter };
