"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const guards_1 = require("../identity/guards");
const http_error_1 = require("../observability-ops/http-error");
const rooms_service_1 = require("./rooms.service");
const trimString = (value) => {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};
const createRoomSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(1, 'name must be at least 1 character')
        .max(64, 'name must be 64 characters or fewer')
        .optional()
        .transform((value) => (typeof value === 'string' ? value.trim() : value))
        .refine((value) => value === undefined || value.length > 0, 'name must be at least 1 character')
});
const joinRoomSchema = zod_1.z.object({
    inviteCode: zod_1.z
        .string({ required_error: 'inviteCode is required' })
        .refine((value) => trimString(value) !== undefined, 'inviteCode must be provided')
        .transform((value) => trimString(value))
        .refine((value) => value.length >= 4, 'inviteCode must be at least 4 characters')
        .refine((value) => value.length <= 12, 'inviteCode must be 12 characters or fewer')
});
const parse = (schema, payload) => {
    const result = schema.safeParse(payload);
    if (!result.success) {
        throw new http_error_1.HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
    }
    return result.data;
};
const router = (0, express_1.Router)();
exports.roomsRouter = router;
router.use(guards_1.requireAuth, guards_1.requireActiveUser);
router.post('/', async (req, res, next) => {
    try {
        const payload = parse(createRoomSchema, req.body);
        const room = await rooms_service_1.roomsService.createRoom(req.user, {
            name: payload.name
        });
        res.status(201).json(room);
    }
    catch (error) {
        next(error);
    }
});
router.post('/join', async (req, res, next) => {
    try {
        const payload = parse(joinRoomSchema, req.body);
        const room = await rooms_service_1.roomsService.joinRoomByCode(req.user, payload.inviteCode);
        res.status(200).json(room);
    }
    catch (error) {
        next(error);
    }
});
router.get('/:roomId', async (req, res, next) => {
    try {
        const room = await rooms_service_1.roomsService.getRoom(req.user, req.params.roomId);
        res.status(200).json(room);
    }
    catch (error) {
        next(error);
    }
});
