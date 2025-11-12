import { PostVisibility, ReactionType, Role, UserStatus, type PrismaClient } from '@prisma/client';

import { CommunityService } from '../modules/community/community.service';

type MockDelegate = {
  [method: string]: jest.Mock;
};

type MockPrisma = {
  feedPost: MockDelegate;
  comment: MockDelegate;
  reaction: MockDelegate;
  engagementEvent: MockDelegate;
  $transaction: jest.Mock;
};

const createMockPrisma = (): MockPrisma => {
  const mockFeedPost: MockDelegate = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn()
  };

  const mockComment: MockDelegate = {
    findMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  };

  const mockReaction: MockDelegate = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  };

  const mockEngagementEvent: MockDelegate = {
    create: jest.fn()
  };

  const mock: MockPrisma = {
    feedPost: mockFeedPost,
    comment: mockComment,
    reaction: mockReaction,
    engagementEvent: mockEngagementEvent,
    $transaction: jest.fn()
  } as MockPrisma;

  mock.$transaction.mockImplementation(async (callback: (tx: Omit<MockPrisma, '$transaction'>) => Promise<unknown>) =>
    callback({
      feedPost: mock.feedPost,
      comment: mock.comment,
      reaction: mock.reaction,
      engagementEvent: mock.engagementEvent
    })
  );

  return mock;
};

const memberUser = {
  id: 'member-1',
  email: 'member@example.com',
  role: Role.MEMBER,
  status: UserStatus.ACTIVE
};

const moderatorUser = {
  id: 'moderator-1',
  email: 'moderator@example.com',
  role: Role.MODERATOR,
  status: UserStatus.ACTIVE
};

