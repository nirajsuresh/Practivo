import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MapPin } from "lucide-react";
import { Link, useLocation } from "wouter";

const mockUsers = [
  { id: "marcello", name: "Marcello Moretti", level: "Concert Pianist", location: "Milan, Italy", avatar: "https://images.unsplash.com/photo-1511367461989-f85a21fda167?q=80&w=2531&auto=format&fit=crop" },
  { id: "elena", name: "Elena Corvin", level: "Professional", location: "Vienna, Austria", avatar: "https://github.com/shadcn.png" },
  { id: "julian", name: "Julian Voss", level: "Student", location: "Berlin, Germany", avatar: "" },
];

export default function SearchPage() {
  const [location] = useLocation();
  const params = new URLSearchParams(location.split('?')[1]);
  const query = params.get('q') || "";

  const filteredUsers = mockUsers.filter(u => 
    u.name.toLowerCase().includes(query.toLowerCase()) || 
    u.level.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="font-serif text-3xl font-bold mb-2">Search Results</h1>
        <p className="text-muted-foreground mb-8">Showing results for "{query}"</p>

        <div className="grid gap-4">
          {filteredUsers.length > 0 ? (
            filteredUsers.map(user => (
              <Link key={user.id} href={`/user/${user.id}`}>
                <Card className="hover:bg-muted/30 transition-colors cursor-pointer border-none shadow-sm">
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
            ))
          ) : (
            <div className="text-center py-20 bg-muted/20 rounded-lg">
              <p className="text-muted-foreground italic font-serif">No musicians found matching your search.</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
