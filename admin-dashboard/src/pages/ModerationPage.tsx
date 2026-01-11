import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  MessageSquare,
  Ban,
  CheckCircle,
  Clock,
  User,
  Flag,
  Eye,
} from 'lucide-react';
import { api } from '../services/api';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';

interface Report {
  id: string;
  reporter_id: string;
  reporter_username: string;
  reported_id: string;
  reported_username: string;
  type: string;
  reason: string;
  evidence?: string;
  status: 'pending' | 'assigned' | 'resolved' | 'dismissed';
  assigned_to?: string;
  resolution?: string;
  created_at: string;
  resolved_at?: string;
}

interface ChatLog {
  id: string;
  player_id: string;
  username: string;
  channel: string;
  message: string;
  is_flagged: boolean;
  flag_reason?: string;
  created_at: string;
}

interface BanRecord {
  id: string;
  player_id: string;
  username: string;
  type: string;
  reason: string;
  banned_by: string;
  expires_at?: string;
  created_at: string;
  is_active: boolean;
}

type TabType = 'reports' | 'chat' | 'bans';

export function ModerationPage() {
  const [activeTab, setActiveTab] = useState<TabType>('reports');
  const [reports, setReports] = useState<Report[]>([]);
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [bans, setBans] = useState<BanRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [reportFilter, setReportFilter] = useState<'pending' | 'assigned' | 'resolved'>('pending');
  const [flaggedOnly, setFlaggedOnly] = useState(true);

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [showResolveModal, setShowResolveModal] = useState(false);

  const [resolveForm, setResolveForm] = useState({
    resolution: '',
    action: 'none',
    banDuration: '24h',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'reports') {
        const result = await api.getReports(reportFilter, 50, 0);
        setReports(result.reports || []);
      } else if (activeTab === 'chat') {
        const result = await api.getChatLogs(flaggedOnly, 50, 0);
        setChatLogs(result.logs || []);
      } else if (activeTab === 'bans') {
        const result = await api.getBans(50, 0);
        setBans(result.bans || []);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, reportFilter, flaggedOnly]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAssignReport = async (reportId: string) => {
    try {
      await api.assignReport(reportId);
      loadData();
    } catch (error) {
      console.error('Failed to assign report:', error);
    }
  };

  const handleResolveReport = async () => {
    if (!selectedReport) return;
    try {
      await api.resolveReport(
        selectedReport.id,
        resolveForm.resolution,
        resolveForm.action,
        resolveForm.action === 'ban' ? resolveForm.banDuration : undefined
      );
      setShowResolveModal(false);
      setResolveForm({ resolution: '', action: 'none', banDuration: '24h' });
      setSelectedReport(null);
      loadData();
    } catch (error) {
      console.error('Failed to resolve report:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 rounded-full bg-yellow-600/20 text-yellow-400 text-xs">Pending</span>;
      case 'assigned':
        return <span className="px-2 py-1 rounded-full bg-blue-600/20 text-blue-400 text-xs">Assigned</span>;
      case 'resolved':
        return <span className="px-2 py-1 rounded-full bg-green-600/20 text-green-400 text-xs">Resolved</span>;
      case 'dismissed':
        return <span className="px-2 py-1 rounded-full bg-gray-600/20 text-gray-400 text-xs">Dismissed</span>;
      default:
        return null;
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      cheating: 'bg-red-600/20 text-red-400',
      harassment: 'bg-orange-600/20 text-orange-400',
      inappropriate: 'bg-yellow-600/20 text-yellow-400',
      spam: 'bg-purple-600/20 text-purple-400',
      other: 'bg-gray-600/20 text-gray-400',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs ${colors[type] || colors.other}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  const reportColumns = [
    {
      key: 'type',
      header: 'Type',
      render: (report: Report) => getTypeBadge(report.type),
    },
    {
      key: 'reported',
      header: 'Reported Player',
      render: (report: Report) => (
        <div className="flex items-center gap-2">
          <User size={16} className="text-gray-500" />
          <span className="text-white">{report.reported_username}</span>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (report: Report) => (
        <span className="text-gray-400 truncate max-w-[200px] block">{report.reason}</span>
      ),
    },
    {
      key: 'reporter',
      header: 'Reporter',
      render: (report: Report) => (
        <span className="text-gray-500">{report.reporter_username}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (report: Report) => getStatusBadge(report.status),
    },
    {
      key: 'created_at',
      header: 'Date',
      render: (report: Report) => (
        <span className="text-gray-500">
          {new Date(report.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (report: Report) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedReport(report);
            }}
            className="p-2 rounded-lg hover:bg-dark-100 text-gray-400 hover:text-white"
            title="View"
          >
            <Eye size={18} />
          </button>
          {report.status === 'pending' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAssignReport(report.id);
              }}
              className="p-2 rounded-lg hover:bg-blue-900/20 text-blue-400"
              title="Assign to me"
            >
              <User size={18} />
            </button>
          )}
          {(report.status === 'pending' || report.status === 'assigned') && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedReport(report);
                setShowResolveModal(true);
              }}
              className="p-2 rounded-lg hover:bg-green-900/20 text-green-400"
              title="Resolve"
            >
              <CheckCircle size={18} />
            </button>
          )}
        </div>
      ),
    },
  ];

  const chatColumns = [
    {
      key: 'username',
      header: 'Player',
      render: (log: ChatLog) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-sm">
            {log.username.charAt(0).toUpperCase()}
          </div>
          <span className="text-white">{log.username}</span>
        </div>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      render: (log: ChatLog) => (
        <span className="text-gray-400">{log.channel}</span>
      ),
    },
    {
      key: 'message',
      header: 'Message',
      render: (log: ChatLog) => (
        <div>
          <p className="text-white">{log.message}</p>
          {log.is_flagged && (
            <p className="text-red-400 text-xs mt-1">
              <Flag size={12} className="inline mr-1" />
              {log.flag_reason}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Time',
      render: (log: ChatLog) => (
        <span className="text-gray-500">
          {new Date(log.created_at).toLocaleString()}
        </span>
      ),
    },
  ];

  const banColumns = [
    {
      key: 'username',
      header: 'Player',
      render: (ban: BanRecord) => (
        <div className="flex items-center gap-2">
          <Ban size={16} className="text-red-400" />
          <span className="text-white">{ban.username}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (ban: BanRecord) => (
        <span className={`px-2 py-1 rounded-full text-xs ${
          ban.type === 'permanent' ? 'bg-red-600/20 text-red-400' : 'bg-yellow-600/20 text-yellow-400'
        }`}>
          {ban.type.charAt(0).toUpperCase() + ban.type.slice(1)}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (ban: BanRecord) => (
        <span className="text-gray-400">{ban.reason}</span>
      ),
    },
    {
      key: 'banned_by',
      header: 'Banned By',
      render: (ban: BanRecord) => (
        <span className="text-gray-500">{ban.banned_by}</span>
      ),
    },
    {
      key: 'expires',
      header: 'Expires',
      render: (ban: BanRecord) => (
        <span className="text-gray-500">
          {ban.expires_at ? new Date(ban.expires_at).toLocaleString() : 'Never'}
        </span>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (ban: BanRecord) => (
        <span className={`px-2 py-1 rounded-full text-xs ${
          ban.is_active ? 'bg-red-600/20 text-red-400' : 'bg-green-600/20 text-green-400'
        }`}>
          {ban.is_active ? 'Active' : 'Expired'}
        </span>
      ),
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Moderation</h1>
        <p className="text-gray-500">Review reports and manage player behavior</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'reports'
              ? 'bg-primary-600 text-white'
              : 'bg-dark-200 text-gray-400 hover:text-white'
          }`}
        >
          <AlertTriangle size={18} className="inline mr-2" />
          Reports
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'chat'
              ? 'bg-primary-600 text-white'
              : 'bg-dark-200 text-gray-400 hover:text-white'
          }`}
        >
          <MessageSquare size={18} className="inline mr-2" />
          Chat Logs
        </button>
        <button
          onClick={() => setActiveTab('bans')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'bans'
              ? 'bg-primary-600 text-white'
              : 'bg-dark-200 text-gray-400 hover:text-white'
          }`}
        >
          <Ban size={18} className="inline mr-2" />
          Bans
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        {activeTab === 'reports' && (
          <select
            value={reportFilter}
            onChange={(e) => setReportFilter(e.target.value as any)}
            className="input"
          >
            <option value="pending">Pending</option>
            <option value="assigned">Assigned</option>
            <option value="resolved">Resolved</option>
          </select>
        )}
        {activeTab === 'chat' && (
          <label className="flex items-center gap-2 text-gray-400">
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={(e) => setFlaggedOnly(e.target.checked)}
              className="rounded border-gray-600 bg-dark-300 text-primary-600 focus:ring-primary-500"
            />
            Flagged messages only
          </label>
        )}
      </div>

      {/* Data Tables */}
      {activeTab === 'reports' && (
        <DataTable
          columns={reportColumns}
          data={reports}
          loading={loading}
          emptyMessage="No reports found"
        />
      )}

      {activeTab === 'chat' && (
        <DataTable
          columns={chatColumns}
          data={chatLogs}
          loading={loading}
          emptyMessage="No chat logs found"
        />
      )}

      {activeTab === 'bans' && (
        <DataTable
          columns={banColumns}
          data={bans}
          loading={loading}
          emptyMessage="No bans found"
        />
      )}

      {/* Report Detail Modal */}
      <Modal
        isOpen={!!selectedReport && !showResolveModal}
        onClose={() => setSelectedReport(null)}
        title="Report Details"
        size="lg"
      >
        {selectedReport && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              {getTypeBadge(selectedReport.type)}
              {getStatusBadge(selectedReport.status)}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-dark-300 rounded-lg p-4">
                <p className="text-gray-500 text-sm mb-1">Reported Player</p>
                <p className="text-white font-medium">{selectedReport.reported_username}</p>
              </div>
              <div className="bg-dark-300 rounded-lg p-4">
                <p className="text-gray-500 text-sm mb-1">Reporter</p>
                <p className="text-white font-medium">{selectedReport.reporter_username}</p>
              </div>
            </div>

            <div className="bg-dark-300 rounded-lg p-4">
              <p className="text-gray-500 text-sm mb-2">Reason</p>
              <p className="text-white">{selectedReport.reason}</p>
            </div>

            {selectedReport.evidence && (
              <div className="bg-dark-300 rounded-lg p-4">
                <p className="text-gray-500 text-sm mb-2">Evidence</p>
                <p className="text-white">{selectedReport.evidence}</p>
              </div>
            )}

            {selectedReport.resolution && (
              <div className="bg-dark-300 rounded-lg p-4">
                <p className="text-gray-500 text-sm mb-2">Resolution</p>
                <p className="text-white">{selectedReport.resolution}</p>
              </div>
            )}

            <div className="text-sm text-gray-500">
              Submitted: {new Date(selectedReport.created_at).toLocaleString()}
              {selectedReport.resolved_at && (
                <span className="ml-4">
                  Resolved: {new Date(selectedReport.resolved_at).toLocaleString()}
                </span>
              )}
            </div>

            {(selectedReport.status === 'pending' || selectedReport.status === 'assigned') && (
              <div className="flex gap-3">
                <button
                  onClick={() => setShowResolveModal(true)}
                  className="btn-primary flex items-center gap-2"
                >
                  <CheckCircle size={18} />
                  Resolve Report
                </button>
                {selectedReport.status === 'pending' && (
                  <button
                    onClick={() => handleAssignReport(selectedReport.id)}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <User size={18} />
                    Assign to Me
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Resolve Modal */}
      <Modal
        isOpen={showResolveModal}
        onClose={() => setShowResolveModal(false)}
        title="Resolve Report"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Action
            </label>
            <select
              value={resolveForm.action}
              onChange={(e) => setResolveForm({ ...resolveForm, action: e.target.value })}
              className="input w-full"
            >
              <option value="none">No action</option>
              <option value="warning">Send warning</option>
              <option value="mute">Mute player</option>
              <option value="ban">Ban player</option>
            </select>
          </div>

          {resolveForm.action === 'ban' && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Ban Duration
              </label>
              <select
                value={resolveForm.banDuration}
                onChange={(e) => setResolveForm({ ...resolveForm, banDuration: e.target.value })}
                className="input w-full"
              >
                <option value="1h">1 hour</option>
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="permanent">Permanent</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Resolution Notes
            </label>
            <textarea
              value={resolveForm.resolution}
              onChange={(e) => setResolveForm({ ...resolveForm, resolution: e.target.value })}
              className="input w-full h-24 resize-none"
              placeholder="Enter resolution notes..."
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={handleResolveReport} className="btn-primary flex-1">
              Confirm Resolution
            </button>
            <button onClick={() => setShowResolveModal(false)} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
