import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';

import env from './config/env';
import { observabilityMiddleware } from './observability/middleware';
import { healthRouter } from './routes/health';
import { requestContext } from './modules/observability-ops/request-context';
import { notFoundHandler } from './modules/observability-ops/not-found-handler';
import { errorHandler } from './modules/observability-ops/error-handler';
import { sessionMiddleware } from './modules/identity/session-middleware';
import { authRouter } from './modules/identity/router';
import { onboardingRouter } from './modules/onboarding/router';
import { dashboardRouter } from './modules/dashboard/router';
import { whoopRouter } from './modules/wearable/router';
import { stravaRouter } from './modules/strava/router';
import { gymRouter } from './modules/gym/router';
import { biomarkerRouter, biomarkerLogRouter } from './modules/biomarkers/router';
import { insightsRouter } from './modules/insights/router';
import { communityRouter } from './modules/community/router';
import { roomsRouter } from './modules/rooms/router';
import { adminRouter } from './modules/admin/router';
import { notificationsRouter } from './modules/notifications/router';
import { aiRouter } from './modules/ai/router';
import { reportsRouter } from './modules/reports/router';
import { practitionerRouter } from './modules/practitioner/router';

const app = express();
const allowedOrigins = env.corsOrigins.length > 0 ? env.corsOrigins : ['http://localhost:5173'];
const normalizeOrigin = (origin: string) => origin.replace(/\/$/, '').toLowerCase();
const normalizedAllowedOrigins = allowedOrigins.map(normalizeOrigin);
const isAllowedOrigin = (origin?: string): origin is string => {
  if (!origin) {
    return false;
  }

  return normalizedAllowedOrigins.includes(normalizeOrigin(origin));
};

const applyCorsHeaders = (req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
  }
  next();
};

app.use(applyCorsHeaders);
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    if (isAllowedOrigin(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ?? 'Content-Type, Authorization');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    }

    res.sendStatus(204);
    return;
  }

  next();
});
app.use(requestContext);
app.use(observabilityMiddleware);
app.use(helmet());
app.use(express.json());
app.use(sessionMiddleware);

app.use('/healthz', healthRouter);
app.use('/auth', authRouter);
app.use('/profiles', onboardingRouter);
app.use('/integrations/whoop', whoopRouter);
app.use('/integrations/strava', stravaRouter);
app.use('/gym', gymRouter);
app.use('/dashboard', dashboardRouter);
app.use('/biomarkers', biomarkerRouter);
app.use('/biomarker-logs', biomarkerLogRouter);
app.use('/admin', adminRouter);
app.use('/insights', insightsRouter);
app.use('/community', communityRouter);
app.use('/rooms', roomsRouter);
app.use('/notifications', notificationsRouter);
app.use('/ai', aiRouter);
app.use('/reports', reportsRouter);
app.use('/practitioner', practitionerRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
