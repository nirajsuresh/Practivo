import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronDown, ArrowLeft, CalendarDays, ArrowRight,
  Flag, Lightbulb, X, Check, Music2, HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { measuresUsePageGeometry, useSheetPageUrl } from "@/lib/sheet-page";
import { apiRequest } from "@/lib/queryClient";
import { getSectionColor, getPhaseColor, PHASE_COLORS } from "@/lib/palette";
import { PHASE_TYPES, PHASE_LABELS, type PhaseType } from "@shared/schema";

type LearningPlan = {
  id: number;
  repertoireEntryId: number;
  sheetMusicId: number | null;
  dailyPracticeMinutes: number;
  targetCompletionDate: string | null;
  totalMeasures: number | null;
  status: string;
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

// ── PhaseLegend ───────────────────────────────────────────────────────────────

function PhaseLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4 rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
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
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Phase legend
          </span>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border/60 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PHASE_TYPES.map((pt, i) => {
            const color = PHASE_COLORS[pt];
            const info = PHASE_LABELS[pt];
            return (
              <div key={pt} className="flex items-start gap-2.5">
                <div
                  className="mt-0.5 w-3 h-3 shrink-0 rounded-sm border-2"
                  style={{ borderColor: color.border, backgroundColor: color.bg }}
                />
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-foreground/90">{info.label}</span>
                  <span className="text-[11px] text-muted-foreground/70 block leading-snug">{info.description}</span>
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
  // Each task covers a sub-range (parsed from label or explicit fields) with its own phase.
  const NEUTRAL = { border: "#8A877F", bg: "rgba(138,135,127,0.10)" };

  function parseLabelRange(label: string): { start: number; end: number } | null {
    const m = label.match(/mm\.\s*(\d+)[–\-–](\d+)/);
    if (m) return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
    const s = label.match(/mm\.\s*(\d+)/);
    if (s) return { start: parseInt(s[1], 10), end: parseInt(s[1], 10) };
    return null;
  }

  // measureColor: measureNumber → { border, bg }
  const measureColorMap = new Map<number, { border: string; bg: string }>();
  const practiceTasks = lesson.tasks?.filter((t) => t.type === "piece_practice") ?? [];

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

  // Fallback: if no task-level ranges resolved, color the whole lesson range uniformly
  if (measureColorMap.size === 0) {
    const effectivePhaseType =
      lesson.phaseType ??
      lesson.tasks?.find((t) => t.type === "piece_practice" && t.phaseType)?.phaseType ??
      null;
    const fallback = effectivePhaseType ? getPhaseColor(effectivePhaseType) : NEUTRAL;
    for (let n = lesson.measureStart; n <= lesson.measureEnd; n++) measureColorMap.set(n, fallback);
  }

  // For the summary header: use the first practice task's phase
  const effectivePhaseType =
    lesson.phaseType ??
    lesson.tasks?.find((t) => t.type === "piece_practice" && t.phaseType)?.phaseType ??
    null;

  // Summary line metadata
  const dateLabel = new Date(lesson.scheduledDate + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
  // lesson.sectionId may be null for older plans; fall back to task-level sectionId
  const effectiveSectionId =
    lesson.sectionId ??
    lesson.tasks?.find((t) => t.type === "piece_practice" && t.sectionId != null)?.sectionId ??
    null;
  const sectionForLesson = effectiveSectionId != null ? sections.find((s) => s.id === effectiveSectionId) : null;
  const phaseInfo = effectivePhaseType ? PHASE_LABELS[effectivePhaseType as PhaseType] : null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Sticky header — slider + summary */}
      <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm px-5 pt-4 pb-3 border-b border-border/60 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Score</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
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
          <span className="font-medium text-foreground">{dateLabel}</span>
          {sectionForLesson && (
            <><span className="text-muted-foreground/40">·</span>
            <span className="text-muted-foreground">{sectionForLesson.name}</span></>
          )}
          {phaseInfo && (
            <><span className="text-muted-foreground/40">·</span>
            <span className="font-medium text-foreground/70">{phaseInfo.label}</span></>
          )}
          <span className="text-muted-foreground/40">·</span>
          <span className="font-mono text-muted-foreground">
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
              className="relative rounded overflow-hidden border border-border/30 bg-neutral-50"
            >
              {/* Page label — first in each row only */}
              {isFirstInRow && (
                <span className="absolute top-1 left-1 z-10 text-[9px] text-white/80 font-bold bg-black/35 rounded px-1 py-0.5 leading-none select-none">
                  p.{pageNum}
                </span>
              )}

              <img
                src={getPageUrl(pageNum)}
                alt={`Page ${pageNum}`}
                className="w-full h-auto block"
                loading="lazy"
              />

              {/* Context bars — very faint dim, no interaction */}
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

              {/* Lesson bars — colored per task phase + tooltip */}
              {lessonBars.map((m) => {
                const barColor = measureColorMap.get(m.measureNumber) ?? NEUTRAL;
                // Find which task this bar belongs to for the tooltip
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
                      <p className="font-mono text-muted-foreground">m.{m.measureNumber}</p>
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

  const { data: measures = [] } = useQuery<MeasureRow[]>({
    queryKey: [`/api/sheet-music/${sheetId}/measures`],
    enabled: sheetId != null && sheetId > 0,
  });

  const [showAllCompleted, setShowAllCompleted] = useState(false);

  const sortedSections = [...sections].sort((a, b) => a.measureStart - b.measureStart);
  const sectionColorMap = new Map(sortedSections.map((s, i) => [s.id, getSectionColor(i)]));

  if (!Number.isFinite(planId) || planId <= 0) {
    return (
      <Layout>
        <div className="container max-w-3xl mx-auto px-4 py-12">
          <p className="text-muted-foreground">Invalid plan.</p>
          <Button variant="link" asChild className="mt-2 px-0">
            <Link href="/profile">Back to profile</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const sortedLessons = [...lessons].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const nextLesson = sortedLessons.find((l) => l.status !== "completed");
  const todayIso = new Date().toISOString().slice(0, 10);

  // ── Three time-state buckets for the 3-column layout ──────────────────────
  const completedLessons = sortedLessons.filter((l) => l.status === "completed");
  const futureLessons = sortedLessons.filter(
    (l) => l.status !== "completed" && l.id !== nextLesson?.id,
  );
  const visibleCompleted = showAllCompleted
    ? completedLessons
    : completedLessons.slice(-5); // most recent 5

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
        className={cn(
          "rounded-lg border bg-card overflow-hidden",
          isDone && "border-l-2 border-l-[#729E8F]",
          isNext && !isDone && "border-l-2 border-l-[#C8B388]",
          !isDone && !isNext && variant === "future" && "border-l-2 border-l-sky-300",
          !isDone && !isNext && variant !== "future" && "opacity-70",
        )}
      >
        <div className="flex items-stretch gap-2 sm:gap-3 p-2 sm:p-3">
          <CollapsibleTrigger className="flex flex-1 min-w-0 items-center justify-between gap-3 px-2 sm:px-3 py-2 text-left hover:bg-muted/40 rounded-lg transition-colors [&[data-state=open]>svg:first-of-type]:rotate-180">
            <div className="flex items-center gap-2 min-w-0">
              <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground transition-transform" />
              <div className="min-w-0">
                <p className="font-medium text-sm flex items-center gap-1.5 flex-wrap">
                  Day {idx + 1}
                  {isDone && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#729E8F]/12 text-[#3d7065] border border-[#729E8F]/35">
                      Done
                    </span>
                  )}
                  {isNext && !isDone && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#DCCAA6]/35 text-[#6b5732] border border-[#C8B388]/50">
                      {isToday ? "Today" : "Next"}
                    </span>
                  )}
                  <span className="text-muted-foreground font-normal">&middot; {label}</span>
                </p>
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
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
              isDone && "shadow-none bg-muted text-muted-foreground hover:bg-muted",
              isNext && !isDone && "shadow-md",
            )}
            asChild
          >
            <Link href={`/session/${lesson.id}`} title="Open practice session for this day">
              Session
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>

        <CollapsibleContent>
          <div className="border-t border-border/60">
            {/* Structured session sections */}
            {lesson.tasks && lesson.tasks.length > 0 ? (
              lesson.tasks.map((section, sIdx) => {
                const taskColor = section.phaseType
                  ? getPhaseColor(section.phaseType)
                  : (section.sectionId ? sectionColorMap.get(section.sectionId) : null) ?? null;
                return (
                <div
                  key={`${section.type}-${sIdx}`}
                  className={cn(sIdx > 0 && "border-t border-border/40")}
                  style={taskColor ? { borderLeft: `3px solid ${taskColor.border}`, backgroundColor: taskColor.bg } : undefined}
                >
                  <div className="px-4 pt-3 pb-1 flex items-baseline gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{section.label}</p>
                    {section.durationMin && (
                      <span className="text-[10px] text-muted-foreground/60">{section.durationMin} min</span>
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
                        <div className={cn(
                          "mt-[3px] w-3.5 h-3.5 shrink-0 rounded-sm border flex items-center justify-center",
                          isDone ? "border-[#729E8F] bg-[#729E8F]/15" : "border-border bg-transparent",
                        )}>
                          {isDone && (
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                              <path d="M1.5 4L3 5.5L6.5 2" stroke="#729E8F" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <span className={cn(
                          "text-xs leading-snug",
                          isDone ? "text-muted-foreground line-through" : "text-foreground/85",
                        )}>{task.text}</span>
                        {task.tag && (
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60 italic">{task.tag}</span>
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
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Warmup</p>
                </div>
                <div className="px-4 pb-2">
                  <p className="text-xs text-muted-foreground italic">Scales, arpeggios, or exercises of your choice</p>
                </div>
                <div className="px-4 pt-2 pb-1 border-t border-border/40">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Piece Practice</p>
                </div>
                <div className="px-4 pb-3 pt-1">
                  <p className="text-xs text-muted-foreground">
                    m.{lesson.measureStart}–{lesson.measureEnd}
                    {sheetId != null && (
                      <a
                        href={`/score/${sheetId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 underline underline-offset-2 hover:text-foreground"
                      >
                        view score ↗
                      </a>
                    )}
                  </p>
                </div>
              </>
            )}

            {isDone && (
              <div className="mx-4 mb-4 rounded-md border border-[#729E8F]/35 bg-[#729E8F]/8 px-3 py-2.5 flex flex-wrap items-center gap-2">
                <p className="text-xs text-[#3d7065] font-medium flex-1 min-w-0">
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
              <div className="mx-4 mb-4 rounded-md border border-border bg-background/50 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Session notes</p>
                <p className="text-xs text-muted-foreground italic leading-relaxed line-clamp-3">{lesson.userNotes}</p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <Layout>
      <div className="container max-w-7xl mx-auto px-4 py-8 pb-20">
        <Button variant="ghost" size="sm" className="mb-6 gap-1 -ml-2" asChild>
          <Link href="/profile">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
        </Button>

        {showMissing && (
          <div className="mb-8 rounded-lg border border-border bg-card p-6">
            <p className="text-muted-foreground">We couldn&apos;t load this plan.</p>
            <Button variant="link" asChild className="mt-2 px-0">
              <Link href="/profile">Back to profile</Link>
            </Button>
          </div>
        )}

        {planLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : plan ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-serif text-2xl font-semibold tracking-tight">Learning plan</h1>
              {sheetId != null && (
                <a
                  href={`/score/${sheetId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md border border-border/60 px-2.5 py-1.5 bg-card"
                >
                  <Music2 className="w-3.5 h-3.5" />
                  Full score
                </a>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {plan.targetCompletionDate && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Target {new Date(plan.targetCompletionDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              )}
              <span>{plan.dailyPracticeMinutes} min/day</span>
              {plan.totalMeasures != null && <span>{plan.totalMeasures} bars</span>}
            </div>
          </>
        ) : null}

        {/* ── Suggestions banner ─────────────────────────────────────────── */}
        {suggestions.length > 0 && (
          <div className="mt-8 space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
              Suggestions
            </h2>
            {suggestions.map((s) => (
              <div key={s.id} className="rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 p-4 flex gap-3">
                <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm flex-1 text-foreground/80">{s.payload.message}</p>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => acceptSuggestion.mutate(s.id)}
                    className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 transition-colors"
                    title="Accept suggestion"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => dismissSuggestion.mutate(s.id)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                    title="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Trouble spots card ─────────────────────────────────────────── */}
        {flagSummary.length > 0 && (
          <Collapsible className="mt-6">
            <CollapsibleTrigger className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground w-full hover:text-foreground transition-colors [&[data-state=open]>svg:last-child]:rotate-180">
              <Flag className="w-3.5 h-3.5 text-amber-500" />
              Trouble spots ({flagSummary.filter((f) => f.resolvedCount < f.flagCount).length})
              <ChevronDown className="w-3.5 h-3.5 ml-auto transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="flex flex-wrap gap-2 mt-3">
                {flagSummary.map((f) => {
                  const unresolved = f.flagCount - f.resolvedCount;
                  return (
                    <div key={f.measureId} className={cn("relative rounded-md border overflow-hidden", unresolved > 0 ? "border-amber-300" : "border-border opacity-50")}>
                      {f.imageUrl ? (
                        <img src={f.imageUrl} alt={`Bar ${f.measureNumber}`} className="w-[68px] h-16 object-cover object-top bg-white" />
                      ) : (
                        <div className="w-[68px] h-16 flex items-center justify-center text-[10px] text-muted-foreground bg-muted">
                          m.{f.measureNumber}
                        </div>
                      )}
                      <div className="text-[10px] text-center py-0.5 bg-muted/50 text-muted-foreground">
                        {f.measureNumber}
                      </div>
                      {unresolved > 0 && (
                        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-bold">
                          {unresolved}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="mt-8 space-y-6">

            {/* Score view */}
            {plan && sheetId != null && lessons.length > 0 && measuresUsePageGeometry(measures) && (
              <PlanScoreView
                sheetMusicId={sheetId}
                lessons={lessons}
                sections={sections}
                measures={measures}
              />
            )}

            {/* Phase legend */}
            {plan && lessons.length > 0 && <PhaseLegend />}

        {plan && (
          <div className="mt-0">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Days</h2>

            {/* Loading skeletons */}
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
              <p className="text-sm text-muted-foreground">
                No lesson days yet. Finish creating your plan from the piece sidebar, or regenerate lessons from the wizard.
              </p>
            )}

            {!lessonsLoading && sortedLessons.length > 0 && (
              <>
                {/* ── Desktop: 3 columns ───────────────────────────────────── */}
                <div className="hidden lg:grid lg:grid-cols-3 lg:gap-5 lg:items-start">

                  {/* Completed column */}
                  <div className="rounded-xl bg-[#729E8F]/5 border border-[#729E8F]/15 p-3">
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <div className="w-5 h-5 rounded-full bg-[#729E8F] flex items-center justify-center shrink-0">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <span className="text-xs font-bold uppercase tracking-widest text-[#3d7065]">Completed</span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">{completedLessons.length}</span>
                    </div>
                    <div className="max-h-[70vh] overflow-y-auto space-y-2 pr-0.5">
                      {completedLessons.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-6">No completed sessions yet.</p>
                      ) : (
                        <>
                          {visibleCompleted.map((lesson) =>
                            renderCard(lesson, sortedLessons.indexOf(lesson))
                          )}
                          {completedLessons.length > 5 && (
                            <button
                              onClick={() => setShowAllCompleted((v) => !v)}
                              className="w-full text-xs text-muted-foreground hover:text-foreground py-2 text-center transition-colors"
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
                  <div className="rounded-xl bg-[#DCCAA6]/15 border border-[#C8B388]/30 p-3">
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <CalendarDays className="w-4 h-4 text-[#C8B388] shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-widest text-[#6b5732]">
                        {nextLesson?.scheduledDate === todayIso ? "Today" : "Next Session"}
                      </span>
                    </div>
                    <div className="max-h-[70vh] overflow-y-auto pr-0.5">
                      {nextLesson ? (
                        renderCard(nextLesson, sortedLessons.indexOf(nextLesson))
                      ) : (
                        <div className="rounded-lg border border-[#729E8F]/40 p-6 text-center" style={{ backgroundColor: "rgba(114,158,143,0.08)" }}>
                          <div className="w-8 h-8 rounded-full bg-[#729E8F] mx-auto mb-3 flex items-center justify-center">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M3 7l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          </div>
                          <p className="text-sm font-medium text-[#3d7065]">Plan complete!</p>
                          <p className="text-xs text-muted-foreground mt-1">All sessions finished.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Upcoming column */}
                  <div className="rounded-xl bg-sky-50/50 border border-sky-200/40 p-3">
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <ArrowRight className="w-4 h-4 text-sky-400 shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-widest text-sky-600">Upcoming</span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">{futureLessons.length}</span>
                    </div>
                    <div className="max-h-[70vh] overflow-y-auto space-y-2 pr-0.5">
                      {futureLessons.length === 0 && nextLesson && (
                        <p className="text-xs text-muted-foreground text-center py-6">This is the last session.</p>
                      )}
                      {futureLessons.map((lesson) =>
                        renderCard(lesson, sortedLessons.indexOf(lesson), "future")
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Mobile: tabs ─────────────────────────────────────────── */}
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
                        <p className="text-xs text-muted-foreground text-center py-6">No completed sessions yet.</p>
                      ) : (
                        <>
                          {visibleCompleted.map((lesson) =>
                            renderCard(lesson, sortedLessons.indexOf(lesson))
                          )}
                          {completedLessons.length > 5 && (
                            <button
                              onClick={() => setShowAllCompleted((v) => !v)}
                              className="w-full text-xs text-muted-foreground hover:text-foreground py-2 text-center"
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
                        : <p className="text-sm text-center text-[#3d7065] py-6">Plan complete!</p>
                      }
                    </TabsContent>

                    <TabsContent value="upcoming" className="space-y-2">
                      {futureLessons.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-6">This is the last session.</p>
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
          </div>
        )}

        {/* ── About phases legend ────────────────────────────────────────── */}
        {plan && (
          <Collapsible className="mt-6">
            <CollapsibleTrigger className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground w-full hover:text-foreground transition-colors [&[data-state=open]>svg:last-child]:rotate-180">
              <HelpCircle className="w-3.5 h-3.5" />
              About phases
              <ChevronDown className="w-3.5 h-3.5 ml-auto transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 rounded-xl border border-border bg-card overflow-hidden divide-y divide-border/60">
                {PHASE_TYPES.map((phase) => {
                  const info = PHASE_LABELS[phase as PhaseType];
                  const c = getPhaseColor(phase);
                  return (
                    <div key={phase} className="flex items-start gap-3 px-4 py-3">
                      <div
                        className="mt-0.5 w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: c.bg, border: `2px solid ${c.border}` }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-tight">{info.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{info.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        </div>

      </div>

    </Layout>
  );
}
