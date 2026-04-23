import { useEffect, useRef, useState, useCallback, MouseEvent as ReactMouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  MessageSquare,
  Music2,
  Plus,
  X,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSheetPageUrl, measuresUsePageGeometry } from "@/lib/sheet-page";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

type ScorePageImage = { pageNumber: number; imageUrl: string };

type MeasureRow = {
  id: number;
  measureNumber: number;
  pageNumber: number | null;
  boundingBox: { x: number; y: number; w: number; h: number } | null;
};

type BarAnnotation = {
  id: number;
  lessonDayId: number | null;
  learningPlanId: number;
  userId: string;
  measureStart: number;
  measureEnd: number;
  text: string;
  sessionNumber: number | null;
  sessionDate: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── AnnotationDrawer ──────────────────────────────────────────────────────────

function AnnotationDrawer({
  onClose,
  annotations,
  sheetMusicId,
  selectedAnnotationId,
  onSelectAnnotation,
  onAnnotationMutated,
}: {
  onClose: () => void;
  annotations: BarAnnotation[];
  sheetMusicId: number;
  selectedAnnotationId: number | null;
  onSelectAnnotation: (id: number | null) => void;
  onAnnotationMutated: () => void;
}) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingId != null && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editingId]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, text }: { id: number; text: string }) => {
      return apiRequest("PATCH", `/api/sheet-music/${sheetMusicId}/annotations/${id}`, { text });
    },
    onSuccess: () => {
      setEditingId(null);
      onAnnotationMutated();
    },
    onError: () => toast({ title: "Couldn't save", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/sheet-music/${sheetMusicId}/annotations/${id}`);
    },
    onSuccess: (_, id) => {
      if (selectedAnnotationId === id) onSelectAnnotation(null);
      onAnnotationMutated();
    },
    onError: () => toast({ title: "Couldn't delete", variant: "destructive" }),
  });

  const sorted = [...annotations].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="flex flex-col w-full h-full bg-white">
      {/* Drawer header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 font-medium text-sm">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          Notes ({annotations.length})
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Annotations list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground text-center mt-8">
            No notes yet. Select bars in the score and press the + button to add one.
          </p>
        )}
        {sorted.map((ann) => {
          const isSelected = selectedAnnotationId === ann.id;
          const isEditing = editingId === ann.id;
          return (
            <div
              key={ann.id}
              className={cn(
                "rounded-lg border p-3 cursor-pointer transition-all",
                isSelected
                  ? "border-[#C9A227] bg-[#C9A227]/8 shadow-sm"
                  : "border-border bg-white hover:border-[#C9A227]/50 hover:bg-[#C9A227]/5",
              )}
              onClick={() => {
                if (!isEditing) onSelectAnnotation(isSelected ? null : ann.id);
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">
                    {ann.measureStart === ann.measureEnd
                      ? `m.${ann.measureStart}`
                      : `mm.${ann.measureStart}–${ann.measureEnd}`}
                    {ann.sessionDate && (
                      <span className="ml-2 font-normal">
                        · Session {ann.sessionNumber} ({ann.sessionDate})
                      </span>
                    )}
                  </p>
                  {isEditing ? (
                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                      <textarea
                        ref={textareaRef}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                            e.preventDefault();
                            if (editText.trim()) updateMutation.mutate({ id: ann.id, text: editText });
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="w-full text-sm border border-border rounded p-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#C9A227]/60"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => { if (editText.trim()) updateMutation.mutate({ id: ann.id, text: editText }); }}
                          disabled={updateMutation.isPending || !editText.trim()}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground leading-relaxed">{ann.text}</p>
                  )}
                </div>
                {!isEditing && (
                  <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => { setEditingId(ann.id); setEditText(ann.text); }}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(ann.id)}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete"
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── AddAnnotationPopover ──────────────────────────────────────────────────────

function AddAnnotationPopover({
  open,
  onClose,
  onSave,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (text: string) => void;
  isSaving: boolean;
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setText("");
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-border w-80 p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-medium">Add note</p>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              if (text.trim()) onSave(text);
            }
            if (e.key === "Escape") onClose();
          }}
          placeholder="What to remember about these bars…"
          className="w-full text-sm border border-border rounded p-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
          rows={4}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => { if (text.trim()) onSave(text); }}
            disabled={isSaving || !text.trim()}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="ml-auto text-[10px] text-muted-foreground self-end">⌘↵ to save</span>
        </div>
      </div>
    </div>
  );
}

// ── ScorePageView ─────────────────────────────────────────────────────────────

function ScorePageView({
  pageNumbers,
  pageUrl,
  measures,
  annotations,
  selectedAnnotationId,
  onSelectAnnotation,
  onAddAnnotation,
}: {
  pageNumbers: number[];
  pageUrl: (n: number) => string;
  measures: MeasureRow[];
  annotations: BarAnnotation[];
  selectedAnnotationId: number | null;
  onSelectAnnotation: (id: number | null) => void;
  onAddAnnotation: (start: number, end: number) => void;
}) {
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const selectDragRef = useRef<{ startMeasure: number } | null>(null);
  const prevRangeRef = useRef<{ start: number; end: number } | null>(null);

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

  // Find the annotation highlighted bar range
  const highlightedAnnotation = selectedAnnotationId != null
    ? annotations.find((a) => a.id === selectedAnnotationId)
    : null;

  const isHighlighted = (n: number) =>
    highlightedAnnotation != null &&
    n >= highlightedAnnotation.measureStart &&
    n <= highlightedAnnotation.measureEnd;

  // Build a map: measureNumber → annotations that cover it
  const measureAnnotations = new Map<number, BarAnnotation[]>();
  for (const ann of annotations) {
    for (let n = ann.measureStart; n <= ann.measureEnd; n++) {
      const arr = measureAnnotations.get(n) ?? [];
      arr.push(ann);
      measureAnnotations.set(n, arr);
    }
  }

  return (
    <>
      {pageNumbers.map((pageNum) => {
        const barsOnPage = measures.filter((m) => m.pageNumber === pageNum && m.boundingBox != null);
        return (
          <div
            key={pageNum}
            id={`score-page-${pageNum}`}
            className="relative bg-white"
          >
            <img
              src={pageUrl(pageNum)}
              alt={`Page ${pageNum}`}
              className="w-full h-auto block pointer-events-none"
              loading="lazy"
            />
            <div className="absolute inset-0 z-10 pointer-events-none">
              {barsOnPage.map((bar) => {
                const box = bar.boundingBox!;
                const n = bar.measureNumber;
                const isSelected = isInSelection(n);
                const isSelectionEnd = isSelected && n === selectedRange!.end;
                const isHl = isHighlighted(n);
                const barAnns = measureAnnotations.get(n) ?? [];
                const hasAnnotation = barAnns.length > 0;

                return (
                  <button
                    key={bar.id}
                    type="button"
                    className={cn(
                          "absolute box-border rounded-sm border-2 transition-all pointer-events-auto select-none",
                          isSelected
                            ? "border-blue-400 bg-blue-400/15"
                            : isHl
                            ? "border-[#C9A227] bg-[#C9A227]/12 shadow-[0_0_0_1px_rgba(201,162,39,0.3)]"
                            : hasAnnotation
                            ? "border-[#C9A227]/45 bg-[#C9A227]/5 hover:border-[#C9A227]/70 hover:bg-[#C9A227]/10"
                            : "border-transparent bg-transparent hover:border-gray-400/30 hover:bg-gray-100/8",
                        )}
                        style={{
                          left: `${box.x * 100}%`,
                          top: `${box.y * 100}%`,
                          width: `${box.w * 100}%`,
                          height: `${box.h * 100}%`,
                        }}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          if (selectedAnnotationId != null) onSelectAnnotation(null);
                          prevRangeRef.current = selectedRange;
                          selectDragRef.current = { startMeasure: n };
                          setSelectedRange({ start: n, end: n });
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const prev = prevRangeRef.current;
                          // deselect if this bar was in the previous selection and no drag occurred
                          if (prev && n >= prev.start && n <= prev.end
                            && selectedRange?.start === n && selectedRange?.end === n) {
                            setSelectedRange(null);
                          }
                        }}
                        onMouseEnter={(e) => {
                          if (selectDragRef.current && e.buttons === 1) {
                            const a = selectDragRef.current.startMeasure;
                            setSelectedRange({ start: Math.min(a, n), end: Math.max(a, n) });
                          }
                        }}
                      >
                        {/* Bar number label — only when selected or annotation-highlighted */}
                        {(isSelected || isHl) && (
                          <div
                            className={cn(
                              "absolute bottom-0 right-0 px-1 py-0.5 text-[9px] font-bold leading-none rounded-tl-sm pointer-events-none text-white",
                              isSelected ? "bg-blue-500" : "bg-[#9A7820]",
                            )}
                          >
                            {n}
                          </div>
                        )}
                        {/* Annotation dot */}
                        {hasAnnotation && !isSelected && !isHl && (
                          <div className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-[#C9A227] pointer-events-none opacity-80" />
                        )}
                        {/* Add annotation button */}
                        {isSelectionEnd && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddAnnotation(selectedRange!.start, selectedRange!.end);
                            }}
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
          </div>
        );
      })}
    </>
  );
}

// ── ScorePage (main) ──────────────────────────────────────────────────────────

export default function ScorePage() {
  const { sheetMusicId: rawId } = useParams<{ sheetMusicId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sheetMusicId = Number(rawId);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | null>(null);
  const [addTarget, setAddTarget] = useState<{ start: number; end: number } | null>(null);

  // Page navigation
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentPagePair, setCurrentPagePair] = useState(0); // 0-indexed pair index

  const { data: pages = [], isLoading: pagesLoading } = useQuery<ScorePageImage[]>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/pages`],
    enabled: !Number.isNaN(sheetMusicId),
  });

  const { data: pdfData } = useQuery<{ pdfUrl: string }>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/pdf-url`],
    enabled: !Number.isNaN(sheetMusicId),
  });

  const { data: measures = [] } = useQuery<MeasureRow[]>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/measures`],
    queryFn: async () => {
      const res = await fetch(`/api/sheet-music/${sheetMusicId}/measures`, { headers: getAuthHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !Number.isNaN(sheetMusicId),
  });

  const { data: annotations = [] } = useQuery<BarAnnotation[]>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/annotations`],
    queryFn: async () => {
      const res = await fetch(`/api/sheet-music/${sheetMusicId}/annotations`, { headers: getAuthHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !Number.isNaN(sheetMusicId),
  });

  const createAnnotation = useMutation({
    mutationFn: async ({ measureStart, measureEnd, text }: { measureStart: number; measureEnd: number; text: string }) => {
      return apiRequest("POST", `/api/sheet-music/${sheetMusicId}/annotations`, { measureStart, measureEnd, text });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/sheet-music/${sheetMusicId}/annotations`] });
      setAddTarget(null);
      setDrawerOpen(true);
    },
    onError: () => toast({ title: "Couldn't save note", variant: "destructive" }),
  });

  const pageUrl = useSheetPageUrl(sheetMusicId);
  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const pageNumbers = sortedPages.map((p) => p.pageNumber);

  const hasMeasures = measures.length > 0 && measuresUsePageGeometry(measures);

  // Build page pairs (for md+ two-up layout)
  // On mobile: single pages. On md+: pairs.
  // For scroll-spy and keyboard nav we track "pair index"
  // A pair is [page n, page n+1] for n=1,3,5,...
  // On mobile it's just [page n].
  // We handle this by making pairs based on the md breakpoint via a state.
  const [isTwoUp, setIsTwoUp] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsTwoUp(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsTwoUp(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Build pairs
  const pairs: number[][] = [];
  if (isTwoUp) {
    for (let i = 0; i < pageNumbers.length; i += 2) {
      pairs.push(pageNumbers.slice(i, i + 2));
    }
  } else {
    for (const p of pageNumbers) {
      pairs.push([p]);
    }
  }

  const totalPairs = pairs.length;

  // IntersectionObserver for scroll-spy
  useEffect(() => {
    if (pairs.length === 0) return;
    const observers: IntersectionObserver[] = [];
    pairs.forEach((pair, pairIdx) => {
      const firstPage = pair[0];
      const el = document.getElementById(`score-page-${firstPage}`);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setCurrentPagePair(pairIdx); },
        { threshold: 0.3, root: scrollContainerRef.current },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs.length, isTwoUp, pagesLoading]);

  // Keyboard ← / → to navigate page pairs
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't intercept when typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const next = e.key === "ArrowRight"
          ? Math.min(currentPagePair + 1, totalPairs - 1)
          : Math.max(currentPagePair - 1, 0);
        const targetPage = pairs[next]?.[0];
        if (targetPage == null) return;
        const el = document.getElementById(`score-page-${targetPage}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        setCurrentPagePair(next);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentPagePair, totalPairs, pairs]);

  // When an annotation is selected from the drawer, scroll to that bar
  const handleSelectAnnotation = useCallback((id: number | null) => {
    setSelectedAnnotationId(id);
    if (id == null) return;
    const ann = annotations.find((a) => a.id === id);
    if (!ann) return;
    const barMeasure = measures.find((m) => m.measureNumber === ann.measureStart);
    if (!barMeasure?.pageNumber) return;
    const el = document.getElementById(`score-page-${barMeasure.pageNumber}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [annotations, measures]);

  const isLoading = pagesLoading;

  return (
    <div className="min-h-screen bg-[#F4F1EA] flex flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-[#F4F1EA]/95 backdrop-blur-sm border-b border-[#D6D1C7]">
        <button
          onClick={() => { if (window.history.length > 1) window.history.back(); else setLocation("/home"); }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-3">
          {/* Page pair navigation */}
          {totalPairs > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const prev = Math.max(currentPagePair - 1, 0);
                  const el = document.getElementById(`score-page-${pairs[prev][0]}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                  setCurrentPagePair(prev);
                }}
                disabled={currentPagePair === 0}
                className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {isTwoUp
                  ? `pp.${pairs[currentPagePair]?.join("–") ?? ""} / ${pageNumbers.length}`
                  : `p.${pairs[currentPagePair]?.[0] ?? ""} / ${pageNumbers.length}`}
              </span>
              <button
                onClick={() => {
                  const next = Math.min(currentPagePair + 1, totalPairs - 1);
                  const el = document.getElementById(`score-page-${pairs[next][0]}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                  setCurrentPagePair(next);
                }}
                disabled={currentPagePair === totalPairs - 1}
                className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground/70">
            <Music2 className="w-4 h-4" />
            Full score
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Notes button */}
          <button
            onClick={() => setDrawerOpen((o) => !o)}
            className={cn(
              "flex items-center gap-1.5 text-sm transition-colors",
              drawerOpen ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <MessageSquare className="w-4 h-4" />
            {annotations.length > 0 && (
              <span className="text-xs bg-[#C9A227]/15 text-[#8B6E10] px-1.5 py-0.5 rounded-full font-medium">
                {annotations.length}
              </span>
            )}
          </button>

          {pdfData?.pdfUrl && (
            <a
              href={pdfData.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              PDF <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Score + inline drawer */}
      <div className="flex-1 flex overflow-hidden">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-w-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading score…</span>
          </div>
        ) : pageNumbers.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            No pages found for this sheet music.
          </div>
        ) : (
          <div className="py-4 px-2 md:px-6 space-y-6">
            {pairs.map((pair, pairIdx) => (
              <div
                key={pairIdx}
                className={cn(
                  "flex gap-4",
                  isTwoUp ? "flex-row" : "flex-col",
                )}
              >
                {pair.map((pageNum) => (
                  <div
                    key={pageNum}
                    className={cn(
                      "bg-white rounded-lg shadow-sm overflow-hidden",
                      isTwoUp ? "flex-1 min-w-0" : "w-full",
                    )}
                  >
                    {hasMeasures ? (
                      <ScorePageView
                        pageNumbers={[pageNum]}
                        pageUrl={pageUrl}
                        measures={measures}
                        annotations={annotations}
                        selectedAnnotationId={selectedAnnotationId}
                        onSelectAnnotation={handleSelectAnnotation}
                        onAddAnnotation={(start, end) => setAddTarget({ start, end })}
                      />
                    ) : (
                      <img
                        src={pageUrl(pageNum)}
                        alt={`Page ${pageNum}`}
                        className="w-full h-auto block"
                        loading="lazy"
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inline annotations panel — pushes score content */}
      <div
        className={cn(
          "shrink-0 overflow-hidden border-l border-border transition-[width] duration-300 ease-in-out",
          drawerOpen ? "w-80" : "w-0",
        )}
      >
        <div className="w-80 h-full">
          <AnnotationDrawer
            onClose={() => setDrawerOpen(false)}
            annotations={annotations}
            sheetMusicId={sheetMusicId}
            selectedAnnotationId={selectedAnnotationId}
            onSelectAnnotation={handleSelectAnnotation}
            onAnnotationMutated={() =>
              queryClient.invalidateQueries({ queryKey: [`/api/sheet-music/${sheetMusicId}/annotations`] })
            }
          />
        </div>
      </div>

      </div>{/* end score + drawer flex row */}

      {/* Add annotation popover */}
      <AddAnnotationPopover
        open={addTarget != null}
        onClose={() => setAddTarget(null)}
        onSave={(text) => {
          if (!addTarget) return;
          createAnnotation.mutate({ measureStart: addTarget.start, measureEnd: addTarget.end, text });
        }}
        isSaving={createAnnotation.isPending}
      />
    </div>
  );
}
