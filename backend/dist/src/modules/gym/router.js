"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gymRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const guards_1 = require("../identity/guards");
const gym_service_1 = require("./gym.service");
const http_error_1 = require("../observability-ops/http-error");
const router = (0, express_1.Router)();
exports.gymRouter = router;
router.use(guards_1.requireAuth);
const listQuerySchema = zod_1.z.object({
    cursor: zod_1.z
        .string()
        .trim()
        .optional()
        .transform((value) => (value && value.length === 0 ? undefined : value)),
    take: zod_1.z
        .preprocess((value) => (value === undefined ? undefined : Number(value)), zod_1.z.number().int().min(1).max(100).optional())
});
const workoutIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().min(1, 'Workout id is required')
});
router.get('/overview', async (req, res, next) => {
    try {
        const overview = await gym_service_1.gymService.getOverview(req.user.id);
        res.status(200).json(overview);
    }
    catch (error) {
        next(error);
    }
});
router.get('/workouts', async (req, res, next) => {
    try {
        const params = listQuerySchema.safeParse(req.query);
        if (!params.success) {
            throw new http_error_1.HttpError(422, 'Invalid query parameters', 'VALIDATION_ERROR', params.error.flatten());
        }
        const result = await gym_service_1.gymService.listWorkouts(req.user.id, params.data);
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
});
router.get('/workouts/:id', async (req, res, next) => {
    try {
        const parsed = workoutIdParamSchema.safeParse(req.params);
        if (!parsed.success) {
            throw new http_error_1.HttpError(422, 'Invalid workout id', 'VALIDATION_ERROR', parsed.error.flatten());
        }
        const workout = await gym_service_1.gymService.getWorkout(req.user.id, parsed.data.id);
        res.status(200).json(workout);
    }
    catch (error) {
        next(error);
    }
});
router.post('/sync', async (req, res, next) => {
    try {
        await gym_service_1.gymService.triggerSync(req.user.id);
        res.status(202).json({ enqueued: true });
    }
    catch (error) {
        next(error);
    }
});
