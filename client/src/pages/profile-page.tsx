import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PianoAvatar } from "@/components/piano-avatars";
import { MapPin, Edit2, Music2, TrendingUp, Sparkles, Activity, ChevronDown, ChevronUp, ArrowUpDown, Trash2, GripVertical } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddPieceDialog, type NewPieceData } from "@/components/add-piece-dialog";
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
import { cn } from "@/lib/utils";
import { getStatusColor } from "@/lib/status-colors";
import { Link } from "wouter";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useState } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  { id: 1, type: "start", piece: "Chopin - Ballade no. 4 in F minor Op. 52", date: "1 day ago" },
  { id: 2, type: "ready", piece: "Rachmaninoff - Préludes Op. 23", date: "1 week ago" },
  { id: 3, type: "performance", piece: "Liszt - Sonata in B minor", location: "Carnegie Hall", date: "1 month ago" },
];

type RepertoireItem = {
  id: string;
  composer: string;
  piece: string;
  movements: string[];
  status: string;
  date: string;
};

const initialRepertoire: RepertoireItem[] = [
  { id: "1260", composer: "Frédéric Chopin", piece: "Ballade no. 4 in F minor Op. 52", movements: [], status: "Learning", date: "2024-02-01" },
  { id: "2219", composer: "Sergei Rachmaninoff", piece: "Préludes Op. 23", movements: ["No. 5 G minor"], status: "Performance-ready", date: "2023-11-15" },
  { id: "2055", composer: "Maurice Ravel", piece: "Gaspard de la nuit", movements: ["No. 1 Ondine"], status: "Polishing", date: "2024-01-10" },
  { id: "1997", composer: "Ludwig van Beethoven", piece: "Sonata no. 23 in F minor Op. 57 (Appassionata)", movements: ["1. Allegro assai", "2. Andante con moto", "3. Allegro ma non troppo"], status: "Performance-ready", date: "2023-08-20" },
  { id: "1103", composer: "Franz Liszt", piece: "Sonata in B minor S. 178", movements: [], status: "Shelved", date: "2023-05-12" },
  { id: "1791", composer: "Johann Sebastian Bach", piece: "The Well-Tempered Clavier, Book 1 BWV 846–869", movements: ["2. C minor, BWV 847, Prelude", "2. C minor, BWV 847, Fugue"], status: "Polishing", date: "2023-12-01" },
  { id: "262", composer: "Claude Debussy", piece: "Images, Série 1", movements: ["No. 1 Reflets dans l'eau"], status: "Learning", date: "2024-01-25" },
  { id: "220", composer: "Alexander Scriabin", piece: "Sonata no. 5 Op. 53", movements: [], status: "Want to learn", date: "—" },
];

