import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MapPin, Music2 } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

const mockUsers = [
  { id: "marcello", name: "Marcello Moretti", level: "Concert Pianist", location: "Milan, Italy", avatar: "https://images.unsplash.com/photo-1511367461989-f85a21fda167?q=80&w=2531&auto=format&fit=crop" },
  { id: "elena", name: "Elena Corvin", level: "Professional", location: "Vienna, Austria", avatar: "https://github.com/shadcn.png" },
  { id: "julian", name: "Julian Voss", level: "Student", location: "Berlin, Germany", avatar: "" },
];

interface PieceResult {
  id: number;
  title: string;
  composerId: number;
  composerName: string;
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

export default function SearchPage() {
  const query = useSearchQuery();

  const filteredUsers = mockUsers.filter(u => 
    u.name.toLowerCase().includes(query.toLowerCase()) || 
    u.level.toLowerCase().includes(query.toLowerCase())
  );

  const { data: pieceResults = [] } = useQuery<PieceResult[]>({
    queryKey: ["/api/pieces/search", query],
    queryFn: async () => {
      if (!query.trim()) return [];
      const res = await fetch(`/api/pieces/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: query.trim().length > 0,
  });

  const hasResults = filteredUsers.length > 0 || pieceResults.length > 0;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="font-serif text-3xl font-bold mb-2">Search Results</h1>
        <p className="text-muted-foreground mb-8">Showing results for "{query}"</p>

        {!hasResults && (
          <div className="text-center py-20 bg-muted/20 rounded-lg">
            <p className="text-muted-foreground italic font-serif">No results found matching your search.</p>
          </div>
        )}

        {filteredUsers.length > 0 && (
          <div className="mb-10">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Musicians</h2>
            <div className="grid gap-4">
              {filteredUsers.map(user => (
                <Link key={user.id} href={`/user/${user.id}`}>
                  <Card className="hover:bg-muted/30 transition-colors cursor-pointer border-none shadow-sm" data-testid={`card-user-${user.id}`}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <Avatar className="w-16 h-16">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>{user.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="font-serif text-xl font-bold">{user.name}</h3>
                        <p className="text-sm text-muted-foreground">{user.level} • Piano</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <MapPin className="w-3 h-3" /> {user.location}
                        </div>
                      </div>
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
