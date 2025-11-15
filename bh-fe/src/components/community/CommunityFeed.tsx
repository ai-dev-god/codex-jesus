import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, MessageCircle, Share2, TrendingUp, Award, Users, Sparkles } from 'lucide-react';

import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { useAuth } from '../../lib/auth/AuthContext';
import { fetchCommunityFeed, type FeedPost } from '../../lib/api/community';
import { ApiError } from '../../lib/api/error';

const milestones = [
  { id: '1', user: 'Alex Rivera', achievement: 'Improved VO2 Max by 15%', date: 'Today', icon: TrendingUp, color: 'bio' },
  { id: '2', user: 'Jessica Park', achievement: '100-day Protocol Streak', date: 'Yesterday', icon: Award, color: 'solar' },
  { id: '3', user: 'David Kim', achievement: 'Longevity Score: 90+', date: '2 days ago', icon: Award, color: 'electric' }
];

export default function CommunityFeed() {
  const { ensureAccessToken } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const loadFeed = useCallback(
    async ({ reset = false }: { reset?: boolean } = {}) => {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      try {
        const token = await ensureAccessToken();
        const response = await fetchCommunityFeed(token, {
          limit: 5,
          scope: 'GLOBAL',
          cursor: reset ? undefined : cursorRef.current ?? undefined
        });
        setPosts((prev) => (reset ? response.data : [...prev, ...response.data]));
        cursorRef.current = response.meta.nextCursor;
        setHasMore(response.meta.hasMore);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Unable to load the community feed right now.');
      } finally {
        if (reset) {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [ensureAccessToken]
  );

  useEffect(() => {
    void loadFeed({ reset: true });
  }, [loadFeed]);

  const totalReactions = useCallback(
    (post: FeedPost) => Object.values(post.reactionSummary ?? {}).reduce((sum, value) => sum + value, 0),
    []
  );

  const relativeTimeFormatter = useMemo(() => new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }), []);

  const formatTimestamp = useCallback(
    (timestamp: string) => formatRelativeTime(timestamp, relativeTimeFormatter),
    [relativeTimeFormatter]
  );

  return (
    <div className="min-h-screen mesh-gradient py-12 px-6" data-testid="view-community">
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="tag text-steel mb-3">COMMUNITY</div>
            <h2 className="mb-4">Connect with practitioners and biohackers</h2>
            <p className="text-xl text-steel max-w-2xl">
              Share progress, learn from experts, and stay motivated with the longevity community
            </p>
          </div>
          <Button size="lg">
            <Sparkles className="w-5 h-5 mr-2" />
            Share Update
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Tabs defaultValue="feed" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="feed">Feed</TabsTrigger>
                <TabsTrigger value="practitioners">Practitioners</TabsTrigger>
                <TabsTrigger value="insights">Top Insights</TabsTrigger>
              </TabsList>

              <TabsContent value="feed" className="mt-8 space-y-6">
                {error && (
                  <div className="rounded-xl border border-pulse/40 bg-pulse/10 px-4 py-3 text-sm text-pulse">{error}</div>
                )}

                {loading && <div className="neo-card p-8 animate-pulse text-steel">Loading the latest conversations…</div>}

                {!loading &&
                  posts.map((post, index) => {
                    const cardClass = index === 0 ? 'neo-card-electric' : 'neo-card';
                    const reactions = totalReactions(post);

                    return (
                      <div key={post.id} className={`${cardClass} p-8 hover:scale-[1.01] transition-transform`}>
                        <div className="flex items-start gap-4 mb-6">
                          <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-electric">
                            <ImageWithFallback
                              src={
                                post.author.avatarUrl ??
                                'https://images.unsplash.com/photo-1569292567777-e5d61a759322?w=100&h=100&fit=crop'
                              }
                              alt={post.author.displayName}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                              <div>
                                <h4 className="mb-1">{post.author.displayName}</h4>
                                <div className="flex items-center gap-2">
                                  <span className="tag text-steel">{post.visibility.toLowerCase()}</span>
                                  <span className="text-sm text-steel">• {formatTimestamp(post.createdAt)}</span>
                                </div>
                              </div>
                              {index === 0 && (
                                <Badge variant="default" className="bg-electric text-void">
                                  <Sparkles className="w-3 h-3 mr-1" />
                                  Featured
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        <p className="text-ink mb-6 leading-relaxed">{post.body}</p>

                        {Array.isArray(post.tags) && post.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-6">
                            {post.tags.map((tag) => (
                              <Badge key={tag} variant="secondary">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-8 pt-6 border-t-2 border-cloud">
                          <button className="flex items-center gap-2 text-steel hover:text-pulse transition-colors group">
                            <Heart className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            <span className="font-semibold">{reactions}</span>
                          </button>
                          <button className="flex items-center gap-2 text-steel hover:text-electric transition-colors group">
                            <MessageCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            <span className="font-semibold">{post.commentCount}</span>
                          </button>
                          <button className="flex items-center gap-2 text-steel hover:text-neural transition-colors group">
                            <Share2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            <span className="font-semibold">Share</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}

                {!loading && posts.length === 0 && (
                  <div className="neo-card p-8 text-center text-steel">
                    No community posts available yet. Be the first to share something!
                  </div>
                )}

                {!loading && hasMore && (
                  <Button variant="outline" onClick={() => loadFeed()} className="w-full" disabled={loadingMore}>
                    {loadingMore ? 'Loading…' : 'Load More'}
                  </Button>
                )}
              </TabsContent>

              <TabsContent value="practitioners" className="mt-8">
                <div className="neo-card p-16 text-center">
                  <div className="w-20 h-20 rounded-2xl gradient-neural mx-auto mb-6 flex items-center justify-center">
                    <Users className="w-10 h-10 text-void" />
                  </div>
                  <h3 className="mb-3">Connect with certified practitioners</h3>
                  <p className="text-steel max-w-md mx-auto mb-6">
                    Browse our network of longevity experts and functional medicine doctors
                  </p>
                  <Button>Browse Practitioners</Button>
                </div>
              </TabsContent>

              <TabsContent value="insights" className="mt-8">
                <div className="neo-card p-16 text-center">
                  <div className="w-20 h-20 rounded-2xl gradient-bio mx-auto mb-6 flex items-center justify-center">
                    <TrendingUp className="w-10 h-10 text-void" />
                  </div>
                  <h3 className="mb-3">Top insights from the community</h3>
                  <p className="text-steel max-w-md mx-auto mb-6">
                    Most impactful protocols and research shared by members
                  </p>
                  <Button>View Insights</Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-8">
            <div className="neo-card p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl gradient-solar flex items-center justify-center">
                  <Award className="w-5 h-5 text-void" />
                </div>
                <h3>Recent Milestones</h3>
              </div>
              <div className="space-y-4">
                {milestones.map((milestone) => {
                  const Icon = milestone.icon;
                  const gradientClass = `gradient-${milestone.color}`;
                  return (
                    <div key={milestone.id} className="flex items-start gap-3 p-4 rounded-xl bg-pearl hover:bg-cloud transition-colors">
                      <div className={`w-12 h-12 rounded-xl ${gradientClass} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-6 h-6 text-void" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="mb-1 truncate">{milestone.user}</h4>
                        <p className="text-sm text-steel mb-1">{milestone.achievement}</p>
                        <span className="text-xs font-semibold text-steel">{milestone.date}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="neo-card-neural p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl gradient-neural flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-void" />
                </div>
                <h3>Weekly Challenge</h3>
              </div>
              <p className="text-ink mb-6">Complete 7 days of Zone 2 cardio and share your HRV improvements</p>
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-steel">Progress</span>
                    <span className="text-sm font-bold text-neural">4/7 days</span>
                  </div>
                  <div className="w-full bg-white/50 rounded-full h-2 overflow-hidden">
                    <div className="gradient-neural h-2 transition-all" style={{ width: '57%' }} />
                  </div>
                </div>
              </div>
              <Button className="w-full" variant="outline">
                View Challenge
              </Button>
            </div>

            <div className="neo-card p-8">
              <h4 className="mb-6">Community Stats</h4>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-steel">Active Members</span>
                  <span className="font-bold text-ink">10,247</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-steel">Protocols Shared</span>
                  <span className="font-bold text-ink">1,893</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-steel">Avg. Longevity Score</span>
                  <span className="font-bold gradient-text-electric">84</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-steel">Total Milestones</span>
                  <span className="font-bold text-ink">5,621</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(dateString: string, formatter: Intl.RelativeTimeFormat): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minute');
  }

  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour');
  }

  return formatter.format(diffDays, 'day');
}

