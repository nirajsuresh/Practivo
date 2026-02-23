import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MapPin, Music2, ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Link, useParams } from "wouter";

const mockRepertoires = {
  marcello: [
    { id: "chopin-ballade-4", composer: "Frédéric Chopin", piece: "Ballade No. 4 in F minor", movement: "Op. 52", status: "Learning", date: "2024-02-01" },
    { id: "rach-concerto-2", composer: "Sergei Rachmaninoff", piece: "Piano Concerto No. 2", movement: "I. Moderato", status: "Performance-ready", date: "2023-11-15" },
    { id: "ravel-gaspard", composer: "Maurice Ravel", piece: "Gaspard de la nuit", movement: "I. Ondine", status: "Polishing", date: "2024-01-10" },
  ],
  elena: [
    { id: "bach-partita-2", composer: "J.S. Bach", piece: "Partita No. 2", movement: "Chaconne", status: "Performance-ready", date: "2023-10-12" },
  ]
};

const users = {
  marcello: { name: "Marcello Moretti", level: "Concert Pianist", location: "Milan, Italy", avatar: "https://images.unsplash.com/photo-1511367461989-f85a21fda167?q=80&w=2531&auto=format&fit=crop", bio: "Classical pianist specializing in Romantic era." },
  elena: { name: "Elena Corvin", level: "Professional", location: "Vienna, Austria", avatar: "https://github.com/shadcn.png", bio: "Orchestral violinist based in Vienna." }
};

export default function UserProfilePage() {
  const { id } = useParams();
  const user = users[id as keyof typeof users];
  const repertoire = mockRepertoires[id as keyof typeof mockRepertoires] || [];
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleRepertoire = isExpanded ? repertoire : repertoire.slice(0, 3);

  if (!user) return <Layout><div className="p-20 text-center font-serif italic">User not found.</div></Layout>;

  return (
    <Layout>
      <div className="min-h-screen bg-background pb-20">
        <div className="h-64 md:h-80 bg-[#d4967c] relative overflow-hidden">
        </div>

        <div className="container mx-auto px-4 -mt-32 relative z-10">
          <div className="flex flex-col md:flex-row items-end gap-6 mb-8">
            <Avatar className="w-40 h-40 border-4 border-background shadow-2xl">
              <AvatarImage src={user.avatar} />
              <AvatarFallback className="text-4xl font-serif">{user.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
            </Avatar>
            <div className="flex-1 pb-4 text-center md:text-left">
              <h1 className="font-serif text-4xl font-bold text-primary mb-2">{user.name}</h1>
              <div className="flex flex-col md:flex-row items-center gap-4 text-muted-foreground mb-4">
                <span className="flex items-center gap-1 font-medium"><span className="text-accent-foreground">Piano</span> • {user.level}</span>
                <span className="hidden md:inline">•</span>
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {user.location}</span>
              </div>
            </div>
            <div className="pb-4 flex gap-3">
              <Button>Connect</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="space-y-6 lg:col-span-1">
              <Card>
                <CardHeader><CardTitle className="text-lg font-serif">About</CardTitle></CardHeader>
                <CardContent><p className="text-muted-foreground leading-relaxed">{user.bio}</p></CardContent>
              </Card>
            </div>

            <div className="lg:col-span-3">
              <div className="flex items-center gap-4 mb-6">
                <Music2 className="w-6 h-6 text-primary" />
                <h2 className="font-serif text-2xl font-bold">Repertoire</h2>
              </div>

              <Card className="border-none shadow-sm overflow-hidden mb-4">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead>Composer</TableHead>
                      <TableHead>Piece</TableHead>
                      <TableHead>Opus/No.</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRepertoire.map((item) => (
                      <TableRow key={item.id} className="hover:bg-muted/20 transition-colors">
                        <TableCell className="font-semibold text-primary">{item.composer}</TableCell>
                        <TableCell className="font-serif italic">{item.piece}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{item.movement}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-medium bg-muted/50 border-none shadow-none">
                            {item.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              {repertoire.length > 3 && (
                <div className="flex justify-center">
                  <Button variant="ghost" onClick={() => setIsExpanded(!isExpanded)} className="text-primary gap-2">
                    {isExpanded ? <>Show Less <ChevronUp className="w-4 h-4" /></> : <>View Full Repertoire <ChevronDown className="w-4 h-4" /></>}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
