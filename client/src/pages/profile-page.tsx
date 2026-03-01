import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PianoAvatar } from "@/components/piano-avatars";
import { MapPin, Edit2, Music2, TrendingUp, Sparkles, Activity, ChevronDown, ChevronUp, ArrowUpDown, Trash2, GripVertical, List, Columns3, MoreHorizontal, SplitSquareHorizontal, Merge, Pencil, X, Heart, MessageCircle, Send, Music } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddPieceDialog, type NewPieceData } from "@/components/add-piece-dialog";
import { EditMovementsDialog } from "@/components/edit-movements-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { Link, useLocation } from "wouter";
import { RepertoireBoard } from "@/components/repertoire-board";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useState, useEffect, useRef } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ShareToFeedPrompt } from "@/components/share-to-feed-prompt";

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


type RepertoireItem = {
  id: string;
  pieceId: number;
  entryId?: number;
  composer: string;
  piece: string;
  movements: string[];
  status: string;
  date: string;
  progress: number;
  isSplit: boolean;
  movementCount: number;
};

function groupRepertoireData(raw: any[]): RepertoireItem[] {
  const splitEntries: RepertoireItem[] = [];
  const grouped = new Map<number, RepertoireItem & { _allMovementNames: string[] }>();

  for (const entry of raw) {
    const pieceId = entry.pieceId;

    if (entry.splitView) {
      splitEntries.push({
        id: `entry-${entry.id}`,
        pieceId,
        entryId: entry.id,
        composer: entry.composerName,
        piece: entry.pieceTitle,
        movements: entry.movementName ? [entry.movementName] : [],
        status: entry.status,
        date: entry.startedDate || "—",
        progress: entry.progress ?? 0,
        isSplit: true,
        movementCount: 0,
      });
    } else {
      if (!grouped.has(pieceId)) {
        grouped.set(pieceId, {
          id: String(pieceId),
          pieceId,
          composer: entry.composerName,
          piece: entry.pieceTitle,
          movements: [],
          _allMovementNames: [],
          status: entry.status,
          date: entry.startedDate || "—",
          progress: entry.progress ?? 0,
          isSplit: false,
          movementCount: 0,
        });
      }
      if (entry.movementName) {
        grouped.get(pieceId)!.movements.push(entry.movementName);
        grouped.get(pieceId)!._allMovementNames.push(entry.movementName);
      }
    }
  }

  const groupedItems = Array.from(grouped.values()).map(({ _allMovementNames, ...item }) => {
    item.movements.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    item.movementCount = item.movements.length;
    return item;
  });

  for (const s of splitEntries) {
    const siblings = raw.filter((e: any) => e.pieceId === s.pieceId);
    s.movementCount = siblings.length;
  }

  return [...groupedItems, ...splitEntries];
}

