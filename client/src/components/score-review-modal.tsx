import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft, ChevronRight, CheckCircle2, ZoomIn, ZoomOut,
  Pencil, MousePointer2, SplitSquareHorizontal, X,
  Trash2, RectangleHorizontal, Milestone, Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BoundingBox { x: number; y: number; w: number; h: number }

interface EditMeasure {
  tempId: string;
  pageNumber: number;
  boundingBox: BoundingBox;
  movementNumber: number;
}

interface ScorePage {
  pageNumber: number;
  imageUrl: string;
  measures: Array<{ id: number; measureNumber: number; movementNumber: number; boundingBox: BoundingBox }>;
}

interface Props {
  sheetMusicId: number;
  totalMeasures: number;
  pieceTitle: string;
  onConfirm: (totalMeasures: number) => void;
  onBack: () => void;
}

type Tool = "pointer" | "add-barline" | "remove-bar" | "delete-system" | "draw-system" | "movement";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Convert a number to a Roman numeral (1–20 range is enough for movements). */
function toRoman(n: number): string {
  const map: [number, string][] = [
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let result = "";
  for (const [val, sym] of map) {
    while (n >= val) { result += sym; n -= val; }
  }
  return result;
}

/**
 * Compute the within-movement bar number and display label for a measure.
 * allMeasures must be sorted by page → y → x (same as measureNumber order).
 */
function barLabel(m: EditMeasure, allMeasures: EditMeasure[]): string {
  // Count how many measures with the same movementNumber come before m
  const idx = allMeasures.indexOf(m);
  let withinMvt = 1;
  for (let i = 0; i < idx; i++) {
    if (allMeasures[i].movementNumber === m.movementNumber) withinMvt++;
  }
  return m.movementNumber === 1 ? String(withinMvt) : `${toRoman(m.movementNumber)}.${withinMvt}`;
}

/**
 * Group measures on a page into "systems" — rows of measures with overlapping y-ranges.
 * Two measures are in the same system if their y-midpoints are within 3% of page height.
 */
function groupIntoSystems(measures: EditMeasure[], pageNumber: number): EditMeasure[][] {
  const pageMeasures = measures
    .filter(m => m.pageNumber === pageNumber)
    .sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x);

  const systems: EditMeasure[][] = [];
  for (const m of pageMeasures) {
    const mid = m.boundingBox.y + m.boundingBox.h / 2;
    const existing = systems.find(sys => {
      const sysMid = sys[0].boundingBox.y + sys[0].boundingBox.h / 2;
      return Math.abs(mid - sysMid) < 0.04; // 4% tolerance
    });
    if (existing) existing.push(m);
    else systems.push([m]);
  }
  return systems;
}

/** Find which system (if any) contains a given measure. */
function findSystem(m: EditMeasure, systems: EditMeasure[][]): EditMeasure[] | null {
  return systems.find(s => s.includes(m)) ?? null;
}

/** Find the measure (if any) whose bounding box contains fractional coords (fx, fy). */
function hitMeasure(measures: EditMeasure[], fx: number, fy: number): EditMeasure | null {
  return measures.find(m => {
    const { x, y, w, h } = m.boundingBox;
    return fx >= x && fx <= x + w && fy >= y && fy <= y + h;
  }) ?? null;
}

/** Get fractional coords of a mouse event relative to an SVG element. */
function svgFrac(e: React.MouseEvent, el: SVGSVGElement): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
}

// ─── SVG Overlay ─────────────────────────────────────────────────────────────

