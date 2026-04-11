import { useParams, Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, MouseEvent as ReactMouseEvent } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { measuresUsePageGeometry, sheetPageImageUrl } from "@/lib/sheet-page";

// ── Types ────────────────────────────────────────────────────────────────────

type SessionTask = { text: string; tag?: string };
type SessionSection = {
  type: string;
  label: string;
  durationMin?: number;
  tasks: SessionTask[];
};

type LessonDay = {
  id: number;
  learningPlanId: number;
  scheduledDate: string;
  measureStart: number;
  measureEnd: number;
  status: string;
  userNotes: string | null;
  completedAt: string | null;
  tasks: SessionSection[] | null;
};

type LearningPlan = {
  id: number;
  dailyPracticeMinutes: number;
  targetCompletionDate: string | null;
  sheetMusicId: number | null;
};

type SessionBundle = {
  lesson: LessonDay;
  plan: LearningPlan;
  pieceTitle: string;
  composerName: string;
  dayIndex: number;
};

type BoundingBox = { x: number; y: number; w: number; h: number };

type MeasureRow = {
  id: number;
  measureNumber: number;
  pageNumber: number | null;
  boundingBox: BoundingBox | null;
  imageUrl: string | null;
};

/** Group a sorted list of measures into systems (horizontal rows as they appear in the score).
 *  Measures on the same page whose y-coordinates are within `tolerance` of each other
 *  belong to the same system. */
