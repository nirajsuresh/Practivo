import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MapPin, Calendar, Plus, MoreHorizontal, Edit2, Music2, TrendingUp, Sparkles, Activity, ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useState } from "react";

const genreData = [
  { genre: "Baroque", value: 50 },
  { genre: "Classical", value: 45 },
  { genre: "Romantic", value: 95 },
  { genre: "Impressionistic", value: 80 },
  { genre: "Modern", value: 30 },
];

const lengthData = [
  { name: "0-5m", count: 12 },
  { name: "5-10m", count: 6 },
  { name: "10-20m", count: 4 },
  { name: "20-30m", count: 8 },
  { name: "30m+", count: 3 },
];

const activityLog = [
  { id: 1, type: "start", piece: "Chopin - Ballade No. 4 in F minor", date: "1 day ago" },
  { id: 2, type: "ready", piece: "Rachmaninoff - Piano Concerto No. 2", date: "1 week ago" },
  { id: 3, type: "performance", piece: "Liszt - Sonata in B minor", location: "Carnegie Hall", date: "1 month ago" },
];

const mockRepertoire = [
  { id: "chopin-ballade-4", composer: "Frédéric Chopin", piece: "Ballade No. 4 in F minor", movement: "Op. 52", status: "In Progress", date: "2024-02-01" },
  { id: "rach-concerto-2", composer: "Sergei Rachmaninoff", piece: "Piano Concerto No. 2", movement: "I. Moderato", status: "Performance-ready", date: "2023-11-15" },
  { id: "ravel-gaspard", composer: "Maurice Ravel", piece: "Gaspard de la nuit", movement: "I. Ondine", status: "Polishing", date: "2024-01-10" },
  { id: "beethoven-appassionata", composer: "Ludwig van Beethoven", piece: "Sonata No. 23 'Appassionata'", movement: "Full", status: "Learned", date: "2023-08-20" },
  { id: "liszt-sonata-bminor", composer: "Franz Liszt", piece: "Sonata in B minor", movement: "S.178", status: "Learned", date: "2023-05-12" },
  { id: "bach-wTC1-cminor", composer: "J.S. Bach", piece: "WTC Book 1: Prelude & Fugue", movement: "No. 2 in C minor", status: "Performance-ready", date: "2023-12-01" },
  { id: "debussy-reflets", composer: "Claude Debussy", piece: "Images, Book I", movement: "Reflets dans l'eau", status: "In Progress", date: "2024-01-25" },
  { id: "scriabin-sonata-5", composer: "Alexander Scriabin", piece: "Sonata No. 5", movement: "Op. 53", status: "Wishlist", date: "—" },
];