function PageOverlay({
  measures, allMeasures, editMode, activeTool, sheetMusicId, pageNumber,
  onAddMeasures, onSetMeasures,
}: {
  measures: EditMeasure[];
  allMeasures: EditMeasure[];
  editMode: boolean;
  activeTool: Tool;
  sheetMusicId: number;
  pageNumber: number;
  onAddMeasures: (next: EditMeasure[]) => void;
  onSetMeasures: (next: EditMeasure[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredSystem, setHoveredSystem] = useState<EditMeasure[] | null>(null);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [detecting, setDetecting] = useState(false);

  const systems = groupIntoSystems(measures, pageNumber);

  // cursor style per tool
  const cursorMap: Record<Tool, string> = {
    "pointer": "default",
    "add-barline": "crosshair",
    "remove-bar": "not-allowed",
    "delete-system": "not-allowed",
    "draw-system": "crosshair",
    "movement": "cell",
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!editMode || !svgRef.current) return;
    if (activeTool === "draw-system") {
      const frac = svgFrac(e, svgRef.current);
      setDrawStart(frac);
      setDrawCurrent(frac);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!editMode || !svgRef.current || activeTool !== "draw-system" || !drawStart) return;
    setDrawCurrent(svgFrac(e, svgRef.current));
  };

  const handleMouseUp = async (e: React.MouseEvent<SVGSVGElement>) => {
    if (!editMode || !svgRef.current || activeTool !== "draw-system" || !drawStart || !drawCurrent) return;
    const region = {
      x: Math.min(drawStart.x, drawCurrent.x),
      y: Math.min(drawStart.y, drawCurrent.y),
      w: Math.abs(drawCurrent.x - drawStart.x),
      h: Math.abs(drawCurrent.y - drawStart.y),
    };
    setDrawStart(null);
    setDrawCurrent(null);
    if (region.w < 0.02 || region.h < 0.02) return; // too small, ignore

    setDetecting(true);
    try {
      const resp = await apiRequest("POST", `/api/sheet-music/${sheetMusicId}/detect-region`, { pageNumber, region });
      const data = await resp.json() as { boxes: BoundingBox[] };
      if (data.boxes?.length) {
        // Determine movement number: inherit from nearby existing measures
        const nearbyMvt = allMeasures
          .filter(m => m.pageNumber === pageNumber && m.boundingBox.y < region.y + region.h)
          .sort((a, b) => (b.boundingBox.y + b.boundingBox.h) - (a.boundingBox.y + a.boundingBox.h));
        const mvtNum = nearbyMvt[0]?.movementNumber ?? 1;

        const newMeasures = data.boxes.map(box => ({
          tempId: uid(),
          pageNumber,
          boundingBox: box,
          movementNumber: mvtNum,
        }));
        onAddMeasures(newMeasures);
      }
    } catch (err) {
      console.error("detect-region error:", err);
    } finally {
      setDetecting(false);
    }
  };

  const handleMeasureClick = (e: React.MouseEvent, m: EditMeasure) => {
    if (!editMode || !svgRef.current) return;
    e.stopPropagation();

    if (activeTool === "remove-bar") {
      // Find siblings in same system to absorb the space
      const sys = findSystem(m, systems) ?? [];
      const sorted = [...sys].sort((a, b) => a.boundingBox.x - b.boundingBox.x);
      const idx = sorted.indexOf(m);
      const next = [...allMeasures];

      if (idx > 0) {
        // Extend left sibling's width
        const leftM = sorted[idx - 1];
        const li = next.findIndex(x => x.tempId === leftM.tempId);
        if (li >= 0) {
          next[li] = { ...next[li], boundingBox: { ...next[li].boundingBox, w: leftM.boundingBox.w + m.boundingBox.w } };
        }
      } else if (idx < sorted.length - 1) {
        // Extend right sibling leftward
        const rightM = sorted[idx + 1];
        const ri = next.findIndex(x => x.tempId === rightM.tempId);
        if (ri >= 0) {
          next[ri] = { ...next[ri], boundingBox: { x: m.boundingBox.x, y: rightM.boundingBox.y, w: rightM.boundingBox.w + m.boundingBox.w, h: rightM.boundingBox.h } };
        }
      }
      onSetMeasures(next.filter(x => x.tempId !== m.tempId));
      return;
    }

    if (activeTool === "delete-system") {
      const sys = findSystem(m, systems);
      if (!sys) return;
      const ids = new Set(sys.map(s => s.tempId));
      onSetMeasures(allMeasures.filter(x => !ids.has(x.tempId)));
      return;
    }

    if (activeTool === "movement") {
      // Find global sort index of this measure
      const sorted = [...allMeasures].sort((a, b) => {
        if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
        if (a.boundingBox.y !== b.boundingBox.y) return a.boundingBox.y - b.boundingBox.y;
        return a.boundingBox.x - b.boundingBox.x;
      });
      const mIdx = sorted.findIndex(x => x.tempId === m.tempId);
      if (mIdx <= 0) return; // can't mark the first bar as new movement

      // Determine new movement number: max movementNumber of bars before m + 1
      const prevMax = Math.max(...sorted.slice(0, mIdx).map(x => x.movementNumber), 0);
      const alreadyBoundary = m.movementNumber > sorted[mIdx - 1].movementNumber;

      let updated: EditMeasure[];
      if (alreadyBoundary) {
        // Toggle off: merge this movement with the previous one
        const oldMvt = m.movementNumber;
        const prevMvt = sorted[mIdx - 1].movementNumber;
        updated = allMeasures.map(x =>
          x.movementNumber === oldMvt ? { ...x, movementNumber: prevMvt } : x
        );
      } else {
        const newMvt = prevMax + 1;
        // Reassign: m and all measures after m get newMvt (shift subsequent movements up)
        const tempIdSet = new Set(sorted.slice(mIdx).map(x => x.tempId));
        updated = allMeasures.map(x =>
          tempIdSet.has(x.tempId) ? { ...x, movementNumber: x.movementNumber < newMvt ? newMvt : x.movementNumber + (newMvt - m.movementNumber) } : x
        );
        // Simpler: just bump every measure from mIdx onwards
        updated = allMeasures.map(x => {
          const si = sorted.findIndex(s => s.tempId === x.tempId);
          if (si >= mIdx) return { ...x, movementNumber: prevMax + 1 + (x.movementNumber - m.movementNumber) };
          return x;
        });
        // Even simpler and correct: all from mIdx onward get prevMax+1, keeping their relative distance
        const base = m.movementNumber;
        updated = allMeasures.map(x => {
          const si = sorted.findIndex(s => s.tempId === x.tempId);
          return si >= mIdx ? { ...x, movementNumber: prevMax + 1 + (x.movementNumber - base) } : x;
        });
      }
      onSetMeasures(updated);
      return;
    }
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!editMode || !svgRef.current) return;
    if (activeTool !== "add-barline") return;

    const frac = svgFrac(e, svgRef.current);
    const hit = hitMeasure(measures, frac.x, frac.y);
    if (!hit) return;

    const { x, y, w, h } = hit.boundingBox;
    const splitX = frac.x;
    if (splitX <= x + 0.005 || splitX >= x + w - 0.005) return; // too close to edge

    const leftBar: EditMeasure = { tempId: uid(), pageNumber, movementNumber: hit.movementNumber, boundingBox: { x, y, w: splitX - x, h } };
    const rightBar: EditMeasure = { tempId: uid(), pageNumber, movementNumber: hit.movementNumber, boundingBox: { x: splitX, y, w: x + w - splitX, h } };
    onSetMeasures(allMeasures.map(m => m.tempId === hit.tempId ? null : m).filter(Boolean).concat([leftBar, rightBar]) as EditMeasure[]);
  };

  const drawRect = drawStart && drawCurrent ? {
    x: Math.min(drawStart.x, drawCurrent.x),
    y: Math.min(drawStart.y, drawCurrent.y),
    w: Math.abs(drawCurrent.x - drawStart.x),
    h: Math.abs(drawCurrent.y - drawStart.y),
  } : null;

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full select-none"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{ cursor: editMode ? cursorMap[activeTool] : "default", userSelect: "none" }}
      onClick={handleSvgClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {measures.map(m => {
        const { x, y, w, h } = m.boundingBox;
        const hovered = hoveredId === m.tempId;
        const inHovSys = hoveredSystem?.includes(m);
        const isMovBoundary = (() => {
          const sorted = [...allMeasures].sort((a, b) => {
            if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
            if (a.boundingBox.y !== b.boundingBox.y) return a.boundingBox.y - b.boundingBox.y;
            return a.boundingBox.x - b.boundingBox.x;
          });
          const idx = sorted.findIndex(s => s.tempId === m.tempId);
          return idx > 0 && sorted[idx].movementNumber > sorted[idx - 1].movementNumber;
        })();

        // Colour by movement
        const mvtHue = m.movementNumber === 1 ? "99,102,241" :
                       m.movementNumber === 2 ? "234,88,12" :
                       m.movementNumber === 3 ? "21,128,61" : "168,85,247";

        const fillAlpha = inHovSys && activeTool === "delete-system" ? 0.35 :
                          hovered && editMode ? 0.30 : 0.10;
        const strokeAlpha = hovered && editMode ? 0.9 : 0.5;

        return (
          <g
            key={m.tempId}
            onClick={e => handleMeasureClick(e, m)}
            onMouseEnter={() => {
              setHoveredId(m.tempId);
              setHoveredSystem(activeTool === "delete-system" ? findSystem(m, systems) : null);
            }}
            onMouseLeave={() => { setHoveredId(null); setHoveredSystem(null); }}
            style={{ pointerEvents: "all" }}
          >
            <rect
              x={x} y={y} width={w} height={h}
              fill={`rgba(${mvtHue},${fillAlpha})`}
              stroke={`rgba(${mvtHue},${strokeAlpha})`}
              strokeWidth="0.002"
              rx="0.001"
            />
            {/* Movement boundary marker — left edge highlight */}
            {isMovBoundary && (
              <line x1={x} y1={y} x2={x} y2={y + h}
                stroke={`rgba(${mvtHue},0.9)`} strokeWidth="0.005" />
            )}
            {/* Bar number label — small, top-left, above the box */}
            <text
              x={x + 0.004}
              y={y - 0.006}
              fontSize="0.012"
              fill={`rgba(${mvtHue},0.85)`}
              fontFamily="monospace"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {barLabel(m, allMeasures)}
            </text>
          </g>
        );
      })}

      {/* Live draw-region preview */}
      {drawRect && (
        <rect
          x={drawRect.x} y={drawRect.y} width={drawRect.w} height={drawRect.h}
          fill="rgba(34,197,94,0.10)"
          stroke="rgba(34,197,94,0.8)"
          strokeWidth="0.003"
          strokeDasharray="0.01 0.005"
        />
      )}

      {/* Detecting overlay */}
      {detecting && (
        <rect x={0} y={0} width={1} height={1} fill="rgba(0,0,0,0.15)" />
      )}
    </svg>
  );
}

