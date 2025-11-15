"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.communityRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const guards_1 = require("../identity/guards");
const http_error_1 = require("../observability-ops/http-error");
const community_service_1 = require("./community.service");
const cursorSchema = zod_1.z.string().min(1, 'cursor must be a non-empty string');
const limitSchema = zod_1.z.preprocess((value) => {
    if (value === undefined || value === null || value === '') {
        return 20;
    }
    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
}, zod_1.z
    .number({ invalid_type_error: 'limit must be a number' })
    .int()
    .min(1, 'limit must be at least 1')
    .max(50, 'limit must not exceed 50'));
const scopeSchema = zod_1.z.enum(['GLOBAL', 'COHORT', 'PERSONALIZED']).optional();
const feedQuerySchema = zod_1.z.object({
    cursor: cursorSchema.optional(),
    limit: limitSchema,
    scope: scopeSchema
});
const postCreateSchema = zod_1.z.object({
    body: zod_1.z
        .string({ required_error: 'body is required' })
        .min(1, 'body must be at least 1 character')
        .max(2000, 'body must be 2000 characters or fewer'),
    tags: zod_1.z
        .array(zod_1.z.string().min(1, 'tags must be at least 1 character').max(32, 'tags must be 32 characters or fewer'))
        .max(5, 'tags must not exceed 5 entries')
        .optional(),
    visibility: zod_1.z.nativeEnum(client_1.PostVisibility).optional()
});
const postUpdateSchema = zod_1.z
    .object({
    body: zod_1.z
        .string()
        .min(1, 'body must be at least 1 character')
        .max(2000, 'body must be 2000 characters or fewer')
        .optional(),
    tags: zod_1.z
        .array(zod_1.z.string().min(1, 'tags must be at least 1 character').max(32, 'tags must be 32 characters or fewer'))
        .max(5, 'tags must not exceed 5 entries')
        .optional(),
    visibility: zod_1.z.nativeEnum(client_1.PostVisibility).optional()
})
    .superRefine((data, ctx) => {
    if (data.body === undefined && data.tags === undefined && data.visibility === undefined) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Provide at least one field to update',
            path: []
        });
    }
});
const commentsQuerySchema = zod_1.z.object({
    cursor: cursorSchema.optional(),
    limit: limitSchema
});
const commentBodySchema = zod_1.z.object({
    body: zod_1.z
        .string({ required_error: 'body is required' })
        .min(1, 'body must be at least 1 character')
        .max(2000, 'body must be 2000 characters or fewer')
});
const reactionSchema = zod_1.z.object({
    type: zod_1.z.nativeEnum(client_1.ReactionType)
});
const validate = (schema, payload) => {
    const result = schema.safeParse(payload);
    if (!result.success) {
        throw new http_error_1.HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
    }
    return result.data;
};
const communityRouter = (0, express_1.Router)();
exports.communityRouter = communityRouter;
communityRouter.use(guards_1.requireAuth, guards_1.requireActiveUser);
communityRouter.get('/feed', async (req, res, next) => {
    try {
        const query = validate(feedQuerySchema, req.query);
        const result = await community_service_1.communityService.listFeed(req.user, {
            cursor: query.cursor,
            limit: query.limit,
            scope: query.scope
        });
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
});
communityRouter.post('/feed', async (req, res, next) => {
    try {
        const payload = validate(postCreateSchema, req.body);
        const post = await community_service_1.communityService.createPost(req.user, payload);
        res.status(201).json(post);
    }
    catch (error) {
        next(error);
    }
});
communityRouter.get('/posts/:postId', async (req, res, next) => {
    try {
        const post = await community_service_1.communityService.getPost(req.user, req.params.postId);
        res.status(200).json(post);
    }
    catch (error) {
        next(error);
    }
});
communityRouter.patch('/posts/:postId', async (req, res, next) => {
    try {
        const payload = validate(postUpdateSchema, req.body);
        const post = await community_service_1.communityService.updatePost(req.user, req.params.postId, payload);
        res.status(200).json(post);
    }
    catch (error) {
        next(error);
    }
});
communityRouter.delete('/posts/:postId', async (req, res, next) => {
    try {
        await community_service_1.communityService.deletePost(req.user, req.params.postId);
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
communityRouter.get('/posts/:postId/comments', async (req, res, next) => {
    try {
        const query = validate(commentsQuerySchema, req.query);
        const result = await community_service_1.communityService.listComments(req.user, req.params.postId, {
            cursor: query.cursor,
            limit: query.limit
        });
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
});
communityRouter.post('/posts/:postId/comments', async (req, res, next) => {
    try {
        const payload = validate(commentBodySchema, req.body);
        const comment = await community_service_1.communityService.createComment(req.user, req.params.postId, payload);
        res.status(201).json(comment);
    }
    catch (error) {
        next(error);
    }
});
communityRouter.patch('/comments/:commentId', async (req, res, next) => {
    try {
        const payload = validate(commentBodySchema, req.body);
        const comment = await community_service_1.communityService.updateComment(req.user, req.params.commentId, payload);
        res.status(200).json(comment);
    }
    catch (error) {
        next(error);
    }
});
communityRouter.delete('/comments/:commentId', async (req, res, next) => {
    try {
        await community_service_1.communityService.deleteComment(req.user, req.params.commentId);
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
communityRouter.post('/posts/:postId/reactions', async (req, res, next) => {
    try {
        const payload = validate(reactionSchema, req.body);
        const reaction = await community_service_1.communityService.reactToPost(req.user, req.params.postId, payload);
        res.status(201).json(reaction);
    }
    catch (error) {
        next(error);
    }
});
communityRouter.delete('/reactions/:reactionId', async (req, res, next) => {
    try {
        await community_service_1.communityService.removeReaction(req.user, req.params.reactionId);
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
