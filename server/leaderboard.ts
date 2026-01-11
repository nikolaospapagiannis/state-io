import { Router, Request, Response } from 'express';
import { userQueries, clanQueries, matchQueries } from './database';

const router = Router();

interface PlayerRow {
  id: string;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  avatar: string;
  title: string;
  clan_id: string | null;
}

interface ClanRow {
  id: string;
  name: string;
  tag: string;
  elo: number;
  wins: number;
  losses: number;
  icon: string;
  color: string;
  member_count: number;
}

interface MatchRow {
  id: string;
  mode: string;
  winner_team: number | null;
  duration: number | null;
  created_at: number;
  map_id: number | null;
}

// Get player leaderboard
router.get('/players', (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const players = userQueries.getTopPlayers.all(limit + offset) as PlayerRow[];
    const slicedPlayers = players.slice(offset);

    res.json({
      leaderboard: slicedPlayers.map((player, index) => ({
        rank: offset + index + 1,
        id: player.id,
        username: player.username,
        elo: player.elo,
        wins: player.wins,
        losses: player.losses,
        winRate: player.wins + player.losses > 0
          ? Math.round((player.wins / (player.wins + player.losses)) * 100)
          : 0,
        avatar: player.avatar,
        title: player.title,
        clanId: player.clan_id,
      })),
      total: players.length,
    });
  } catch (error) {
    console.error('Get player leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// Get clan leaderboard
router.get('/clans', (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const clans = clanQueries.getTopClans.all(limit) as ClanRow[];

    res.json({
      leaderboard: clans.map((clan, index) => ({
        rank: index + 1,
        id: clan.id,
        name: clan.name,
        tag: clan.tag,
        elo: clan.elo,
        wins: clan.wins,
        losses: clan.losses,
        winRate: clan.wins + clan.losses > 0
          ? Math.round((clan.wins / (clan.wins + clan.losses)) * 100)
          : 0,
        icon: clan.icon,
        color: clan.color,
        memberCount: clan.member_count,
      })),
    });
  } catch (error) {
    console.error('Get clan leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get clan leaderboard' });
  }
});

// Get player stats
router.get('/player/:id/stats', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const profile = userQueries.getProfile.get(id) as {
      id: string;
      username: string;
      elo: number;
      wins: number;
      losses: number;
      draws: number;
      avatar: string;
      title: string;
      created_at: number;
      clan_name: string | null;
      clan_tag: string | null;
    } | undefined;

    if (!profile) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const rank = userQueries.getPlayerRank.get(id) as { rank: number };
    const recentMatches = matchQueries.getPlayerMatches.all(id, 10) as MatchRow[];

    // Calculate stats
    const totalGames = profile.wins + profile.losses + profile.draws;
    const winRate = totalGames > 0 ? Math.round((profile.wins / totalGames) * 100) : 0;

    // Calculate rank tier
    const rankTier = getRankTier(profile.elo);

    res.json({
      id: profile.id,
      username: profile.username,
      elo: profile.elo,
      rank: rank?.rank || 1,
      rankTier,
      wins: profile.wins,
      losses: profile.losses,
      draws: profile.draws,
      totalGames,
      winRate,
      avatar: profile.avatar,
      title: profile.title,
      createdAt: profile.created_at,
      clan: profile.clan_name ? {
        name: profile.clan_name,
        tag: profile.clan_tag,
      } : null,
      recentMatches: recentMatches.map(match => ({
        id: match.id,
        mode: match.mode,
        result: match.winner_team !== null ? 'completed' : 'in_progress',
        duration: match.duration,
        createdAt: match.created_at,
      })),
    });
  } catch (error) {
    console.error('Get player stats error:', error);
    res.status(500).json({ error: 'Failed to get player stats' });
  }
});

// Get match details
router.get('/match/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const details = matchQueries.getMatchDetails.all(id) as Array<{
      id: string;
      mode: string;
      winner_team: number | null;
      duration: number | null;
      created_at: number;
      map_id: number | null;
      user_id: string;
      team: number;
      elo_change: number;
      territories_captured: number;
      troops_sent: number;
      username: string;
      avatar: string;
    }>;

    if (details.length === 0) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const match = details[0];

    res.json({
      id: match.id,
      mode: match.mode,
      winnerTeam: match.winner_team,
      duration: match.duration,
      createdAt: match.created_at,
      mapId: match.map_id,
      participants: details.map(p => ({
        userId: p.user_id,
        username: p.username,
        avatar: p.avatar,
        team: p.team,
        eloChange: p.elo_change,
        territoriesCaptured: p.territories_captured,
        troopsSent: p.troops_sent,
        isWinner: p.team === match.winner_team,
      })),
    });
  } catch (error) {
    console.error('Get match details error:', error);
    res.status(500).json({ error: 'Failed to get match details' });
  }
});

// Get global stats
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const totalPlayers = (userQueries.getTopPlayers.all(999999) as PlayerRow[]).length;
    const totalClans = (clanQueries.getTopClans.all(999999) as ClanRow[]).length;

    // Get top 3 players
    const topPlayers = (userQueries.getTopPlayers.all(3) as PlayerRow[]).map((p, i) => ({
      rank: i + 1,
      username: p.username,
      elo: p.elo,
      avatar: p.avatar,
    }));

    // Get top 3 clans
    const topClans = (clanQueries.getTopClans.all(3) as ClanRow[]).map((c, i) => ({
      rank: i + 1,
      name: c.name,
      tag: c.tag,
      elo: c.elo,
      icon: c.icon,
    }));

    res.json({
      totalPlayers,
      totalClans,
      topPlayers,
      topClans,
    });
  } catch (error) {
    console.error('Get global stats error:', error);
    res.status(500).json({ error: 'Failed to get global stats' });
  }
});

function getRankTier(elo: number): { id: string; name: string; minElo: number; color: string; icon: string } {
  const ranks = [
    { id: 'legend', name: 'Legend', minElo: 2200, color: '#ff00ff', icon: '👑' },
    { id: 'grandmaster', name: 'Grandmaster', minElo: 2000, color: '#ff4444', icon: '🔥' },
    { id: 'master', name: 'Master', minElo: 1800, color: '#aa44ff', icon: '💎' },
    { id: 'diamond', name: 'Diamond', minElo: 1600, color: '#00ccff', icon: '💠' },
    { id: 'platinum', name: 'Platinum', minElo: 1400, color: '#00ffaa', icon: '🏆' },
    { id: 'gold', name: 'Gold', minElo: 1200, color: '#ffcc00', icon: '🥇' },
    { id: 'silver', name: 'Silver', minElo: 1000, color: '#cccccc', icon: '🥈' },
    { id: 'bronze', name: 'Bronze', minElo: 0, color: '#cc8844', icon: '🥉' },
  ];

  for (const rank of ranks) {
    if (elo >= rank.minElo) {
      return rank;
    }
  }

  return ranks[ranks.length - 1];
}

export { router as leaderboardRouter };
