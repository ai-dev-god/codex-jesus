"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const env_1 = __importDefault(require("./config/env"));
const middleware_1 = require("./observability/middleware");
const health_1 = require("./routes/health");
const request_context_1 = require("./modules/observability-ops/request-context");
const not_found_handler_1 = require("./modules/observability-ops/not-found-handler");
const error_handler_1 = require("./modules/observability-ops/error-handler");
const session_middleware_1 = require("./modules/identity/session-middleware");
const router_1 = require("./modules/identity/router");
const router_2 = require("./modules/onboarding/router");
const router_3 = require("./modules/dashboard/router");
const router_4 = require("./modules/wearable/router");
const router_5 = require("./modules/strava/router");
const router_6 = require("./modules/gym/router");
const router_7 = require("./modules/biomarkers/router");
const router_8 = require("./modules/insights/router");
const router_9 = require("./modules/community/router");
const router_10 = require("./modules/rooms/router");
const router_11 = require("./modules/admin/router");
const router_12 = require("./modules/notifications/router");
const router_13 = require("./modules/ai/router");
const router_14 = require("./modules/reports/router");
const router_15 = require("./modules/practitioner/router");
const captureRawBody = (req, _res, buf) => {
    if (buf?.length) {
        req.rawBody = Buffer.from(buf);
    }
    else {
        req.rawBody = Buffer.alloc(0);
    }
};
const app = (0, express_1.default)();
exports.app = app;
const allowedOrigins = env_1.default.corsOrigins.length > 0 ? env_1.default.corsOrigins : ['http://localhost:5173'];
const normalizeOrigin = (origin) => origin.replace(/\/$/, '').toLowerCase();
const normalizedAllowedOrigins = allowedOrigins.map(normalizeOrigin);
const isAllowedOrigin = (origin) => {
    if (!origin) {
        return false;
    }
    return normalizedAllowedOrigins.includes(normalizeOrigin(origin));
};
const applyCorsHeaders = (req, res, next) => {
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
app.use(request_context_1.requestContext);
app.use(middleware_1.observabilityMiddleware);
app.use((0, helmet_1.default)());
app.use(express_1.default.json({ verify: captureRawBody }));
app.use(session_middleware_1.sessionMiddleware);
app.use('/healthz', health_1.healthRouter);
app.use('/auth', router_1.authRouter);
app.use('/profiles', router_2.onboardingRouter);
app.use('/integrations/whoop', router_4.whoopRouter);
app.use('/integrations/strava', router_5.stravaRouter);
app.use('/gym', router_6.gymRouter);
app.use('/dashboard', router_3.dashboardRouter);
app.use('/biomarkers', router_7.biomarkerRouter);
app.use('/biomarker-logs', router_7.biomarkerLogRouter);
app.use('/admin', router_11.adminRouter);
app.use('/insights', router_8.insightsRouter);
app.use('/community', router_9.communityRouter);
app.use('/rooms', router_10.roomsRouter);
app.use('/notifications', router_12.notificationsRouter);
app.use('/ai', router_13.aiRouter);
app.use('/reports', router_14.reportsRouter);
app.use('/practitioner', router_15.practitionerRouter);
app.use(not_found_handler_1.notFoundHandler);
app.use(error_handler_1.errorHandler);
