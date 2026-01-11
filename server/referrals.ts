import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from './database';
import { socialQueries } from './social-schema';
import { AuthRequest } from './auth';

const router = Router();

// ============ REFERRAL MILESTONES CONFIG ============

const REFERRAL_MILESTONES = [
  { count: 1, rewardType: 'gems', rewardAmount: 50, name: 'First Recruit' },
  { count: 5, rewardType: 'gems', rewardAmount: 200, name: 'Squad Builder' },
  { count: 10, rewardType: 'gems', rewardAmount: 500, name: 'Recruiter' },
  { count: 25, rewardType: 'gems', rewardAmount: 1500, name: 'Commander' },
  { count: 50, rewardType: 'gems', rewardAmount: 5000, name: 'General' },
  { count: 100, rewardType: 'exclusive_skin', rewardAmount: 1, name: 'Legend' },
];

// ============ HELPER FUNCTIONS ============

function generateReferralCode(username: string): string {
  // Generate a unique code based on username + random chars
  const base = username.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${base}${random}`;
}

function checkAndCreateMilestones(userId: string, qualifiedCount: number): void {
  const existingMilestones = socialQueries.getMilestones.all(userId) as Array<{
    milestone_count: number;
  }>;

  const existingCounts = new Set(existingMilestones.map(m => m.milestone_count));

  for (const milestone of REFERRAL_MILESTONES) {
    if (qualifiedCount >= milestone.count && !existingCounts.has(milestone.count)) {
      const milestoneId = uuidv4();
      socialQueries.createMilestone.run(
        milestoneId,
        userId,
        milestone.count,
        milestone.rewardType,
        milestone.rewardAmount
      );
    }
  }
}

// ============ FRAUD DETECTION ============

interface FraudCheckResult {
  isSuspicious: boolean;
  reason?: string;
}

function checkForFraud(
  referrerId: string,
  deviceFingerprint: string | null,
  ipAddress: string | null
): FraudCheckResult {
  if (!deviceFingerprint && !ipAddress) {
    return { isSuspicious: false };
  }

  // Check for same device fingerprint used by referrer
  if (deviceFingerprint) {
    const sameDevice = db.prepare(`
      SELECT COUNT(*) as count FROM referrals
      WHERE referrer_id = ? AND device_fingerprint = ?
    `).get(referrerId, deviceFingerprint) as { count: number };

    if (sameDevice.count > 0) {
      return { isSuspicious: true, reason: 'Same device already used for referral' };
    }
  }

  // Check for too many referrals from same IP
  if (ipAddress) {
    const sameIp = db.prepare(`
      SELECT COUNT(*) as count FROM referrals
      WHERE referrer_id = ? AND ip_address = ?
      AND created_at > strftime('%s', 'now') - 86400
    `).get(referrerId, ipAddress) as { count: number };

    if (sameIp.count >= 5) {
      return { isSuspicious: true, reason: 'Too many referrals from same IP in 24 hours' };
    }
  }

  // Check for rapid referrals (more than 10 in last hour)
  const rapidReferrals = db.prepare(`
    SELECT COUNT(*) as count FROM referrals
    WHERE referrer_id = ?
    AND created_at > strftime('%s', 'now') - 3600
  `).get(referrerId) as { count: number };

  if (rapidReferrals.count >= 10) {
    return { isSuspicious: true, reason: 'Too many referrals in short time period' };
  }

  return { isSuspicious: false };
}

// ============ ROUTES ============

// Get my referral code
router.get('/code', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    let codeRow = socialQueries.getReferralCode.get(req.user.id) as {
      id: string;
      code: string;
      uses_count: number;
      created_at: number;
    } | undefined;

    if (!codeRow) {
      // Create a new referral code for this user
      const codeId = uuidv4();
      const code = generateReferralCode(req.user.username);

      socialQueries.createReferralCode.run(codeId, req.user.id, code);

      codeRow = {
        id: codeId,
        code,
        uses_count: 0,
        created_at: Math.floor(Date.now() / 1000),
      };
    }

    res.json({
      code: codeRow.code,
      usesCount: codeRow.uses_count,
      shareLink: `https://stateio.game/ref/${codeRow.code}`,
    });
  } catch (error) {
    console.error('Get referral code error:', error);
    res.status(500).json({ error: 'Failed to get referral code' });
  }
});

