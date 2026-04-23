import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ChevronLeft, ChevronRight, Flag, Plus, StickyNote } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { measuresUsePageGeometry, useSheetPageUrl } from "@/lib/sheet-page";

export type BoundingBox = { x: number; y: number; w: number; h: number };

export type MeasureRow = {
  id: number;
  measureNumber: number;
  pageNumber: number | null;
  boundingBox: BoundingBox | null;
  imageUrl: string | null;
};

export type BarColorFn = (measureNumber: number) => { border: string; bg: string } | null;

export type BarAnnotation = {
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

export function groupIntoSystems(bars: MeasureRow[], tolerance = 0.04): MeasureRow[][] {
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
    if (sameRow) current.push(curr);
    else {
      systems.push(current);
      current = [curr];
    }
  }
  systems.push(current);
  return systems;
}

export function parseLabelRange(label: string): { start: number; end: number } | null {
  const m = label.match(/mm\.\s*(\d+)[–\-–](\d+)/);
  if (m) return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
  const s = label.match(/mm\.\s*(\d+)/);
  if (s) return { start: parseInt(s[1], 10), end: parseInt(s[1], 10) };
  return null;
}

export function ScoreStepView({
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
  annotations,
  onAnnotationClick,
}: {
  bars: MeasureRow[];
  allBarsForIndex: MeasureRow[];
  contextBars: MeasureRow[];
  sheetId: number | null;
  focusedBarIdx: number | null;
  onFocusBar: (idx: number | null) => void;
  flaggedBars: Map<number, number>;
  onToggleFlag: (measureId: number, flagId: number | undefined) => void;
  getBarColor: BarColorFn;
  barTooltip: string | null;
  onAddAnnotation?: (measureStart: number, measureEnd: number) => void;
  annotations?: BarAnnotation[];
  onAnnotationClick?: (annotation: BarAnnotation) => void;
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

  const annotationByMeasure = new Map<number, BarAnnotation>();
  for (const ann of (annotations ?? [])) {
    for (let n = ann.measureStart; n <= ann.measureEnd; n++) {
      annotationByMeasure.set(n, ann);
    }
  }

  const useFullPageScore =
    sheetId != null && bars.length > 0 && measuresUsePageGeometry(bars);

  const scorePageNumbers = useFullPageScore
    ? Array.from(new Set(bars.filter((b) => b.pageNumber != null).map((b) => b.pageNumber!))).sort((a, b) => a - b)
    : [];

  if (bars.length === 0) return null;

  return (
    <div className="border border-[#ddd8cc] bg-white relative overflow-hidden rounded-lg"
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
                            {annotationByMeasure.has(bar.measureNumber) && !isSelectionEnd && (
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); onAnnotationClick?.(annotationByMeasure.get(bar.measureNumber)!); }}
                                className="absolute bottom-0.5 left-0.5 w-4 h-4 flex items-center justify-center rounded pointer-events-auto z-20 bg-amber-400/90 text-white hover:bg-amber-500 transition-colors"
                                title={`Note: ${annotationByMeasure.get(bar.measureNumber)!.text}`}
                              >
                                <StickyNote className="w-2.5 h-2.5" />
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
                      {annotationByMeasure.has(bar.measureNumber) && !isSelectionEnd && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); onAnnotationClick?.(annotationByMeasure.get(bar.measureNumber)!); }}
                          className="absolute bottom-0.5 left-0.5 w-4 h-4 flex items-center justify-center rounded pointer-events-auto z-20 bg-amber-400/90 text-white hover:bg-amber-500 transition-colors"
                          title={`Note: ${annotationByMeasure.get(bar.measureNumber)!.text}`}
                        >
                          <StickyNote className="w-2.5 h-2.5" />
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

export function AnnotationPopover({
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
            className="flex-1 text-xs font-semibold py-1.5 rounded bg-[#0f2036] text-[#c9a86a] hover:opacity-90 disabled:opacity-40 transition-opacity"
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
