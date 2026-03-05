import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Star, ExternalLink, Users, Music2, Clock, Hash,
  Youtube, ChevronRight, MessageSquare, ThumbsUp, Play, ArrowUpRight,
  BookOpen, Layers, Zap, Eye, PlusCircle, Video, UserCircle2,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getStatusColor, getStatusDotColor } from "@/lib/status-colors";
import { formatDistanceToNow } from "date-fns";

// ─────────────────────────────────────────────────────────────────────────────
// Constants / lookup data
// ─────────────────────────────────────────────────────────────────────────────

const ALL_STATUSES = ["Want to learn", "Up next", "Learning", "Refining", "Maintaining", "Performance Ready", "Shelved"];

type DiscussionTag = "General" | "Tips & Technique" | "Interpretation" | "Help";
const TAG_COLOR: Record<DiscussionTag, string> = {
  General:            "bg-slate-100 text-slate-700",
  "Tips & Technique": "bg-blue-100 text-blue-700",
  Interpretation:     "bg-violet-100 text-violet-700",
  Help:               "bg-amber-100 text-amber-700",
};
const DISCUSSION_TABS: (DiscussionTag | "All")[] = ["All", "Tips & Technique", "Interpretation", "Help", "General"];

const MOCK_THREADS: { votes: number; title: string; tag: DiscussionTag; author: string; replies: number; timeAgo: string }[] = [
  { votes: 47, title: "How long did this take you to learn from scratch?",         tag: "General",            author: "Sarah K.",  replies: 23, timeAgo: "2d ago" },
  { votes: 31, title: "Fingering advice for the octave runs — what works for you?",tag: "Tips & Technique",   author: "Marcus T.", replies: 12, timeAgo: "5d ago" },
  { votes: 24, title: "Recommended recordings to study for interpretation?",        tag: "Interpretation",     author: "Yuki N.",   replies: 18, timeAgo: "1w ago" },
  { votes: 19, title: "Best tempo — strict or flexible rubato throughout?",         tag: "Interpretation",     author: "Alex M.",   replies: 9,  timeAgo: "2w ago" },
  { votes: 14, title: "Is the grade / difficulty rating accurate?",                 tag: "Help",               author: "Emma L.",   replies: 7,  timeAgo: "2w ago" },
  { votes: 11, title: "Slow practice approach that actually helped me",             tag: "Tips & Technique",   author: "David W.",  replies: 15, timeAgo: "3w ago" },
];

type ActivityType = "status" | "added" | "milestone" | "recording";
const ACTIVITY_CFG: Record<ActivityType, { icon: typeof Play; border: string; iconBg: string; iconColor: string }> = {
  status:    { icon: Star,       border: "border-l-rose-400",   iconBg: "bg-rose-100",   iconColor: "text-rose-600" },
  added:     { icon: PlusCircle, border: "border-l-blue-400",   iconBg: "bg-blue-100",   iconColor: "text-blue-600" },
  milestone: { icon: Zap,        border: "border-l-amber-400",  iconBg: "bg-amber-100",  iconColor: "text-amber-600" },
  recording: { icon: Video,      border: "border-l-purple-400", iconBg: "bg-purple-100", iconColor: "text-purple-600" },
};
const MOCK_ACTIVITY: { type: ActivityType; displayName: string; text: string; timeAgo: string }[] = [
  { type: "status",    displayName: "Sarah K.",  text: "moved this piece to Performance Ready", timeAgo: "2h ago" },
  { type: "added",     displayName: "Marcus T.", text: "added this piece to their repertoire",  timeAgo: "5h ago" },
  { type: "recording", displayName: "Yuki N.",   text: "shared a recording",                    timeAgo: "8h ago" },
  { type: "milestone", displayName: "Alex M.",   text: "logged 50 hours on this piece",         timeAgo: "1d ago" },
  { type: "status",    displayName: "Emma L.",   text: "moved this piece to Refining",          timeAgo: "2d ago" },
  { type: "added",     displayName: "David W.",  text: "added this piece to their repertoire",  timeAgo: "3d ago" },
  { type: "recording", displayName: "Priya R.",  text: "shared a recording",                    timeAgo: "4d ago" },
  { type: "status",    displayName: "Thomas H.", text: "moved this piece to Maintaining",       timeAgo: "5d ago" },
];

