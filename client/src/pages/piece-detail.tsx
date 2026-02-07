import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Music2, Calendar, Clock, Link as LinkIcon, Plus, ChevronDown, ChevronUp, ArrowLeft, FileText, Upload, X, Star, ExternalLink, Users, MessageCircle, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "wouter";
import { cn } from "@/lib/utils";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

function StarRating({ rating, size = "md" }: { rating: number; size?: "sm" | "md" }) {
  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  return (
    <div className="flex items-center gap-0.5" data-testid="star-rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            iconSize,
            star <= Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : star - 0.5 <= rating
              ? "fill-amber-400/50 text-amber-400"
              : "text-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}

export default function PieceDetailPage() {
  const params = useParams<{ id: string }>();
  const pieceId = params.id ? parseInt(params.id) : 20;

  const { data: pieceData } = useQuery({
    queryKey: ["/api/pieces", pieceId],
    queryFn: async () => {
      const res = await fetch(`/api/pieces/${pieceId}`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: composerData } = useQuery({
    queryKey: ["/api/composers", pieceData?.composerId],
    queryFn: async () => {
      if (!pieceData?.composerId) return null;
      const res = await fetch(`/api/composers/${pieceData.composerId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!pieceData?.composerId,
  });

  const [status, setStatus] = useState("In Progress");
  const [scoreFile, setScoreFile] = useState<{ name: string; path: string } | null>(null);
  const [notes, setNotes] = useState([
    { id: 1, date: "2025-02-05", time: "2.5", type: "Practice" as const, content: "Mastering the polyrhythms in the C section. Focus on left-hand clarity in the descending runs.", media: "https://vimeo.com/..." },
    { id: 2, date: "2025-02-03", time: "3.0", type: "Practice" as const, content: "Memory work for the coda. Practicing jump accuracy at tempo.", media: "" },
    { id: 3, date: "2025-01-28", time: "1.5", type: "Performance" as const, content: "Studio class performance. Played through the entire piece. Need more work on the transition at bar 152.", media: "https://youtube.com/..." },
    { id: 4, date: "2025-01-25", time: "2.0", type: "Practice" as const, content: "Slow practice on the development section. Focusing on voicing in the contrapuntal passages.", media: "" },
    { id: 5, date: "2025-01-20", time: "0.5", type: "Performance" as const, content: "Informal run-through for friends. Nerves affected the coda but exposition was solid.", media: "" },
  ]);

  const statusHistory = [
    { date: "Mar '24", status: "Wishlist" },
    { date: "Jun '24", status: "In Progress" },
    { date: "Nov '24", status: "Learned" },
    { date: "Mar '25", status: "Performance-ready" },
    { date: "Dec '25", status: "Re-learning" },
  ];

  const statusToNumber: Record<string, number> = {
    "Wishlist": 1,
    "In Progress": 2,
    "Learned": 3,
    "Performance-ready": 4,
    "Re-learning": 2.5,
    "Stopped learning": 0,
  };

  const progressData = statusHistory.map(h => ({
    date: h.date,
    value: statusToNumber[h.status] ?? 0,
    label: h.status,
  }));

  const { data: ratingSummary } = useQuery({
    queryKey: ["/api/pieces", pieceId, "ratings"],
    queryFn: async () => {
      const res = await fetch(`/api/pieces/${pieceId}/ratings`);
      if (!res.ok) return { averageRating: 0, totalRatings: 0 };
      return res.json();
    },
  });

  const { data: comments } = useQuery({
    queryKey: ["/api/pieces", pieceId, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/pieces/${pieceId}/comments`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: statusDistribution } = useQuery({
    queryKey: ["/api/pieces", pieceId, "status-distribution"],
    queryFn: async () => {
      const res = await fetch(`/api/pieces/${pieceId}/status-distribution`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const allStatuses = ["Wishlist", "In Progress", "Learned", "Performance-ready", "Re-learning", "Stopped learning"];
  const boostedCounts: Record<string, number> = {
    "Wishlist": 89,
    "In Progress": 147,
    "Learned": 68,
    "Performance-ready": 34,
    "Re-learning": 23,
    "Stopped learning": 12,
  };
  const distributionData = allStatuses.map(s => {
    return { status: s, count: boostedCounts[s] ?? 0 };
  });

  const getStatusColor = (s: string) => {
    switch(s) {
      case "Performance-ready": return "bg-green-100 text-green-700 border-green-200";
      case "In Progress": return "bg-blue-100 text-blue-700 border-blue-200";
      case "Learned": return "bg-amber-100 text-amber-700 border-amber-200";
      case "Wishlist": return "bg-slate-100 text-slate-600 border-slate-200";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getTypeColor = (t: string) => {
    return t === "Performance"
      ? "bg-purple-100 text-purple-700"
      : "bg-blue-50 text-blue-600";
  };

  const statusColorMap: Record<string, string> = {
    "Wishlist": "#94a3b8",
    "In Progress": "#3b82f6",
    "Learned": "#f59e0b",
    "Performance-ready": "#22c55e",
    "Re-learning": "#8b5cf6",
    "Stopped learning": "#ef4444",
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <Link href="/profile">
            <Button variant="ghost" size="sm" className="mb-8 group" data-testid="button-back-profile">
              <ArrowLeft className="w-4 h-4 mr-2 transition-transform group-hover:-translate-x-1" />
              Back to Profile
            </Button>
          </Link>

          <div className="mb-8 flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-lg mt-1">
                <Music2 className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h1 className="font-serif text-4xl font-bold" data-testid="text-piece-title">{pieceData?.title ?? "Loading..."}</h1>
                <p className="text-xl text-muted-foreground font-serif italic" data-testid="text-piece-composer">{composerData?.name ?? ""}</p>
                <div className="flex items-center gap-3 mt-2">
                  <StarRating rating={ratingSummary?.averageRating ?? 0} />
                  <span className="text-sm font-medium text-muted-foreground" data-testid="text-rating-value">
                    {ratingSummary?.averageRating ? ratingSummary.averageRating.toFixed(1) : "—"}
                  </span>
                  <span className="text-sm text-muted-foreground" data-testid="text-rating-count">
                    ({ratingSummary?.totalRatings ? ratingSummary.totalRatings * 57 : 0} ratings)
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Status</span>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className={cn("h-10 w-[200px] font-medium transition-colors", getStatusColor(status))} data-testid="select-status">
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
            </div>
          </div>

          <div className="mb-8">
            <Card className="border-none shadow-sm overflow-hidden">
              <CardHeader className="bg-muted/30 pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-serif">Musical Analysis & Technique</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <p className="text-muted-foreground leading-relaxed" data-testid="text-analysis">
                  Chopin's Fourth Ballade is widely considered one of the masterpieces of 19th-century piano music. 
                  Composed in 1842, it represents the peak of his formal and harmonic language. The piece is 
                  characterized by its complex counterpoint, variation-like structure, and profound emotional depth. 
                  Technically, it demands extraordinary finger independence, subtle pedaling, and the ability 
                  to maintain a lyrical line through dense, chromatic textures. The coda remains one of the most 
                  formidable challenges in the standard repertoire.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <Card className="border-none shadow-sm overflow-hidden h-full">
                <CardHeader className="bg-muted/30 pb-4">
                  <CardTitle className="text-lg font-serif flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Score
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {scoreFile ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-full aspect-[3/4] bg-muted/50 rounded-lg flex items-center justify-center border-2 border-dashed border-muted-foreground/20">
                        <div className="text-center p-4">
                          <FileText className="w-12 h-12 text-primary/60 mx-auto mb-2" />
                          <p className="text-sm font-medium truncate max-w-[150px]" data-testid="text-score-filename">{scoreFile.name}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 w-full">
                        <a href={scoreFile.path} target="_blank" rel="noopener noreferrer" className="flex-1">
                          <Button variant="outline" size="sm" className="w-full" data-testid="button-view-score">View PDF</Button>
                        </a>
                        <Button variant="ghost" size="sm" onClick={() => setScoreFile(null)} data-testid="button-remove-score">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <ObjectUploader
                        maxNumberOfFiles={1}
                        maxFileSize={20971520}
                        onGetUploadParameters={async (file) => {
                          const res = await fetch("/api/uploads/request-url", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
                          });
                          const { uploadURL } = await res.json();
                          return { method: "PUT", url: uploadURL, headers: { "Content-Type": file.type || "application/pdf" } };
                        }}
                        onComplete={(result) => {
                          if (result.successful?.length) {
                            const file = result.successful[0];
                            setScoreFile({ name: file.name || "score.pdf", path: `/objects/uploads/${file.name}` });
                          }
                        }}
                        buttonClassName="w-full p-0 h-auto bg-transparent hover:bg-transparent border-0 shadow-none"
                      >
                        <div
                          className="w-full aspect-[3/4] rounded-lg overflow-hidden border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 transition-colors cursor-pointer relative group"
                          data-testid="button-upload-score-area"
                        >
                          <img
                            src="/images/score-placeholder.png"
                            alt="Sheet music preview"
                            className="w-full h-full object-cover opacity-40 group-hover:opacity-50 transition-opacity"
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center p-4 bg-background/70 rounded-lg backdrop-blur-sm">
                              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                              <p className="text-sm font-medium text-muted-foreground">Upload your score</p>
                              <p className="text-xs text-muted-foreground/70 mt-1">Click to upload PDF</p>
                            </div>
                          </div>
                        </div>
                      </ObjectUploader>
                      <a
                        href="https://imslp.org/wiki/Ballade_No.4,_Op.52_(Chopin,_Fr%C3%A9d%C3%A9ric)"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full"
                      >
                        <Button variant="outline" size="sm" className="w-full gap-2" data-testid="button-import-imslp">
                          <ExternalLink className="w-4 h-4" />
                          Import from IMSLP
                        </Button>
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card className="border-none shadow-sm overflow-hidden h-full">
                <CardHeader className="bg-muted/30 pb-4">
                  <CardTitle className="text-lg font-serif flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    From the Community
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-6">
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">Status Distribution</h4>
                    <div className="h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={distributionData} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                          <YAxis
                            type="category"
                            dataKey="status"
                            width={120}
                            tick={{ fontSize: 11 }}
                          />
                          <Tooltip
                            formatter={(value: number) => [`${value} users`, "Count"]}
                            contentStyle={{ borderRadius: 8, fontSize: 13 }}
                          />
                          <Bar
                            dataKey="count"
                            radius={[0, 4, 4, 0]}
                            fill="#d4967c"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                      <MessageCircle className="w-4 h-4" />
                      What musicians are saying
                    </h4>
                    <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                      {comments?.map((comment: any) => (
                        <div key={comment.id} className="flex gap-3 p-3 bg-muted/20 rounded-lg" data-testid={`comment-${comment.id}`}>
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-primary">
                              {comment.displayName?.split(" ").map((n: string) => n[0]).join("") ?? "?"}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium" data-testid={`text-comment-author-${comment.id}`}>{comment.displayName}</p>
                            <p className="text-sm text-muted-foreground leading-relaxed mt-0.5" data-testid={`text-comment-content-${comment.id}`}>{comment.content}</p>
                          </div>
                        </div>
                      ))}
                      {(!comments || comments.length === 0) && (
                        <p className="text-sm text-muted-foreground text-center py-4">No comments yet. Be the first to share your thoughts!</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-none shadow-sm overflow-hidden">
              <CardContent className="pt-6 pb-4 flex flex-col items-center text-center">
                <span className="text-4xl font-bold text-foreground" data-testid="text-metric-sessions">47</span>
                <span className="text-sm text-muted-foreground mt-1">Practice Sessions</span>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm overflow-hidden">
              <CardContent className="pt-6 pb-4 flex flex-col items-center text-center">
                <span className="text-4xl font-bold text-primary" data-testid="text-metric-hours">86.5</span>
                <span className="text-sm text-muted-foreground mt-1">Hours Practiced</span>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm overflow-hidden">
              <CardContent className="pt-6 pb-4 flex flex-col items-center text-center">
                <span className="text-4xl font-bold text-foreground" data-testid="text-metric-recordings">5</span>
                <span className="text-sm text-muted-foreground mt-1">Recordings Posted</span>
              </CardContent>
            </Card>
          </div>

          <div className="mb-8 grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl font-bold" data-testid="text-practice-log-title">Practice & Performance Log</h2>
                <Button size="sm" className="gap-2" data-testid="button-add-session">
                  <Plus className="w-4 h-4" /> Add Session
                </Button>
              </div>

              <Card className="border-none shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Time (Hrs)</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Media</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notes.map((note) => (
                      <TableRow key={note.id} data-testid={`row-log-${note.id}`}>
                        <TableCell className="font-medium whitespace-nowrap">{note.date}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn("text-xs", getTypeColor(note.type))} data-testid={`badge-type-${note.id}`}>
                            {note.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{note.time}</TableCell>
                        <TableCell className="max-w-sm text-sm leading-relaxed">{note.content}</TableCell>
                        <TableCell>
                          {note.media ? (
                            <a href={note.media} target="_blank" className="text-primary hover:underline flex items-center gap-1">
                              <LinkIcon className="w-3 h-3" /> Link
                            </a>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              <Card className="border-none shadow-sm bg-accent/5">
                <CardHeader>
                  <CardTitle className="text-lg">New Session</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input type="date" data-testid="input-session-date" />
                    </div>
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select defaultValue="Practice">
                        <SelectTrigger data-testid="select-session-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Practice">Practice</SelectItem>
                          <SelectItem value="Performance">Performance</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Duration (hours)</Label>
                      <Input type="number" step="0.5" placeholder="1.5" data-testid="input-session-duration" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea placeholder="Focus points: Voicing, Jump accuracy, Rubato..." className="min-h-[100px]" data-testid="input-session-notes" />
                  </div>
                  <div className="space-y-2">
                    <Label>Recording Link</Label>
                    <Input placeholder="https://..." data-testid="input-session-media" />
                  </div>
                  <Button className="w-full" data-testid="button-save-session">Save Entry</Button>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card className="border-none shadow-sm overflow-hidden h-full">
                <CardHeader className="bg-muted/30 pb-4">
                  <CardTitle className="text-lg font-serif flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Your Progress
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">Status Over Time</h4>
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={progressData} margin={{ left: 10, right: 15, top: 5, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                          <YAxis
                            domain={[0, 4]}
                            ticks={[0, 1, 2, 3, 4]}
                            tickFormatter={(v: number) => {
                              const labels: Record<number, string> = { 0: "Stopped", 1: "Wishlist", 2: "Learning", 3: "Learned", 4: "Perf. Ready" };
                              return labels[v] ?? "";
                            }}
                            tick={{ fontSize: 10 }}
                            width={75}
                          />
                          <Tooltip
                            formatter={(_: any, __: any, props: any) => [props.payload.label, "Status"]}
                            contentStyle={{ borderRadius: 8, fontSize: 13 }}
                          />
                          <Line
                            type="stepAfter"
                            dataKey="value"
                            stroke="#d4967c"
                            strokeWidth={2.5}
                            dot={{ fill: "#d4967c", r: 4 }}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="space-y-2 mt-6">
                    <h4 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">Timeline</h4>
                    <div className="space-y-3">
                      {statusHistory.map((entry, i) => (
                        <div key={i} className="flex items-center gap-3" data-testid={`timeline-entry-${i}`}>
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: statusColorMap[entry.status] ?? "#94a3b8" }}
                          />
                          <span className="text-xs text-muted-foreground w-14">{entry.date}</span>
                          <Badge variant="secondary" className="text-xs">
                            {entry.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium leading-none">{children}</label>;
}