// Get referral stats
router.get('/stats', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const referrals = socialQueries.getReferralsByReferrer.all(req.user.id) as Array<{
      id: string;
      referred_id: string;
      status: string;
      created_at: number;
      qualified_at: number | null;
      username: string;
    }>;

    const qualified = referrals.filter(r => r.status === 'qualified');
    const pending = referrals.filter(r => r.status === 'pending');

    const milestones = socialQueries.getMilestones.all(req.user.id) as Array<{
      id: string;
      milestone_count: number;
      reward_type: string;
      reward_amount: number;
      claimed: number;
    }>;

    // Get next milestone
    const qualifiedCount = qualified.length;
    const nextMilestone = REFERRAL_MILESTONES.find(m => m.count > qualifiedCount);

    res.json({
      totalReferrals: referrals.length,
      qualifiedReferrals: qualified.length,
      pendingReferrals: pending.length,
      referrals: referrals.map(r => ({
        id: r.id,
        username: r.username,
        status: r.status,
        referredAt: r.created_at,
        qualifiedAt: r.qualified_at,
      })),
      milestones: milestones.map(m => {
        const config = REFERRAL_MILESTONES.find(c => c.count === m.milestone_count);
        return {
          id: m.id,
          count: m.milestone_count,
          name: config?.name || `${m.milestone_count} Referrals`,
          rewardType: m.reward_type,
          rewardAmount: m.reward_amount,
          claimed: m.claimed === 1,
          unlocked: true,
        };
      }),
      nextMilestone: nextMilestone ? {
        count: nextMilestone.count,
        name: nextMilestone.name,
        rewardType: nextMilestone.rewardType,
        rewardAmount: nextMilestone.rewardAmount,
        progress: qualifiedCount,
      } : null,
    });
  } catch (error) {
    console.error('Get referral stats error:', error);
    res.status(500).json({ error: 'Failed to get referral stats' });
  }
});

// Claim referral with code (called during registration)
router.post('/claim', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { code, deviceFingerprint } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || null;

    if (!code) {
      res.status(400).json({ error: 'Referral code is required' });
      return;
    }

    // Check if user was already referred
    const existingReferral = socialQueries.getReferral.get(req.user.id);
    if (existingReferral) {
      res.status(400).json({ error: 'You have already used a referral code' });
      return;
    }

    // Find the referral code
    const codeRow = socialQueries.getReferralByCode.get(code.toUpperCase()) as {
      id: string;
      user_id: string;
      uses_count: number;
      max_uses: number | null;
    } | undefined;

    if (!codeRow) {
      res.status(404).json({ error: 'Invalid referral code' });
      return;
    }

    // Cannot use own code
    if (codeRow.user_id === req.user.id) {
      res.status(400).json({ error: 'Cannot use your own referral code' });
      return;
    }

    // Check max uses
    if (codeRow.max_uses !== null && codeRow.uses_count >= codeRow.max_uses) {
      res.status(400).json({ error: 'This referral code has reached its limit' });
      return;
    }

    // Fraud check
    const fraudCheck = checkForFraud(codeRow.user_id, deviceFingerprint || null, ipAddress);
    if (fraudCheck.isSuspicious) {
      // Log the attempt but don't process
      console.warn(`Suspicious referral attempt: ${fraudCheck.reason}`, {
        referrerId: codeRow.user_id,
        referredId: req.user.id,
        deviceFingerprint,
        ipAddress,
      });
      res.status(400).json({ error: 'Unable to process referral at this time' });
      return;
    }

    // Create the referral
    const referralId = uuidv4();
    socialQueries.createReferral.run(
      referralId,
      codeRow.user_id,
      req.user.id,
      code.toUpperCase(),
      deviceFingerprint || null,
      ipAddress
    );

    // Increment uses count
    socialQueries.incrementReferralUses.run(code.toUpperCase());

    res.json({
      message: 'Referral code applied successfully',
      referrerId: codeRow.user_id,
    });
  } catch (error) {
    console.error('Claim referral error:', error);
    res.status(500).json({ error: 'Failed to claim referral' });
  }
});