function getDifficultyDimensions(d?: string | null) {
  const map: Record<string, { technical: number; musical: number; memory: number; sightReading: number }> = {
    Beginner:     { technical: 1.4, musical: 1.6, memory: 1.2, sightReading: 2.0 },
    Intermediate: { technical: 2.8, musical: 3.0, memory: 2.6, sightReading: 3.1 },
    Advanced:     { technical: 4.0, musical: 3.8, memory: 3.6, sightReading: 3.4 },
    Expert:       { technical: 4.8, musical: 4.6, memory: 4.5, sightReading: 4.0 },
  };
  return map[d ?? ""] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} className={cn("w-4 h-4",
          s <= Math.round(rating) ? "fill-amber-400 text-amber-400" :
          s - 0.5 <= rating       ? "fill-amber-400/50 text-amber-400" :
                                    "text-muted-foreground/30"
        )} />
      ))}
    </div>
  );
}

function InteractiveStarRating({ rating, onRate }: { rating: number; onRate: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || rating;
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map(s => {
        const filled = display >= s;
        const half   = !filled && display >= s - 0.5;
        return (
          <div key={s} className="relative cursor-pointer w-6 h-6"
            onMouseMove={e => { const left = e.clientX - e.currentTarget.getBoundingClientRect().left < e.currentTarget.getBoundingClientRect().width / 2; setHovered(left ? s - 0.5 : s); }}
            onClick={e => { const left = e.clientX - e.currentTarget.getBoundingClientRect().left < e.currentTarget.getBoundingClientRect().width / 2; onRate(left ? s - 0.5 : s); }}
          >
            <Star className="absolute inset-0 w-6 h-6 text-muted-foreground/30" />
            {filled && <Star className="absolute inset-0 w-6 h-6 fill-amber-400 text-amber-400" />}
            {half   && <div className="absolute inset-0 overflow-hidden w-[50%]"><Star className="w-6 h-6 fill-amber-400 text-amber-400" /></div>}
          </div>
        );
      })}
    </div>
  );
}

