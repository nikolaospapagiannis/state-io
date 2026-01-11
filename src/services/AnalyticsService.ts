/**
 * Client-side Analytics Service
 *
 * Handles event batching, session tracking, screen view tracking,
 * error tracking, and performance metrics for the game client.
 */

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// ============ TYPES ============

export interface AnalyticsEvent {
  eventType: string;
  eventData?: Record<string, unknown>;
  timestamp?: number;
}

export interface DeviceInfo {
  platform: string;
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  language: string;
  timezone: string;
}

export interface ScreenView {
  screen: string;
  enterTime: number;
  exitTime?: number;
  duration?: number;
}

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage?: number;
  loadTime?: number;
}

export interface ErrorInfo {
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// ============ ANALYTICS SERVICE ============

class AnalyticsService {
  private token: string | null = null;
  private sessionId: string | null = null;
  private eventQueue: AnalyticsEvent[] = [];
  private screenViews: ScreenView[] = [];
  private currentScreen: string | null = null;
  private batchInterval: ReturnType<typeof setInterval> | null = null;
  private sessionStartTime: number = 0;
  private isInitialized: boolean = false;

  // Performance tracking
  private frameCount: number = 0;
  private lastFpsTime: number = 0;
  private fpsValues: number[] = [];

  // Configuration
  private readonly BATCH_SIZE = 20;
  private readonly BATCH_INTERVAL_MS = 10000; // 10 seconds
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly FPS_SAMPLE_INTERVAL = 1000; // 1 second

  // ============ INITIALIZATION ============

  /**
   * Initialize the analytics service
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    // Get auth token
    this.token = localStorage.getItem('token');

    // Get device info
    const deviceInfo = this.getDeviceInfo();

    // Start session if authenticated
    if (this.token) {
      try {
        const response = await fetch(`${SERVER_URL}/api/analytics/session/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          },
          body: JSON.stringify({ deviceInfo })
        });

        if (response.ok) {
          const data = await response.json();
          this.sessionId = data.sessionId;
          this.sessionStartTime = Date.now();
          console.log('[Analytics] Session started:', this.sessionId);
        }
      } catch (error) {
        console.warn('[Analytics] Failed to start session:', error);
      }
    }

    // Start batch processing
    this.startBatchProcessing();

    // Setup visibility change listener for session end
    this.setupVisibilityListener();

    // Setup error tracking
    this.setupErrorTracking();

    // Setup performance tracking
    this.setupPerformanceTracking();

    // Setup beforeunload for session end
    this.setupUnloadListener();

    this.isInitialized = true;
    console.log('[Analytics] Initialized');
  }

  /**
   * Set auth token (called after login)
   */
  setToken(token: string): void {
    this.token = token;

    // Start session if not already started
    if (!this.sessionId) {
      this.init();
    }
  }

  /**
   * Clear token (called on logout)
   */
  clearToken(): void {
    this.endSession();
    this.token = null;
    this.sessionId = null;
  }

  // ============ DEVICE INFO ============

