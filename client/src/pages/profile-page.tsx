import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MapPin, Calendar, Plus, MoreHorizontal, Edit2, Music2, TrendingUp, Sparkles, Activity } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useState } from "react";

const genreData = [
  { genre: "Baroque", value: 40 },
  { genre: "Classical", value: 65 },
  { genre: "Romantic", value: 90 },
  { genre: "Impressionistic", value: 30 },
  { genre: "Modern", value: 50 },
];

const lengthData = [
  { name: "0-5m", count: 4 },
  { name: "5-10m", count: 8 },
  { name: "10-20m", count: 12 },
  { name: "20-30m", count: 5 },
  { name: "30m+", count: 2 },
];

const activityLog = [
  { id: 1, type: "start", piece: "Sibelius Violin Concerto", date: "2 days ago" },
  { id: 2, type: "ready", piece: "Brahms Violin Sonata No. 3", date: "1 week ago" },
  { id: 3, type: "performance", piece: "Bach Partita No. 2", location: "Mozarthaus Vienna", date: "2 weeks ago" },
];

export default function ProfilePage() {
  return (
    <Layout>
      <div className="min-h-screen bg-background pb-20">
        {/* Cover Image */}
        <div className="h-64 md:h-80 bg-primary relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1507838153414-b4b713384ebd?q=80&w=2670&auto=format&fit=crop')] bg-cover bg-center opacity-40"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent"></div>
        </div>

        <div className="container mx-auto px-4 -mt-32 relative z-10">
          <div className="flex flex-col md:flex-row items-end gap-6 mb-8">
            <Avatar className="w-40 h-40 border-4 border-background shadow-2xl">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback className="text-4xl font-serif">EC</AvatarFallback>
            </Avatar>
            
            <div className="flex-1 pb-4 text-center md:text-left">
              <h1 className="font-serif text-4xl font-bold text-primary mb-2">Elena Corvin</h1>
              <div className="flex flex-col md:flex-row items-center gap-4 text-muted-foreground mb-4">
                <span className="flex items-center gap-1 font-medium"><span className="text-accent-foreground">Violin</span> • Professional</span>
                <span className="hidden md:inline">•</span>
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> Vienna, Austria</span>
              </div>
            </div>

            <div className="pb-4 flex gap-3">
              <Button variant="outline" className="bg-background/50 backdrop-blur-sm">
                <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
              </Button>
              <Button>Connect</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-12">
            <div className="space-y-6 lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-serif">About</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    Orchestral violinist and chamber musician based in Vienna. 
                    Graduate of the Vienna Conservatory. Passionate about late Romantic repertoire 
                    and contemporary Austrian composers.
                  </p>
                </CardContent>
              </Card>

               <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-serif">Upcoming</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4 items-start">
                    <div className="bg-primary/10 text-primary p-2 rounded text-center min-w-[3.5rem]">
                      <div className="text-xs uppercase font-bold">Mar</div>
                      <div className="text-xl font-bold">12</div>
                    </div>
                    <div>
                      <h4 className="font-medium">Chamber Recital</h4>
                      <p className="text-sm text-muted-foreground">Mozarthaus Vienna</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-3">
              <Tabs defaultValue="all" className="w-full">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <Music2 className="w-6 h-6 text-primary" />
                    <h2 className="font-serif text-2xl font-bold">Repertoire</h2>
                  </div>
                  <TabsList className="bg-background border">
                    <TabsTrigger value="all">All Pieces</TabsTrigger>
                    <TabsTrigger value="active">Active</TabsTrigger>
                    <TabsTrigger value="performance">Ready</TabsTrigger>
                  </TabsList>
                </div>

                <Card className="border-none shadow-sm overflow-hidden mb-12">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead>Composer</TableHead>
                        <TableHead>Piece</TableHead>
                        <TableHead>Movement</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Started</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <RepertoireRow 
                        composer="Johannes Brahms"
                        piece="Violin Sonata No. 3 in D minor"
                        movement="I. Allegro"
                        status="Performance-ready"
                        date="2023-09-15"
                        id="brahms-sonata-3"
                      />
                      <RepertoireRow 
                        composer="J.S. Bach"
                        piece="Partita No. 2 in D minor"
                        movement="V. Chaconne"
                        status="In Progress"
                        date="2024-01-10"
                        id="bach-partita-2"
                      />
                    </TableBody>
                  </Table>
                </Card>

                {/* Activity Log */}
                <div className="space-y-6 mb-12">
                  <div className="flex items-center gap-4">
                    <Activity className="w-6 h-6 text-primary" />
                    <h2 className="font-serif text-2xl font-bold">Activity Log</h2>
                  </div>
                  <Card className="border-none shadow-sm divide-y">
                    {activityLog.map((log) => (
                      <div key={log.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            log.type === "start" ? "bg-blue-500" : log.type === "ready" ? "bg-green-500" : "bg-accent-foreground"
                          )} />
                          <p className="text-sm">
                            {log.type === "start" && <>You started <span className="font-serif italic font-bold">{log.piece}</span>!</>}
                            {log.type === "ready" && <>You are performance-ready with <span className="font-serif italic font-bold">{log.piece}</span></>}
                            {log.type === "performance" && <>You added a performance on <span className="font-serif italic font-bold">{log.piece}</span> at {log.location}</>}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">{log.date}</span>
                      </div>
                    ))}
                  </Card>
                </div>

                {/* Integrated Insights */}
                <div className="space-y-8 pt-8 border-t">
                  <div className="flex items-center gap-4">
                    <TrendingUp className="w-6 h-6 text-primary" />
                    <h2 className="font-serif text-2xl font-bold">Artistic Insights</h2>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card className="border-none shadow-sm">
                      <CardHeader>
                        <CardTitle className="font-serif text-lg">Genre Representation</CardTitle>
                      </CardHeader>
                      <CardContent className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={genreData}>
                            <PolarGrid stroke="#e5e5e5" />
                            <PolarAngleAxis dataKey="genre" tick={{ fill: "#666", fontSize: 10 }} />
                            <Radar
                              name="Repertoire"
                              dataKey="value"
                              stroke="hsl(var(--primary))"
                              fill="hsl(var(--primary))"
                              fillOpacity={0.4}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card className="border-none shadow-sm">
                      <CardHeader>
                        <CardTitle className="font-serif text-lg">Piece Length Distribution</CardTitle>
                      </CardHeader>
                      <CardContent className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={lengthData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip 
                              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                            />
                            <Bar dataKey="count" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-6">
                    <h3 className="font-serif text-xl font-bold flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-accent-foreground" />
                      Rounding Out Your Repertoire
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <SuggestionCard 
                        composer="Maurice Ravel"
                        title="Tzigane"
                        reason="Your repertoire is heavily Romantic. Adding an Impressionistic showpiece would show versatility."
                      />
                      <SuggestionCard 
                        composer="J.S. Bach"
                        title="Sonata No. 1 in G minor"
                        reason="Adding a polyphonic Baroque work will balance your current focus on D minor works."
                      />
                      <SuggestionCard 
                        composer="Béla Bartók"
                        title="Violin Concerto No. 2"
                        reason="A major 20th-century concerto would elevate your profile."
                      />
                    </div>
                  </div>
                </div>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function RepertoireRow({ composer, piece, movement, status: initialStatus, date, id }: { composer: string, piece: string, movement: string, status: string, date: string, id: string }) {
  const [status, setStatus] = useState(initialStatus);

  const getStatusColor = (s: string) => {
    switch(s) {
      case "Performance-ready": return "bg-green-100 text-green-700 border-green-200";
      case "In Progress": return "bg-blue-100 text-blue-700 border-blue-200";
      case "Learned": return "bg-amber-100 text-amber-700 border-amber-200";
      case "Wishlist": return "bg-slate-100 text-slate-600 border-slate-200";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <TableRow className="group hover:bg-muted/20 transition-colors">
      <TableCell className="font-semibold text-primary">
        <Link href={`/piece/${id}`}>{composer}</Link>
      </TableCell>
      <TableCell className="font-serif italic">
        <Link href={`/piece/${id}`}>{piece}</Link>
      </TableCell>
      <TableCell className="text-muted-foreground">{movement}</TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className={cn("h-8 w-[180px] font-medium border-none shadow-none focus:ring-0", getStatusColor(status))}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Wishlist">Wishlist</SelectItem>
            <SelectItem value="In Progress">In Progress</SelectItem>
            <SelectItem value="Learned">Learned</SelectItem>
            <SelectItem value="Performance-ready">Performance-ready</SelectItem>
            <SelectItem value="Re-learning">Re-learning</SelectItem>
            <SelectItem value="Stopped learning">Stopped learning</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{date}</TableCell>
    </TableRow>
  );
}

function SuggestionCard({ composer, title, reason }: { composer: string, title: string, reason: string }) {
  return (
    <Card className="border-none shadow-sm hover:translate-y-[-4px] transition-transform">
      <CardContent className="pt-6">
        <p className="text-xs font-bold uppercase tracking-widest text-accent-foreground mb-1">{composer}</p>
        <h3 className="font-serif text-lg font-bold mb-2">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{reason}</p>
      </CardContent>
    </Card>
  );
}
