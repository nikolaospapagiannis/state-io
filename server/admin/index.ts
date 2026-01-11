import { Router } from 'express';
import { dashboardRouter } from './dashboard';
import { playersRouter } from './players';
import { moderationRouter } from './moderation';
import { eventsRouter } from './events';
import { analyticsDashboardRouter } from './analytics-dashboard';
import { cohortAnalysisRouter } from './cohort-analysis';
import { funnelAnalysisRouter } from './funnel-analysis';
import { revenueTrackingRouter } from './revenue-tracking';

const router = Router();

// Mount admin sub-routers
router.use('/dashboard', dashboardRouter);
router.use('/players', playersRouter);
router.use('/moderation', moderationRouter);
router.use('/events', eventsRouter);

// Wave 2: Analytics & Revenue
router.use('/analytics', analyticsDashboardRouter);
router.use('/cohorts', cohortAnalysisRouter);
router.use('/funnels', funnelAnalysisRouter);
router.use('/revenue', revenueTrackingRouter);

export { router as adminRouter };
export * from './auth';
