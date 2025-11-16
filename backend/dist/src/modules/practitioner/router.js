"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.practitionerRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../../lib/prisma"));
const guards_1 = require("../identity/guards");
const http_error_1 = require("../observability-ops/http-error");
const router = (0, express_1.Router)();
exports.practitionerRouter = router;
const approveSchema = zod_1.z.object({
    email: zod_1.z.string().email()
});
const validate = (schema, payload) => {
    const result = schema.safeParse(payload);
    if (!result.success) {
        throw new http_error_1.HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
    }
    return result.data;
};
router.use(guards_1.requireAuth, (0, guards_1.requireRoles)(client_1.Role.PRACTITIONER, client_1.Role.ADMIN));
router.post('/ai-approvals', async (req, res, next) => {
    try {
        const payload = validate(approveSchema, req.body);
        const user = await prisma_1.default.user.findUnique({
            where: { email: payload.email },
            include: { profile: true }
        });
        if (!user?.profile) {
            throw new http_error_1.HttpError(404, 'User profile not found.', 'PROFILE_NOT_FOUND');
        }
        const updated = await prisma_1.default.profile.update({
            where: { userId: user.id },
            data: {
                aiInterpretationApprovedAt: new Date(),
                aiInterpretationApprovedBy: req.user.id
            }
        });
        res.status(200).json({
            userId: user.id,
            approvedAt: updated.aiInterpretationApprovedAt?.toISOString() ?? null,
            approvedBy: updated.aiInterpretationApprovedBy
        });
    }
    catch (error) {
        next(error);
    }
});
