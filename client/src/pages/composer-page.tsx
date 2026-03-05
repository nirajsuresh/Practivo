import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft, Users, Music2, ExternalLink, Youtube, Hash,
  TrendingUp, Clock, ChevronRight, UserCircle2, Search,
  Play, PlusCircle, Video, ArrowUpRight, Star, Zap, BookOpen,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

type VideoEntry = { title: string; artist: string; videoId: string; type: "Performance" | "Analysis" | "Masterclass" };

const YOUTUBE_VIDEOS: Record<string, VideoEntry[]> = {
  "Chopin": [
    { title: "Complete Nocturnes", artist: "Arthur Rubinstein", videoId: "ZtIW2r1EalM", type: "Performance" },
    { title: "Ballades Nos. 1–4", artist: "Maurizio Pollini", videoId: "6KVqmEMU6So", type: "Performance" },
    { title: "24 Études Op. 10 & 25", artist: "Martha Argerich", videoId: "l6GDOmjfXG8", type: "Performance" },
  ],
  "Beethoven": [
    { title: "Moonlight Sonata Op. 27", artist: "Valentina Lisitsa", videoId: "8OAPLtmcNl4", type: "Performance" },
    { title: "Waldstein & Appassionata", artist: "Daniel Barenboim", videoId: "KuHNb_FZoFo", type: "Performance" },
    { title: "Complete Piano Sonatas", artist: "Wilhelm Kempff", videoId: "Jf3bNXHT_3o", type: "Performance" },
  ],
  "Bach": [
    { title: "Goldberg Variations (1981)", artist: "Glenn Gould", videoId: "55hk75OgWDg", type: "Performance" },
    { title: "Well-Tempered Clavier, Bk. I", artist: "Angela Hewitt", videoId: "nni_H64yoXo", type: "Performance" },
    { title: "Partitas BWV 825–830", artist: "Murray Perahia", videoId: "qZSj7GVidMY", type: "Performance" },
  ],
  "Debussy": [
    { title: "Clair de Lune (live)", artist: "Paul Barton", videoId: "CvFH_6DNRCY", type: "Performance" },
    { title: "Complete Préludes", artist: "Krystian Zimerman", videoId: "AOlH2-OJW5Q", type: "Performance" },
    { title: "Images & Estampes", artist: "Jean-Yves Thibaudet", videoId: "Rc_FG0kpgVU", type: "Performance" },
  ],
  "Schubert": [
    { title: "Impromptus D. 899 & 935", artist: "Radu Lupu", videoId: "TfCpzBN_wBw", type: "Performance" },
    { title: "Wanderer Fantasy D. 760", artist: "Sviatoslav Richter", videoId: "HFm3sNMFf2k", type: "Performance" },
    { title: "Piano Sonata D. 960", artist: "Alfred Brendel", videoId: "7b7SsXGnzgw", type: "Performance" },
  ],
  "Liszt": [
    { title: "Transcendental Études", artist: "Lazar Berman", videoId: "k4Y5SUAyJhw", type: "Performance" },
    { title: "Sonata in B minor", artist: "Emil Gilels", videoId: "2TpNE2PEOBI", type: "Performance" },
    { title: "Hungarian Rhapsody No. 2", artist: "Vladimir Horowitz", videoId: "ZFmQGbdABMo", type: "Performance" },
  ],
  "Rachmaninoff": [
    { title: "Piano Concerto No. 2", artist: "Yuja Wang", videoId: "gHDRugrHY7A", type: "Performance" },
    { title: "Piano Concerto No. 3", artist: "Martha Argerich", videoId: "VUrDPNBPLww", type: "Performance" },
    { title: "Preludes — Complete", artist: "Yefim Bronfman", videoId: "wDDFFKf7JgA", type: "Performance" },
  ],
  "Brahms": [
    { title: "Intermezzo Op. 118 No. 2", artist: "Glenn Gould", videoId: "YKR_BqhZTYg", type: "Performance" },
    { title: "Piano Concerto No. 2", artist: "Sviatoslav Richter", videoId: "qtB2HswAVDI", type: "Performance" },
    { title: "Ballades Op. 10", artist: "Radu Lupu", videoId: "m9iCKKhOw7I", type: "Performance" },
  ],
  "Schumann": [
    { title: "Kinderszenen Op. 15", artist: "Vladimir Horowitz", videoId: "Dtz9HJ6UgUE", type: "Performance" },
    { title: "Kreisleriana Op. 16", artist: "Martha Argerich", videoId: "Rl7QgnTQP0o", type: "Performance" },
    { title: "Carnaval Op. 9", artist: "Artur Rubinstein", videoId: "lLoiMRtLqHA", type: "Performance" },
  ],
  "Ravel": [
    { title: "Gaspard de la Nuit", artist: "Martha Argerich", videoId: "HfSoRKD_JYg", type: "Performance" },
    { title: "Pavane pour une infante", artist: "Walter Gieseking", videoId: "I8etmVDDaLE", type: "Performance" },
    { title: "Sonatine & Miroirs", artist: "Samson François", videoId: "G7oQYEI4uBA", type: "Performance" },
  ],
  "Mozart": [
    { title: "Piano Sonata K. 331", artist: "Mitsuko Uchida", videoId: "CnJ_a_GhRfQ", type: "Performance" },
    { title: "Piano Concerto No. 21", artist: "Murray Perahia", videoId: "HWKsWGwMByE", type: "Performance" },
    { title: "Piano Concerto No. 20", artist: "Friedrich Gulda", videoId: "yM8CFR16R_M", type: "Performance" },
  ],
};