// ─── Page viewer ──────────────────────────────────────────────────────────────

function PageViewer({
  page, zoom, allMeasures, editMode, activeTool, sheetMusicId,
  onAddMeasures, onSetMeasures,
}: {
  page: ScorePage;
  zoom: number;
  allMeasures: EditMeasure[];
  editMode: boolean;
  activeTool: Tool;
  sheetMusicId: number;
  onAddMeasures: (next: EditMeasure[]) => void;
  onSetMeasures: (next: EditMeasure[]) => void;
}) {
  const pageMeasures = allMeasures.filter(m => m.pageNumber === page.pageNumber);
  return (
    <div className="flex flex-col items-center">
      <div
        className="relative inline-block shadow-xl rounded-sm overflow-visible border border-border"
        style={{ width: `${zoom}%`, maxWidth: "100%" }}
      >
        <img
          src={page.imageUrl}
          alt={`Page ${page.pageNumber}`}
          className="block w-full h-auto"
          draggable={false}
        />
        <PageOverlay
          measures={pageMeasures}
          allMeasures={allMeasures}
          editMode={editMode}
          activeTool={activeTool}
          sheetMusicId={sheetMusicId}
          pageNumber={page.pageNumber}
          onAddMeasures={onAddMeasures}
          onSetMeasures={onSetMeasures}
        />
      </div>
    </div>
  );
}

