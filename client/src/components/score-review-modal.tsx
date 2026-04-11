import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft, ChevronRight, CheckCircle2, ZoomIn, ZoomOut,
  Pencil, Trash2, RectangleHorizontal, Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BoundingBox { x: number; y: number; w: number; h: number }

export interface EditMeasure {
  tempId: string;
  pageNumber: number;
  boundingBox: BoundingBox;
  movementNumber: number;
}

/** Passed to PageOverlay; supports functional updates so deletes use latest measure list. */
export type SetMeasuresFn = (next: EditMeasure[] | ((prev: EditMeasure[]) => EditMeasure[])) => void;

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

export type Tool = "barline-edit" | "delete-system" | "draw-system";

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
 * Group measures on a page into "systems" — rows of measures with overlapping y-ranges.
 * Two measures are in the same system if their y-ranges overlap (with tolerance).
 */
function groupIntoSystems(measures: EditMeasure[], pageNumber: number): EditMeasure[][] {
  const pageMeasures = measures
    .filter(m => m.pageNumber === pageNumber)
    .sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x);

  const tolerance = 0.01;
  const groups: Array<{ y0: number; y1: number; measures: EditMeasure[] }> = [];
  for (const m of pageMeasures) {
    const my0 = m.boundingBox.y;
    const my1 = m.boundingBox.y + m.boundingBox.h;
    const existing = groups.find(g => my0 <= g.y1 + tolerance && my1 >= g.y0 - tolerance);
    if (existing) {
      existing.measures.push(m);
      existing.y0 = Math.min(existing.y0, my0);
      existing.y1 = Math.max(existing.y1, my1);
    } else {
      groups.push({ y0: my0, y1: my1, measures: [m] });
    }
  }
  return groups
    .sort((a, b) => a.y0 - b.y0)
    .map(g => g.measures.sort((a, b) => a.boundingBox.x - b.boundingBox.x));
}

function sortMeasures(measures: EditMeasure[]): EditMeasure[] {
  return [...measures].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (a.boundingBox.y !== b.boundingBox.y) return a.boundingBox.y - b.boundingBox.y;
    return a.boundingBox.x - b.boundingBox.x;
  });
}

function overlapArea(a: BoundingBox, b: BoundingBox): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return 0;
  return (x1 - x0) * (y1 - y0);
}

function area(b: BoundingBox): number {
  return Math.max(0, b.w) * Math.max(0, b.h);
}

function shouldReplaceExistingInRegion(existing: BoundingBox, region: BoundingBox): boolean {
  const inter = overlapArea(existing, region);
  if (inter <= 0) return false;
  const ratio = inter / Math.max(1e-6, Math.min(area(existing), area(region)));
  return ratio > 0.2;
}

interface SystemInfo {
  index: number;
  measures: EditMeasure[];
  y0: number;
  y1: number;
}

function buildSystemInfo(systems: EditMeasure[][]): SystemInfo[] {
  return systems.map((sys, index) => {
    const y0 = Math.min(...sys.map(m => m.boundingBox.y));
    const y1 = Math.max(...sys.map(m => m.boundingBox.y + m.boundingBox.h));
    return {
      index,
      measures: [...sys].sort((a, b) => a.boundingBox.x - b.boundingBox.x),
      y0,
      y1,
    };
  });
}

function systemBoundaries(sys: SystemInfo): number[] {
  const out: number[] = [];
  for (let i = 0; i < sys.measures.length - 1; i++) {
    const a = sys.measures[i]!;
    const b = sys.measures[i + 1]!;
    const rightA = a.boundingBox.x + a.boundingBox.w;
    const leftB = b.boundingBox.x;
    out.push((rightA + leftB) / 2);
  }
  return out;
}

function extractBarlineXs(sys: SystemInfo): number[] {
  const xs = sys.measures.map(m => m.boundingBox.x).sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of xs) {
    const prev = out[out.length - 1];
    if (prev === undefined || Math.abs(prev - x) > 0.002) out.push(x);
  }
  return out;
}

