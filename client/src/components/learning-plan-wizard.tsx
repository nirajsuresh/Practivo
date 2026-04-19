import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Upload, Loader2, CheckCircle2, ChevronLeft, ChevronRight,
  CalendarDays, Clock, Music2, AlertCircle, Sparkles,
  RotateCcw, X, BookMarked,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScoreReviewModal } from "@/components/score-review-modal";
import {
  PHASE_TYPES, PHASE_LABELS, PHASE_BASE_EFFORT,
  LEVEL_MULTIPLIER, DIFFICULTY_MULTIPLIER,
  CHUNK_LEVEL_PHASES, computeChunkSizeShared,
  PLAYING_LEVELS, PLAYING_LEVEL_LABELS,
  type PhaseType, type PlayingLevel,
} from "@shared/schema";
import { useSheetPageUrl, measuresUsePageGeometry } from "@/lib/sheet-page";
import { SECTION_COLORS } from "@/lib/palette";

// ─── Types ──────────────────────────────────────────────────────────────────

type DraftSection = {
  localId: string;
  name: string;
  measureStart: number;
  measureEnd: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
};

type DraftPhase = {
  phaseType: PhaseType;
  enabled: boolean;
  repetitions: number;
  displayOrder: number;
};

// SectionMark — internal to SectionMarkStep; one per section-start bar
type SectionMark = {
  tempId: string;
  measureNumber: number;
  name: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
};

type MeasureRow = {
  id: number;
  measureNumber: number;
  pageNumber: number | null;
  boundingBox: { x: number; y: number; w: number; h: number } | null;
  imageUrl: string | null;
};

type ScorePage = {
  pageNumber: number;
  imageUrl: string;
};

// SECTION_COLORS imported from @/lib/palette

function computeAllocationLocal(
  sections: DraftSection[],
  enabledPhases: PhaseType[],
  playingLevel: PlayingLevel,
  totalDays: number,
): Record<string, DraftPhase[]> {
  if (sections.length === 0 || enabledPhases.length === 0) return {};

  const levelMult = LEVEL_MULTIPLIER[playingLevel] ?? 1.0;

  // Compute raw per-phase reps per section
  const rawMap: Record<string, { phaseType: PhaseType; raw: number; numChunks: number }[]> = {};

  for (const section of sections) {
    const diffMult = DIFFICULTY_MULTIPLIER[section.difficulty] ?? 1.0;
    const bars = section.measureEnd - section.measureStart + 1;
    const chSize = computeChunkSizeShared(bars, section.difficulty, playingLevel);
    const numChunks = Math.ceil(bars / chSize);

    rawMap[section.localId] = enabledPhases.map((pt) => {
      const raw = PHASE_BASE_EFFORT[pt] * levelMult * diffMult;
      return { phaseType: pt, raw: Math.max(1, Math.round(raw)), numChunks };
    });
  }

  // Estimate total calendar days for normalization using chunk-aware formula
  let estimatedDays = 0;
  let sectionStagger = 0;
  for (const section of sections) {
    const phases = rawMap[section.localId];
    const numChunks = phases[0]?.numChunks ?? 1;
    const chunkPhases = phases.filter((p) => CHUNK_LEVEL_PHASES.has(p.phaseType));
    const totalChunkReps = chunkPhases.reduce((s, p) => s + p.raw, 0);
    const orientReps = chunkPhases.find((p) => p.phaseType === "orient")?.raw ?? 1;
    const sectionChunkDays = totalChunkReps + (numChunks - 1) * orientReps;
    const linkReps = phases.find((p) => p.phaseType === "link")?.raw ?? 1;
    const linkDays = linkReps * Math.max(0, numChunks - 1);
    const sectionTotal = sectionChunkDays + linkDays;
    estimatedDays = Math.max(estimatedDays, sectionStagger + sectionTotal);
    const introReps = chunkPhases.slice(0, 2).reduce((s, p) => s + p.raw, 0);
    sectionStagger += introReps;
  }
  const interLinkDays = Math.max(0, sections.length - 1);
  const stabRaw = rawMap[sections[0].localId]?.find((p) => p.phaseType === "stabilize")?.raw ?? 2;
  const shapeRaw = rawMap[sections[0].localId]?.find((p) => p.phaseType === "shape")?.raw ?? 2;
  estimatedDays += interLinkDays + stabRaw + shapeRaw;

  const scale = estimatedDays > 0 ? totalDays / estimatedDays : 1;
  const result: Record<string, DraftPhase[]> = {};

  for (const section of sections) {
    result[section.localId] = rawMap[section.localId].map((rp, i) => ({
      phaseType: rp.phaseType,
      enabled: true,
      repetitions: Math.max(1, Math.round(rp.raw * scale)),
      displayOrder: i,
    }));
  }

  return result;
}

function defaultPhasesForSection(difficulty: DraftSection["difficulty"]): DraftPhase[] {
  return PHASE_TYPES.map((pt, i) => ({
    phaseType: pt,
    enabled: true,
    repetitions: Math.max(1, Math.round(PHASE_BASE_EFFORT[pt] * (DIFFICULTY_MULTIPLIER[difficulty] ?? 1.0))),
    displayOrder: i,
  }));
}

interface Measure {
  id: number;
  measureNumber: number;
  pageNumber: number;
  boundingBox: { x: number; y: number; w: number; h: number };
  imageUrl: string | null;
}

interface SheetMusicStatus {
  id: number;
  processingStatus: "pending" | "processing" | "ready" | "failed";
  pageCount: number | null;
  processingPage: number | null;
  processingTotal: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The repertoire entry this plan is attached to */
  repertoireEntryId: number;
  /** Links uploaded PDF to the piece in the library */
  pieceId?: number | null;
  /** null = whole piece; number = specific movement */
  movementId?: number | null;
  pieceTitle: string;
  userId: string;
  /** Called with the new or updated plan id after lessons are generated. */
  onSuccess?: (planId: number) => void;
}

type Step = "setup" | "upload" | "pageRange" | "processing" | "review" | "sectionMark" | "phases" | "confirm";

const STEP_ORDER: Step[] = ["setup", "upload", "pageRange", "processing", "review", "sectionMark", "phases", "confirm"];

// ─── Step indicators ─────────────────────────────────────────────────────────

const STEP_LABELS: Record<Step, string> = {
  setup: "Practice setup",
  upload: "Sheet music",
  pageRange: "Page range",
  processing: "Detecting bars",
  review: "Review bars",
  sectionMark: "Mark sections",
  phases: "Choose phases",
  confirm: "Generate plan",
};

/** Map wizard step to progress dot index. */
function stepToProgressIndex(step: Step): number {
  switch (step) {
    case "setup": return 0;
    case "upload": return 1;
    case "pageRange":
    case "processing": return 2;
    case "review": return 3;
    case "sectionMark": return 4;
    case "phases": return 5;
    case "confirm": return 6;
    default: return 0;
  }
}

