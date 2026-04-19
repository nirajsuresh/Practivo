import { useParams, Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, MouseEvent as ReactMouseEvent } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Flag,
  Music2,
  Play,
  Plus,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { measuresUsePageGeometry, useSheetPageUrl } from "@/lib/sheet-page";
import { getPhaseColor } from "@/lib/palette";
import { PHASE_LABELS, type PhaseType } from "@shared/schema";

// ── Types ────────────────────────────────────────────────────────────────────

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
  learningPlanId: number;
  scheduledDate: string;
  measureStart: number;
  measureEnd: number;
  status: string;
  userNotes: string | null;
  completedAt: string | null;
  tasks: SessionSection[] | null;
  sectionId: number | null;
  phaseType: string | null;
  sectionName: string | null;
};

type BarFlag = { id: number; measureId: number; note: string | null; resolved: boolean };

type BarAnnotation = {
  id: number;
  lessonDayId: number;
  learningPlanId: number;
  userId: string;
  measureStart: number;
  measureEnd: number;
  text: string;
  sessionNumber: number;
  sessionDate: string;
  createdAt: string;
  updatedAt: string;
};

type PlanSection = {
  id: number;
  name: string;
  measureStart: number;
  measureEnd: number;
  difficulty: number;
  displayOrder: number;
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

type BarColorFn = (measureNumber: number) => { border: string; bg: string } | null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Group a sorted list of measures into systems (horizontal rows as they appear in the score). */
function groupIntoSystems(bars: MeasureRow[], tolerance = 0.04): MeasureRow[][] {
  if (bars.length === 0) return [];
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

/** Parse measure range from a label string like "Section A mm. 1–5 — Chunk" → { start: 1, end: 5 } */
function parseLabelRange(label: string): { start: number; end: number } | null {
  const m = label.match(/mm\.\s*(\d+)[–\-–](\d+)/);
  if (m) return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
  const s = label.match(/mm\.\s*(\d+)/);
  if (s) return { start: parseInt(s[1], 10), end: parseInt(s[1], 10) };
  return null;
}

const NEUTRAL_BAR_COLOR = { border: "#8A877F", bg: "rgba(138,135,127,0.10)" };

function buildBarColorFn(phaseType: string | null): BarColorFn {
  return (_measureNum: number) => phaseType ? getPhaseColor(phaseType) : NEUTRAL_BAR_COLOR;
}

function taskKey(sIdx: number, tIdx: number) {
  return `${sIdx}:${tIdx}`;
}

function formatTime(sec: number) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function formatSessionDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ── ScoreStepView ─────────────────────────────────────────────────────────────

function ScoreStepView({
  bars,
  allBarsForIndex,
  contextBars,
  sheetId,
  focusedBarIdx,
  onFocusBar,
  flaggedBars,
  onToggleFlag,
  getBarColor,
  barTooltip,
  onAddAnnotation,
}: {
  bars: MeasureRow[];         // bars in this section's range (colored + interactive)
  allBarsForIndex: MeasureRow[]; // same as bars; used for index lookup in FocusedBarViewer
  contextBars: MeasureRow[];  // bars on same pages, outside section range (dimmed)
  sheetId: number | null;
  focusedBarIdx: number | null;
  onFocusBar: (idx: number | null) => void;
  flaggedBars: Map<number, number>;
  onToggleFlag: (measureId: number, flagId: number | undefined) => void;
  getBarColor: BarColorFn;
  barTooltip: string | null;
  onAddAnnotation?: (measureStart: number, measureEnd: number) => void;
}) {
  const pageUrl = useSheetPageUrl(sheetId);
  const [heightScale, setHeightScale] = useState(1);
  const [hoveredBarIdx, setHoveredBarIdx] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startScale: number } | null>(null);
  const scoreInnerRef = useRef<HTMLDivElement>(null);
  const [naturalScoreH, setNaturalScoreH] = useState<number | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const selectDragRef = useRef<{ startMeasure: number } | null>(null);

  const isInSelection = (n: number) =>
    selectedRange != null && n >= selectedRange.start && n <= selectedRange.end;

  useEffect(() => {
    function onMouseUp() { selectDragRef.current = null; }
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") setSelectedRange(null); }
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function startResize(e: ReactMouseEvent) {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startScale: heightScale };
    const onMove = (ev: globalThis.MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientY - dragRef.current.startY;
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

  const useFullPageScore =
    sheetId != null && bars.length > 0 && measuresUsePageGeometry(bars);

  const scorePageNumbers = useFullPageScore
    ? Array.from(new Set(bars.filter((b) => b.pageNumber != null).map((b) => b.pageNumber!))).sort((a, b) => a - b)
    : [];

  if (bars.length === 0) return null;

  return (
    <div className="border-t border-b border-border/60 bg-white relative overflow-hidden"
      style={naturalScoreH != null ? { height: naturalScoreH * heightScale } : undefined}
    >
      <div ref={scoreInnerRef}>
        {useFullPageScore ? (
          scorePageNumbers.map((pageNum) => {
            const barsOnPage = bars.filter((b) => b.pageNumber === pageNum);
            return (
              <div
                key={pageNum}
                className="relative w-full bg-white border-b border-border/30 last:border-b-0"
              >
                <img
                  src={pageUrl(pageNum)}
                  alt=""
                  className="w-full h-auto block pointer-events-none"
                  onLoad={() => {
                    if (scoreInnerRef.current && naturalScoreH == null) {
                      setNaturalScoreH(scoreInnerRef.current.getBoundingClientRect().height);
                    }
                  }}
                />
                <div className="absolute inset-0 z-10 pointer-events-none">
                  {/* Context bars — dimmed for spatial orientation */}
                  {contextBars
                    .filter((b) => b.pageNumber === pageNum && b.boundingBox != null)
                    .map((bar) => (
                      <div
                        key={`ctx-${bar.id}`}
                        style={{
                          position: "absolute",
                          left: `${bar.boundingBox!.x * 100}%`,
                          top: `${bar.boundingBox!.y * 100}%`,
                          width: `${bar.boundingBox!.w * 100}%`,
                          height: `${bar.boundingBox!.h * 100}%`,
                          background: "rgba(0,0,0,0.04)",
                        }}
                      />
                    ))}
                  {/* Section bars — colored and interactive */}
                  {barsOnPage.map((bar) => {
                    const bIdx = allBarsForIndex.findIndex((b) => b.id === bar.id);
                    const box = bar.boundingBox!;
                    const isFocused = focusedBarIdx === bIdx;
                    const isHovered = hoveredBarIdx === bIdx;
                    const isSelected = isInSelection(bar.measureNumber);
                    const isSelectionEnd = isSelected && bar.measureNumber === selectedRange!.end;
                    const color = getBarColor(bar.measureNumber);
                    return (
                      <Tooltip key={bar.id}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              selectDragRef.current = { startMeasure: bar.measureNumber };
                              setSelectedRange({ start: bar.measureNumber, end: bar.measureNumber });
                            }}
                            onMouseEnter={(e) => {
                              setHoveredBarIdx(bIdx);
                              if (selectDragRef.current && e.buttons === 1) {
                                const a = selectDragRef.current.startMeasure;
                                const b = bar.measureNumber;
                                setSelectedRange({ start: Math.min(a, b), end: Math.max(a, b) });
                              }
                            }}
                            onMouseLeave={() => setHoveredBarIdx(null)}
                            onDoubleClick={() => onFocusBar(isFocused ? null : bIdx)}
                            style={{
                              left: `${box.x * 100}%`,
                              top: `${box.y * 100}%`,
                              width: `${box.w * 100}%`,
                              height: `${box.h * 100}%`,
                              borderColor: isSelected ? "#60a5fa" : (color?.border ?? "transparent"),
                              backgroundColor: isSelected ? "rgba(96,165,250,0.18)" : (color?.bg ?? "transparent"),
                            }}
                            className={cn(
                              "absolute box-border select-none pointer-events-auto rounded-sm border-2 transition-all cursor-pointer",
                              isHovered && !isSelected && "!border-[3px] shadow-md",
                              isSelected && "!border-[3px] shadow-md",
                              isFocused && "!border-[3px] shadow-lg ring-1 ring-inset",
                            )}
                            title={`Bar ${bar.measureNumber} — click to select · double-click to zoom`}
                          >
                            {(isHovered || isFocused || isSelected) && (
                              <div
                                className="absolute bottom-0 right-0 px-1.5 py-0.5 text-[10px] font-bold leading-none select-none rounded-tl-sm pointer-events-none text-white"
                                style={{ backgroundColor: isSelected ? "#3b82f6" : (color?.border ?? "#6b5732") }}
                              >
                                {bar.measureNumber}
                              </div>
                            )}
                            {(isHovered || isFocused || isSelected || flaggedBars.has(bar.id)) && (
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); onToggleFlag(bar.id, flaggedBars.get(bar.id)); }}
                                className={cn(
                                  "absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded pointer-events-auto z-20 transition-colors",
                                  flaggedBars.has(bar.id)
                                    ? "text-amber-500 bg-white/70"
                                    : "text-muted-foreground/60 hover:text-amber-500 bg-white/50",
                                )}
                                title={flaggedBars.has(bar.id) ? "Unflag this bar" : "Flag as tricky"}
                              >
                                <Flag className="w-3 h-3" fill={flaggedBars.has(bar.id) ? "currentColor" : "none"} />
                              </button>
                            )}
                            {isSelectionEnd && (
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); onAddAnnotation?.(selectedRange!.start, selectedRange!.end); }}
                                className="absolute top-0.5 left-0.5 w-5 h-5 flex items-center justify-center rounded pointer-events-auto z-20 bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                                title="Add note to selected bars"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            )}
                          </button>
                        </TooltipTrigger>
                        {barTooltip && (
                          <TooltipContent side="top" className="text-xs max-w-[220px]">
                            <p className="font-semibold">m.{bar.measureNumber}</p>
                            <p>{barTooltip}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })
        ) : (
          /* Bar strip fallback */
          groupIntoSystems(bars).map((system, sysIdx) => {
            const totalW = system.reduce((sum, b) => sum + (b.boundingBox?.w ?? 1), 0);
            return (
              <div
                key={sysIdx}
                className={cn("flex w-full bg-white", sysIdx > 0 && "border-t border-border/30")}
              >
                {system.map((bar) => {
                  const bIdx = allBarsForIndex.findIndex((b) => b.id === bar.id);
                  const widthPct = (bar.boundingBox?.w ?? 1) / totalW * 100;
                  const isFocused = focusedBarIdx === bIdx;
                  const isHovered = hoveredBarIdx === bIdx;
                  const isSelected = isInSelection(bar.measureNumber);
                  const isSelectionEnd = isSelected && bar.measureNumber === selectedRange!.end;
                  const color = getBarColor(bar.measureNumber);

                  return (
                    <button
                      key={bar.id}
                      type="button"
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        selectDragRef.current = { startMeasure: bar.measureNumber };
                        setSelectedRange({ start: bar.measureNumber, end: bar.measureNumber });
                      }}
                      onMouseEnter={(e) => {
                        setHoveredBarIdx(bIdx);
                        if (selectDragRef.current && e.buttons === 1) {
                          const a = selectDragRef.current.startMeasure;
                          const b = bar.measureNumber;
                          setSelectedRange({ start: Math.min(a, b), end: Math.max(a, b) });
                        }
                      }}
                      onMouseLeave={() => setHoveredBarIdx(null)}
                      onDoubleClick={() => onFocusBar(isFocused ? null : bIdx)}
                      style={{ flex: `0 0 ${widthPct}%`, width: `${widthPct}%` }}
                      className="relative block select-none cursor-pointer"
                      title={`Bar ${bar.measureNumber} — click to select · double-click to zoom`}
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
                      <div
                        className={cn(
                          "absolute inset-0 pointer-events-none rounded-sm transition-all border-2",
                          isHovered && !isSelected && "!border-[3px] shadow-md",
                          isSelected && "!border-[3px] shadow-md",
                          isFocused && "!border-[3px] shadow-lg ring-1 ring-inset",
                        )}
                        style={{
                          borderColor: isSelected ? "#60a5fa" : (color?.border ?? "transparent"),
                          backgroundColor: isSelected ? "rgba(96,165,250,0.18)" : ((isHovered || isFocused) ? color?.bg : "transparent"),
                        }}
                      />
                      {(isHovered || isFocused || isSelected) && (
                        <div
                          className="absolute bottom-0 right-0 px-1.5 py-0.5 text-[10px] font-bold leading-none select-none rounded-tl-sm pointer-events-none text-white z-10"
                          style={{ backgroundColor: isSelected ? "#3b82f6" : (color?.border ?? "#6b5732") }}
                        >
                          {bar.measureNumber}
                        </div>
                      )}
                      {(isHovered || isFocused || isSelected || flaggedBars.has(bar.id)) && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); onToggleFlag(bar.id, flaggedBars.get(bar.id)); }}
                          className={cn(
                            "absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded pointer-events-auto z-20 transition-colors",
                            flaggedBars.has(bar.id)
                              ? "text-amber-500 bg-white/70"
                              : "text-muted-foreground/60 hover:text-amber-500 bg-white/50",
                          )}
                          title={flaggedBars.has(bar.id) ? "Unflag this bar" : "Flag as tricky"}
                        >
                          <Flag className="w-3 h-3" fill={flaggedBars.has(bar.id) ? "currentColor" : "none"} />
                        </button>
                      )}
                      {isSelectionEnd && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); onAddAnnotation?.(selectedRange!.start, selectedRange!.end); }}
                          className="absolute top-0.5 left-0.5 w-5 h-5 flex items-center justify-center rounded pointer-events-auto z-20 bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                          title="Add note to selected bars"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
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
      {focusedBarIdx !== null && allBarsForIndex[focusedBarIdx] && (
        <FocusedBarViewer
          bars={allBarsForIndex}
          focusedIdx={focusedBarIdx}
          onNavigate={onFocusBar}
          sheetId={sheetId}
          flaggedBars={flaggedBars}
          onToggleFlag={onToggleFlag}
          getBarColor={getBarColor}
        />
      )}
    </div>
  );
}

// ── Focused Bar Viewer ────────────────────────────────────────────────────────

function FocusedBarViewer({
  bars,
  focusedIdx,
  onNavigate,
  sheetId,
  flaggedBars,
  onToggleFlag,
  getBarColor,
}: {
  bars: MeasureRow[];
  focusedIdx: number;
  onNavigate: (idx: number | null) => void;
  sheetId: number | null;
  flaggedBars: Map<number, number>;
  onToggleFlag: (measureId: number, flagId: number | undefined) => void;
  getBarColor: BarColorFn;
}) {
  const pageUrl = useSheetPageUrl(sheetId);
  const bar = bars[focusedIdx];
  const showPage =
    sheetId != null && bar.pageNumber != null && bar.boundingBox != null;
  const isFlagged = flaggedBars.has(bar.id);
  const color = getBarColor(bar.measureNumber);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && focusedIdx > 0) onNavigate(focusedIdx - 1);
      if (e.key === "ArrowRight" && focusedIdx < bars.length - 1) onNavigate(focusedIdx + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedIdx, bars.length, onNavigate]);

  return (
    <div
      className="mt-3 rounded-lg border-2 bg-white overflow-hidden"
      style={{ borderColor: color?.border ?? "#C8B388" }}
    >
      <div
        className="flex items-center justify-between px-3.5 py-2 border-b"
        style={{
          backgroundColor: color?.bg ?? "rgba(220,202,166,0.12)",
          borderBottomColor: color ? `${color.border}30` : "rgba(200,179,136,0.3)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-foreground">Bar {bar.measureNumber}</span>
          <button
            type="button"
            onClick={() => onToggleFlag(bar.id, flaggedBars.get(bar.id))}
            className={cn(
              "w-6 h-6 flex items-center justify-center rounded transition-colors",
              isFlagged
                ? "text-amber-500 bg-amber-50"
                : "text-muted-foreground/50 hover:text-amber-500 hover:bg-amber-50",
            )}
            title={isFlagged ? "Unflag this bar" : "Flag as tricky"}
          >
            <Flag className="w-3.5 h-3.5" fill={isFlagged ? "currentColor" : "none"} />
          </button>
        </div>
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
                src={pageUrl(bar.pageNumber!)}
                alt=""
                className="w-full h-auto block"
              />
              <div className="absolute inset-0 pointer-events-none">
                <div
                  className="absolute border-[3px] rounded-sm shadow-md"
                  style={{
                    left: `${bar.boundingBox!.x * 100}%`,
                    top: `${bar.boundingBox!.y * 100}%`,
                    width: `${bar.boundingBox!.w * 100}%`,
                    height: `${bar.boundingBox!.h * 100}%`,
                    borderColor: color?.border ?? "#C8B388",
                    backgroundColor: color?.bg ?? "rgba(220,202,166,0.15)",
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

// ── Annotation Popover ────────────────────────────────────────────────────────

function AnnotationPopover({
  open,
  onOpenChange,
  measureStart,
  measureEnd,
  initialText,
  onSave,
  onDelete,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  measureStart: number;
  measureEnd: number;
  initialText: string;
  onSave: (text: string) => void;
  onDelete?: () => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(initialText);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open, initialText]);

  const rangeLabel = measureStart === measureEnd ? `m. ${measureStart}` : `mm. ${measureStart}–${measureEnd}`;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <span className="sr-only" />
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-3 space-y-2"
        side="top"
        container={document.body}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">{rangeLabel}</span>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-xs text-destructive hover:underline"
            >
              Delete
            </button>
          )}
        </div>
        <textarea
          ref={textareaRef}
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (draft.trim()) onSave(draft.trim());
            }
            if (e.key === "Escape") onOpenChange(false);
          }}
          placeholder="Add a note…"
          className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!draft.trim() || isSaving}
            onClick={() => { if (draft.trim()) onSave(draft.trim()); }}
            className="flex-1 text-xs font-semibold py-1.5 rounded bg-[#1C1C1A] text-[#DCCAA6] hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-xs text-muted-foreground hover:text-foreground px-2"
          >
            Cancel
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SessionPage() {
  const params = useParams<{ lessonId: string }>();
  const lessonId = parseInt(params.lessonId ?? "", 10);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Stepper state
  const [currentStep, setCurrentStep] = useState(0);
  const [stepTimerStarted, setStepTimerStarted] = useState(false);
  const [stepElapsedSec, setStepElapsedSec] = useState(0);
  const [noteSheetOpen, setNoteSheetOpen] = useState(false);

  // Task check state: "sIdx:tIdx" → checked
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());

  // Focused bar index (within current section's bar list)
  const [focusedBarIdx, setFocusedBarIdx] = useState<number | null>(null);

  // Bar flags: measureId → flagId
  const [flaggedBars, setFlaggedBars] = useState<Map<number, number>>(new Map());

  // Notes
  const [notes, setNotes] = useState<string>("");
  const notesInitialised = useRef(false);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: bundle, isLoading, isError } = useQuery<SessionBundle>({
    queryKey: [`/api/lessons/${lessonId}/session`],
    enabled: Number.isFinite(lessonId) && lessonId > 0,
  });

  const sheetId = bundle?.plan.sheetMusicId;
  const planId = bundle?.plan.id;

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

  const { data: existingFlags = [] } = useQuery<BarFlag[]>({
    queryKey: [`/api/lessons/${lessonId}/flags`],
    enabled: Number.isFinite(lessonId) && lessonId > 0 && !!bundle,
  });

  // Sync flaggedBars state once flags load
  useEffect(() => {
    if (existingFlags.length > 0) {
      setFlaggedBars(new Map(existingFlags.map((f) => [f.measureId, f.id])));
    }
  }, [existingFlags]);

  const { data: annotations = [] } = useQuery<BarAnnotation[]>({
    queryKey: [`/api/lessons/${lessonId}/annotations`],
    enabled: Number.isFinite(lessonId) && lessonId > 0 && !!bundle,
  });

  // Annotation popover state: null = closed, otherwise the pending range (+optional existing annotation for editing)
  const [annotationTarget, setAnnotationTarget] = useState<{
    measureStart: number;
    measureEnd: number;
    existing?: BarAnnotation;
  } | null>(null);

  const createAnnotation = useMutation({
    mutationFn: (vars: { measureStart: number; measureEnd: number; text: string }) =>
      apiRequest("POST", `/api/lessons/${lessonId}/annotations`, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/lessons/${lessonId}/annotations`] });
      if (planId != null) queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/annotations`] });
      setAnnotationTarget(null);
    },
    onError: () => toast({ title: "Couldn't save note", variant: "destructive" }),
  });

  const updateAnnotation = useMutation({
    mutationFn: (vars: { id: number; text: string }) =>
      apiRequest("PATCH", `/api/lessons/${lessonId}/annotations/${vars.id}`, { text: vars.text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/lessons/${lessonId}/annotations`] });
      if (planId != null) queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/annotations`] });
      setAnnotationTarget(null);
    },
    onError: () => toast({ title: "Couldn't update note", variant: "destructive" }),
  });

  const deleteAnnotation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/lessons/${lessonId}/annotations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/lessons/${lessonId}/annotations`] });
      if (planId != null) queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/annotations`] });
      setAnnotationTarget(null);
    },
    onError: () => toast({ title: "Couldn't delete note", variant: "destructive" }),
  });

  // ── Derived data ──────────────────────────────────────────────────────────

  const sections = bundle?.lesson.tasks ?? [];
  const isDone = bundle?.lesson.status === "completed";
  const currentSection = sections[currentStep] ?? null;
  const isLastStep = currentStep === sections.length - 1;
  const isScoreSection =
    currentSection?.type === "piece_practice" || currentSection?.type === "sight_reading";

  // Effective phase type: lesson-level first, then fall back to piece_practice task phase
  const effectivePhaseType =
    bundle?.lesson.phaseType ??
    bundle?.lesson.tasks?.find((t) => t.type === "piece_practice" && t.phaseType)?.phaseType ??
    null;

  // Section-level phase (use current section's phaseType if available)
  const sectionPhaseType = currentSection?.phaseType ?? effectivePhaseType;
  const getBarColor = buildBarColorFn(sectionPhaseType);

  // Bars for the whole lesson (lesson.measureStart → lesson.measureEnd)
  const lessonBars = bundle
    ? allMeasures.filter(
        (m) =>
          m.measureNumber >= bundle.lesson.measureStart &&
          m.measureNumber <= bundle.lesson.measureEnd,
      )
    : [];

  // Per-section bars: parse measure range from section label or fall back to lesson range
  const sectionRange = currentSection
    ? (currentSection.measureStart != null && currentSection.measureEnd != null
        ? { start: currentSection.measureStart, end: currentSection.measureEnd }
        : parseLabelRange(currentSection.label) ?? {
            start: bundle?.lesson.measureStart ?? 1,
            end: bundle?.lesson.measureEnd ?? 1,
          })
    : null;

  const sectionBars = isScoreSection && sectionRange
    ? allMeasures.filter(
        (m) =>
          m.measureNumber >= sectionRange.start &&
          m.measureNumber <= sectionRange.end &&
          m.boundingBox != null &&
          m.pageNumber != null,
      )
    : [];

  const sectionPageNums = new Set(sectionBars.map((b) => b.pageNumber!));
  const sectionContextBars = isScoreSection && sectionRange
    ? allMeasures.filter(
        (m) =>
          m.pageNumber != null &&
          m.boundingBox != null &&
          sectionPageNums.has(m.pageNumber!) &&
          (m.measureNumber < sectionRange.start || m.measureNumber > sectionRange.end),
      )
    : [];

  // Phase info for tooltip and description
  const phaseInfo = sectionPhaseType ? PHASE_LABELS[sectionPhaseType as PhaseType] : null;
  const barTooltip = phaseInfo ? `${phaseInfo.label} — ${phaseInfo.description}` : null;

  // Timer: per step, reset on step change
  useEffect(() => {
    setStepTimerStarted(false);
    setStepElapsedSec(0);
    setFocusedBarIdx(null);
  }, [currentStep]);

  useEffect(() => {
    if (!stepTimerStarted || isDone) return;
    const t = setInterval(() => setStepElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [stepTimerStarted, isDone]);

  // Can proceed: either timer not started, or elapsed ≥ duration, or no duration set
  const durationSec = (currentSection?.durationMin ?? 0) * 60;
  const canProceed = !stepTimerStarted || stepElapsedSec >= durationSec || durationSec === 0;

  // ── Side effects ──────────────────────────────────────────────────────────

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
      // Jump to last step so "done" state is shown properly
      setCurrentStep(Math.max(0, (bundle.lesson.tasks?.length ?? 1) - 1));
    }
  }, [bundle]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveNotes = useCallback(
    async (text: string) => {
      if (!bundle) return;
      await apiRequest("PATCH", `/api/lessons/${bundle.lesson.id}`, { userNotes: text });
      queryClient.invalidateQueries({ queryKey: [`/api/lessons/${lessonId}/session`] });
    },
    [bundle, lessonId, queryClient],
  );

  const toggleFlag = useCallback(
    async (measureId: number, flagId: number | undefined) => {
      if (!bundle) return;
      if (flagId != null) {
        await apiRequest("DELETE", `/api/lessons/${bundle.lesson.id}/flags/${flagId}`);
        setFlaggedBars((prev) => {
          const next = new Map(prev);
          next.delete(measureId);
          return next;
        });
      } else {
        const created = await apiRequest("POST", `/api/lessons/${bundle.lesson.id}/flags`, { measureId });
        const flag = (await created.json()) as BarFlag;
        setFlaggedBars((prev) => new Map(prev).set(measureId, flag.id));
      }
      queryClient.invalidateQueries({ queryKey: [`/api/lessons/${lessonId}/flags`] });
      if (bundle.plan.id != null) {
        queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${bundle.plan.id}/flags/summary`] });
      }
    },
    [bundle, lessonId, queryClient],
  );

  const completeSession = useMutation({
    mutationFn: async () => {
      if (!bundle) return;
      // This is the authoritative action — if it succeeds we navigate regardless of what follows.
      await apiRequest("PATCH", `/api/lessons/${bundle.lesson.id}`, {
        status: "completed",
        completedAt: new Date().toISOString(),
        userNotes: notes || null,
      });
      // Best-effort: update measure progress without blocking navigation on failure.
      // Skip if the plan has no sheet music (server would 400 anyway).
      const { plan, lesson } = bundle;
      if (plan.sheetMusicId != null) {
        try {
          for (let n = lesson.measureStart; n <= lesson.measureEnd; n++) {
            await apiRequest("PUT", `/api/learning-plans/${plan.id}/progress/${n}`, { status: "learned" });
          }
        } catch {
          // progress updates are non-critical — continue to onSuccess
        }
      }
      apiRequest("POST", `/api/learning-plans/${plan.id}/suggestions/compute`, {
        triggerLessonId: lesson.id,
      }).catch(() => {});
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

  function goNext() {
    if (currentStep < sections.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  }

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
      {/* Loading / error states */}
      {isLoading && (
        <div className="container max-w-2xl mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-32 w-full rounded-lg mt-6" />
        </div>
      )}

      {isError && (
        <div className="container max-w-2xl mx-auto px-4 py-8">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-muted-foreground">
            We couldn&apos;t open this session. It may have been removed or you may need to sign in again.
            <Button variant="link" asChild className="mt-2 block px-0 h-auto">
              <Link href="/">Go home</Link>
            </Button>
          </div>
        </div>
      )}

      {bundle && (
        <div className="flex flex-col min-h-screen">

          {/* ── Sticky header ──────────────────────────────────────────── */}
          <div className="sticky top-0 z-30 bg-card/95 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
            <Link href={`/plan/${bundle.plan.id}`} className="shrink-0 p-1 -ml-1 rounded-md text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">
                {bundle.composerName} · {bundle.pieceTitle}
              </p>
              {sections.length > 0 && (
                <p className="text-[11px] text-muted-foreground/70">
                  Step {currentStep + 1} of {sections.length}
                </p>
              )}
            </div>

            {/* Progress dots */}
            {sections.length > 1 && (
              <div className="hidden sm:flex items-center gap-1">
                {sections.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCurrentStep(i)}
                    className={cn(
                      "w-1.5 h-1.5 rounded-full transition-all",
                      i < currentStep && "bg-[#729E8F]",
                      i === currentStep && "bg-[#C8B388] scale-125",
                      i > currentStep && "bg-muted-foreground/30",
                    )}
                    title={sections[i].label}
                  />
                ))}
              </div>
            )}

            {/* Full score link */}
            {sheetId != null && (
              <a
                href={`/score/${sheetId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md border border-border/60 px-2 py-1.5 bg-card shrink-0"
              >
                <Music2 className="w-3.5 h-3.5" />
                Score
              </a>
            )}

            {/* Complete session button */}
            <Button
              size="sm"
              variant={isDone ? "outline" : "default"}
              className={cn(
                "shrink-0 gap-1.5 text-xs",
                isDone && "text-[#3d7065] border-[#729E8F]/50",
              )}
              onClick={() => !isDone && completeSession.mutate()}
              disabled={completeSession.isPending || isDone}
            >
              {isDone
                ? <><Check className="w-3 h-3" /> Done</>
                : completeSession.isPending
                  ? "Saving…"
                  : "Complete"}
            </Button>
          </div>

          {/* ── Flat fallback when no structured sections ───────────────── */}
          {sections.length === 0 && (
            <div className="container max-w-2xl mx-auto px-4 py-8">
              <div className="rounded-lg border border-border bg-card p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Today's bars</p>
                <p className="text-base font-medium">
                  Measures {bundle.lesson.measureStart}
                  {bundle.lesson.measureEnd !== bundle.lesson.measureStart
                    ? `–${bundle.lesson.measureEnd}` : ""}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  About {bundle.plan.dailyPracticeMinutes} min · work slowly and cleanly through each bar.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatSessionDate(bundle.lesson.scheduledDate)}
                </p>
              </div>
              <div className="mt-8">
                <button
                  type="button"
                  onClick={() => completeSession.mutate()}
                  disabled={completeSession.isPending || isDone}
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-lg bg-[#1C1C1A] text-[#DCCAA6] text-[15px] font-bold shadow-[0_2px_8px_rgba(0,0,0,0.12)] hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {completeSession.isPending ? "Saving…" : "Mark session complete"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step content ────────────────────────────────────────────── */}
          {sections.length > 0 && currentSection && (
            <div
              key={currentStep}
              className="flex-1 animate-in slide-in-from-right-8 duration-200 pb-16"
            >
              <div className="max-w-lg mx-auto">
              {/* Section label + phase info */}
              <div className="px-4 pt-4 pb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {currentSection.label}
                </p>
                {phaseInfo && (
                  <p className="text-xs text-muted-foreground/80 mt-0.5">{phaseInfo.description}</p>
                )}
                {sectionRange && isScoreSection && (
                  <p className="text-xs text-muted-foreground/50 mt-0.5">
                    Bars {sectionRange.start}–{sectionRange.end}
                  </p>
                )}
              </div>

              {/* Task checklist — above score */}
              {currentSection.tasks.length > 0 && (
                <div className="px-4 py-2 space-y-2 border-t border-border/60">
                  {currentSection.tasks.map((task, tIdx) => {
                    const key = taskKey(currentStep, tIdx);
                    const checked = checkedTasks.has(key);
                    return (
                      <button
                        key={tIdx}
                        type="button"
                        onClick={() => {
                          if (isDone) return;
                          setCheckedTasks((prev) => {
                            const next = new Set(prev);
                            next.has(key) ? next.delete(key) : next.add(key);
                            return next;
                          });
                        }}
                        className="flex items-start gap-3 w-full text-left group"
                      >
                        <div
                          className={cn(
                            "mt-0.5 w-4 h-4 shrink-0 rounded-sm border transition-colors flex items-center justify-center",
                            checked ? "bg-[#729E8F] border-[#729E8F]" : "border-border group-hover:border-[#C8B388]",
                          )}
                        >
                          {checked && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className={cn("text-sm leading-snug flex-1", checked && "line-through text-muted-foreground")}>
                          {task.text}
                        </span>
                        {task.tag && (
                          <span className="shrink-0 text-xs text-muted-foreground/60 tabular-nums mt-[2px]">
                            {task.tag}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Score — piece_practice / sight_reading only, below tasks */}
              {isScoreSection && sectionBars.length > 0 && (
                <>
                  <ScoreStepView
                    bars={sectionBars}
                    allBarsForIndex={sectionBars}
                    contextBars={sectionContextBars}
                    sheetId={sheetId ?? null}
                    focusedBarIdx={focusedBarIdx}
                    onFocusBar={setFocusedBarIdx}
                    flaggedBars={flaggedBars}
                    onToggleFlag={toggleFlag}
                    getBarColor={getBarColor}
                    barTooltip={barTooltip}
                    onAddAnnotation={(start, end) => setAnnotationTarget({ measureStart: start, measureEnd: end })}
                  />
                  <AnnotationPopover
                    open={annotationTarget !== null}
                    onOpenChange={(v) => { if (!v) setAnnotationTarget(null); }}
                    measureStart={annotationTarget?.measureStart ?? 1}
                    measureEnd={annotationTarget?.measureEnd ?? 1}
                    initialText={annotationTarget?.existing?.text ?? ""}
                    isSaving={createAnnotation.isPending || updateAnnotation.isPending}
                    onSave={(text) => {
                      if (annotationTarget?.existing) {
                        updateAnnotation.mutate({ id: annotationTarget.existing.id, text });
                      } else {
                        createAnnotation.mutate({ measureStart: annotationTarget!.measureStart, measureEnd: annotationTarget!.measureEnd, text });
                      }
                    }}
                    onDelete={annotationTarget?.existing ? () => deleteAnnotation.mutate(annotationTarget!.existing!.id) : undefined}
                  />
                </>
              )}

              {/* Timer + navigation bar */}
              <div className="px-4 py-3 border-t border-border flex items-center gap-3 flex-wrap">
                {!stepTimerStarted ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStepTimerStarted(true)}
                    className="gap-1.5 shrink-0"
                    disabled={isDone}
                  >
                    <Play className="w-3.5 h-3.5" />
                    Start timer
                    {currentSection.durationMin ? ` · ${currentSection.durationMin} min` : ""}
                  </Button>
                ) : (
                  <div className="flex-1 min-w-0">
                    <span className="text-xl font-mono tabular-nums">{formatTime(stepElapsedSec)}</span>
                    {durationSec > 0 && (
                      <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden max-w-[180px]">
                        <div
                          className="h-full bg-[#729E8F] rounded-full transition-all duration-1000"
                          style={{ width: `${Math.min(100, (stepElapsedSec / durationSec) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 ml-auto shrink-0">
                  {currentStep > 0 && (
                    <button
                      type="button"
                      onClick={() => setCurrentStep((s) => s - 1)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                    >
                      ← Back
                    </button>
                  )}
                  {!isLastStep && (
                    <button
                      type="button"
                      onClick={goNext}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                      disabled={isDone}
                    >
                      Skip
                    </button>
                  )}
                  <Button
                    onClick={isLastStep ? () => completeSession.mutate() : goNext}
                    disabled={(!canProceed && !isLastStep) || completeSession.isPending || isDone}
                    className={cn((!canProceed && !isLastStep) && "opacity-40 cursor-not-allowed")}
                    size="sm"
                  >
                    {isLastStep
                      ? (isDone ? "Done" : completeSession.isPending ? "Saving…" : "Finish ✓")
                      : "Next →"}
                  </Button>
                </div>
              </div>

              {/* Step dots (mobile — shown below timer bar) */}
              {sections.length > 1 && (
                <div className="sm:hidden flex items-center justify-center gap-1.5 py-2">
                  {sections.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCurrentStep(i)}
                      className={cn(
                        "w-1.5 h-1.5 rounded-full transition-all",
                        i < currentStep && "bg-[#729E8F]",
                        i === currentStep && "bg-[#C8B388] scale-125",
                        i > currentStep && "bg-muted-foreground/30",
                      )}
                      title={sections[i].label}
                    />
                  ))}
                </div>
              )}
              </div>{/* end max-w-lg */}
            </div>
          )}

          {/* ── Bottom sheet: notes + flagged bars ─────────────────────── */}
          <div
            className={cn(
              "fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border transition-all duration-300 ease-in-out",
              noteSheetOpen ? "h-[52vh]" : "h-12",
            )}
          >
            <button
              type="button"
              onClick={() => setNoteSheetOpen((v) => !v)}
              className="w-full h-12 flex items-center justify-between px-4 shrink-0"
            >
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                {flaggedBars.size > 0 && (
                  <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-bold">
                    {flaggedBars.size}
                  </span>
                )}
                Notes &amp; flagged bars
              </span>
              <ChevronUp
                className={cn(
                  "w-4 h-4 text-muted-foreground transition-transform duration-300",
                  noteSheetOpen && "rotate-180",
                )}
              />
            </button>

            <div
              className={cn(
                "px-4 pb-4 overflow-y-auto transition-opacity duration-200",
                noteSheetOpen ? "opacity-100 h-[calc(52vh-3rem)]" : "opacity-0 pointer-events-none h-0",
              )}
            >
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => saveNotes(notes)}
                placeholder="Notes for this session…"
                className="w-full h-28 text-sm resize-none bg-transparent border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {flaggedBars.size > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                    Flagged bars ({flaggedBars.size})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(flaggedBars.keys()).map((measureId) => {
                      const bar = allMeasures.find((m) => m.id === measureId);
                      if (!bar) return null;
                      return (
                        <div
                          key={measureId}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-xs text-amber-800"
                        >
                          <Flag className="w-2.5 h-2.5 fill-current" />
                          m.{bar.measureNumber}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