  private getDeviceInfo(): DeviceInfo {
    return {
      platform: this.detectPlatform(),
      userAgent: navigator.userAgent,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  private detectPlatform(): string {
    const ua = navigator.userAgent.toLowerCase();

    if (ua.includes('android')) return 'android';
    if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
    if (ua.includes('windows')) return 'windows';
    if (ua.includes('mac')) return 'macos';
    if (ua.includes('linux')) return 'linux';

    return 'web';
  }

  // ============ EVENT TRACKING ============

  /**
   * Track a single event
   */
  track(eventType: string, eventData?: Record<string, unknown>): void {
    const event: AnalyticsEvent = {
      eventType,
      eventData,
      timestamp: Math.floor(Date.now() / 1000)
    };

    this.eventQueue.push(event);

    // Flush if queue is full
    if (this.eventQueue.length >= this.MAX_QUEUE_SIZE) {
      this.flush();
    }
  }

  /**
   * Track game-specific events with common properties
   */
  trackGameEvent(eventType: string, eventData?: Record<string, unknown>): void {
    this.track(eventType, {
      ...eventData,
      sessionDuration: Math.floor((Date.now() - this.sessionStartTime) / 1000),
      screen: this.currentScreen
    });
  }

  // ============ SCREEN TRACKING ============

  /**
   * Track screen/scene view
   */
  trackScreen(screenName: string): void {
    const now = Math.floor(Date.now() / 1000);

    // Close previous screen view
    if (this.currentScreen && this.screenViews.length > 0) {
      const lastView = this.screenViews[this.screenViews.length - 1];
      if (!lastView.exitTime) {
        lastView.exitTime = now;
        lastView.duration = now - lastView.enterTime;
      }
    }

    // Add new screen view
    this.screenViews.push({
      screen: screenName,
      enterTime: now
    });

    this.currentScreen = screenName;

    // Track screen event
    this.track('screen_view', { screen: screenName });

    // Send to server if session active
    if (this.sessionId && this.token) {
      fetch(`${SERVER_URL}/api/analytics/session/screen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          screen: screenName
        })
      }).catch(() => {
        // Silently ignore - non-critical
      });
    }
  }

  /**
   * Get current screen
   */
  getCurrentScreen(): string | null {
    return this.currentScreen;
  }

  // ============ ERROR TRACKING ============

  /**
   * Track an error
   */
  trackError(error: Error | string, context?: Record<string, unknown>, severity: ErrorInfo['severity'] = 'medium'): void {
    const errorInfo: ErrorInfo = {
      message: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'object' ? error.stack : undefined,
      context,
      severity
    };

    this.track('error', {
      ...errorInfo,
      screen: this.currentScreen
    });

    // Flush immediately for high/critical errors
    if (severity === 'high' || severity === 'critical') {
      this.flush();
    }
  }

  private setupErrorTracking(): void {
    // Global error handler
    window.addEventListener('error', (event) => {
      this.trackError(event.error || event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }, 'high');
    });

    // Unhandled promise rejection
    window.addEventListener('unhandledrejection', (event) => {
      this.trackError(
        event.reason?.message || 'Unhandled Promise Rejection',
        { reason: String(event.reason) },
        'high'
      );
    });
  }

  // ============ PERFORMANCE TRACKING ============

  /**
   * Track a performance metric
   */
  trackPerformance(metrics: Partial<PerformanceMetrics>): void {
    this.track('performance', metrics);
  }

  /**
   * Record a frame for FPS calculation
   */
  recordFrame(): void {
    this.frameCount++;

    const now = performance.now();
    const elapsed = now - this.lastFpsTime;

    if (elapsed >= this.FPS_SAMPLE_INTERVAL) {
      const fps = Math.round((this.frameCount * 1000) / elapsed);
      this.fpsValues.push(fps);

      // Keep last 60 samples (1 minute at 1 sample/second)
      if (this.fpsValues.length > 60) {
        this.fpsValues.shift();
      }

      this.frameCount = 0;
      this.lastFpsTime = now;
    }
  }

  /**
   * Get average FPS
   */
  getAverageFps(): number {
    if (this.fpsValues.length === 0) return 0;
    return Math.round(this.fpsValues.reduce((a, b) => a + b, 0) / this.fpsValues.length);
  }

  private setupPerformanceTracking(): void {
    this.lastFpsTime = performance.now();

    // Track page load time
    if (window.performance && window.performance.timing) {
      window.addEventListener('load', () => {
        const timing = window.performance.timing;
        const loadTime = timing.loadEventEnd - timing.navigationStart;

        this.trackPerformance({ loadTime });
      });
    }

    // Periodically track performance metrics
    setInterval(() => {
      const avgFps = this.getAverageFps();
      if (avgFps > 0) {
        this.trackPerformance({
          fps: avgFps,
          frameTime: Math.round(1000 / avgFps)
        });
      }
    }, 60000); // Every minute
  }

  // ============ BATCH PROCESSING ============

  private startBatchProcessing(): void {
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
    }

    this.batchInterval = setInterval(() => {
      this.flush();
    }, this.BATCH_INTERVAL_MS);
  }

  /**
   * Flush event queue to server
   */
  async flush(): Promise<void> {
    if (!this.token || this.eventQueue.length === 0) return;

    // Take events from queue
    const events = this.eventQueue.splice(0, this.BATCH_SIZE);

    try {
      const response = await fetch(`${SERVER_URL}/api/analytics/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          events,
          sessionId: this.sessionId
        })
      });

      if (!response.ok) {
        // Put events back in queue on failure
        this.eventQueue.unshift(...events);
        console.warn('[Analytics] Failed to send events, will retry');
      }
    } catch (error) {
      // Put events back in queue on network error
      this.eventQueue.unshift(...events);
      console.warn('[Analytics] Network error, will retry:', error);
    }
  }

  // ============ SESSION MANAGEMENT ============

