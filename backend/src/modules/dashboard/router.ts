import { Router } from 'express';

import { requireActiveUser, requireAuth } from '../identity/guards';
import { dashboardService } from './dashboard.service';

const router = Router();

router.use(requireAuth, requireActiveUser);

router.get('/', async (req, res, next) => {
  try {
    const summary = await dashboardService.getSummary(req.user!.id);
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});

router.get('/summary', async (req, res, next) => {
  try {
    const summary = await dashboardService.getSummary(req.user!.id);
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});

router.get('/offline', async (req, res, next) => {
  try {
    const snapshot = await dashboardService.getOfflineSnapshot(req.user!.id);
    res.status(200).json(snapshot);
  } catch (error) {
    next(error);
  }
});

export { router as dashboardRouter };
