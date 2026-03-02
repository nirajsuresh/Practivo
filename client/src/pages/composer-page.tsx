import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Users, BookOpen, Trophy, ExternalLink, Music2, Youtube, Hash } from "lucide-react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const currentUserId = () => localStorage.getItem("userId") || "";

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center p-4 bg-muted/40 rounded-xl gap-1">
      <div className="text-muted-foreground mb-1">{icon}</div>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</span>
    </div>
  );
}

function DifficultyBadge({ difficulty }: { difficulty?: string | null }) {
  if (!difficulty) return null;
  const colors: Record<string, string> = {
    Beginner: "bg-green-100 text-green-800",
    Intermediate: "bg-blue-100 text-blue-800",
    Advanced: "bg-orange-100 text-orange-800",
    Expert: "bg-red-100 text-red-800",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", colors[difficulty] ?? "bg-muted text-muted-foreground")}>
      {difficulty}
    </span>
  );
}

export default function ComposerPage() {
  const params = useParams<{ id: string }>();
  const composerId = params.id ? parseInt(params.id) : 0;
  const userId = currentUserId();
  const queryClient = useQueryClient();

  const { data: composer, isLoading: composerLoading } = useQuery({
    queryKey: ["/api/composers", composerId],
    queryFn: async () => {
      const res = await fetch(`/api/composers/${composerId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!composerId,
  });

  const { data: community } = useQuery({
    queryKey: ["/api/composers", composerId, "community"],
    queryFn: async () => {
      const res = await fetch(`/api/composers/${composerId}/community`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!composerId,
  });

  const { data: pieces } = useQuery({
    queryKey: ["/api/composers", composerId, "pieces"],
    queryFn: async () => {
      const res = await fetch(`/api/composers/${composerId}/pieces`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!composerId,
  });

  const { data: followStatus, isLoading: followLoading } = useQuery({
    queryKey: ["/api/composers", composerId, "follow-status", userId],
    queryFn: async () => {
      if (!userId) return { following: false };
      const res = await fetch(`/api/composers/${composerId}/follow-status?userId=${userId}`);
      if (!res.ok) return { following: false };
      return res.json();
    },
    enabled: !!composerId && !!userId,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      const method = followStatus?.following ? "DELETE" : "POST";
      const res = await fetch(`/api/composers/${composerId}/follow`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("Failed to update follow");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/composers", composerId, "follow-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/composers", composerId, "community"] });
    },
  });

  if (composerLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </Layout>
    );
  }

  if (!composer) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-muted-foreground">Composer not found.</div>
        </div>
      </Layout>
    );
  }

  const lifeDates =
    composer.birthYear && composer.deathYear
      ? `${composer.birthYear}–${composer.deathYear}`
      : composer.birthYear
      ? `b. ${composer.birthYear}`
      : null;

  const isFollowing = followStatus?.following ?? false;

  return (
    <Layout>
      <div className="min-h-screen bg-background py-10">
        <div className="container mx-auto px-4 max-w-5xl">
          {/* Back */}
          <Link href="/search">
            <Button variant="ghost" size="sm" className="mb-6 group">
              <ArrowLeft className="w-4 h-4 mr-2 transition-transform group-hover:-translate-x-1" />
              Back
            </Button>
          </Link>

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-start gap-6 mb-8">
            {composer.imageUrl ? (
              <img
                src={composer.imageUrl}
                alt={composer.name}
                className="w-24 h-24 rounded-full object-cover border-2 border-border shadow-md flex-shrink-0"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 border-2 border-border">
                <Music2 className="w-10 h-10 text-primary/60" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                <h1 className="font-serif text-4xl font-bold">{composer.name}</h1>
                {userId && (
                  <Button
                    variant={isFollowing ? "outline" : "default"}
                    size="sm"
                    className="self-start sm:self-auto"
                    onClick={() => followMutation.mutate()}
                    disabled={followMutation.isPending || followLoading}
                  >
                    {isFollowing ? "Following" : "Follow"}
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-3">
                {lifeDates && <span>{lifeDates}</span>}
                {lifeDates && composer.nationality && <span>·</span>}
                {composer.nationality && <span>{composer.nationality}</span>}
              </div>

              {composer.bio && (
                <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{composer.bio}</p>
              )}
            </div>
          </div>

          {/* Community stats strip */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            <StatCard
              label="Followers"
              value={community?.followerCount ?? 0}
              icon={<Users className="w-4 h-4" />}
            />
            <StatCard
              label="Active learners"
              value={community?.activeLearners ?? 0}
              icon={<BookOpen className="w-4 h-4" />}
            />
            <StatCard
              label="Most studied"
              value={community?.mostPopularPiece?.title ? truncateTitle(community.mostPopularPiece.title) : "—"}
              icon={<Trophy className="w-4 h-4" />}
            />
          </div>

          {/* Catalog */}
          <Card className="mb-8 border-none shadow-sm">
            <CardHeader className="bg-muted/30 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Music2 className="w-4 h-4" />
                Catalog
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!pieces || pieces.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">No pieces in the database yet.</div>
              ) : (
                <div className="divide-y divide-border">
                  {pieces.map((piece: any) => (
                    <Link key={piece.id} href={`/piece/${piece.id}`}>
                      <div className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors cursor-pointer group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm group-hover:text-primary transition-colors">
                              {piece.title}
                            </span>
                            {piece.keySignature && (
                              <span className="text-xs text-muted-foreground">{piece.keySignature}</span>
                            )}
                            {piece.yearComposed && (
                              <span className="text-xs text-muted-foreground">({piece.yearComposed})</span>
                            )}
                            <DifficultyBadge difficulty={piece.difficulty} />
                          </div>
                          {piece.imslpUrl && (
                            <a
                              href={piece.imslpUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-0.5 w-fit"
                              onClick={e => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3 h-3" />
                              IMSLP
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground ml-4 flex-shrink-0">
                          {piece.learnerCount > 0 && (
                            <>
                              <Users className="w-3 h-3" />
                              <span>{piece.learnerCount} learning</span>
                            </>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* YouTube stub */}
          <Card className="mb-4 border-none shadow-sm">
            <CardHeader className="bg-muted/30 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Youtube className="w-4 h-4" />
                From YouTube
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground italic">
                Top performances and analyses from YouTube — coming soon.
              </p>
            </CardContent>
          </Card>

          {/* Reddit stub */}
          <Card className="border-none shadow-sm">
            <CardHeader className="bg-muted/30 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Hash className="w-4 h-4" />
                From Reddit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground italic">
                Recent discussions from r/piano and r/classicalmusic — coming soon.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

function truncateTitle(title: string, maxLen = 18): string {
  return title.length > maxLen ? title.slice(0, maxLen) + "…" : title;
}