function groupIntoSystems(bars: MeasureRow[], tolerance = 0.04): MeasureRow[][] {
  if (bars.length === 0) return [];
  // Sort: page asc → y asc → x asc
  const sorted = [...bars].sort((a, b) => {
    const pa = a.pageNumber ?? 0;
    const pb = b.pageNumber ?? 0;
    if (pa !== pb) return pa - pb;
    const ya = a.boundingBox?.y ?? 0;
    const yb = b.boundingBox?.y ?? 0;
    if (Math.abs(ya - yb) > tolerance) return ya - yb;
    return (a.boundingBox?.x ?? 0) - (b.boundingBox?.x ?? 0);
  });

  const systems: MeasureRow[][] = [];
  let current: MeasureRow[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = current[current.length - 1];
    const curr = sorted[i];
    const samePage = (prev.pageNumber ?? 0) === (curr.pageNumber ?? 0);
    const sameRow =
      samePage &&
      Math.abs((prev.boundingBox?.y ?? 0) - (curr.boundingBox?.y ?? 0)) < tolerance;

    if (sameRow) {
      current.push(curr);
    } else {
      systems.push(current);
      current = [curr];
    }
  }
  systems.push(current);
  return systems;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatSessionDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function taskKey(sIdx: number, tIdx: number) {
  return `${sIdx}:${tIdx}`;
}

/** Gold square brackets flanking the session’s first / last bar on a full page (normalized 0–1 coords). */
function SessionRangeBrackets({
  box,
  side,
}: {
  box: BoundingBox;
  side: "left" | "right";
}) {
  const padY = 0.012;
  const gap = 0.005;
  const depth = 0.024;
  const top = Math.max(0, box.y - padY);
  const bottom = Math.min(1, box.y + box.h + padY);
  const heightPct = (bottom - top) * 100;
  const topPct = top * 100;

  const leftPct =
    side === "left"
      ? Math.max(0, box.x - gap - depth) * 100
      : (box.x + box.w + gap) * 100;
  const widthPct = depth * 100;

  return (
    <div
      className={cn(
        "absolute z-[5] pointer-events-none box-border rounded-[2px]",
        "border-[#B8983D] shadow-[0_0_0_1px_rgba(90,70,20,0.25),0_2px_14px_rgba(184,152,61,0.35)]",
        side === "left" && "border-l-[5px] border-t-[5px] border-b-[5px] border-r-0",
        side === "right" && "border-r-[5px] border-t-[5px] border-b-[5px] border-l-0",
      )}
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${widthPct}%`,
        height: `${heightPct}%`,
      }}
      aria-hidden
    />
  );
}

// ── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  section,
  sIdx,
  state,
  checkedTasks,
  onCheck,
  barSystems,
  allBars,
  focusedBarIdx,
  onFocusBar,
  sheetId,
}: {
  section: SessionSection;
  sIdx: number;
  state: "done" | "active" | "upcoming";
  checkedTasks: Set<string>;
  onCheck: (key: string) => void;
  barSystems: MeasureRow[][];
  allBars: MeasureRow[];
  focusedBarIdx: number | null;
  onFocusBar: (idx: number | null) => void;
  sheetId: number | null;
}) {
  const [heightScale, setHeightScale] = useState(1);
  const [hoveredBarIdx, setHoveredBarIdx] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startScale: number } | null>(null);
  const scoreInnerRef = useRef<HTMLDivElement>(null);
  const [naturalScoreH, setNaturalScoreH] = useState<number | null>(null);

  function startResize(e: ReactMouseEvent) {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startScale: heightScale };
    const onMove = (ev: globalThis.MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientY - dragRef.current.startY;
      // 200px drag = 1x scale change; clamp between 0.4× and 5×
      const next = Math.max(0.4, Math.min(5, dragRef.current.startScale + delta / 200));
      setHeightScale(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Touch resize support
  function startResizeTouch(e: React.TouchEvent) {
    const touch = e.touches[0];
    dragRef.current = { startY: touch.clientY, startScale: heightScale };
    const onMove = (ev: TouchEvent) => {
      if (!dragRef.current) return;
      const t = ev.touches[0];
      const delta = t.clientY - dragRef.current.startY;
      const next = Math.max(0.4, Math.min(5, dragRef.current.startScale + delta / 200));
      setHeightScale(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp);
  }

  const isDone = state === "done";
  const isActive = state === "active";
  const allChecked = section.tasks.length > 0 && section.tasks.every((_, tIdx) => checkedTasks.has(taskKey(sIdx, tIdx)));

  const useFullPageScore =
    sheetId != null && allBars.length > 0 && measuresUsePageGeometry(allBars);
  const scorePageNumbers = useFullPageScore
    ? Array.from(new Set(allBars.map((b) => b.pageNumber!))).sort((a, b) => a - b)
    : [];

  const barsByMeasure = [...allBars].sort((a, b) => a.measureNumber - b.measureNumber);
  const sessionFirstBar = barsByMeasure[0];
  const sessionLastBar = barsByMeasure[barsByMeasure.length - 1];

  return (
    <div
      className={cn(
        "mt-4 rounded-lg border overflow-hidden",
        isDone && "border-[#729E8F]/50",
        isActive && "border-[#C8B388] shadow-[0_0_0_1px_#C8B388]",
        !isDone && !isActive && "border-border/80",
      )}
    >
      {/* Section header */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3 border-b",
          isDone && "bg-[#729E8F]/12 border-b-[#729E8F]/40",
          isActive && "bg-[#DCCAA6]/18 border-b-[#C8B388]/35",
          !isDone && !isActive && "bg-card border-b-border",
        )}
      >
        <span
          className={cn(
            "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest",
            isDone && "text-[#3d7065]",
            isActive && "text-[#6b5732]",
            !isDone && !isActive && "text-muted-foreground",
          )}
        >
          {isDone && (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="#729E8F" strokeWidth="1.2" />
              <path d="M4 6l1.5 1.5L8 4.5" stroke="#729E8F" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {section.label}
        </span>
        {isDone ? (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#729E8F]">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6l2.5 2.5 4.5-5" stroke="#729E8F" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Done{section.durationMin ? ` · ${section.durationMin} min` : ""}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/60">
            {section.durationMin ? `${section.durationMin} min` : ""}
          </span>
        )}
      </div>

      {/* Score — shown first, prominent, whenever section has bars */}
      {barSystems.length > 0 && (
        <div
          className="border-b border-border/60 bg-white relative overflow-hidden"
          /* Clip to scaled height once we've measured the natural height */
          style={naturalScoreH != null ? { height: naturalScoreH * heightScale } : undefined}
        >
          {/* Inner wrapper — measure its natural (unscaled) height */}
          <div ref={scoreInnerRef}>
            {useFullPageScore ? (
              scorePageNumbers.map((pageNum) => {
                const barsOnPage = allBars.filter((b) => b.pageNumber === pageNum);
                return (
                  <div
                    key={pageNum}
                    className="relative w-full bg-white border-b border-border/30 last:border-b-0"
                  >
                    <img
                      src={sheetPageImageUrl(sheetId!, pageNum)}
                      alt=""
                      className="w-full h-auto block pointer-events-none"
                      onLoad={() => {
                        if (scoreInnerRef.current && naturalScoreH == null) {
                          setNaturalScoreH(scoreInnerRef.current.getBoundingClientRect().height);
                        }
                      }}
                    />
                    <div className="absolute inset-0 z-10 pointer-events-none">
                      {sessionFirstBar.pageNumber === pageNum && sessionFirstBar.boundingBox && (
                        <SessionRangeBrackets box={sessionFirstBar.boundingBox} side="left" />
                      )}
                      {sessionLastBar.pageNumber === pageNum && sessionLastBar.boundingBox && (
                        <SessionRangeBrackets box={sessionLastBar.boundingBox} side="right" />
                      )}
                      {barsOnPage.map((bar) => {
                        const bIdx = allBars.findIndex((b) => b.id === bar.id);
                        const box = bar.boundingBox!;
                        const isFocused = isActive && focusedBarIdx === bIdx;
                        const isHovered = hoveredBarIdx === bIdx;
                        return (
                          <button
                            key={bar.id}
                            type="button"
                            onClick={() => isActive && onFocusBar(isFocused ? null : bIdx)}
                            onMouseEnter={() => setHoveredBarIdx(bIdx)}
                            onMouseLeave={() => setHoveredBarIdx(null)}
                            style={{
                              left: `${box.x * 100}%`,
                              top: `${box.y * 100}%`,
                              width: `${box.w * 100}%`,
                              height: `${box.h * 100}%`,
                            }}
                            className={cn(
                              "absolute box-border select-none pointer-events-auto",
                              isActive ? "cursor-pointer" : "cursor-default",
                            )}
                            title={isActive ? `Bar ${bar.measureNumber} — click to enlarge` : `Bar ${bar.measureNumber}`}
                          >
                            {isHovered && !isFocused && (
                              <div className="absolute inset-0 bg-[#DCCAA6]/30 pointer-events-none rounded-sm" />
                            )}
                            {isFocused && (
                              <div className="absolute inset-0 ring-2 ring-inset ring-[#C8B388] bg-[#DCCAA6]/20 pointer-events-none rounded-sm" />
                            )}
                            {(isHovered || isFocused) && (
                              <div className="absolute bottom-0 right-0 px-1.5 py-0.5 text-[10px] font-bold text-[#6b5732] bg-[#DCCAA6]/85 leading-none select-none rounded-tl-sm pointer-events-none">
                                {bar.measureNumber}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              barSystems.map((system, sysIdx) => {
                const totalW = system.reduce((sum, b) => sum + (b.boundingBox?.w ?? 1), 0);

                return (
                  <div
                    key={sysIdx}
                    className={cn("flex w-full bg-white", sysIdx > 0 && "border-t border-border/30")}
                  >
                    {system.map((bar) => {
                      const bIdx = allBars.findIndex((b) => b.id === bar.id);
                      const widthPct = (bar.boundingBox?.w ?? 1) / totalW * 100;
                      const isFocused = isActive && focusedBarIdx === bIdx;
                      const isHovered = hoveredBarIdx === bIdx;

                      return (
                        <button
                          key={bar.id}
                          type="button"
                          onClick={() => isActive && onFocusBar(isFocused ? null : bIdx)}
                          onMouseEnter={() => setHoveredBarIdx(bIdx)}
                          onMouseLeave={() => setHoveredBarIdx(null)}
                          style={{ flex: `0 0 ${widthPct}%`, width: `${widthPct}%` }}
                          className={cn(
                            "relative block select-none",
                            isActive ? "cursor-pointer" : "cursor-default",
                          )}
                          title={isActive ? `Bar ${bar.measureNumber} — click to enlarge` : `Bar ${bar.measureNumber}`}
                        >
                          {bar.imageUrl ? (
                            <img
                              src={bar.imageUrl}
                              alt={`Bar ${bar.measureNumber}`}
                              className="w-full h-auto block pointer-events-none"
                              onLoad={() => {
                                if (scoreInnerRef.current && naturalScoreH == null) {
                                  setNaturalScoreH(scoreInnerRef.current.getBoundingClientRect().height);
                                }
                              }}
                            />
                          ) : (
                            <div className="flex items-center justify-center bg-white text-[10px] text-muted-foreground" style={{ height: 120 }}>
                              m.{bar.measureNumber}
                            </div>
                          )}

                          {isHovered && !isFocused && (
                            <div className="absolute inset-0 bg-[#DCCAA6]/30 pointer-events-none" />
                          )}
                          {isFocused && (
                            <div className="absolute inset-0 ring-2 ring-inset ring-[#C8B388] bg-[#DCCAA6]/20 pointer-events-none" />
                          )}
                          {(isHovered || isFocused) && (
                            <div className="absolute bottom-0 right-0 px-1.5 py-0.5 text-[10px] font-bold text-[#6b5732] bg-[#DCCAA6]/85 leading-none select-none rounded-tl-sm">
                              {bar.measureNumber}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          {/* Resize handle */}
          <div
            className="absolute bottom-0 right-0 w-7 h-7 flex items-end justify-end cursor-ns-resize z-10 pb-1 pr-1"
            onMouseDown={startResize}
            onTouchStart={startResizeTouch}
            title="Drag to resize score"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="text-[#8A877F]/60">
              <path d="M10 1L1 10M10 5.5L5.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>

          {/* Focused bar viewer */}
          {isActive && focusedBarIdx !== null && allBars[focusedBarIdx] && (
            <FocusedBarViewer
              bars={allBars}
              focusedIdx={focusedBarIdx}
              onNavigate={onFocusBar}
              sheetId={sheetId}
            />
          )}
        </div>
      )}

      {/* Section body — task list */}
      <div className="px-4 py-3 bg-card">
        <ul className="space-y-1.5">
          {section.tasks.map((task, tIdx) => {
            const key = taskKey(sIdx, tIdx);
            const checked = checkedTasks.has(key);
            return (
              <li key={tIdx} className="flex items-start gap-2.5">
                <button
                  type="button"
                  aria-label={checked ? "Uncheck task" : "Check task"}
                  onClick={() => !isDone && onCheck(key)}
                  className={cn(
                    "mt-[3px] w-[18px] h-[18px] shrink-0 rounded-[4px] border flex items-center justify-center transition-colors",
                    checked || isDone
                      ? "bg-[#729E8F] border-[#729E8F]"
                      : "border-border bg-transparent hover:border-[#C8B388]",
                    isDone && "cursor-default",
                  )}
                >
                  {(checked || isDone) && (
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                      <path d="M1.5 4.5l2 2 4-4" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span
                  className={cn(
                    "flex-1 text-sm leading-snug",
                    checked || isDone ? "text-muted-foreground line-through decoration-border" : "text-foreground/90",
                  )}
                >
                  {task.text}
                </span>
                {task.tag && (
                  <span className="shrink-0 text-xs text-muted-foreground/60 tabular-nums mt-[2px]">{task.tag}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ── Focused Bar Viewer ────────────────────────────────────────────────────────

function FocusedBarViewer({
  bars,
  focusedIdx,
  onNavigate,
  sheetId,
}: {
  bars: MeasureRow[];
  focusedIdx: number;
  onNavigate: (idx: number) => void;
  sheetId: number | null;
}) {
  const bar = bars[focusedIdx];
  const showPage =
    sheetId != null && bar.pageNumber != null && bar.boundingBox != null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && focusedIdx > 0) onNavigate(focusedIdx - 1);
      if (e.key === "ArrowRight" && focusedIdx < bars.length - 1) onNavigate(focusedIdx + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedIdx, bars.length, onNavigate]);

  return (
    <div className="mt-3 rounded-lg border border-[#C8B388] bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#DCCAA6]/12 border-b border-[#C8B388]/30">
        <span className="text-xs font-bold text-foreground">Bar {bar.measureNumber}</span>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <button
            type="button"
            onClick={() => focusedIdx > 0 && onNavigate(focusedIdx - 1)}
            disabled={focusedIdx === 0}
            className="w-[26px] h-[26px] flex items-center justify-center border border-border rounded-[calc(0.5rem-2px)] bg-[#F4F1EA] text-muted-foreground hover:border-[#C8B388] hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span>{focusedIdx + 1} of {bars.length}</span>
          <button
            type="button"
            onClick={() => focusedIdx < bars.length - 1 && onNavigate(focusedIdx + 1)}
            disabled={focusedIdx === bars.length - 1}
            className="w-[26px] h-[26px] flex items-center justify-center border border-border rounded-[calc(0.5rem-2px)] bg-[#F4F1EA] text-muted-foreground hover:border-[#C8B388] hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <span className="text-muted-foreground/50 ml-1">← → keys</span>
        </div>
      </div>
      <div className="min-h-40 flex items-center justify-center bg-white px-2 py-2">
        {showPage ? (
          <div className="w-full max-h-[min(50vh,520px)] overflow-y-auto">
            <div className="relative w-full">
              <img
                src={sheetPageImageUrl(sheetId, bar.pageNumber!)}
                alt=""
                className="w-full h-auto block"
              />
              <div className="absolute inset-0 pointer-events-none">
                <div
                  className="absolute border-2 border-[#C8B388] bg-[#DCCAA6]/25 rounded-sm shadow-sm"
                  style={{
                    left: `${bar.boundingBox!.x * 100}%`,
                    top: `${bar.boundingBox!.y * 100}%`,
                    width: `${bar.boundingBox!.w * 100}%`,
                    height: `${bar.boundingBox!.h * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        ) : bar.imageUrl ? (
          <img
            src={bar.imageUrl}
            alt={`Bar ${bar.measureNumber}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-[10px] text-muted-foreground/50 tracking-wide">
            score image · bar {bar.measureNumber}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SessionPage() {
  const params = useParams<{ lessonId: string }>();
  const lessonId = parseInt(params.lessonId ?? "", 10);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Timer
  const [elapsedSec, setElapsedSec] = useState(0);

  // Task check state: "sIdx:tIdx" → checked
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());

  // Focused bar index (within the session's bar list)
  const [focusedBarIdx, setFocusedBarIdx] = useState<number | null>(null);

  // Notes
  const [notes, setNotes] = useState<string>("");
  const notesInitialised = useRef(false);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: bundle, isLoading, isError } = useQuery<SessionBundle>({
    queryKey: [`/api/lessons/${lessonId}/session`],
    enabled: Number.isFinite(lessonId) && lessonId > 0,
  });

  const sheetId = bundle?.plan.sheetMusicId;
  // Fetch ALL measures for the sheet (server ignores from/to), then filter client-side
  const { data: allMeasures = [] } = useQuery<MeasureRow[]>({
    queryKey: [`/api/sheet-music/${sheetId}/measures`],
    queryFn: async () => {
      if (!sheetId) return [];
      const res = await fetch(`/api/sheet-music/${sheetId}/measures`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sheetId && !!bundle,
  });

  // Filter to the session's measure range
  const bars = bundle
    ? allMeasures.filter(
        (m) =>
          m.measureNumber >= bundle.lesson.measureStart &&
          m.measureNumber <= bundle.lesson.measureEnd,
      )
    : [];

  // Group session bars into systems for display
  const barSystems = groupIntoSystems(bars);

  // ── Side effects ─────────────────────────────────────────────────────────

  // Initialise notes from server once
  useEffect(() => {
    if (bundle && !notesInitialised.current) {
      setNotes(bundle.lesson.userNotes ?? "");
      notesInitialised.current = true;
    }
  }, [bundle]);

  // Pre-check all tasks when session is already completed
  useEffect(() => {
    if (bundle?.lesson.status === "completed" && bundle.lesson.tasks) {
      const all = new Set<string>();
      bundle.lesson.tasks.forEach((sec, sIdx) =>
        sec.tasks.forEach((_, tIdx) => all.add(taskKey(sIdx, tIdx))),
      );
      setCheckedTasks(all);
    }
  }, [bundle]);

  // Timer
  useEffect(() => {
    if (!bundle || bundle.lesson.status === "completed") return;
    const t = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [bundle?.lesson.status, bundle]);

  const planId = bundle?.plan.id;

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveNotes = useCallback(
    async (text: string) => {
      if (!bundle) return;
      await apiRequest("PATCH", `/api/lessons/${bundle.lesson.id}`, { userNotes: text });
      queryClient.invalidateQueries({ queryKey: [`/api/lessons/${lessonId}/session`] });
    },
    [bundle, lessonId, queryClient],
  );

  const completeSession = useMutation({
    mutationFn: async () => {
      if (!bundle) return;
      await apiRequest("PATCH", `/api/lessons/${bundle.lesson.id}`, {
        status: "completed",
        completedAt: new Date().toISOString(),
        userNotes: notes || null,
      });
      const { plan, lesson } = bundle;
      for (let n = lesson.measureStart; n <= lesson.measureEnd; n++) {
        await apiRequest("PUT", `/api/learning-plans/${plan.id}/progress/${n}`, { status: "learned" });
      }
    },
    onSuccess: () => {
      if (planId != null) {
        queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/lessons`] });
        queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/today`] });
        queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/progress`] });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/lessons/${lessonId}/session`] });
      toast({ title: "Session complete", description: "Nice work — this day is marked complete." });
      if (planId != null) navigate(`/plan/${planId}`);
    },
    onError: () => {
      toast({ title: "Couldn't save", description: "Try again in a moment.", variant: "destructive" });
    },
  });

  // ── Derived state ─────────────────────────────────────────────────────────

  const sections = bundle?.lesson.tasks ?? [];
  const isDone = bundle?.lesson.status === "completed";

  // Active = first section where not all tasks are checked (or first section if all done)
  function getSectionState(sIdx: number): "done" | "active" | "upcoming" {
    if (isDone) return "done";
    const sec = sections[sIdx];
    const allChecked = sec.tasks.length > 0 && sec.tasks.every((_, tIdx) => checkedTasks.has(taskKey(sIdx, tIdx)));
    if (allChecked) return "done";
    // Find first incomplete section
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      const complete = s.tasks.length > 0 && s.tasks.every((_, tIdx) => checkedTasks.has(taskKey(i, tIdx)));
      if (!complete) return i === sIdx ? "active" : (i < sIdx ? "upcoming" : "upcoming");
    }
    return "done";
  }

  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");

  // ── Guard ─────────────────────────────────────────────────────────────────

  if (!Number.isFinite(lessonId) || lessonId <= 0) {
    return (
      <Layout>
        <div className="container max-w-lg mx-auto px-4 py-12">
          <p className="text-muted-foreground">Invalid session link.</p>
          <Button variant="link" asChild className="mt-2 px-0">
            <Link href="/">Home</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="container max-w-2xl mx-auto px-4 py-8 pb-24">

        {/* Top row: back + timer */}
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" size="sm" className="gap-1 -ml-2 text-muted-foreground" asChild>
            <Link href={bundle ? `/plan/${bundle.plan.id}` : "/"}>
              <ArrowLeft className="w-4 h-4" />
              Back to plan
            </Link>
          </Button>
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold tabular-nums",
              isDone
                ? "border-muted bg-muted/40 text-muted-foreground"
                : "border-[#DCCAA6]/45 bg-[#DCCAA6]/10 text-muted-foreground",
            )}
          >
            <Clock className="w-3.5 h-3.5 opacity-70" />
            {isDone ? "Done" : `${mm}:${ss}`}
          </div>
        </div>

        {/* Loading / error states */}
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-32 w-full rounded-lg mt-6" />
          </div>
        )}

        {isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-muted-foreground">
            We couldn&apos;t open this session. It may have been removed or you may need to sign in again.
            <Button variant="link" asChild className="mt-2 block px-0 h-auto">
              <Link href="/">Go home</Link>
            </Button>
          </div>
        )}

        {bundle && (
          <>
            {/* Session header */}
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
              Practice session{bundle.dayIndex > 0 ? ` · Day ${bundle.dayIndex}` : ""}
            </p>
            <h1 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
              {bundle.composerName}
              <span className="text-muted-foreground font-normal"> · </span>
              {bundle.pieceTitle}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              {formatSessionDate(bundle.lesson.scheduledDate)}
              {" · "}
              {bundle.lesson.measureEnd !== bundle.lesson.measureStart
                ? `Bars ${bundle.lesson.measureStart}–${bundle.lesson.measureEnd}`
                : `Bar ${bundle.lesson.measureStart}`}
            </p>

            {/* Fallback card when no structured tasks */}
            {sections.length === 0 && (
              <div className="mt-6 rounded-lg border border-border bg-card p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Today&apos;s bars</p>
                <p className="text-base font-medium">
                  Measures {bundle.lesson.measureStart}
                  {bundle.lesson.measureEnd !== bundle.lesson.measureStart ? `–${bundle.lesson.measureEnd}` : ""}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  About {bundle.plan.dailyPracticeMinutes} min · work slowly and cleanly through each bar.
                </p>
              </div>
            )}

            {/* Section cards */}
            {sections.map((section, sIdx) => {
              const state = getSectionState(sIdx);
              const showBars = section.type === "piece_practice" || section.type === "sight_reading";
              return (
                <SectionCard
                  key={sIdx}
                  section={section}
                  sIdx={sIdx}
                  state={state}
                  checkedTasks={checkedTasks}
                  onCheck={(key) =>
                    setCheckedTasks((prev) => {
                      const next = new Set(prev);
                      next.has(key) ? next.delete(key) : next.add(key);
                      return next;
                    })
                  }
                  barSystems={showBars ? barSystems : []}
                  allBars={showBars ? bars : []}
                  focusedBarIdx={state === "active" ? focusedBarIdx : null}
                  onFocusBar={setFocusedBarIdx}
                  sheetId={sheetId ?? null}
                />
              );
            })}

            {/* Notes card */}
            <div className="mt-5 rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Session notes
                </span>
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-[#F4F1EA] text-xs font-semibold text-muted-foreground hover:border-red-400 hover:text-red-600 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  Record audio
                </button>
              </div>
              <textarea
                className="w-full min-h-[5rem] px-4 py-3 bg-transparent border-none resize-y font-sans text-sm text-foreground outline-none leading-relaxed placeholder:text-muted-foreground/50"
                placeholder="Jot down anything worth remembering — tricky passages, tempo notes, things to revisit..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => saveNotes(notes)}
              />
            </div>

            {/* CTA */}
            {!isDone ? (
              <div className="mt-8 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => completeSession.mutate()}
                  disabled={completeSession.isPending}
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-lg bg-[#1C1C1A] text-[#DCCAA6] text-[15px] font-bold shadow-[0_2px_8px_rgba(0,0,0,0.12)] hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M5.5 9l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {completeSession.isPending ? "Saving…" : "Mark session complete"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await saveNotes(notes);
                    if (planId != null) navigate(`/plan/${planId}`);
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground text-center transition-colors"
                >
                  Save notes &amp; finish later
                </button>
              </div>
            ) : (
              <div className="mt-8 flex items-center gap-2 rounded-lg border border-[#729E8F]/40 bg-[#729E8F]/10 px-4 py-3 text-sm text-[#3d7065] font-medium">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="#729E8F" strokeWidth="1.4" />
                  <path d="M5 8l2.5 2.5L11 6" stroke="#729E8F" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                This session is complete.
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
