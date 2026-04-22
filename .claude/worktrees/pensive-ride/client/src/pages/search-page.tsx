import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MapPin, Music2, UserPlus, Clock, Check } from "lucide-react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ComposerResult {
  id: number;
  name: string;
  nationality: string | null;
  birthYear: number | null;
  deathYear: number | null;
}

interface UnifiedPieceResult {
  type: "piece" | "movement";
  composerId: number;
  composerName: string;
  pieceId: number;
  pieceTitle: string;
  movementId: number | null;
  movementName: string | null;
}

interface UserResult {
  userId: string;
  displayName: string;
  instrument: string | null;
  level: string | null;
  avatarUrl: string | null;
  location: string | null;
}

function useSearchQuery() {
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') || "");

  useEffect(() => {
    const handleChange = () => {
      setQuery(new URLSearchParams(window.location.search).get('q') || "");
    };
    window.addEventListener('popstate', handleChange);
    window.addEventListener('pushstate', handleChange);
    const origPush = history.pushState.bind(history);
    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      origPush(...args);
      handleChange();
    };
    return () => {
      window.removeEventListener('popstate', handleChange);
      window.removeEventListener('pushstate', handleChange);
      history.pushState = origPush;
    };
  }, []);

  return query;
}

function ConnectionButton({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: status } = useQuery<{ status: string; connectionId?: number }>({
    queryKey: [`/api/connections/status/${userId}`],
  });

  const sendRequest = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/connections", { recipientId: userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/connections/status/${userId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/connections/sent", localStorage.getItem("userId") || ""] });
      toast({ title: "Connection request sent" });
    },
    onError: () => {
      toast({ title: "Failed to send request", variant: "destructive" });
    },
  });

  if (!status || status.status === "none") {
    return (
      <Button
        size="sm"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); sendRequest.mutate(); }}
        disabled={sendRequest.isPending}
        data-testid={`button-connect-${userId}`}
      >
        <UserPlus className="w-4 h-4 mr-1" />
        Connect
      </Button>
    );
  }

  if (status.status === "pending_sent") {
    return (
      <Button size="sm" variant="outline" disabled data-testid={`button-pending-${userId}`}>
        <Clock className="w-4 h-4 mr-1" />
        Pending
      </Button>
    );
  }

  if (status.status === "accepted") {
    return (
      <Button size="sm" variant="outline" disabled data-testid={`button-connected-${userId}`}>
        <Check className="w-4 h-4 mr-1" />
        Connected
      </Button>
    );
  }

  if (status.status === "pending_received") {
    return (
      <Link href="/connections">
        <Button size="sm" variant="secondary" data-testid={`button-respond-${userId}`} onClick={(e) => e.stopPropagation()}>
          Respond
        </Button>
      </Link>
    );
  }

  return null;
}

export default function SearchPage() {
  const query = useSearchQuery();

  const { data: composerResults = [] } = useQuery<ComposerResult[]>({
    queryKey: ["/api/composers/search", `?q=${encodeURIComponent(query)}`],
    enabled: query.trim().length > 0,
  });

  const { data: pieceResults = [] } = useQuery<UnifiedPieceResult[]>({
    queryKey: ["/api/search/unified", `?q=${encodeURIComponent(query)}`],
    enabled: query.trim().length > 0,
  });

  const { data: userResults = [] } = useQuery<UserResult[]>({
    queryKey: ["/api/users/search", `?q=${encodeURIComponent(query)}`],
    enabled: query.trim().length > 0,
  });

  const hasResults = composerResults.length > 0 || pieceResults.length > 0 || userResults.length > 0;
  const hasQuery = query.trim().length > 0;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="font-serif text-3xl font-bold mb-2" data-testid="text-search-title">Search Results</h1>
        <p className="text-muted-foreground mb-8">Showing results for "{query}"</p>

        {!hasResults && hasQuery && (
          <div className="text-center py-20 bg-muted/20 rounded-lg" data-testid="text-no-results">
            <p className="text-muted-foreground">No results found matching your search.</p>
          </div>
        )}

        {hasQuery && (
          <Tabs defaultValue="composers" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-8 bg-muted/50 p-1">
              <TabsTrigger value="composers" data-testid="tab-composers">
                Composers {composerResults.length > 0 && `(${Math.min(composerResults.length, 15)})`}
              </TabsTrigger>
              <TabsTrigger value="pieces" data-testid="tab-pieces">
                Pieces & movements {pieceResults.length > 0 && `(${pieceResults.length})`}
              </TabsTrigger>
              <TabsTrigger value="musicians" data-testid="tab-musicians">
                Musicians {userResults.length > 0 && `(${userResults.length})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="composers" className="mt-0">
              {composerResults.length > 0 ? (
                <div className="grid gap-4">
                  {composerResults.slice(0, 15).map(composer => (
                    <Link key={composer.id} href={`/composer/${composer.id}`}>
                      <Card className="hover:bg-muted/30 transition-colors cursor-pointer border-none shadow-sm" data-testid={`card-composer-${composer.id}`}>
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Music2 className="w-7 h-7 text-primary" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-xl font-semibold">{composer.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {[composer.nationality, composer.birthYear != null && composer.deathYear != null ? `${composer.birthYear}–${composer.deathYear}` : null].filter(Boolean).join(" • ")}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 bg-muted/20 rounded-lg">
                  <p className="text-muted-foreground">No composers found.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="pieces" className="mt-0">
              {pieceResults.length > 0 ? (
                <div className="grid gap-4">
                  {pieceResults.map(item => (
                    <Link key={item.type === "movement" ? `m-${item.movementId}` : `p-${item.pieceId}`} href={`/piece/${item.pieceId}`}>
                      <Card className="hover:bg-muted/30 transition-colors cursor-pointer border-none shadow-sm" data-testid={`card-piece-${item.pieceId}`}>
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Music2 className="w-7 h-7 text-primary" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-xl font-semibold">
                              {item.pieceTitle}
                              {item.type === "movement" && item.movementName ? ` — ${item.movementName}` : ""}
                            </h3>
                            <p className="text-sm text-muted-foreground">{item.composerName}</p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 bg-muted/20 rounded-lg">
                  <p className="text-muted-foreground">No pieces or movements found.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="musicians" className="mt-0">
              {userResults.length > 0 ? (
                <div className="grid gap-4">
                  {userResults.map(user => (
                    <Link key={user.userId} href={`/user/${user.userId}`}>
                      <Card className="hover:bg-muted/30 transition-colors cursor-pointer border-none shadow-sm" data-testid={`card-user-${user.userId}`}>
                        <CardContent className="p-4 flex items-center gap-4">
                          <Avatar className="w-16 h-16">
                            <AvatarImage src={user.avatarUrl || undefined} />
                            <AvatarFallback>{user.displayName.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <h3 className="text-xl font-semibold" data-testid={`text-username-${user.userId}`}>{user.displayName}</h3>
                            <p className="text-sm text-muted-foreground">
                              {user.level}{user.instrument ? ` • ${user.instrument}` : ''}
                            </p>
                            {user.location && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                <MapPin className="w-3 h-3" /> {user.location}
                              </div>
                            )}
                          </div>
                          <ConnectionButton userId={user.userId} />
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 bg-muted/20 rounded-lg">
                  <p className="text-muted-foreground">No musicians found.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </Layout>
  );
}
