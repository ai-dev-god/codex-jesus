"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = exports.createHealthRouter = void 0;
const express_1 = require("express");
const service_1 = require("../observability/health/service");
const createHealthRouter = (options = {}) => {
    const service = options.service ?? service_1.healthService;
    const router = (0, express_1.Router)();
    router.get('/', async (req, res, next) => {
        try {
            const snapshot = await service.liveness();
            req.log?.debug('Liveness check successful', { snapshot });
            res.status(200).json(snapshot);
        }
        catch (error) {
            next(error);
        }
    });
    router.get('/readiness', async (req, res, next) => {
        try {
            const snapshot = await service.readiness();
            req.log?.info('Readiness check completed', { status: snapshot.status });
            const status = snapshot.status === 'fail' ? 503 : 200;
            res.status(status).json(snapshot);
        }
        catch (error) {
            next(error);
        }
    });
    return router;
};
exports.createHealthRouter = createHealthRouter;
exports.healthRouter = (0, exports.createHealthRouter)();
