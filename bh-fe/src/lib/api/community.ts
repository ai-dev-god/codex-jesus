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

export type PerformanceLeaderboardEntry = {
  rank: number;
  user: UserSummary;
  totals: {
    distanceKm: number;
    movingMinutes: number;
    sessions: number;
    strainScore: number | null;
    activityCount: number;
  };
  highlight: string | null;
  strava: {
    athleteName: string | null;
    profileUrl: string | null;
  } | null;
};

export type PerformanceLeaderboard = {
  window: {
    start: string;
    end: string;
    days: number;
  };
  generatedAt: string;
  entries: PerformanceLeaderboardEntry[];
  viewerRank: number | null;
};

type LeaderboardQuery = {
  windowDays?: number;
  limit?: number;
};

export const fetchPerformanceLeaderboard = (
  accessToken: string,
  query: LeaderboardQuery = {}
): Promise<PerformanceLeaderboard> => {
  const params = new URLSearchParams();
  if (query.windowDays) {
    params.set('windowDays', String(query.windowDays));
  }
  if (query.limit) {
    params.set('limit', String(query.limit));
  }

  const path = params.toString() ? `/community/performance?${params.toString()}` : '/community/performance';

  return apiFetch<PerformanceLeaderboard>(path, {
    method: 'GET',
    authToken: accessToken
  });
};

