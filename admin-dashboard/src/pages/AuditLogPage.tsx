import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Filter,
  User,
  Clock,
  Activity,
  Shield,
  Settings,
  Users,
  Gift,
  Calendar,
} from 'lucide-react';
import { api } from '../services/api';
import { DataTable } from '../components/DataTable';

interface AuditEntry {
  id: string;
  admin_id: string;
  admin_username: string;
  action: string;
  target_type: string;
  target_id?: string;
  details: any;
  ip_address: string;
  created_at: string;
}

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadAuditLog = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getAuditLog(50, (currentPage - 1) * 50);
      setEntries(result.entries || []);
      setTotalPages(Math.ceil((result.total || 0) / 50));
    } catch (error) {
      console.error('Failed to load audit log:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  useEffect(() => {
    loadAuditLog();
  }, [loadAuditLog]);

  const getActionIcon = (action: string) => {
    if (action.includes('ban')) return <Shield className="text-red-400" size={16} />;
    if (action.includes('player')) return <Users className="text-blue-400" size={16} />;
    if (action.includes('event')) return <Calendar className="text-yellow-400" size={16} />;
    if (action.includes('offer')) return <Gift className="text-green-400" size={16} />;
    if (action.includes('setting')) return <Settings className="text-gray-400" size={16} />;
    if (action.includes('moderation')) return <Shield className="text-orange-400" size={16} />;
    return <Activity className="text-primary-400" size={16} />;
  };

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      create: 'bg-green-600/20 text-green-400',
      update: 'bg-blue-600/20 text-blue-400',
      delete: 'bg-red-600/20 text-red-400',
      ban: 'bg-red-600/20 text-red-400',
      unban: 'bg-green-600/20 text-green-400',
      resolve: 'bg-yellow-600/20 text-yellow-400',
      login: 'bg-primary-600/20 text-primary-400',
    };

    const actionType = Object.keys(colors).find((key) => action.toLowerCase().includes(key)) || 'default';
    return (
      <span className={`px-2 py-1 rounded-full text-xs ${colors[actionType] || 'bg-gray-600/20 text-gray-400'}`}>
        {action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
      </span>
    );
  };

  const columns = [
    {
      key: 'created_at',
      header: 'Time',
      render: (entry: AuditEntry) => (
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-gray-500" />
          <div>
            <p className="text-white text-sm">
              {new Date(entry.created_at).toLocaleDateString()}
            </p>
            <p className="text-gray-500 text-xs">
              {new Date(entry.created_at).toLocaleTimeString()}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'admin',
      header: 'Admin',
      render: (entry: AuditEntry) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary-600/20 flex items-center justify-center">
            <User size={14} className="text-primary-400" />
          </div>
          <span className="text-white">{entry.admin_username}</span>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (entry: AuditEntry) => (
        <div className="flex items-center gap-2">
          {getActionIcon(entry.action)}
          {getActionBadge(entry.action)}
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      render: (entry: AuditEntry) => (
        <div>
          <p className="text-gray-400 text-sm capitalize">{entry.target_type}</p>
          {entry.target_id && (
            <p className="text-gray-500 text-xs font-mono">{entry.target_id}</p>
          )}
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      render: (entry: AuditEntry) => (
        <div className="max-w-xs">
          {entry.details ? (
            <p className="text-gray-400 text-sm truncate">
              {typeof entry.details === 'string'
                ? entry.details
                : JSON.stringify(entry.details).slice(0, 50)}
            </p>
          ) : (
            <span className="text-gray-600">-</span>
          )}
        </div>
      ),
    },
    {
      key: 'ip_address',
      header: 'IP Address',
      render: (entry: AuditEntry) => (
        <span className="text-gray-500 font-mono text-sm">{entry.ip_address}</span>
      ),
    },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-gray-500">Track all administrative actions</p>
        </div>
        <div className="flex items-center gap-3">
          <FileText className="text-gray-500" size={20} />
          <span className="text-gray-400 text-sm">
            {entries.length} entries
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-600/20">
              <Activity className="text-green-400" size={20} />
            </div>
            <div>
              <p className="text-gray-500 text-sm">Today's Actions</p>
              <p className="text-xl font-bold text-white">
                {entries.filter(e =>
                  new Date(e.created_at).toDateString() === new Date().toDateString()
                ).length}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-600/20">
              <Shield className="text-red-400" size={20} />
            </div>
            <div>
              <p className="text-gray-500 text-sm">Bans Issued</p>
              <p className="text-xl font-bold text-white">
                {entries.filter(e => e.action.includes('ban') && !e.action.includes('unban')).length}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-600/20">
              <Users className="text-blue-400" size={20} />
            </div>
            <div>
              <p className="text-gray-500 text-sm">Player Updates</p>
              <p className="text-xl font-bold text-white">
                {entries.filter(e => e.target_type === 'player').length}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary-600/20">
              <User className="text-primary-400" size={20} />
            </div>
            <div>
              <p className="text-gray-500 text-sm">Active Admins</p>
              <p className="text-xl font-bold text-white">
                {new Set(entries.map(e => e.admin_id)).size}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Table */}
      <DataTable
        columns={columns}
        data={entries}
        loading={loading}
        pagination={{
          currentPage,
          totalPages,
          onPageChange: setCurrentPage,
        }}
        emptyMessage="No audit entries found"
      />
    </div>
  );
}
