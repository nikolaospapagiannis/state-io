import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  Ban,
  Gift,
  Eye,
  MoreHorizontal,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';

interface Player {
  id: string;
  username: string;
  email: string;
  trophies: number;
  gems: number;
  coins: number;
  matches_played: number;
  wins: number;
  total_spent: number;
  is_banned: boolean;
  ban_reason?: string;
  created_at: string;
  last_login: string;
}

type SortBy = 'created_at' | 'trophies' | 'total_spent' | 'matches_played';

export function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [showCompensateModal, setShowCompensateModal] = useState(false);

  const [banForm, setBanForm] = useState({
    reason: '',
    type: 'temporary',
    duration: 24,
  });

  const [compensateForm, setCompensateForm] = useState({
    gems: 0,
    coins: 0,
    reason: '',
  });

  const loadPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.searchPlayers(
        searchQuery,
        sortBy,
        sortOrder,
        50,
        (currentPage - 1) * 50
      );
      setPlayers(result.players || []);
      setTotalPages(Math.ceil((result.total || 0) / 50));
    } catch (error) {
      console.error('Failed to load players:', error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, sortBy, sortOrder, currentPage]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const handleSort = (field: SortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleViewPlayer = async (player: Player) => {
    try {
      const fullPlayer = await api.getPlayer(player.id);
      setSelectedPlayer(fullPlayer);
      setShowPlayerModal(true);
    } catch (error) {
      console.error('Failed to load player details:', error);
    }
  };

  const handleBanPlayer = async () => {
    if (!selectedPlayer) return;
    try {
      await api.banPlayer(
        selectedPlayer.id,
        banForm.reason,
        banForm.type,
        banForm.type === 'temporary' ? banForm.duration : undefined
      );
      setShowBanModal(false);
      setBanForm({ reason: '', type: 'temporary', duration: 24 });
      loadPlayers();
    } catch (error) {
      console.error('Failed to ban player:', error);
    }
  };

  const handleUnbanPlayer = async (playerId: string) => {
    try {
      await api.unbanPlayer(playerId);
      loadPlayers();
    } catch (error) {
      console.error('Failed to unban player:', error);
    }
  };

  const handleCompensate = async () => {
    if (!selectedPlayer) return;
    try {
      await api.compensatePlayer(selectedPlayer.id, compensateForm);
      setShowCompensateModal(false);
      setCompensateForm({ gems: 0, coins: 0, reason: '' });
    } catch (error) {
      console.error('Failed to compensate player:', error);
    }
  };

  const columns = [
    {
      key: 'username',
      header: 'Player',
      render: (player: Player) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center font-medium">
            {player.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-white">{player.username}</p>
            <p className="text-sm text-gray-500">{player.email}</p>
          </div>
          {player.is_banned && (
            <span className="px-2 py-1 rounded-full bg-red-600/20 text-red-400 text-xs">Banned</span>
          )}
        </div>
      ),
    },
    {
      key: 'trophies',
      header: 'Trophies',
      sortable: true,
      render: (player: Player) => (
        <span className="text-yellow-400 font-medium">{player.trophies.toLocaleString()}</span>
      ),
    },
    {
      key: 'matches_played',
      header: 'Matches',
      sortable: true,
      render: (player: Player) => (
        <div>
          <p className="text-white">{player.matches_played.toLocaleString()}</p>
          <p className="text-sm text-gray-500">
            {player.wins} wins ({player.matches_played > 0 ? Math.round((player.wins / player.matches_played) * 100) : 0}%)
          </p>
        </div>
      ),
    },
    {
      key: 'total_spent',
      header: 'Spent',
      sortable: true,
      render: (player: Player) => (
        <span className="text-green-400 font-medium">${player.total_spent.toFixed(2)}</span>
      ),
    },
    {
      key: 'created_at',
      header: 'Joined',
      sortable: true,
      render: (player: Player) => (
        <span className="text-gray-400">
          {new Date(player.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (player: Player) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleViewPlayer(player);
            }}
            className="p-2 rounded-lg hover:bg-dark-100 text-gray-400 hover:text-white"
            title="View Details"
          >
            <Eye size={18} />
          </button>
          {player.is_banned ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleUnbanPlayer(player.id);
              }}
              className="p-2 rounded-lg hover:bg-green-900/20 text-green-400"
              title="Unban"
            >
              <CheckCircle size={18} />
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPlayer(player);
                setShowBanModal(true);
              }}
              className="p-2 rounded-lg hover:bg-red-900/20 text-red-400"
              title="Ban"
            >
              <Ban size={18} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedPlayer(player);
              setShowCompensateModal(true);
            }}
            className="p-2 rounded-lg hover:bg-yellow-900/20 text-yellow-400"
            title="Compensate"
          >
            <Gift size={18} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Players</h1>
        <p className="text-gray-500">Manage your player base</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="input w-full pl-10"
            placeholder="Search by username or email..."
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => handleSort(e.target.value as SortBy)}
          className="input"
        >
          <option value="created_at">Sort by: Join Date</option>
          <option value="trophies">Sort by: Trophies</option>
          <option value="total_spent">Sort by: Spent</option>
          <option value="matches_played">Sort by: Matches</option>
        </select>
        <button
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          className="btn-secondary"
        >
          {sortOrder === 'desc' ? 'Descending' : 'Ascending'}
        </button>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={players}
        loading={loading}
        onRowClick={handleViewPlayer}
        pagination={{
          currentPage,
          totalPages,
          onPageChange: setCurrentPage,
        }}
        emptyMessage="No players found"
      />

      {/* Player Details Modal */}
      <Modal
        isOpen={showPlayerModal}
        onClose={() => setShowPlayerModal(false)}
        title="Player Details"
        size="lg"
      >
        {selectedPlayer && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary-600 flex items-center justify-center text-2xl font-bold">
                {selectedPlayer.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">{selectedPlayer.username}</h3>
                <p className="text-gray-500">{selectedPlayer.email}</p>
                {selectedPlayer.is_banned && (
                  <span className="inline-block mt-1 px-2 py-1 rounded-full bg-red-600/20 text-red-400 text-xs">
                    Banned: {selectedPlayer.ban_reason}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-dark-300 rounded-lg p-4">
                <p className="text-gray-500 text-sm">Trophies</p>
                <p className="text-2xl font-bold text-yellow-400">{selectedPlayer.trophies.toLocaleString()}</p>
              </div>
              <div className="bg-dark-300 rounded-lg p-4">
                <p className="text-gray-500 text-sm">Gems</p>
                <p className="text-2xl font-bold text-purple-400">{selectedPlayer.gems.toLocaleString()}</p>
              </div>
              <div className="bg-dark-300 rounded-lg p-4">
                <p className="text-gray-500 text-sm">Coins</p>
                <p className="text-2xl font-bold text-yellow-500">{selectedPlayer.coins.toLocaleString()}</p>
              </div>
              <div className="bg-dark-300 rounded-lg p-4">
                <p className="text-gray-500 text-sm">Total Spent</p>
                <p className="text-2xl font-bold text-green-400">${selectedPlayer.total_spent.toFixed(2)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-dark-300 rounded-lg p-4">
                <p className="text-gray-500 text-sm">Matches Played</p>
                <p className="text-xl font-bold text-white">{selectedPlayer.matches_played.toLocaleString()}</p>
              </div>
              <div className="bg-dark-300 rounded-lg p-4">
                <p className="text-gray-500 text-sm">Win Rate</p>
                <p className="text-xl font-bold text-white">
                  {selectedPlayer.matches_played > 0
                    ? Math.round((selectedPlayer.wins / selectedPlayer.matches_played) * 100)
                    : 0}%
                </p>
              </div>
            </div>

            <div className="flex justify-between text-sm text-gray-500">
              <span>Joined: {new Date(selectedPlayer.created_at).toLocaleString()}</span>
              <span>Last Login: {new Date(selectedPlayer.last_login).toLocaleString()}</span>
            </div>

            <div className="flex gap-3">
              {selectedPlayer.is_banned ? (
                <button
                  onClick={() => {
                    handleUnbanPlayer(selectedPlayer.id);
                    setShowPlayerModal(false);
                  }}
                  className="btn-primary flex items-center gap-2"
                >
                  <CheckCircle size={18} />
                  Unban Player
                </button>
              ) : (
                <button
                  onClick={() => {
                    setShowPlayerModal(false);
                    setShowBanModal(true);
                  }}
                  className="btn-danger flex items-center gap-2"
                >
                  <Ban size={18} />
                  Ban Player
                </button>
              )}
              <button
                onClick={() => {
                  setShowPlayerModal(false);
                  setShowCompensateModal(true);
                }}
                className="btn-secondary flex items-center gap-2"
              >
                <Gift size={18} />
                Compensate
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Ban Modal */}
      <Modal
        isOpen={showBanModal}
        onClose={() => setShowBanModal(false)}
        title="Ban Player"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-red-900/20 rounded-lg">
            <AlertTriangle className="text-red-400" size={24} />
            <p className="text-red-400">
              You are about to ban <strong>{selectedPlayer?.username}</strong>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Ban Type
            </label>
            <select
              value={banForm.type}
              onChange={(e) => setBanForm({ ...banForm, type: e.target.value })}
              className="input w-full"
            >
              <option value="temporary">Temporary</option>
              <option value="permanent">Permanent</option>
            </select>
          </div>

          {banForm.type === 'temporary' && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Duration (hours)
              </label>
              <input
                type="number"
                value={banForm.duration}
                onChange={(e) => setBanForm({ ...banForm, duration: parseInt(e.target.value) || 24 })}
                className="input w-full"
                min={1}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Reason
            </label>
            <textarea
              value={banForm.reason}
              onChange={(e) => setBanForm({ ...banForm, reason: e.target.value })}
              className="input w-full h-24 resize-none"
              placeholder="Enter ban reason..."
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={handleBanPlayer} className="btn-danger flex-1">
              Confirm Ban
            </button>
            <button onClick={() => setShowBanModal(false)} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Compensate Modal */}
      <Modal
        isOpen={showCompensateModal}
        onClose={() => setShowCompensateModal(false)}
        title="Compensate Player"
      >
        <div className="space-y-4">
          <p className="text-gray-400">
            Send compensation to <strong className="text-white">{selectedPlayer?.username}</strong>
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Gems
            </label>
            <input
              type="number"
              value={compensateForm.gems}
              onChange={(e) => setCompensateForm({ ...compensateForm, gems: parseInt(e.target.value) || 0 })}
              className="input w-full"
              min={0}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Coins
            </label>
            <input
              type="number"
              value={compensateForm.coins}
              onChange={(e) => setCompensateForm({ ...compensateForm, coins: parseInt(e.target.value) || 0 })}
              className="input w-full"
              min={0}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Reason
            </label>
            <textarea
              value={compensateForm.reason}
              onChange={(e) => setCompensateForm({ ...compensateForm, reason: e.target.value })}
              className="input w-full h-24 resize-none"
              placeholder="Enter compensation reason..."
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={handleCompensate} className="btn-primary flex-1">
              Send Compensation
            </button>
            <button onClick={() => setShowCompensateModal(false)} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
