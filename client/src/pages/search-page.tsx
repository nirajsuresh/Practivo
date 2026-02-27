import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MapPin, Music2, UserPlus, Clock, Check } from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PieceResult {
  id: number;
  title: string;
  composerId: number;
  composerName: string;
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

  const { data: userResults = [] } = useQuery<UserResult[]>({
    queryKey: ["/api/users/search", `?q=${encodeURIComponent(query)}`],
    enabled: query.trim().length > 0,
  });

  const { data: pieceResults = [] } = useQuery<PieceResult[]>({
    queryKey: ["/api/pieces/search", `?q=${encodeURIComponent(query)}`],
    enabled: query.trim().length > 0,
  });

  const hasResults = userResults.length > 0 || pieceResults.length > 0;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="font-serif text-3xl font-bold mb-2" data-testid="text-search-title">Search Results</h1>
        <p className="text-muted-foreground mb-8">Showing results for "{query}"</p>

        {!hasResults && query.trim().length > 0 && (
          <div className="text-center py-20 bg-muted/20 rounded-lg" data-testid="text-no-results">
            <p className="text-muted-foreground italic">No results found matching your search.</p>
          </div>
        )}

        {userResults.length > 0 && (
          <div className="mb-10">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Musicians</h2>
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
                        <h3 className="font-serif text-xl font-bold" data-testid={`text-username-${user.userId}`}>{user.displayName}</h3>
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
          </div>
        )}

        {pieceResults.length > 0 && (
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Pieces</h2>
            <div className="grid gap-4">
              {pieceResults.map(piece => (
                <Link key={piece.id} href={`/piece/${piece.id}`}>
                  <Card className="hover:bg-muted/30 transition-colors cursor-pointer border-none shadow-sm" data-testid={`card-piece-${piece.id}`}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Music2 className="w-7 h-7 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-serif text-xl font-bold">{piece.title}</h3>
                        <p className="text-sm text-muted-foreground">{piece.composerName}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
