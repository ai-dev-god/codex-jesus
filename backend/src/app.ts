import cors, { type CorsOptions } from 'cors';
import express from 'express';
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
import { biomarkerRouter, biomarkerLogRouter } from './modules/biomarkers/router';
import { insightsRouter } from './modules/insights/router';
import { communityRouter } from './modules/community/router';
import { roomsRouter } from './modules/rooms/router';
import { adminRouter } from './modules/admin/router';
import { notificationsRouter } from './modules/notifications/router';
import { aiRouter } from './modules/ai/router';

const app = express();
const allowedOrigins = env.corsOrigins.length > 0 ? env.corsOrigins : ['http://localhost:5173'];
const normalizeOrigin = (origin: string) => origin.replace(/\/$/, '').toLowerCase();
const normalizedAllowedOrigins = allowedOrigins.map(normalizeOrigin);
const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = normalizeOrigin(origin);
    if (normalizedAllowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  credentials: true
};

app.use(requestContext);
app.use(observabilityMiddleware);
app.use(helmet());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(sessionMiddleware);

app.use('/healthz', healthRouter);
app.use('/auth', authRouter);
app.use('/profiles', onboardingRouter);
app.use('/integrations/whoop', whoopRouter);
app.use('/dashboard', dashboardRouter);
app.use('/biomarkers', biomarkerRouter);
app.use('/biomarker-logs', biomarkerLogRouter);
app.use('/admin', adminRouter);
app.use('/insights', insightsRouter);
app.use('/community', communityRouter);
app.use('/rooms', roomsRouter);
app.use('/notifications', notificationsRouter);
app.use('/ai', aiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
