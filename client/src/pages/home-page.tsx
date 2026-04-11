import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Edit2, Music2, X, ExternalLink, ChevronDown, ChevronUp,
  Layers, Music, BookOpen, ArrowUpRight, Flag, CheckCircle2,
  SplitSquareHorizontal, Merge, Calendar, Clock, ArrowRight, Trash2, Upload,
  GraduationCap,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AddPieceDialog, type NewPieceData } from "@/components/add-piece-dialog";
import { EditMovementsDialog } from "@/components/edit-movements-dialog";
import { MilestoneTimeline } from "@/components/milestone-timeline";
import { LearningPlanWizard } from "@/components/learning-plan-wizard";
import { ContributeScoreWizard } from "@/components/contribute-score-wizard";
import { DailyLessonCard } from "@/components/daily-lesson-card";
import { cn, toComposerImageUrl } from "@/lib/utils";
import { getStatusColor, STATUSES, type RepertoireStatus } from "@/lib/status-colors";
import { getProgressColor, HIGHLIGHT } from "@/lib/palette";
import { Link, useLocation } from "wouter";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, horizontalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ALL_STATUSES = [...STATUSES];
const ACTIVE_STATUSES = new Set(["Up next", "In Progress", "Maintaining"]);

const COMPOSER_ERA_MAP: Record<string, string> = {
  Bach: "Baroque", Handel: "Baroque", Vivaldi: "Baroque", Telemann: "Baroque", Scarlatti: "Baroque", Purcell: "Baroque",
  Haydn: "Classical", Mozart: "Classical", Clementi: "Classical", Dussek: "Classical",
  Beethoven: "Classical", Hummel: "Classical",
  Schubert: "Romantic", Chopin: "Romantic", Schumann: "Romantic", Mendelssohn: "Romantic",
  Liszt: "Romantic", Brahms: "Romantic", Tchaikovsky: "Romantic", Rachmaninoff: "Romantic",
  Grieg: "Romantic", Dvorak: "Romantic", Franck: "Romantic",
  Debussy: "Impressionist", Ravel: "Impressionist", Satie: "Impressionist", Faure: "Impressionist",
  Prokofiev: "Modern", Bartók: "Modern", Shostakovich: "Modern", Messiaen: "Modern",
  Stravinsky: "Modern", Scriabin: "Modern", Hindemith: "Modern", Copland: "Modern",
  Medtner: "Romantic", Mussorgsky: "Romantic", Balakirev: "Romantic",
};

const COMPOSER_COVER_GOLD = "#DCCAA6";
const COMPOSER_GOLD_GRADIENT = "from-[#EADDC8] to-[#C8B388]";

const STATUS_PROGRESS: Record<string, number> = {
  "Want to learn": 0, "Up next": 12, "In Progress": 50,
  "Maintaining": 100, "Resting": 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Movement = {
  name: string;
  entryId: number;
  status: string;
  movementId?: number | null;
  everMilestone?: "completed" | "performed" | null;
  performedCount?: number;
};

type PieceEntry = {
  pieceId: number;
  pieceTitle: string;
  composerId: number;
  composerName: string;
  status: RepertoireStatus;
  startedDate: string | null;
  movements: Movement[];
  primaryEntryId: number;
  currentCycle: number;
  hasStartedMilestone: boolean;
  everMilestone: "completed" | "performed" | null;
  performedCount: number;
};

type ComposerGroup = {
  composerName: string;
  composerId: number;
  era: string;
  imageUrl?: string | null;
  period?: string | null;
  birthYear?: number | null;
  deathYear?: number | null;
  pieces: PieceEntry[];
  learningCount: number;
  startedCount: number;
  inProgressCount: number;
  completedCount: number;
  learnedCount: number;
  totalCount: number;
};

/** Single entry when piece is split (one row per movement) */
type EntryRow = {
  entryId: number;
  pieceId: number;
  pieceTitle: string;
  composerId: number;
  composerName: string;
  movementId: number | null;
  movementName: string | null;
  status: RepertoireStatus;
  startedDate: string | null;
  currentCycle: number;
  hasStartedMilestone: boolean;
  everMilestone: "completed" | "performed" | null;
  performedCount: number;
};

/** Table row: either merged piece (expandable) or single split entry */
type TableRowItem =
  | { kind: "piece"; piece: PieceEntry }
  | { kind: "entry"; entry: EntryRow };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getEra(name: string): string {
  const last = name.split(" ").slice(-1)[0];
  return COMPOSER_ERA_MAP[last] ?? "Other";
}

function getLastName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : name;
}

function textColorForBackground(hex: string): string {
  const cleaned = hex.replace("#", "");
  const normalized = cleaned.length === 3
    ? cleaned.split("").map((c) => `${c}${c}`).join("")
    : cleaned;
  if (normalized.length !== 6) return "#1C1C1A";
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "#1C1C1A";
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.56 ? "#1C1C1A" : "#F4F1EA";
}