export default function ProfilePage() {
  const [, navigate] = useLocation();
  const userId = localStorage.getItem("userId");

  useEffect(() => {
    if (!userId) {
      navigate("/auth");
    }
  }, [userId, navigate]);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: [`/api/users/${userId}/profile`],
    enabled: !!userId,
  });

  const { data: rawRepertoire, isLoading: repertoireLoading } = useQuery<any[]>({
    queryKey: [`/api/repertoire/${userId}`],
    enabled: !!userId,
    staleTime: 0,
  });

  const { data: activityLog = [] } = useQuery<any[]>({
    queryKey: [`/api/activity/${userId}`],
    enabled: !!userId,
  });

  const [repertoire, setRepertoire] = useState<RepertoireItem[]>([]);

  useEffect(() => {
    if (rawRepertoire) {
      setRepertoire(groupRepertoireData(rawRepertoire));
    }
  }, [rawRepertoire]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof RepertoireItem, direction: 'asc' | 'desc' } | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "board">(() => {
    return (localStorage.getItem("repertoire-view") as "table" | "board") || "table";
  });

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

  const filteredRepertoire = repertoire.filter((item) => {
    if (activeTab === "active") return item.status === "Learning" || item.status === "Refining";
    if (activeTab === "performance") return item.status === "Performance Ready";
    return true;
  });

  const sortedRepertoire = [...filteredRepertoire].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    const valA = key === "movements" ? a[key].join(", ") : a[key];
    const valB = key === "movements" ? b[key].join(", ") : b[key];
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const visibleRepertoire = isExpanded ? sortedRepertoire : sortedRepertoire.slice(0, 3);

  const queryClient = useQueryClient();

  const deleteActivityMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/activity/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/activity/${userId}`] });
    },
  });

  const handleAddPiece = async (piece: NewPieceData) => {
    const startedDate = piece.date === "—" ? null : piece.date;

    try {
      if (piece.movementIds.length > 0) {
        await Promise.all(
          piece.movementIds.map((movementId) =>
            apiRequest("POST", "/api/repertoire", {
              userId,
              composerId: piece.composerId,
              pieceId: piece.pieceId,
              movementId,
              status: piece.status,
              startedDate,
            })
          )
        );
      } else {
        await apiRequest("POST", "/api/repertoire", {
          userId,
          composerId: piece.composerId,
          pieceId: piece.pieceId,
          status: piece.status,
          startedDate,
        });
      }

      queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/activity/${userId}`] });

      // Prompt user to share to feed
      setAddPieceSharePrompt({
        pieceTitle: piece.piece,
        composerName: piece.composer,
        pieceId: piece.pieceId,
      });
    } catch (error) {
      console.error("Failed to add piece to repertoire:", error);
    }
  };

  const handleToggleSplit = async (pieceId: number, split: boolean) => {
    try {
      await apiRequest("PATCH", `/api/repertoire/piece/${pieceId}`, { splitView: split });
      queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
    } catch (error) {
      console.error("Failed to toggle split view:", error);
    }
  };

  const handleRemove = async (id: string, pieceId: number, isSplit: boolean) => {
    try {
      if (isSplit) {
        const entryId = parseInt(id.replace("entry-", ""));
        await apiRequest("DELETE", `/api/repertoire/${entryId}`);
      } else {
        await apiRequest("DELETE", `/api/repertoire/piece/${pieceId}`);
      }
      queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
    } catch (error) {
      console.error("Failed to remove from repertoire:", error);
    }
  };

  const handleStatusChange = async (id: string, pieceId: number, isSplit: boolean, newStatus: string) => {
    try {
      if (isSplit) {
        const entryId = parseInt(id.replace("entry-", ""));
        await apiRequest("PATCH", `/api/repertoire/${entryId}`, { status: newStatus });
      } else {
        await apiRequest("PATCH", `/api/repertoire/piece/${pieceId}`, { status: newStatus });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/activity/${userId}`] });
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const [editMovementsPieceId, setEditMovementsPieceId] = useState<number | null>(null);
  const [addPieceSharePrompt, setAddPieceSharePrompt] = useState<{
    pieceTitle: string;
    composerName: string;
    pieceId: number;
  } | null>(null);

  const getEntriesForPiece = (pieceId: number) => {
    if (!rawRepertoire) return [];
    return rawRepertoire
      .filter((e: any) => e.pieceId === pieceId)
      .map((e: any) => ({ entryId: e.id, movementId: e.movementId }));
  };

  const getComposerIdForPiece = (pieceId: number) => {
    if (!rawRepertoire) return 0;
    const entry = rawRepertoire.find((e: any) => e.pieceId === pieceId);
    return entry?.composerId ?? 0;
  };

  const getStatusForPiece = (pieceId: number) => {
    if (!rawRepertoire) return "Want to learn";
    const entry = rawRepertoire.find((e: any) => e.pieceId === pieceId);
    return entry?.status ?? "Want to learn";
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setRepertoire((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const reordered = arrayMove(items, oldIndex, newIndex);

        const order = reordered.map((item, index) => ({
          pieceId: Number(item.id),
          displayOrder: index,
        }));

        apiRequest("PUT", "/api/repertoire/reorder", { userId, order }).catch(
          (err) => {
            console.error("Failed to save repertoire order:", err);
            queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
          }
        );

        return reordered;
      });
    }
  };

  const profileData = profile as any;
  const displayName = profileData?.displayName || "Profile";
  const instrument = profileData?.instrument || "";
  const level = profileData?.level || "";
  const location = profileData?.location || "";
  const bio = profileData?.bio || "";
  const avatarUrl = profileData?.avatarUrl || "avatar-8";

  if (!userId) return null;

  return (
    <Layout>
      <div className="min-h-screen bg-background pb-20">
        {/* Banner */}
        <div className="h-32 md:h-40 bg-[#d4967c] relative overflow-hidden">
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="flex flex-col md:flex-row items-center gap-4 py-4">
            <PianoAvatar avatarId={avatarUrl} size={80} className="border-3 border-background shadow-lg shrink-0 -mt-10" />
            
            <div className="flex-1 text-center md:text-left">
              {profileLoading ? (
                <Skeleton className="h-8 w-48 mb-2" />
              ) : (
                <h1 className="font-serif text-2xl font-bold text-primary" data-testid="text-display-name">{displayName}</h1>
              )}
              <div className="flex flex-col md:flex-row items-center gap-2 text-muted-foreground text-sm">
                {profileLoading ? (
                  <Skeleton className="h-4 w-64" />
                ) : (
                  <>
                    {instrument && <span className="flex items-center gap-1 font-medium"><span className="text-accent-foreground">{instrument}</span>{level && ` • ${level}`}</span>}
                    {location && (
                      <>
                        <span className="hidden md:inline">•</span>
                        <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {location}</span>
                      </>
                    )}
                  </>
                )}
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
                  <CardTitle className="text-lg">About</CardTitle>
                </CardHeader>
                <CardContent>
                  {profileLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  ) : (
                    <p className="text-muted-foreground leading-relaxed" data-testid="text-bio">
                      {bio || "No bio yet."}
                    </p>
                  )}
                </CardContent>
              </Card>

               <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Upcoming</CardTitle>
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
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <Music2 className="w-6 h-6 text-primary" />
                    <h2 className="font-serif text-2xl font-bold">Repertoire</h2>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center border rounded-md overflow-hidden" data-testid="view-toggle">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setViewMode("table"); localStorage.setItem("repertoire-view", "table"); }}
                        className={cn("rounded-none h-8 px-2.5", viewMode === "table" && "bg-muted")}
                        data-testid="button-table-view"
                      >
                        <List className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setViewMode("board"); localStorage.setItem("repertoire-view", "board"); }}
                        className={cn("rounded-none h-8 px-2.5", viewMode === "board" && "bg-muted")}
                        data-testid="button-board-view"
                      >
                        <Columns3 className="w-4 h-4" />
                      </Button>
                    </div>
                    {viewMode === "table" && (
                      <>
                        {sortConfig ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSortConfig(null)}
                            className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
                            data-testid="button-custom-order"
                          >
                            <GripVertical className="w-3 h-3" /> Custom order
                          </Button>
                        ) : null}
                        <TabsList className="bg-background border">
                          <TabsTrigger value="all">All Pieces</TabsTrigger>
                          <TabsTrigger value="active">Active</TabsTrigger>
                          <TabsTrigger value="performance">Ready</TabsTrigger>
                        </TabsList>
                      </>
                    )}
                    
                    <AddPieceDialog onAdd={handleAddPiece} />
                  </div>
                </div>

                {viewMode === "board" ? (
                  <div className="mb-12">
                    <RepertoireBoard
                      items={repertoire}
                      userId={userId}
                      onStatusChange={() => {
                        queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
                        queryClient.invalidateQueries({ queryKey: [`/api/activity/${userId}`] });
                      }}
                      onToggleSplit={(pieceId, split) => handleToggleSplit(pieceId, split)}
                      onEditMovements={(pieceId) => setEditMovementsPieceId(pieceId)}
                      onRemove={handleRemove}
                    />
                  </div>
                ) : (
                <div className="space-y-4 mb-12">
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
                                pieceId={item.pieceId}
                                composer={item.composer}
                                piece={item.piece}
                                movements={item.movements}
                                status={item.status}
                                date={item.date}
                                isSplit={item.isSplit}
                                movementCount={item.movementCount}
                                onToggleSplit={handleToggleSplit}
                                onEditMovements={(pid) => setEditMovementsPieceId(pid)}
                                onRemove={handleRemove}
                                onStatusChange={handleStatusChange}
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
                )}

                <div className="space-y-6 mb-12">
                  <div className="flex items-center gap-4">
                    <Activity className="w-6 h-6 text-primary" />
                    <h2 className="font-serif text-2xl font-bold">Activity Log</h2>
                  </div>

                  {/* Compose box */}
                  <ActivityComposeBox userId={userId} onPost={() => queryClient.invalidateQueries({ queryKey: [`/api/activity/${userId}`] })} />

                  {activityLog.length === 0 ? (
                    <Card className="border-none shadow-sm">
                      <CardContent className="py-12 text-center">
                        <Activity className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-muted-foreground">No activity yet. Share what you're working on above.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {activityLog.map((log: any) => (
                        <ActivityEntry
                          key={log.id}
                          log={log}
                          userId={userId}
                          onDelete={() => deleteActivityMutation.mutate(log.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-8 pt-8 border-t">
                  <div className="flex items-center gap-4">
                    <TrendingUp className="w-6 h-6 text-primary" />
                    <h2 className="font-serif text-2xl font-bold">Artistic Insights</h2>
                  </div>

                  {repertoire.length < 3 ? (
                    <Card className="border-none shadow-sm">
                      <CardContent className="py-12 text-center">
                        <TrendingUp className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-muted-foreground">Add at least 3 pieces to your repertoire to unlock artistic insights and recommendations.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <Card className="border-none shadow-sm">
                          <CardHeader>
                            <CardTitle className="text-lg">Genre Representation</CardTitle>
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
                            <CardTitle className="text-lg">Piece Length Distribution</CardTitle>
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
                    </>
                  )}
                </div>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
      {editMovementsPieceId !== null && userId && (
        <EditMovementsDialog
          open={true}
          onOpenChange={(open) => { if (!open) setEditMovementsPieceId(null); }}
          pieceId={editMovementsPieceId}
          userId={userId}
          currentEntries={getEntriesForPiece(editMovementsPieceId)}
          currentStatus={getStatusForPiece(editMovementsPieceId)}
          composerId={getComposerIdForPiece(editMovementsPieceId)}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
          }}
        />
      )}

      {addPieceSharePrompt && (
        <ShareToFeedPrompt
          open={!!addPieceSharePrompt}
          onClose={() => setAddPieceSharePrompt(null)}
          actionText="Added to repertoire"
          pieceTitle={addPieceSharePrompt.pieceTitle}
          composerName={addPieceSharePrompt.composerName}
          pieceId={addPieceSharePrompt.pieceId}
          postType="added_piece"
        />
      )}
    </Layout>
  );
}

function ActivityComposeBox({ userId, onPost }: { userId: string; onPost: () => void }) {
  const [text, setText] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const { toast } = useToast();

  const handlePost = async () => {
    if (!text.trim()) return;
    const authUserId = localStorage.getItem("userId") || userId;
    setIsPosting(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": authUserId },
        body: JSON.stringify({ content: text.trim(), type: "text" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Server error ${res.status}`);
      }
      setText("");
      onPost();
    } catch (err: any) {
      toast({ title: "Couldn't post", description: err.message, variant: "destructive" });
    } finally {
      setIsPosting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handlePost();
    }
  };

  return (
    <Card className="border-none shadow-sm">
      <CardContent className="p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Share a practice note, milestone, or thought..."
          className="w-full min-h-[72px] resize-none text-sm bg-muted/30 rounded-md p-3 border border-border/50 focus:outline-none focus:border-[#d4967c]/50 focus:ring-0 placeholder:text-muted-foreground"
          rows={3}
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-muted-foreground">⌘+Enter to post</p>
          <Button
            onClick={handlePost}
            disabled={!text.trim() || isPosting}
            className="bg-[#d4967c] hover:bg-[#c47a5a] text-white"
            size="sm"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            Post
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityEntry({ log, userId, onDelete }: { log: any; userId: string; onDelete: () => void }) {
  const pieceName = [log.composerName, log.pieceTitle].filter(Boolean).join(" — ");
  const timeAgo = log.createdAt ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true }) : "";

  function getActivityText() {
    switch (log.type) {
      case "added_piece":
        return <p className="text-sm">Added <span className="font-serif italic font-bold">{pieceName}</span> to repertoire</p>;
      case "status_change":
        return <p className="text-sm">Moved <span className="font-serif italic font-bold">{pieceName}</span> to <span className="font-semibold">{log.content}</span></p>;
      case "text":
        return (
          <div>
            {log.content && <p className="text-sm leading-relaxed">{log.content}</p>}
            {pieceName && (
              <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-1 bg-muted/50 rounded text-xs">
                <Music className="w-3 h-3 text-[#d4967c]" />
                {pieceName}
              </div>
            )}
          </div>
        );
      default:
        return <p className="text-sm">{log.content || log.type}</p>;
    }
  }

  const dotColor = log.type === "added_piece" ? "bg-[#c47a5a]"
    : log.type === "status_change" ? "bg-[#8b7040]"
    : "bg-[#d4967c]";

  return (
    <Card className="border-none shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 group">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", dotColor)} />
            <div className="flex-1 min-w-0">
              {getActivityText()}
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-muted-foreground">{timeAgo}</span>
                {(log.likeCount ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Heart className="w-3 h-3" />
                    {log.likeCount}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
            data-testid={`delete-activity-${log.id}`}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableRepertoireRow({ composer, piece, movements, status: initialStatus, date: initialDate, id, pieceId, isSplit, movementCount, onToggleSplit, onEditMovements, onRemove, onStatusChange }: { composer: string, piece: string, movements: string[], status: string, date: string, id: string, pieceId: number, isSplit: boolean, movementCount: number, onToggleSplit: (pieceId: number, split: boolean) => void, onEditMovements: (pieceId: number) => void, onRemove: (id: string, pieceId: number, isSplit: boolean) => void, onStatusChange: (id: string, pieceId: number, isSplit: boolean, newStatus: string) => void }) {
  const [status, setStatus] = useState(initialStatus);
  const [date, setDate] = useState(initialDate);
  const [movementsExpanded, setMovementsExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
        <Link href={`/piece/${pieceId}`}>{composer}</Link>
      </TableCell>
      <TableCell className="font-serif italic">
        <Link href={`/piece/${pieceId}`}>{piece}</Link>
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
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
        <Select value={status} onValueChange={(val) => { setStatus(val); onStatusChange(id, pieceId, isSplit, val); }}>
          <SelectTrigger className={cn("h-8 w-[180px] font-medium border-none shadow-none focus:ring-0", getStatusColor(status))}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Want to learn">Want to learn</SelectItem>
            <SelectItem value="Up next">Up next</SelectItem>
            <SelectItem value="Learning">Learning</SelectItem>
            <SelectItem value="Refining">Refining</SelectItem>
            <SelectItem value="Maintaining">Maintaining</SelectItem>
            <SelectItem value="Performance Ready">Performance Ready</SelectItem>
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" data-testid={`row-actions-${id}`}>
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {!isSplit && (
              <DropdownMenuItem onClick={() => onEditMovements(pieceId)} data-testid={`row-edit-movements-${id}`}>
                <Pencil className="w-3.5 h-3.5 mr-2" />
                Edit movements
              </DropdownMenuItem>
            )}
            {movementCount >= 2 && !isSplit && (
              <DropdownMenuItem onClick={() => onToggleSplit(pieceId, true)} data-testid={`row-split-${id}`}>
                <SplitSquareHorizontal className="w-3.5 h-3.5 mr-2" />
                Split into movements
              </DropdownMenuItem>
            )}
            {isSplit && (
              <DropdownMenuItem onClick={() => onToggleSplit(pieceId, false)} data-testid={`row-rejoin-${id}`}>
                <Merge className="w-3.5 h-3.5 mr-2" />
                Rejoin movements
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-destructive focus:text-destructive" data-testid={`row-remove-${id}`}>
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Remove from repertoire
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from repertoire?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove {isSplit ? `this movement of "${piece}"` : `"${piece}"`} from your repertoire. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onRemove(id, pieceId, isSplit)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Remove
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