  private setupVisibilityListener(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // App going to background
        this.track('app_background', {
          sessionDuration: Math.floor((Date.now() - this.sessionStartTime) / 1000)
        });
        this.flush();
      } else {
        // App coming to foreground
        this.track('app_foreground');
      }
    });
  }

  private setupUnloadListener(): void {
    window.addEventListener('beforeunload', () => {
      this.endSession();
    });

    // Also handle page hide for mobile
    window.addEventListener('pagehide', () => {
      this.endSession();
    });
  }

  /**
   * End the current session
   */
  async endSession(): Promise<void> {
    if (!this.sessionId || !this.token) return;

    // Close current screen view
    if (this.screenViews.length > 0) {
      const lastView = this.screenViews[this.screenViews.length - 1];
      if (!lastView.exitTime) {
        const now = Math.floor(Date.now() / 1000);
        lastView.exitTime = now;
        lastView.duration = now - lastView.enterTime;
      }
    }

    // Flush remaining events
    await this.flush();

    // End session on server
    try {
      // Use sendBeacon for reliability on page unload
      const data = JSON.stringify({
        sessionId: this.sessionId,
        screenViews: this.screenViews
      });

      if (navigator.sendBeacon) {
        const blob = new Blob([data], { type: 'application/json' });
        navigator.sendBeacon(`${SERVER_URL}/api/analytics/session/end`, blob);
      } else {
        await fetch(`${SERVER_URL}/api/analytics/session/end`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          },
          body: data,
          keepalive: true
        });
      }
    } catch (error) {
      console.warn('[Analytics] Failed to end session:', error);
    }

    // Clear session data
    this.screenViews = [];
    this.currentScreen = null;
    console.log('[Analytics] Session ended');
  }

  // ============ COMMON GAME EVENTS ============

  /**
   * Track match start
   */
  trackMatchStart(matchId: string, mode: string, mapId?: number): void {
    this.track('match_start', {
      matchId,
      mode,
      mapId
    });
  }

  /**
   * Track match end
   */
  trackMatchEnd(
    matchId: string,
    won: boolean,
    duration: number,
    stats: {
      territoriesCaptured?: number;
      troopsSent?: number;
      eloChange?: number;
    }
  ): void {
    this.track('match_complete', {
      matchId,
      won,
      duration,
      ...stats
    });
  }

  /**
   * Track purchase
   */
  trackPurchase(
    itemId: string,
    itemName: string,
    amount: number,
    currency: string
  ): void {
    this.track('purchase', {
      itemId,
      itemName,
      amount,
      currency
    });
  }

  /**
   * Track ad view
   */
  trackAdView(adType: string, adPlacement: string): void {
    this.track('ad_view', {
      adType,
      adPlacement
    });
  }

  /**
   * Track social interaction
   */
  trackSocialInteraction(
    type: 'friend_add' | 'friend_invite' | 'clan_join' | 'clan_invite' | 'chat_message',
    targetId?: string
  ): void {
    this.track('social_interaction', {
      interactionType: type,
      targetId
    });
  }

  /**
   * Track tutorial progress
   */
  trackTutorialStep(step: string, completed: boolean): void {
    this.track('tutorial_step', {
      step,
      completed
    });
  }

  /**
   * Track level/map completion
   */
  trackLevelComplete(levelId: number, stars: number, time: number): void {
    this.track('level_complete', {
      levelId,
      stars,
      time
    });
  }

  /**
   * Track button click
   */
  trackButtonClick(buttonId: string, context?: string): void {
    this.track('button_click', {
      buttonId,
      context,
      screen: this.currentScreen
    });
  }

  /**
   * Track daily streak claim
   */
  trackStreakClaim(streakDay: number, reward: unknown): void {
    this.track('streak_claim', {
      streakDay,
      reward
    });
  }

  /**
   * Track notification interaction
   */
  trackNotification(
    action: 'received' | 'displayed' | 'clicked' | 'dismissed',
    notificationId: string,
    notificationType: string
  ): void {
    this.track('notification', {
      action,
      notificationId,
      notificationType
    });
  }

  // ============ UTILITY ============

  /**
   * Get session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get session duration in seconds
   */
  getSessionDuration(): number {
    if (!this.sessionStartTime) return 0;
    return Math.floor((Date.now() - this.sessionStartTime) / 1000);
  }

  /**
   * Get pending event count
   */
  getPendingEventCount(): number {
    return this.eventQueue.length;
  }

  /**
   * Force immediate flush
   */
  async forceFlush(): Promise<void> {
    await this.flush();
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }

    this.endSession();
    this.isInitialized = false;
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();

// Also export class for testing
export { AnalyticsService };
