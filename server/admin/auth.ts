import { Response, NextFunction } from 'express';
import { AuthRequest } from '../auth';
import { socialQueries } from '../social-schema';

export interface AdminUser {
  userId: string;
  role: 'super_admin' | 'admin' | 'moderator';
  permissions: string[];
}

export interface AdminRequest extends AuthRequest {
  admin?: AdminUser;
}

// Admin role hierarchy
const ROLE_HIERARCHY = {
  super_admin: 3,
  admin: 2,
  moderator: 1,
};

// Permission definitions
export const PERMISSIONS = {
  // Player management
  VIEW_PLAYERS: 'view_players',
  EDIT_PLAYERS: 'edit_players',
  BAN_PLAYERS: 'ban_players',

  // Content management
  MANAGE_EVENTS: 'manage_events',
  MANAGE_OFFERS: 'manage_offers',
  MANAGE_ITEMS: 'manage_items',

  // Moderation
  VIEW_REPORTS: 'view_reports',
  RESOLVE_REPORTS: 'resolve_reports',
  VIEW_CHAT_LOGS: 'view_chat_logs',

  // Analytics
  VIEW_ANALYTICS: 'view_analytics',
  VIEW_REVENUE: 'view_revenue',

  // Admin management
  MANAGE_ADMINS: 'manage_admins',
  VIEW_AUDIT_LOG: 'view_audit_log',

  // System
  MANAGE_CONFIG: 'manage_config',
  SEND_NOTIFICATIONS: 'send_notifications',
};

// Default permissions by role
const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  moderator: [
    PERMISSIONS.VIEW_PLAYERS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.RESOLVE_REPORTS,
    PERMISSIONS.VIEW_CHAT_LOGS,
  ],
  admin: [
    PERMISSIONS.VIEW_PLAYERS,
    PERMISSIONS.EDIT_PLAYERS,
    PERMISSIONS.BAN_PLAYERS,
    PERMISSIONS.MANAGE_EVENTS,
    PERMISSIONS.MANAGE_OFFERS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.RESOLVE_REPORTS,
    PERMISSIONS.VIEW_CHAT_LOGS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.SEND_NOTIFICATIONS,
  ],
  super_admin: Object.values(PERMISSIONS),
};

// Middleware to check if user is an admin
export function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const adminUser = socialQueries.getAdminUser.get(req.user.id) as {
    user_id: string;
    role: string;
    permissions: string;
  } | undefined;

  if (!adminUser) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  const permissions = adminUser.permissions
    ? JSON.parse(adminUser.permissions)
    : DEFAULT_PERMISSIONS[adminUser.role] || [];

  req.admin = {
    userId: adminUser.user_id,
    role: adminUser.role as AdminUser['role'],
    permissions,
  };

  next();
}

// Middleware to check specific permission
export function requirePermission(permission: string) {
  return (req: AdminRequest, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    // Super admins have all permissions
    if (req.admin.role === 'super_admin') {
      next();
      return;
    }

    if (!req.admin.permissions.includes(permission)) {
      res.status(403).json({ error: `Permission '${permission}' required` });
      return;
    }

    next();
  };
}

// Check if admin has higher or equal role
export function hasRoleAccess(adminRole: string, targetRole: string): boolean {
  const adminLevel = ROLE_HIERARCHY[adminRole as keyof typeof ROLE_HIERARCHY] || 0;
  const targetLevel = ROLE_HIERARCHY[targetRole as keyof typeof ROLE_HIERARCHY] || 0;
  return adminLevel >= targetLevel;
}

// Get all permissions for a role
export function getRolePermissions(role: string): string[] {
  return DEFAULT_PERMISSIONS[role] || [];
}
