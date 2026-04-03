import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, CheckCircle2, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BoundingBox {
  x: number; y: number; w: number; h: number;
}

interface PageMeasure {
  id: number;
  measureNumber: number;
  boundingBox: BoundingBox;
}

interface ScorePage {
  pageNumber: number;
  imageUrl: string;
  measures: PageMeasure[];
}

interface Props {
  sheetMusicId: number;
  totalMeasures: number;
  pieceTitle: string;
  onConfirm: () => void;
  onBack: () => void;
}

// ─── Bar overlay drawn with SVG over the page image ──────────────────────────

function BarOverlay({
  measures,
  hoveredBar,
  onHover,
}: {
  measures: PageMeasure[];
  hoveredBar: number | null;
  onHover: (n: number | null) => void;
}) {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{ pointerEvents: "none" }}
    >
      {measures.map((m) => {
        const { x, y, w, h } = m.boundingBox;
        const isHovered = hoveredBar === m.measureNumber;
        return (
          <g key={m.id} style={{ pointerEvents: "all" }}>
            <rect
              x={x} y={y} width={w} height={h}
              fill={isHovered ? "rgba(99,102,241,0.25)" : "rgba(99,102,241,0.10)"}
              stroke={isHovered ? "rgba(99,102,241,0.9)" : "rgba(99,102,241,0.5)"}
              strokeWidth="0.002"
              rx="0.002"
              style={{ cursor: "default", transition: "fill 0.1s" }}
              onMouseEnter={() => onHover(m.measureNumber)}
              onMouseLeave={() => onHover(null)}
            />
            {/* Bar number label — only show when zoomed enough */}
            <text
              x={x + 0.005}
              y={y + h - 0.008}
              fontSize="0.018"
              fill={isHovered ? "rgba(99,102,241,1)" : "rgba(99,102,241,0.7)"}
              fontFamily="monospace"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {m.measureNumber}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Single page viewer ───────────────────────────────────────────────────────

function PageViewer({
  page,
  zoom,
}: {
  page: ScorePage;
  zoom: number;
}) {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative inline-block shadow-xl rounded-sm overflow-hidden border border-border"
        style={{ width: `${zoom}%`, maxWidth: "100%" }}
      >
        <img
          ref={imgRef}
          src={page.imageUrl}
          alt={`Page ${page.pageNumber}`}
          className="block w-full h-auto"
          draggable={false}
        />
        <BarOverlay
          measures={page.measures}
          hoveredBar={hoveredBar}
          onHover={setHoveredBar}
        />
      </div>
      {hoveredBar !== null && (
        <div className="mt-2 text-xs text-muted-foreground font-mono">
          Bar {hoveredBar}
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function ScoreReviewModal({ sheetMusicId, totalMeasures, pieceTitle, onConfirm, onBack }: Props) {
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(90);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: pages = [], isLoading } = useQuery<ScorePage[]>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/pages`],
    staleTime: Infinity,
  });

  const totalPages = pages.length;
  const page = pages.find(p => p.pageNumber === currentPage);

  // Reset to page 1 when data loads
  useEffect(() => {
    if (pages.length > 0) setCurrentPage(1);
  }, [pages.length]);

  // Scroll to top when page changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentPage]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Review detected bars</p>
          <p className="font-serif text-lg font-semibold truncate">{pieceTitle}</p>
        </div>

        <div className="flex items-center gap-4">
          {/* Bar count */}
          <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{totalMeasures}</span> bars ·
            <span className="font-semibold text-foreground">{totalPages}</span> pages
          </div>

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
            <Button
              variant="ghost" size="icon" className="w-8 h-8"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm tabular-nums min-w-[4rem] text-center">
              {isLoading ? "—" : `p.${currentPage} / ${totalPages}`}
            </span>
            <Button
              variant="ghost" size="icon" className="w-8 h-8"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

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
                  p.pageNumber === currentPage
                    ? "border-primary shadow-md"
                    : "border-transparent hover:border-border",
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
            <PageViewer page={page} zoom={zoom} />
          ) : null}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-card shrink-0">
        <p className="text-xs text-muted-foreground">
          Hover over the coloured boxes to inspect bars. Wrong detections can be adjusted later.
        </p>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Button onClick={onConfirm} className="gap-2">
            <CheckCircle2 className="w-4 h-4" /> Looks good
          </Button>
        </div>
      </div>
    </div>
  );
}