function Avatar({ name, avatarUrl, size = "md" }: { name?: string | null; avatarUrl?: string | null; size?: "sm" | "md" }) {
  const initials = name ? name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "?";
  return (
    <div className={cn("rounded-full bg-primary/10 border-2 border-background flex items-center justify-center overflow-hidden shrink-0 shadow-sm",
      size === "sm" ? "w-7 h-7" : "w-9 h-9")}>
      {avatarUrl
        ? <img src={avatarUrl} alt={name ?? ""} className="w-full h-full object-cover" />
        : <span className={cn("font-semibold text-primary/70", size === "sm" ? "text-[10px]" : "text-xs")}>{initials}</span>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap", getStatusColor(status))}>
      {status}
    </span>
  );
}

function DifficultyBar({ label, value, max = 5 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold tabular-nums">{value.toFixed(1)}</span>
      </div>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatusBar({ status, count, max }: { status: string; count: number; max: number }) {
  const pct = max > 0 ? Math.max(3, Math.round((count / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-28 shrink-0 truncate">{status}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: getStatusDotColor(status) }} />
      </div>
      <span className="text-xs font-semibold tabular-nums w-6 text-right shrink-0">{count}</span>
    </div>
  );
}

function Chip({ icon: Icon, label }: { icon: typeof Music2; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-stone-300 text-xs">
      <Icon className="w-3 h-3 text-stone-400" />
      {label}
    </span>
  );
}

function YtSearchCard({ label, sublabel, query, gradient }: { label: string; sublabel: string; query: string; gradient: string }) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="group block">
      <div className={cn("relative rounded-lg overflow-hidden mb-2 aspect-video flex items-center justify-center", gradient)}>
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
        <div className="relative w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
          <Play className="w-4 h-4 text-stone-900 ml-0.5" fill="currentColor" />
        </div>
        <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/40 text-white">YouTube</span>
      </div>
      <p className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
    </a>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const currentUserId = () => localStorage.getItem("userId") || "";

export default function PieceDetailPage() {
  const params = useParams<{ id: string }>();
  const pieceId = params.id ? parseInt(params.id) : 0;

  const [status, setStatus]           = useState("Learning");
  const [userRating, setUserRating]   = useState(0);
  const [activeTab, setActiveTab]     = useState<"All" | DiscussionTag>("All");

  // ── queries ──
  const { data: pieceData } = useQuery({
    queryKey: ["/api/pieces", pieceId],
    queryFn: async () => { const r = await fetch(`/api/pieces/${pieceId}`); return r.ok ? r.json() : null; },
    enabled: !!pieceId,
  });
  const { data: composerData } = useQuery({
    queryKey: ["/api/composers", pieceData?.composerId],
    queryFn: async () => { const r = await fetch(`/api/composers/${pieceData.composerId}`); return r.ok ? r.json() : null; },
    enabled: !!pieceData?.composerId,
  });
  const { data: movements = [] } = useQuery<any[]>({
    queryKey: ["/api/pieces", pieceId, "movements"],
    queryFn: async () => { const r = await fetch(`/api/pieces/${pieceId}/movements`); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : []; },
    enabled: !!pieceId,
  });
  const { data: ratingSummary } = useQuery({
    queryKey: ["/api/pieces", pieceId, "ratings"],
    queryFn: async () => { const r = await fetch(`/api/pieces/${pieceId}/ratings`); return r.ok ? r.json() : { averageRating: 0, totalRatings: 0 }; },
    enabled: !!pieceId,
  });
  const { data: analysisData, isLoading: analysisLoading } = useQuery({
    queryKey: ["/api/pieces", pieceId, "analysis"],
    queryFn: async () => { const r = await fetch(`/api/pieces/${pieceId}/analysis`); if (!r.ok) throw new Error("failed"); return r.json(); },
    staleTime: Infinity, retry: 1, enabled: !!pieceId,
  });
  const { data: rawDistribution = [] } = useQuery<any[]>({
    queryKey: ["/api/pieces", pieceId, "status-distribution"],
    queryFn: async () => { const r = await fetch(`/api/pieces/${pieceId}/status-distribution`); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : []; },
    enabled: !!pieceId,
  });
  const { data: realActivity = [] } = useQuery<any[]>({
    queryKey: ["/api/pieces", pieceId, "activity"],
    queryFn: async () => { const r = await fetch(`/api/pieces/${pieceId}/activity`); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : []; },
    enabled: !!pieceId,
  });
  const { data: learners = [] } = useQuery<any[]>({
    queryKey: ["/api/pieces", pieceId, "learners"],
    queryFn: async () => { const r = await fetch(`/api/pieces/${pieceId}/learners`); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : []; },
    enabled: !!pieceId,
  });
  const { data: relatedPieces = [] } = useQuery<any[]>({
    queryKey: ["/api/pieces", pieceId, "related"],
    queryFn: async () => { const r = await fetch(`/api/pieces/${pieceId}/related`); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : []; },
    enabled: !!pieceId,
  });

  // ── derived ──
  const distributionMap = useMemo(() => {
    const m: Record<string, number> = {};
    rawDistribution.forEach((r: any) => { m[r.status] = r.count; });
    return m;
  }, [rawDistribution]);

  // boost counts for visual demo when real data is sparse
  const DEMO_COUNTS: Record<string, number> = {
    "Want to learn": 89, "Up next": 42, "Learning": 147,
    "Refining": 68, "Maintaining": 31, "Performance Ready": 34, "Shelved": 23,
  };
  const distributionData = useMemo(() => {
    const hasReal = rawDistribution.some((r: any) => r.count > 0);
    return ALL_STATUSES.map(s => ({
      status: s,
      count: hasReal ? (distributionMap[s] ?? 0) : (DEMO_COUNTS[s] ?? 0),
    }));
  }, [distributionMap, rawDistribution]);

  const totalLearners  = distributionData.reduce((s, d) => s + d.count, 0);
  const totalCompleted = (distributionData.find(d => d.status === "Performance Ready")?.count ?? 0)
                       + (distributionData.find(d => d.status === "Maintaining")?.count ?? 0);
  const topStatus = distributionData.slice().sort((a, b) => b.count - a.count)[0]?.status ?? "—";
  const maxCount = Math.max(...distributionData.map(d => d.count), 1);

  const displayActivity = realActivity.length >= 3 ? realActivity.slice(0, 8) : MOCK_ACTIVITY;
  const activityIsReal  = realActivity.length >= 3;

  const diffDimensions = getDifficultyDimensions(pieceData?.difficulty);

  const filteredThreads = activeTab === "All"
    ? MOCK_THREADS
    : MOCK_THREADS.filter(t => t.tag === activeTab);

  const composerLastName = composerData?.name?.split(" ").slice(-1)[0] ?? "";
  const pieceShortTitle = pieceData?.title?.split(",")[0] ?? "this piece";

  return (
    <Layout>
      <div className="min-h-screen bg-background">

        {/* ── HERO ──────────────────────────────────────────────── */}
        <div className="bg-stone-900 text-stone-100">
          <div className="container mx-auto px-4 max-w-5xl pt-6 pb-10">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-5">
              <Link href="/profile">
                <Button variant="ghost" size="sm" className="text-stone-400 hover:text-white hover:bg-stone-800 -ml-2 group">
                  <ArrowLeft className="w-4 h-4 mr-1.5 transition-transform group-hover:-translate-x-1" /> Back
                </Button>
              </Link>
              {composerData && (
                <>
                  <span className="text-stone-600">/</span>
                  <Link href={`/composer/${composerData.id}`}>
                    <span className="text-stone-400 hover:text-white text-sm transition-colors cursor-pointer">{composerData.name}</span>
                  </Link>
                </>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-start gap-6">
              <div className="flex-1 min-w-0">
                {/* Era badge */}
                {composerData?.birthYear && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 mb-3 inline-block">
                    {composerData.birthYear < 1750 ? "Baroque" : composerData.birthYear < 1820 ? "Classical" : composerData.birthYear < 1900 ? "Romantic" : "Modern"}
                  </span>
                )}

                <h1 className="font-serif text-4xl sm:text-5xl font-bold text-white leading-tight mb-3">
                  {pieceData?.title ?? "Loading…"}
                </h1>

                {/* Key facts chips */}
                <div className="flex flex-wrap items-center gap-4 mb-4">
                  {pieceData?.instrument && <Chip icon={Music2} label={pieceData.instrument} />}
                  {pieceData?.keySignature && <Chip icon={Layers} label={pieceData.keySignature} />}
                  {pieceData?.yearComposed && <Chip icon={Clock} label={String(pieceData.yearComposed)} />}
                  {pieceData?.difficulty && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-stone-700 text-stone-200">
                      {pieceData.difficulty}
                    </span>
                  )}
                </div>

                {/* Inline stats */}
                <div className="flex flex-wrap items-center gap-4 mb-5">
                  <div className="flex items-center gap-2">
                    <StarRating rating={ratingSummary?.averageRating ?? 0} />
                    <span className="text-stone-300 text-sm font-semibold">{ratingSummary?.averageRating ? ratingSummary.averageRating.toFixed(1) : "—"}</span>
                    <span className="text-stone-500 text-xs">({ratingSummary?.totalRatings ? ratingSummary.totalRatings * 57 : 0} ratings)</span>
                  </div>
                  <span className="text-stone-600">·</span>
                  <span className="text-stone-400 text-sm"><span className="font-semibold text-stone-200">{totalLearners}</span> learning</span>
                  <span className="text-stone-600">·</span>
                  <span className="text-stone-400 text-sm"><span className="font-semibold text-stone-200">{totalCompleted}</span> completed</span>
                </div>

                {/* CTAs */}
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className={cn("h-9 w-44 font-medium text-sm border-stone-600 bg-stone-800 text-stone-100", getStatusColor(status))}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {pieceData?.imslpUrl && (
                    <a href={pieceData.imslpUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="border-stone-500 text-stone-200 hover:bg-stone-800 gap-2">
                        <ExternalLink className="w-3.5 h-3.5" /> View Score (IMSLP)
                      </Button>
                    </a>
                  )}
                  {!pieceData?.imslpUrl && (
                    <a href={`https://imslp.org/wiki/Special:Search/${encodeURIComponent((pieceData?.title ?? "") + " " + (composerData?.name ?? ""))}`} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="border-stone-500 text-stone-200 hover:bg-stone-800 gap-2">
                        <ExternalLink className="w-3.5 h-3.5" /> Find Score on IMSLP
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── ACTIVITY STRIP ────────────────────────────────────── */}
        <div className="border-b border-border bg-card">
          <div className="container mx-auto px-4 max-w-5xl py-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Community activity</span>
              {!activityIsReal && <span className="text-[10px] text-muted-foreground/50 ml-1">(example)</span>}
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
              {displayActivity.map((item: any, i: number) => {
                const type: ActivityType = activityIsReal
                  ? (item.postType === "recording" ? "recording" : "added")
                  : item.type;
                const cfg  = ACTIVITY_CFG[type];
                const Icon = cfg.icon;
                const name = activityIsReal ? (item.displayName ?? "A member") : item.displayName;
                const text = activityIsReal ? item.content : item.text;
                const time = activityIsReal ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true }) : item.timeAgo;
                return (
                  <div key={i} className={cn("shrink-0 w-52 rounded-xl border-l-4 bg-muted/30 border border-border p-3 hover:bg-muted/60 transition-colors", cfg.border)}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0", cfg.iconBg)}>
                        <Icon className={cn("w-3 h-3", cfg.iconColor)} />
                      </div>
                      <span className="text-xs font-semibold truncate">{name}</span>
                    </div>
                    <p className="text-xs leading-snug text-muted-foreground line-clamp-2">{text}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1.5">{time}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── BODY ─────────────────────────────────────────────── */}
        <div className="container mx-auto px-4 max-w-5xl py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

            {/* ── MAIN (2/3) ────────────────────────────────── */}
            <div className="lg:col-span-2 space-y-8">

              {/* Analytics dashboard */}
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Community overview</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { value: totalLearners,  label: "Total learners",  icon: Users,     color: "text-blue-600",   bg: "bg-blue-50" },
                    { value: ratingSummary?.averageRating ? ratingSummary.averageRating.toFixed(1) : "—", label: "Avg rating", icon: Star, color: "text-amber-600", bg: "bg-amber-50" },
                    { value: totalCompleted, label: "Completed",       icon: BookOpen,  color: "text-green-600",  bg: "bg-green-50" },
                    { value: topStatus,      label: "Top stage",       icon: Zap,       color: "text-violet-600", bg: "bg-violet-50" },
                  ].map(({ value, label, icon: Icon, color, bg }) => (
                    <Card key={label} className="border-none shadow-sm">
                      <CardContent className="p-4 flex flex-col gap-2">
                        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", bg)}>
                          <Icon className={cn("w-3.5 h-3.5", color)} />
                        </div>
                        <span className="text-2xl font-bold tabular-nums leading-none">{value}</span>
                        <span className="text-xs text-muted-foreground">{label}</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Status distribution */}
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" /> Where the community stands
                </h2>
                <Card className="border-none shadow-sm">
                  <CardContent className="p-5 space-y-3">
                    {distributionData.map(({ status: s, count }) => (
                      <StatusBar key={s} status={s} count={count} max={maxCount} />
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Movements */}
              {movements.length > 0 && (
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5" /> Movements ({movements.length})
                  </h2>
                  <Card className="border-none shadow-sm">
                    <CardContent className="p-0">
                      <div className="divide-y divide-border">
                        {movements.map((m: any, i: number) => (
                          <div key={m.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/30 transition-colors">
                            <span className="text-xs text-muted-foreground font-mono w-5 shrink-0">{i + 1}</span>
                            <span className="text-sm font-medium">{m.name}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Analysis */}
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5" /> About this piece</span>
                  {analysisData?.wikiUrl && (
                    <a href={analysisData.wikiUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 font-normal">
                      <ExternalLink className="w-3 h-3" /> Wikipedia
                    </a>
                  )}
                </h2>
                <Card className="border-none shadow-sm">
                  <CardContent className="p-5">
                    {analysisLoading ? (
                      <div className="space-y-2">
                        {[100, 90, 95, 85].map((w, i) => (
                          <div key={i} className="h-4 bg-muted/60 rounded animate-pulse" style={{ width: `${w}%` }} />
                        ))}
                        <p className="text-xs text-muted-foreground italic pt-1">Generating summary…</p>
                      </div>
                    ) : analysisData?.analysis ? (
                      <p className="text-sm text-muted-foreground leading-relaxed">{analysisData.analysis}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No analysis available yet.</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Discussion board */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5" /> Discussion
                  </h2>
                  <button
                    className="text-xs text-muted-foreground border border-dashed border-muted-foreground/30 px-3 py-1.5 rounded-full hover:border-primary/40 hover:text-primary transition-colors cursor-not-allowed opacity-60"
                    title="Discussion board coming soon"
                    disabled
                  >
                    + Start a discussion
                  </button>
                </div>

                {/* Tab filters */}
                <div className="flex gap-1.5 mb-4 flex-wrap">
                  {DISCUSSION_TABS.map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab as any)}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-full font-medium transition-colors",
                        activeTab === tab
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <Card className="border-none shadow-sm">
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {filteredThreads.map((thread, i) => (
                        <div key={i} className="flex items-start gap-4 px-5 py-4 hover:bg-muted/30 transition-colors group cursor-pointer">
                          {/* Votes */}
                          <div className="flex flex-col items-center gap-0.5 shrink-0 w-8">
                            <ThumbsUp className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary/60 transition-colors" />
                            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{thread.votes}</span>
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", TAG_COLOR[thread.tag])}>
                                {thread.tag}
                              </span>
                            </div>
                            <p className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">{thread.title}</p>
                            <div className="flex items-center gap-3 mt-1.5">
                              <Avatar name={thread.author} size="sm" />
                              <span className="text-xs text-muted-foreground">{thread.author}</span>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" /> {thread.replies} replies
                              </span>
                              <span className="text-xs text-muted-foreground">· {thread.timeAgo}</span>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary/60 transition-colors shrink-0 mt-1" />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* ── SIDEBAR (1/3, sticky) ────────────────────── */}
            <div className="space-y-6 lg:sticky lg:top-6">

              {/* Your status */}
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Your status</h2>
                <Card className="border-none shadow-sm">
                  <CardContent className="p-4">
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger className={cn("font-medium text-sm w-full", getStatusColor(status))}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              </div>

              {/* Your rating */}
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Your rating</h2>
                <Card className="border-none shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <InteractiveStarRating rating={userRating} onRate={setUserRating} />
                      <span className="text-sm text-muted-foreground">
                        {userRating > 0 ? `${userRating}/5` : "Rate this piece"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                      <StarRating rating={ratingSummary?.averageRating ?? 0} />
                      <span className="font-semibold">{ratingSummary?.averageRating ? ratingSummary.averageRating.toFixed(1) : "—"}</span>
                      <span>community avg</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Difficulty breakdown */}
              {diffDimensions && (
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Difficulty breakdown</h2>
                  <Card className="border-none shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <DifficultyBar label="Technical demand"   value={diffDimensions.technical}    />
                      <DifficultyBar label="Musical complexity" value={diffDimensions.musical}      />
                      <DifficultyBar label="Memory load"        value={diffDimensions.memory}       />
                      <DifficultyBar label="Sight-reading"      value={diffDimensions.sightReading} />
                      <p className="text-[10px] text-muted-foreground/50 pt-1">Based on community difficulty rating: {pieceData?.difficulty}</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Who's learning */}
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" /> Who's learning this
                </h2>
                <Card className="border-none shadow-sm">
                  <CardContent className="p-4">
                    {learners.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-3">
                        <UserCircle2 className="w-7 h-7 text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground text-center">Be the first to add this piece.</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {learners.slice(0, 6).map((l: any) => (
                          <Link key={l.userId} href={`/user/${l.userId}`}>
                            <div className="flex items-center gap-2.5 hover:bg-muted/40 rounded-lg px-1 py-1 transition-colors cursor-pointer group">
                              <Avatar name={l.displayName} avatarUrl={l.avatarUrl} size="sm" />
                              <span className="text-xs font-medium flex-1 truncate group-hover:text-primary transition-colors">{l.displayName ?? l.userId}</span>
                              <StatusBadge status={l.status} />
                            </div>
                          </Link>
                        ))}
                        {learners.length > 6 && (
                          <p className="text-xs text-muted-foreground text-center pt-1">+ {learners.length - 6} more</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Related pieces */}
              {relatedPieces.length > 0 && (
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Also in their repertoire</h2>
                  <Card className="border-none shadow-sm">
                    <CardContent className="p-0">
                      <div className="divide-y divide-border">
                        {relatedPieces.map((p: any) => (
                          <Link key={p.id} href={`/piece/${p.id}`}>
                            <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer group">
                              <div className="flex-1 min-w-0 pr-2">
                                <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">{p.title}</p>
                                <p className="text-[10px] text-muted-foreground">{p.composerName}</p>
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">{p.coCount} in common</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* YouTube recordings */}
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                  <Youtube className="w-3.5 h-3.5" /> Recordings
                </h2>
                <div className="space-y-5">
                  <YtSearchCard
                    label="Top performance"
                    sublabel={`${composerLastName} — ${pieceShortTitle}`}
                    query={`${pieceData?.title ?? ""} ${composerData?.name ?? ""} piano`}
                    gradient="bg-gradient-to-br from-stone-700 to-stone-900"
                  />
                  <YtSearchCard
                    label="Tutorial & analysis"
                    sublabel="Piano lesson / breakdown"
                    query={`${pieceData?.title ?? ""} ${composerLastName} piano tutorial`}
                    gradient="bg-gradient-to-br from-slate-700 to-slate-900"
                  />
                  <YtSearchCard
                    label="Score video"
                    sublabel="Sheet music with playthrough"
                    query={`${pieceData?.title ?? ""} ${composerLastName} piano score sheet music`}
                    gradient="bg-gradient-to-br from-zinc-700 to-zinc-900"
                  />
                </div>
              </div>

              {/* Reddit */}
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5" /> Discussions
                </h2>
                <Card className="border-none shadow-sm">
                  <CardContent className="p-4 space-y-4">
                    {[
                      { sub: "r/piano",         title: `Best recordings of ${pieceShortTitle}?`,                     votes: 412, comments: 67 },
                      { sub: "r/piano",         title: `Tips for learning ${pieceShortTitle} — how did you approach it?`, votes: 289, comments: 41 },
                      { sub: "r/classicalmusic", title: `${composerLastName}'s ${pieceShortTitle} — what makes it great`, votes: 198, comments: 28 },
                    ].map((post, i) => (
                      <a key={i}
                        href={`https://www.reddit.com/search/?q=${encodeURIComponent((pieceData?.title ?? "") + " " + composerLastName)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="block group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">{post.sub}</span>
                            <p className="text-xs font-medium mt-1 leading-snug group-hover:text-primary transition-colors line-clamp-2">{post.title}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">↑ {post.votes} · {post.comments} comments</p>
                          </div>
                          <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1 group-hover:text-primary transition-colors" />
                        </div>
                      </a>
                    ))}
                  </CardContent>
                </Card>
              </div>

            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
