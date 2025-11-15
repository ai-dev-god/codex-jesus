"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.communityService = exports.CommunityService = void 0;
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../../lib/prisma"));
const http_error_1 = require("../observability-ops/http-error");
const FORBIDDEN_ERROR = new http_error_1.HttpError(403, 'You do not have permission to perform this action', 'FORBIDDEN');
const isStaff = (role) => role !== client_1.Role.MEMBER;
const normaliseReactionSummary = (summary) => {
    const result = {};
    if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
        const raw = summary;
        for (const type of Object.values(client_1.ReactionType)) {
            const value = raw[type];
            if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
                result[type] = value;
            }
        }
    }
    return result;
};
const toJsonValue = (value) => value;
const sanitizeSummary = (summary) => {
    const sanitized = {};
    for (const [key, value] of Object.entries(summary)) {
        if (value > 0) {
            sanitized[key] = value;
        }
    }
    return sanitized;
};
const toMetadata = (value) => value ? value : client_1.Prisma.JsonNull;
const buildUserSummary = (user) => {
    const avatarUrl = user.profile?.avatarUrl ?? null;
    return {
        id: user.id,
        displayName: user.profile?.displayName ?? user.email,
        avatarUrl
    };
};
class CommunityService {
    constructor(prisma, idFactory = crypto_1.randomUUID, now = () => new Date()) {
        this.prisma = prisma;
        this.idFactory = idFactory;
        this.now = now;
    }
    async listFeed(user, options) {
        const take = options.limit;
        const isStaffUser = isStaff(user.role);
        const visiblePosts = [];
        let dbCursor = options.cursor ?? null;
        let iterations = 0;
        const MAX_CURSOR_ITERATIONS = 10;
        while (visiblePosts.length < take + 1 && iterations < MAX_CURSOR_ITERATIONS) {
            const chunk = await this.prisma.feedPost.findMany({
                include: {
                    author: {
                        include: {
                            profile: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: take + 1,
                cursor: dbCursor ? { id: dbCursor } : undefined,
                skip: dbCursor ? 1 : 0
            });
            if (chunk.length === 0) {
                break;
            }
            for (const post of chunk) {
                if (isStaffUser || !post.flagged) {
                    visiblePosts.push(post);
                }
            }
            dbCursor = chunk[chunk.length - 1].id;
            iterations += 1;
            if (chunk.length < take + 1) {
                break;
            }
        }
        const pageItems = visiblePosts.slice(0, take);
        const hasMore = visiblePosts.length > take;
        const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null;
        const postIds = pageItems.map((post) => post.id);
        const viewerMap = new Map();
        if (postIds.length > 0) {
            const viewerReactions = await this.prisma.reaction.findMany({
                where: {
                    postId: { in: postIds },
                    userId: user.id
                },
                select: {
                    postId: true,
                    type: true
                }
            });
            for (const reaction of viewerReactions) {
                if (reaction.postId) {
                    viewerMap.set(reaction.postId, reaction.type);
                }
            }
        }
        const data = pageItems.map((post) => this.mapPost(post, {
            reacted: viewerMap.has(post.id),
            reactionType: viewerMap.get(post.id) ?? null
        }));
        return {
            data,
            meta: {
                nextCursor,
                hasMore
            }
        };
    }
    async createPost(user, input) {
        const created = await this.prisma.feedPost.create({
            data: {
                authorId: user.id,
                body: input.body,
                tags: input.tags ?? [],
                visibility: input.visibility ?? client_1.PostVisibility.MEMBERS
            },
            include: {
                author: {
                    include: {
                        profile: true
                    }
                }
            }
        });
        await this.prisma.engagementEvent.create({
            data: {
                id: this.idFactory(),
                type: client_1.EngagementEventType.POST_CREATED,
                userId: user.id,
                postId: created.id,
                occurredAt: this.now(),
                metadata: client_1.Prisma.JsonNull
            }
        });
        return this.mapPost(created, {
            reacted: false,
            reactionType: null
        });
    }
    async getPost(user, postId) {
        const post = await this.prisma.feedPost.findUnique({
            where: { id: postId },
            include: {
                author: {
                    include: {
                        profile: true
                    }
                }
            }
        });
        if (!post || (post.flagged && !isStaff(user.role))) {
            throw new http_error_1.HttpError(404, 'Post not found', 'POST_NOT_FOUND');
        }
        const viewerReaction = await this.prisma.reaction.findFirst({
            where: {
                postId: post.id,
                userId: user.id
            },
            select: {
                type: true
            }
        });
        return this.mapPost(post, {
            reacted: Boolean(viewerReaction),
            reactionType: viewerReaction?.type ?? null
        });
    }
    async updatePost(user, postId, input) {
        const post = await this.prisma.feedPost.findUnique({
            where: { id: postId },
            include: {
                author: {
                    include: {
                        profile: true
                    }
                }
            }
        });
        if (!post || (post.flagged && !isStaff(user.role))) {
            throw new http_error_1.HttpError(404, 'Post not found', 'POST_NOT_FOUND');
        }
        if (post.authorId !== user.id && !isStaff(user.role)) {
            throw FORBIDDEN_ERROR;
        }
        const updated = await this.prisma.feedPost.update({
            where: { id: post.id },
            data: {
                body: input.body ?? post.body,
                tags: input.tags ?? post.tags,
                visibility: input.visibility ?? post.visibility
            },
            include: {
                author: {
                    include: {
                        profile: true
                    }
                }
            }
        });
        const viewerReaction = await this.prisma.reaction.findFirst({
            where: {
                postId: updated.id,
                userId: user.id
            },
            select: {
                type: true
            }
        });
        return this.mapPost(updated, {
            reacted: Boolean(viewerReaction),
            reactionType: viewerReaction?.type ?? null
        });
    }
    async deletePost(user, postId) {
        const post = await this.prisma.feedPost.findUnique({
            where: { id: postId }
        });
        if (!post || (post.flagged && !isStaff(user.role))) {
            throw new http_error_1.HttpError(404, 'Post not found', 'POST_NOT_FOUND');
        }
        if (post.authorId !== user.id && !isStaff(user.role)) {
            throw FORBIDDEN_ERROR;
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.feedPost.delete({ where: { id: postId } });
            await tx.engagementEvent.create({
                data: {
                    id: this.idFactory(),
                    type: client_1.EngagementEventType.POST_DELETED,
                    userId: user.id,
                    postId,
                    occurredAt: this.now(),
                    metadata: client_1.Prisma.JsonNull
                }
            });
        });
    }
    async listComments(user, postId, options) {
        const post = await this.prisma.feedPost.findUnique({
            where: { id: postId },
            select: {
                id: true,
                flagged: true
            }
        });
        if (!post || (post.flagged && !isStaff(user.role))) {
            throw new http_error_1.HttpError(404, 'Post not found', 'POST_NOT_FOUND');
        }
        const take = options.limit;
        const isStaffUser = isStaff(user.role);
        const visibleComments = [];
        let dbCursor = options.cursor ?? null;
        let iterations = 0;
        const MAX_CURSOR_ITERATIONS = 10;
        while (visibleComments.length < take + 1 && iterations < MAX_CURSOR_ITERATIONS) {
            const chunk = await this.prisma.comment.findMany({
                where: {
                    postId: post.id
                },
                include: {
                    author: {
                        include: {
                            profile: true
                        }
                    }
                },
                orderBy: { createdAt: 'asc' },
                take: take + 1,
                cursor: dbCursor ? { id: dbCursor } : undefined,
                skip: dbCursor ? 1 : 0
            });
            if (chunk.length === 0) {
                break;
            }
            for (const comment of chunk) {
                if (isStaffUser || !comment.flagged) {
                    visibleComments.push(comment);
                }
            }
            dbCursor = chunk[chunk.length - 1].id;
            iterations += 1;
            if (chunk.length < take + 1) {
                break;
            }
        }
        const pageItems = visibleComments.slice(0, take);
        const hasMore = visibleComments.length > take;
        const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null;
        const data = pageItems.map((comment) => this.mapComment(comment));
        return {
            data,
            meta: {
                nextCursor,
                hasMore
            }
        };
    }
    async createComment(user, postId, input) {
        return this.prisma.$transaction(async (tx) => {
            const post = await tx.feedPost.findUnique({
                where: { id: postId },
                select: {
                    id: true,
                    flagged: true
                }
            });
            if (!post || (post.flagged && !isStaff(user.role))) {
                throw new http_error_1.HttpError(404, 'Post not found', 'POST_NOT_FOUND');
            }
            const created = await tx.comment.create({
                data: {
                    postId: post.id,
                    authorId: user.id,
                    body: input.body
                },
                include: {
                    author: {
                        include: {
                            profile: true
                        }
                    }
                }
            });
            await tx.feedPost.update({
                where: { id: post.id },
                data: {
                    commentCount: {
                        increment: 1
                    }
                }
            });
            await tx.engagementEvent.create({
                data: {
                    id: this.idFactory(),
                    type: client_1.EngagementEventType.COMMENT_CREATED,
                    userId: user.id,
                    postId: post.id,
                    commentId: created.id,
                    occurredAt: this.now(),
                    metadata: client_1.Prisma.JsonNull
                }
            });
            return this.mapComment(created);
        });
    }
    async updateComment(user, commentId, input) {
        const comment = await this.prisma.comment.findUnique({
            where: { id: commentId },
            include: {
                author: {
                    include: {
                        profile: true
                    }
                },
                post: {
                    select: {
                        id: true,
                        flagged: true
                    }
                }
            }
        });
        if (!comment || ((comment.post.flagged || comment.flagged) && !isStaff(user.role))) {
            throw new http_error_1.HttpError(404, 'Comment not found', 'COMMENT_NOT_FOUND');
        }
        if (comment.authorId !== user.id && !isStaff(user.role)) {
            throw FORBIDDEN_ERROR;
        }
        const updated = await this.prisma.comment.update({
            where: { id: commentId },
            data: {
                body: input.body
            },
            include: {
                author: {
                    include: {
                        profile: true
                    }
                }
            }
        });
        return this.mapComment(updated);
    }
    async deleteComment(user, commentId) {
        await this.prisma.$transaction(async (tx) => {
            const comment = await tx.comment.findUnique({
                where: { id: commentId },
                include: {
                    post: {
                        select: {
                            id: true,
                            flagged: true
                        }
                    }
                }
            });
            if (!comment || ((comment.post.flagged || comment.flagged) && !isStaff(user.role))) {
                throw new http_error_1.HttpError(404, 'Comment not found', 'COMMENT_NOT_FOUND');
            }
            if (comment.authorId !== user.id && !isStaff(user.role)) {
                throw FORBIDDEN_ERROR;
            }
            await tx.comment.delete({ where: { id: commentId } });
            await tx.feedPost.update({
                where: { id: comment.postId },
                data: {
                    commentCount: {
                        decrement: 1
                    }
                }
            });
            await tx.engagementEvent.create({
                data: {
                    id: this.idFactory(),
                    type: client_1.EngagementEventType.COMMENT_DELETED,
                    userId: user.id,
                    postId: comment.postId,
                    commentId,
                    occurredAt: this.now(),
                    metadata: client_1.Prisma.JsonNull
                }
            });
        });
    }
    async reactToPost(user, postId, input) {
        return this.prisma.$transaction(async (tx) => {
            const post = await tx.feedPost.findUnique({
                where: { id: postId },
                select: {
                    id: true,
                    flagged: true,
                    reactionSummary: true
                }
            });
            if (!post || (post.flagged && !isStaff(user.role))) {
                throw new http_error_1.HttpError(404, 'Post not found', 'POST_NOT_FOUND');
            }
            const existing = await tx.reaction.findFirst({
                where: {
                    postId: post.id,
                    userId: user.id
                }
            });
            const summary = normaliseReactionSummary(post.reactionSummary);
            let reaction;
            let metadata = null;
            let changeType = null;
            if (existing) {
                if (existing.type === input.type) {
                    const current = await tx.reaction.findUniqueOrThrow({
                        where: { id: existing.id },
                        include: {
                            user: {
                                include: {
                                    profile: true
                                }
                            }
                        }
                    });
                    return this.mapReaction(current);
                }
                else {
                    reaction = await tx.reaction.update({
                        where: { id: existing.id },
                        data: {
                            type: input.type
                        },
                        include: {
                            user: {
                                include: {
                                    profile: true
                                }
                            }
                        }
                    });
                    summary[existing.type] = Math.max(0, (summary[existing.type] ?? 0) - 1);
                    summary[input.type] = (summary[input.type] ?? 0) + 1;
                    metadata = { replacedReactionType: existing.type };
                    changeType = 'UPDATED';
                }
            }
            else {
                reaction = await tx.reaction.create({
                    data: {
                        postId: post.id,
                        userId: user.id,
                        type: input.type
                    },
                    include: {
                        user: {
                            include: {
                                profile: true
                            }
                        }
                    }
                });
                summary[input.type] = (summary[input.type] ?? 0) + 1;
                changeType = 'NEW';
            }
            const sanitized = sanitizeSummary(summary);
            if (changeType) {
                await tx.feedPost.update({
                    where: { id: post.id },
                    data: {
                        reactionSummary: Object.keys(sanitized).length > 0 ? toJsonValue(sanitized) : client_1.Prisma.JsonNull
                    }
                });
                await tx.engagementEvent.create({
                    data: {
                        id: this.idFactory(),
                        type: client_1.EngagementEventType.REACTION_ADDED,
                        userId: user.id,
                        postId: post.id,
                        commentId: null,
                        reactionType: reaction.type,
                        occurredAt: this.now(),
                        metadata: toMetadata(metadata)
                    }
                });
            }
            return this.mapReaction(reaction);
        });
    }
    async removeReaction(user, reactionId) {
        await this.prisma.$transaction(async (tx) => {
            const reaction = await tx.reaction.findUnique({
                where: { id: reactionId },
                include: {
                    user: {
                        include: {
                            profile: true
                        }
                    },
                    post: {
                        select: {
                            id: true,
                            flagged: true,
                            reactionSummary: true
                        }
                    }
                }
            });
            if (!reaction || !reaction.post) {
                throw new http_error_1.HttpError(404, 'Reaction not found', 'REACTION_NOT_FOUND');
            }
            if (reaction.post.flagged && !isStaff(user.role)) {
                throw new http_error_1.HttpError(404, 'Reaction not found', 'REACTION_NOT_FOUND');
            }
            if (reaction.userId !== user.id && !isStaff(user.role)) {
                throw FORBIDDEN_ERROR;
            }
            const summary = normaliseReactionSummary(reaction.post.reactionSummary);
            summary[reaction.type] = Math.max(0, (summary[reaction.type] ?? 0) - 1);
            await tx.reaction.delete({ where: { id: reactionId } });
            const sanitized = sanitizeSummary(summary);
            await tx.feedPost.update({
                where: { id: reaction.post.id },
                data: {
                    reactionSummary: Object.keys(sanitized).length > 0 ? toJsonValue(sanitized) : client_1.Prisma.JsonNull
                }
            });
            await tx.engagementEvent.create({
                data: {
                    id: this.idFactory(),
                    type: client_1.EngagementEventType.REACTION_REMOVED,
                    userId: user.id,
                    postId: reaction.post.id,
                    commentId: null,
                    reactionType: reaction.type,
                    occurredAt: this.now(),
                    metadata: client_1.Prisma.JsonNull
                }
            });
        });
    }
    mapPost(post, viewerActions) {
        const summary = normaliseReactionSummary(post.reactionSummary);
        const payload = {};
        for (const [key, value] of Object.entries(summary)) {
            if (value > 0) {
                payload[key] = value;
            }
        }
        return {
            id: post.id,
            body: post.body,
            tags: post.tags,
            visibility: post.visibility,
            flagged: post.flagged,
            commentCount: post.commentCount,
            reactionSummary: payload,
            author: buildUserSummary(post.author),
            viewerActions,
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString()
        };
    }
    mapComment(comment) {
        return {
            id: comment.id,
            postId: comment.postId,
            body: comment.body,
            flagged: comment.flagged,
            author: buildUserSummary(comment.author),
            reactionSummary: {},
            createdAt: comment.createdAt.toISOString(),
            updatedAt: comment.updatedAt.toISOString()
        };
    }
    mapReaction(reaction) {
        return {
            id: reaction.id,
            postId: reaction.postId,
            commentId: reaction.commentId,
            type: reaction.type,
            user: buildUserSummary(reaction.user),
            createdAt: reaction.createdAt.toISOString()
        };
    }
}
exports.CommunityService = CommunityService;
exports.communityService = new CommunityService(prisma_1.default);
