import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Music, Target, Clock, Trophy, MessageCircle, Play, Calendar, ChevronRight, Sparkles, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface FeedPost {
  id: number;
  userId: string;
  type: string;
  content: string | null;
  pieceId: number | null;
  recordingUrl: string | null;
  practiceHours: number | null;
  createdAt: string;
  displayName: string | null;
  avatarUrl: string | null;
  pieceTitle: string | null;
  composerName: string | null;
}

interface Challenge {
  id: number;
  title: string;
  description: string;
  pieceId: number | null;
  startMeasure: number | null;
  endMeasure: number | null;
  deadline: string | null;
  isActive: boolean;
}

interface SuggestedUser {
  userId: string;
  displayName: string;
  instrument: string | null;
  level: string | null;
  avatarUrl: string | null;
}

function getPostIcon(type: string) {
  switch (type) {
    case "status_change": return <Music className="w-4 h-4" />;
    case "milestone": return <Trophy className="w-4 h-4" />;
    case "practice_log": return <Clock className="w-4 h-4" />;
    case "recording": return <Play className="w-4 h-4" />;
    default: return <MessageCircle className="w-4 h-4" />;
  }
}

function getPostTypeLabel(type: string) {
  switch (type) {
    case "status_change": return "Repertoire Update";
    case "milestone": return "Milestone";
    case "practice_log": return "Practice Log";
    case "recording": return "Recording";
    default: return "Post";
  }
}

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function PostCard({ post }: { post: FeedPost }) {
  const timeAgo = post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : "";
  
  return (
    <Card className="bg-white/80 backdrop-blur-sm border-border/50 hover:shadow-md transition-shadow" data-testid={`post-card-${post.id}`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12 border-2 border-[#d4967c]/20">
            <AvatarImage src={post.avatarUrl || undefined} alt={post.displayName || "User"} />
            <AvatarFallback className="bg-[#d4967c]/10 text-[#d4967c] font-semibold">
              {getInitials(post.displayName)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-foreground" data-testid={`post-author-${post.id}`}>
                {post.displayName || "Anonymous"}
              </span>
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                {getPostIcon(post.type)}
                {getPostTypeLabel(post.type)}
              </Badge>
            </div>
            
            <p className="text-muted-foreground text-sm mb-3" data-testid={`post-time-${post.id}`}>{timeAgo}</p>
            
            {post.content && (
              <p className="text-foreground mb-3 leading-relaxed" data-testid={`post-content-${post.id}`}>{post.content}</p>
            )}
            
            {post.pieceTitle && post.composerName && (
              <Link href={`/piece/${post.pieceId}`}>
                <div className="inline-flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer" data-testid={`post-piece-${post.id}`}>
                  <Music className="w-4 h-4 text-[#d4967c]" />
                  <span className="text-sm">
                    <span className="font-medium">{post.pieceTitle}</span>
                    <span className="text-muted-foreground"> by {post.composerName}</span>
                  </span>
                </div>
              </Link>
            )}
            
            {post.recordingUrl && (
              <div className="mt-3 p-4 bg-[#d4967c]/5 rounded-lg border border-[#d4967c]/20" data-testid={`post-recording-${post.id}`}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#d4967c] flex items-center justify-center">
                    <Play className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Recording Available</p>
                    <p className="text-xs text-muted-foreground">Click to listen</p>
                  </div>
                </div>
              </div>
            )}
            
            {post.practiceHours && post.type === "milestone" && (
              <div className="mt-3 flex items-center gap-2 text-[#d4967c]" data-testid={`post-milestone-${post.id}`}>
                <Trophy className="w-5 h-5" />
                <span className="font-semibold">{post.practiceHours} hours</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const daysRemaining = challenge.deadline 
    ? Math.ceil((new Date(challenge.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  
  return (
    <Card className="bg-gradient-to-br from-[#d4967c]/10 to-[#d4967c]/5 border-[#d4967c]/30 hover:border-[#d4967c]/50 transition-colors" data-testid={`challenge-card-${challenge.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#d4967c]/20 flex items-center justify-center shrink-0">
            <Target className="w-5 h-5 text-[#d4967c]" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-foreground mb-1 truncate" data-testid={`challenge-title-${challenge.id}`}>
              {challenge.title}
            </h4>
            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
              {challenge.description}
            </p>
            {daysRemaining !== null && daysRemaining > 0 && (
              <div className="flex items-center gap-1 text-xs text-[#d4967c]">
                <Calendar className="w-3 h-3" />
                <span>{daysRemaining} days left</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SuggestedUserCard({ user }: { user: SuggestedUser }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors" data-testid={`suggested-user-${user.userId}`}>
      <Avatar className="h-10 w-10">
        <AvatarImage src={user.avatarUrl || undefined} alt={user.displayName} />
        <AvatarFallback className="bg-[#d4967c]/10 text-[#d4967c] text-sm font-semibold">
          {getInitials(user.displayName)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{user.displayName}</p>
        <p className="text-xs text-muted-foreground truncate">
          {user.level} {user.instrument && `• ${user.instrument}`}
        </p>
      </div>
      <Button variant="ghost" size="sm" className="shrink-0 h-8 w-8 p-0" data-testid={`button-follow-${user.userId}`}>
        <UserPlus className="w-4 h-4" />
      </Button>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="bg-white/80">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function FeedPage() {
  const username = localStorage.getItem("username") || "niraj_suresh";
  
  const { data: userInfo } = useQuery<{ id: string } | null>({
    queryKey: ["/api/users/lookup", username],
    queryFn: async () => {
      const res = await fetch(`/api/users/lookup/${username}`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const userId = userInfo?.id;

  const { data: posts, isLoading: postsLoading } = useQuery<FeedPost[]>({
    queryKey: ["/api/feed", userId],
    queryFn: async () => {
      if (!userId) return [];
      const res = await fetch(`/api/feed/${userId}`);
      if (!res.ok) throw new Error("Failed to fetch feed");
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: challenges, isLoading: challengesLoading } = useQuery<Challenge[]>({
    queryKey: ["/api/challenges"],
    queryFn: async () => {
      const res = await fetch("/api/challenges");
      if (!res.ok) throw new Error("Failed to fetch challenges");
      return res.json();
    },
  });

  const { data: suggestedUsers } = useQuery<SuggestedUser[]>({
    queryKey: ["/api/users", userId, "suggested"],
    queryFn: async () => {
      if (!userId) return [];
      const res = await fetch(`/api/users/${userId}/suggested`);
      if (!res.ok) throw new Error("Failed to fetch suggested users");
      return res.json();
    },
    enabled: !!userId,
  });

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            <div className="lg:col-span-8">
              <div className="flex items-center justify-between mb-6">
                <h1 className="font-serif text-3xl font-bold text-primary" data-testid="feed-title">Your Feed</h1>
                <Button variant="outline" size="sm" className="text-sm" data-testid="button-refresh-feed">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>
              
              {postsLoading ? (
                <FeedSkeleton />
              ) : posts && posts.length > 0 ? (
                <div className="space-y-4" data-testid="feed-posts-list">
                  {posts.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              ) : (
                <Card className="bg-white/80">
                  <CardContent className="p-12 text-center">
                    <Music className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-serif text-xl font-semibold mb-2">No posts yet</h3>
                    <p className="text-muted-foreground mb-4">Follow other musicians to see their updates here.</p>
                    <Link href="/search">
                      <Button variant="outline" data-testid="button-discover-musicians">
                        Discover Musicians
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>
            
            <div className="lg:col-span-4 space-y-6">
              <Card className="bg-white/80 backdrop-blur-sm border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="w-5 h-5 text-[#d4967c]" />
                    Community Challenges
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3" data-testid="challenges-list">
                  {challengesLoading ? (
                    <div className="space-y-3">
                      {[1, 2].map((i) => (
                        <Skeleton key={i} className="h-24 w-full" />
                      ))}
                    </div>
                  ) : challenges && challenges.length > 0 ? (
                    challenges.slice(0, 3).map((challenge) => (
                      <ChallengeCard key={challenge.id} challenge={challenge} />
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">No active challenges</p>
                  )}
                  
                  {challenges && challenges.length > 3 && (
                    <Button variant="ghost" className="w-full text-sm text-[#d4967c] hover:text-[#d4967c]" data-testid="button-view-all-challenges">
                      View All Challenges
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  )}
                </CardContent>
              </Card>
              
              <Card className="bg-white/80 backdrop-blur-sm border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-[#d4967c]" />
                    Musicians to Follow
                  </CardTitle>
                </CardHeader>
                <CardContent data-testid="suggested-users-list">
                  {suggestedUsers && suggestedUsers.length > 0 ? (
                    <div className="space-y-1">
                      {suggestedUsers.map((user) => (
                        <SuggestedUserCard key={user.userId} user={user} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm py-2">No suggestions available</p>
                  )}
                </CardContent>
              </Card>
              
              <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                <CardContent className="p-5">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Play className="w-4 h-4 text-[#d4967c]" />
                    Latest Recordings
                  </h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Discover recordings shared by the community
                  </p>
                  <Link href="/search?type=recordings">
                    <Button variant="outline" size="sm" className="w-full" data-testid="button-browse-recordings">
                      Browse Recordings
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
