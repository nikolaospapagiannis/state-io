import { Router } from 'express';
import { dashboardRouter } from './dashboard';
import { playersRouter } from './players';
import { moderationRouter } from './moderation';
import { eventsRouter } from './events';

const router = Router();

// Mount admin sub-routers
router.use('/dashboard', dashboardRouter);
router.use('/players', playersRouter);
router.use('/moderation', moderationRouter);
router.use('/events', eventsRouter);

export { router as adminRouter };
export * from './auth';
