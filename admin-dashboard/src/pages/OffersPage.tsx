import { useState, useEffect, useCallback } from 'react';
import {
  Gift,
  Plus,
  ToggleLeft,
  ToggleRight,
  DollarSign,
  Package,
  Tag,
  Clock,
} from 'lucide-react';
import { api } from '../services/api';
import { Modal } from '../components/Modal';

interface Offer {
  id: string;
  name: string;
  type: string;
  description: string;
  price: number;
  original_price?: number;
  discount_percent?: number;
  contents: any;
  is_active: boolean;
  start_time?: string;
  end_time?: string;
  max_purchases?: number;
  purchases_count: number;
  created_at: string;
}

export function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOnly, setActiveOnly] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [offerForm, setOfferForm] = useState({
    name: '',
    type: 'bundle',
    description: '',
    price: 0,
    original_price: 0,
    contents: { gems: 0, coins: 0 },
    is_active: true,
    start_time: '',
    end_time: '',
    max_purchases: 0,
  });

  const loadOffers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getOffers(activeOnly, 50);
      setOffers(result.offers || []);
    } catch (error) {
      console.error('Failed to load offers:', error);
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  const handleCreateOffer = async () => {
    try {
      await api.createOffer(offerForm);
      setShowCreateModal(false);
      resetForm();
      loadOffers();
    } catch (error) {
      console.error('Failed to create offer:', error);
    }
  };

  const handleToggleOffer = async (offerId: string, isActive: boolean) => {
    try {
      await api.toggleOffer(offerId, !isActive);
      loadOffers();
    } catch (error) {
      console.error('Failed to toggle offer:', error);
    }
  };

  const resetForm = () => {
    setOfferForm({
      name: '',
      type: 'bundle',
      description: '',
      price: 0,
      original_price: 0,
      contents: { gems: 0, coins: 0 },
      is_active: true,
      start_time: '',
      end_time: '',
      max_purchases: 0,
    });
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      bundle: 'bg-purple-600/20 text-purple-400',
      starter: 'bg-green-600/20 text-green-400',
      limited: 'bg-red-600/20 text-red-400',
      seasonal: 'bg-blue-600/20 text-blue-400',
      daily: 'bg-yellow-600/20 text-yellow-400',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs ${colors[type] || 'bg-gray-600/20 text-gray-400'}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Offers</h1>
          <p className="text-gray-500">Manage in-app purchase offers</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          Create Offer
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <label className="flex items-center gap-2 text-gray-400">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="rounded border-gray-600 bg-dark-300 text-primary-600 focus:ring-primary-500"
          />
          Active offers only
        </label>
      </div>

      {/* Offers Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      ) : offers.length === 0 ? (
        <div className="card p-12 text-center">
          <Gift className="mx-auto text-gray-600 mb-4" size={48} />
          <p className="text-gray-500">No offers found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {offers.map((offer) => (
            <div
              key={offer.id}
              className={`card p-6 ${!offer.is_active ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary-600/20">
                    <Gift className="text-primary-400" size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{offer.name}</h3>
                    {getTypeBadge(offer.type)}
                  </div>
                </div>
                <button
                  onClick={() => handleToggleOffer(offer.id, offer.is_active)}
                  className={`p-2 rounded-lg transition-colors ${
                    offer.is_active
                      ? 'text-green-400 hover:bg-green-900/20'
                      : 'text-gray-500 hover:bg-dark-100'
                  }`}
                  title={offer.is_active ? 'Deactivate' : 'Activate'}
                >
                  {offer.is_active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                </button>
              </div>

              <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                {offer.description || 'No description'}
              </p>

              {/* Price */}
              <div className="flex items-center gap-2 mb-4">
                <DollarSign size={16} className="text-green-400" />
                <span className="text-2xl font-bold text-green-400">{formatPrice(offer.price)}</span>
                {offer.original_price && offer.original_price > offer.price && (
                  <>
                    <span className="text-gray-500 line-through">{formatPrice(offer.original_price)}</span>
                    <span className="px-2 py-0.5 rounded bg-red-600/20 text-red-400 text-xs">
                      -{Math.round(((offer.original_price - offer.price) / offer.original_price) * 100)}%
                    </span>
                  </>
                )}
              </div>

              {/* Contents */}
              {offer.contents && (
                <div className="flex gap-3 mb-4 text-sm">
                  {offer.contents.gems > 0 && (
                    <div className="flex items-center gap-1">
                      <Package size={14} className="text-purple-400" />
                      <span className="text-purple-400">{offer.contents.gems.toLocaleString()} gems</span>
                    </div>
                  )}
                  {offer.contents.coins > 0 && (
                    <div className="flex items-center gap-1">
                      <Tag size={14} className="text-yellow-400" />
                      <span className="text-yellow-400">{offer.contents.coins.toLocaleString()} coins</span>
                    </div>
                  )}
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center justify-between text-sm text-gray-500 pt-4 border-t border-dark-100">
                <span>{offer.purchases_count} purchases</span>
                {offer.max_purchases > 0 && (
                  <span>Limit: {offer.max_purchases}</span>
                )}
              </div>

              {/* Time */}
              {(offer.start_time || offer.end_time) && (
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                  <Clock size={12} />
                  {offer.start_time && (
                    <span>From: {new Date(offer.start_time).toLocaleDateString()}</span>
                  )}
                  {offer.end_time && (
                    <span>Until: {new Date(offer.end_time).toLocaleDateString()}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Offer"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Offer Name
            </label>
            <input
              type="text"
              value={offerForm.name}
              onChange={(e) => setOfferForm({ ...offerForm, name: e.target.value })}
              className="input w-full"
              placeholder="Enter offer name..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Offer Type
            </label>
            <select
              value={offerForm.type}
              onChange={(e) => setOfferForm({ ...offerForm, type: e.target.value })}
              className="input w-full"
            >
              <option value="bundle">Bundle</option>
              <option value="starter">Starter Pack</option>
              <option value="limited">Limited Time</option>
              <option value="seasonal">Seasonal</option>
              <option value="daily">Daily Deal</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Description
            </label>
            <textarea
              value={offerForm.description}
              onChange={(e) => setOfferForm({ ...offerForm, description: e.target.value })}
              className="input w-full h-20 resize-none"
              placeholder="Enter offer description..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Price ($)
              </label>
              <input
                type="number"
                value={offerForm.price}
                onChange={(e) => setOfferForm({ ...offerForm, price: parseFloat(e.target.value) || 0 })}
                className="input w-full"
                min={0}
                step={0.01}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Original Price ($)
              </label>
              <input
                type="number"
                value={offerForm.original_price}
                onChange={(e) => setOfferForm({ ...offerForm, original_price: parseFloat(e.target.value) || 0 })}
                className="input w-full"
                min={0}
                step={0.01}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Contents
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Gems</label>
                <input
                  type="number"
                  value={offerForm.contents.gems}
                  onChange={(e) =>
                    setOfferForm({
                      ...offerForm,
                      contents: { ...offerForm.contents, gems: parseInt(e.target.value) || 0 },
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
                  value={offerForm.contents.coins}
                  onChange={(e) =>
                    setOfferForm({
                      ...offerForm,
                      contents: { ...offerForm.contents, coins: parseInt(e.target.value) || 0 },
                    })
                  }
                  className="input w-full"
                  min={0}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Start Time (optional)
              </label>
              <input
                type="datetime-local"
                value={offerForm.start_time}
                onChange={(e) => setOfferForm({ ...offerForm, start_time: e.target.value })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                End Time (optional)
              </label>
              <input
                type="datetime-local"
                value={offerForm.end_time}
                onChange={(e) => setOfferForm({ ...offerForm, end_time: e.target.value })}
                className="input w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Max Purchases (0 = unlimited)
            </label>
            <input
              type="number"
              value={offerForm.max_purchases}
              onChange={(e) => setOfferForm({ ...offerForm, max_purchases: parseInt(e.target.value) || 0 })}
              className="input w-full"
              min={0}
            />
          </div>

          <label className="flex items-center gap-2 text-gray-400">
            <input
              type="checkbox"
              checked={offerForm.is_active}
              onChange={(e) => setOfferForm({ ...offerForm, is_active: e.target.checked })}
              className="rounded border-gray-600 bg-dark-300 text-primary-600 focus:ring-primary-500"
            />
            Active immediately
          </label>
        </div>

        <div className="flex gap-3 pt-6">
          <button onClick={handleCreateOffer} className="btn-primary flex-1">
            Create Offer
          </button>
          <button onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
