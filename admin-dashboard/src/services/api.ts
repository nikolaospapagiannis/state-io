const API_BASE = '/api';

class ApiService {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('adminToken', token);
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('adminToken');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('adminToken');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string) {
    return this.request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async verifyToken() {
    return this.request<any>('/auth/me');
  }

  // Dashboard
  async getMetrics() {
    return this.request<any>('/admin/dashboard/metrics');
  }

  async getRevenue(days = 30) {
    return this.request<any>(`/admin/dashboard/revenue?days=${days}`);
  }

  async getGrowth(days = 30) {
    return this.request<any>(`/admin/dashboard/growth?days=${days}`);
  }

  async getOnlineStats() {
    return this.request<any>('/admin/dashboard/online');
  }

  async getTopPlayers(limit = 50) {
    return this.request<any>(`/admin/dashboard/top-players?limit=${limit}`);
  }

  async getAuditLog(limit = 50, offset = 0) {
    return this.request<any>(`/admin/dashboard/audit-log?limit=${limit}&offset=${offset}`);
  }

  // Players
  async searchPlayers(query = '', sortBy = 'created_at', order = 'desc', limit = 50, offset = 0) {
    return this.request<any>(
      `/admin/players/search?query=${encodeURIComponent(query)}&sortBy=${sortBy}&order=${order}&limit=${limit}&offset=${offset}`
    );
  }

  async getPlayer(playerId: string) {
    return this.request<any>(`/admin/players/${playerId}`);
  }

  async updatePlayer(playerId: string, data: any) {
    return this.request<any>(`/admin/players/${playerId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async banPlayer(playerId: string, reason: string, type: string, duration?: number) {
    return this.request<any>(`/admin/players/${playerId}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason, type, duration }),
    });
  }

  async unbanPlayer(playerId: string) {
    return this.request<any>(`/admin/players/${playerId}/ban`, {
      method: 'DELETE',
    });
  }

  async compensatePlayer(playerId: string, data: any) {
    return this.request<any>(`/admin/players/${playerId}/compensate`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Moderation
  async getReports(status = 'pending', limit = 50, offset = 0) {
    return this.request<any>(`/admin/moderation/reports?status=${status}&limit=${limit}&offset=${offset}`);
  }

  async getReport(reportId: string) {
    return this.request<any>(`/admin/moderation/reports/${reportId}`);
  }

  async assignReport(reportId: string) {
    return this.request<any>(`/admin/moderation/reports/${reportId}/assign`, {
      method: 'POST',
    });
  }

  async resolveReport(reportId: string, resolution: string, action?: string, banDuration?: string) {
    return this.request<any>(`/admin/moderation/reports/${reportId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution, action, banDuration }),
    });
  }

  async getBans(limit = 50, offset = 0) {
    return this.request<any>(`/admin/moderation/bans?limit=${limit}&offset=${offset}`);
  }

  async getChatLogs(flaggedOnly = true, limit = 50, offset = 0) {
    return this.request<any>(`/admin/moderation/chat-logs?flagged=${flaggedOnly}&limit=${limit}&offset=${offset}`);
  }

  // Events
  async getEvents(status?: string, limit = 50) {
    return this.request<any>(`/admin/events?${status ? `status=${status}&` : ''}limit=${limit}`);
  }

  async getEvent(eventId: string) {
    return this.request<any>(`/admin/events/${eventId}`);
  }

  async createEvent(data: any) {
    return this.request<any>('/admin/events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEvent(eventId: string, data: any) {
    return this.request<any>(`/admin/events/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteEvent(eventId: string) {
    return this.request<any>(`/admin/events/${eventId}`, {
      method: 'DELETE',
    });
  }

  // Offers
  async getOffers(activeOnly = false, limit = 50) {
    return this.request<any>(`/admin/events/offers/list?active=${activeOnly}&limit=${limit}`);
  }

  async createOffer(data: any) {
    return this.request<any>('/admin/events/offers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async toggleOffer(offerId: string, isActive: boolean) {
    return this.request<any>(`/admin/events/offers/${offerId}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
  }

  // Notifications
  async broadcastNotification(data: any) {
    return this.request<any>('/admin/events/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async sendNotification(playerId: string, data: any) {
    return this.request<any>(`/admin/events/notifications/send/${playerId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiService();