export default function ProfilePage() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof typeof mockRepertoire[0], direction: 'asc' | 'desc' } | null>(null);

  const handleSort = (key: keyof typeof mockRepertoire[0]) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedRepertoire = [...mockRepertoire].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
    if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const visibleRepertoire = isExpanded ? sortedRepertoire : sortedRepertoire.slice(0, 3);

  return (
    <Layout>
      <div className="min-h-screen bg-background pb-20">
        {/* Cover Image */}
        <div className="h-64 md:h-80 bg-primary relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1520529612392-749e493e8081?q=80&w=2670&auto=format&fit=crop')] bg-cover bg-center opacity-40"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent"></div>
        </div>

        <div className="container mx-auto px-4 -mt-32 relative z-10">
          <div className="flex flex-col md:flex-row items-end gap-6 mb-8">
            <Avatar className="w-40 h-40 border-4 border-background shadow-2xl">
              <AvatarImage src="/src/assets/images/niraj.png" />
              <AvatarFallback className="text-4xl font-serif">NS</AvatarFallback>
            </Avatar>
            
            <div className="flex-1 pb-4 text-center md:text-left">
              <h1 className="font-serif text-4xl font-bold text-primary mb-2">Niraj Suresh</h1>
              <div className="flex flex-col md:flex-row items-center gap-4 text-muted-foreground mb-4">
                <span className="flex items-center gap-1 font-medium"><span className="text-accent-foreground">Piano</span> • Serious Amateur</span>
                <span className="hidden md:inline">•</span>
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> Boston, USA</span>
              </div>
            </div>

            <div className="pb-4 flex gap-3">
              <Button variant="outline" className="bg-background/50 backdrop-blur-sm">
                <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
              </Button>
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
                    Classical pianist specializing in the Romantic and Impressionist eras. 
                    Alumnus of the Conservatorio di Milano. Currently focused on the complete 
                    cycle of Chopin Ballades and exploring Ravel's piano works.
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
                      <div className="text-xs uppercase font-bold">Apr</div>
                      <div className="text-xl font-bold">22</div>
                    </div>
                    <div>
                      <h4 className="font-medium">Solo Recital</h4>
                      <p className="text-sm text-muted-foreground">Teatro alla Scala</p>
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
                  <div className="flex items-center gap-4">
                    <TabsList className="bg-background border">
                      <TabsTrigger value="all">All Pieces</TabsTrigger>
                      <TabsTrigger value="active">Active</TabsTrigger>
                      <TabsTrigger value="performance">Ready</TabsTrigger>
                    </TabsList>
                    
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-2">
                          <Plus className="w-4 h-4" /> Add Piece
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                          <DialogTitle className="font-serif text-2xl">Add New Piece</DialogTitle>
                          <DialogDescription>
                            Add a new work to your repertoire tracking.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="composer">Composer</Label>
                            <Input id="composer" placeholder="e.g. Sergei Rachmaninoff" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="piece">Piece Title</Label>
                            <Input id="piece" placeholder="e.g. Piano Concerto No. 3" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="opus">Opus / Number</Label>
                            <Input id="opus" placeholder="e.g. Op. 30" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="status">Initial Status</Label>
                            <Select defaultValue="In Progress">
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Wishlist">Wishlist</SelectItem>
                                <SelectItem value="In Progress">In Progress</SelectItem>
                                <SelectItem value="Learned">Learned</SelectItem>
                                <SelectItem value="Performance-ready">Performance-ready</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="submit">Add to Repertoire</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                <div className="space-y-4 mb-12">
                  <Card className="border-none shadow-sm overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('composer')}>
                            <div className="flex items-center gap-2">Composer <ArrowUpDown className="w-3 h-3" /></div>
                          </TableHead>
                          <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('piece')}>
                            <div className="flex items-center gap-2">Piece <ArrowUpDown className="w-3 h-3" /></div>
                          </TableHead>
                          <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('movement')}>
                            <div className="flex items-center gap-2">Opus/No. <ArrowUpDown className="w-3 h-3" /></div>
                          </TableHead>
                          <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('status')}>
                            <div className="flex items-center gap-2">Status <ArrowUpDown className="w-3 h-3" /></div>
                          </TableHead>
                          <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('date')}>
                            <div className="flex items-center gap-2">Started <ArrowUpDown className="w-3 h-3" /></div>
                          </TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleRepertoire.map((item) => (
                          <RepertoireRow 
                            key={item.id}
                            id={item.id}
                            composer={item.composer}
                            piece={item.piece}
                            movement={item.movement}
                            status={item.status}
                            date={item.date}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                  
                  <div className="flex justify-center">
                    <Button 
                      variant="ghost" 
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="text-primary hover:bg-primary/5 gap-2"
                    >
                      {isExpanded ? (
                        <>Show Less <ChevronUp className="w-4 h-4" /></>
                      ) : (
                        <>View Full Repertoire <ChevronDown className="w-4 h-4" /></>
                      )}
                    </Button>
                  </div>
                </div>

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
                        composer="Sergei Prokofiev"
                        title="Sonata No. 7"
                        reason="Your repertoire is heavily Romantic and Impressionist. Adding a major 20th-century Russian sonata would show technical edge."
                      />
                      <SuggestionCard 
                        composer="Domenico Scarlatti"
                        title="Selected Sonatas"
                        reason="Adding early keyboard works will balance your heavy focus on big virtuosic Romantic cycles."
                      />
                      <SuggestionCard 
                        composer="Olivier Messiaen"
                        title="Vingt Regards sur l'Enfant-Jésus"
                        reason="A masterpiece of the modern era would elevate your profile for international contemporary music festivals."
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
      <TableCell className="text-muted-foreground font-mono text-xs">{movement}</TableCell>
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
      <TableCell onClick={(e) => e.stopPropagation()}>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from Repertoire?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove <span className="font-serif italic">{piece}</span> from your repertoire tracking. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
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
