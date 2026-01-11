import { useState } from 'react';
import {
  Bell,
  Send,
  Users,
  User,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { api } from '../services/api';

type NotificationType = 'broadcast' | 'targeted';

export function NotificationsPage() {
  const [notificationType, setNotificationType] = useState<NotificationType>('broadcast');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [broadcastForm, setBroadcastForm] = useState({
    title: '',
    message: '',
    type: 'info',
    action_url: '',
    schedule_time: '',
  });

  const [targetedForm, setTargetedForm] = useState({
    player_id: '',
    title: '',
    message: '',
    type: 'info',
    action_url: '',
  });

  const handleBroadcast = async () => {
    if (!broadcastForm.title || !broadcastForm.message) {
      setError('Title and message are required');
      return;
    }

    setSending(true);
    setError('');
    setSuccess(false);

    try {
      await api.broadcastNotification(broadcastForm);
      setSuccess(true);
      setBroadcastForm({
        title: '',
        message: '',
        type: 'info',
        action_url: '',
        schedule_time: '',
      });
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  const handleTargeted = async () => {
    if (!targetedForm.player_id || !targetedForm.title || !targetedForm.message) {
      setError('Player ID, title and message are required');
      return;
    }

    setSending(true);
    setError('');
    setSuccess(false);

    try {
      await api.sendNotification(targetedForm.player_id, {
        title: targetedForm.title,
        message: targetedForm.message,
        type: targetedForm.type,
        action_url: targetedForm.action_url,
      });
      setSuccess(true);
      setTargetedForm({
        player_id: '',
        title: '',
        message: '',
        type: 'info',
        action_url: '',
      });
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Notifications</h1>
        <p className="text-gray-500">Send push notifications to players</p>
      </div>

      {/* Type Selection */}
      <div className="flex gap-4 mb-8">
        <button
          onClick={() => setNotificationType('broadcast')}
          className={`flex-1 card p-6 text-left transition-all ${
            notificationType === 'broadcast'
              ? 'border-primary-500 bg-primary-600/10'
              : 'hover:border-gray-600'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${
              notificationType === 'broadcast' ? 'bg-primary-600/20' : 'bg-dark-300'
            }`}>
              <Users className={notificationType === 'broadcast' ? 'text-primary-400' : 'text-gray-400'} size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-white">Broadcast</h3>
              <p className="text-sm text-gray-500">Send to all players</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setNotificationType('targeted')}
          className={`flex-1 card p-6 text-left transition-all ${
            notificationType === 'targeted'
              ? 'border-primary-500 bg-primary-600/10'
              : 'hover:border-gray-600'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${
              notificationType === 'targeted' ? 'bg-primary-600/20' : 'bg-dark-300'
            }`}>
              <User className={notificationType === 'targeted' ? 'text-primary-400' : 'text-gray-400'} size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-white">Targeted</h3>
              <p className="text-sm text-gray-500">Send to specific player</p>
            </div>
          </div>
        </button>
      </div>

      {/* Status Messages */}
      {success && (
        <div className="mb-6 p-4 rounded-lg bg-green-900/20 border border-green-500 flex items-center gap-3">
          <CheckCircle className="text-green-400" size={20} />
          <span className="text-green-400">Notification sent successfully!</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-500 flex items-center gap-3">
          <AlertCircle className="text-red-400" size={20} />
          <span className="text-red-400">{error}</span>
        </div>
      )}

      {/* Form */}
      <div className="card p-6">
        {notificationType === 'broadcast' ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <Bell className="text-primary-400" size={24} />
              <h2 className="text-xl font-semibold text-white">Broadcast Notification</h2>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Title *
              </label>
              <input
                type="text"
                value={broadcastForm.title}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
                className="input w-full"
                placeholder="Notification title..."
                maxLength={50}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Message *
              </label>
              <textarea
                value={broadcastForm.message}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                className="input w-full h-32 resize-none"
                placeholder="Notification message..."
                maxLength={200}
              />
              <p className="text-xs text-gray-500 mt-1">
                {broadcastForm.message.length}/200 characters
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Type
                </label>
                <select
                  value={broadcastForm.type}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, type: e.target.value })}
                  className="input w-full"
                >
                  <option value="info">Info</option>
                  <option value="promo">Promotional</option>
                  <option value="event">Event</option>
                  <option value="update">Update</option>
                  <option value="reward">Reward</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Schedule (optional)
                </label>
                <input
                  type="datetime-local"
                  value={broadcastForm.schedule_time}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, schedule_time: e.target.value })}
                  className="input w-full"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Action URL (optional)
              </label>
              <input
                type="text"
                value={broadcastForm.action_url}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, action_url: e.target.value })}
                className="input w-full"
                placeholder="Deep link or URL..."
              />
            </div>

            <div className="pt-4 border-t border-dark-100">
              <button
                onClick={handleBroadcast}
                disabled={sending}
                className="btn-primary flex items-center gap-2"
              >
                {sending ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Send size={18} />
                    {broadcastForm.schedule_time ? 'Schedule Broadcast' : 'Send Broadcast'}
                  </>
                )}
              </button>
              {broadcastForm.schedule_time && (
                <p className="mt-2 text-sm text-gray-500 flex items-center gap-2">
                  <Clock size={14} />
                  Will be sent at {new Date(broadcastForm.schedule_time).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <User className="text-primary-400" size={24} />
              <h2 className="text-xl font-semibold text-white">Targeted Notification</h2>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Player ID *
              </label>
              <input
                type="text"
                value={targetedForm.player_id}
                onChange={(e) => setTargetedForm({ ...targetedForm, player_id: e.target.value })}
                className="input w-full"
                placeholder="Enter player ID..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Title *
              </label>
              <input
                type="text"
                value={targetedForm.title}
                onChange={(e) => setTargetedForm({ ...targetedForm, title: e.target.value })}
                className="input w-full"
                placeholder="Notification title..."
                maxLength={50}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Message *
              </label>
              <textarea
                value={targetedForm.message}
                onChange={(e) => setTargetedForm({ ...targetedForm, message: e.target.value })}
                className="input w-full h-32 resize-none"
                placeholder="Notification message..."
                maxLength={200}
              />
              <p className="text-xs text-gray-500 mt-1">
                {targetedForm.message.length}/200 characters
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Type
                </label>
                <select
                  value={targetedForm.type}
                  onChange={(e) => setTargetedForm({ ...targetedForm, type: e.target.value })}
                  className="input w-full"
                >
                  <option value="info">Info</option>
                  <option value="promo">Promotional</option>
                  <option value="reward">Reward</option>
                  <option value="support">Support</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Action URL (optional)
                </label>
                <input
                  type="text"
                  value={targetedForm.action_url}
                  onChange={(e) => setTargetedForm({ ...targetedForm, action_url: e.target.value })}
                  className="input w-full"
                  placeholder="Deep link or URL..."
                />
              </div>
            </div>

            <div className="pt-4 border-t border-dark-100">
              <button
                onClick={handleTargeted}
                disabled={sending}
                className="btn-primary flex items-center gap-2"
              >
                {sending ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Send size={18} />
                    Send Notification
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="mt-8 card p-6 bg-dark-300/50">
        <h3 className="font-semibold text-white mb-4">Best Practices</h3>
        <ul className="space-y-2 text-sm text-gray-400">
          <li className="flex items-start gap-2">
            <span className="text-primary-400">*</span>
            Keep titles short and action-oriented (under 50 characters)
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary-400">*</span>
            Include clear value proposition in the message
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary-400">*</span>
            Schedule broadcasts during peak activity hours (18:00-22:00 local time)
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary-400">*</span>
            Avoid sending more than 2-3 broadcasts per day
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary-400">*</span>
            Use deep links to drive users to specific in-game content
          </li>
        </ul>
      </div>
    </div>
  );
}
