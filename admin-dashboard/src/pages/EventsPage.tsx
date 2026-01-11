import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Plus,
  Play,
  Pause,
  Trash2,
  Edit,
  Users,
  Trophy,
  Gift,
  Clock,
} from 'lucide-react';
import { api } from '../services/api';
import { Modal } from '../components/Modal';

interface GameEvent {
  id: string;
  name: string;
  type: string;
  description: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'active' | 'ended' | 'cancelled';
  rewards: any;
  requirements?: any;
  participants_count: number;
  created_at: string;
}

export function EventsPage() {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<GameEvent | null>(null);

  const [eventForm, setEventForm] = useState({
    name: '',
    type: 'tournament',
    description: '',
    start_time: '',
    end_time: '',
    rewards: { gems: 0, coins: 0, trophies: 0 },
  });

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getEvents(statusFilter || undefined, 50);
      setEvents(result.events || []);
    } catch (error) {
      console.error('Failed to load events:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleCreateEvent = async () => {
    try {
      await api.createEvent(eventForm);
      setShowCreateModal(false);
      resetForm();
      loadEvents();
    } catch (error) {
      console.error('Failed to create event:', error);
    }
  };

  const handleUpdateEvent = async () => {
    if (!selectedEvent) return;
    try {
      await api.updateEvent(selectedEvent.id, eventForm);
      setShowEditModal(false);
      setSelectedEvent(null);
      resetForm();
      loadEvents();
    } catch (error) {
      console.error('Failed to update event:', error);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    try {
      await api.deleteEvent(eventId);
      loadEvents();
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  };

  const resetForm = () => {
    setEventForm({
      name: '',
      type: 'tournament',
      description: '',
      start_time: '',
      end_time: '',
      rewards: { gems: 0, coins: 0, trophies: 0 },
    });
  };

  const openEditModal = (event: GameEvent) => {
    setSelectedEvent(event);
    setEventForm({
      name: event.name,
      type: event.type,
      description: event.description,
      start_time: event.start_time.slice(0, 16),
      end_time: event.end_time.slice(0, 16),
      rewards: event.rewards || { gems: 0, coins: 0, trophies: 0 },
    });
    setShowEditModal(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <span className="px-2 py-1 rounded-full bg-blue-600/20 text-blue-400 text-xs">Scheduled</span>;
      case 'active':
        return <span className="px-2 py-1 rounded-full bg-green-600/20 text-green-400 text-xs">Active</span>;
      case 'ended':
        return <span className="px-2 py-1 rounded-full bg-gray-600/20 text-gray-400 text-xs">Ended</span>;
      case 'cancelled':
        return <span className="px-2 py-1 rounded-full bg-red-600/20 text-red-400 text-xs">Cancelled</span>;
      default:
        return null;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'tournament':
        return <Trophy className="text-yellow-400" size={20} />;
      case 'challenge':
        return <Play className="text-green-400" size={20} />;
      case 'seasonal':
        return <Calendar className="text-blue-400" size={20} />;
      case 'special':
        return <Gift className="text-purple-400" size={20} />;
      default:
        return <Calendar className="text-gray-400" size={20} />;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const EventFormFields = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Event Name
        </label>
        <input
          type="text"
          value={eventForm.name}
          onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
          className="input w-full"
          placeholder="Enter event name..."
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Event Type
        </label>
        <select
          value={eventForm.type}
          onChange={(e) => setEventForm({ ...eventForm, type: e.target.value })}
          className="input w-full"
        >
          <option value="tournament">Tournament</option>
          <option value="challenge">Challenge</option>
          <option value="seasonal">Seasonal</option>
          <option value="special">Special</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Description
        </label>
        <textarea
          value={eventForm.description}
          onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
          className="input w-full h-24 resize-none"
          placeholder="Enter event description..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Start Time
          </label>
          <input
            type="datetime-local"
            value={eventForm.start_time}
            onChange={(e) => setEventForm({ ...eventForm, start_time: e.target.value })}
            className="input w-full"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            End Time
          </label>
          <input
            type="datetime-local"
            value={eventForm.end_time}
            onChange={(e) => setEventForm({ ...eventForm, end_time: e.target.value })}
            className="input w-full"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Rewards
        </label>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Gems</label>
            <input
              type="number"
              value={eventForm.rewards.gems}
              onChange={(e) =>
                setEventForm({
                  ...eventForm,
                  rewards: { ...eventForm.rewards, gems: parseInt(e.target.value) || 0 },
                })
              }
              className="input w-full"
              min={0}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Coins</label>
            <input
              type="number"
              value={eventForm.rewards.coins}
              onChange={(e) =>
                setEventForm({
                  ...eventForm,
                  rewards: { ...eventForm.rewards, coins: parseInt(e.target.value) || 0 },
                })
              }
              className="input w-full"
              min={0}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Trophies</label>
            <input
              type="number"
              value={eventForm.rewards.trophies}
              onChange={(e) =>
                setEventForm({
                  ...eventForm,
                  rewards: { ...eventForm.rewards, trophies: parseInt(e.target.value) || 0 },
                })
              }
              className="input w-full"
              min={0}
            />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Events</h1>
          <p className="text-gray-500">Manage game events and tournaments</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          Create Event
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input"
        >
          <option value="">All Status</option>
          <option value="scheduled">Scheduled</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Events Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      ) : events.length === 0 ? (
        <div className="card p-12 text-center">
          <Calendar className="mx-auto text-gray-600 mb-4" size={48} />
          <p className="text-gray-500">No events found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <div key={event.id} className="card p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-dark-300">
                    {getTypeIcon(event.type)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{event.name}</h3>
                    <p className="text-sm text-gray-500 capitalize">{event.type}</p>
                  </div>
                </div>
                {getStatusBadge(event.status)}
              </div>

              <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                {event.description || 'No description'}
              </p>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <Clock size={14} className="text-gray-500" />
                  <span className="text-gray-400">
                    {formatDate(event.start_time)} - {formatDate(event.end_time)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users size={14} className="text-gray-500" />
                  <span className="text-gray-400">
                    {event.participants_count.toLocaleString()} participants
                  </span>
                </div>
              </div>

              {event.rewards && (
                <div className="flex gap-3 mb-4 text-sm">
                  {event.rewards.gems > 0 && (
                    <span className="text-purple-400">{event.rewards.gems} gems</span>
                  )}
                  {event.rewards.coins > 0 && (
                    <span className="text-yellow-400">{event.rewards.coins} coins</span>
                  )}
                  {event.rewards.trophies > 0 && (
                    <span className="text-yellow-500">{event.rewards.trophies} trophies</span>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t border-dark-100">
                <button
                  onClick={() => openEditModal(event)}
                  className="btn-secondary flex-1 flex items-center justify-center gap-2"
                >
                  <Edit size={16} />
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteEvent(event.id)}
                  className="p-2 rounded-lg hover:bg-red-900/20 text-red-400"
                  title="Delete"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Event"
        size="lg"
      >
        <EventFormFields />
        <div className="flex gap-3 pt-6">
          <button onClick={handleCreateEvent} className="btn-primary flex-1">
            Create Event
          </button>
          <button onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">
            Cancel
          </button>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Event"
        size="lg"
      >
        <EventFormFields />
        <div className="flex gap-3 pt-6">
          <button onClick={handleUpdateEvent} className="btn-primary flex-1">
            Save Changes
          </button>
          <button onClick={() => setShowEditModal(false)} className="btn-secondary flex-1">
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