export default function ProfilePage() {
  const [repertoire, setRepertoire] = useState<RepertoireItem[]>(initialRepertoire);
  const [isExpanded, setIsExpanded] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof RepertoireItem, direction: 'asc' | 'desc' } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleSort = (key: keyof RepertoireItem) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedRepertoire = [...repertoire].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    const valA = key === "movements" ? a[key].join(", ") : a[key];
    const valB = key === "movements" ? b[key].join(", ") : b[key];
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const visibleRepertoire = isExpanded ? sortedRepertoire : sortedRepertoire.slice(0, 3);

  const handleAddPiece = (piece: NewPieceData) => {
    setRepertoire(prev => [piece, ...prev]);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setRepertoire((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background pb-20">
        {/* Banner */}
        <div className="h-32 md:h-40 bg-[#d4967c] relative overflow-hidden">
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="flex flex-col md:flex-row items-center gap-4 py-4">
            <PianoAvatar avatarId="avatar-8" size={80} className="border-3 border-background shadow-lg shrink-0 -mt-10" />
            
            <div className="flex-1 text-center md:text-left">
              <h1 className="font-serif text-2xl font-bold text-primary">Niraj Suresh</h1>
              <div className="flex flex-col md:flex-row items-center gap-2 text-muted-foreground text-sm">
                <span className="flex items-center gap-1 font-medium"><span className="text-accent-foreground">Piano</span> • Serious Amateur</span>
                <span className="hidden md:inline">•</span>
                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Boston, USA</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" size="sm">
                <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit Profile
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
                    
                    <AddPieceDialog onAdd={handleAddPiece} />
                  </div>
                </div>

                <div className="space-y-4 mb-12">
                  {sortConfig && (
                    <div className="flex justify-end mb-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSortConfig(null)}
                        className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
                        data-testid="button-custom-order"
                      >
                        <GripVertical className="w-3 h-3" /> Custom order
                      </Button>
                    </div>
                  )}
                  <Card className="border-none shadow-sm overflow-hidden">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <Table>
                        <TableHeader className="bg-muted/30">
                          <TableRow>
                            <TableHead className="w-[40px]"></TableHead>
                            {([
                              ["composer", "Composer"],
                              ["piece", "Piece"],
                              ["movements", "Movement(s)"],
                              ["status", "Status"],
                              ["date", "Started"],
                            ] as [keyof RepertoireItem, string][]).map(([key, label]) => {
                              const isActive = sortConfig?.key === key;
                              return (
                                <TableHead
                                  key={key}
                                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                                  onClick={() => handleSort(key)}
                                >
                                  <div className={cn("flex items-center gap-2", isActive && "text-foreground font-semibold")}>
                                    {label}
                                    {isActive ? (
                                      sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                    ) : (
                                      <ArrowUpDown className="w-3 h-3" />
                                    )}
                                  </div>
                                </TableHead>
                              );
                            })}
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <SortableContext items={visibleRepertoire.map(i => i.id)} strategy={verticalListSortingStrategy}>
                          <TableBody>
                            {visibleRepertoire.map((item) => (
                              <SortableRepertoireRow 
                                key={item.id}
                                id={item.id}
                                composer={item.composer}
                                piece={item.piece}
                                movements={item.movements}
                                status={item.status}
                                date={item.date}
                              />
                            ))}
                          </TableBody>
                        </SortableContext>
                      </Table>
                    </DndContext>
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
                            log.type === "start" ? "bg-[#c47a5a]" : log.type === "ready" ? "bg-[#8b7040]" : "bg-[#7a6e60]"
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

function SortableRepertoireRow({ composer, piece, movements, status: initialStatus, date: initialDate, id }: { composer: string, piece: string, movements: string[], status: string, date: string, id: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [date, setDate] = useState(initialDate);
  const [movementsExpanded, setMovementsExpanded] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style} className="group hover:bg-muted/20 transition-colors">
      <TableCell className="w-[40px] px-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors touch-none"
          data-testid={`drag-handle-${id}`}
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </TableCell>
      <TableCell className="font-semibold text-primary">
        <Link href={`/piece/${id}`}>{composer}</Link>
      </TableCell>
      <TableCell className="font-serif italic">
        <Link href={`/piece/${id}`}>{piece}</Link>
      </TableCell>
      <TableCell className="text-muted-foreground font-mono text-xs">
        {movements.length === 0 ? (
          "—"
        ) : movements.length === 1 ? (
          movements[0]
        ) : (
          <div>
            <span>{movements[0]}</span>
            <button
              className="ml-1 text-primary hover:underline cursor-pointer"
              onClick={(e) => { e.stopPropagation(); setMovementsExpanded(!movementsExpanded); }}
              data-testid={`button-expand-movements-${id}`}
            >
              {movementsExpanded ? "(show less)" : `(+${movements.length - 1} more)`}
            </button>
            {movementsExpanded && (
              <div className="mt-1 space-y-0.5">
                {movements.slice(1).map((m, i) => (
                  <div key={i}>{m}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className={cn("h-8 w-[180px] font-medium border-none shadow-none focus:ring-0", getStatusColor(status))}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Want to learn">Want to learn</SelectItem>
            <SelectItem value="Learning">Learning</SelectItem>
            <SelectItem value="Polishing">Polishing</SelectItem>
            <SelectItem value="Performance-ready">Performance-ready</SelectItem>
            <SelectItem value="Shelved">Shelved</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        {status === "Want to learn" ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <Input
            type="date"
            value={date === "—" ? "" : date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 w-[140px] text-sm border-none shadow-none bg-transparent hover:bg-muted/30 focus:bg-muted/30 transition-colors"
            data-testid={`input-date-${id}`}
          />
        )}
      </TableCell>
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