function lineKey(systemMidY: number, x: number): string {
  return `${systemMidY.toFixed(3)}:${x.toFixed(3)}`;
}

function dedupeMeasures(measures: EditMeasure[]): EditMeasure[] {
  const seen = new Set<string>();
  const out: EditMeasure[] = [];
  for (const m of measures) {
    const k = `${m.pageNumber}:${m.boundingBox.x.toFixed(4)}:${m.boundingBox.y.toFixed(4)}:${m.boundingBox.w.toFixed(4)}:${m.boundingBox.h.toFixed(4)}:${m.movementNumber}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

function buildBarLabelMap(allMeasures: EditMeasure[]): Map<string, string> {
  const sorted = sortMeasures(allMeasures);
  const seenPerMovement = new Map<number, number>();
  const labelById = new Map<string, string>();
  for (const m of sorted) {
    const current = (seenPerMovement.get(m.movementNumber) ?? 0) + 1;
    seenPerMovement.set(m.movementNumber, current);
    const label = m.movementNumber === 1 ? String(current) : `${toRoman(m.movementNumber)}.${current}`;
    labelById.set(m.tempId, label);
  }
  return labelById;
}

/**
 * Map viewport (client) coords into SVG user space (viewBox 0..1).
 * Uses getScreenCTM so results match what the SVG actually draws — dividing by
 * getBoundingClientRect() alone can disagree (subpixel, transforms, preserveAspectRatio).
 */
function svgUserCoordsFromClient(clientX: number, clientY: number, el: SVGSVGElement): { x: number; y: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  try {
    const ctm = el.getScreenCTM();
    if (ctm) {
      const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      return { x: clamp(p.x), y: clamp(p.y) };
    }
  } catch {
    /* singular matrix — fall back */
  }
  const r = el.getBoundingClientRect();
  const w = r.width || 1;
  const h = r.height || 1;
  return {
    x: clamp((clientX - r.left) / w),
    y: clamp((clientY - r.top) / h),
  };
}

function svgFrac(
  e: Pick<React.MouseEvent<SVGSVGElement>, "clientX" | "clientY">,
  el: SVGSVGElement,
): { x: number; y: number } {
  return svgUserCoordsFromClient(e.clientX, e.clientY, el);
}

/** Pick the system under `frac.y` when bands overlap: smallest vertical span wins (most specific row). */
function systemAtFracY(systemInfo: SystemInfo[], fracY: number): SystemInfo | null {
  const hits = systemInfo.filter((s) => fracY >= s.y0 && fracY <= s.y1);
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0]!;
  return hits.reduce((best, s) => {
    const span = s.y1 - s.y0;
    const bestSpan = best.y1 - best.y0;
    return span < bestSpan ? s : best;
  });
}

// ─── SVG Overlay ─────────────────────────────────────────────────────────────

export function PageOverlay({
  measures, allMeasures, baselineMeasures, editMode, activeTool, sheetMusicId, pageNumber,
  onSetMeasures,
}: {
  measures: EditMeasure[];
  allMeasures: EditMeasure[];
  baselineMeasures: EditMeasure[];
  editMode: boolean;
  activeTool: Tool;
  sheetMusicId: number;
  pageNumber: number;
  onSetMeasures: SetMeasuresFn;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  /** TempIds for the row under the pointer (delete-system); same source as the red highlight. */
  const deleteHoverTempIdsRef = useRef<readonly string[] | null>(null);
  const [hoveredSystem, setHoveredSystem] = useState<SystemInfo | null>(null);
  const [activeSystem, setActiveSystem] = useState<SystemInfo | null>(null);
  const [hoverBoundaryX, setHoverBoundaryX] = useState<number | null>(null);
  const [canDeleteBoundary, setCanDeleteBoundary] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [detecting, setDetecting] = useState(false);

  const systems = groupIntoSystems(measures, pageNumber);
  const baselineSystems = groupIntoSystems(baselineMeasures, pageNumber);
  const systemInfo = buildSystemInfo(systems);
  const baselineSystemInfo = buildSystemInfo(baselineSystems);
  const barLabelById = useMemo(() => buildBarLabelMap(allMeasures), [allMeasures]);

  // cursor style per tool
  const cursorMap: Record<Tool, string> = {
    "barline-edit": "crosshair",
    "delete-system": "pointer",
    "draw-system": "crosshair",
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!editMode || !svgRef.current) return;
    const frac = svgUserCoordsFromClient(e.clientX, e.clientY, svgRef.current);

    if (activeTool === "draw-system" && drawStart) {
      setDrawCurrent(frac);
      return;
    }

    if (activeTool === "delete-system") {
      const sys = systemAtFracY(systemInfo, frac.y);
      deleteHoverTempIdsRef.current = sys ? sys.measures.map((m) => m.tempId) : null;
      setHoveredSystem(sys);
      setActiveSystem(null);
      setHoverBoundaryX(null);
      setCanDeleteBoundary(false);
      return;
    }

    if (activeTool !== "barline-edit") {
      setActiveSystem(null);
      setHoverBoundaryX(null);
      setCanDeleteBoundary(false);
      return;
    }

    const sys = systemAtFracY(systemInfo, frac.y);
    setActiveSystem(sys);
    if (!sys) {
      setHoverBoundaryX(null);
      setCanDeleteBoundary(false);
      return;
    }

    const boundaries = systemBoundaries(sys);
    if (boundaries.length > 0) {
      let best: number | null = null;
      let bestDist = Infinity;
      for (const x of boundaries) {
        const d = Math.abs(frac.x - x);
        if (d < bestDist) {
          bestDist = d;
          best = x;
        }
      }
      const nearBoundary = best !== null && bestDist <= 0.012;
      setCanDeleteBoundary(nearBoundary);
      setHoverBoundaryX(nearBoundary && best !== null ? best : frac.x);
      return;
    }
    setCanDeleteBoundary(false);
    setHoverBoundaryX(frac.x);
  };

  const handleSvgPointerUp = async (e: React.PointerEvent<SVGSVGElement>) => {
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
        const nearbyMvt = sortMeasures(allMeasures)
          .filter(m => m.pageNumber === pageNumber && m.boundingBox.y < region.y + region.h)
          .sort((a, b) => (b.boundingBox.y + b.boundingBox.h) - (a.boundingBox.y + a.boundingBox.h));
        const mvtNum = nearbyMvt[0]?.movementNumber ?? 1;

        const detected = data.boxes.map(box => ({
          tempId: uid(),
          pageNumber,
          boundingBox: box,
          movementNumber: mvtNum,
        }));

        const retained = allMeasures.filter(m =>
          !(m.pageNumber === pageNumber && shouldReplaceExistingInRegion(m.boundingBox, region))
        );
        const merged = sortMeasures(dedupeMeasures([...retained, ...detected]));
        onSetMeasures(merged);
      }
    } catch (err) {
      console.error("detect-region error:", err);
    } finally {
      setDetecting(false);
    }
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!editMode || !svgRef.current) return;
    const el = svgRef.current;

    if (activeTool === "delete-system") {
      e.preventDefault();
      const clientX = e.clientX;
      const clientY = e.clientY;
      onSetMeasures((prev) => {
        const validIds = (ids: readonly string[] | null | undefined): readonly string[] | null => {
          if (!ids?.length) return null;
          return ids.every((id) => prev.some((m) => m.tempId === id)) ? ids : null;
        };
        const fromRef = validIds(deleteHoverTempIdsRef.current);
        const fromState = validIds(hoveredSystem?.measures.map((m) => m.tempId));
        const pageMeasures = prev.filter((m) => m.pageNumber === pageNumber);
        const si = buildSystemInfo(groupIntoSystems(pageMeasures, pageNumber));
        const frac = svgUserCoordsFromClient(clientX, clientY, el);
        const fromPointer = validIds(systemAtFracY(si, frac.y)?.measures.map((m) => m.tempId));
        const pick = fromRef ?? fromState ?? fromPointer;
        if (import.meta.env.DEV) {
          (window as unknown as { __lastScoreDeleteDebug?: unknown }).__lastScoreDeleteDebug = {
            pick: pick ? [...pick] : null,
            pickSource: fromRef ? "ref" : fromState ? "state" : fromPointer ? "pointer" : null,
            frac,
            rowBands: si.map((s) => ({ y0: s.y0, y1: s.y1, n: s.measures.length })),
          };
        }
        if (!pick?.length) return prev;
        return prev.filter((x) => !pick.includes(x.tempId));
      });
      deleteHoverTempIdsRef.current = null;
      return;
    }

    if (activeTool === "draw-system") {
      const frac = svgUserCoordsFromClient(e.clientX, e.clientY, el);
      setDrawStart(frac);
      setDrawCurrent(frac);
    }
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!editMode || !svgRef.current) return;
    const frac = svgFrac(e, svgRef.current);
    if (activeTool === "barline-edit") {
      const sys = systemAtFracY(systemInfo, frac.y);
      if (!sys) return;
      const boundaries = systemBoundaries(sys);
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < boundaries.length; i++) {
        const dist = Math.abs(frac.x - boundaries[i]!);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      const shouldDelete = bestIdx >= 0 && bestDist <= 0.012;
      if (shouldDelete) {
        const leftM = sys.measures[bestIdx]!;
        const rightM = sys.measures[bestIdx + 1]!;
        const merged: EditMeasure = {
          tempId: uid(),
          pageNumber,
          movementNumber: leftM.movementNumber,
          boundingBox: {
            x: leftM.boundingBox.x,
            y: Math.min(leftM.boundingBox.y, rightM.boundingBox.y),
            w: (rightM.boundingBox.x + rightM.boundingBox.w) - leftM.boundingBox.x,
            h: Math.max(leftM.boundingBox.h, rightM.boundingBox.h),
          },
        };
        const kept = allMeasures.filter(mm => mm.tempId !== leftM.tempId && mm.tempId !== rightM.tempId);
        onSetMeasures(sortMeasures([...kept, merged]));
        return;
      }

      const splitX = frac.x;
      const hit = sys.measures.find(mm => splitX > mm.boundingBox.x + 0.005 && splitX < mm.boundingBox.x + mm.boundingBox.w - 0.005);
      if (!hit) return;
      const { x, y, w, h } = hit.boundingBox;
      const leftBar: EditMeasure = { tempId: uid(), pageNumber, movementNumber: hit.movementNumber, boundingBox: { x, y, w: splitX - x, h } };
      const rightBar: EditMeasure = { tempId: uid(), pageNumber, movementNumber: hit.movementNumber, boundingBox: { x: splitX, y, w: x + w - splitX, h } };
      const kept = allMeasures.filter(mm => mm.tempId !== hit.tempId);
      onSetMeasures(sortMeasures([...kept, leftBar, rightBar]));
    }
  };

  const drawRect = drawStart && drawCurrent ? {
    x: Math.min(drawStart.x, drawCurrent.x),
    y: Math.min(drawStart.y, drawCurrent.y),
    w: Math.abs(drawCurrent.x - drawStart.x),
    h: Math.abs(drawCurrent.y - drawStart.y),
  } : null;

  const currentLineItems = systemInfo.flatMap((sys) => {
    const mid = (sys.y0 + sys.y1) / 2;
    return extractBarlineXs(sys).map((x) => ({
      key: lineKey(mid, x),
      x,
      y0: sys.y0,
      y1: sys.y1,
    }));
  });
  const baselineLineItems = baselineSystemInfo.flatMap((sys) => {
    const mid = (sys.y0 + sys.y1) / 2;
    return extractBarlineXs(sys).map((x) => ({
      key: lineKey(mid, x),
      x,
      y0: sys.y0,
      y1: sys.y1,
    }));
  });
  const currentKeys = new Set(currentLineItems.map(l => l.key));
  const baselineKeys = new Set(baselineLineItems.map(l => l.key));
  const addedLines = currentLineItems.filter(l => !baselineKeys.has(l.key));
  const detectedLines = currentLineItems.filter(l => baselineKeys.has(l.key));
  const removedLines = baselineLineItems.filter(l => !currentKeys.has(l.key));

  return (
    <svg
      ref={svgRef}
      data-testid="score-overlay-svg"
      className="absolute inset-0 w-full h-full select-none"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{ cursor: editMode ? cursorMap[activeTool] : "default", userSelect: "none" }}
      onClick={handleSvgClick}
      onPointerDown={handleSvgPointerDown}
      onPointerMove={handleSvgPointerMove}
      onPointerUp={handleSvgPointerUp}
      onPointerLeave={() => {
        deleteHoverTempIdsRef.current = null;
        setActiveSystem(null);
        setHoveredSystem(null);
        setHoverBoundaryX(null);
        setCanDeleteBoundary(false);
      }}
    >
      {/* Invisible hit targets for system-level actions */}
      {measures.map((m) => {
        const { x, y, w, h } = m.boundingBox;
        return (
          <rect
            key={m.tempId}
            x={x}
            y={y}
            width={w}
            height={h}
            fill="transparent"
            stroke="none"
            style={{ pointerEvents: "all" }}
          />
        );
      })}

      {editMode && activeTool === "delete-system" && hoveredSystem && (
        <rect
          x={Math.min(...hoveredSystem.measures.map(mm => mm.boundingBox.x))}
          y={hoveredSystem.y0}
          width={Math.max(...hoveredSystem.measures.map(mm => mm.boundingBox.x + mm.boundingBox.w)) - Math.min(...hoveredSystem.measures.map(mm => mm.boundingBox.x))}
          height={hoveredSystem.y1 - hoveredSystem.y0}
          fill="rgba(220,38,38,0.12)"
          stroke="rgba(220,38,38,0.45)"
          strokeWidth="0.0025"
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Baseline/detected lines (blue in edit mode, neutral in view mode) */}
      {detectedLines.map((l) => (
        <line
          key={`det-${l.key}`}
          x1={l.x}
          y1={l.y0}
          x2={l.x}
          y2={l.y1}
          stroke={editMode ? "rgba(37,99,235,0.92)" : "rgba(59,130,246,0.72)"}
          strokeWidth="0.0028"
          style={{ pointerEvents: "none" }}
        />
      ))}
      {/* Added lines (green in edit mode only; blue in view mode) */}
      {addedLines.map((l) => (
        <line
          key={`add-${l.key}`}
          x1={l.x}
          y1={l.y0}
          x2={l.x}
          y2={l.y1}
          stroke={editMode ? "rgba(22,163,74,0.95)" : "rgba(59,130,246,0.72)"}
          strokeWidth="0.0033"
          style={{ pointerEvents: "none" }}
        />
      ))}
      {/* Removed baseline lines (red dashed, edit mode only; ephemeral) */}
      {editMode && removedLines.map((l) => (
        <line
          key={`rm-${l.key}`}
          x1={l.x}
          y1={l.y0}
          x2={l.x}
          y2={l.y1}
          stroke="rgba(220,38,38,0.9)"
          strokeWidth="0.0028"
          strokeDasharray="0.009 0.006"
          style={{ pointerEvents: "none" }}
        />
      ))}

      {editMode && activeTool === "barline-edit" && activeSystem && hoverBoundaryX !== null && (
        <line
          x1={hoverBoundaryX}
          y1={activeSystem.y0}
          x2={hoverBoundaryX}
          y2={activeSystem.y1}
          stroke={canDeleteBoundary ? "rgba(220,38,38,0.95)" : "rgba(22,163,74,0.95)"}
          strokeWidth={canDeleteBoundary ? "0.004" : "0.0025"}
          strokeDasharray={canDeleteBoundary ? undefined : "0.008 0.005"}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Bar numbers above each system (compact blue pills) */}
      {systemInfo.flatMap((sys) =>
        sys.measures.map((m) => {
          const label = barLabelById.get(m.tempId) ?? "";
          if (!label) return null;
          const x = m.boundingBox.x + m.boundingBox.w / 2;
          const boxH = 0.015;
          const boxW = Math.max(0.012, label.length * 0.0075 + 0.006);
          const boxY = Math.max(0.001, sys.y0 - 0.022);
          const textY = boxY + boxH * 0.72;
          return (
            <g key={`lbl-${m.tempId}`} style={{ pointerEvents: "none" }}>
              <rect
                x={x - boxW / 2}
                y={boxY}
                width={boxW}
                height={boxH}
                rx={0.0035}
                ry={0.0035}
                fill="rgba(37,99,235,0.95)"
              />
              <text
                x={x}
                y={textY}
                textAnchor="middle"
                fontSize="0.0105"
                fontWeight="700"
                fill="rgba(255,255,255,1)"
              >
                {label}
              </text>
            </g>
          );
        })
      )}

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
  page, zoom, allMeasures, baselineMeasures, editMode, activeTool, sheetMusicId,
  onSetMeasures,
}: {
  page: ScorePage;
  zoom: number;
  allMeasures: EditMeasure[];
  baselineMeasures: EditMeasure[];
  editMode: boolean;
  activeTool: Tool;
  sheetMusicId: number;
  onSetMeasures: SetMeasuresFn;
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
          baselineMeasures={baselineMeasures}
          editMode={editMode}
          activeTool={activeTool}
          sheetMusicId={sheetMusicId}
          pageNumber={page.pageNumber}
          onSetMeasures={onSetMeasures}
        />
      </div>
    </div>
  );
}

// ─── Edit toolbar ─────────────────────────────────────────────────────────────

const TOOLS: { id: Exclude<Tool, "barline-edit">; icon: React.ReactNode; label: string; hint: string }[] = [
  { id: "delete-system", icon: <Trash2 className="w-4 h-4" />,              label: "Delete system",  hint: "Click any bar in a row to remove the entire system." },
  { id: "draw-system",   icon: <RectangleHorizontal className="w-4 h-4" />, label: "Add system",     hint: "Drag a rectangle around a missed system to detect bars in it." },
];

function EditToolbar({ activeTool, onTool }: { activeTool: Tool; onTool: (t: Tool) => void }) {
  return (
    <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border bg-muted/40 shrink-0">
      <span className="text-xs text-muted-foreground mr-2 font-medium">Actions:</span>
      {TOOLS.map(t => (
        <button
          key={t.id}
          title={t.label}
          onClick={() => onTool(activeTool === t.id ? "barline-edit" : t.id)}
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
  const [activeTool, setActiveTool] = useState<Tool>("barline-edit");

  // Local editable measure list
  const [localMeasures, setLocalMeasures] = useState<EditMeasure[]>([]);
  const [baselineMeasures, setBaselineMeasures] = useState<EditMeasure[]>([]);
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
    setBaselineMeasures(flat);
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

  const handleSetMeasures = useCallback<SetMeasuresFn>((next) => {
    setLocalMeasures((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      pushHistory(prev);
      return resolved;
    });
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
  const activeHint =
    activeTool === "barline-edit"
      ? "Hover in a system: green line adds a barline, red line deletes one. Click to apply."
      : (TOOLS.find(t => t.id === activeTool)?.hint ?? "");
  const mvtCount = new Set(localMeasures.map(m => m.movementNumber)).size;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Review detected barlines</p>
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
            onClick={() => { setEditMode(e => !e); setActiveTool("barline-edit"); }}
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
              baselineMeasures={baselineMeasures}
              editMode={editMode}
              activeTool={activeTool}
              sheetMusicId={sheetMusicId}
              onSetMeasures={handleSetMeasures}
            />
          ) : null}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-card shrink-0">
        <p className="text-xs text-muted-foreground max-w-sm">
          {editMode ? activeHint : "Hover barlines. Toggle Edit to make corrections."}
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