describe('CommunityService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('hides flagged posts from standard members when listing the feed', async () => {
    const prisma = createMockPrisma();
    const service = new CommunityService(prisma as unknown as PrismaClient, () => 'event-id', () => new Date('2025-01-02T00:00:00Z'));

    prisma.feedPost.findMany.mockResolvedValueOnce([
      {
        id: 'post-visible',
        authorId: 'author-1',
        body: 'Visible post',
        tags: ['recovery'],
        visibility: PostVisibility.MEMBERS,
        flagged: false,
        reactionSummary: { [ReactionType.BOOST]: 2 },
        commentCount: 3,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:30:00Z'),
        author: {
          id: 'author-1',
          email: 'author@example.com',
          profile: {
            displayName: 'Coach Carter'
          }
        }
      },
      {
        id: 'post-flagged',
        authorId: 'author-2',
        body: 'Flagged content',
        tags: ['flagged'],
        visibility: PostVisibility.MEMBERS,
        flagged: true,
        reactionSummary: null,
        commentCount: 0,
        createdAt: new Date('2025-01-01T00:05:00Z'),
        updatedAt: new Date('2025-01-01T00:05:00Z'),
        author: {
          id: 'author-2',
          email: 'mod@example.com',
          profile: {
            displayName: 'Moderator'
          }
        }
      }
    ]);

    prisma.reaction.findMany.mockResolvedValueOnce([
      {
        id: 'reaction-1',
        type: ReactionType.BOOST,
        postId: 'post-visible',
        commentId: null,
        userId: memberUser.id,
        createdAt: new Date('2025-01-01T00:45:00Z')
      }
    ]);

    const result = await service.listFeed(memberUser, { limit: 10 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'post-visible',
      flagged: false,
      viewerActions: {
        reacted: true,
        reactionType: ReactionType.BOOST
      }
    });
    expect(result.meta.nextCursor).toBeNull();
    expect(result.meta.hasMore).toBe(false);
  });

  it('allows staff moderators to review flagged content in the feed response', async () => {
    const prisma = createMockPrisma();
    const service = new CommunityService(prisma as unknown as PrismaClient, () => 'event-id', () => new Date('2025-01-02T00:00:00Z'));

    prisma.feedPost.findMany.mockResolvedValueOnce([
      {
        id: 'post-flagged',
        authorId: 'author-2',
        body: 'Flagged content',
        tags: ['flagged'],
        visibility: PostVisibility.MEMBERS,
        flagged: true,
        reactionSummary: null,
        commentCount: 0,
        createdAt: new Date('2025-01-01T00:05:00Z'),
        updatedAt: new Date('2025-01-01T00:05:00Z'),
        author: {
          id: 'author-2',
          email: 'mod@example.com',
          profile: {
            displayName: 'Moderator'
          }
        }
      }
    ]);

    prisma.reaction.findMany.mockResolvedValueOnce([]);

    const result = await service.listFeed(moderatorUser, { limit: 10 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('post-flagged');
    expect(result.data[0].flagged).toBe(true);
  });

  it('records engagement metrics when a member comments on a post', async () => {
    const prisma = createMockPrisma();
    const service = new CommunityService(prisma as unknown as PrismaClient, () => 'event-123', () => new Date('2025-01-03T00:00:00Z'));

    prisma.feedPost.findUnique.mockResolvedValueOnce({
      id: 'post-1',
      flagged: false,
      commentCount: 2,
      authorId: 'author-1'
    });

    prisma.comment.create.mockResolvedValueOnce({
      id: 'comment-1',
      postId: 'post-1',
      body: 'Congrats!',
      flagged: false,
      createdAt: new Date('2025-01-03T00:00:00Z'),
      updatedAt: new Date('2025-01-03T00:00:00Z'),
      authorId: memberUser.id,
      author: {
        id: memberUser.id,
        email: memberUser.email,
        profile: {
          displayName: 'Member One'
        }
      }
    });

    prisma.feedPost.update.mockResolvedValueOnce({
      id: 'post-1',
      commentCount: 3
    });

    prisma.engagementEvent.create.mockResolvedValueOnce({
      id: 'event-123'
    });

    const result = await service.createComment(memberUser, 'post-1', { body: 'Congrats!' });

    expect(prisma.comment.create).toHaveBeenCalled();
    expect(prisma.feedPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'post-1' },
        data: { commentCount: { increment: 1 } }
      })
    );
    expect(prisma.engagementEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'event-123',
          userId: memberUser.id,
          postId: 'post-1',
          commentId: 'comment-1',
          type: 'COMMENT_CREATED',
          occurredAt: new Date('2025-01-03T00:00:00Z')
        })
      })
    );

    expect(result).toMatchObject({
      id: 'comment-1',
      body: 'Congrats!',
      postId: 'post-1',
      author: {
        id: memberUser.id,
        displayName: 'Member One'
      }
    });
  });

  it('updates reaction summaries and metrics when reacting to a post', async () => {
    const prisma = createMockPrisma();
    const service = new CommunityService(prisma as unknown as PrismaClient, () => 'event-456', () => new Date('2025-01-04T00:00:00Z'));

    prisma.feedPost.findUnique.mockResolvedValueOnce({
      id: 'post-1',
      flagged: false,
      reactionSummary: { [ReactionType.BOOST]: 1 }
    });

    prisma.reaction.findFirst.mockResolvedValueOnce(null);

    prisma.reaction.create.mockResolvedValueOnce({
      id: 'reaction-99',
      postId: 'post-1',
      commentId: null,
      userId: memberUser.id,
      type: ReactionType.HIGH_FIVE,
      createdAt: new Date('2025-01-04T00:00:00Z'),
      user: {
        id: memberUser.id,
        email: memberUser.email,
        profile: {
          displayName: 'Member One'
        }
      }
    });

    prisma.feedPost.update.mockResolvedValueOnce({
      id: 'post-1',
      reactionSummary: { [ReactionType.BOOST]: 1, [ReactionType.HIGH_FIVE]: 1 }
    });

    prisma.engagementEvent.create.mockResolvedValueOnce({
      id: 'event-456'
    });

    const result = await service.reactToPost(memberUser, 'post-1', { type: ReactionType.HIGH_FIVE });

    expect(prisma.reaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: memberUser.id,
          postId: 'post-1',
          type: ReactionType.HIGH_FIVE
        }
      })
    );
    expect(prisma.feedPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          reactionSummary: {
            [ReactionType.BOOST]: 1,
            [ReactionType.HIGH_FIVE]: 1
          }
        }
      })
    );
    expect(prisma.engagementEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'event-456',
          type: 'REACTION_ADDED'
        })
      })
    );
    expect(result).toMatchObject({
      id: 'reaction-99',
      postId: 'post-1',
      type: ReactionType.HIGH_FIVE,
      user: {
        id: memberUser.id,
        displayName: 'Member One'
      }
    });
  });

  it('treats duplicate reactions as no-ops without emitting events', async () => {
    const prisma = createMockPrisma();
    const service = new CommunityService(prisma as unknown as PrismaClient, () => 'event-duplicate', () => new Date('2025-01-04T12:00:00Z'));

    prisma.feedPost.findUnique.mockResolvedValueOnce({
      id: 'post-1',
      flagged: false,
      reactionSummary: { [ReactionType.BOOST]: 1 }
    });

    prisma.reaction.findFirst.mockResolvedValueOnce({
      id: 'reaction-1',
      postId: 'post-1',
      userId: memberUser.id,
      type: ReactionType.BOOST
    });

    prisma.reaction.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'reaction-1',
      postId: 'post-1',
      commentId: null,
      userId: memberUser.id,
      type: ReactionType.BOOST,
      createdAt: new Date('2025-01-04T00:00:00Z'),
      user: {
        id: memberUser.id,
        email: memberUser.email,
        profile: {
          displayName: 'Member One'
        }
      }
    });

    const result = await service.reactToPost(memberUser, 'post-1', { type: ReactionType.BOOST });

    expect(prisma.reaction.update).not.toHaveBeenCalled();
    expect(prisma.reaction.create).not.toHaveBeenCalled();
    expect(prisma.feedPost.update).not.toHaveBeenCalled();
    expect(prisma.engagementEvent.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'reaction-1',
      type: ReactionType.BOOST,
      user: {
        id: memberUser.id,
        displayName: 'Member One'
      }
    });
  });

  it('prevents members from updating flagged comments', async () => {
    const prisma = createMockPrisma();
    const service = new CommunityService(prisma as unknown as PrismaClient, () => 'event-flag', () => new Date('2025-01-05T00:00:00Z'));

    prisma.comment.findUnique.mockResolvedValueOnce({
      id: 'comment-flagged',
      postId: 'post-1',
      authorId: memberUser.id,
      body: 'Flagged comment',
      flagged: true,
      createdAt: new Date('2025-01-02T00:00:00Z'),
      updatedAt: new Date('2025-01-02T00:00:00Z'),
      author: {
        id: memberUser.id,
        email: memberUser.email,
        profile: {
          displayName: 'Member One'
        }
      },
      post: {
        id: 'post-1',
        flagged: false
      }
    });

    await expect(service.updateComment(memberUser, 'comment-flagged', { body: 'Updated' })).rejects.toMatchObject({
      status: 404,
      code: 'COMMENT_NOT_FOUND'
    });
  });

  it('allows moderators to update flagged comments', async () => {
    const prisma = createMockPrisma();
    const service = new CommunityService(prisma as unknown as PrismaClient, () => 'event-flag', () => new Date('2025-01-05T00:00:00Z'));

    prisma.comment.findUnique.mockResolvedValueOnce({
      id: 'comment-flagged',
      postId: 'post-1',
      authorId: memberUser.id,
      body: 'Flagged comment',
      flagged: true,
      createdAt: new Date('2025-01-02T00:00:00Z'),
      updatedAt: new Date('2025-01-02T00:00:00Z'),
      author: {
        id: memberUser.id,
        email: memberUser.email,
        profile: {
          displayName: 'Member One'
        }
      },
      post: {
        id: 'post-1',
        flagged: false
      }
    });

    prisma.comment.update.mockResolvedValueOnce({
      id: 'comment-flagged',
      postId: 'post-1',
      authorId: memberUser.id,
      body: 'Moderator edit',
      flagged: true,
      createdAt: new Date('2025-01-02T00:00:00Z'),
      updatedAt: new Date('2025-01-05T00:00:00Z'),
      author: {
        id: memberUser.id,
        email: memberUser.email,
        profile: {
          displayName: 'Member One'
        }
      }
    });

    const result = await service.updateComment(moderatorUser, 'comment-flagged', { body: 'Moderator edit' });

    expect(prisma.comment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'comment-flagged' },
        data: { body: 'Moderator edit' }
      })
    );
    expect(result.body).toBe('Moderator edit');
  });

  it('paginates feed results without skipping records', async () => {
    const prisma = createMockPrisma();
    const service = new CommunityService(prisma as unknown as PrismaClient, () => 'event-page', () => new Date('2025-01-06T00:00:00Z'));

    const createPost = (id: string, createdAt: Date) => ({
      id,
      authorId: 'author-1',
      body: `Post ${id}`,
      tags: [],
      visibility: PostVisibility.MEMBERS,
      flagged: false,
      reactionSummary: {},
      commentCount: 0,
      createdAt,
      updatedAt: createdAt,
      author: {
        id: 'author-1',
        email: 'author@example.com',
        profile: {
          displayName: 'Author'
        }
      }
    });

    prisma.feedPost.findMany.mockResolvedValueOnce([
      createPost('post-1', new Date('2025-01-05T10:00:00Z')),
      createPost('post-2', new Date('2025-01-05T09:00:00Z')),
      createPost('post-3', new Date('2025-01-05T08:00:00Z'))
    ]);
    prisma.reaction.findMany.mockResolvedValueOnce([]);

    const firstPage = await service.listFeed(memberUser, { limit: 2 });

    expect(firstPage.data.map((post) => post.id)).toEqual(['post-1', 'post-2']);
    expect(firstPage.meta).toMatchObject({ nextCursor: 'post-2', hasMore: true });

    prisma.feedPost.findMany.mockResolvedValueOnce([createPost('post-3', new Date('2025-01-05T08:00:00Z'))]);
    prisma.reaction.findMany.mockResolvedValueOnce([]);

    const secondPage = await service.listFeed(memberUser, {
      limit: 2,
      cursor: firstPage.meta.nextCursor!
    });

    expect(secondPage.data.map((post) => post.id)).toEqual(['post-3']);
    expect(secondPage.meta.nextCursor).toBeNull();
    expect(secondPage.meta.hasMore).toBe(false);
  });

  it('skips flagged posts referenced by cursors for members', async () => {
    const prisma = createMockPrisma();
    const service = new CommunityService(prisma as unknown as PrismaClient, () => 'event-skip', () => new Date('2025-01-07T00:00:00Z'));

    prisma.feedPost.findMany
      .mockResolvedValueOnce([
        {
          id: 'post-flagged-after',
          authorId: 'author-2',
          body: 'Flagged after cursor',
          tags: [],
          visibility: PostVisibility.MEMBERS,
          flagged: true,
          reactionSummary: {},
          commentCount: 0,
          createdAt: new Date('2025-01-06T10:00:00Z'),
          updatedAt: new Date('2025-01-06T10:00:00Z'),
          author: {
            id: 'author-2',
            email: 'author2@example.com',
            profile: {
              displayName: 'Author Two'
            }
          }
        },
        {
          id: 'post-visible-next',
          authorId: 'author-3',
          body: 'Next visible post',
          tags: [],
          visibility: PostVisibility.MEMBERS,
          flagged: false,
          reactionSummary: {},
          commentCount: 0,
          createdAt: new Date('2025-01-06T09:00:00Z'),
          updatedAt: new Date('2025-01-06T09:00:00Z'),
          author: {
            id: 'author-3',
            email: 'author3@example.com',
            profile: {
              displayName: 'Author Three'
            }
          }
        }
      ])
      .mockResolvedValueOnce([]);

    prisma.reaction.findMany.mockResolvedValueOnce([]);

    const result = await service.listFeed(memberUser, { limit: 1, cursor: 'post-previous' });

    expect(result.data.map((post) => post.id)).toEqual(['post-visible-next']);
    expect(result.meta.nextCursor).toBeNull();
  });

  it('paginates comments without skipping records', async () => {
    const prisma = createMockPrisma();
    const service = new CommunityService(prisma as unknown as PrismaClient, () => 'event-page', () => new Date('2025-01-06T00:00:00Z'));

    prisma.feedPost.findUnique.mockResolvedValue({
      id: 'post-1',
      flagged: false
    });

    const createComment = (id: string, createdAt: Date) => ({
      id,
      postId: 'post-1',
      authorId: memberUser.id,
      body: `Comment ${id}`,
      flagged: false,
      createdAt,
      updatedAt: createdAt,
      author: {
        id: memberUser.id,
        email: memberUser.email,
        profile: {
          displayName: 'Member One'
        }
      }
    });

    prisma.comment.findMany.mockResolvedValueOnce([
      createComment('comment-1', new Date('2025-01-05T10:00:00Z')),
      createComment('comment-2', new Date('2025-01-05T09:00:00Z')),
      createComment('comment-3', new Date('2025-01-05T08:00:00Z'))
    ]);

    const firstPage = await service.listComments(memberUser, 'post-1', { limit: 2 });

    expect(firstPage.data.map((comment) => comment.id)).toEqual(['comment-1', 'comment-2']);
    expect(firstPage.meta).toMatchObject({ nextCursor: 'comment-2', hasMore: true });

    prisma.comment.findMany.mockResolvedValueOnce([createComment('comment-3', new Date('2025-01-05T08:00:00Z'))]);

    const secondPage = await service.listComments(memberUser, 'post-1', {
      limit: 2,
      cursor: firstPage.meta.nextCursor!
    });

    expect(secondPage.data.map((comment) => comment.id)).toEqual(['comment-3']);
    expect(secondPage.meta.nextCursor).toBeNull();
    expect(secondPage.meta.hasMore).toBe(false);
  });

  it('skips flagged comments referenced by cursors for members', async () => {
    const prisma = createMockPrisma();
    const service = new CommunityService(prisma as unknown as PrismaClient, () => 'event-skip', () => new Date('2025-01-07T00:00:00Z'));

    prisma.feedPost.findUnique.mockResolvedValue({
      id: 'post-1',
      flagged: false
    });

    prisma.comment.findMany
      .mockResolvedValueOnce([
        {
          id: 'comment-flagged-after',
          postId: 'post-1',
          authorId: memberUser.id,
          body: 'Flagged comment',
          flagged: true,
          createdAt: new Date('2025-01-06T10:00:00Z'),
          updatedAt: new Date('2025-01-06T10:00:00Z'),
          author: {
            id: memberUser.id,
            email: memberUser.email,
            profile: {
              displayName: 'Member One'
            }
          }
        },
        {
          id: 'comment-visible-next',
          postId: 'post-1',
          authorId: memberUser.id,
          body: 'Visible comment',
          flagged: false,
          createdAt: new Date('2025-01-06T09:00:00Z'),
          updatedAt: new Date('2025-01-06T09:00:00Z'),
          author: {
            id: memberUser.id,
            email: memberUser.email,
            profile: {
              displayName: 'Member One'
            }
          }
        }
      ])
      .mockResolvedValueOnce([]);

    const result = await service.listComments(memberUser, 'post-1', { limit: 1, cursor: 'comment-previous' });

    expect(result.data.map((comment) => comment.id)).toEqual(['comment-visible-next']);
    expect(result.meta.nextCursor).toBeNull();
  });
});
