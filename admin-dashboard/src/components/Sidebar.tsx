import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Shield,
  Calendar,
  Settings,
  LogOut,
  TrendingUp,
  Bell,
  Gift,
  FileText,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/players', icon: Users, label: 'Players' },
  { to: '/moderation', icon: Shield, label: 'Moderation' },
  { to: '/events', icon: Calendar, label: 'Events' },
  { to: '/offers', icon: Gift, label: 'Offers' },
  { to: '/analytics', icon: TrendingUp, label: 'Analytics' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
  { to: '/audit-log', icon: FileText, label: 'Audit Log' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 bg-dark-300 border-r border-dark-100 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-dark-100">
        <h1 className="text-xl font-bold text-white">State.io Admin</h1>
        <p className="text-sm text-gray-500">Dashboard v1.0</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `sidebar-link mx-2 mb-1 ${isActive ? 'active' : ''}`
            }
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-dark-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center">
            {user?.username?.charAt(0).toUpperCase() || 'A'}
          </div>
          <div>
            <p className="font-medium text-white">{user?.username || 'Admin'}</p>
            <p className="text-xs text-gray-500">{user?.email || 'admin@stateio.game'}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-900/20"
        >
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