type ActivityType = "status" | "added" | "milestone" | "recording";

const MOCK_ACTIVITY: {
  type: ActivityType; displayName: string; pieceHint: string;
  statusTo?: string; hoursLogged?: number; timeAgo: string;
}[] = [
  { type: "status",    displayName: "Sarah K.",    pieceHint: "Nocturne Op. 9 No. 2",   statusTo: "Performance Ready", timeAgo: "2h ago" },
  { type: "added",     displayName: "Marcus T.",   pieceHint: "Ballade No. 1",                                          timeAgo: "5h ago" },
  { type: "recording", displayName: "Yuki N.",     pieceHint: "Étude Op. 10 No. 4",                                     timeAgo: "7h ago" },
  { type: "milestone", displayName: "Alex M.",     pieceHint: "Sonata Op. 35",          hoursLogged: 50,                timeAgo: "1d ago" },
  { type: "status",    displayName: "Priya R.",    pieceHint: "Waltz Op. 64 No. 2",     statusTo: "Refining",           timeAgo: "2d ago" },
  { type: "added",     displayName: "Thomas H.",   pieceHint: "Scherzo No. 2",                                          timeAgo: "3d ago" },
  { type: "recording", displayName: "Emma L.",     pieceHint: "Prélude Op. 28 No. 15",                                  timeAgo: "3d ago" },
  { type: "status",    displayName: "David W.",    pieceHint: "Nocturne Op. 27 No. 2",  statusTo: "Maintaining",        timeAgo: "4d ago" },
];

const ACTIVITY_CONFIG: Record<ActivityType, { label: string; icon: typeof Play; border: string; iconBg: string; iconColor: string }> = {
  status:    { label: "Status update",  icon: Star,       border: "border-l-rose-400",   iconBg: "bg-rose-100",   iconColor: "text-rose-600" },
  added:     { label: "New to list",    icon: PlusCircle, border: "border-l-blue-400",   iconBg: "bg-blue-100",   iconColor: "text-blue-600" },
  milestone: { label: "Milestone",      icon: Zap,        border: "border-l-amber-400",  iconBg: "bg-amber-100",  iconColor: "text-amber-600" },
  recording: { label: "Recording",      icon: Video,      border: "border-l-purple-400", iconBg: "bg-purple-100", iconColor: "text-purple-600" },
};

