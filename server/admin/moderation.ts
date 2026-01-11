import { Router, Response } from 'express';
import { db } from '../database';
import { socialQueries } from '../social-schema';
import { AdminRequest, requireAdmin, requirePermission, PERMISSIONS } from './auth';
import { logAdminAction } from './dashboard';

const router = Router();

router.use(requireAdmin);

// ============ REPORTS ============

// Get reports
router.get('/reports', requirePermission(PERMISSIONS.VIEW_REPORTS), (req: AdminRequest, res: Response) => {
  try {
    const status = (req.query.status as string) || 'pending';
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const reports = socialQueries.getReports.all(status, limit, offset) as Array<{
      id: string;
      reporter_id: string;
      reported_id: string;
      reason: string;
      description: string | null;
      evidence: string | null;
      status: string;
      assigned_to: string | null;
      resolved_at: number | null;
      resolution: string | null;
      created_at: number;
      reporter_name: string;
      reported_name: string;
    }>;

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM player_reports WHERE status = ?
    `).get(status) as { count: number };

    res.json({
      reports: reports.map(r => ({
        id: r.id,
        reporter: {
          id: r.reporter_id,
          username: r.reporter_name,
        },
        reported: {
          id: r.reported_id,
          username: r.reported_name,
        },
        reason: r.reason,
        description: r.description,
        evidence: r.evidence,
        status: r.status,
        assignedTo: r.assigned_to,
        resolvedAt: r.resolved_at,
        resolution: r.resolution,
        createdAt: r.created_at,
      })),
      total: total.count,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Failed to get reports' });
  }
});

// Get report details
router.get('/reports/:reportId', requirePermission(PERMISSIONS.VIEW_REPORTS), (req: AdminRequest, res: Response) => {
  try {
    const { reportId } = req.params;

    const report = socialQueries.getReport.get(reportId) as {
      id: string;
      reporter_id: string;
      reported_id: string;
      reason: string;
      description: string | null;
      evidence: string | null;
      status: string;
      assigned_to: string | null;
      resolved_at: number | null;
      resolution: string | null;
      created_at: number;
    } | undefined;

    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    // Get reporter and reported user details
    const reporter = db.prepare(`
      SELECT id, username, elo, avatar, created_at FROM users WHERE id = ?
    `).get(report.reporter_id) as { id: string; username: string; elo: number; avatar: string; created_at: number };

    const reported = db.prepare(`
      SELECT id, username, elo, avatar, created_at FROM users WHERE id = ?
    `).get(report.reported_id) as { id: string; username: string; elo: number; avatar: string; created_at: number };

    // Get reported user's ban history
    const banHistory = db.prepare(`
      SELECT * FROM player_bans WHERE user_id = ? ORDER BY created_at DESC LIMIT 5
    `).all(report.reported_id) as Array<{
      id: string;
      reason: string;
      ban_type: string;
      expires_at: number | null;
      created_at: number;
    }>;

    // Get previous reports against the reported user
    const previousReports = db.prepare(`
      SELECT COUNT(*) as count FROM player_reports
      WHERE reported_id = ? AND status = 'resolved' AND id != ?
    `).get(report.reported_id, reportId) as { count: number };

    res.json({
      report: {
        id: report.id,
        reason: report.reason,
        description: report.description,
        evidence: report.evidence,
        status: report.status,
        assignedTo: report.assigned_to,
        resolvedAt: report.resolved_at,
        resolution: report.resolution,
        createdAt: report.created_at,
      },
      reporter,
      reported: {
        ...reported,
        banHistory: banHistory.map(b => ({
          id: b.id,
          reason: b.reason,
          type: b.ban_type,
          expiresAt: b.expires_at,
          createdAt: b.created_at,
        })),
        previousReportCount: previousReports.count,
      },
    });
  } catch (error) {
    console.error('Get report details error:', error);
    res.status(500).json({ error: 'Failed to get report details' });
  }
});

// Assign report to self
router.post('/reports/:reportId/assign', requirePermission(PERMISSIONS.RESOLVE_REPORTS), (req: AdminRequest, res: Response) => {
  try {
    const { reportId } = req.params;

    const report = socialQueries.getReport.get(reportId) as { status: string } | undefined;
    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    if (report.status !== 'pending') {
      res.status(400).json({ error: 'Report is not pending' });
      return;
    }

    socialQueries.assignReport.run(req.admin!.userId, reportId);

    logAdminAction(
      req.admin!.userId,
      'ASSIGN_REPORT',
      'report',
      reportId,
      null,
      req.ip || null
    );

    res.json({ message: 'Report assigned to you' });
  } catch (error) {
    console.error('Assign report error:', error);
    res.status(500).json({ error: 'Failed to assign report' });
  }
});

// Resolve report
router.post('/reports/:reportId/resolve', requirePermission(PERMISSIONS.RESOLVE_REPORTS), (req: AdminRequest, res: Response) => {
  try {
    const { reportId } = req.params;
    const { resolution, action, banDuration } = req.body;

    if (!resolution) {
      res.status(400).json({ error: 'Resolution is required' });
      return;
    }

    const report = socialQueries.getReport.get(reportId) as {
      status: string;
      reported_id: string;
    } | undefined;

    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    if (report.status === 'resolved') {
      res.status(400).json({ error: 'Report is already resolved' });
      return;
    }

    // Resolve the report
    socialQueries.resolveReport.run(resolution, reportId);

    // Take action if specified
    if (action === 'warn') {
      // Send warning notification
      const notificationId = db.prepare(`SELECT lower(hex(randomblob(16))) as id`).get() as { id: string };
      db.prepare(`
        INSERT INTO player_notifications (id, player_id, type, title, message)
        VALUES (?, ?, 'warning', 'Account Warning', ?)
      `).run(notificationId.id, report.reported_id, resolution);
    } else if (action === 'ban') {
      // Create ban
      const banId = db.prepare(`SELECT lower(hex(randomblob(16))) as id`).get() as { id: string };
      const banType = banDuration === 'permanent' ? 'permanent' : 'temporary';
      let expiresAt = null;

      if (banType === 'temporary') {
        const hours = parseInt(banDuration) || 24;
        expiresAt = Math.floor(Date.now() / 1000) + hours * 60 * 60;
      }

      socialQueries.createBan.run(
        banId.id,
        report.reported_id,
        req.admin!.userId,
        resolution,
        banType,
        expiresAt
      );
    }

    logAdminAction(
      req.admin!.userId,
      'RESOLVE_REPORT',
      'report',
      reportId,
      { resolution, action, banDuration },
      req.ip || null
    );

    res.json({ message: 'Report resolved' });
  } catch (error) {
    console.error('Resolve report error:', error);
    res.status(500).json({ error: 'Failed to resolve report' });
  }
});

// ============ CHAT LOGS ============

// Get flagged chat logs
router.get('/chat-logs', requirePermission(PERMISSIONS.VIEW_CHAT_LOGS), (req: AdminRequest, res: Response) => {
  try {
    const flaggedOnly = req.query.flagged !== 'false';
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;

    let logs;
    if (flaggedOnly) {
      logs = socialQueries.getFlaggedChats.all(limit, offset);
    } else {
      logs = db.prepare(`
        SELECT cl.*, u.username FROM chat_logs cl
        JOIN users u ON cl.user_id = u.id
        ORDER BY cl.created_at DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset);
    }

    res.json({
      logs: (logs as Array<{
        id: string;
        user_id: string;
        username: string;
        chat_type: string;
        chat_id: string | null;
        message: string;
        flagged: number;
        created_at: number;
      }>).map(l => ({
        id: l.id,
        userId: l.user_id,
        username: l.username,
        chatType: l.chat_type,
        chatId: l.chat_id,
        message: l.message,
        flagged: l.flagged === 1,
        createdAt: l.created_at,
      })),
    });
  } catch (error) {
    console.error('Get chat logs error:', error);
    res.status(500).json({ error: 'Failed to get chat logs' });
  }
});

