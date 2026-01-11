import { Express } from 'express';
import { authenticateToken } from './auth';

// Initialize social schema tables
import './social-schema';

// Import social routers
import { clanEnhancedRouter } from './clans-enhanced';
import { friendsEnhancedRouter } from './friends-enhanced';
import { referralRouter } from './referrals';
import { adminRouter } from './admin';

export function setupSocialRoutes(app: Express): void {
  // Enhanced clan routes (includes wars, perks, treasury, chat)
  app.use('/api/clans/v2', authenticateToken, clanEnhancedRouter);

  // Enhanced friend routes (includes activity, gifts, parties, spectator)
  app.use('/api/friends', authenticateToken, friendsEnhancedRouter);

  // Referral system
  app.use('/api/referrals', authenticateToken, referralRouter);

  // Admin dashboard (has its own auth middleware)
  app.use('/api/admin', authenticateToken, adminRouter);

  console.log('Social routes initialized:');
  console.log('  - /api/clans/v2 (Enhanced clan system)');
  console.log('  - /api/friends (Friends, parties, spectator)');
  console.log('  - /api/referrals (Referral system)');
  console.log('  - /api/admin (Admin dashboard)');
}
