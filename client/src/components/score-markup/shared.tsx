/**
 * Shared chrome + page-grid for "score markup" views.
 *
 * Two views use this: the learning-plan wizard's "Mark sections" step and its
 * "Review detected barlines" step. Keep them visually in sync by building the
 * chrome out of the primitives in this file — do NOT duplicate the outer
 * layout, the thumbnail rail, or the two-column page grid in either view.
 *
 * See CLAUDE.md → "Score markup views" for the invariants.
 */

import { useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { measuresUsePageGeometry, useSheetPageUrl } from "@/lib/sheet-page";

export type BoundingBox = { x: number; y: number; w: number; h: number };

export type ScorePage = {
  pageNumber: number;
  imageUrl: string;
};

export type BarMeasure = {
  id: number;
  measureNumber: number;
  pageNumber: number | null;
  boundingBox: BoundingBox | null;
  imageUrl: string | null;
  movementId?: number | null;
};

const MVMT_STROKE_COLORS = ["#3b82f6", "#16a34a", "#d97706", "#9333ea", "#ef4444"] as const;

/**
 * Outer full-screen shell with the fixed header bar and a flex body split into
 * left rail / center column / optional right panel.
 */
export function ScoreMarkupShell({
  onBack,
  backLabel = "Back",
  title,
  titleChip,
  headerActions,
  leftRail,
  children,
  rightPanel,
}: {
  onBack: () => void;
  backLabel?: string;
  title: React.ReactNode;
  titleChip?: React.ReactNode;
  headerActions: React.ReactNode;
  leftRail: React.ReactNode;
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> {backLabel}
          </button>
          <div className="h-4 w-px bg-border" />
          <span className="text-sm font-semibold">{title}</span>
          {titleChip}
        </div>
        <div className="flex items-center gap-3">{headerActions}</div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        {leftRail}
        {children}
        {rightPanel}
      </div>
    </div>
  );
}

/**
 * Left column page thumbnail rail. Clicking a thumbnail calls `onSelect` —
 * typically to scroll the center column to that page.
 */
export function PageThumbRail({
  pages,
  onSelect,
}: {
  pages: ScorePage[];
  onSelect: (pageNumber: number) => void;
}) {
  return (
    <div className="w-16 shrink-0 border-r bg-muted/20 overflow-y-auto py-2 flex flex-col gap-2 items-center">
      {pages.map((pg) => (
        <button
          key={pg.pageNumber}
          onClick={() => onSelect(pg.pageNumber)}
          className="w-12 rounded border border-border/50 overflow-hidden hover:border-primary/60 transition-colors"
          title={`Page ${pg.pageNumber}`}
        >
          <img src={pg.imageUrl} alt={`p${pg.pageNumber}`} className="w-full h-auto block" />
          <div className="text-[9px] text-center text-muted-foreground py-0.5 leading-none">{pg.pageNumber}</div>
        </button>
      ))}
    </div>
  );
}

/**
 * Center column: two-column grid of page images with absolute-positioned bar
 * overlays (page-geometry case), or a single-column bar strip fallback when
 * bounding boxes aren't available.
 *
 * Callers supply their own `renderOverlay(msr)` (absolute-positioned div per
 * bar) and optional `renderStripRow(msr)` for the fallback. A `banner` slot
 * above the grid is for per-view help text and status.
 */
export function ScorePagesGrid<M extends BarMeasure>({
  pages,
  measures,
  sheetMusicId,
  pageRefs,
  scrollContainerRef,
  onPointerUp,
  onMouseLeave,
  renderOverlay,
  renderStripRow,
  renderPageOverlay,
  onPageImageMouseDown,
  banner,
}: {
  pages: ScorePage[];
  measures: M[];
  sheetMusicId: number;
  pageRefs: React.MutableRefObject<Record<number, HTMLDivElement | null>>;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onPointerUp?: () => void;
  onMouseLeave?: () => void;
  renderOverlay: (msr: M) => React.ReactNode;
  renderStripRow?: (msr: M) => React.ReactNode;
  /**
   * Rendered once per page, absolutely positioned over the page image. Use
   * for per-page SVG overlays (e.g. barline edit tools) that need full-page
   * coordinates instead of per-bar boxes.
   */
  renderPageOverlay?: (pageNumber: number, measuresOnPage: M[]) => React.ReactNode;
  /** Fires when the user mousedowns on bare page area (not a bar overlay). */
  onPageImageMouseDown?: (
    pageNumber: number,
    normalized: { x: number; y: number },
    e: React.MouseEvent<HTMLDivElement>,
  ) => void;
  banner?: React.ReactNode;
}) {
  const getPageUrl = useSheetPageUrl(sheetMusicId);
  const usePageGeometry = useMemo(
    () => measuresUsePageGeometry(measures as Parameters<typeof measuresUsePageGeometry>[0]),
    [measures],
  );
  const measuresByPage = useMemo(() => {
    const m: Record<number, M[]> = {};
    for (const msr of measures) { (m[msr.pageNumber ?? 1] ??= []).push(msr); }
    return m;
  }, [measures]);

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto bg-neutral-100 p-4"
      onPointerUp={onPointerUp}
      onMouseLeave={onMouseLeave}
    >
      {banner}
      {usePageGeometry ? (
        <div className="grid grid-cols-2 gap-4">
          {pages.map((pg) => (
            <div
              key={pg.pageNumber}
              ref={(el) => { pageRefs.current[pg.pageNumber] = el; }}
              className="bg-white shadow-sm rounded overflow-hidden relative"
              onMouseDown={(e) => {
                if (!onPageImageMouseDown) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const y = (e.clientY - rect.top) / rect.height;
                onPageImageMouseDown(pg.pageNumber, { x, y }, e);
              }}
            >
              <img
                src={getPageUrl(pg.pageNumber)}
                alt={`Page ${pg.pageNumber}`}
                className="w-full h-auto block select-none pointer-events-none"
                draggable={false}
              />
              {(measuresByPage[pg.pageNumber] ?? [])
                .filter((m) => m.boundingBox != null)
                .map((msr) => renderOverlay(msr))}
              {renderPageOverlay?.(pg.pageNumber, measuresByPage[pg.pageNumber] ?? [])}
            </div>
          ))}
        </div>
      ) : renderStripRow ? (
        <div className="space-y-1 max-w-2xl mx-auto" style={{ userSelect: "none" }}>
          {measures.map(renderStripRow)}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground text-center py-8">
          No page geometry available.
        </div>
      )}
    </div>
  );
}

/** Hook returning a movement-color resolver for per-bar accenting. */
export function useMovementColorFor<M extends BarMeasure>(measures: M[]) {
  const movementIds = useMemo(() => {
    const seen = new Set<number | null>();
    const ids: Array<number | null> = [];
    for (const m of measures) {
      const mvt = m.movementId ?? null;
      if (!seen.has(mvt)) { seen.add(mvt); ids.push(mvt); }
    }
    return ids;
  }, [measures]);

  return (mvtId: number | null | undefined): string | null => {
    const key = mvtId ?? null;
    const idx = movementIds.indexOf(key);
    if (idx < 0 || movementIds.length <= 1) return null;
    return MVMT_STROKE_COLORS[idx % MVMT_STROKE_COLORS.length];
  };
}

/** Shared header button (used by both views for consistent tap targets). */
export function SubtleHeaderButton({
  onClick, children, title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      {children}
    </button>
  );
}