// ─── Edit toolbar ─────────────────────────────────────────────────────────────

const TOOLS: { id: Tool; icon: React.ReactNode; label: string; hint: string }[] = [
  { id: "pointer",       icon: <MousePointer2 className="w-4 h-4" />,       label: "Pointer",        hint: "Hover bars to inspect. No edits." },
  { id: "add-barline",   icon: <SplitSquareHorizontal className="w-4 h-4" />, label: "Add barline",  hint: "Click inside a bar to split it at that point." },
  { id: "remove-bar",    icon: <X className="w-4 h-4" />,                   label: "Remove bar",     hint: "Click a bar to delete it (adjacent bars expand to fill)." },
  { id: "delete-system", icon: <Trash2 className="w-4 h-4" />,              label: "Delete system",  hint: "Click any bar in a row to remove the entire system." },
  { id: "draw-system",   icon: <RectangleHorizontal className="w-4 h-4" />, label: "Add system",     hint: "Drag a rectangle around a missed system to detect bars in it." },
  { id: "movement",      icon: <Milestone className="w-4 h-4" />,           label: "Mark movement",  hint: "Click a bar to mark it as the start of a new movement. Click again to remove." },
];

function EditToolbar({ activeTool, onTool }: { activeTool: Tool; onTool: (t: Tool) => void }) {
  return (
    <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border bg-muted/40 shrink-0">
      <span className="text-xs text-muted-foreground mr-2 font-medium">Edit:</span>
      {TOOLS.map(t => (
        <button
          key={t.id}
          title={t.label}
          onClick={() => onTool(t.id)}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors",
            activeTool === t.id
              ? "bg-primary text-primary-foreground shadow"
              : "hover:bg-accent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.icon}
          <span className="hidden sm:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function ScoreReviewModal({ sheetMusicId, totalMeasures, pieceTitle, onConfirm, onBack }: Props) {
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(90);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [editMode, setEditMode] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>("pointer");

  // Local editable measure list
  const [localMeasures, setLocalMeasures] = useState<EditMeasure[]>([]);
  const [history, setHistory] = useState<EditMeasure[][]>([]); // undo stack
  const [isDirty, setIsDirty] = useState(false);

  const { data: pages = [], isLoading } = useQuery<ScorePage[]>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/pages`],
    staleTime: Infinity,
  });

  // Initialise local measures from API data
  useEffect(() => {
    if (pages.length === 0) return;
    const flat: EditMeasure[] = pages.flatMap(p =>
      p.measures.map(m => ({
        tempId: uid(),
        pageNumber: p.pageNumber,
        boundingBox: m.boundingBox as BoundingBox,
        movementNumber: m.movementNumber ?? 1,
      }))
    );
    setLocalMeasures(flat);
    setHistory([]);
    setIsDirty(false);
  }, [pages]);

  // Reset to page 1 when data loads
  useEffect(() => {
    if (pages.length > 0) setCurrentPage(1);
  }, [pages.length]);

  // Scroll to top when page changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentPage]);

  // Undo (Ctrl+Z)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        setHistory(h => {
          if (h.length === 0) return h;
          const prev = h[h.length - 1];
          setLocalMeasures(prev);
          return h.slice(0, -1);
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const pushHistory = useCallback((current: EditMeasure[]) => {
    setHistory(h => [...h.slice(-19), current]); // keep last 20
  }, []);

  const handleSetMeasures = useCallback((next: EditMeasure[]) => {
    setLocalMeasures(prev => { pushHistory(prev); return next; });
    setIsDirty(true);
  }, [pushHistory]);

  const handleAddMeasures = useCallback((newMs: EditMeasure[]) => {
    setLocalMeasures(prev => { pushHistory(prev); return [...prev, ...newMs]; });
    setIsDirty(true);
  }, [pushHistory]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Sort for consistent measureNumber assignment
      const sorted = [...localMeasures].sort((a, b) => {
        if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
        if (a.boundingBox.y !== b.boundingBox.y) return a.boundingBox.y - b.boundingBox.y;
        return a.boundingBox.x - b.boundingBox.x;
      });
      const payload = sorted.map(m => ({
        pageNumber: m.pageNumber,
        boundingBox: m.boundingBox,
        movementNumber: m.movementNumber,
      }));
      const resp = await apiRequest("PUT", `/api/sheet-music/${sheetMusicId}/measures/replace`, { measures: payload });
      if (!resp.ok) throw new Error("Save failed");
      const data = await resp.json() as { saved: number };
      return data.saved;
    },
    onSuccess: (saved) => onConfirm(saved),
  });

  const handleConfirm = () => {
    if (isDirty) saveMutation.mutate();
    else onConfirm(localMeasures.length);
  };

  const totalPages = pages.length;
  const page = pages.find(p => p.pageNumber === currentPage);
  const activeHint = TOOLS.find(t => t.id === activeTool)?.hint ?? "";
  const mvtCount = new Set(localMeasures.map(m => m.movementNumber)).size;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Review detected bars</p>
          <p className="font-serif text-lg font-semibold truncate">{pieceTitle}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Stats */}
          <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{localMeasures.length}</span> bars ·
            <span className="font-semibold text-foreground">{totalPages}</span> pages
            {mvtCount > 1 && (
              <> · <span className="font-semibold text-foreground">{mvtCount}</span> movements</>
            )}
          </div>

          {/* Undo */}
          {editMode && (
            <Button
              variant="ghost" size="icon" className="w-8 h-8"
              disabled={history.length === 0}
              onClick={() => {
                if (history.length === 0) return;
                setLocalMeasures(history[history.length - 1]);
                setHistory(h => h.slice(0, -1));
              }}
              title="Undo (⌘Z)"
            >
              <Undo2 className="w-4 h-4" />
            </Button>
          )}

          {/* Edit toggle */}
          <Button
            variant={editMode ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => { setEditMode(e => !e); setActiveTool("pointer"); }}
          >
            <Pencil className="w-3.5 h-3.5" />
            {editMode ? "Editing" : "Edit"}
          </Button>

          {/* Zoom */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setZoom(z => Math.max(40, z - 15))}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-xs w-10 text-center tabular-nums">{zoom}%</span>
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setZoom(z => Math.min(200, z + 15))}>
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>

          {/* Page nav */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="w-8 h-8" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm tabular-nums min-w-[4rem] text-center">
              {isLoading ? "—" : `p.${currentPage} / ${totalPages}`}
            </span>
            <Button variant="ghost" size="icon" className="w-8 h-8" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Edit toolbar (visible only in edit mode) ── */}
      {editMode && <EditToolbar activeTool={activeTool} onTool={setActiveTool} />}

      {/* ── Sidebar + main ── */}
      <div className="flex flex-1 min-h-0">
        {/* Page thumbnails sidebar */}
        <div className="w-28 shrink-0 border-r border-border bg-muted/30 overflow-y-auto flex flex-col gap-2 p-2">
          {isLoading
            ? [...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded" />)
            : pages.map(p => (
              <button
                key={p.pageNumber}
                onClick={() => setCurrentPage(p.pageNumber)}
                className={cn(
                  "relative rounded overflow-hidden border-2 transition-all",
                  p.pageNumber === currentPage ? "border-primary shadow-md" : "border-transparent hover:border-border",
                )}
              >
                <img src={p.imageUrl} alt={`p.${p.pageNumber}`} className="w-full h-auto block" />
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center py-0.5">
                  p.{p.pageNumber}
                </div>
              </button>
            ))
          }
        </div>

        {/* Main scrollable page view */}
        <div ref={scrollRef} className="flex-1 overflow-auto bg-muted/20 p-6 flex flex-col items-center">
          {isLoading ? (
            <Skeleton className="w-[90%] h-[70vh] rounded" />
          ) : page ? (
            <PageViewer
              page={page}
              zoom={zoom}
              allMeasures={localMeasures}
              editMode={editMode}
              activeTool={activeTool}
              sheetMusicId={sheetMusicId}
              onAddMeasures={handleAddMeasures}
              onSetMeasures={handleSetMeasures}
            />
          ) : null}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-card shrink-0">
        <p className="text-xs text-muted-foreground max-w-sm">
          {editMode ? activeHint : "Hover bars to see numbers. Toggle Edit to make corrections."}
        </p>
        <div className="flex items-center gap-3">
          {saveMutation.isError && (
            <span className="text-xs text-destructive">Save failed — try again</span>
          )}
          <Button variant="outline" onClick={onBack} disabled={saveMutation.isPending}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Button onClick={handleConfirm} className="gap-2" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <span className="text-xs">Saving…</span>
            ) : (
              <><CheckCircle2 className="w-4 h-4" /> Looks good</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