function StepDots({ current }: { current: Step }) {
  const keys = ["setup", "upload", "pages", "review", "sectionMark", "phases", "confirm"] as const;
  const currentIdx = stepToProgressIndex(current);
  return (
    <div className="flex items-center gap-2 mb-6">
      {keys.map((key, dotIdx) => {
        const done = dotIdx < currentIdx;
        const active = dotIdx === currentIdx;
        return (
          <div key={key} className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full transition-all",
              done && "bg-primary",
              active && "w-3 h-3 bg-primary",
              !done && !active && "bg-muted-foreground/30",
            )} />
            {dotIdx < keys.length - 1 && (
              <div className={cn("h-px w-4", dotIdx < currentIdx ? "bg-primary" : "bg-muted-foreground/20")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step: Setup ─────────────────────────────────────────────────────────────

function SetupStep({
  dailyMinutes, setDailyMinutes,
  targetDate, setTargetDate,
  playingLevel,
  onNext,
}: {
  dailyMinutes: number; setDailyMinutes: (v: number) => void;
  targetDate: string; setTargetDate: (v: string) => void;
  playingLevel: PlayingLevel;
  onNext: () => void;
}) {
  const today = new Date();
  const minDate = new Date(today);
  minDate.setDate(minDate.getDate() + 7);
  const minDateStr = minDate.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Daily practice time
          </Label>
          <span className="text-sm font-bold text-primary">{dailyMinutes} min</span>
        </div>
        <Slider
          min={10}
          max={120}
          step={5}
          value={[dailyMinutes]}
          onValueChange={([v]) => setDailyMinutes(v)}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>10 min</span>
          <span>2 hours</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="target-date" className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          Target completion date
        </Label>
        <Input
          id="target-date"
          type="date"
          min={minDateStr}
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          We'll build a day-by-day lesson schedule to get you there.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <Music2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Playing level</span>
        </div>
        <span className="text-xs font-medium">{PLAYING_LEVEL_LABELS[playingLevel]}</span>
      </div>

      <Button onClick={onNext} className="w-full" disabled={!targetDate}>
        Next: Upload sheet music
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  );
}

// ─── Step: Upload ─────────────────────────────────────────────────────────────

interface CommunityScoreInfo {
  id: number;
  sheetMusicId: number;
  totalMeasures: number;
  description: string | null;
  submittedAt: string;
}

function UploadStep({
  pieceTitle, userId, pieceId,
  communityScore,
  onSheetMusicCreated, onUseCommunityScore, onBack,
}: {
  pieceTitle: string; userId: string;
  pieceId?: number | null;
  communityScore?: CommunityScoreInfo | null;
  onSheetMusicCreated: (id: number, pageCount: number | null) => void;
  onUseCommunityScore?: (score: CommunityScoreInfo) => void;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("pdf", file);
      form.append("userId", userId);
      if (pieceId != null && pieceId > 0) {
        form.append("pieceId", String(pieceId));
      }
      const res = await fetch("/api/sheet-music/upload", {
        method: "POST",
        body: form,
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = (await res.json()) as { sheetMusicId: number; pageCount?: number | null };
      return { id: data.sheetMusicId, pageCount: data.pageCount ?? null };
    },
    onSuccess: ({ id, pageCount }) => {
      onSheetMusicCreated(id, pageCount);
    },
    onError: () => {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    },
  });

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".pdf")) {
      toast({ title: "PDF only", description: "Please upload a PDF file.", variant: "destructive" });
      return;
    }
    setFileName(file.name);
    upload.mutate(file);
  }, [upload, toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="space-y-5">
      {/* Community score card — shown when a shared analysis already exists for this piece */}
      {communityScore && onUseCommunityScore && (
        <div className="rounded-xl border border-[#DCCAA6] bg-[#FAF8F3] p-4 flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-[#DCCAA6] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Community score available</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {communityScore.totalMeasures} bars detected
              {communityScore.description ? ` · "${communityScore.description}"` : ""}
            </p>
          </div>
          <Button size="sm" className="shrink-0" onClick={() => onUseCommunityScore(communityScore)}>
            Use this →
          </Button>
        </div>
      )}

      <div
        className={cn(
          "border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 transition-colors cursor-pointer",
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
          upload.isPending && "pointer-events-none opacity-60",
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {upload.isPending ? (
          <>
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm font-medium">Uploading {fileName}…</p>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">
                {communityScore ? "Upload my own instead" : "Drop your PDF here or click to browse"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{pieceTitle} sheet music</p>
            </div>
          </>
        )}
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5">
        <Music2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>We'll automatically detect every bar so you can track your progress measure by measure.</span>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>
    </div>
  );
}

// ─── Step: Choose PDF page range ─────────────────────────────────────────────

function PageRangeStep({
  sheetMusicId,
  initialPageCount,
  onStarted,
  onBack,
}: {
  sheetMusicId: number;
  initialPageCount: number | null;
  onStarted: () => void;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const { data: meta, isLoading: metaLoading, isError: metaError } = useQuery<{ pageCount: number }>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/pdf-meta`],
    enabled: initialPageCount == null || initialPageCount < 1,
    retry: 1,
  });

  const pdfPageCount =
    initialPageCount != null && initialPageCount > 0 ? initialPageCount : (meta?.pageCount ?? 0);

  const [fromPage, setFromPage] = useState(1);
  const [toPage, setToPage] = useState(1);

  useEffect(() => {
    if (pdfPageCount > 0) {
      setFromPage(1);
      setToPage(pdfPageCount);
    }
  }, [pdfPageCount]);

  const startProcess = useMutation({
    mutationFn: async ({ firstPage, lastPage }: { firstPage: number; lastPage: number }) => {
      await apiRequest("POST", `/api/sheet-music/${sheetMusicId}/process`, {
        firstPage,
        lastPage,
      });
    },
    onSuccess: () => onStarted(),
    onError: () => {
      toast({ title: "Couldn't start analysis", description: "Try again.", variant: "destructive" });
    },
  });

  const invalidRange =
    pdfPageCount > 0 &&
    (fromPage < 1 || toPage < 1 || fromPage > pdfPageCount || toPage > pdfPageCount);
  const loading = (initialPageCount == null || initialPageCount < 1) && metaLoading;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Your PDF may include a title page, preface, or other scores. Choose which pages contain <span className="text-foreground font-medium">this piece</span> only.
      </p>

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {!loading && metaError && pdfPageCount <= 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-muted-foreground">
          Could not read the PDF. Try re-uploading or a different file.
        </div>
      )}

      {!loading && pdfPageCount > 0 && (
        <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            This file has {pdfPageCount} page{pdfPageCount === 1 ? "" : "s"}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="page-from">First page</Label>
              <Input
                id="page-from"
                type="number"
                min={1}
                max={pdfPageCount}
                value={fromPage}
                onChange={(e) => setFromPage(Math.max(1, Math.min(pdfPageCount, parseInt(e.target.value, 10) || 1)))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="page-to">Last page</Label>
              <Input
                id="page-to"
                type="number"
                min={1}
                max={pdfPageCount}
                value={toPage}
                onChange={(e) => setToPage(Math.max(1, Math.min(pdfPageCount, parseInt(e.target.value, 10) || 1)))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            We'll only detect bars on pages {Math.min(fromPage, toPage)}–{Math.max(fromPage, toPage)} ({Math.abs(toPage - fromPage) + 1} page{Math.abs(toPage - fromPage) === 0 ? "" : "s"}).
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1" disabled={startProcess.isPending}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <Button
          className="flex-1"
          disabled={loading || pdfPageCount <= 0 || invalidRange || startProcess.isPending}
          onClick={() => {
            const lo = Math.min(fromPage, toPage);
            const hi = Math.max(fromPage, toPage);
            setFromPage(lo);
            setToPage(hi);
            startProcess.mutate({ firstPage: lo, lastPage: hi });
          }}
        >
          {startProcess.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Analyse selected pages
              <ChevronRight className="w-4 h-4 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Step: Processing ─────────────────────────────────────────────────────────

function ProcessingStep({ sheetMusicId, onDone }: { sheetMusicId: number; onDone: () => void }) {
  const doneCalledRef = useRef(false);
  const { data } = useQuery<SheetMusicStatus>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/status`],
    refetchInterval: (query) => {
      const s = query.state.data?.processingStatus;
      if (s === "ready" || s === "failed") return false;
      return 1500;
    },
    staleTime: 0,
  });

  useEffect(() => {
    if (data?.processingStatus === "ready" && !doneCalledRef.current) {
      doneCalledRef.current = true;
      setTimeout(onDone, 300);
    }
  }, [data?.processingStatus, onDone]);

  const page = data?.processingPage ?? 0;
  const total = data?.processingTotal ?? 0;
  const failed = data?.processingStatus === "failed";
  const pct = total > 0 ? Math.round((page / total) * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
        {failed
          ? <AlertCircle className="w-8 h-8 text-destructive" />
          : <Loader2 className="w-8 h-8 text-primary animate-spin" />
        }
      </div>

      <div className="text-center space-y-1 w-full">
        {failed ? (
          <>
            <p className="font-semibold text-destructive">Processing failed</p>
            <p className="text-sm text-muted-foreground">The PDF could not be analysed. Try a different file.</p>
          </>
        ) : total > 0 ? (
          <>
            <p className="font-semibold">
              Processing page {page} of {total}
            </p>
            <p className="text-sm text-muted-foreground">Detecting barlines…</p>
            <div className="mt-3 w-full bg-muted rounded-full overflow-hidden h-2">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">{pct}%</p>
          </>
        ) : (
          <>
            <p className="font-semibold">Analysing score…</p>
            <p className="text-sm text-muted-foreground">Rendering pages with pdftoppm</p>
            <div className="w-full space-y-2 mt-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-2 w-full" style={{ opacity: 1 - i * 0.3 }} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Step: Review — opens the full-screen ScoreReviewModal ───────────────────

function ReviewStep({
  sheetMusicId, pieceTitle, onConfirm, onBack,
}: {
  sheetMusicId: number; pieceTitle: string;
  onConfirm: (totalMeasures: number) => void; onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: measures = [], isLoading } = useQuery<Measure[]>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/measures`],
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading measures…</p>
      </div>
    );
  }

  if (measures.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-sm text-muted-foreground">
          No bars were detected. The PDF may be a scan or use non-standard notation.
          You can still create a plan and enter measures manually.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4 mr-1" />Back</Button>
          <Button onClick={() => onConfirm(0)}>Continue anyway</Button>
        </div>
      </div>
    );
  }

  // Full-screen review — the Dialog is dismissed and the modal takes over
  return (
    <ScoreReviewModal
      sheetMusicId={sheetMusicId}
      totalMeasures={measures.length}
      pieceTitle={pieceTitle}
      onConfirm={(savedCount) => {
        // Bust the cache so SectionMarkStep fetches the user's edited bars, not the originals
        queryClient.invalidateQueries({ queryKey: [`/api/sheet-music/${sheetMusicId}/measures`] });
        onConfirm(savedCount ?? measures.length);
      }}
      onBack={onBack}
    />
  );
}

// ─── Step: Section Marking ────────────────────────────────────────────────────

function SectionMarkStep({
  sheetMusicId,
  totalMeasures,
  onNext,
  onSkip,
  onBack,
}: {
  sheetMusicId: number;
  totalMeasures: number;
  onNext: (marks: SectionMark[]) => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const [sectionMarks, setSectionMarks] = useState<SectionMark[]>([]);
  const [editingTempId, setEditingTempId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const getPageUrl = useSheetPageUrl(sheetMusicId);

  const { data: pages = [] } = useQuery<ScorePage[]>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/pages`],
  });

  const { data: measures = [] } = useQuery<MeasureRow[]>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/measures`],
  });

  const totalPages = pages.length || 1;
  const usePageGeometry = measuresUsePageGeometry(measures as Parameters<typeof measuresUsePageGeometry>[0]);

  // Bars on current page with bounding boxes
  const barsOnPage = measures
    .filter((m) => m.pageNumber === currentPage && m.boundingBox != null)
    .sort((a, b) => a.measureNumber - b.measureNumber);

  // Return sorted marks
  const getSortedMarks = () => [...sectionMarks].sort((a, b) => a.measureNumber - b.measureNumber);

  // Index of a section mark in the sorted list
  const getSectionIdx = (measureNumber: number) => {
    const sorted = getSortedMarks();
    return sorted.findIndex((m) => m.measureNumber === measureNumber);
  };

  // Which section does this bar belong to? Returns the section color or null if no marks yet.
  const getSectionColorForBar = (measureNumber: number): { bg: string; border: string } | null => {
    const sorted = getSortedMarks();
    let idx = -1;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].measureNumber <= measureNumber) { idx = i; break; }
    }
    if (idx === -1) return null;
    return SECTION_COLORS[idx % SECTION_COLORS.length];
  };

  const sectionLetter = (index: number) =>
    `Section ${String.fromCharCode(65 + (index % 26))}`;

  const handleBarClick = (measureNumber: number) => {
    setValidationError(false);
    const existing = sectionMarks.find((m) => m.measureNumber === measureNumber);
    if (existing) {
      setSectionMarks((prev) => {
        const filtered = prev.filter((m) => m.measureNumber !== measureNumber);
        const sorted = [...filtered].sort((a, b) => a.measureNumber - b.measureNumber);
        return sorted.map((m, i) => ({
          ...m,
          name: m.name.match(/^Section [A-Z]$/) ? sectionLetter(i) : m.name,
        }));
      });
      if (editingTempId === existing.tempId) setEditingTempId(null);
    } else {
      setSectionMarks((prev) => {
        const withNew: SectionMark = { tempId: crypto.randomUUID(), measureNumber, name: "", difficulty: 3 };
        const all = [...prev, withNew].sort((a, b) => a.measureNumber - b.measureNumber);
        return all.map((m, i) => ({
          ...m,
          name: m.name === "" || m.name.match(/^Section [A-Z]$/) ? sectionLetter(i) : m.name,
        }));
      });
    }
  };

  const updateMarkName = (tempId: string, name: string) =>
    setSectionMarks((prev) => prev.map((m) => (m.tempId === tempId ? { ...m, name } : m)));

  const updateMarkDifficulty = (tempId: string, difficulty: 1 | 2 | 3 | 4 | 5) =>
    setSectionMarks((prev) => prev.map((m) => (m.tempId === tempId ? { ...m, difficulty } : m)));

  const removeMark = (tempId: string) => {
    setSectionMarks((prev) => prev.filter((m) => m.tempId !== tempId));
    if (editingTempId === tempId) setEditingTempId(null);
  };

  const handleNext = () => {
    if (sectionMarks.length > 0) {
      const firstMark = Math.min(...sectionMarks.map((m) => m.measureNumber));
      if (firstMark > 1) { setValidationError(true); return; }
    }
    onNext(sectionMarks);
  };

  // Render a label chip for a given section mark
  const renderChip = (mark: SectionMark, posStyle: React.CSSProperties) => {
    const sortedIdx = getSectionIdx(mark.measureNumber);
    const color = SECTION_COLORS[sortedIdx % SECTION_COLORS.length];
    return (
      <div
        key={mark.tempId}
        style={{ ...posStyle, borderColor: color.border, zIndex: 30 }}
        className="absolute pointer-events-auto flex items-center gap-1 rounded border bg-white/95 shadow-sm px-1.5 py-0.5 text-xs font-medium whitespace-nowrap"
      >
        {editingTempId === mark.tempId ? (
          <input
            autoFocus
            className="w-28 outline-none text-xs bg-transparent"
            value={mark.name}
            onChange={(e) => updateMarkName(mark.tempId, e.target.value)}
            onBlur={() => setEditingTempId(null)}
            onKeyDown={(e) => { if (e.key === "Enter") setEditingTempId(null); }}
            placeholder="Section name…"
          />
        ) : (
          <span onClick={() => setEditingTempId(mark.tempId)} className="cursor-text min-w-[4rem]">
            {mark.name || <span className="text-muted-foreground italic">Unnamed</span>}
          </span>
        )}
        <div className="flex items-center gap-0.5 ml-1 shrink-0 border-l border-border/40 pl-1">
          <button type="button"
            onClick={() => updateMarkDifficulty(mark.tempId, Math.max(1, mark.difficulty - 1) as 1 | 2 | 3 | 4 | 5)}
            className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground text-xs leading-none"
          >−</button>
          <span className="w-3 text-center tabular-nums text-xs font-semibold">{mark.difficulty}</span>
          <button type="button"
            onClick={() => updateMarkDifficulty(mark.tempId, Math.min(5, mark.difficulty + 1) as 1 | 2 | 3 | 4 | 5)}
            className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground text-xs leading-none"
          >+</button>
        </div>
        <button type="button" onClick={() => removeMark(mark.tempId)} className="text-muted-foreground hover:text-destructive ml-0.5">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Mark sections</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
              {totalMeasures} bars
            </span>
            {sectionMarks.length > 0 && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                {sectionMarks.length} section{sectionMarks.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="w-7 h-7 rounded border flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-muted-foreground min-w-[4.5rem] text-center">
              Page {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="w-7 h-7 rounded border flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Score area */}
      <div className="flex-1 overflow-y-auto bg-neutral-100">
        {usePageGeometry ? (
          /* Full-page view */
          <div className="relative mx-auto max-w-3xl bg-white shadow-sm my-4">
            {pages.length > 0 ? (
              <div className="relative w-full">
                <img
                  src={getPageUrl(currentPage)}
                  alt={`Page ${currentPage}`}
                  className="w-full h-auto block"
                />
                {/* Clickable bar overlays */}
                {barsOnPage.map((bar) => {
                  const box = bar.boundingBox!;
                  const color = getSectionColorForBar(bar.measureNumber);
                  return (
                    <button
                      key={bar.id}
                      type="button"
                      onClick={() => handleBarClick(bar.measureNumber)}
                      style={{
                        left: `${box.x * 100}%`,
                        top: `${box.y * 100}%`,
                        width: `${box.w * 100}%`,
                        height: `${box.h * 100}%`,
                        position: "absolute",
                        boxSizing: "border-box",
                      }}
                      className="cursor-pointer transition-colors group"
                      title={
                        sectionMarks.find((m) => m.measureNumber === bar.measureNumber)
                          ? `${sectionMarks.find((m) => m.measureNumber === bar.measureNumber)!.name || "Unnamed"} — click to unmark`
                          : `Bar ${bar.measureNumber} — click to mark section start`
                      }
                    >
                      {color ? (
                        <div
                          style={{ background: color.bg, borderLeft: `3px solid ${color.border}` }}
                          className="absolute inset-0 pointer-events-none"
                        />
                      ) : (
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none border-l-2 border-amber-400 bg-amber-100/30 transition-opacity" />
                      )}
                    </button>
                  );
                })}
                {/* Section label chips */}
                {sectionMarks
                  .filter((mark) => barsOnPage.some((b) => b.measureNumber === mark.measureNumber))
                  .map((mark) => {
                    const bar = barsOnPage.find((b) => b.measureNumber === mark.measureNumber)!;
                    const box = bar.boundingBox!;
                    return renderChip(mark, { left: `${box.x * 100}%`, top: `${box.y * 100}%` });
                  })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        ) : (
          /* Bar-strip view (no page geometry) */
          <div className="mx-auto max-w-3xl py-4 px-3 space-y-1.5">
            {measures
              .sort((a, b) => a.measureNumber - b.measureNumber)
              .map((bar) => {
                const mark = sectionMarks.find((m) => m.measureNumber === bar.measureNumber);
                const color = getSectionColorForBar(bar.measureNumber);
                const sortedIdx = mark ? getSectionIdx(bar.measureNumber) : -1;
                const markColor = sortedIdx >= 0 ? SECTION_COLORS[sortedIdx % SECTION_COLORS.length] : null;
                return (
                  <div key={bar.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleBarClick(bar.measureNumber)}
                      style={color ? { borderLeftColor: color.border, background: color.bg } : undefined}
                      className={cn(
                        "relative flex-1 rounded border transition-colors overflow-hidden",
                        color ? "border-l-4" : "hover:bg-amber-50 hover:border-amber-300",
                      )}
                    >
                      {bar.imageUrl && (
                        <img src={bar.imageUrl} alt={`m.${bar.measureNumber}`} className="w-full h-12 object-cover object-left" />
                      )}
                      <span className="absolute top-0.5 left-1 text-[10px] text-muted-foreground/60 tabular-nums">
                        {bar.measureNumber}
                      </span>
                    </button>
                    {mark && markColor && (
                      <div
                        style={{ borderColor: markColor.border }}
                        className="flex items-center gap-1 rounded border bg-white px-1.5 py-0.5 text-xs font-medium shrink-0"
                      >
                        {editingTempId === mark.tempId ? (
                          <input
                            autoFocus
                            className="w-24 outline-none text-xs bg-transparent"
                            value={mark.name}
                            onChange={(e) => updateMarkName(mark.tempId, e.target.value)}
                            onBlur={() => setEditingTempId(null)}
                            onKeyDown={(e) => { if (e.key === "Enter") setEditingTempId(null); }}
                            placeholder="Name…"
                          />
                        ) : (
                          <span onClick={() => setEditingTempId(mark.tempId)} className="cursor-text min-w-[3rem]">
                            {mark.name || <span className="italic text-muted-foreground">Unnamed</span>}
                          </span>
                        )}
                        <div className="flex items-center gap-0.5 ml-1 border-l border-border/40 pl-1">
                          <button type="button" onClick={() => updateMarkDifficulty(mark.tempId, Math.max(1, mark.difficulty - 1) as 1|2|3|4|5)}
                            className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground text-xs">−</button>
                          <span className="w-3 text-center text-xs font-semibold tabular-nums">{mark.difficulty}</span>
                          <button type="button" onClick={() => updateMarkDifficulty(mark.tempId, Math.min(5, mark.difficulty + 1) as 1|2|3|4|5)}
                            className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground text-xs">+</button>
                        </div>
                        <button type="button" onClick={() => removeMark(mark.tempId)} className="text-muted-foreground hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t bg-background/95 backdrop-blur-sm px-4 py-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          Click the first bar of a section to mark it. Click again to unmark. Bar 1 must be your first mark.
        </p>
        {validationError && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Section 1 must start at bar 1 — click bar 1 first.
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={onSkip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip →
          </button>
          <Button onClick={handleNext} className="flex-1">
            Next: Choose phases <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Schedule timeline preview ───────────────────────────────────────────────

type TimelineDay = {
  dayIndex: number;
  blocks: { sectionIdx: number; sectionName: string; phaseLabel: string; fraction: number }[];
};

function buildTimelinePreview(
  sections: DraftSection[],
  sectionPhases: Record<string, DraftPhase[]>,
  getPhasesFor: (localId: string, difficulty: DraftSection["difficulty"]) => DraftPhase[],
  playingLevel: PlayingLevel,
): TimelineDay[] {
  if (sections.length === 0) return [];

  // Build chunk-level work items mirroring the server algorithm
  type ChunkSim = {
    sectionIdx: number;
    name: string;
    phaseQueue: { label: string; phaseType: PhaseType; reps: number }[];
    phaseIndex: number;
    sessionsInPhase: number;
    staggerOffset: number;
    finished: boolean;
  };
  type IntraLinkSim = {
    sectionIdx: number;
    name: string;
    mergeCount: number;
    currentStep: number;
    sessionsInStep: number;
    repsPerStep: number;
    active: boolean;
    finished: boolean;
  };

  const chunkSims: ChunkSim[] = [];
  const intraLinkSims: IntraLinkSim[] = [];
  let globalOffset = 0;

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const phases = getPhasesFor(sec.localId, sec.difficulty).filter((p) => p.enabled);
    const chunkPhases = phases.filter((p) => CHUNK_LEVEL_PHASES.has(p.phaseType));
    const phaseQueue = chunkPhases.map((p) => ({
      label: PHASE_LABELS[p.phaseType].label, phaseType: p.phaseType, reps: p.repetitions,
    }));

    const bars = sec.measureEnd - sec.measureStart + 1;
    const chSize = computeChunkSizeShared(bars, sec.difficulty, playingLevel);
    const numChunks = Math.ceil(bars / chSize);
    const linkPhase = phases.find((p) => p.phaseType === "link");
    const linkReps = linkPhase?.repetitions ?? 1;

    let chunkOffset = globalOffset;
    for (let c = 0; c < numChunks; c++) {
      chunkSims.push({
        sectionIdx: i,
        name: sec.name || `Section ${i + 1}`,
        phaseQueue: phaseQueue.map((p) => ({ ...p })),
        phaseIndex: 0,
        sessionsInPhase: 0,
        staggerOffset: chunkOffset,
        finished: phaseQueue.length === 0,
      });
      chunkOffset += phaseQueue[0]?.reps ?? 1;
    }

    intraLinkSims.push({
      sectionIdx: i,
      name: sec.name || `Section ${i + 1}`,
      mergeCount: Math.max(0, numChunks - 1),
      currentStep: 0,
      sessionsInStep: 0,
      repsPerStep: linkReps,
      active: false,
      finished: numChunks <= 1,
    });

    globalOffset += phaseQueue.slice(0, 2).reduce((s, p) => s + p.reps, 0);
  }

  const sectionChunksDone = new Set<number>();
  const days: TimelineDay[] = [];
  let dayIdx = 0;
  const maxDays = 300;

  // Chunk-level + intra-link simulation
  while (dayIdx < maxDays) {
    const anyChunkWork = chunkSims.some((s) => !s.finished);
    const anyLinkWork = intraLinkSims.some((s) => !s.finished);
    if (!anyChunkWork && !anyLinkWork) break;

    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      if (!sectionChunksDone.has(sIdx)) {
        const sc = chunkSims.filter((cs) => cs.sectionIdx === sIdx);
        if (sc.length > 0 && sc.every((cs) => cs.finished)) {
          sectionChunksDone.add(sIdx);
          intraLinkSims[sIdx].active = true;
        }
      }
    }

    const activeChunks = chunkSims.filter((s) => !s.finished && dayIdx >= s.staggerOffset);
    const activeLinks = intraLinkSims.filter((s) => s.active && !s.finished);
    if (activeChunks.length === 0 && activeLinks.length === 0) { dayIdx++; continue; }

    const blocks: TimelineDay["blocks"] = [];

    const allWeights: { sectionIdx: number; weight: number }[] = [];
    for (const cs of activeChunks) {
      const pt = cs.phaseQueue[cs.phaseIndex]?.phaseType ?? "decode";
      allWeights.push({ sectionIdx: cs.sectionIdx, weight: PHASE_BASE_EFFORT[pt] ?? 1 });
    }
    for (const ls of activeLinks) {
      allWeights.push({ sectionIdx: ls.sectionIdx, weight: PHASE_BASE_EFFORT.link });
    }
    const totalWeight = allWeights.reduce((s, w) => s + w.weight, 0);

    // Group by section for display
    const sectionWeights = new Map<number, number>();
    for (const w of allWeights) {
      sectionWeights.set(w.sectionIdx, (sectionWeights.get(w.sectionIdx) ?? 0) + w.weight);
    }

    sectionWeights.forEach((weight, sIdx) => {
      const sec = sections[sIdx];
      const activeChunkForSection = activeChunks.find((cs) => cs.sectionIdx === sIdx);
      const activeLinkForSection = activeLinks.find((ls) => ls.sectionIdx === sIdx);
      let phaseLabel = "";
      if (activeLinkForSection) {
        phaseLabel = "Link";
      } else if (activeChunkForSection) {
        phaseLabel = activeChunkForSection.phaseQueue[activeChunkForSection.phaseIndex]?.label ?? "";
      }
      blocks.push({
        sectionIdx: sIdx,
        sectionName: sec.name || `Section ${sIdx + 1}`,
        phaseLabel,
        fraction: totalWeight > 0 ? weight / totalWeight : 1,
      });
    });

    // Advance chunk states
    for (const cs of activeChunks) {
      const phase = cs.phaseQueue[cs.phaseIndex];
      cs.sessionsInPhase++;
      if (cs.sessionsInPhase >= phase.reps) {
        cs.phaseIndex++;
        cs.sessionsInPhase = 0;
        if (cs.phaseIndex >= cs.phaseQueue.length) cs.finished = true;
      }
    }
    // Advance link states
    for (const ls of activeLinks) {
      ls.sessionsInStep++;
      if (ls.sessionsInStep >= ls.repsPerStep) {
        ls.currentStep++;
        ls.sessionsInStep = 0;
        if (ls.currentStep >= ls.mergeCount) ls.finished = true;
      }
    }

    days.push({ dayIndex: dayIdx, blocks });
    dayIdx++;
  }

  // Inter-section link + piece-level days
  if (sections.length > 1) {
    for (let i = 1; i < sections.length; i++) {
      days.push({
        dayIndex: dayIdx,
        blocks: [{ sectionIdx: -1, sectionName: "All", phaseLabel: "Link sections", fraction: 1 }],
      });
      dayIdx++;
    }
  }

  // Stabilize + shape
  const stabPhase = getPhasesFor(sections[0].localId, sections[0].difficulty).find((p) => p.phaseType === "stabilize");
  const shapePhase = getPhasesFor(sections[0].localId, sections[0].difficulty).find((p) => p.phaseType === "shape");
  for (let r = 0; r < (stabPhase?.repetitions ?? 2); r++) {
    days.push({ dayIndex: dayIdx, blocks: [{ sectionIdx: -1, sectionName: "Full piece", phaseLabel: "Stabilize", fraction: 1 }] });
    dayIdx++;
  }
  for (let r = 0; r < (shapePhase?.repetitions ?? 2); r++) {
    days.push({ dayIndex: dayIdx, blocks: [{ sectionIdx: -1, sectionName: "Full piece", phaseLabel: "Shape", fraction: 1 }] });
    dayIdx++;
  }

  return days;
}

function ScheduleTimeline({
  sections,
  sectionPhases,
  getPhasesFor,
  playingLevel,
}: {
  sections: DraftSection[];
  sectionPhases: Record<string, DraftPhase[]>;
  getPhasesFor: (localId: string, difficulty: DraftSection["difficulty"]) => DraftPhase[];
  playingLevel: PlayingLevel;
}) {
  const days = buildTimelinePreview(sections, sectionPhases, getPhasesFor, playingLevel);
  if (days.length === 0) return null;

  const maxVisible = 120;
  const visibleDays = days.slice(0, maxVisible);
  const truncated = days.length > maxVisible;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Schedule preview</p>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {days.length} day{days.length === 1 ? "" : "s"}{truncated ? "+" : ""}
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-muted/10 px-2 py-1.5">
        <div className="flex gap-[1px]" style={{ minWidth: `${visibleDays.length * 7}px` }}>
          {visibleDays.map((day) => (
            <div
              key={day.dayIndex}
              className="flex flex-col gap-[1px] shrink-0"
              style={{ width: 5, minHeight: 28 }}
              title={`Day ${day.dayIndex + 1}: ${day.blocks.map((b) => `${b.sectionName} (${b.phaseLabel})`).join(", ")}`}
            >
              {day.blocks.map((block, i) => {
                const isPieceLevel = block.sectionIdx < 0;
                const color = isPieceLevel
                  ? { border: "#8b8b8b" }
                  : SECTION_COLORS[block.sectionIdx % SECTION_COLORS.length];
                return (
                  <div
                    key={i}
                    className="rounded-sm"
                    style={{
                      backgroundColor: color.border,
                      flex: block.fraction,
                      minHeight: 3,
                      opacity: isPieceLevel ? 0.5 : 0.8,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {sections.map((sec, i) => {
          const color = SECTION_COLORS[i % SECTION_COLORS.length];
          return (
            <div key={sec.localId} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color.border }} />
              <span className="text-[10px] text-muted-foreground">{sec.name || `Section ${i + 1}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step: Phases (auto-allocation with global toggles) ──────────────────────

function PhasesStep({
  sections,
  sectionPhases,
  setSectionPhases,
  dailyMinutes,
  targetDate,
  playingLevel,
  onNext,
  onBack,
}: {
  sections: DraftSection[];
  sectionPhases: Record<string, DraftPhase[]>;
  setSectionPhases: (p: Record<string, DraftPhase[]>) => void;
  dailyMinutes: number;
  targetDate: string;
  playingLevel: PlayingLevel;
  onNext: () => void;
  onBack: () => void;
}) {
  const [globalEnabled, setGlobalEnabled] = useState<Set<PhaseType>>(
    () => new Set(PHASE_TYPES as readonly PhaseType[]),
  );
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [hasAutoAllocated, setHasAutoAllocated] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  const totalDays = Math.max(1, Math.ceil((target.getTime() - today.getTime()) / 86400000));

  // Auto-allocate whenever global toggles or sections change
  const runAutoAllocate = useCallback(() => {
    const enabled = Array.from(globalEnabled) as PhaseType[];
    if (sections.length === 0 || enabled.length === 0) return;
    const alloc = computeAllocationLocal(sections, enabled, playingLevel, totalDays);
    setSectionPhases(alloc);
    setHasAutoAllocated(true);
  }, [globalEnabled, sections, playingLevel, totalDays, setSectionPhases]);

  useEffect(() => {
    if (sections.length > 0 && !hasAutoAllocated) {
      runAutoAllocate();
    }
  }, [sections.length, hasAutoAllocated, runAutoAllocate]);

  const togglePhase = (pt: PhaseType) => {
    const next = new Set(globalEnabled);
    if (next.has(pt)) next.delete(pt);
    else next.add(pt);
    if (next.size === 0) return;
    setGlobalEnabled(next);

    // Re-run allocation with new set
    const enabled = Array.from(next) as PhaseType[];
    const alloc = computeAllocationLocal(sections, enabled, playingLevel, totalDays);
    setSectionPhases(alloc);
  };

  const getPhasesFor = (localId: string, difficulty: DraftSection["difficulty"]): DraftPhase[] =>
    sectionPhases[localId] ?? defaultPhasesForSection(difficulty);

  const updatePhaseReps = (localId: string, phaseType: PhaseType, delta: number) => {
    const phases = getPhasesFor(localId, sections.find((s) => s.localId === localId)?.difficulty ?? 3 as DraftSection["difficulty"]);
    const updated = phases.map((p) =>
      p.phaseType === phaseType ? { ...p, repetitions: Math.max(1, Math.min(10, p.repetitions + delta)) } : p,
    );
    setSectionPhases({ ...sectionPhases, [localId]: updated });
  };

  const timelineDays = buildTimelinePreview(sections, sectionPhases, getPhasesFor, playingLevel);
  const totalLessonDays = timelineDays.length;

  // No sections: skip straight through (handled by parent, but show a message)
  if (sections.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          No sections defined. The plan will distribute measures evenly across days.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Button onClick={onNext} className="flex-1">
            Next: Confirm <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Global phase toggles */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Learning phases</p>
        <div className="flex flex-wrap gap-1.5">
          {(PHASE_TYPES as readonly PhaseType[]).map((pt) => {
            const active = globalEnabled.has(pt);
            return (
              <button
                key={pt}
                onClick={() => togglePhase(pt)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 text-muted-foreground border-transparent hover:border-border",
                )}
              >
                {PHASE_LABELS[pt].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sections with allocation */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground">
            {sections.length} section{sections.length === 1 ? "" : "s"} &middot; {totalLessonDays} sessions
          </p>
          <button
            onClick={runAutoAllocate}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <RotateCcw className="w-3 h-3" /> Re-calculate
          </button>
        </div>
        <div className="rounded-lg border divide-y divide-border/50 overflow-hidden max-h-44 overflow-y-auto">
          {sections.map((sec, secIdx) => {
            const phases = getPhasesFor(sec.localId, sec.difficulty);
            const sectionTotal = phases.filter((p) => p.enabled).reduce((s, p) => s + p.repetitions, 0);
            const isExpanded = expandedSection === sec.localId;
            const color = SECTION_COLORS[secIdx % SECTION_COLORS.length];

            return (
              <div key={sec.localId}>
                <button
                  onClick={() => setExpandedSection(isExpanded ? null : sec.localId)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color.border }}
                  />
                  <span className="text-sm font-medium truncate flex-1">{sec.name || `Section ${secIdx + 1}`}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                    mm. {sec.measureStart}–{sec.measureEnd}
                  </span>
                  <span className="text-[11px] font-medium tabular-nums shrink-0 w-8 text-right">{sectionTotal}d</span>
                  <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground/50 transition-transform shrink-0", isExpanded && "rotate-90")} />
                </button>

                {isExpanded && (
                  <div className="px-3 pb-2 pt-1 space-y-1 bg-muted/10">
                    {phases.map((phase) => (
                      <div
                        key={phase.phaseType}
                        className={cn(
                          "flex items-center gap-2 py-0.5",
                          !phase.enabled && "opacity-30",
                        )}
                      >
                        <span className="text-xs text-muted-foreground flex-1">{PHASE_LABELS[phase.phaseType].label}</span>
                        {phase.enabled && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => updatePhaseReps(sec.localId, phase.phaseType, -1)}
                              className="w-5 h-5 rounded text-xs border flex items-center justify-center hover:bg-muted transition-colors"
                            >−</button>
                            <span className="text-xs font-mono w-5 text-center tabular-nums">{phase.repetitions}</span>
                            <button
                              onClick={() => updatePhaseReps(sec.localId, phase.phaseType, 1)}
                              className="w-5 h-5 rounded text-xs border flex items-center justify-center hover:bg-muted transition-colors"
                            >+</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Schedule timeline preview */}
      <ScheduleTimeline
        sections={sections}
        sectionPhases={sectionPhases}
        getPhasesFor={getPhasesFor}
        playingLevel={playingLevel}
      />

      <div className="flex gap-3 pt-1">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <Button onClick={onNext} className="flex-1">
          Next: Confirm <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step: Confirm ─────────────────────────────────────────────────────────────

function ConfirmStep({
  pieceTitle, dailyMinutes, targetDate, totalMeasures,
  sections, sectionPhases, playingLevel,
  onConfirm, isLoading, onBack,
}: {
  pieceTitle: string; dailyMinutes: number; targetDate: string;
  totalMeasures: number;
  sections: DraftSection[];
  sectionPhases: Record<string, DraftPhase[]>;
  playingLevel: PlayingLevel;
  onConfirm: () => void; isLoading: boolean; onBack: () => void;
}) {
  const target = new Date(targetDate);
  const today = new Date();
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  const measuresPerDay = totalMeasures > 0 ? Math.ceil(totalMeasures / days) : null;

  const getPhasesFor = (localId: string, difficulty: DraftSection["difficulty"]): DraftPhase[] =>
    sectionPhases[localId] ?? defaultPhasesForSection(difficulty);

  const totalLessonDays = sections.length > 0
    ? buildTimelinePreview(sections, sectionPhases, getPhasesFor, playingLevel).length
    : null;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-muted/20 divide-y divide-border overflow-hidden">
        {[
          { label: "Piece", value: pieceTitle },
          { label: "Daily practice", value: `${dailyMinutes} min` },
          { label: "Target date", value: new Date(targetDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) },
          ...(totalLessonDays != null
            ? [{ label: "Total lesson days", value: `${totalLessonDays} (${sections.length} section${sections.length === 1 ? "" : "s"})` }]
            : [{ label: "Days to learn", value: `${days} days` }]),
          ...(totalMeasures > 0 && totalLessonDays == null ? [
            { label: "Total measures", value: totalMeasures.toString() },
            { label: "Measures/day", value: measuresPerDay?.toString() ?? "—" },
          ] : []),
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between items-center px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{value}</span>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        <span>
          {sections.length > 0
            ? "Each section is split into small bar groups. You'll learn each group individually, then progressively link them into full sections and finally the complete piece."
            : "We'll create a lesson for each day, assigning measures in order so you always know exactly what to practice."}
        </span>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1" disabled={isLoading}>
          <ChevronLeft className="w-4 h-4 mr-1" />Back
        </Button>
        <Button onClick={onConfirm} className="flex-1" disabled={isLoading}>
          {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Generate plan
        </Button>
      </div>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function LearningPlanWizard({
  open, onOpenChange, repertoireEntryId, pieceId, movementId = null, pieceTitle, userId, onSuccess,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("setup");
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [sheetMusicId, setSheetMusicId] = useState<number | null>(null);
  /** Full PDF page count from upload / pdf-meta (unchanged after excerpt processing). */
  const [pdfSourcePageCount, setPdfSourcePageCount] = useState<number | null>(null);
  const [totalMeasures, setTotalMeasures] = useState(0);
  const [sections, setSections] = useState<DraftSection[]>([]);
  const [sectionPhases, setSectionPhases] = useState<Record<string, DraftPhase[]>>({});

  // Fetch user profile for playing level
  const { data: userProfile } = useQuery<{ playingLevel?: string | null }>({
    queryKey: [`/api/users/${userId}/profile`],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/profile`, { headers: getAuthHeaders() });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!userId,
    staleTime: 300_000,
  });
  const playingLevel: PlayingLevel =
    (userProfile?.playingLevel as PlayingLevel) &&
    PLAYING_LEVELS.includes(userProfile?.playingLevel as PlayingLevel)
      ? (userProfile!.playingLevel as PlayingLevel)
      : "intermediate";

  const communityScoreUrl = pieceId
    ? `/api/community-scores?pieceId=${pieceId}${movementId != null ? `&movementId=${movementId}` : ""}`
    : null;

  const { data: communityScore, refetch: refetchCommunityScore } = useQuery<CommunityScoreInfo | null>({
    queryKey: [communityScoreUrl],
    queryFn: async () => {
      if (!communityScoreUrl) return null;
      const res = await fetch(communityScoreUrl);
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json() as Promise<CommunityScoreInfo>;
    },
    enabled: !!communityScoreUrl,
    staleTime: 60_000,
  });

  // Re-fetch when the dialog opens (or when the piece/movement scope changes while open)
  // so the card always reflects the latest contribution without waiting for staleTime.
  useEffect(() => {
    if (open && communityScoreUrl) {
      refetchCommunityScore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, communityScoreUrl]);

  const confirmPlan = useMutation({
    mutationFn: async (): Promise<number> => {
      if (sheetMusicId) {
        await apiRequest("POST", `/api/sheet-music/${sheetMusicId}/confirm`, {});
      }

      const existingRes = await fetch(`/api/learning-plans/entry/${repertoireEntryId}`, {
        headers: getAuthHeaders(),
      });
      const existing = existingRes.ok ? ((await existingRes.json()) as { id: number } | null) : null;

      const payload: Record<string, unknown> = {
        repertoireEntryId,
        dailyPracticeMinutes: dailyMinutes,
        targetCompletionDate: targetDate,
        totalMeasures,
        status: "active",
      };
      if (sheetMusicId != null) {
        payload.sheetMusicId = sheetMusicId;
      }

      let planId: number;
      if (existing?.id) {
        await apiRequest("PATCH", `/api/learning-plans/${existing.id}`, payload);
        planId = existing.id;
      } else {
        const res = await apiRequest("POST", "/api/learning-plans", payload);
        const created = (await res.json()) as { id: number };
        planId = created.id;
      }

      // Persist sections and phases (if user defined any)
      if (sections.length > 0) {
        for (let i = 0; i < sections.length; i++) {
          const sec = sections[i];
          const secRes = await apiRequest("POST", `/api/learning-plans/${planId}/sections`, {
            name: sec.name,
            measureStart: sec.measureStart,
            measureEnd: sec.measureEnd,
            difficulty: sec.difficulty,
            displayOrder: i,
          });
          const createdSection = (await secRes.json()) as { id: number };
          const phases = sectionPhases[sec.localId] ?? defaultPhasesForSection(sec.difficulty);
          const enabledPhases = phases.filter((p) => p.enabled);
          if (enabledPhases.length > 0) {
            await apiRequest("PUT", `/api/sections/${createdSection.id}/phases`, {
              phases: enabledPhases.map((p) => ({
                phaseType: p.phaseType,
                displayOrder: p.displayOrder,
                repetitions: p.repetitions,
              })),
            });
          }
        }
      }

      await apiRequest("POST", `/api/learning-plans/${planId}/generate-lessons`, {});
      return planId;
    },
    onSuccess: (planId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/learning-plans`] });
      queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/entry/${repertoireEntryId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/lessons`] });
      toast({ title: "Plan created!", description: "Your daily lessons are ready." });
      onOpenChange(false);
      onSuccess?.(planId);
    },
    onError: () => {
      toast({ title: "Something went wrong", variant: "destructive" });
    },
  });

  const handleClose = () => {
    if (confirmPlan.isPending) return;
    onOpenChange(false);
    // Reset after close animation
    setTimeout(() => {
      setStep("setup");
      setSheetMusicId(null);
      setPdfSourcePageCount(null);
      setTotalMeasures(0);
      setSections([]);
      setSectionPhases({});
    }, 300);
  };

  const stepTitles: Record<Step, string> = {
    setup: "Start a learning plan",
    upload: "Upload sheet music",
    pageRange: "Which pages to analyse",
    processing: "Analysing score",
    review: "Review detected bars",
    sectionMark: "Mark sections",
    phases: "Choose phases",
    confirm: "Confirm plan",
  };

  // Full-screen steps — bypass the Dialog entirely
  if (step === "review" && sheetMusicId) {
    return (
      <ReviewStep
        sheetMusicId={sheetMusicId}
        pieceTitle={pieceTitle}
        onConfirm={(n) => { setTotalMeasures(n); setStep("sectionMark"); }}
        onBack={() => setStep("pageRange")}
      />
    );
  }

  if (step === "sectionMark" && sheetMusicId) {
    return (
      <SectionMarkStep
        sheetMusicId={sheetMusicId}
        totalMeasures={totalMeasures}
        onNext={(marks) => {
          if (marks.length > 0) {
            const sorted = [...marks].sort((a, b) => a.measureNumber - b.measureNumber);
            const drafts: DraftSection[] = sorted.map((m, i) => ({
              localId: crypto.randomUUID(),
              name: m.name || `Section ${String.fromCharCode(65 + (i % 26))}`,
              measureStart: m.measureNumber,
              measureEnd: i < sorted.length - 1 ? sorted[i + 1].measureNumber - 1 : totalMeasures,
              difficulty: m.difficulty,
            }));
            setSections(drafts);
          } else {
            setSections([]);
            setSectionPhases({});
          }
          setStep("phases");
        }}
        onSkip={() => { setSections([]); setSectionPhases({}); setStep("phases"); }}
        onBack={() => setStep("review")}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">{stepTitles[step]}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground truncate">{pieceTitle}</DialogDescription>
        </DialogHeader>

        <StepDots current={step} />

        {step === "setup" && (
          <SetupStep
            dailyMinutes={dailyMinutes} setDailyMinutes={setDailyMinutes}
            targetDate={targetDate} setTargetDate={setTargetDate}
            playingLevel={playingLevel}
            onNext={() => setStep("upload")}
          />
        )}

        {step === "upload" && (
          <UploadStep
            pieceTitle={pieceTitle} userId={userId} pieceId={pieceId}
            communityScore={communityScore ?? null}
            onSheetMusicCreated={(id, pageCount) => {
              setSheetMusicId(id);
              setPdfSourcePageCount(pageCount);
              setStep("pageRange");
            }}
            onUseCommunityScore={(score) => {
              apiRequest("POST", `/api/community-scores/${score.id}/use`).catch(() => {});
              setSheetMusicId(score.sheetMusicId);
              setTotalMeasures(score.totalMeasures);
              setStep("confirm");
            }}
            onBack={() => setStep("setup")}
          />
        )}

        {step === "pageRange" && sheetMusicId != null && (
          <PageRangeStep
            sheetMusicId={sheetMusicId}
            initialPageCount={pdfSourcePageCount}
            onStarted={() => setStep("processing")}
            onBack={() => setStep("upload")}
          />
        )}

        {step === "processing" && sheetMusicId && (
          <ProcessingStep sheetMusicId={sheetMusicId} onDone={() => setStep("review")} />
        )}

        {step === "phases" && (
          <PhasesStep
            sections={sections}
            sectionPhases={sectionPhases}
            setSectionPhases={setSectionPhases}
            dailyMinutes={dailyMinutes}
            targetDate={targetDate}
            playingLevel={playingLevel}
            onNext={() => setStep("confirm")}
            onBack={() => sheetMusicId ? setStep("sectionMark") : setStep("upload")}
          />
        )}

        {step === "confirm" && (
          <ConfirmStep
            pieceTitle={pieceTitle} dailyMinutes={dailyMinutes}
            targetDate={targetDate} totalMeasures={totalMeasures}
            sections={sections}
            sectionPhases={sectionPhases}
            playingLevel={playingLevel}
            onConfirm={() => confirmPlan.mutate()}
            isLoading={confirmPlan.isPending}
            onBack={() => setStep("phases")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