function activityText(item: typeof MOCK_ACTIVITY[0]) {
  switch (item.type) {
    case "status":    return <>moved <span className="font-medium">{item.pieceHint}</span> to <span className="font-medium text-rose-600">{item.statusTo}</span></>;
    case "added":     return <>added <span className="font-medium">{item.pieceHint}</span> to their repertoire</>;
    case "milestone": return <>logged <span className="font-medium">{item.hoursLogged} hours</span> on <span className="font-medium">{item.pieceHint}</span></>;
    case "recording": return <>shared a recording of <span className="font-medium">{item.pieceHint}</span></>;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function getEra(b?: number | null) {
  if (!b) return null;
  if (b < 1600) return "Renaissance";
  if (b < 1750) return "Baroque";
  if (b < 1820) return "Classical";
  if (b < 1900) return "Romantic";
  if (b < 1945) return "Modern";
  return "Contemporary";
}

const ERA_COLOR: Record<string, string> = {
  Renaissance: "bg-amber-100 text-amber-800",
  Baroque:     "bg-yellow-100 text-yellow-800",
  Classical:   "bg-sky-100 text-sky-800",
  Romantic:    "bg-rose-100 text-rose-800",
  Modern:      "bg-violet-100 text-violet-800",
  Contemporary:"bg-emerald-100 text-emerald-800",
};

function DifficultyDot({ difficulty }: { difficulty?: string | null }) {
  if (!difficulty) return null;
  const dot: Record<string, string> = {
    Beginner: "bg-green-400", Intermediate: "bg-blue-400", Advanced: "bg-orange-400", Expert: "bg-red-500",
  };
  return (
    <span className="flex items-center gap-1 shrink-0">
      <span className={cn("w-1.5 h-1.5 rounded-full", dot[difficulty] ?? "bg-muted")} />
      <span className="text-xs text-muted-foreground">{difficulty}</span>
    </span>
  );
}

function Avatar({ name, avatarUrl, size = "md" }: { name: string | null; avatarUrl: string | null; size?: "sm" | "md" }) {
  const initials = name ? name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "?";
  const cls = size === "sm" ? "w-7 h-7 text-[10px]" : "w-9 h-9 text-xs";
  return (
    <div className={cn("rounded-full bg-primary/10 border-2 border-background flex items-center justify-center overflow-hidden shrink-0 shadow-sm", cls)}>
      {avatarUrl
        ? <img src={avatarUrl} alt={name ?? ""} className="w-full h-full object-cover" />
        : <span className="font-semibold text-primary/70">{initials}</span>}
    </div>
  );
}

function PopularityBar({ count, max }: { count: number; max: number }) {
  const pct = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 4;
  return (
    <div className="w-full h-1 bg-muted rounded-full overflow-hidden mt-2">
      <div className="h-full bg-primary/50 rounded-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

function VideoThumbnail({ videoId, title, artist, type, onClick }: VideoEntry & { onClick: () => void }) {
  const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const typeColor: Record<string, string> = {
    Performance: "bg-rose-100 text-rose-700",
    Analysis: "bg-blue-100 text-blue-700",
    Masterclass: "bg-amber-100 text-amber-700",
  };
  return (
    <button
      onClick={onClick}
      className="group w-full text-left focus:outline-none"
    >
      <div className="relative rounded-lg overflow-hidden mb-2 aspect-video bg-stone-800">
        <img
          src={thumbUrl}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            <Play className="w-4 h-4 text-stone-900 ml-0.5" fill="currentColor" />
          </div>
        </div>
        <span className={cn("absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full", typeColor[type])}>
          {type}
        </span>
      </div>
      <p className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{artist}</p>
    </button>
  );
}

function VideoPlayerModal({ videoId, onClose }: { videoId: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-black border-none">
        <div className="aspect-video w-full">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

const currentUserId = () => localStorage.getItem("userId") || "";

export default function ComposerPage() {
  const params = useParams<{ id: string }>();
  const composerId = params.id ? parseInt(params.id) : 0;
  const userId = currentUserId();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"studied" | "az">("studied");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  // ── queries ──
  const { data: composer, isLoading } = useQuery({
    queryKey: ["/api/composers", composerId],
    queryFn: async () => { const r = await fetch(`/api/composers/${composerId}`); return r.ok ? r.json() : null; },
    enabled: !!composerId,
  });
  const { data: community } = useQuery({
    queryKey: ["/api/composers", composerId, "community"],
    queryFn: async () => { const r = await fetch(`/api/composers/${composerId}/community`); return r.ok ? r.json() : null; },
    enabled: !!composerId,
  });
  const { data: allPieces = [] } = useQuery<any[]>({
    queryKey: ["/api/composers", composerId, "pieces"],
    queryFn: async () => { const r = await fetch(`/api/composers/${composerId}/pieces`); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : []; },
    enabled: !!composerId,
  });
  const { data: members = [] } = useQuery<any[]>({
    queryKey: ["/api/composers", composerId, "members"],
    queryFn: async () => { const r = await fetch(`/api/composers/${composerId}/members`); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : []; },
    enabled: !!composerId,
  });
  const { data: realActivity = [] } = useQuery<any[]>({
    queryKey: ["/api/composers", composerId, "activity"],
    queryFn: async () => { const r = await fetch(`/api/composers/${composerId}/activity`); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : []; },
    enabled: !!composerId,
  });
  const { data: followStatus, isLoading: followLoading } = useQuery({
    queryKey: ["/api/composers", composerId, "follow-status", userId],
    queryFn: async () => { if (!userId) return { following: false }; const r = await fetch(`/api/composers/${composerId}/follow-status?userId=${userId}`); return r.ok ? r.json() : { following: false }; },
    enabled: !!composerId && !!userId,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      const method = followStatus?.following ? "DELETE" : "POST";
      const r = await fetch(`/api/composers/${composerId}/follow`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/composers", composerId] }),
  });

  // ── derived ──
  const filteredPieces = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? allPieces.filter((p: any) => p.title.toLowerCase().includes(q)) : allPieces;
    return [...filtered].sort((a: any, b: any) =>
      sortOrder === "az" ? a.title.localeCompare(b.title) : (b.learnerCount ?? 0) - (a.learnerCount ?? 0)
    );
  }, [allPieces, search, sortOrder]);

  const maxLearners = useMemo(() => allPieces.reduce((m: number, p: any) => Math.max(m, p.learnerCount ?? 0), 0), [allPieces]);

  const featuredPiece = useMemo(() => {
    if (community?.mostPopularPiece) return allPieces.find((p: any) => p.id === community.mostPopularPiece.id) ?? allPieces[0] ?? null;
    return allPieces[0] ?? null;
  }, [allPieces, community]);

  // ── activity: real data first, pad with stubs ──
  const displayActivity = useMemo(() => {
    if (realActivity.length >= 4) return { items: realActivity.slice(0, 8), isReal: true };
    return { items: MOCK_ACTIVITY, isReal: false };
  }, [realActivity]);

  // ── YouTube: look up by last name, then first word, then fallback ──
  const youtubeVideos = useMemo(() => {
    if (!composer) return null;
    const lastName = composer.name.split(" ").slice(-1)[0];
    const firstWord = composer.name.split(" ")[0];
    return YOUTUBE_VIDEOS[lastName] ?? YOUTUBE_VIDEOS[firstWord] ?? null;
  }, [composer]);

  if (isLoading) return <Layout><div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div></Layout>;
  if (!composer) return <Layout><div className="min-h-screen flex items-center justify-center text-muted-foreground">Composer not found.</div></Layout>;

  const era = getEra(composer.birthYear);
  const isFollowing = followStatus?.following ?? false;
  const lifeDates = composer.birthYear && composer.deathYear
    ? `${composer.birthYear}–${composer.deathYear}`
    : composer.birthYear ? `b. ${composer.birthYear}` : null;

  return (
    <Layout>
      <div className="min-h-screen bg-background">

        {/* ── VIDEO MODAL ─── */}
        {activeVideoId && <VideoPlayerModal videoId={activeVideoId} onClose={() => setActiveVideoId(null)} />}

        {/* ── HERO ──────────────────────────────────────────────────── */}
        <div className="bg-stone-900 text-stone-100">
          <div className="container mx-auto px-4 max-w-5xl pt-6 pb-10">
            <Link href="/search">
              <Button variant="ghost" size="sm" className="mb-6 text-stone-400 hover:text-white hover:bg-stone-800 -ml-2 group">
                <ArrowLeft className="w-4 h-4 mr-1.5 transition-transform group-hover:-translate-x-1" /> Back
              </Button>
            </Link>

            <div className="flex flex-col sm:flex-row items-start gap-8">
              {/* Portrait */}
              <div className="shrink-0">
                {composer.imageUrl ? (
                  <img src={composer.imageUrl} alt={composer.name}
                    className="w-28 h-28 sm:w-40 sm:h-40 rounded-2xl object-cover shadow-2xl border border-stone-700" />
                ) : (
                  <div className="w-28 h-28 sm:w-40 sm:h-40 rounded-2xl bg-gradient-to-br from-stone-700 to-stone-800 flex items-center justify-center shadow-2xl border border-stone-600">
                    <span className="font-serif text-5xl font-bold text-stone-400 select-none">
                      {composer.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {era && <span className={cn("text-xs font-semibold px-2.5 py-0.5 rounded-full", ERA_COLOR[era])}>{era}</span>}
                  {composer.nationality && <span className="text-xs text-stone-400 font-medium">{composer.nationality}</span>}
                  {lifeDates && <span className="text-xs text-stone-500">{lifeDates}</span>}
                </div>

                <h1 className="font-serif text-4xl sm:text-5xl font-bold text-white leading-tight mb-3">
                  {composer.name}
                </h1>

                {composer.bio
                  ? <p className="text-stone-300 text-sm leading-relaxed max-w-xl mb-5">{composer.bio}</p>
                  : <p className="text-stone-600 text-sm italic mb-5">No biography added yet.</p>}

                {/* Stat row + follow */}
                <div className="flex flex-wrap items-center gap-4">
                  {userId && (
                    <Button
                      size="sm"
                      variant={isFollowing ? "outline" : "default"}
                      className={isFollowing
                        ? "border-stone-500 text-stone-200 hover:bg-stone-800"
                        : "bg-white text-stone-900 hover:bg-stone-100"}
                      onClick={() => followMutation.mutate()}
                      disabled={followMutation.isPending || followLoading}
                    >
                      {isFollowing ? "Following" : "+ Follow"}
                    </Button>
                  )}
                  <div className="flex items-center gap-4 text-sm">
                    {[
                      { val: community?.followerCount ?? 0, label: "followers" },
                      { val: community?.activeLearners ?? 0, label: "studying" },
                      { val: allPieces.length, label: "pieces" },
                    ].map(({ val, label }) => (
                      <span key={label} className="text-stone-400">
                        <span className="font-semibold text-stone-200 mr-1">{val}</span>{label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── ACTIVITY STRIP (horizontal scroll) ──────────────────── */}
        <div className="border-b border-border bg-card">
          <div className="container mx-auto px-4 max-w-5xl py-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Community activity
              </span>
              {!displayActivity.isReal && (
                <span className="text-[10px] text-muted-foreground/60 font-medium ml-1">(example)</span>
              )}
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
              {displayActivity.items.map((item: any, i: number) => {
                const isReal = displayActivity.isReal;
                const type: ActivityType = isReal ? (item.postType === "recording" ? "recording" : "status") : item.type;
                const cfg = ACTIVITY_CONFIG[type];
                const Icon = cfg.icon;
                const name = isReal ? (item.displayName ?? "A member") : item.displayName;
                const text = isReal
                  ? <><span className="text-muted-foreground">{item.content}</span></>
                  : <span className="text-muted-foreground">{activityText(item as any)}</span>;
                const time = isReal
                  ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })
                  : (item as any).timeAgo;

                return (
                  <div
                    key={i}
                    className={cn(
                      "shrink-0 w-56 rounded-xl border-l-4 bg-muted/30 border border-border p-3 hover:bg-muted/60 transition-colors",
                      cfg.border
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0", cfg.iconBg)}>
                        <Icon className={cn("w-3 h-3", cfg.iconColor)} />
                      </div>
                      <span className="text-xs font-semibold truncate">{name}</span>
                    </div>
                    <p className="text-xs leading-snug line-clamp-2">{text}</p>
                    <p className="text-[10px] text-muted-foreground mt-1.5">{time}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── BODY ─────────────────────────────────────────────────── */}
        <div className="container mx-auto px-4 max-w-5xl py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

            {/* ── MAIN (2/3) ──────────────────────────────────── */}
            <div className="lg:col-span-2 space-y-8">

              {/* Featured piece */}
              {featuredPiece && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Most studied</span>
                  </div>
                  <Link href={`/piece/${featuredPiece.id}`}>
                    <Card className="border-primary/25 bg-gradient-to-r from-primary/5 to-transparent hover:from-primary/10 hover:shadow-md transition-all cursor-pointer group">
                      <CardContent className="p-5 flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-serif text-xl font-semibold group-hover:text-primary transition-colors mb-1.5">{featuredPiece.title}</p>
                          <div className="flex flex-wrap items-center gap-3">
                            {featuredPiece.keySignature && <span className="text-xs text-muted-foreground">{featuredPiece.keySignature}</span>}
                            {featuredPiece.yearComposed && <span className="text-xs text-muted-foreground">{featuredPiece.yearComposed}</span>}
                            <DifficultyDot difficulty={featuredPiece.difficulty} />
                            {featuredPiece.imslpUrl && (
                              <a href={featuredPiece.imslpUrl} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                                onClick={e => e.stopPropagation()}>
                                <ExternalLink className="w-3 h-3" /> IMSLP
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                            <Users className="w-3 h-3" />
                            <span>{featuredPiece.learnerCount} members currently learning</span>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      </CardContent>
                    </Card>
                  </Link>
                </div>
              )}

              {/* Catalog */}
              <div>
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Music2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Catalog
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {filteredPieces.length < allPieces.length
                        ? `${filteredPieces.length} of ${allPieces.length}`
                        : allPieces.length}
                    </span>
                  </div>
                  {/* Sort toggle */}
                  <div className="flex gap-1 shrink-0">
                    {(["studied", "az"] as const).map(opt => (
                      <button
                        key={opt}
                        onClick={() => setSortOrder(opt)}
                        className={cn(
                          "text-xs px-3 py-1.5 rounded-full font-medium transition-colors",
                          sortOrder === opt
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        )}
                      >
                        {opt === "studied" ? "Most studied" : "A–Z"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder={`Search ${allPieces.length} pieces…`}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>

                {filteredPieces.length === 0 ? (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    No pieces match "{search}"
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredPieces.map((piece: any) => (
                      <Link key={piece.id} href={`/piece/${piece.id}`}>
                        <Card className="cursor-pointer hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group h-full">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium text-sm leading-snug group-hover:text-primary transition-colors">{piece.title}</p>
                              {piece.learnerCount > 0 && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0 mt-0.5">
                                  <Users className="w-3 h-3" />{piece.learnerCount}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                              {piece.keySignature && <span className="text-xs text-muted-foreground">{piece.keySignature}</span>}
                              {piece.yearComposed && <span className="text-xs text-muted-foreground">{piece.yearComposed}</span>}
                              <DifficultyDot difficulty={piece.difficulty} />
                            </div>
                            <PopularityBar count={piece.learnerCount ?? 0} max={maxLearners} />
                            {piece.imslpUrl && (
                              <a href={piece.imslpUrl} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-2 w-fit"
                                onClick={e => e.stopPropagation()}>
                                <ExternalLink className="w-3 h-3" /> Sheet music
                              </a>
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── SIDEBAR (1/3) — sticky ───────────────────── */}
            <div className="space-y-6 lg:sticky lg:top-6">

              {/* Members */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Members studying</span>
                </div>
                <Card className="border-none shadow-sm">
                  <CardContent className="p-4">
                    {members.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-3">
                        <UserCircle2 className="w-7 h-7 text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground text-center">No members yet. Add a piece to appear here.</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {members.slice(0, 12).map((m: any) => (
                            <Link key={m.userId} href={`/user/${m.userId}`}>
                              <div title={m.displayName ?? m.userId}><Avatar name={m.displayName} avatarUrl={m.avatarUrl} /></div>
                            </Link>
                          ))}
                          {members.length > 12 && (
                            <div className="w-9 h-9 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs text-muted-foreground font-medium">
                              +{members.length - 12}
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {members.length} member{members.length !== 1 ? "s" : ""} {members.length === 1 ? "has" : "have"} this composer in their repertoire
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Community snapshot */}
              {community && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Snapshot</span>
                  </div>
                  <Card className="border-none shadow-sm">
                    <CardContent className="p-4 space-y-2.5">
                      {[
                        { label: "Followers", val: community.followerCount },
                        { label: "Actively learning", val: community.activeLearners },
                        { label: "Pieces in catalog", val: allPieces.length },
                      ].map(({ label, val }) => (
                        <div key={label} className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">{label}</span>
                          <span className="text-sm font-semibold">{val}</span>
                        </div>
                      ))}
                      {community.mostPopularPiece && (
                        <div className="pt-2 border-t border-border">
                          <p className="text-xs text-muted-foreground mb-1">Top piece</p>
                          <Link href={`/piece/${community.mostPopularPiece.id}`}>
                            <p className="text-sm font-medium hover:text-primary transition-colors cursor-pointer leading-snug">
                              {community.mostPopularPiece.title}
                            </p>
                          </Link>
                          <p className="text-xs text-muted-foreground">{community.mostPopularPiece.learnerCount} learners</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* YouTube */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Youtube className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Top recordings</span>
                </div>
                {youtubeVideos ? (
                  <div className="space-y-5">
                    {youtubeVideos.map(v => (
                      <VideoThumbnail
                        key={v.videoId}
                        {...v}
                        onClick={() => setActiveVideoId(v.videoId)}
                      />
                    ))}
                  </div>
                ) : (
                  <Card className="border-none shadow-sm">
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground italic mb-3">Curated recordings coming for this composer.</p>
                      <a
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(composer.name + " piano")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary flex items-center gap-1 hover:underline"
                      >
                        <ArrowUpRight className="w-3 h-3" /> Search on YouTube
                      </a>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Reddit */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Discussions</span>
                </div>
                <Card className="border-none shadow-sm">
                  <CardContent className="p-4 space-y-4">
                    {[
                      { sub: "r/piano",        title: `Best recordings of ${composer.name.split(" ").slice(-1)[0]}?`,    votes: 847, comments: 134 },
                      { sub: "r/classicalmusic", title: `${composer.name.split(" ").slice(-1)[0]}'s influence on the Romantic era`, votes: 512, comments: 89 },
                      { sub: "r/piano",        title: `Tips for performing ${composer.name.split(" ").slice(-1)[0]} convincingly`, votes: 291, comments: 47 },
                    ].map((post, i) => (
                      <a
                        key={i}
                        href={`https://www.reddit.com/search/?q=${encodeURIComponent(composer.name)}+piano`}
                        target="_blank"
                        rel="noopener noreferrer"
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