function toYear(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function groupByComposer(raw: any[], movementOrderByPiece?: Record<number, number[]>): ComposerGroup[] {
  const composerMeta = new Map<number, { imageUrl: string | null; period: string | null; birthYear: number | null; deathYear: number | null }>();
  for (const entry of raw) {
    if (!composerMeta.has(entry.composerId)) {
      const imageUrl = (entry as any).composer_image_url ?? (entry as any).composerImageUrl ?? (entry as any).image_url ?? null;
      const period = (entry as any).composer_period ?? (entry as any).composerPeriod ?? null;
      const birthYear = toYear((entry as any).composer_birth_year ?? (entry as any).composerBirthYear);
      const deathYear = toYear((entry as any).composer_death_year ?? (entry as any).composerDeathYear);
      composerMeta.set(entry.composerId, {
        imageUrl: imageUrl != null && String(imageUrl).trim() ? String(imageUrl).trim() : null,
        period: period != null && String(period).trim() ? String(period).trim() : null,
        birthYear,
        deathYear,
      });
    }
  }
  const pieceMap = new Map<number, PieceEntry>();
  for (const entry of raw) {
    if (!pieceMap.has(entry.pieceId)) {
      pieceMap.set(entry.pieceId, {
        pieceId: entry.pieceId, pieceTitle: entry.pieceTitle,
        composerId: entry.composerId, composerName: entry.composerName,
        status: entry.status, startedDate: entry.startedDate || null,
        movements: [], primaryEntryId: entry.id,
        currentCycle: Number.isInteger(entry.currentCycle) ? entry.currentCycle : 1,
        hasStartedMilestone: Boolean((entry as any).hasStartedMilestone),
        everMilestone: entry.everMilestone === "performed" || entry.everMilestone === "completed"
          ? entry.everMilestone
          : null,
        performedCount: Number((entry as any).performedCount ?? 0) || 0,
      });
    }
    const piece = pieceMap.get(entry.pieceId)!;
    if (Boolean((entry as any).hasStartedMilestone)) {
      piece.hasStartedMilestone = true;
    }
    if (entry.movementName && !piece.movements.find((m) => m.entryId === entry.id)) {
      const movementId = (entry as any).movementId ?? null;
      piece.movements.push({
        name: entry.movementName,
        entryId: entry.id,
        status: entry.status,
        movementId,
        everMilestone: (entry as any).movementEverMilestone ?? null,
        performedCount: Number((entry as any).movementPerformedCount ?? 0) || 0,
      });
    }
  }
  const orderByPiece = movementOrderByPiece ?? {};
  for (const piece of Array.from(pieceMap.values())) {
    const order = orderByPiece[piece.pieceId];
    if (order && order.length > 0) {
      piece.movements.sort((a, b) => {
        const ai = a.movementId != null ? order.indexOf(a.movementId) : -1;
        const bi = b.movementId != null ? order.indexOf(b.movementId) : -1;
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    }
  }
  const composerMap = new Map<number, ComposerGroup>();
  for (const piece of Array.from(pieceMap.values())) {
    if (!composerMap.has(piece.composerId)) {
      const meta = composerMeta.get(piece.composerId);
      composerMap.set(piece.composerId, {
        composerName: piece.composerName, composerId: piece.composerId,
        era: getEra(piece.composerName), pieces: [],
        imageUrl: meta?.imageUrl ?? null, period: meta?.period ?? null,
        birthYear: meta?.birthYear ?? null, deathYear: meta?.deathYear ?? null,
        learningCount: 0, startedCount: 0, inProgressCount: 0, completedCount: 0, learnedCount: 0, totalCount: 0,
      });
    }
    const group = composerMap.get(piece.composerId)!;
    group.pieces.push(piece);
    group.totalCount++;
    if (ACTIVE_STATUSES.has(piece.status)) group.learningCount++;
    if (piece.hasStartedMilestone) group.startedCount++;
    if (piece.status === "In Progress") group.inProgressCount++;
    if (piece.everMilestone === "completed" || piece.everMilestone === "performed") group.completedCount++;
    if (piece.everMilestone === "completed" || piece.everMilestone === "performed") group.learnedCount++;
  }
  return Array.from(composerMap.values()).sort((a, b) => b.totalCount - a.totalCount);
}

function toEntryRow(e: any): EntryRow {
  return {
    entryId: e.id,
    pieceId: e.pieceId,
    pieceTitle: e.pieceTitle,
    composerId: e.composerId,
    composerName: e.composerName,
    movementId: e.movementId ?? null,
    movementName: e.movementName ?? null,
    status: e.status,
    startedDate: e.startedDate || null,
    currentCycle: Number.isInteger(e.currentCycle) ? e.currentCycle : 1,
    hasStartedMilestone: Boolean((e as any).hasStartedMilestone),
    everMilestone: e.everMilestone === "performed" || e.everMilestone === "completed" ? e.everMilestone : null,
    performedCount: Number((e as any).performedCount ?? 0) || 0,
  };
}

function buildTableRows(raw: any[], allPieces: PieceEntry[]): TableRowItem[] {
  const byPiece = new Map<number, any[]>();
  for (const e of raw) {
    const list = byPiece.get(e.pieceId) ?? [];
    list.push(e);
    byPiece.set(e.pieceId, list);
  }
  const items: TableRowItem[] = [];
  Array.from(byPiece.entries()).forEach(([pieceId, entries]) => {
    const anySplit = entries.some((e: any) => e.splitView === true);
    if (anySplit) {
      for (const e of entries) {
        items.push({ kind: "entry", entry: toEntryRow(e) });
      }
    } else {
      const piece = allPieces.find((p) => p.pieceId === pieceId);
      if (piece) items.push({ kind: "piece", piece });
    }
  });
  return items;
}

function buildImslpUrl(title: string, composerName: string) {
  const last = composerName.split(" ").slice(-1)[0];
  return `https://imslp.org/wiki/Special:Search/${encodeURIComponent(title + " " + last)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ActivePlanCard — one card per in-progress learning plan
// ─────────────────────────────────────────────────────────────────────────────

function ActivePlanCard({ entryId, pieceTitle, composerName }: {
  entryId: number;
  pieceTitle: string;
  composerName: string;
}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmDeletePlan, setConfirmDeletePlan] = useState(false);

  const { data: plan } = useQuery<{ id: number; dailyPracticeMinutes: number; targetCompletionDate: string; totalMeasures: number; status: string } | null>({
    queryKey: [`/api/learning-plans/entry/${entryId}`],
    staleTime: 60_000,
  });

  const { data: progress } = useQuery<{ completedLessons: number; totalLessons: number; learnedMeasures: number; totalMeasures: number }>({
    queryKey: [`/api/learning-plans/${plan?.id}/progress`],
    enabled: !!plan?.id,
    staleTime: 30_000,
  });

  const { data: lessons } = useQuery<Array<{ id: number; status: string; scheduledDate: string }>>({
    queryKey: [`/api/learning-plans/${plan?.id}/lessons`],
    enabled: !!plan?.id,
    staleTime: 30_000,
  });

  const deletePlan = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/learning-plans/${id}`);
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: [`/api/learning-plans/${id}/today`] });
      queryClient.removeQueries({ queryKey: [`/api/learning-plans/${id}/progress`] });
      queryClient.removeQueries({ queryKey: [`/api/learning-plans/${id}/lessons`] });
      queryClient.removeQueries({ queryKey: [`/api/learning-plans/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/entry/${entryId}`] });
      setConfirmDeletePlan(false);
      toast({ title: "Learning plan deleted" });
    },
    onError: () => {
      toast({ title: "Couldn't delete plan", variant: "destructive" });
    },
  });

  if (!plan) return null;

  const nextLesson = lessons?.find(l => l.status !== "completed");
  const completedLessons = progress?.completedLessons ?? 0;
  const totalLessons = progress?.totalLessons ?? 0;
  const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = plan.targetCompletionDate ? new Date(plan.targetCompletionDate) : null;
  const daysLeft = target ? Math.ceil((target.getTime() - today.getTime()) / 86400000) : null;

  return (
    <Card className="border border-border bg-card shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate">{composerName}</p>
            <h3 className="font-serif text-lg font-semibold leading-tight mt-0.5 line-clamp-1">{pieceTitle}</h3>
          </div>
          <div className="shrink-0 flex items-center gap-1">
          {daysLeft !== null && (
            <span className={cn(
              "shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1",
              daysLeft < 0 ? "bg-destructive/10 text-destructive" :
              daysLeft <= 7 ? "bg-amber-100 text-amber-700" :
              "bg-muted text-muted-foreground"
            )}>
              <Calendar className="w-3 h-3" />
              {daysLeft < 0 ? "Overdue" : daysLeft === 0 ? "Due today" : `${daysLeft}d left`}
            </span>
          )}
            <button
              type="button"
              onClick={() => setConfirmDeletePlan(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete learning plan"
              aria-label="Delete learning plan"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <AlertDialog open={confirmDeletePlan} onOpenChange={setConfirmDeletePlan}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this learning plan?</AlertDialogTitle>
              <AlertDialogDescription>
                Remove the schedule and progress for &ldquo;{pieceTitle}&rdquo;. The piece stays in repertoire. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deletePlan.mutate(plan.id)}
                disabled={deletePlan.isPending}
              >
                {deletePlan.isPending ? "Deleting…" : "Delete plan"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{completedLessons} of {totalLessons} sessions</span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>

        {plan.dailyPracticeMinutes && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mb-3">
            <Clock className="w-3 h-3" />
            {plan.dailyPracticeMinutes} min/day
          </p>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs gap-1"
            onClick={() => navigate(`/plan/${plan.id}`)}
          >
            View Plan
          </Button>
          {nextLesson && (
            <Button
              size="sm"
              className="flex-1 h-8 text-xs gap-1 bg-primary"
              onClick={() => navigate(`/session/${nextLesson.id}`)}
            >
              Next Session <ArrowRight className="w-3 h-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ComposerBook card
// ─────────────────────────────────────────────────────────────────────────────

function ComposerBook({ group, isActive, onClick }: {
  group: ComposerGroup;
  isActive: boolean;
  onClick: () => void;
}) {
  const coverTextColor = textColorForBackground(COMPOSER_COVER_GOLD);
  const initials = group.composerName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const learnedPct = group.totalCount > 0 ? Math.round((group.learnedCount / group.totalCount) * 100) : 0;
  const learnedBarColor = getProgressColor(learnedPct);
  const lastName = getLastName(group.composerName);
  const subtitleLabel =
    group.birthYear != null && group.deathYear != null
      ? `${group.birthYear}–${group.deathYear}`
      : group.birthYear != null
        ? `b. ${group.birthYear}`
        : (group.period ?? group.era ?? "");
  const resolvedImageUrl = toComposerImageUrl(group.imageUrl) || group.imageUrl || null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className={cn(
        "relative shrink-0 w-[148px] rounded-[22px] transition-all duration-200 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer select-none hover:-translate-y-1",
        isActive && "-translate-y-1"
      )}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[22px] border-2 border-[#D6D1C7] bg-[#E9E5DC] translate-x-1.5 translate-y-1" aria-hidden />
      <div className="pointer-events-none absolute inset-0 rounded-[22px] border-2 border-[#D6D1C7] bg-[#F0EBE2] translate-x-0.5 translate-y-px" aria-hidden />
      <div
        className={cn(
          "relative rounded-[22px] border-2 border-[#1C1C1A]/20 shadow-lg overflow-hidden",
          isActive && "ring-2 ring-primary shadow-xl"
        )}
        style={{ backgroundColor: COMPOSER_COVER_GOLD }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#C8B388]/45" aria-hidden />
        <div className="relative px-3 pt-3 pb-2">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top,_white,_transparent)]" />
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/15 to-transparent" />
          <div className="relative z-10">
            <p className="font-serif text-[20px] leading-none tracking-tight pr-4 whitespace-nowrap" style={{ color: coverTextColor }}>{lastName}</p>
            <p className="text-[9px] uppercase tracking-[0.16em] mt-0.5 truncate" style={{ color: coverTextColor, opacity: 0.84 }}>{subtitleLabel}</p>
          </div>
          <div className="relative z-10 mt-2 flex justify-center">
            <div className="relative h-[64px] w-[64px] shrink-0 rounded-[2px] border-2 border-[#1C1C1A]/25 overflow-hidden bg-black/5">
              <div className={cn("absolute inset-0 flex items-center justify-center bg-gradient-to-b", COMPOSER_GOLD_GRADIENT)}>
                <span className="relative font-serif text-2xl font-bold text-white/90 drop-shadow-md">{initials}</span>
              </div>
              {resolvedImageUrl && (
                <img src={resolvedImageUrl} alt={group.composerName} className="absolute inset-0 w-full h-full object-cover object-top" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
            </div>
          </div>
          <div className="relative z-10 mt-2">
            <div className="flex items-center justify-between text-[9px] font-semibold">
              <span style={{ color: coverTextColor, opacity: 0.9 }}>Learned</span>
              <span style={{ color: coverTextColor, opacity: 0.9 }}>{group.learnedCount}/{group.totalCount} ({learnedPct}%)</span>
            </div>
            <div className="mt-0.5 h-1 rounded-full bg-black/20 overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${learnedPct}%`, backgroundColor: learnedBarColor }} />
            </div>
            <div className="flex items-center gap-1 mt-1">
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold" style={{ color: coverTextColor, opacity: 0.9 }}><Flag className="w-2.5 h-2.5" />{group.startedCount}</span>
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold" style={{ color: coverTextColor, opacity: 0.9 }}><CheckCircle2 className="w-2.5 h-2.5" />{group.completedCount}</span>
              <span className="text-[9px] font-semibold ml-auto" style={{ color: coverTextColor, opacity: 0.9 }}>{group.totalCount} pcs</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableComposerBook({ group, isActive, onClick }: {
  group: ComposerGroup;
  isActive: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.composerId });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition: isDragging ? undefined : transition }}
      className={cn("touch-none cursor-grab active:cursor-grabbing", isDragging && "opacity-40 z-50")}
      {...attributes}
      {...listeners}
    >
      <ComposerBook group={group} isActive={isActive} onClick={onClick} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ComposerSidePane
// ─────────────────────────────────────────────────────────────────────────────

function PieceThumbnail({ pieceTitle }: { pieceTitle: string }) {
  return (
    <div className={cn("w-12 h-12 rounded shrink-0 relative overflow-hidden flex items-center justify-center bg-gradient-to-b shadow-sm", COMPOSER_GOLD_GRADIENT)}>
      <div className="absolute inset-x-1 space-y-[3px]">
        {[0,1,2,3,4].map(i => <div key={i} className="h-px bg-white/20" />)}
      </div>
      <span className="relative font-serif text-lg font-bold text-white/80">{pieceTitle[0]}</span>
    </div>
  );
}

function getItemStatus(item: TableRowItem): string {
  return item.kind === "piece" ? item.piece.status : item.entry.status;
}
function getItemKey(item: TableRowItem): string {
  return item.kind === "piece" ? `p-${item.piece.pieceId}` : `e-${item.entry.entryId}`;
}

function ComposerSidePane({ group, items, onClose, onOpenItem, onStatusChange, onRemove, onEditMovements }: {
  group: ComposerGroup;
  items: TableRowItem[];
  onClose: () => void;
  onOpenItem: (item: TableRowItem) => void;
  onStatusChange: (item: TableRowItem, status: string) => Promise<void>;
  onRemove: (item: TableRowItem) => Promise<void>;
  onEditMovements: (pieceId: number) => void;
}) {
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<TableRowItem | null>(null);
  const [localStatuses, setLocalStatuses] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    items.forEach((item) => { m[getItemKey(item)] = getItemStatus(item); });
    return m;
  });
  useEffect(() => {
    const m: Record<string, string> = {};
    items.forEach((item) => { m[getItemKey(item)] = getItemStatus(item); });
    setLocalStatuses(m);
  }, [items]);

  const sorted = [...items].sort((a, b) => {
    const order = ALL_STATUSES;
    return order.indexOf(getItemStatus(a) as RepertoireStatus) - order.indexOf(getItemStatus(b) as RepertoireStatus);
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/25 z-40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-[460px] bg-background border-l border-border z-50 overflow-y-auto shadow-2xl flex flex-col">
        <div className={cn("bg-gradient-to-b shrink-0 px-6 pt-8 pb-6", COMPOSER_GOLD_GRADIENT)}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white uppercase tracking-wider">{group.era}</span>
            </div>
            <div className="flex items-center gap-1">
              <Link href={`/composer/${group.composerId}`} onClick={onClose} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 transition-colors text-white text-[11px] font-medium">
                <ArrowUpRight className="w-3 h-3" />Composer page
              </Link>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20 transition-colors"><X className="w-4 h-4 text-white" /></button>
            </div>
          </div>
          <h2 className="font-serif text-3xl font-bold text-white leading-tight">{group.composerName}</h2>
          <div className="flex items-center gap-4 mt-3 text-white/70 text-sm">
            <span><span className="text-white font-semibold">{items.length}</span> pieces</span>
            <span><span className="text-white font-semibold">{group.learningCount}</span> learning</span>
            <span><span className="text-white font-semibold">{group.completedCount}</span> completed</span>
          </div>
        </div>
        <div className="flex-1 p-5 space-y-3">
          {sorted.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No pieces yet.</p>}
          {sorted.map((item) => {
            const key = getItemKey(item);
            const isPiece = item.kind === "piece";
            const piece = isPiece ? item.piece : null;
            const entry = !isPiece ? item.entry : null;
            const title = isPiece ? piece!.pieceTitle : (entry!.movementName ? `${entry!.pieceTitle} — ${entry!.movementName}` : entry!.pieceTitle);
            const status = localStatuses[key] ?? getItemStatus(item);
            const prog = STATUS_PROGRESS[status] ?? 0;
            const performedCount = isPiece ? piece!.performedCount : entry!.performedCount;
            const everMilestone = isPiece ? piece!.everMilestone : entry!.everMilestone;
            const pieceId = isPiece ? piece!.pieceId : entry!.pieceId;
            const composerName = isPiece ? piece!.composerName : entry!.composerName;
            return (
              <div key={key} className={cn("flex gap-3 p-3 rounded-xl border hover:bg-muted/30 transition-colors group relative overflow-hidden", performedCount > 0 && HIGHLIGHT.performedRow, everMilestone === "completed" && HIGHLIGHT.learnedRow, !everMilestone && performedCount === 0 && "border-border")}>
                {everMilestone && <div className={cn("absolute left-0 top-0 bottom-0 w-1.5", performedCount > 0 ? HIGHLIGHT.performedEdge : HIGHLIGHT.learnedEdge)} aria-hidden />}
                <PieceThumbnail pieceTitle={isPiece ? piece!.pieceTitle : entry!.pieceTitle} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-start gap-1.5 min-w-0">
                      {performedCount > 0 && <Music2 className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", HIGHLIGHT.performedMusicIcon)} />}
                      <button type="button" onClick={(e) => { e.stopPropagation(); onOpenItem(item); }} className="text-left">
                        <p className="text-sm font-semibold leading-snug hover:text-primary transition-colors cursor-pointer line-clamp-2">{title}</p>
                      </button>
                    </div>
                    {everMilestone && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={cn("inline-flex w-fit min-w-[84px] justify-center items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap", HIGHLIGHT.learnedPill)}>Learned</span>
                        {performedCount > 0 && <span className={cn("inline-flex w-fit min-w-[108px] justify-center items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap", HIGHLIGHT.performedPill)}>{performedCount > 1 ? `Performed x${performedCount}` : "Performed"}</span>}
                      </div>
                    )}
                    <button onClick={() => setConfirmRemoveItem(item)} className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-[#1C1C1A] shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  <Select value={status} onValueChange={(val) => { setLocalStatuses(prev => ({ ...prev, [key]: val })); onStatusChange(item, val); }}>
                    <SelectTrigger className={cn("h-7 text-xs font-medium border-none shadow-none focus:ring-0 px-2 w-auto max-w-[180px]", getStatusColor(status as RepertoireStatus))}><SelectValue /></SelectTrigger>
                    <SelectContent>{ALL_STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
                  </Select>
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${prog}%`, backgroundColor: getProgressColor(prog) }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{prog}% of journey</p>
                  {isPiece && piece!.movements.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {piece!.movements.slice(0, 4).map((m, i) => <span key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground truncate max-w-[120px]">{m.name}</span>)}
                      {piece!.movements.length > 4 && <span className="text-[10px] text-muted-foreground">+{piece!.movements.length - 4}</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <a href={buildImslpUrl(isPiece ? piece!.pieceTitle : entry!.pieceTitle, composerName)} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"><ExternalLink className="w-2.5 h-2.5" /> IMSLP</a>
                    {pieceId != null && Number.isInteger(pieceId) && <Link href={`/piece/${pieceId}`} onClick={onClose} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"><ArrowUpRight className="w-2.5 h-2.5" /> Open piece page</Link>}
                    {isPiece && piece!.movements.length > 0 && <button onClick={() => onEditMovements(piece!.pieceId)} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"><Layers className="w-2.5 h-2.5" /> Movements</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <AlertDialog open={confirmRemoveItem !== null} onOpenChange={(open) => { if (!open) setConfirmRemoveItem(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from repertoire?</AlertDialogTitle>
              <AlertDialogDescription>{confirmRemoveItem?.kind === "entry" ? "Remove this movement from your repertoire? This cannot be undone." : "This will remove the piece from your repertoire. This cannot be undone."}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { if (confirmRemoveItem) await onRemove(confirmRemoveItem); setConfirmRemoveItem(null); onClose(); }}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Repertoire Table rows
// ─────────────────────────────────────────────────────────────────────────────

function TableRow({ piece, expanded, onToggleExpand, onOpenPiece, onStatusChange, onRemove, onEditMovements, onSplit }: {
  piece: PieceEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenPiece: (piece: PieceEntry) => void;
  onStatusChange: (pieceId: number, status: string) => Promise<void>;
  onRemove: (pieceId: number) => Promise<void>;
  onEditMovements?: () => void;
  onSplit?: () => void;
}) {
  const [status, setStatus] = useState(piece.status);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const hasMovements = piece.movements.length > 0;

  return (
    <>
    <tr
      role="button"
      tabIndex={0}
      className={cn("group border-b border-border/50 transition-colors cursor-pointer relative", piece.performedCount > 0 ? HIGHLIGHT.performedRow : piece.everMilestone === "completed" ? HIGHLIGHT.learnedRow : "hover:bg-muted/20")}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenPiece(piece); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onOpenPiece(piece); } }}
    >
      <td className={cn("py-3 pl-4 pr-2", piece.performedCount > 0 && `border-l-[4px] ${HIGHLIGHT.performedBorder}`, piece.everMilestone === "completed" && `border-l-[4px] ${HIGHLIGHT.learnedBorder}`)}>
        <div className="flex flex-wrap items-center gap-1.5">
          {hasMovements && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onToggleExpand(); }} className="p-0.5 rounded hover:bg-muted/50 -m-0.5" aria-label={expanded ? "Collapse movements" : "Expand movements"}>
              {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          )}
          {piece.performedCount > 0 && <Music2 className={cn("w-3.5 h-3.5 shrink-0", HIGHLIGHT.performedMusicIcon)} />}
          <span className="text-sm font-medium hover:text-primary transition-colors line-clamp-1">{piece.pieceTitle}</span>
          {piece.everMilestone && (
            <>
              <span className={cn("inline-flex w-fit min-w-[84px] justify-center items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap", HIGHLIGHT.learnedPill)}>Learned</span>
              {piece.performedCount > 0 && <span className={cn("inline-flex w-fit min-w-[108px] justify-center items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap", HIGHLIGHT.performedPill)}>{piece.performedCount > 1 ? `Performed x${piece.performedCount}` : "Performed"}</span>}
            </>
          )}
        </div>
        {hasMovements && !expanded && <p className="text-[10px] text-muted-foreground mt-0.5">{piece.movements.length} movements</p>}
      </td>
      <td className="py-3 px-2"><span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{piece.composerName}</span></td>
      <td className="py-3 px-2">
        <div onClick={(e) => e.stopPropagation()}>
          <Select value={status} onValueChange={(val) => { setStatus(val as RepertoireStatus); onStatusChange(piece.pieceId, val); }}>
            <SelectTrigger className={cn("h-7 text-xs font-medium border-none shadow-none focus:ring-0 px-2 w-[160px]", getStatusColor(status))}><SelectValue /></SelectTrigger>
            <SelectContent>{ALL_STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </td>
      <td className="py-3 px-2 w-28">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${STATUS_PROGRESS[status] ?? 0}%`, backgroundColor: getProgressColor(STATUS_PROGRESS[status] ?? 0) }} />
        </div>
      </td>
      <td className="py-3 px-2"><span className="text-xs text-muted-foreground whitespace-nowrap">{piece.startedDate ? new Date(piece.startedDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—"}</span></td>
      <td className="py-3 px-2">
        <a href={buildImslpUrl(piece.pieceTitle, piece.composerName)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5 transition-colors whitespace-nowrap"><ExternalLink className="w-2.5 h-2.5" /> Score</a>
      </td>
      <td className="py-3 pr-4 pl-2">
        <button onClick={(e) => { e.stopPropagation(); setConfirmRemove(true); }} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-[#1C1C1A] rounded"><X className="w-3.5 h-3.5" /></button>
        <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from repertoire?</AlertDialogTitle>
              <AlertDialogDescription>Remove "{piece.pieceTitle}" from your repertoire? This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onRemove(piece.pieceId)}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
    {expanded && hasMovements && (
      <>
        {piece.movements.map((m) => {
          const mPerformed = m.performedCount ?? 0;
          return (
            <tr key={m.entryId} className={cn("border-b border-border/30 hover:bg-muted/10", mPerformed > 0 ? HIGHLIGHT.performedRow : m.everMilestone === "completed" ? HIGHLIGHT.learnedRow : "bg-muted/5")}>
              <td className={cn("py-2 pl-4 pr-2", mPerformed > 0 && `border-l-[3px] ${HIGHLIGHT.performedBorder}`, m.everMilestone === "completed" && mPerformed === 0 && `border-l-[3px] ${HIGHLIGHT.learnedBorder}`)}>
                <div className="flex items-center gap-1.5 pl-8">
                  {mPerformed > 0 && <Music2 className={cn("w-3 h-3 shrink-0", HIGHLIGHT.performedMusicIcon)} />}
                  <span className="text-xs text-muted-foreground">{m.name}</span>
                  {m.everMilestone && <span className={cn("inline-flex items-center text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full", HIGHLIGHT.learnedPill)}>Learned</span>}
                  {mPerformed > 0 && <span className={cn("inline-flex items-center text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full", HIGHLIGHT.performedPill)}>{mPerformed > 1 ? `Performed ×${mPerformed}` : "Performed"}</span>}
                </div>
              </td>
              <td className="py-2 px-2 text-xs text-muted-foreground">—</td>
              <td className="py-2 px-2" /><td className="py-2 px-2" /><td className="py-2 px-2" /><td className="py-2 px-2" /><td className="py-2 pr-4 pl-2" />
            </tr>
          );
        })}
        <tr className="border-b border-border/30 bg-muted/5">
          <td colSpan={7} className="py-2 pl-8 pr-4 flex flex-wrap items-center gap-3">
            {onEditMovements && <button type="button" onClick={(e) => { e.stopPropagation(); onEditMovements(); }} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"><Edit2 className="w-3 h-3" /> Edit movements</button>}
            {onSplit && <button type="button" onClick={(e) => { e.stopPropagation(); onSplit(); }} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"><SplitSquareHorizontal className="w-3 h-3" /> Split into separate pieces</button>}
          </td>
        </tr>
      </>
    )}
    </>
  );
}

function TableRowEntry({ entry, onOpenEntry, onStatusChange, onRemove, onRejoin }: {
  entry: EntryRow;
  onOpenEntry: (entry: EntryRow) => void;
  onStatusChange: (entryId: number, status: string) => Promise<void>;
  onRemove: (entryId: number) => Promise<void>;
  onRejoin: (pieceId: number) => Promise<void>;
}) {
  const [status, setStatus] = useState(entry.status);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const displayTitle = entry.movementName ? `${entry.pieceTitle} — ${entry.movementName}` : entry.pieceTitle;
  return (
    <tr role="button" tabIndex={0} className={cn("group border-b border-border/50 transition-colors cursor-pointer relative", entry.performedCount > 0 ? HIGHLIGHT.performedRow : entry.everMilestone === "completed" ? HIGHLIGHT.learnedRow : "hover:bg-muted/20")} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenEntry(entry); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onOpenEntry(entry); } }}>
      <td className={cn("py-3 pl-4 pr-2", entry.performedCount > 0 && `border-l-[4px] ${HIGHLIGHT.performedBorder}`, entry.everMilestone === "completed" && `border-l-[4px] ${HIGHLIGHT.learnedBorder}`)}>
        <div className="flex flex-wrap items-center gap-1.5">
          {entry.performedCount > 0 && <Music2 className={cn("w-3.5 h-3.5 shrink-0", HIGHLIGHT.performedMusicIcon)} />}
          <span className="text-sm font-medium hover:text-primary transition-colors line-clamp-1">{displayTitle}</span>
          {entry.everMilestone && (<><span className={cn("inline-flex w-fit min-w-[84px] justify-center items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap", HIGHLIGHT.learnedPill)}>Learned</span>{entry.performedCount > 0 && <span className={cn("inline-flex w-fit min-w-[108px] justify-center items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap", HIGHLIGHT.performedPill)}>{entry.performedCount > 1 ? `Performed x${entry.performedCount}` : "Performed"}</span>}</>)}
        </div>
      </td>
      <td className="py-3 px-2"><span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{entry.composerName}</span></td>
      <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
        <Select value={status} onValueChange={(val) => { setStatus(val as RepertoireStatus); onStatusChange(entry.entryId, val); }}>
          <SelectTrigger className={cn("h-7 text-xs font-medium border-none shadow-none focus:ring-0 px-2 w-[160px]", getStatusColor(status))}><SelectValue /></SelectTrigger>
          <SelectContent>{ALL_STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
        </Select>
      </td>
      <td className="py-3 px-2 w-28"><div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${STATUS_PROGRESS[status] ?? 0}%`, backgroundColor: getProgressColor(STATUS_PROGRESS[status] ?? 0) }} /></div></td>
      <td className="py-3 px-2"><span className="text-xs text-muted-foreground whitespace-nowrap">{entry.startedDate ? new Date(entry.startedDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—"}</span></td>
      <td className="py-3 px-2"><a href={buildImslpUrl(entry.pieceTitle, entry.composerName)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5 transition-colors whitespace-nowrap"><ExternalLink className="w-2.5 h-2.5" /> Score</a></td>
      <td className="py-3 pr-4 pl-2 flex items-center gap-1">
        <button onClick={(e) => { e.stopPropagation(); onRejoin(entry.pieceId); }} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-primary rounded text-[10px] flex items-center gap-0.5" title="Rejoin with other movements"><Merge className="w-3 h-3" /> Rejoin</button>
        <button onClick={(e) => { e.stopPropagation(); setConfirmRemove(true); }} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-[#1C1C1A] rounded"><X className="w-3.5 h-3.5" /></button>
        <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Remove from repertoire?</AlertDialogTitle><AlertDialogDescription>Remove this movement from your repertoire? This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onRemove(entry.entryId)}>Remove</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PieceJourneySidePane — click-through from table row
// ─────────────────────────────────────────────────────────────────────────────

function PieceJourneySidePane({ row, milestones, userId, onClose }: {
  row: TableRowItem;
  milestones: any[];
  userId: string;
  onClose: () => void;
}) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [contributeOpen, setContributeOpen] = useState(false);

  const piece = row?.kind === "piece" ? row.piece : null;
  const entry = row?.kind === "entry" ? row.entry : null;

  if (!piece && !entry) return null;

  const composerName = piece?.composerName ?? entry?.composerName ?? "Unknown";
  const pieceTitle = piece?.pieceTitle ?? entry?.pieceTitle ?? "Untitled";
  const displayTitle = entry?.movementName ? `${entry.pieceTitle} — ${entry.movementName}` : pieceTitle;
  const status = piece?.status ?? entry?.status ?? "Want to learn";
  const startedDate = piece?.startedDate ?? entry?.startedDate ?? null;
  const currentCycle = piece?.currentCycle ?? entry?.currentCycle ?? 1;
  const pieceId = piece?.pieceId ?? entry?.pieceId;
  const primaryEntryId = piece?.primaryEntryId ?? entry?.entryId;
  // For a movement entry, scope community scores to that movement.
  // For a piece row, scope to null (whole piece).
  const movementId: number | null = entry?.movementId ?? null;
  const prog = STATUS_PROGRESS[status] ?? 0;

  if (!pieceId) return null;

  const communityScoreUrl = `/api/community-scores?pieceId=${pieceId}${movementId != null ? `&movementId=${movementId}` : ""}`;

  const { data: existingPlan } = useQuery<{ id: number } | null>({
    queryKey: [`/api/learning-plans/entry/${primaryEntryId}`],
    enabled: !!primaryEntryId,
    staleTime: 30_000,
  });

  const { data: communityScore } = useQuery<{ id: number } | null>({
    queryKey: [communityScoreUrl],
    queryFn: async () => {
      const res = await fetch(communityScoreUrl);
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!pieceId,
    staleTime: 60_000,
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/25 z-40 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 w-[460px] bg-background border-l border-border z-50 overflow-y-auto shadow-2xl flex flex-col">
        <div className="px-6 pt-8 pb-6 border-b border-border bg-muted/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{composerName}</p>
              <h2 className="font-serif text-2xl leading-tight">{displayTitle}</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors"><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-card px-2.5 py-2"><p className="text-muted-foreground">Status</p><p className="font-medium mt-0.5">{status}</p></div>
            <div className="rounded-lg border border-border bg-card px-2.5 py-2"><p className="text-muted-foreground">Started</p><p className="font-medium mt-0.5">{startedDate ? new Date(startedDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—"}</p></div>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1"><span>Progress</span><span>{prog}%</span></div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${prog}%`, backgroundColor: getProgressColor(prog) }} /></div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <a href={buildImslpUrl(pieceTitle, composerName)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"><ExternalLink className="w-3 h-3" /> Score</a>
            {pieceId != null && Number.isInteger(pieceId) && <Link href={`/piece/${pieceId}`} onClick={onClose} className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"><ArrowUpRight className="w-3 h-3" /> Open piece page</Link>}
          </div>
        </div>

        <div className="p-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Learning Journey</h3>
          <MilestoneTimeline milestones={milestones} movements={piece?.movements} currentCycle={currentCycle} pieceId={pieceId} userId={userId} repertoireEntryId={primaryEntryId} movementId={movementId ?? undefined} editable={!!userId} />
        </div>

        <div className="p-5 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Learning Plan</h3>
            <div className="flex items-center gap-1.5">
              {/* Contribute score button — only when no community score exists yet */}
              {!communityScore && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 text-[#729E8F] hover:text-[#5a7f72] hover:bg-[#729E8F]/10"
                  onClick={() => setContributeOpen(true)}
                  title="Contribute your bar analysis to the community"
                >
                  <Upload className="w-3.5 h-3.5" /> Contribute score
                </Button>
              )}
              {existingPlan ? (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { onClose(); navigate(`/plan/${existingPlan.id}`); }}>
                  <BookOpen className="w-3.5 h-3.5" /> View full plan
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setWizardOpen(true)}>
                  <BookOpen className="w-3.5 h-3.5" /> Start plan
                </Button>
              )}
            </div>
          </div>
          {existingPlan ? (
            <DailyLessonCard planId={existingPlan.id} repertoireEntryId={primaryEntryId ?? 0} pieceTitle={pieceTitle} composerName={composerName} pieceId={pieceId ?? 0} userId={userId} />
          ) : (
            <p className="text-xs text-muted-foreground">Create a structured day-by-day schedule to learn this piece.</p>
          )}
        </div>
      </aside>

      {primaryEntryId && (
        <LearningPlanWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          repertoireEntryId={primaryEntryId}
          pieceId={pieceId}
          movementId={movementId}
          pieceTitle={pieceTitle}
          userId={userId}
          onSuccess={(pid) => {
            onClose();
            navigate(`/plan/${pid}`);
          }}
        />
      )}

      {/* Standalone contribute-score wizard (no learning plan created) */}
      <ContributeScoreWizard
        open={contributeOpen}
        onOpenChange={setContributeOpen}
        pieceId={pieceId}
        movementId={movementId}
        pieceTitle={pieceTitle}
        userId={userId}
        onContributed={() => {
          // Invalidate so the side pane hides the button AND the wizard shows the card
          queryClient.invalidateQueries({ queryKey: [communityScoreUrl] });
          setContributeOpen(false);
        }}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main HomePage
// ─────────────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [, navigate] = useLocation();
  const userId = localStorage.getItem("userId");

  useEffect(() => { if (!userId) navigate("/auth"); }, [userId, navigate]);

  const { data: rawRepertoire } = useQuery<any[] | { entries: any[]; movementOrderByPiece: Record<number, number[]> }>({
    queryKey: [`/api/repertoire/${userId}`],
    enabled: !!userId,
    staleTime: 0,
  });

  const repertoireEntries = useMemo(() =>
    Array.isArray(rawRepertoire) ? rawRepertoire : (rawRepertoire?.entries ?? []), [rawRepertoire]);
  const movementOrderByPiece = useMemo(() =>
    Array.isArray(rawRepertoire) ? {} : (rawRepertoire?.movementOrderByPiece ?? {}), [rawRepertoire]);

  const queryClient = useQueryClient();

  // ── Composer order ────────────────────────────────────────────────────────
  const [composerOrder, setComposerOrder] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(`composerOrder_${userId}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleComposerDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSortedGroups(prev => {
      const oldIdx = prev.findIndex(g => g.composerId === active.id);
      const newIdx = prev.findIndex(g => g.composerId === over.id);
      const next = arrayMove(prev, oldIdx, newIdx);
      const newOrder = next.map(g => g.composerId);
      setComposerOrder(newOrder);
      localStorage.setItem(`composerOrder_${userId}`, JSON.stringify(newOrder));
      return next;
    });
  }, [userId]);

  const [activePaneComposer, setActivePaneComposer] = useState<ComposerGroup | null>(null);
  const [editMovementsPieceId, setEditMovementsPieceId] = useState<number | null>(null);
  const [expandedPieceIds, setExpandedPieceIds] = useState<Set<number>>(() => new Set());
  const [tableExpanded, setTableExpanded] = useState(false);
  const [tableFilter, setTableFilter] = useState<"all" | "active" | "maintaining">("all");

  const composerGroups = useMemo(() => groupByComposer(repertoireEntries, movementOrderByPiece), [repertoireEntries, movementOrderByPiece]);

  const [sortedGroups, setSortedGroups] = useState<ComposerGroup[]>([]);
  useEffect(() => {
    if (composerGroups.length === 0) { setSortedGroups([]); return; }
    setSortedGroups(() => {
      const orderMap = new Map(composerOrder.map((id, i) => [id, i]));
      return [...composerGroups].sort((a, b) => {
        const ai = orderMap.has(a.composerId) ? orderMap.get(a.composerId)! : 9999;
        const bi = orderMap.has(b.composerId) ? orderMap.get(b.composerId)! : 9999;
        return ai - bi;
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerGroups]);

  useEffect(() => {
    if (!activePaneComposer) return;
    const refreshed = sortedGroups.find((g) => g.composerId === activePaneComposer.composerId) ?? null;
    if (refreshed) setActivePaneComposer(refreshed);
  }, [sortedGroups, activePaneComposer]);

  const allPieces = useMemo(() => composerGroups.flatMap(g => g.pieces), [composerGroups]);
  const tableRows = useMemo(() => buildTableRows(repertoireEntries, allPieces), [repertoireEntries, allPieces]);

  const filteredTableRows = useMemo(() => {
    const withStatus = (item: TableRowItem) => item.kind === "piece" ? item.piece.status : item.entry.status;
    const getTitle = (item: TableRowItem) => item.kind === "piece" ? item.piece.pieceTitle : (item.entry.movementName ? `${item.entry.pieceTitle} — ${item.entry.movementName}` : item.entry.pieceTitle);
    let list = [...tableRows];
    if (tableFilter === "active") list = list.filter((item) => ACTIVE_STATUSES.has(withStatus(item)));
    if (tableFilter === "maintaining") list = list.filter((item) => withStatus(item) === "Maintaining");
    return list.sort((a, b) => {
      const ai = ALL_STATUSES.indexOf(withStatus(a));
      const bi = ALL_STATUSES.indexOf(withStatus(b));
      return ai - bi || getTitle(a).localeCompare(getTitle(b));
    });
  }, [tableRows, tableFilter]);

  const visibleTableRows = tableExpanded ? filteredTableRows : filteredTableRows.slice(0, 8);

  const [activeRow, setActiveRow] = useState<TableRowItem | null>(null);

  const activePiece = useMemo(() => {
    if (!activeRow || activeRow.kind !== "piece") return null;
    return allPieces.find((p) => p.pieceId === activeRow.piece.pieceId) ?? activeRow.piece;
  }, [activeRow, allPieces]);

  const activeEntry = useMemo(() => {
    if (!activeRow || activeRow.kind !== "entry") return null;
    const entry = repertoireEntries.find((e: any) => e.id === activeRow.entry.entryId);
    return entry ? toEntryRow(entry) : activeRow.entry;
  }, [activeRow, repertoireEntries]);

  const isMultiMovementPiece = activePiece && activePiece.movements.some(m => m.movementId != null);
  const { data: activePieceMilestones = [] } = useQuery<any[]>({
    queryKey: [`/api/milestones/${userId}/${activePiece?.pieceId ?? activeEntry?.pieceId}`, activeEntry?.movementId ?? (isMultiMovementPiece ? "all-movements" : "whole")],
    queryFn: async () => {
      const pieceId = activePiece?.pieceId ?? activeEntry?.pieceId;
      if (!pieceId || !userId) return [];
      let url: string;
      if (activeEntry?.movementId != null) {
        url = `/api/milestones/${userId}/${pieceId}?movementId=${activeEntry.movementId}`;
      } else if (isMultiMovementPiece) {
        url = `/api/milestones/${userId}/${pieceId}?allMovements=true`;
      } else {
        url = `/api/milestones/${userId}/${pieceId}`;
      }
      const r = await fetch(url);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!userId && !!(activePiece ?? activeEntry),
    staleTime: 0,
  });

  // ── In-progress entries with plans ──────────────────────────────────────
  const inProgressEntries = useMemo(() =>
    repertoireEntries.filter((e: any) => e.status === "In Progress"),
  [repertoireEntries]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStatusChange = async (pieceId: number, newStatus: string) => {
    await apiRequest("PATCH", `/api/repertoire/piece/${pieceId}`, { status: newStatus });
    queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
  };

  const handleRemove = async (pieceId: number) => {
    await apiRequest("DELETE", `/api/repertoire/piece/${pieceId}`);
    queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
    setActiveRow(null);
    setActivePaneComposer(prev => {
      if (!prev) return null;
      const updated = { ...prev, pieces: prev.pieces.filter(p => p.pieceId !== pieceId) };
      return updated.pieces.length > 0 ? updated : null;
    });
  };

  const handleEntryStatusChange = async (entryId: number, newStatus: string) => {
    await apiRequest("PATCH", `/api/repertoire/${entryId}`, { status: newStatus });
    queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
  };

  const handleEntryRemove = async (entryId: number) => {
    await apiRequest("DELETE", `/api/repertoire/${entryId}`);
    queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
    setActiveRow(null);
  };

  const handleSplit = async (pieceId: number) => {
    await apiRequest("PATCH", `/api/repertoire/piece/${pieceId}`, { splitView: true });
    queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
    setActiveRow(null);
  };

  const handleRejoin = async (pieceId: number) => {
    await apiRequest("PATCH", `/api/repertoire/piece/${pieceId}`, { splitView: false });
    queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
    setActiveRow(null);
  };

  const handleAddPiece = async (piece: NewPieceData) => {
    const startedDate = piece.date === "—" ? null : piece.date;
    try {
      if (piece.movementIds.length > 0) {
        await Promise.all(piece.movementIds.map((movementId) =>
          apiRequest("POST", "/api/repertoire", { userId, composerId: piece.composerId, pieceId: piece.pieceId, movementId, status: piece.status, startedDate })
        ));
      } else {
        await apiRequest("POST", "/api/repertoire", { userId, composerId: piece.composerId, pieceId: piece.pieceId, status: piece.status, startedDate });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
    } catch (err) { console.error("Failed to add piece:", err); }
  };

  const getEntriesForPiece = (pieceId: number) =>
    repertoireEntries.filter((e: any) => e.pieceId === pieceId).map((e: any) => ({ entryId: e.id, movementId: e.movementId }));

  const getComposerIdForPiece = (pieceId: number) =>
    repertoireEntries.find((e: any) => e.pieceId === pieceId)?.composerId ?? 0;

  const getStatusForPiece = (pieceId: number) =>
    repertoireEntries.find((e: any) => e.pieceId === pieceId)?.status ?? "Want to learn";

  if (!userId) return null;

  return (
    <Layout>
      <div className="min-h-screen bg-background pb-20">
        <div className="container mx-auto px-6 xl:px-8 py-8">
          <div className="mx-auto w-full max-w-7xl space-y-10">

              {/* ── ACTIVE LEARNING PLANS (same column as library — not the top app bar) ── */}
              {inProgressEntries.length > 0 && (
                <section aria-labelledby="active-plans-heading">
                  <div className="rounded-2xl border border-[#C8B388]/45 bg-card shadow-sm overflow-hidden ring-1 ring-[#C8B388]/15">
                    <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-border/60 bg-gradient-to-r from-[#DCCAA6]/20 via-[#F4F1EA] to-background">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C8B388]/25 text-[#5c4a28]">
                            <GraduationCap className="w-4 h-4" aria-hidden />
                          </span>
                          <h2 id="active-plans-heading" className="text-xs font-bold uppercase tracking-widest text-foreground">
                            Active learning plans
                          </h2>
                        </div>
                        <span className="text-xs font-medium text-muted-foreground tabular-nums rounded-full bg-background/80 border border-border/60 px-2.5 py-0.5">
                          {inProgressEntries.length} in progress
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-snug">
                        Continue structured practice for these pieces — open a plan for today&apos;s session or to adjust your schedule.
                      </p>
                    </div>
                    <div className="p-5 sm:p-6 bg-muted/10">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {inProgressEntries.map((entry: any) => {
                          const piece = allPieces.find(p => p.pieceId === entry.pieceId);
                          return (
                            <ActivePlanCard
                              key={entry.id}
                              entryId={entry.id}
                              pieceTitle={entry.pieceTitle ?? piece?.pieceTitle ?? "Untitled"}
                              composerName={entry.composerName ?? piece?.composerName ?? ""}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* ── COMPOSER LIBRARY ──────────────────────────── */}
              <section>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Your Library</h2>
                    <span className="text-xs text-muted-foreground/50">{sortedGroups.length} composers</span>
                  </div>
                  <AddPieceDialog onAdd={handleAddPiece} />
                </div>

                {sortedGroups.length === 0 ? (
                  <div className="flex items-center justify-center py-16 border-2 border-dashed border-border rounded-2xl">
                    <div className="text-center">
                      <Music className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">No pieces yet. Add your first piece to start building your library.</p>
                    </div>
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleComposerDragEnd}>
                    <SortableContext items={sortedGroups.map(g => g.composerId)} strategy={horizontalListSortingStrategy}>
                      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-none -mx-1 px-1">
                        {sortedGroups.map(group => (
                          <SortableComposerBook
                            key={group.composerId}
                            group={group}
                            isActive={activePaneComposer?.composerId === group.composerId}
                            onClick={() => setActivePaneComposer(activePaneComposer?.composerId === group.composerId ? null : group)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </section>

              {/* ── REPERTOIRE TABLE ──────────────────────────── */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Music2 className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Repertoire</h2>
                    <span className="text-xs text-muted-foreground/50">{filteredTableRows.length} pieces</span>
                  </div>
                  <div className="flex gap-1">
                    {(["all", "active", "maintaining"] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setTableFilter(f)}
                        className={cn("text-xs px-3 py-1.5 rounded-full font-medium transition-colors capitalize", tableFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}
                      >
                        {f === "maintaining" ? "Maintaining" : f === "active" ? "Active" : "All"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="py-2.5 pl-4 pr-2 text-xs font-semibold text-muted-foreground">Piece</th>
                        <th className="py-2.5 px-2 text-xs font-semibold text-muted-foreground">Composer</th>
                        <th className="py-2.5 px-2 text-xs font-semibold text-muted-foreground">Status</th>
                        <th className="py-2.5 px-2 text-xs font-semibold text-muted-foreground w-28">Progress</th>
                        <th className="py-2.5 px-2 text-xs font-semibold text-muted-foreground">Started</th>
                        <th className="py-2.5 px-2 text-xs font-semibold text-muted-foreground">Score</th>
                        <th className="py-2.5 pr-4 pl-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTableRows.length === 0 ? (
                        <tr><td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No pieces match this filter.</td></tr>
                      ) : visibleTableRows.map((row) =>
                        row.kind === "piece" ? (
                          <TableRow
                            key={`p-${row.piece.pieceId}`}
                            piece={row.piece}
                            expanded={expandedPieceIds.has(row.piece.pieceId)}
                            onToggleExpand={() => setExpandedPieceIds(prev => {
                              const next = new Set(prev);
                              if (next.has(row.piece.pieceId)) next.delete(row.piece.pieceId);
                              else next.add(row.piece.pieceId);
                              return next;
                            })}
                            onOpenPiece={(selectedPiece) => { setActivePaneComposer(null); setActiveRow({ kind: "piece", piece: selectedPiece }); }}
                            onStatusChange={handleStatusChange}
                            onRemove={handleRemove}
                            onEditMovements={row.piece.movements.length > 0 ? () => setEditMovementsPieceId(row.piece.pieceId) : undefined}
                            onSplit={row.piece.movements.length >= 2 ? () => handleSplit(row.piece.pieceId) : undefined}
                          />
                        ) : (
                          <TableRowEntry
                            key={`e-${row.entry.entryId}`}
                            entry={row.entry}
                            onOpenEntry={(entry) => { setActivePaneComposer(null); setActiveRow({ kind: "entry", entry }); }}
                            onStatusChange={handleEntryStatusChange}
                            onRemove={handleEntryRemove}
                            onRejoin={handleRejoin}
                          />
                        )
                      )}
                    </tbody>
                  </table>
                  {filteredTableRows.length > 8 && (
                    <div className="border-t border-border/50 px-4 py-2.5 bg-muted/20">
                      <button onClick={() => setTableExpanded(e => !e)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                        {tableExpanded ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</> : <><ChevronDown className="w-3.5 h-3.5" /> Show all {filteredTableRows.length} pieces</>}
                      </button>
                    </div>
                  )}
                </div>
              </section>
          </div>
        </div>

        {/* ── COMPOSER SIDE PANE ────────────────────────────── */}
        {activePaneComposer && (() => {
          const composerDisplayItems = tableRows.filter(row => (row.kind === "piece" ? row.piece.composerId : row.entry.composerId) === activePaneComposer.composerId);
          return (
            <ComposerSidePane
              group={activePaneComposer}
              items={composerDisplayItems}
              onClose={() => setActivePaneComposer(null)}
              onOpenItem={(item) => { setActivePaneComposer(null); setActiveRow(item); }}
              onStatusChange={(item, status) => item.kind === "piece" ? handleStatusChange(item.piece.pieceId, status) : handleEntryStatusChange(item.entry.entryId, status)}
              onRemove={(item) => item.kind === "piece" ? handleRemove(item.piece.pieceId) : handleEntryRemove(item.entry.entryId)}
              onEditMovements={(pieceId) => setEditMovementsPieceId(pieceId)}
            />
          );
        })()}
        {activeRow && userId && (activePiece || activeEntry) && (
          <PieceJourneySidePane row={activeRow} milestones={activePieceMilestones} userId={userId} onClose={() => setActiveRow(null)} />
        )}

        {editMovementsPieceId !== null && userId && (
          <EditMovementsDialog
            open={true}
            onOpenChange={(open) => { if (!open) setEditMovementsPieceId(null); }}
            pieceId={editMovementsPieceId}
            userId={userId}
            currentEntries={getEntriesForPiece(editMovementsPieceId)}
            currentStatus={getStatusForPiece(editMovementsPieceId)}
            composerId={getComposerIdForPiece(editMovementsPieceId)}
            onSave={() => queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] })}
          />
        )}
      </div>
    </Layout>
  );
}
