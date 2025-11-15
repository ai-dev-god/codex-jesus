import { apiFetch } from './http';

export type UserSummary = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ViewerActions = {
  reacted: boolean;
  reactionType: string | null;
};

export type FeedPost = {
  id: string;
  body: string;
  tags: string[];
  visibility: string;
  flagged: boolean;
  commentCount: number;
  reactionSummary: Record<string, number>;
  author: UserSummary;
  viewerActions: ViewerActions;
  createdAt: string;
  updatedAt: string;
};

export type FeedResponse = {
  data: FeedPost[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
  };
};

export type FeedQuery = {
  cursor?: string | null;
  limit?: number;
  scope?: 'GLOBAL' | 'COHORT' | 'PERSONALIZED';
};

export const fetchCommunityFeed = (accessToken: string, query: FeedQuery = {}): Promise<FeedResponse> => {
  const params = new URLSearchParams();
  if (query.cursor) {
    params.set('cursor', query.cursor);
  }
  if (query.limit) {
    params.set('limit', query.limit.toString());
  }
  if (query.scope) {
    params.set('scope', query.scope);
  }

  const path = params.toString() ? `/community/feed?${params.toString()}` : '/community/feed';

  return apiFetch<FeedResponse>(path, {
    method: 'GET',
    authToken: accessToken
  });
};

