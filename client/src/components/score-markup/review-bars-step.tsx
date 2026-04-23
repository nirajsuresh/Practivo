/**
 * Review Detected Barlines — shares chrome with the Mark Sections view.
 *
 * Visual layout MUST stay in sync with SectionMarkStep (see
 * `client/src/components/learning-plan-wizard.tsx` → SectionMarkStep). Both
 * views compose `<ScoreMarkupShell>` + `<PageThumbRail>` + `<ScorePagesGrid>`
 * from `./shared`. The only intentional difference: this view has no right
 * panel (the ranking column only exists in Mark Sections).
 *
 * The actual barline editing (click-to-split, click-boundary-to-merge,
 * delete-system, draw-system region detection, undo) is implemented by
 * `PageOverlay` in `../score-review-modal.tsx`, reused here via the
 * `renderPageOverlay` slot of `ScorePagesGrid`.
 *
 * See CLAUDE.md → "Score markup views" for invariants.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ChevronLeft, Loader2, Pencil, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import {
  PageOverlay,
  EditToolbar,
  type EditMeasure,
  type SetMeasuresFn,
  type Tool,
  TOOLS,
} from "@/components/score-review-modal";
import {
  ScoreMarkupShell,
  PageThumbRail,
  ScorePagesGrid,
  SubtleHeaderButton,
  type ScorePage,
  type BoundingBox,
  type BarMeasure,
} from "./shared";

type ApiMeasure = {
  id: number;
  measureNumber: number;
  pageNumber: number | null;
  boundingBox: BoundingBox | null;
  movementNumber?: number | null;
  movementId?: number | null;
};

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function sortMeasures(measures: EditMeasure[]): EditMeasure[] {
  return [...measures].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (a.boundingBox.y !== b.boundingBox.y) return a.boundingBox.y - b.boundingBox.y;
    return a.boundingBox.x - b.boundingBox.x;
  });
}

export function ReviewBarsStep({
  sheetMusicId,
  pieceTitle,
  onConfirm,
  onBack,
}: {
  sheetMusicId: number;
  pieceTitle: string;
  onConfirm: (totalMeasures: number) => void;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { data: pages = [], isLoading: pagesLoading } = useQuery<ScorePage[]>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/pages`],
  });
  const { data: rawMeasures = [], isLoading: barsLoading } = useQuery<ApiMeasure[]>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/measures`],
  });

  const [localMeasures, setLocalMeasures] = useState<EditMeasure[]>([]);
  const [baselineMeasures, setBaselineMeasures] = useState<EditMeasure[]>([]);
  const [history, setHistory] = useState<EditMeasure[][]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>("barline-edit");

  useEffect(() => {
    if (rawMeasures.length === 0) {
      setLocalMeasures([]);
      setBaselineMeasures([]);
      setHistory([]);
      setIsDirty(false);
      return;
    }
    const hydrated: EditMeasure[] = rawMeasures
      .filter((m): m is ApiMeasure & { pageNumber: number; boundingBox: BoundingBox } =>
        m.pageNumber != null && m.boundingBox != null,
      )
      .map((m) => ({
        tempId: uid(),
        pageNumber: m.pageNumber,
        boundingBox: m.boundingBox,
        movementNumber: m.movementNumber ?? 1,
      }));
    const sorted = sortMeasures(hydrated);
    setLocalMeasures(sorted);
    setBaselineMeasures(sorted);
    setHistory([]);
    setIsDirty(false);
  }, [rawMeasures]);

  const pushHistory = useCallback((prev: EditMeasure[]) => {
    setHistory((h) => [...h.slice(-19), prev]);
  }, []);

  const handleSetMeasures = useCallback<SetMeasuresFn>(
    (next) => {
      setLocalMeasures((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        pushHistory(prev);
        return resolved;
      });
      setIsDirty(true);
    },
    [pushHistory],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setHistory((h) => {
          if (h.length === 0) return h;
          const prev = h[h.length - 1]!;
          setLocalMeasures(prev);
          return h.slice(0, -1);
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const sorted = sortMeasures(localMeasures);
      const payload = sorted.map((m) => ({
        pageNumber: m.pageNumber,
        boundingBox: m.boundingBox,
        movementNumber: m.movementNumber,
      }));
      const resp = await apiRequest(
        "PUT",
        `/api/sheet-music/${sheetMusicId}/measures/replace`,
        { measures: payload },
      );
      const data = (await resp.json()) as { saved: number };
      return data.saved;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: [`/api/sheet-music/${sheetMusicId}/measures`] });
      onConfirm(saved);
    },
  });

  const handleConfirm = () => {
    if (isDirty) saveMutation.mutate();
    else onConfirm(localMeasures.length);
  };

  const scrollToPage = (pageNum: number) => {
    pageRefs.current[pageNum]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Adapt EditMeasure → BarMeasure shape expected by the shared grid.
  const gridMeasures: BarMeasure[] = useMemo(
    () =>
      localMeasures.map((m, i) => ({
        id: i + 1,
        measureNumber: i + 1,
        pageNumber: m.pageNumber,
        boundingBox: m.boundingBox,
        imageUrl: null,
        movementId: m.movementNumber,
      })),
    [localMeasures],
  );

  const mvtCount = useMemo(
    () => new Set(localMeasures.map((m) => m.movementNumber)).size,
    [localMeasures],
  );

  const activeHint =
    activeTool === "barline-edit"
      ? "Hover in a system: green line adds a barline, red line deletes one. Click to apply."
      : TOOLS.find((t) => t.id === activeTool)?.hint ?? "";

  const banner = (
    <div className="mb-3 px-3 py-2 rounded bg-primary/5 border border-primary/20 text-xs text-foreground/80">
      {editMode ? (
        <>
          <span className="font-medium">Editing ·</span> {activeHint} <span className="ml-2 text-muted-foreground">⌘Z to undo.</span>
        </>
      ) : (
        <>
          <span className="font-medium">Review barlines ·</span> Toggle <span className="font-semibold">Edit</span> to correct detected bars. Add or remove systems, add or remove barlines.
        </>
      )}
    </div>
  );

  if (pagesLoading || barsLoading) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading measures…</p>
      </div>
    );
  }

  if (localMeasures.length === 0) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background text-center px-6">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="max-w-sm text-sm text-muted-foreground">
          No bars were detected. The PDF may be a scan or use non-standard notation.
          You can still create a plan and enter measures manually.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Button onClick={() => onConfirm(0)}>Continue anyway</Button>
        </div>
      </div>
    );
  }

  return (
    <ScoreMarkupShell
      onBack={onBack}
      title={<span className="inline-flex items-center gap-2">Review detected barlines</span>}
      titleChip={
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
          {localMeasures.length} bar{localMeasures.length !== 1 ? "s" : ""} · {pages.length} page{pages.length !== 1 ? "s" : ""}
          {mvtCount > 1 ? ` · ${mvtCount} movements` : ""} · {pieceTitle}
        </span>
      }
      headerActions={
        <>
          {editMode && (
            <SubtleHeaderButton
              onClick={() => {
                if (history.length === 0) return;
                setLocalMeasures(history[history.length - 1]!);
                setHistory((h) => h.slice(0, -1));
              }}
              title="Undo (⌘Z)"
            >
              <span className={cn("inline-flex items-center gap-1", history.length === 0 && "opacity-40")}>
                <Undo2 className="w-3.5 h-3.5" /> Undo
              </span>
            </SubtleHeaderButton>
          )}
          <Button
            variant={editMode ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setEditMode((e) => !e);
              setActiveTool("barline-edit");
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
            {editMode ? "Editing" : "Edit"}
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={saveMutation.isPending}
            className="gap-1.5"
          >
            {saveMutation.isPending ? (
              <span className="text-xs">Saving…</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" /> Looks good
              </>
            )}
          </Button>
        </>
      }
      leftRail={<PageThumbRail pages={pages} onSelect={scrollToPage} />}
    >
      <div className="flex-1 flex flex-col min-w-0">
        {editMode && <EditToolbar activeTool={activeTool} onTool={setActiveTool} />}
        <ScorePagesGrid
          pages={pages}
          measures={gridMeasures}
          sheetMusicId={sheetMusicId}
          pageRefs={pageRefs}
          scrollContainerRef={scrollRef}
          renderOverlay={() => null}
          renderPageOverlay={(pageNumber) => (
            <PageOverlay
              measures={localMeasures.filter((m) => m.pageNumber === pageNumber)}
              allMeasures={localMeasures}
              baselineMeasures={baselineMeasures}
              editMode={editMode}
              activeTool={activeTool}
              sheetMusicId={sheetMusicId}
              pageNumber={pageNumber}
              onSetMeasures={handleSetMeasures}
            />
          )}
          banner={banner}
        />
        {saveMutation.isError && (
          <div className="shrink-0 px-4 py-2 text-xs text-destructive bg-destructive/5 border-t">
            Save failed — please try again.
          </div>
        )}
      </div>
    </ScoreMarkupShell>
  );
}
