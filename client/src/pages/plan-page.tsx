import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronDown, ArrowLeft, CalendarDays, ArrowRight,
  Flag, Lightbulb, X, Check, Music2, HelpCircle,
  Dumbbell, Shuffle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { measuresUsePageGeometry, useSheetPageUrl } from "@/lib/sheet-page";
import { apiRequest } from "@/lib/queryClient";
import { generateLessonsWithAutoExtend } from "@/lib/generate-lessons";
import { getSectionColor, getPhaseColor, PHASE_COLORS } from "@/lib/palette";
import { RecalibratePrompt } from "@/components/recalibrate-prompt";
import { PHASE_TYPES, PHASE_LABELS, type PhaseType } from "@shared/schema";

type LearningPlan = {
  id: number;
  repertoireEntryId: number | null;
  sheetMusicId: number | null;
  movementId: number | null;
  dailyPracticeMinutes: number;
  targetCompletionDate: string | null;
  totalMeasures: number | null;
  status: string;
  blockType?: string;
  cadence?: string;
  cadenceDays?: number[] | null;
};

type SessionTask = { text: string; tag?: string };
type SessionSection = {
  type: string;
  label: string;
  durationMin?: number;
  tasks: SessionTask[];
  sectionId?: number;
  phaseType?: string;
  measureStart?: number;
  measureEnd?: number;
};

type LessonDay = {
  id: number;
  scheduledDate: string;
  measureStart: number;
  measureEnd: number;
  status: string;
  userNotes: string | null;
  completedAt: string | null;
  tasks: SessionSection[] | null;
  sectionId: number | null;
  phaseType: string | null;
};

type PlanSection = {
  id: number;
  name: string;
  measureStart: number;
  measureEnd: number;
  difficulty: number;
  displayOrder: number;
};

type BarFlagSummary = {
  measureId: number;
  measureNumber: number;
  imageUrl: string | null;
  flagCount: number;
  resolvedCount: number;
};

type SuggestionPayload = {
  message: string;
  extraSessions?: number;
  fromPhase?: string;
  targetPhase?: string;
};

type PlanSuggestion = {
  id: number;
  type: string;
  sectionId: number | null;
  payload: SuggestionPayload;
  status: string;
};

type NormBox = { x: number; y: number; w: number; h: number };

type MeasureRow = {
  id: number;
  measureNumber: number;
  pageNumber: number | null;
  boundingBox: NormBox | null;
  imageUrl: string | null;
};

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:     "#f5f1ea",
  card:   "#ede8df",
  border: "#ddd8cc",
  navy:   "#0f2036",
  gold:   "#c9a86a",
  muted:  "#7a7166",
} as const;

// ── PhaseLegend ───────────────────────────────────────────────────────────────

function PhaseLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="mt-4 rounded-lg overflow-hidden"
      style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          {/* Mini swatches preview */}
          <div className="flex items-center gap-0.5">
            {PHASE_TYPES.map((pt) => (
              <div
                key={pt}
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: PHASE_COLORS[pt]?.border ?? "#8A877F" }}
              />
            ))}
          </div>
          <span
            className="text-[11px] font-bold uppercase tracking-[0.15em]"
            style={{ color: T.muted, fontFamily: "Inter, sans-serif" }}
          >
            Phase Legend
          </span>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 transition-transform duration-200",
            open && "rotate-180",
          )}
          style={{ color: T.muted }}
        />
      </button>

      {open && (
        <div
          className="px-4 pb-4 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2"
          style={{ borderTop: `1px solid ${T.border}` }}
        >
          {PHASE_TYPES.map((pt) => {
            const color = PHASE_COLORS[pt];
            const info = PHASE_LABELS[pt];
            return (
              <div key={pt} className="flex items-start gap-2.5">
                <div
                  className="mt-0.5 w-3 h-3 shrink-0 rounded-sm border-2"
                  style={{ borderColor: color?.border ?? "#8A877F", backgroundColor: color?.bg ?? "transparent" }}
                />
                <div className="min-w-0">
                  <span className="text-xs font-semibold" style={{ color: T.navy }}>{info.label}</span>
                  <span className="text-[11px] block leading-snug" style={{ color: T.muted }}>{info.description}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PlanScoreView ─────────────────────────────────────────────────────────────

function PlanScoreView({
  sheetMusicId,
  lessons,
  sections,
  measures,
}: {
  sheetMusicId: number;
  lessons: LessonDay[];
  sections: PlanSection[];
  measures: MeasureRow[];
}) {
  const sortedLessons = [...lessons].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const defaultIdx = Math.max(0, sortedLessons.findIndex((l) => l.status !== "completed"));
  const [selectedIdx, setSelectedIdx] = useState(defaultIdx);

  const getPageUrl = useSheetPageUrl(sheetMusicId);

  const lesson = sortedLessons[selectedIdx];
  if (!lesson || !measuresUsePageGeometry(measures)) return null;

  // All unique page numbers across the whole piece, sorted
  const allPageNums = Array.from(
    new Set(measures.filter((m) => m.pageNumber != null).map((m) => m.pageNumber!)),
  ).sort((a, b) => a - b);

  if (allPageNums.length === 0) return null;

  // Set of measure numbers belonging to the selected lesson
  const lessonMeasureSet = new Set<number>();
  for (let n = lesson.measureStart; n <= lesson.measureEnd; n++) lessonMeasureSet.add(n);

  // Build a per-measure color map from individual piece_practice tasks.
  const NEUTRAL = { border: "#8A877F", bg: "rgba(138,135,127,0.10)" };

  function parseLabelRange(label: string): { start: number; end: number } | null {
    const m = label.match(/mm\.\s*(\d+)[–\-–](\d+)/);
    if (m) return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
    const s = label.match(/mm\.\s*(\d+)/);
    if (s) return { start: parseInt(s[1], 10), end: parseInt(s[1], 10) };
    return null;
  }

  const measureColorMap = new Map<number, { border: string; bg: string }>();
  const practiceTasks = lesson.tasks?.filter(
    (t) =>
      t.type !== "warmup" &&
      (t.type === "piece_practice" ||
        t.phaseType != null ||
        t.measureStart != null ||
        t.measureEnd != null),
  ) ?? [];

  if (practiceTasks.length > 0) {
    for (const task of practiceTasks) {
      const phase = task.phaseType ?? lesson.phaseType ?? null;
      const color = phase ? getPhaseColor(phase) : NEUTRAL;
      const range =
        task.measureStart != null && task.measureEnd != null
          ? { start: task.measureStart, end: task.measureEnd }
          : parseLabelRange(task.label);
      if (range) {
        for (let n = range.start; n <= range.end; n++) measureColorMap.set(n, color);
      }
    }
  }

  if (measureColorMap.size === 0) {
    const effectivePhaseType =
      lesson.phaseType ??
      lesson.tasks?.find((t) => t.type === "piece_practice" && t.phaseType)?.phaseType ??
      null;
    const fallback = effectivePhaseType ? getPhaseColor(effectivePhaseType) : NEUTRAL;
    for (let n = lesson.measureStart; n <= lesson.measureEnd; n++) measureColorMap.set(n, fallback);
  }

  const effectivePhaseType =
    lesson.phaseType ??
    lesson.tasks?.find((t) => t.type === "piece_practice" && t.phaseType)?.phaseType ??
    null;

  const dateLabel = new Date(lesson.scheduledDate + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
  const effectiveSectionId =
    lesson.sectionId ??
    lesson.tasks?.find((t) => t.type === "piece_practice" && t.sectionId != null)?.sectionId ??
    null;
  const sectionForLesson = effectiveSectionId != null ? sections.find((s) => s.id === effectiveSectionId) : null;
  const phaseInfo = effectivePhaseType ? PHASE_LABELS[effectivePhaseType as PhaseType] : null;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
    >
      {/* Sticky header — slider + summary */}
      <div
        className="sticky top-0 z-20 backdrop-blur-sm px-5 pt-4 pb-3 space-y-2.5"
        style={{ backgroundColor: T.card + "f5", borderBottom: `1px solid ${T.border}` }}
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-[11px] font-bold uppercase tracking-[0.15em]"
            style={{ color: T.muted, fontFamily: "Inter, sans-serif" }}
          >
            Score
          </h2>
          <span
            className="text-xs tabular-nums"
            style={{ color: T.muted, fontFamily: "JetBrains Mono, monospace" }}
          >
            Day {selectedIdx + 1} of {sortedLessons.length}
          </span>
        </div>
        <Slider
          min={0}
          max={sortedLessons.length - 1}
          step={1}
          value={[selectedIdx]}
          onValueChange={([v]) => setSelectedIdx(v)}
          className="w-full"
        />
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          <span className="font-medium" style={{ color: T.navy }}>{dateLabel}</span>
          {sectionForLesson && (
            <><span style={{ color: T.muted }}>·</span>
            <span style={{ color: T.muted }}>{sectionForLesson.name}</span></>
          )}
          {phaseInfo && (
            <><span style={{ color: T.muted }}>·</span>
            <span className="font-medium" style={{ color: T.navy + "b0" }}>{phaseInfo.label}</span></>
          )}
          <span style={{ color: T.muted }}>·</span>
          <span style={{ color: T.muted, fontFamily: "JetBrains Mono, monospace" }}>
            m.{lesson.measureStart}–{lesson.measureEnd}
          </span>
        </div>
      </div>

      {/* Page grid — all pages at once, ≤5 per row */}
      <div
        className="p-3 grid gap-1.5"
        style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
      >
        {allPageNums.map((pageNum, flatIdx) => {
          const isFirstInRow = flatIdx % 5 === 0;
          const measuresOnPage = measures.filter(
            (m) => m.pageNumber === pageNum && m.boundingBox != null,
          );
          const lessonBars = measuresOnPage.filter((m) => lessonMeasureSet.has(m.measureNumber));
          const contextBars = measuresOnPage.filter((m) => !lessonMeasureSet.has(m.measureNumber));

          return (
            <div
              key={pageNum}
              className="relative rounded overflow-hidden bg-neutral-50"
              style={{ border: `1px solid ${T.border}` }}
            >
              {isFirstInRow && (
                <span
                  className="absolute top-1 left-1 z-10 text-[9px] font-bold rounded px-1 py-0.5 leading-none select-none"
                  style={{ color: "rgba(255,255,255,0.9)", backgroundColor: "rgba(15,32,54,0.55)" }}
                >
                  p.{pageNum}
                </span>
              )}

              <img
                src={getPageUrl(pageNum)}
                alt={`Page ${pageNum}`}
                className="w-full h-auto block"
                loading="lazy"
              />

              {contextBars.map((m) => (
                <div
                  key={m.id}
                  style={{
                    position: "absolute",
                    left: `${m.boundingBox!.x * 100}%`,
                    top: `${m.boundingBox!.y * 100}%`,
                    width: `${m.boundingBox!.w * 100}%`,
                    height: `${m.boundingBox!.h * 100}%`,
                    background: "rgba(0,0,0,0.05)",
                    pointerEvents: "none",
                  }}
                />
              ))}

              {lessonBars.map((m) => {
                const barColor = measureColorMap.get(m.measureNumber) ?? NEUTRAL;
                const ownerTask = practiceTasks.find((t) => {
                  const range =
                    t.measureStart != null && t.measureEnd != null
                      ? { start: t.measureStart, end: t.measureEnd }
                      : parseLabelRange(t.label);
                  return range && m.measureNumber >= range.start && m.measureNumber <= range.end;
                });
                const barPhase = ownerTask?.phaseType ?? effectivePhaseType;
                const barPhaseInfo = barPhase ? PHASE_LABELS[barPhase as PhaseType] : phaseInfo;
                return (
                  <Tooltip key={m.id}>
                    <TooltipTrigger asChild>
                      <div
                        style={{
                          position: "absolute",
                          left: `${m.boundingBox!.x * 100}%`,
                          top: `${m.boundingBox!.y * 100}%`,
                          width: `${m.boundingBox!.w * 100}%`,
                          height: `${m.boundingBox!.h * 100}%`,
                          background: barColor.bg,
                          borderLeft: `3px solid ${barColor.border}`,
                          cursor: "default",
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs max-w-[220px]">
                      <p className="font-mono" style={{ color: T.muted }}>m.{m.measureNumber}</p>
                      {barPhaseInfo && <p>{barPhaseInfo.label} — {barPhaseInfo.description}</p>}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MovementMap ───────────────────────────────────────────────────────────────

function MovementMap({ lessons }: { lessons: LessonDay[] }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const sorted = [...lessons].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const completedCount = sorted.filter((l) => l.status === "completed").length;
  const totalCount = sorted.length;

  if (totalCount === 0) return null;

  return (
    <div
      className="rounded-lg p-4 sticky top-4"
      style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
    >
      {/* Title */}
      <p
        className="text-[11px] font-bold uppercase tracking-[0.15em] mb-1"
        style={{ color: T.muted, fontFamily: "Inter, sans-serif" }}
      >
        Movement Map
      </p>
      <p className="text-xs mb-4" style={{ color: T.muted }}>
        {completedCount} of {totalCount} sessions complete
      </p>

      {/* Calendar grid — 6 columns */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
        {sorted.map((lesson, i) => {
          const isCompleted = lesson.status === "completed";
          const isToday = lesson.scheduledDate === todayIso;

          let cellStyle: React.CSSProperties = {
            width: "100%",
            aspectRatio: "1",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontFamily: "JetBrains Mono, monospace",
            cursor: "default",
            transition: "opacity 0.15s",
          };

          if (isCompleted) {
            cellStyle = {
              ...cellStyle,
              backgroundColor: T.navy,
              color: T.bg,
              border: "none",
            };
          } else if (isToday) {
            cellStyle = {
              ...cellStyle,
              backgroundColor: "transparent",
              color: T.navy,
              border: `2px solid ${T.gold}`,
              fontWeight: 600,
            };
          } else {
            cellStyle = {
              ...cellStyle,
              backgroundColor: T.bg,
              color: T.muted,
              border: `1px solid ${T.border}`,
            };
          }

          return (
            <Tooltip key={lesson.id}>
              <TooltipTrigger asChild>
                <Link href={`/session/${lesson.id}`}>
                  <div style={cellStyle}>
                    {i + 1}
                  </div>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p className="font-mono">Day {i + 1}</p>
                <p style={{ color: T.muted }}>
                  {new Date(lesson.scheduledDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
                <p style={{ color: T.muted, textTransform: "capitalize" }}>{lesson.status}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: T.navy }} />
          <span className="text-[10px]" style={{ color: T.muted }}>Completed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm border-2" style={{ borderColor: T.gold, backgroundColor: "transparent" }} />
          <span className="text-[10px]" style={{ color: T.muted }}>Today</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: T.bg, borderColor: T.border }} />
          <span className="text-[10px]" style={{ color: T.muted }}>Upcoming</span>
        </div>
      </div>
    </div>
  );
}

// ── RegeneratePaceDialog ──────────────────────────────────────────────────────

type Tempo = "slow" | "medium" | "fast" | "aggressive";
const TEMPO_DAYS_PER_PAGE: Record<Tempo, number> = { slow: 14, medium: 7, fast: 4, aggressive: 2 };
const TEMPO_LABELS: Record<Tempo, { title: string; blurb: string }> = {
  slow:       { title: "Slow",       blurb: "2 weeks per page" },
  medium:     { title: "Medium",     blurb: "1 week per page" },
  fast:       { title: "Fast",       blurb: "4 days per page" },
  aggressive: { title: "Aggressive", blurb: "2 days per page" },
};

function RegeneratePaceDialog({
  open, onOpenChange, planId, sheetMusicId, movementId, initialDailyMinutes,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  planId: number;
  sheetMusicId: number | null;
  movementId: number | null;
  initialDailyMinutes: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tempo, setTempo] = useState<Tempo>("medium");
  const [dailyMinutes, setDailyMinutes] = useState(initialDailyMinutes);

  const pagesUrl = sheetMusicId
    ? `/api/sheet-music/${sheetMusicId}/pages${movementId != null ? `?movementId=${movementId}` : ""}`
    : null;
  const { data: pagesList } = useQuery<{ pageNumber: number }[]>({
    queryKey: [pagesUrl],
    enabled: !!pagesUrl && open,
  });
  const pageCount = pagesList?.length ?? 0;

  const targetDate = (() => {
    const pages = Math.max(1, pageCount);
    const timeFactor = 30 / Math.max(1, dailyMinutes);
    const days = Math.max(1, Math.ceil(pages * TEMPO_DAYS_PER_PAGE[tempo] * timeFactor));
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  })();
  const targetDays = Math.max(1, Math.ceil((new Date(targetDate).getTime() - Date.now()) / 86400000));

  const regenerate = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/learning-plans/${planId}`, {
        dailyPracticeMinutes: dailyMinutes,
        targetCompletionDate: targetDate,
      });
      return generateLessonsWithAutoExtend(planId);
    },
    onSuccess: (extended) => {
      queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/lessons`] });
      queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/sections`] });
      if (extended.extendedDays) {
        toast({
          title: "Plan regenerated — deadline extended",
          description: `Needed ${extended.extendedDays} days. Target moved to ${extended.newTargetDate}.`,
        });
      } else {
        toast({ title: "Plan regenerated", description: "Your schedule has been updated." });
      }
      onOpenChange(false);
    },
    onError: () => toast({ title: "Couldn't regenerate plan", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !regenerate.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">Adjust pace</DialogTitle>
          <DialogDescription>
            Keep your sections, regenerate the daily schedule with new inputs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Daily practice</Label>
              <span className="text-sm font-bold text-primary">{dailyMinutes} min</span>
            </div>
            <Slider
              min={10} max={120} step={5}
              value={[dailyMinutes]}
              onValueChange={([v]) => setDailyMinutes(v)}
            />
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Pace</p>
            <div className="grid grid-cols-2 gap-2">
              {(["slow", "medium", "fast", "aggressive"] as Tempo[]).map((t) => {
                const active = tempo === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTempo(t)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-all",
                      active
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border bg-muted/20 hover:bg-muted/40",
                    )}
                  >
                    <div className="text-sm font-semibold">{TEMPO_LABELS[t].title}</div>
                    <div className="text-xs text-muted-foreground">{TEMPO_LABELS[t].blurb}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pages</span>
              <span className="font-medium">{pageCount > 0 ? pageCount : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estimated duration</span>
              <span className="font-medium">{targetDays} days</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Target date</span>
              <span className="font-medium">
                {new Date(targetDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            This replaces all upcoming lessons. Completed sessions and flags are kept.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={regenerate.isPending}>
            Cancel
          </Button>
          <Button onClick={() => regenerate.mutate()} disabled={regenerate.isPending}>
            {regenerate.isPending ? "Regenerating..." : "Regenerate plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── StubBlockPlanView — simplified detail page for Exercise / Sight-reading ──

const CADENCE_LABELS_MAP: Record<string, string> = {
  daily: "Daily", weekdays: "Weekdays", weekends: "Weekends", custom: "Custom",
};

function StubBlockPlanView({ plan, planId }: { plan: LearningPlan; planId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isExercise = plan.blockType === "exercise";
  const blockName = isExercise ? "Exercises" : "Sight-reading";
  const Icon = isExercise ? Dumbbell : Shuffle;

  const [editOpen, setEditOpen] = useState(false);
  const [minutes, setMinutes] = useState(plan.dailyPracticeMinutes);
  const [cadence, setCadence] = useState<string>(plan.cadence ?? "daily");
  const [customDays, setCustomDays] = useState<number[]>(
    Array.isArray(plan.cadenceDays) ? plan.cadenceDays : [1, 2, 3, 4, 5],
  );

  const toggleDay = (dow: number) =>
    setCustomDays((prev) => prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow].sort());

  const updateCadence = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/learning-plans/${planId}/cadence`, {
        cadence,
        cadenceDays: cadence === "custom" ? customDays : undefined,
        dailyPracticeMinutes: minutes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      toast({ title: "Settings updated" });
      setEditOpen(false);
    },
    onError: () => toast({ title: "Couldn't update settings", variant: "destructive" }),
  });

  const WEEKDAYS = [
    { label: "Su", dow: 0 }, { label: "Mo", dow: 1 }, { label: "Tu", dow: 2 },
    { label: "We", dow: 3 }, { label: "Th", dow: 4 }, { label: "Fr", dow: 5 },
    { label: "Sa", dow: 6 },
  ];

  return (
    <Layout>
      <div style={{ backgroundColor: T.bg, minHeight: "100vh" }}>
        {/* Header */}
        <div style={{ backgroundColor: T.bg, borderBottom: `1px solid ${T.border}`, padding: "24px 32px" }}>
          <div className="mb-4">
            <Button variant="ghost" size="sm" className="gap-1 -ml-2 hover:bg-black/8" style={{ color: T.muted }} asChild>
              <Link href="/home"><ArrowLeft className="w-4 h-4" /> Back</Link>
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: T.card, display: "flex", alignItems: "center", justifyContent: "center",
                color: T.gold, border: `1px solid ${T.border}`,
              }}>
                <Icon size={20} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] mb-0.5" style={{ color: T.muted, fontFamily: "Inter, sans-serif" }}>
                  Learning block
                </p>
                <h1 style={{ fontFamily: "Cormorant Garamond, Georgia, serif", fontSize: 32, fontWeight: 400, color: T.navy }}>
                  {blockName}
                </h1>
              </div>
            </div>
            <Button size="sm" style={{ backgroundColor: T.navy, color: T.bg }} onClick={() => setEditOpen(true)}>
              Settings
            </Button>
          </div>
          <p className="mt-3" style={{ fontSize: 12, color: T.muted, fontFamily: "JetBrains Mono, monospace" }}>
            {plan.dailyPracticeMinutes} min/day · {CADENCE_LABELS_MAP[plan.cadence ?? "daily"] ?? plan.cadence}
          </p>
        </div>

        {/* Placeholder content */}
        <div style={{ padding: "24px 32px", maxWidth: 720 }}>
          <div style={{
            background: T.card, border: `1px dashed ${T.border}`,
            borderRadius: 12, padding: "32px 28px", textAlign: "center", color: T.muted,
          }}>
            <Icon size={28} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
            <p style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 18, fontStyle: "italic", marginBottom: 6 }}>
              {isExercise ? "Hanon exercises, scales, arpeggios" : "Random sight-reading material"}
            </p>
            <p style={{ fontSize: 12 }}>
              Content for this block type is coming soon.
              Your {blockName.toLowerCase()} session is included in Today's Practice.
            </p>
          </div>
        </div>

        {/* Settings dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Block settings</DialogTitle>
            </DialogHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "8px 0" }}>
              <div>
                <Label style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: T.muted }}>
                  Daily time ({minutes} min)
                </Label>
                <div className="mt-2">
                  <Slider min={5} max={60} step={5} value={[minutes]} onValueChange={([v]) => setMinutes(v)} />
                </div>
              </div>
              <div>
                <Label style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: T.muted }}>Schedule</Label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {(["daily", "weekdays", "weekends", "custom"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCadence(c)}
                      style={{
                        padding: "5px 14px", borderRadius: 20,
                        border: `1px solid ${cadence === c ? T.navy : T.border}`,
                        background: cadence === c ? T.navy : "transparent",
                        color: cadence === c ? "#fff" : T.muted,
                        fontSize: 12, fontWeight: 500, cursor: "pointer",
                      }}
                    >
                      {CADENCE_LABELS_MAP[c]}
                    </button>
                  ))}
                </div>
                {cadence === "custom" && (
                  <div className="flex gap-1.5 mt-2">
                    {WEEKDAYS.map(({ label, dow }) => {
                      const active = customDays.includes(dow);
                      return (
                        <button
                          key={dow}
                          type="button"
                          onClick={() => toggleDay(dow)}
                          style={{
                            width: 34, height: 34, borderRadius: 7,
                            border: `1px solid ${active ? T.gold : T.border}`,
                            background: active ? T.gold : "transparent",
                            color: active ? T.navy : T.muted,
                            fontSize: 11, fontWeight: 600, cursor: "pointer",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button
                onClick={() => updateCadence.mutate()}
                disabled={updateCadence.isPending || (cadence === "custom" && customDays.length === 0)}
                style={{ backgroundColor: T.navy, color: T.bg }}
              >
                {updateCadence.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

export default function PlanPage() {
  const params = useParams<{ planId: string }>();
  const planId = parseInt(params.planId ?? "", 10);
  const queryClient = useQueryClient();

  const { data: plan, isLoading: planLoading, isError: planError } = useQuery<LearningPlan | null>({
    queryKey: [`/api/learning-plans/${planId}`],
    enabled: Number.isFinite(planId) && planId > 0,
  });

  const { data: lessons = [], isLoading: lessonsLoading } = useQuery<LessonDay[]>({
    queryKey: [`/api/learning-plans/${planId}/lessons`],
    enabled: Number.isFinite(planId) && planId > 0 && !!plan,
  });

  const { data: sections = [] } = useQuery<PlanSection[]>({
    queryKey: [`/api/learning-plans/${planId}/sections`],
    enabled: Number.isFinite(planId) && planId > 0 && !!plan,
  });

  const { data: suggestions = [] } = useQuery<PlanSuggestion[]>({
    queryKey: [`/api/learning-plans/${planId}/suggestions`],
    enabled: Number.isFinite(planId) && planId > 0 && !!plan,
  });

  const { data: flagSummary = [] } = useQuery<BarFlagSummary[]>({
    queryKey: [`/api/learning-plans/${planId}/flags/summary`],
    enabled: Number.isFinite(planId) && planId > 0 && !!plan,
  });

  const dismissSuggestion = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/learning-plans/${planId}/suggestions/${id}`, { status: "dismissed" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/suggestions`] }),
  });

  const acceptSuggestion = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/learning-plans/${planId}/suggestions/${id}`, { status: "accepted" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/suggestions`] }),
  });

  const sheetId = plan?.sheetMusicId ?? null;
  const mvtParam = plan?.movementId ? `?movementId=${plan.movementId}` : "";

  const { data: measures = [] } = useQuery<MeasureRow[]>({
    queryKey: [`/api/sheet-music/${sheetId}/measures${mvtParam}`],
    enabled: sheetId != null && sheetId > 0,
  });

  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const [paceDialogOpen, setPaceDialogOpen] = useState(false);
  const [recalibrateDismissed, setRecalibrateDismissed] = useState(
    () => !!localStorage.getItem(`practivo_recalibrate_dismissed_${planId}`),
  );
  const showRecalibratePrompt = useMemo(() => {
    if (recalibrateDismissed || !plan || sections.length === 0) return false;
    const completedCount = lessons.filter((l) => l.status === "completed").length;
    if (completedCount === 0) return false;
    let horizonDays = 30;
    if (plan.targetCompletionDate) {
      const msLeft = new Date(plan.targetCompletionDate).getTime() - Date.now();
      horizonDays = Math.max(7, Math.ceil(msLeft / 86_400_000));
    }
    const loThreshold = Math.max(1, Math.ceil(horizonDays * 0.1));
    const hiThreshold = Math.ceil(horizonDays * 0.3);
    return completedCount >= loThreshold && completedCount < hiThreshold;
  }, [recalibrateDismissed, plan, sections, lessons]);

  const sortedSections = [...sections].sort((a, b) => a.measureStart - b.measureStart);
  const sectionColorMap = new Map(sortedSections.map((s, i) => [s.id, getSectionColor(i)]));

  if (!Number.isFinite(planId) || planId <= 0) {
    return (
      <Layout>
        <div className="container max-w-3xl mx-auto px-4 py-12">
          <p className="text-muted-foreground">Invalid plan.</p>
          <Button variant="link" asChild className="mt-2 px-0">
            <Link href="/home">Back to home</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  // Non-piece blocks get a simplified view
  if (plan && plan.blockType && plan.blockType !== "piece") {
    return <StubBlockPlanView plan={plan} planId={planId} />;
  }

  const sortedLessons = [...lessons].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const nextLesson = sortedLessons.find((l) => l.status !== "completed");
  const todayIso = new Date().toISOString().slice(0, 10);

  const completedLessons = sortedLessons.filter((l) => l.status === "completed");
  const futureLessons = sortedLessons.filter(
    (l) => l.status !== "completed" && l.id !== nextLesson?.id,
  );
  const visibleCompleted = showAllCompleted
    ? completedLessons
    : completedLessons.slice(-5);

  const showMissing = !planLoading && (planError || plan === null);

  // ── Render a single lesson day card ───────────────────────────────────────
  const renderCard = (lesson: LessonDay, idx: number, variant?: "future") => {
    const label = new Date(lesson.scheduledDate + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const isDone = lesson.status === "completed";
    const isNext = lesson.id === nextLesson?.id;
    const isToday = lesson.scheduledDate === todayIso;

    return (
      <Collapsible
        key={lesson.id}
        defaultOpen={isNext}
        className="rounded-lg overflow-hidden"
        style={{
          backgroundColor: T.bg,
          border: `1px solid ${T.border}`,
          borderLeft: isDone
            ? `3px solid ${T.navy}`
            : isNext
            ? `3px solid ${T.gold}`
            : variant === "future"
            ? `3px solid ${T.border}`
            : `1px solid ${T.border}`,
        }}
      >
        <div className="flex items-stretch gap-2 sm:gap-3 p-2 sm:p-3">
          <CollapsibleTrigger className="flex flex-1 min-w-0 items-center justify-between gap-3 px-2 sm:px-3 py-2 text-left rounded-lg transition-colors hover:bg-black/5 [&[data-state=open]>svg:first-of-type]:rotate-180">
            <div className="flex items-center gap-2 min-w-0">
              <ChevronDown className="w-4 h-4 shrink-0 transition-transform" style={{ color: T.muted }} />
              <div className="min-w-0">
                <p className="font-medium text-sm flex items-center gap-1.5 flex-wrap" style={{ color: T.navy }}>
                  {/* Day number badge */}
                  <span
                    className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[8px] font-bold tabular-nums shrink-0"
                    style={{
                      backgroundColor: T.navy,
                      color: T.bg,
                      fontFamily: "JetBrains Mono, monospace",
                      minWidth: 22,
                    }}
                  >
                    {idx + 1}
                  </span>
                  {isDone && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: `${T.navy}18`,
                        color: T.navy,
                        border: `1px solid ${T.navy}35`,
                      }}
                    >
                      Done
                    </span>
                  )}
                  {isNext && !isDone && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: `${T.gold}30`,
                        color: "#6b4f1a",
                        border: `1px solid ${T.gold}60`,
                      }}
                    >
                      {isToday ? "Today" : "Next"}
                    </span>
                  )}
                  <span style={{ color: T.muted, fontWeight: 400 }}>&middot; {label}</span>
                </p>
                <p className="text-xs truncate flex items-center gap-1 mt-0.5" style={{ color: T.muted }}>
                  {(() => {
                    const allTasks = lesson.tasks ?? [];
                    const phaseBlocks = allTasks.filter((t) => t.phaseType);
                    if (phaseBlocks.length === 0) {
                      return `Bars ${lesson.measureStart}${lesson.measureEnd !== lesson.measureStart ? `\u2013${lesson.measureEnd}` : ""}`;
                    }
                    const shown = phaseBlocks.slice(0, 3);
                    const remaining = phaseBlocks.length - 3;
                    return (
                      <>
                        {shown.map((t, i) => {
                          const dotColor = t.phaseType
                            ? getPhaseColor(t.phaseType)
                            : (t.sectionId ? sectionColorMap.get(t.sectionId) : null);
                          return (
                            <span key={i} className="inline-flex items-center gap-0.5">
                              {i > 0 && <span className="mx-0.5">·</span>}
                              {dotColor && <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor.border }} />}
                              {t.label}
                            </span>
                          );
                        })}
                        {remaining > 0 && <span className="ml-0.5">+ {remaining} more</span>}
                      </>
                    );
                  })()}
                </p>
              </div>
            </div>
          </CollapsibleTrigger>
          <Button
            size="lg"
            className={cn(
              "shrink-0 gap-2 px-4 sm:px-5 font-semibold",
              isDone && "shadow-none",
            )}
            style={isDone
              ? { backgroundColor: T.card, color: T.muted, border: `1px solid ${T.border}` }
              : { backgroundColor: T.navy, color: T.bg }}
            asChild
          >
            <Link href={`/session/${lesson.id}`} title="Open practice session for this day">
              Session
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>

        <CollapsibleContent>
          <div style={{ borderTop: `1px solid ${T.border}` }}>
            {/* Structured session sections */}
            {lesson.tasks && lesson.tasks.length > 0 ? (
              lesson.tasks.map((section, sIdx) => {
                const taskColor = section.phaseType
                  ? getPhaseColor(section.phaseType)
                  : (section.sectionId ? sectionColorMap.get(section.sectionId) : null) ?? null;
                return (
                <div
                  key={`${section.type}-${sIdx}`}
                  className={cn(sIdx > 0 && "border-t")}
                  style={{
                    borderTopColor: sIdx > 0 ? T.border : undefined,
                    borderLeft: taskColor ? `3px solid ${taskColor.border}` : undefined,
                    backgroundColor: taskColor ? taskColor.bg : undefined,
                  }}
                >
                  <div className="px-4 pt-3 pb-1 flex items-baseline gap-2">
                    <p
                      className="text-[10px] font-bold uppercase tracking-[0.15em]"
                      style={{ color: T.muted, fontFamily: "Inter, sans-serif" }}
                    >
                      {section.label}
                    </p>
                    {section.durationMin && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                        style={{
                          backgroundColor: `${T.gold}25`,
                          color: "#6b4f1a",
                          border: `1px solid ${T.gold}50`,
                          fontFamily: "JetBrains Mono, monospace",
                        }}
                      >
                        {section.durationMin} min
                      </span>
                    )}
                    {section.phaseType && PHASE_LABELS[section.phaseType as PhaseType] && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={taskColor
                          ? { backgroundColor: taskColor.bg, color: taskColor.border }
                          : undefined}
                      >
                        {PHASE_LABELS[section.phaseType as PhaseType].label}
                      </span>
                    )}
                  </div>
                  <div className="px-4 pb-3 space-y-1.5">
                    {section.tasks.map((task, tIdx) => (
                      <div key={tIdx} className="flex items-start gap-2.5">
                        <div
                          className="mt-[3px] w-3.5 h-3.5 shrink-0 rounded-sm border flex items-center justify-center"
                          style={isDone
                            ? { borderColor: T.navy, backgroundColor: `${T.navy}20` }
                            : { borderColor: T.border, backgroundColor: "transparent" }}
                        >
                          {isDone && (
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                              <path d="M1.5 4L3 5.5L6.5 2" stroke={T.navy} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <span
                          className={cn("text-xs leading-snug", isDone && "line-through")}
                          style={{ color: isDone ? T.muted : T.navy + "d9" }}
                        >
                          {task.text}
                        </span>
                        {task.tag && (
                          <span className="ml-auto shrink-0 text-[10px] italic" style={{ color: T.muted }}>{task.tag}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                );
              })
            ) : (
              <>
                <div className="px-4 pt-3 pb-1">
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.15em]"
                    style={{ color: T.muted, fontFamily: "Inter, sans-serif" }}
                  >
                    Warmup
                  </p>
                </div>
                <div className="px-4 pb-2">
                  <p className="text-xs italic" style={{ color: T.muted }}>Scales, arpeggios, or exercises of your choice</p>
                </div>
                <div className="px-4 pt-2 pb-1" style={{ borderTop: `1px solid ${T.border}` }}>
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.15em]"
                    style={{ color: T.muted, fontFamily: "Inter, sans-serif" }}
                  >
                    Piece Practice
                  </p>
                </div>
                <div className="px-4 pb-3 pt-1">
                  <p className="text-xs" style={{ color: T.muted }}>
                    m.{lesson.measureStart}–{lesson.measureEnd}
                    {sheetId != null && (
                      <a
                        href={`/score/${sheetId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 underline underline-offset-2"
                        style={{ color: T.gold }}
                      >
                        view score ↗
                      </a>
                    )}
                  </p>
                </div>
              </>
            )}

            {isDone && (
              <div
                className="mx-4 mb-4 rounded-md px-3 py-2.5 flex flex-wrap items-center gap-2"
                style={{
                  border: `1px solid ${T.navy}35`,
                  backgroundColor: `${T.navy}0a`,
                }}
              >
                <p className="text-xs font-medium flex-1 min-w-0" style={{ color: T.navy }}>
                  &#10003; Completed{lesson.completedAt
                    ? " " + new Date(lesson.completedAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                      + " at " + new Date(lesson.completedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                    : ""}
                </p>
                <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 gap-1.5" asChild>
                  <Link href={`/session/${lesson.id}`}>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="shrink-0"><path d="M1.5 9.5L4 9l5-5-1.5-1.5-5 5-.5 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                    {lesson.userNotes ? "View notes" : "Add notes"}
                  </Link>
                </Button>
              </div>
            )}
            {isDone && lesson.userNotes && (
              <div
                className="mx-4 mb-4 rounded-md px-3 py-2.5"
                style={{ border: `1px solid ${T.border}`, backgroundColor: T.bg }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1"
                  style={{ color: T.muted, fontFamily: "Inter, sans-serif" }}
                >
                  Session notes
                </p>
                <p className="text-xs italic leading-relaxed line-clamp-3" style={{ color: T.muted }}>{lesson.userNotes}</p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <Layout>
      {/* ── Page wrapper ──────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: T.bg, minHeight: "100vh" }}>

        {/* ── Navy Header ───────────────────────────────────────────────── */}
        <div
          style={{
            backgroundColor: T.bg,
            borderBottom: `1px solid ${T.border}`,
            padding: "24px 32px",
          }}
        >
          {/* Back button row */}
          <div className="mb-4">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 -ml-2 hover:bg-black/8"
              style={{ color: T.muted }}
              asChild
            >
              <Link href="/home">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Link>
            </Button>
          </div>

          {showMissing && (
            <div
              className="mb-6 rounded-lg p-6"
              style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
            >
              <p style={{ color: T.muted }}>We couldn&apos;t load this plan.</p>
              <Button variant="link" asChild className="mt-2 px-0">
                <Link href="/home">Back to home</Link>
              </Button>
            </div>
          )}

          {planLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ) : plan ? (
            <div className="flex items-end justify-between gap-4 flex-wrap">
              {/* Left: titles */}
              <div>
                {/* Composer eyebrow — placeholder since plan doesn't carry composer name directly */}
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.15em] mb-1"
                  style={{ color: T.muted, fontFamily: "Inter, sans-serif" }}
                >
                  Learning Plan
                </p>
                {/* Piece title */}
                <h1
                  className="font-serif leading-tight"
                  style={{
                    fontSize: 36,
                    fontWeight: 400,
                    color: T.navy,
                    fontFamily: "Cormorant Garamond, Georgia, serif",
                  }}
                >
                  My Plan
                </h1>
                {/* Sub-row */}
                <p
                  className="mt-1"
                  style={{
                    fontSize: 12,
                    color: T.muted,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  {plan.totalMeasures ?? "—"} measures · {plan.dailyPracticeMinutes} min/day
                  {plan.targetCompletionDate && (
                    <span>
                      {" "}· Target{" "}
                      {new Date(plan.targetCompletionDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </p>
              </div>

              {/* Right: actions */}
              <div className="flex items-center gap-2 shrink-0">
                {sheetId != null && (
                  <a
                    href={`/score/${sheetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm rounded-md px-2.5 py-1.5 transition-colors hover:opacity-80"
                    style={{
                      color: T.muted,
                      border: `1px solid ${T.border}`,
                      backgroundColor: T.card,
                    }}
                  >
                    <Music2 className="w-3.5 h-3.5" />
                    Full score
                  </a>
                )}
                <Button
                  size="sm"
                  className="shrink-0"
                  style={{ backgroundColor: T.navy, color: T.bg }}
                  onClick={() => setPaceDialogOpen(true)}
                >
                  Regenerate
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {plan && (
          <RegeneratePaceDialog
            open={paceDialogOpen}
            onOpenChange={setPaceDialogOpen}
            planId={plan.id}
            sheetMusicId={plan.sheetMusicId}
            movementId={plan.movementId}
            initialDailyMinutes={plan.dailyPracticeMinutes}
          />
        )}

        {/* ── Suggestions banner ─────────────────────────────────────────── */}
        {suggestions.length > 0 && (
          <div className="px-8 pt-6 space-y-2">
            <h2
              className="text-[11px] font-bold uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5"
              style={{ color: T.muted, fontFamily: "Inter, sans-serif" }}
            >
              <Lightbulb className="w-3.5 h-3.5" style={{ color: T.gold }} />
              Suggestions
            </h2>
            {suggestions.map((s) => (
              <div
                key={s.id}
                className="rounded-xl p-4 flex gap-3"
                style={{
                  border: `1px solid ${T.gold}50`,
                  backgroundColor: `${T.gold}12`,
                }}
              >
                <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" style={{ color: T.gold }} />
                <p className="text-sm flex-1" style={{ color: T.navy + "cc" }}>{s.payload.message}</p>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => acceptSuggestion.mutate(s.id)}
                    className="p-1 rounded transition-colors hover:bg-green-100"
                    title="Accept suggestion"
                    style={{ color: "#4a7c59" }}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => dismissSuggestion.mutate(s.id)}
                    className="p-1 rounded transition-colors hover:bg-black/10"
                    title="Dismiss"
                    style={{ color: T.muted }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Recalibrate prompt ─────────────────────────────────────────── */}
        {showRecalibratePrompt && (
          <div className="px-8 pt-4">
            <RecalibratePrompt
              planId={planId}
              sections={sections}
              onDismiss={() => {
                localStorage.setItem(`practivo_recalibrate_dismissed_${planId}`, "1");
                setRecalibrateDismissed(true);
              }}
            />
          </div>
        )}

        {/* ── Trouble spots card ─────────────────────────────────────────── */}
        {flagSummary.length > 0 && (
          <div className="px-8 pt-6">
            <Collapsible>
              <CollapsibleTrigger
                className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] w-full transition-colors hover:opacity-70 [&[data-state=open]>svg:last-child]:rotate-180"
                style={{ color: T.muted, fontFamily: "Inter, sans-serif" }}
              >
                <Flag className="w-3.5 h-3.5" style={{ color: T.gold }} />
                Trouble spots ({flagSummary.filter((f) => f.resolvedCount < f.flagCount).length})
                <ChevronDown className="w-3.5 h-3.5 ml-auto transition-transform" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-wrap gap-2 mt-3">
                  {flagSummary.map((f) => {
                    const unresolved = f.flagCount - f.resolvedCount;
                    return (
                      <div
                        key={f.measureId}
                        className={cn("relative rounded-md border overflow-hidden", unresolved === 0 && "opacity-50")}
                        style={{
                          border: unresolved > 0 ? `1px solid ${T.gold}` : `1px solid ${T.border}`,
                        }}
                      >
                        {f.imageUrl ? (
                          <img src={f.imageUrl} alt={`Bar ${f.measureNumber}`} className="w-[68px] h-16 object-cover object-top bg-white" />
                        ) : (
                          <div
                            className="w-[68px] h-16 flex items-center justify-center text-[10px]"
                            style={{ color: T.muted, backgroundColor: T.card }}
                          >
                            m.{f.measureNumber}
                          </div>
                        )}
                        <div
                          className="text-[10px] text-center py-0.5"
                          style={{ backgroundColor: T.card, color: T.muted }}
                        >
                          {f.measureNumber}
                        </div>
                        {unresolved > 0 && (
                          <div
                            className="absolute top-1 right-1 w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center font-bold"
                            style={{ backgroundColor: T.gold }}
                          >
                            {unresolved}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* ── Two-column section: Score + Movement Map ───────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 300px",
            gap: 24,
            padding: "24px 32px",
          }}
          className="max-lg:block max-lg:px-4 max-lg:py-6"
        >
          {/* Left column: Score view */}
          <div>
            {plan && sheetId != null && lessons.length > 0 && measuresUsePageGeometry(measures) && (
              <PlanScoreView
                sheetMusicId={sheetId}
                lessons={lessons}
                sections={sections}
                measures={measures}
              />
            )}
            {plan && lessons.length > 0 && <PhaseLegend />}
          </div>

          {/* Right column: Movement Map */}
          <div className="max-lg:mt-6">
            {lessons.length > 0 && <MovementMap lessons={lessons} />}
          </div>
        </div>

        {/* ── Lesson list ────────────────────────────────────────────────── */}
        {plan && (
          <div style={{ padding: "0 32px 80px" }} className="max-lg:px-4">
            <h2
              className="text-[11px] font-bold uppercase tracking-[0.15em] mb-4"
              style={{ color: T.muted, fontFamily: "Inter, sans-serif" }}
            >
              Days
            </h2>

            {lessonsLoading && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    {[1, 2, 3].map((j) => <Skeleton key={j} className="h-14 w-full rounded-lg" />)}
                  </div>
                ))}
              </div>
            )}

            {!lessonsLoading && sortedLessons.length === 0 && (
              <p className="text-sm" style={{ color: T.muted }}>
                No lesson days yet. Finish creating your plan from the piece sidebar, or regenerate lessons from the wizard.
              </p>
            )}

            {!lessonsLoading && sortedLessons.length > 0 && (
              <>
                {/* ── Desktop: 3 columns ───────────────────────────────── */}
                <div className="hidden lg:grid lg:grid-cols-3 lg:gap-5 lg:items-start">

                  {/* Completed column */}
                  <div
                    className="rounded-xl p-3"
                    style={{
                      backgroundColor: `${T.navy}06`,
                      border: `1px solid ${T.navy}18`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: T.navy }}
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <span
                        className="text-[11px] font-bold uppercase tracking-[0.15em]"
                        style={{ color: T.navy, fontFamily: "Inter, sans-serif" }}
                      >
                        Completed
                      </span>
                      <span className="ml-auto text-xs tabular-nums" style={{ color: T.muted }}>
                        {completedLessons.length}
                      </span>
                    </div>
                    <div className="max-h-[70vh] overflow-y-auto space-y-2 pr-0.5">
                      {completedLessons.length === 0 ? (
                        <p className="text-xs text-center py-6" style={{ color: T.muted }}>No completed sessions yet.</p>
                      ) : (
                        <>
                          {visibleCompleted.map((lesson) =>
                            renderCard(lesson, sortedLessons.indexOf(lesson))
                          )}
                          {completedLessons.length > 5 && (
                            <button
                              onClick={() => setShowAllCompleted((v) => !v)}
                              className="w-full text-xs py-2 text-center transition-opacity hover:opacity-70"
                              style={{ color: T.muted }}
                            >
                              {showAllCompleted
                                ? "Show less"
                                : `Show ${completedLessons.length - 5} older`}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Current column */}
                  <div
                    className="rounded-xl p-3"
                    style={{
                      backgroundColor: `${T.gold}12`,
                      border: `1px solid ${T.gold}40`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <CalendarDays className="w-4 h-4 shrink-0" style={{ color: T.gold }} />
                      <span
                        className="text-[11px] font-bold uppercase tracking-[0.15em]"
                        style={{ color: "#6b4f1a", fontFamily: "Inter, sans-serif" }}
                      >
                        {nextLesson?.scheduledDate === todayIso ? "Today" : "Next Session"}
                      </span>
                    </div>
                    <div className="max-h-[70vh] overflow-y-auto pr-0.5">
                      {nextLesson ? (
                        renderCard(nextLesson, sortedLessons.indexOf(nextLesson))
                      ) : (
                        <div
                          className="rounded-lg p-6 text-center"
                          style={{
                            border: `1px solid ${T.navy}35`,
                            backgroundColor: `${T.navy}08`,
                          }}
                        >
                          <div
                            className="w-8 h-8 rounded-full mx-auto mb-3 flex items-center justify-center"
                            style={{ backgroundColor: T.navy }}
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M3 7l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          </div>
                          <p className="text-sm font-medium" style={{ color: T.navy }}>Plan complete!</p>
                          <p className="text-xs mt-1" style={{ color: T.muted }}>All sessions finished.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Upcoming column */}
                  <div
                    className="rounded-xl p-3"
                    style={{
                      backgroundColor: `${T.bg}`,
                      border: `1px solid ${T.border}`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <ArrowRight className="w-4 h-4 shrink-0" style={{ color: T.muted }} />
                      <span
                        className="text-[11px] font-bold uppercase tracking-[0.15em]"
                        style={{ color: T.muted, fontFamily: "Inter, sans-serif" }}
                      >
                        Upcoming
                      </span>
                      <span className="ml-auto text-xs tabular-nums" style={{ color: T.muted }}>
                        {futureLessons.length}
                      </span>
                    </div>
                    <div className="max-h-[70vh] overflow-y-auto space-y-2 pr-0.5">
                      {futureLessons.length === 0 && nextLesson && (
                        <p className="text-xs text-center py-6" style={{ color: T.muted }}>This is the last session.</p>
                      )}
                      {futureLessons.map((lesson) =>
                        renderCard(lesson, sortedLessons.indexOf(lesson), "future")
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Mobile: tabs ─────────────────────────────────────── */}
                <div className="lg:hidden">
                  <Tabs defaultValue="current">
                    <TabsList className="w-full grid grid-cols-3 mb-4">
                      <TabsTrigger value="completed">Done ({completedLessons.length})</TabsTrigger>
                      <TabsTrigger value="current">
                        {nextLesson?.scheduledDate === todayIso ? "Today" : "Next"}
                      </TabsTrigger>
                      <TabsTrigger value="upcoming">Upcoming ({futureLessons.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="completed" className="space-y-2">
                      {completedLessons.length === 0 ? (
                        <p className="text-xs text-center py-6" style={{ color: T.muted }}>No completed sessions yet.</p>
                      ) : (
                        <>
                          {visibleCompleted.map((lesson) =>
                            renderCard(lesson, sortedLessons.indexOf(lesson))
                          )}
                          {completedLessons.length > 5 && (
                            <button
                              onClick={() => setShowAllCompleted((v) => !v)}
                              className="w-full text-xs py-2 text-center"
                              style={{ color: T.muted }}
                            >
                              {showAllCompleted ? "Show less" : `Show ${completedLessons.length - 5} older`}
                            </button>
                          )}
                        </>
                      )}
                    </TabsContent>

                    <TabsContent value="current">
                      {nextLesson
                        ? renderCard(nextLesson, sortedLessons.indexOf(nextLesson))
                        : <p className="text-sm text-center py-6" style={{ color: T.navy }}>Plan complete!</p>
                      }
                    </TabsContent>

                    <TabsContent value="upcoming" className="space-y-2">
                      {futureLessons.length === 0 ? (
                        <p className="text-xs text-center py-6" style={{ color: T.muted }}>This is the last session.</p>
                      ) : (
                        futureLessons.map((lesson) =>
                          renderCard(lesson, sortedLessons.indexOf(lesson), "future")
                        )
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </>
            )}

            {/* ── About phases ─────────────────────────────────────────── */}
            <Collapsible className="mt-8">
              <CollapsibleTrigger
                className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] w-full transition-opacity hover:opacity-70 [&[data-state=open]>svg:last-child]:rotate-180"
                style={{ color: T.muted, fontFamily: "Inter, sans-serif" }}
              >
                <HelpCircle className="w-3.5 h-3.5" />
                About phases
                <ChevronDown className="w-3.5 h-3.5 ml-auto transition-transform" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div
                  className="mt-3 rounded-xl overflow-hidden divide-y"
                  style={{
                    border: `1px solid ${T.border}`,
                    backgroundColor: T.card,
                  }}
                >
                  {PHASE_TYPES.map((phase) => {
                    const info = PHASE_LABELS[phase as PhaseType];
                    const c = getPhaseColor(phase);
                    return (
                      <div
                        key={phase}
                        className="flex items-start gap-3 px-4 py-3"
                        style={{ borderColor: T.border }}
                      >
                        <div
                          className="mt-0.5 w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: c.bg, border: `2px solid ${c.border}` }}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-tight" style={{ color: T.navy }}>{info.label}</p>
                          <p className="text-xs mt-0.5 leading-snug" style={{ color: T.muted }}>{info.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

      </div>
    </Layout>
  );
}
