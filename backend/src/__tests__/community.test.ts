import request from 'supertest';
import { PostVisibility, ReactionType, Role, UserStatus } from '@prisma/client';

import { app } from '../app';
import { tokenService } from '../modules/identity/token-service';
import { communityService } from '../modules/community/community.service';

jest.mock('../modules/community/community.service', () => ({
  communityService: {
    listFeed: jest.fn(),
    createPost: jest.fn(),
    getPost: jest.fn(),
    updatePost: jest.fn(),
    deletePost: jest.fn(),
    listComments: jest.fn(),
    createComment: jest.fn(),
    updateComment: jest.fn(),
    deleteComment: jest.fn(),
    reactToPost: jest.fn(),
    removeReaction: jest.fn(),
    listPerformanceLeaderboard: jest.fn()
  }
}));

const mockedCommunityService = communityService as jest.Mocked<typeof communityService>;

const issueToken = (status: UserStatus, role: Role = Role.MEMBER) =>
  tokenService.issueAccessToken({
    id: 'community-user',
    email: 'community@example.com',
    role,
    status
  }).token;

describe('Community Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires authentication to access the community feed', async () => {
    const response = await request(app).get('/community/feed');

    expect(response.status).toBe(401);
  });

  it('enforces onboarding completion before returning the feed', async () => {
    const token = issueToken(UserStatus.PENDING_ONBOARDING);

    const response = await request(app).get('/community/feed').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: {
        code: 'ONBOARDING_REQUIRED'
      }
    });
    expect(mockedCommunityService.listFeed).not.toHaveBeenCalled();
  });

  it('returns paginated feed data for active members', async () => {
    const token = issueToken(UserStatus.ACTIVE);

    mockedCommunityService.listFeed.mockResolvedValueOnce({
      data: [
        {
          id: 'post-1',
          body: 'Morning recovery is trending up!',
          tags: ['recovery'],
          visibility: PostVisibility.MEMBERS,
          flagged: false,
          commentCount: 2,
          reactionSummary: { [ReactionType.BOOST]: 1 },
          author: {
            id: 'author-1',
            displayName: 'Coach Riley',
            avatarUrl: null
          },
          viewerActions: {
            reacted: false,
            reactionType: null
          },
          createdAt: '2025-01-02T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z'
        }
      ],
      meta: {
        nextCursor: null,
        hasMore: false
      }
    });

    const response = await request(app)
      .get('/community/feed')
      .query({ limit: 5, cursor: 'post-5', scope: 'GLOBAL' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(mockedCommunityService.listFeed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'community-user', role: Role.MEMBER }),
      expect.objectContaining({
        limit: 5,
        cursor: 'post-5',
        scope: 'GLOBAL'
      })
    );
    expect(response.body).toMatchObject({
      data: expect.any(Array),
      meta: {
        nextCursor: null,
        hasMore: false
      }
    });
  });

  it('validates payload when creating posts', async () => {
    const token = issueToken(UserStatus.ACTIVE);

    const response = await request(app)
      .post('/community/feed')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: '' });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR'
      }
    });
    expect(mockedCommunityService.createPost).not.toHaveBeenCalled();
  });

  it('creates posts and returns the persisted resource', async () => {
    const token = issueToken(UserStatus.ACTIVE);
    mockedCommunityService.createPost.mockResolvedValueOnce({
      id: 'post-123',
      body: 'HRV trending up!'
    } as never);

    const response = await request(app)
      .post('/community/feed')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'HRV trending up!', tags: ['recovery'] });

    expect(response.status).toBe(201);
    expect(mockedCommunityService.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'community-user' }),
      expect.objectContaining({
        body: 'HRV trending up!',
        tags: ['recovery']
      })
    );
  });

  it('routes comment creation to the service with validation', async () => {
    const token = issueToken(UserStatus.ACTIVE);

    mockedCommunityService.createComment.mockResolvedValueOnce({
      id: 'comment-1',
      body: 'Cheering you on!'
    } as never);

    const response = await request(app)
      .post('/community/posts/post-1/comments')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Cheering you on!' });

    expect(response.status).toBe(201);
    expect(mockedCommunityService.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'community-user' }),
      'post-1',
      { body: 'Cheering you on!' }
    );
  });

  it('enforces reaction type validation when reacting to a post', async () => {
    const token = issueToken(UserStatus.ACTIVE);

    const response = await request(app)
      .post('/community/posts/post-1/reactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'HUG' });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR'
      }
    });
    expect(mockedCommunityService.reactToPost).not.toHaveBeenCalled();
  });

  it('creates reactions and bubbles the response payload', async () => {
    const token = issueToken(UserStatus.ACTIVE);

    mockedCommunityService.reactToPost.mockResolvedValueOnce({
      id: 'reaction-1',
      type: ReactionType.BOOST
    } as never);

    const response = await request(app)
      .post('/community/posts/post-1/reactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: ReactionType.BOOST });

    expect(response.status).toBe(201);
    expect(mockedCommunityService.reactToPost).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'community-user' }),
      'post-1',
      { type: ReactionType.BOOST }
    );
  });

  it('validates performance leaderboard query params', async () => {
    const token = issueToken(UserStatus.ACTIVE);

    const response = await request(app)
      .get('/community/performance')
      .query({ windowDays: 2 })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(422);
    expect(mockedCommunityService.listPerformanceLeaderboard).not.toHaveBeenCalled();
  });

  it('returns performance leaderboards for active members', async () => {
    const token = issueToken(UserStatus.ACTIVE);

    mockedCommunityService.listPerformanceLeaderboard.mockResolvedValueOnce({
      window: {
        start: '2025-11-01T00:00:00.000Z',
        end: '2025-11-15T00:00:00.000Z',
        days: 14
      },
      generatedAt: '2025-11-15T00:00:00.000Z',
      entries: [],
      viewerRank: null
    });

    const response = await request(app)
      .get('/community/performance')
      .query({ windowDays: 14, limit: 8 })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(mockedCommunityService.listPerformanceLeaderboard).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'community-user' }),
      { windowDays: 14, limit: 8 }
    );
    expect(response.body).toMatchObject({
      window: expect.any(Object),
      entries: expect.any(Array)
    });
  });
});
