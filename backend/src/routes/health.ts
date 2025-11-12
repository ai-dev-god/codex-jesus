import { Router } from 'express';

import { healthService, HealthService } from '../observability/health/service';

type HealthRouterOptions = {
  service?: HealthService;
};

export const createHealthRouter = (options: HealthRouterOptions = {}): Router => {
  const service = options.service ?? healthService;
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const snapshot = await service.liveness();
      req.log?.debug('Liveness check successful', { snapshot });
      res.status(200).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  router.get('/readiness', async (req, res, next) => {
    try {
      const snapshot = await service.readiness();
      req.log?.info('Readiness check completed', { status: snapshot.status });
      const status = snapshot.status === 'fail' ? 503 : 200;
      res.status(status).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  return router;
};

export const healthRouter = createHealthRouter();
