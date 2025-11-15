"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardRouter = void 0;
const express_1 = require("express");
const guards_1 = require("../identity/guards");
const dashboard_service_1 = require("./dashboard.service");
const router = (0, express_1.Router)();
exports.dashboardRouter = router;
router.use(guards_1.requireAuth, guards_1.requireActiveUser);
router.get('/', async (req, res, next) => {
    try {
        const summary = await dashboard_service_1.dashboardService.getSummary(req.user.id);
        res.status(200).json(summary);
    }
    catch (error) {
        next(error);
    }
});
router.get('/summary', async (req, res, next) => {
    try {
        const summary = await dashboard_service_1.dashboardService.getSummary(req.user.id);
        res.status(200).json(summary);
    }
    catch (error) {
        next(error);
    }
});
router.get('/offline', async (req, res, next) => {
    try {
        const snapshot = await dashboard_service_1.dashboardService.getOfflineSnapshot(req.user.id);
        res.status(200).json(snapshot);
    }
    catch (error) {
        next(error);
    }
});