// Get chat history for a user
router.get('/chat-logs/user/:userId', requirePermission(PERMISSIONS.VIEW_CHAT_LOGS), (req: AdminRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(200, parseInt(req.query.limit as string) || 100);

    const logs = db.prepare(`
      SELECT * FROM chat_logs WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit) as Array<{
      id: string;
      chat_type: string;
      chat_id: string | null;
      message: string;
      flagged: number;
      created_at: number;
    }>;

    res.json({
      logs: logs.map(l => ({
        id: l.id,
        chatType: l.chat_type,
        chatId: l.chat_id,
        message: l.message,
        flagged: l.flagged === 1,
        createdAt: l.created_at,
      })),
    });
  } catch (error) {
    console.error('Get user chat logs error:', error);
    res.status(500).json({ error: 'Failed to get user chat logs' });
  }
});

// Flag a chat message
router.post('/chat-logs/:logId/flag', requirePermission(PERMISSIONS.VIEW_CHAT_LOGS), (req: AdminRequest, res: Response) => {
  try {
    const { logId } = req.params;

    socialQueries.flagChatLog.run(logId);

    logAdminAction(
      req.admin!.userId,
      'FLAG_CHAT',
      'chat_log',
      logId,
      null,
      req.ip || null
    );

    res.json({ message: 'Chat message flagged' });
  } catch (error) {
    console.error('Flag chat error:', error);
    res.status(500).json({ error: 'Failed to flag chat message' });
  }
});

// ============ BANS LIST ============

// Get all active bans
router.get('/bans', requirePermission(PERMISSIONS.BAN_PLAYERS), (req: AdminRequest, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const bans = socialQueries.getBans.all(limit, offset) as Array<{
      id: string;
      user_id: string;
      username: string;
      reason: string;
      ban_type: string;
      expires_at: number | null;
      created_at: number;
      banned_by_name: string;
    }>;

    const now = Math.floor(Date.now() / 1000);

    res.json({
      bans: bans.map(b => ({
        id: b.id,
        userId: b.user_id,
        username: b.username,
        reason: b.reason,
        type: b.ban_type,
        expiresAt: b.expires_at,
        createdAt: b.created_at,
        bannedBy: b.banned_by_name,
        active: b.expires_at === null || b.expires_at > now,
      })),
    });
  } catch (error) {
    console.error('Get bans error:', error);
    res.status(500).json({ error: 'Failed to get bans' });
  }
});

export { router as moderationRouter };
