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

  // ============ ANALYTICS DASHBOARD ============

  // Overview metrics (DAU, MAU, revenue, engagement)
  async getAnalyticsOverview() {
    return this.request<any>('/admin/analytics/overview');
  }

  // DAU trend over time
  async getDAUTrend(days = 30) {
    return this.request<any>(`/admin/analytics/dau-trend?days=${days}`);
  }

  // Revenue trend over time
  async getRevenueTrend(days = 30) {
    return this.request<any>(`/admin/analytics/revenue-trend?days=${days}`);
  }

  // Revenue breakdown by product type
  async getRevenueBreakdown(days = 30) {
    return this.request<any>(`/admin/analytics/revenue-breakdown?days=${days}`);
  }

  // Subscription metrics
  async getSubscriptionMetrics() {
    return this.request<any>('/admin/analytics/subscriptions');
  }

  // Top spenders
  async getTopSpenders(limit = 20) {
    return this.request<any>(`/admin/analytics/top-spenders?limit=${limit}`);
  }

  // Retention metrics
  async getRetentionMetrics() {
    return this.request<any>('/admin/analytics/retention');
  }

  // Match statistics
  async getMatchStats(days = 30) {
    return this.request<any>(`/admin/analytics/matches?days=${days}`);
  }

  // Hourly activity distribution
  async getHourlyActivity(days = 7) {
    return this.request<any>(`/admin/analytics/hourly-activity?days=${days}`);
  }

  // New user registrations
  async getNewUsers(days = 30) {
    return this.request<any>(`/admin/analytics/new-users?days=${days}`);
  }

  // Real-time metrics (for auto-refresh)
  async getRealtimeMetrics() {
    return this.request<any>('/admin/analytics/realtime');
  }

  // ============ COHORT ANALYSIS ============

  // Cohort retention analysis
  async getCohortRetention(weeks = 8) {
    return this.request<any>(`/admin/cohorts/retention?weeks=${weeks}`);
  }

  // Cohort revenue analysis
  async getCohortRevenue(weeks = 8) {
    return this.request<any>(`/admin/cohorts/revenue?weeks=${weeks}`);
  }

  // Cohort engagement analysis
  async getCohortEngagement(weeks = 8) {
    return this.request<any>(`/admin/cohorts/engagement?weeks=${weeks}`);
  }

  // Cohort conversion analysis
  async getCohortConversion(weeks = 8) {
    return this.request<any>(`/admin/cohorts/conversion?weeks=${weeks}`);
  }

  // Daily cohort overview
  async getDailyCohorts(days = 30) {
    return this.request<any>(`/admin/cohorts/daily?days=${days}`);
  }

  // LTV curve by cohort age
  async getLTVCurve() {
    return this.request<any>('/admin/cohorts/ltv-curve');
  }

  // ============ FUNNEL ANALYSIS ============

  // All funnels overview
  async getFunnelsOverview(days = 30) {
    return this.request<any>(`/admin/funnels/overview?days=${days}`);
  }

  // Tutorial completion funnel
  async getTutorialFunnel(days = 30) {
    return this.request<any>(`/admin/funnels/tutorial?days=${days}`);
  }

  // First purchase funnel
  async getFirstPurchaseFunnel(days = 30) {
    return this.request<any>(`/admin/funnels/first-purchase?days=${days}`);
  }

  // Battle pass conversion funnel
  async getBattlePassFunnel(days = 30) {
    return this.request<any>(`/admin/funnels/battle-pass?days=${days}`);
  }

  // Subscription conversion funnel
  async getSubscriptionFunnel(days = 30) {
    return this.request<any>(`/admin/funnels/subscription?days=${days}`);
  }

  // Social engagement funnel
  async getSocialFunnel(days = 30) {
    return this.request<any>(`/admin/funnels/social?days=${days}`);
  }

  // Ranked progression funnel
  async getRankedFunnel(days = 30) {
    return this.request<any>(`/admin/funnels/ranked?days=${days}`);
  }

  // Custom funnel analysis
  async analyzeCustomFunnel(events: string[], days = 30) {
    return this.request<any>('/admin/funnels/custom', {
      method: 'POST',
      body: JSON.stringify({ events, days }),
    });
  }

  // ============ REVENUE TRACKING ============

  // Get purchases with attribution
  async getPurchases(days = 30, limit = 50, offset = 0) {
    return this.request<any>(`/admin/revenue/purchases?days=${days}&limit=${limit}&offset=${offset}`);
  }

  // Revenue by attribution
  async getRevenueAttribution(days = 30) {
    return this.request<any>(`/admin/revenue/attribution?days=${days}`);
  }

  // Get refunds
  async getRefunds(days = 30, limit = 50, offset = 0) {
    return this.request<any>(`/admin/revenue/refunds?days=${days}&limit=${limit}&offset=${offset}`);
  }

  // Get pending refunds
  async getPendingRefunds() {
    return this.request<any>('/admin/revenue/refunds/pending');
  }

  // Process refund
  async processRefund(refundId: string, action: 'approve' | 'deny') {
    return this.request<any>(`/admin/revenue/refunds/${refundId}/process`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  }

  // Subscription churn analysis
  async getSubscriptionChurn() {
    return this.request<any>('/admin/revenue/subscriptions/churn');
  }

  // Subscription events
  async getSubscriptionEvents(days = 30, limit = 50) {
    return this.request<any>(`/admin/revenue/subscriptions/events?days=${days}&limit=${limit}`);
  }

  // Product performance
  async getProductPerformance(days = 30, limit = 20) {
    return this.request<any>(`/admin/revenue/products?days=${days}&limit=${limit}`);
  }

  // Hourly revenue distribution
  async getHourlyRevenue(days = 7) {
    return this.request<any>(`/admin/revenue/hourly?days=${days}`);
  }

  // LTV distribution
  async getLTVDistribution() {
    return this.request<any>('/admin/revenue/ltv-distribution');
  }
}

export const api = new ApiService();