// Qualify a referral (called when referred user completes certain actions)
router.post('/qualify/:referralId', (req: AuthRequest, res: Response) => {
  try {
    // This endpoint would typically be called internally by the game logic
    // when a referred user completes qualifying actions (e.g., plays 5 games)

    const { referralId } = req.params;
    const { adminKey } = req.body;

    // Simple admin key check - in production, use proper auth
    if (adminKey !== process.env.ADMIN_KEY) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }

    const referral = db.prepare('SELECT * FROM referrals WHERE id = ?').get(referralId) as {
      id: string;
      referrer_id: string;
      status: string;
    } | undefined;

    if (!referral) {
      res.status(404).json({ error: 'Referral not found' });
      return;
    }

    if (referral.status === 'qualified') {
      res.status(400).json({ error: 'Referral already qualified' });
      return;
    }

    // Qualify the referral
    socialQueries.qualifyReferral.run(referralId);

    // Check and create milestones
    const qualifiedCount = socialQueries.getQualifiedReferralCount.get(referral.referrer_id) as { count: number };
    checkAndCreateMilestones(referral.referrer_id, qualifiedCount.count);

    res.json({
      message: 'Referral qualified',
      referrerId: referral.referrer_id,
      qualifiedCount: qualifiedCount.count,
    });
  } catch (error) {
    console.error('Qualify referral error:', error);
    res.status(500).json({ error: 'Failed to qualify referral' });
  }
});

// Claim milestone reward
router.post('/milestone/:milestoneId/claim', (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { milestoneId } = req.params;

    const milestone = db.prepare(`
      SELECT * FROM referral_milestones WHERE id = ? AND user_id = ?
    `).get(milestoneId, req.user.id) as {
      id: string;
      reward_type: string;
      reward_amount: number;
      claimed: number;
    } | undefined;

    if (!milestone) {
      res.status(404).json({ error: 'Milestone not found' });
      return;
    }

    if (milestone.claimed === 1) {
      res.status(400).json({ error: 'Milestone already claimed' });
      return;
    }

    // Claim the milestone
    socialQueries.claimMilestone.run(milestoneId, req.user.id);

    // TODO: Actually grant the reward to the user
    // This would involve updating player_currencies or player_items

    res.json({
      message: 'Milestone reward claimed',
      rewardType: milestone.reward_type,
      rewardAmount: milestone.reward_amount,
    });
  } catch (error) {
    console.error('Claim milestone error:', error);
    res.status(500).json({ error: 'Failed to claim milestone' });
  }
});

// Get all milestones config (public)
router.get('/milestones', (_req: AuthRequest, res: Response) => {
  try {
    res.json({
      milestones: REFERRAL_MILESTONES.map(m => ({
        count: m.count,
        name: m.name,
        rewardType: m.rewardType,
        rewardAmount: m.rewardAmount,
      })),
    });
  } catch (error) {
    console.error('Get milestones error:', error);
    res.status(500).json({ error: 'Failed to get milestones' });
  }
});

// Validate referral code (public, for registration page)
router.get('/validate/:code', (_req: AuthRequest, res: Response) => {
  try {
    const { code } = _req.params;

    const codeRow = socialQueries.getReferralByCode.get(code.toUpperCase()) as {
      user_id: string;
      uses_count: number;
      max_uses: number | null;
    } | undefined;

    if (!codeRow) {
      res.json({ valid: false });
      return;
    }

    if (codeRow.max_uses !== null && codeRow.uses_count >= codeRow.max_uses) {
      res.json({ valid: false, reason: 'Code has reached its limit' });
      return;
    }

    // Get referrer info
    const referrer = db.prepare('SELECT username, avatar FROM users WHERE id = ?')
      .get(codeRow.user_id) as { username: string; avatar: string } | undefined;

    res.json({
      valid: true,
      referrer: referrer ? {
        username: referrer.username,
        avatar: referrer.avatar,
      } : null,
    });
  } catch (error) {
    console.error('Validate code error:', error);
    res.status(500).json({ error: 'Failed to validate code' });
  }
});

export { router as referralRouter };
