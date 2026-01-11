import { useState } from 'react';
import {
  Settings,
  User,
  Lock,
  Bell,
  Shield,
  Save,
  CheckCircle,
  Eye,
  EyeOff,
} from 'lucide-react';

type SettingsTab = 'profile' | 'security' | 'notifications' | 'permissions';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [profileForm, setProfileForm] = useState({
    username: 'Admin',
    email: 'admin@stateio.game',
    avatar: '',
  });

  const [securityForm, setSecurityForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
    two_factor: false,
  });

  const [notificationSettings, setNotificationSettings] = useState({
    email_reports: true,
    email_alerts: true,
    browser_notifications: false,
    daily_digest: true,
  });

  const handleSave = async () => {
    setSaving(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'permissions', label: 'Permissions', icon: Shield },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-500">Manage your account and preferences</p>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <div className="w-64">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-600/20 text-primary-400'
                    : 'text-gray-400 hover:text-white hover:bg-dark-200'
                }`}
              >
                <tab.icon size={20} />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="card p-6">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                  <User className="text-primary-400" size={24} />
                  <h2 className="text-xl font-semibold text-white">Profile Settings</h2>
                </div>

                <div className="flex items-center gap-6 mb-8">
                  <div className="w-20 h-20 rounded-full bg-primary-600 flex items-center justify-center text-3xl font-bold">
                    {profileForm.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <button className="btn-secondary text-sm">Change Avatar</button>
                    <p className="text-xs text-gray-500 mt-2">JPG, PNG or GIF. Max 2MB.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Username
                    </label>
                    <input
                      type="text"
                      value={profileForm.username}
                      onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                  <Lock className="text-primary-400" size={24} />
                  <h2 className="text-xl font-semibold text-white">Security Settings</h2>
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium text-white">Change Password</h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={securityForm.current_password}
                        onChange={(e) =>
                          setSecurityForm({ ...securityForm, current_password: e.target.value })
                        }
                        className="input w-full pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={securityForm.new_password}
                      onChange={(e) =>
                        setSecurityForm({ ...securityForm, new_password: e.target.value })
                      }
                      className="input w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={securityForm.confirm_password}
                      onChange={(e) =>
                        setSecurityForm({ ...securityForm, confirm_password: e.target.value })
                      }
                      className="input w-full"
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-dark-100">
                  <h3 className="font-medium text-white mb-4">Two-Factor Authentication</h3>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={securityForm.two_factor}
                      onChange={(e) =>
                        setSecurityForm({ ...securityForm, two_factor: e.target.checked })
                      }
                      className="rounded border-gray-600 bg-dark-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-gray-400">Enable 2FA for enhanced security</span>
                  </label>
                </div>
              </div>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                  <Bell className="text-primary-400" size={24} />
                  <h2 className="text-xl font-semibold text-white">Notification Preferences</h2>
                </div>

                <div className="space-y-4">
                  <label className="flex items-center justify-between p-4 bg-dark-300 rounded-lg">
                    <div>
                      <p className="text-white font-medium">Email Reports</p>
                      <p className="text-sm text-gray-500">Receive weekly summary reports</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationSettings.email_reports}
                      onChange={(e) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          email_reports: e.target.checked,
                        })
                      }
                      className="rounded border-gray-600 bg-dark-300 text-primary-600 focus:ring-primary-500 h-5 w-5"
                    />
                  </label>

                  <label className="flex items-center justify-between p-4 bg-dark-300 rounded-lg">
                    <div>
                      <p className="text-white font-medium">Email Alerts</p>
                      <p className="text-sm text-gray-500">Get notified about critical events</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationSettings.email_alerts}
                      onChange={(e) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          email_alerts: e.target.checked,
                        })
                      }
                      className="rounded border-gray-600 bg-dark-300 text-primary-600 focus:ring-primary-500 h-5 w-5"
                    />
                  </label>

                  <label className="flex items-center justify-between p-4 bg-dark-300 rounded-lg">
                    <div>
                      <p className="text-white font-medium">Browser Notifications</p>
                      <p className="text-sm text-gray-500">Show desktop notifications</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationSettings.browser_notifications}
                      onChange={(e) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          browser_notifications: e.target.checked,
                        })
                      }
                      className="rounded border-gray-600 bg-dark-300 text-primary-600 focus:ring-primary-500 h-5 w-5"
                    />
                  </label>

                  <label className="flex items-center justify-between p-4 bg-dark-300 rounded-lg">
                    <div>
                      <p className="text-white font-medium">Daily Digest</p>
                      <p className="text-sm text-gray-500">Receive daily activity summary</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationSettings.daily_digest}
                      onChange={(e) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          daily_digest: e.target.checked,
                        })
                      }
                      className="rounded border-gray-600 bg-dark-300 text-primary-600 focus:ring-primary-500 h-5 w-5"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Permissions Tab */}
            {activeTab === 'permissions' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                  <Shield className="text-primary-400" size={24} />
                  <h2 className="text-xl font-semibold text-white">Your Permissions</h2>
                </div>

                <div className="bg-dark-300 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary-600/20">
                      <Shield className="text-primary-400" size={20} />
                    </div>
                    <div>
                      <p className="text-white font-medium">Super Admin</p>
                      <p className="text-sm text-gray-500">Full access to all features</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { name: 'View Dashboard', granted: true },
                    { name: 'Manage Players', granted: true },
                    { name: 'Ban Players', granted: true },
                    { name: 'View Reports', granted: true },
                    { name: 'Resolve Reports', granted: true },
                    { name: 'Manage Events', granted: true },
                    { name: 'Manage Offers', granted: true },
                    { name: 'Send Notifications', granted: true },
                    { name: 'View Audit Log', granted: true },
                    { name: 'Manage Admins', granted: true },
                    { name: 'System Settings', granted: true },
                    { name: 'API Access', granted: true },
                  ].map((permission) => (
                    <div
                      key={permission.name}
                      className="flex items-center justify-between p-3 bg-dark-300 rounded-lg"
                    >
                      <span className="text-gray-400">{permission.name}</span>
                      {permission.granted ? (
                        <CheckCircle className="text-green-400" size={18} />
                      ) : (
                        <span className="text-red-400 text-sm">Denied</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="flex items-center justify-between pt-6 mt-6 border-t border-dark-100">
              <div>
                {saved && (
                  <span className="flex items-center gap-2 text-green-400">
                    <CheckCircle size={18} />
                    Settings saved successfully
                  </span>
                )}
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex items-center gap-2"
              >
                {saving ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Save size={18} />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
