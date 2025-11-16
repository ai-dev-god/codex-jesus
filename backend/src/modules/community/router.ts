import { Router } from 'express';
import { z } from 'zod';
import { ReactionType, PostVisibility } from '@prisma/client';

import { requireActiveUser, requireAuth } from '../identity/guards';
import { HttpError } from '../observability-ops/http-error';
import { communityService } from './community.service';

const cursorSchema = z.string().min(1, 'cursor must be a non-empty string');

const limitSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') {
      return 20;
    }

    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  },
  z
    .number({ invalid_type_error: 'limit must be a number' })
    .int()
    .min(1, 'limit must be at least 1')
    .max(50, 'limit must not exceed 50')
);

const scopeSchema = z.enum(['GLOBAL', 'COHORT', 'PERSONALIZED']).optional();

const feedQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: limitSchema,
  scope: scopeSchema
});

const postCreateSchema = z.object({
  body: z
    .string({ required_error: 'body is required' })
    .min(1, 'body must be at least 1 character')
    .max(2000, 'body must be 2000 characters or fewer'),
  tags: z
    .array(z.string().min(1, 'tags must be at least 1 character').max(32, 'tags must be 32 characters or fewer'))
    .max(5, 'tags must not exceed 5 entries')
    .optional(),
  visibility: z.nativeEnum(PostVisibility).optional()
});

const postUpdateSchema = z
  .object({
    body: z
      .string()
      .min(1, 'body must be at least 1 character')
      .max(2000, 'body must be 2000 characters or fewer')
      .optional(),
    tags: z
      .array(z.string().min(1, 'tags must be at least 1 character').max(32, 'tags must be 32 characters or fewer'))
      .max(5, 'tags must not exceed 5 entries')
      .optional(),
    visibility: z.nativeEnum(PostVisibility).optional()
  })
  .superRefine((data, ctx) => {
    if (data.body === undefined && data.tags === undefined && data.visibility === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one field to update',
        path: []
      });
    }
  });

const commentsQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: limitSchema
});

const windowDaysSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  },
  z
    .number({ invalid_type_error: 'windowDays must be a number' })
    .int()
    .min(7, 'windowDays must be at least 7')
    .max(30, 'windowDays must not exceed 30')
).optional();

const leaderboardLimitSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  },
  z
    .number({ invalid_type_error: 'limit must be a number' })
    .int()
    .min(5, 'limit must be at least 5')
    .max(25, 'limit must not exceed 25')
).optional();

const leaderboardQuerySchema = z.object({
  windowDays: windowDaysSchema,
  limit: leaderboardLimitSchema
});

const commentBodySchema = z.object({
  body: z
    .string({ required_error: 'body is required' })
    .min(1, 'body must be at least 1 character')
    .max(2000, 'body must be 2000 characters or fewer')
});

const reactionSchema = z.object({
  type: z.nativeEnum(ReactionType)
});

const validate = <S extends z.ZodTypeAny>(schema: S, payload: unknown): z.infer<S> => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new HttpError(422, 'Validation failed', 'VALIDATION_ERROR', result.error.flatten());
  }

  return result.data;
};

const communityRouter = Router();

communityRouter.use(requireAuth, requireActiveUser);

communityRouter.get('/feed', async (req, res, next) => {
  try {
    const query = validate(feedQuerySchema, req.query);
    const result = await communityService.listFeed(req.user!, {
      cursor: query.cursor,
      limit: query.limit,
      scope: query.scope
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

communityRouter.post('/feed', async (req, res, next) => {
  try {
    const payload = validate(postCreateSchema, req.body);
    const post = await communityService.createPost(req.user!, payload);
    res.status(201).json(post);
  } catch (error) {
    next(error);
  }
});

communityRouter.get('/posts/:postId', async (req, res, next) => {
  try {
    const post = await communityService.getPost(req.user!, req.params.postId);
    res.status(200).json(post);
  } catch (error) {
    next(error);
  }
});

communityRouter.patch('/posts/:postId', async (req, res, next) => {
  try {
    const payload = validate(postUpdateSchema, req.body);
    const post = await communityService.updatePost(req.user!, req.params.postId, payload);
    res.status(200).json(post);
  } catch (error) {
    next(error);
  }
});

communityRouter.delete('/posts/:postId', async (req, res, next) => {
  try {
    await communityService.deletePost(req.user!, req.params.postId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

communityRouter.get('/posts/:postId/comments', async (req, res, next) => {
  try {
    const query = validate(commentsQuerySchema, req.query);
    const result = await communityService.listComments(req.user!, req.params.postId, {
      cursor: query.cursor,
      limit: query.limit
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

communityRouter.post('/posts/:postId/comments', async (req, res, next) => {
  try {
    const payload = validate(commentBodySchema, req.body);
    const comment = await communityService.createComment(req.user!, req.params.postId, payload);
    res.status(201).json(comment);
  } catch (error) {
    next(error);
  }
});

communityRouter.patch('/comments/:commentId', async (req, res, next) => {
  try {
    const payload = validate(commentBodySchema, req.body);
    const comment = await communityService.updateComment(req.user!, req.params.commentId, payload);
    res.status(200).json(comment);
  } catch (error) {
    next(error);
  }
});

communityRouter.delete('/comments/:commentId', async (req, res, next) => {
  try {
    await communityService.deleteComment(req.user!, req.params.commentId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

communityRouter.post('/posts/:postId/reactions', async (req, res, next) => {
  try {
    const payload = validate(reactionSchema, req.body);
    const reaction = await communityService.reactToPost(req.user!, req.params.postId, payload);
    res.status(201).json(reaction);
  } catch (error) {
    next(error);
  }
});

communityRouter.delete('/reactions/:reactionId', async (req, res, next) => {
  try {
    await communityService.removeReaction(req.user!, req.params.reactionId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

communityRouter.get('/performance', async (req, res, next) => {
  try {
    const query = validate(leaderboardQuerySchema, req.query);
    const leaderboard = await communityService.listPerformanceLeaderboard(req.user!, {
      windowDays: query.windowDays,
      limit: query.limit
    });
    res.status(200).json(leaderboard);
  } catch (error) {
    next(error);
  }
});

export { communityRouter };
