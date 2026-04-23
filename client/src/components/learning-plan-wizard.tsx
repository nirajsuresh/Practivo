import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
import {
  DndContext, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ──────────────────────────────────────────────────────────────────

type DraftSection = {
  localId: string;
  name: string;
  measureStart: number;
  measureEnd: number;
  difficulty: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  ignored?: boolean;
};

type Zone = "hard" | "easy" | "ignore";
type Level = 1 | 2 | 3;
type ZoneLevel = { zone: Zone; level: Level };

type Tempo = "slow" | "medium" | "fast" | "aggressive";
const TEMPO_DAYS_PER_PAGE: Record<Tempo, number> = {
  slow: 14, medium: 7, fast: 4, aggressive: 2,
};
const TEMPO_LABELS: Record<Tempo, { title: string; blurb: string }> = {
  slow:       { title: "Slow",       blurb: "2 weeks per page" },
  medium:     { title: "Medium",     blurb: "1 week per page" },
  fast:       { title: "Fast",       blurb: "4 days per page" },
  aggressive: { title: "Aggressive", blurb: "2 days per page" },
};

const HARD_DIFFICULTY: Record<Level, 5 | 6 | 7> = { 1: 5, 2: 6, 3: 7 };
const EASY_DIFFICULTY: Record<Level, 1 | 2 | 3> = { 1: 3, 2: 2, 3: 1 };

function zoneLevelToDifficulty(zl: ZoneLevel): DraftSection["difficulty"] | null {
  if (zl.zone === "ignore") return null;
  return zl.zone === "hard" ? HARD_DIFFICULTY[zl.level] : EASY_DIFFICULTY[zl.level];
}

function colorForZoneLevel(zl: ZoneLevel): { bg: string; border: string } {
  if (zl.zone === "ignore") {
    return { bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.7)" };
  }
  const d = zoneLevelToDifficulty(zl) ?? 4;
  return difficultyToColor(d);
}

type DraftPhase = {
  phaseType: PhaseType;
  enabled: boolean;
  repetitions: number;
  displayOrder: number;
};

type LocalSection = {
  tempId: string;
  name: string;
  measureStart: number;
  measureEnd: number;
};

function difficultyToColor(d: number): { bg: string; border: string } {
  const t = Math.max(0, Math.min(1, (d - 1) / 6));
  let r: number, g: number, b: number, bgA: number, bA: number;
  if (t <= 0.5) {
    const u = t / 0.5;
    r = Math.round(59 + (161 - 59) * u);
    g = Math.round(130 + (161 - 130) * u);
    b = Math.round(246 + (170 - 246) * u);
    bgA = 0.28 - u * 0.16;
    bA = 0.65 - u * 0.28;
  } else {
    const u = (t - 0.5) / 0.5;
    r = Math.round(161 + (239 - 161) * u);
    g = Math.round(161 + (68 - 161) * u);
    b = Math.round(170 + (68 - 170) * u);
    bgA = 0.12 + u * 0.16;
    bA = 0.37 + u * 0.28;
  }
  return {
    bg: `rgba(${r},${g},${b},${bgA.toFixed(2)})`,
    border: `rgba(${r},${g},${b},${bA.toFixed(2)})`,
  };
}

const MVMT_STROKE_COLORS = ["#3b82f6", "#16a34a", "#d97706", "#9333ea", "#ef4444"] as const;

type MeasureRow = {
  id: number;
  measureNumber: number;
  pageNumber: number | null;
  boundingBox: { x: number; y: number; w: number; h: number } | null;
  imageUrl: string | null;
  movementId?: number | null;
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
    const decodeReps = chunkPhases.find((p) => p.phaseType === "decode")?.raw ?? 1;
    const sectionChunkDays = totalChunkReps + (numChunks - 1) * decodeReps;
    const linkReps = phases.find((p) => p.phaseType === "connect")?.raw ?? 1;
    const linkDays = linkReps * Math.max(0, numChunks - 1);
    const sectionTotal = sectionChunkDays + linkDays;
    estimatedDays = Math.max(estimatedDays, sectionStagger + sectionTotal);
    const introReps = chunkPhases.slice(0, 2).reduce((s, p) => s + p.raw, 0);
    sectionStagger += introReps;
  }
  const interConnectDays = Math.max(0, sections.length - 1);
  const shapeRaw = rawMap[sections[0].localId]?.find((p) => p.phaseType === "shape")?.raw ?? 2;
  const performRaw = rawMap[sections[0].localId]?.find((p) => p.phaseType === "perform")?.raw ?? 2;
  estimatedDays += interConnectDays + shapeRaw + performRaw;

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
    case "phases": return 4;
    case "confirm": return 5;
    default: return 0;
  }
}

function StepDots({ current }: { current: Step }) {
  const keys = ["setup", "upload", "pages", "review", "sectionMark", "confirm"] as const;
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
  playingLevel,
  onNext,
}: {
  dailyMinutes: number; setDailyMinutes: (v: number) => void;
  playingLevel: PlayingLevel;
  onNext: () => void;
}) {
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

      <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <Music2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Playing level</span>
        </div>
        <span className="text-xs font-medium">{PLAYING_LEVEL_LABELS[playingLevel]}</span>
      </div>

      <Button onClick={onNext} className="w-full">
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

function LevelIndicator({
  zone, level, onSetLevel,
}: {
  zone: "hard" | "easy";
  level: Level;
  onSetLevel: (l: Level) => void;
}) {
  const colorClass = zone === "hard" ? "bg-rose-500" : "bg-blue-500";
  return (
    <div
      className="absolute left-0 top-0 bottom-0 w-4 flex items-stretch gap-[2px] py-1.5 pl-1"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {([1, 2, 3] as Level[]).map((lv) => (
        <button
          key={lv}
          type="button"
          onClick={(e) => { e.stopPropagation(); onSetLevel(lv); }}
          className={cn(
            "w-[3px] rounded-sm transition-opacity cursor-pointer",
            colorClass,
            level >= lv ? "opacity-100" : "opacity-20 hover:opacity-50",
          )}
          title={`Set level ${lv}`}
        />
      ))}
    </div>
  );
}

function DraggableSectionCard({
  id, section, zoneLevel, isHovered, editing,
  onHover, onUnhover, onStartEdit, onStopEdit, onRename, onSetLevel, onDelete,
}: {
  id: string;
  section: LocalSection;
  zoneLevel: ZoneLevel;
  isHovered: boolean;
  editing: boolean;
  onHover: () => void;
  onUnhover: () => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onRename: (name: string) => void;
  onSetLevel: (l: Level) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  const ignored = zoneLevel.zone === "ignore";
  const col = colorForZoneLevel(zoneLevel);
  const cardStyle: React.CSSProperties = ignored
    ? { ...style, background: "rgba(100,116,139,0.08)", borderColor: "rgba(100,116,139,0.5)", borderLeftWidth: 3, borderLeftStyle: "dashed" }
    : { ...style, background: col.bg, borderColor: col.border, borderLeftWidth: 1 };
  return (
    <div
      ref={setNodeRef}
      style={cardStyle}
      className={cn(
        "relative rounded border py-2 pr-2 text-xs space-y-1 cursor-grab active:cursor-grabbing select-none",
        ignored ? "pl-2" : "pl-6",
        isHovered && "ring-2 ring-primary/50",
        ignored && "opacity-70",
      )}
      onMouseEnter={onHover}
      onMouseLeave={onUnhover}
      {...attributes}
      {...listeners}
    >
      {!ignored && (
        <LevelIndicator zone={zoneLevel.zone as "hard" | "easy"} level={zoneLevel.level} onSetLevel={onSetLevel} />
      )}
      <div className="flex items-center gap-1">
        {editing ? (
          <input
            autoFocus
            className="flex-1 outline-none text-xs bg-transparent font-medium min-w-0"
            value={section.name}
            onChange={(e) => onRename(e.target.value)}
            onBlur={onStopEdit}
            onKeyDown={(e) => { if (e.key === "Enter") onStopEdit(); }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="flex-1 font-medium cursor-text truncate"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
          >
            {section.name}
          </span>
        )}
        <button
          type="button"
          aria-label="Delete section"
          title="Delete section"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="shrink-0 rounded p-0.5 text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="text-muted-foreground text-[11px]">Bars {section.measureStart}–{section.measureEnd}</div>
    </div>
  );
}

function DropZone({
  id, children, className,
}: {
  id: Zone;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md border transition-colors",
        isOver ? "ring-2 ring-primary/50 bg-primary/5" : "",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SectionMarkStep({
  sheetMusicId,
  totalMeasures: _totalMeasures,
  planMovementId,
  onNext,
  onSkip,
  onBack,
}: {
  sheetMusicId: number;
  totalMeasures: number;
  planMovementId?: number | null;
  onNext: (sections: DraftSection[]) => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const [localSections, setLocalSections] = useState<LocalSection[]>([]);
  const [difficulties, setDifficulties] = useState<Record<string, ZoneLevel>>({});
  const localSectionsRef = useRef<LocalSection[]>([]);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selMode, setSelMode] = useState<"idle" | "pending" | "dragging">("idle");
  const [hoverMeasure, setHoverMeasure] = useState<number | null>(null);
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const [selError, setSelError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const pointerIsDownRef = useRef(false);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const centerRef = useRef<HTMLDivElement | null>(null);
  const getPageUrl = useSheetPageUrl(sheetMusicId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const mvtParam = planMovementId ? `?movementId=${planMovementId}` : "";
  const { data: pages = [] } = useQuery<ScorePage[]>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/pages${mvtParam}`],
  });
  const { data: rawMeasures = [] } = useQuery<MeasureRow[]>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/measures${mvtParam}`],
  });

  useEffect(() => { localSectionsRef.current = localSections; }, [localSections]);

  const measures = useMemo(
    () => [...rawMeasures].sort((a, b) => a.measureNumber - b.measureNumber),
    [rawMeasures],
  );

  const usePageGeometry = useMemo(
    () => measuresUsePageGeometry(measures as Parameters<typeof measuresUsePageGeometry>[0]),
    [measures],
  );

  const measuresByPage = useMemo(() => {
    const m: Record<number, MeasureRow[]> = {};
    for (const msr of measures) { (m[msr.pageNumber ?? 1] ??= []).push(msr); }
    return m;
  }, [measures]);

  const movementIds = useMemo(() => {
    const seen = new Set<number | null>();
    const ids: Array<number | null> = [];
    for (const m of measures) {
      const mvt = m.movementId ?? null;
      if (!seen.has(mvt)) { seen.add(mvt); ids.push(mvt); }
    }
    return ids;
  }, [measures]);

  const mvtColorFor = (mvtId: number | null | undefined): string | null => {
    const key = mvtId ?? null;
    const idx = movementIds.indexOf(key);
    if (idx < 0 || movementIds.length <= 1) return null;
    return MVMT_STROKE_COLORS[idx % MVMT_STROKE_COLORS.length];
  };

  const ignoredIdSet = useMemo(
    () => new Set(Object.entries(difficulties).filter(([, v]) => v.zone === "ignore").map(([k]) => k)),
    [difficulties],
  );

  const getZoneLevel = useCallback(
    (tempId: string): ZoneLevel => difficulties[tempId] ?? { zone: "easy", level: 1 },
    [difficulties],
  );

  const sectionForBar = (mNum: number) =>
    localSectionsRef.current.find((s) => s.measureStart <= mNum && mNum <= s.measureEnd);

  const hoveredSection = hoveredSectionId
    ? localSections.find((s) => s.tempId === hoveredSectionId) ?? null
    : null;

  const selPreviewRange = useMemo((): { lo: number; hi: number } | null => {
    if (selStart === null) return null;
    const end = hoverMeasure ?? selStart;
    return { lo: Math.min(selStart, end), hi: Math.max(selStart, end) };
  }, [selStart, hoverMeasure]);

  const finalizeSelection = useCallback((endMeasure: number) => {
    const start = selStart;
    if (start === null) return;
    const lo = Math.min(start, endMeasure);
    const hi = Math.max(start, endMeasure);
    const rangeMsrs = measures.filter((m) => m.measureNumber >= lo && m.measureNumber <= hi);

    const uniqueMvt = new Set(rangeMsrs.map((m) => m.movementId ?? null));
    if (uniqueMvt.size > 1) {
      setSelError("Selection cannot cross movement boundaries.");
      setSelStart(null);
      return;
    }

    const sections = localSectionsRef.current;
    if (sections.some((s) => s.measureStart <= hi && s.measureEnd >= lo)) {
      setSelError("This range overlaps an existing section. Delete it first.");
      setSelStart(null);
      return;
    }

    const idx = sections.length;
    const newSec: LocalSection = {
      tempId: crypto.randomUUID(),
      name: `Section ${String.fromCharCode(65 + (idx % 26))}`,
      measureStart: lo,
      measureEnd: hi,
    };
    setLocalSections((prev) => {
      const sorted = [...prev, newSec].sort((a, b) => a.measureStart - b.measureStart);
      return sorted.map((s, i) => ({
        ...s,
        name: s.name.match(/^Section [A-Z]$/) ? `Section ${String.fromCharCode(65 + (i % 26))}` : s.name,
      }));
    });
    // Default new section to easy/level 1 (closest to baseline)
    setDifficulties((prev) => ({ ...prev, [newSec.tempId]: { zone: "easy", level: 1 } }));
    setSelStart(null);
    setHoverMeasure(null);
    setSelError(null);
  }, [selStart, measures]);

  const handleBarPointerDown = useCallback((mNum: number) => {
    pointerIsDownRef.current = true;
    if (selMode === "idle") {
      setSelStart(mNum);
      setSelMode("dragging");
      setHoverMeasure(mNum);
      setSelError(null);
    }
  }, [selMode]);

  const handleBarPointerEnter = useCallback((mNum: number, sec?: LocalSection | null) => {
    if (selMode === "dragging" || selMode === "pending") {
      setHoverMeasure(mNum);
    }
    if (selMode === "idle") {
      setHoveredSectionId(sec?.tempId ?? null);
    }
  }, [selMode]);

  const handleBarPointerLeave = useCallback(() => {
    if (selMode === "pending") setHoverMeasure(null);
  }, [selMode]);

  const handleBarPointerUp = useCallback((mNum: number) => {
    pointerIsDownRef.current = false;
    if (selMode === "dragging") {
      if (mNum === selStart) {
        setSelMode("pending");
      } else {
        setSelMode("idle");
        finalizeSelection(mNum);
      }
    } else if (selMode === "pending") {
      if (mNum === selStart) {
        setSelStart(null);
        setSelMode("idle");
        setHoverMeasure(null);
      } else {
        setSelMode("idle");
        finalizeSelection(mNum);
      }
    }
  }, [selMode, selStart, finalizeSelection]);

  const removeSection = (tempId: string) => {
    setLocalSections((prev) => {
      const filtered = prev.filter((s) => s.tempId !== tempId);
      return filtered.map((s, i) => ({
        ...s,
        name: s.name.match(/^Section [A-Z]$/) ? `Section ${String.fromCharCode(65 + (i % 26))}` : s.name,
      }));
    });
    setDifficulties((prev) => {
      const next = { ...prev };
      delete next[tempId];
      return next;
    });
    if (hoveredSectionId === tempId) setHoveredSectionId(null);
  };

  const setLevelFor = useCallback((tempId: string, level: Level) => {
    setDifficulties((prev) => {
      const curr = prev[tempId];
      if (!curr || curr.zone === "ignore") return prev;
      return { ...prev, [tempId]: { ...curr, level } };
    });
  }, []);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    if (overId !== "hard" && overId !== "easy" && overId !== "ignore") return;
    const id = String(active.id);
    setDifficulties((prev) => {
      const curr = prev[id];
      if (curr && curr.zone === overId) return prev;
      return { ...prev, [id]: { zone: overId as Zone, level: 1 } };
    });
  }, []);

  const handleDone = () => {
    const drafts: DraftSection[] = localSections.map((s): DraftSection => {
      const zl = getZoneLevel(s.tempId);
      if (zl.zone === "ignore") {
        return {
          localId: s.tempId,
          name: s.name,
          measureStart: s.measureStart,
          measureEnd: s.measureEnd,
          difficulty: 4,
          ignored: true,
        };
      }
      return {
        localId: s.tempId,
        name: s.name,
        measureStart: s.measureStart,
        measureEnd: s.measureEnd,
        difficulty: zoneLevelToDifficulty(zl) ?? 4,
      };
    });
    onNext(drafts);
  };

  const scrollToPage = (pageNum: number) => {
    pageRefs.current[pageNum]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const renderBarOverlay = (msr: MeasureRow) => {
    const mNum = msr.measureNumber;
    const box = msr.boundingBox!;
    const sec = sectionForBar(mNum);
    const isSelStart = selStart === mNum;
    const inSelRange = selPreviewRange && mNum >= selPreviewRange.lo && mNum <= selPreviewRange.hi;
    const isHoveredSec = hoveredSectionId !== null && sec?.tempId === hoveredSectionId;
    const dimmed = sec && hoveredSectionId !== null && sec.tempId !== hoveredSectionId;
    const mvtColor = mvtColorFor(msr.movementId);

    let bgColor = "rgba(0,0,0,0.03)";
    let borderLeft = mvtColor ? `2px solid ${mvtColor}40` : "2px solid transparent";

    if (sec && !dimmed) {
      const zl = getZoneLevel(sec.tempId);
      if (zl.zone === "ignore") {
        bgColor = isHoveredSec ? "rgba(100,116,139,0.25)" : "rgba(100,116,139,0.12)";
        borderLeft = `3px dashed rgba(100,116,139,0.7)`;
      } else {
        const col = colorForZoneLevel(zl);
        bgColor = isHoveredSec ? col.bg.replace(/[\d.]+\)$/, "0.5)") : col.bg;
        borderLeft = `3px solid ${col.border}`;
      }
    }
    if (inSelRange && !sec) {
      bgColor = "rgba(251,191,36,0.22)";
      borderLeft = isSelStart ? "3px solid rgb(251,191,36)" : "2px solid rgba(251,191,36,0.5)";
    }
    if (isSelStart) borderLeft = "3px solid rgb(251,191,36)";

    return (
      <div
        key={msr.id}
        onPointerDown={(e) => { e.preventDefault(); handleBarPointerDown(mNum); }}
        onPointerEnter={() => handleBarPointerEnter(mNum, sec)}
        onPointerLeave={handleBarPointerLeave}
        onPointerUp={(e) => { e.stopPropagation(); handleBarPointerUp(mNum); }}
        style={{
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.w * 100}%`,
          height: `${box.h * 100}%`,
          position: "absolute",
          backgroundColor: dimmed ? "transparent" : bgColor,
          borderLeft,
          boxSizing: "border-box",
          outline: isSelStart ? "2px solid rgba(251,191,36,0.7)" : undefined,
          outlineOffset: isSelStart ? "-2px" : undefined,
          cursor: "crosshair",
          userSelect: "none",
          touchAction: "none",
        }}
        title={sec ? `${sec.name} (bars ${sec.measureStart}–${sec.measureEnd})` : `Bar ${mNum}`}
      />
    );
  };

  const hardSections = useMemo(() => {
    return localSections
      .filter((s) => getZoneLevel(s.tempId).zone === "hard")
      .slice()
      .sort((a, b) => {
        const la = getZoneLevel(a.tempId).level;
        const lb = getZoneLevel(b.tempId).level;
        if (la !== lb) return lb - la; // hard: higher level first
        return a.measureStart - b.measureStart;
      });
  }, [localSections, difficulties, getZoneLevel]);

  const easySections = useMemo(() => {
    return localSections
      .filter((s) => getZoneLevel(s.tempId).zone === "easy")
      .slice()
      .sort((a, b) => {
        const la = getZoneLevel(a.tempId).level;
        const lb = getZoneLevel(b.tempId).level;
        if (la !== lb) return la - lb; // easy: lower level first (closest to baseline)
        return a.measureStart - b.measureStart;
      });
  }, [localSections, difficulties, getZoneLevel]);

  const ignoredSections = useMemo(() => {
    return localSections
      .filter((s) => getZoneLevel(s.tempId).zone === "ignore")
      .slice()
      .sort((a, b) => a.measureStart - b.measureStart);
  }, [localSections, difficulties, getZoneLevel]);

  const renderCard = (sec: LocalSection) => {
    const zl = getZoneLevel(sec.tempId);
    return (
      <motion.div
        key={sec.tempId}
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
      >
        <DraggableSectionCard
          id={sec.tempId}
          section={sec}
          zoneLevel={zl}
          isHovered={hoveredSectionId === sec.tempId}
          editing={editingId === sec.tempId}
          onHover={() => setHoveredSectionId(sec.tempId)}
          onUnhover={() => setHoveredSectionId(null)}
          onStartEdit={() => setEditingId(sec.tempId)}
          onStopEdit={() => setEditingId(null)}
          onRename={(name) =>
            setLocalSections((prev) => prev.map((s) => s.tempId === sec.tempId ? { ...s, name } : s))
          }
          onSetLevel={(lv) => setLevelFor(sec.tempId, lv)}
          onDelete={() => removeSection(sec.tempId)}
        />
      </motion.div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <div className="h-4 w-px bg-border" />
          <BookMarked className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Mark & rank sections</span>
          {localSections.length > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              {localSections.length} section{localSections.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onSkip} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Skip
          </button>
          <Button size="sm" onClick={handleDone}>
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* 3-column body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: page thumbnails */}
        <div className="w-16 shrink-0 border-r bg-muted/20 overflow-y-auto py-2 flex flex-col gap-2 items-center">
          {pages.map((pg) => (
            <button
              key={pg.pageNumber}
              onClick={() => scrollToPage(pg.pageNumber)}
              className="w-12 rounded border border-border/50 overflow-hidden hover:border-primary/60 transition-colors"
              title={`Page ${pg.pageNumber}`}
            >
              <img src={pg.imageUrl} alt={`p${pg.pageNumber}`} className="w-full h-auto block" />
              <div className="text-[9px] text-center text-muted-foreground py-0.5 leading-none">{pg.pageNumber}</div>
            </button>
          ))}
        </div>

        {/* Center: score pages */}
        <div
          ref={centerRef}
          className="flex-1 overflow-y-auto bg-neutral-100 p-4"
          onPointerUp={() => {
            if (selMode === "dragging") setSelMode("pending");
            pointerIsDownRef.current = false;
          }}
          onMouseLeave={() => { if (selMode === "idle") setHoveredSectionId(null); }}
        >
          {/* Instructional banner + hovered section delete affordance */}
          {selMode === "idle" && !selError && !hoveredSection && (
            <div className="mb-3 px-3 py-2 rounded bg-primary/5 border border-primary/20 text-xs text-foreground/80">
              <span className="font-medium">Step 1 ·</span> Click or drag across bars to mark a section. Then rank its difficulty on the right →
            </div>
          )}
          {hoveredSection && selMode === "idle" && (
            <div className="mb-3 px-3 py-2 rounded bg-amber-50 border border-amber-200 text-xs flex items-center gap-2">
              <span className="font-medium text-amber-900">
                {hoveredSection.name} · bars {hoveredSection.measureStart}–{hoveredSection.measureEnd}
              </span>
              <button
                type="button"
                onClick={() => removeSection(hoveredSection.tempId)}
                className="ml-auto inline-flex items-center gap-1 rounded bg-white border border-amber-300 px-2 py-0.5 text-[11px] text-amber-900 hover:bg-amber-100"
              >
                <X className="w-3 h-3" /> Delete section
              </button>
            </div>
          )}
          {selMode === "pending" && selStart !== null && (
            <div className="mb-3 px-3 py-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
              <span className="font-medium">Bar {selStart} selected.</span>
              <span>Click or drag to another bar to set the end, or click bar {selStart} again to cancel.</span>
            </div>
          )}
          {selError && (
            <div className="mb-3 px-3 py-2 rounded bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {selError}
            </div>
          )}
          {usePageGeometry ? (
            <div className="grid grid-cols-2 gap-4">
              {pages.map((pg) => (
                <div
                  key={pg.pageNumber}
                  ref={(el) => { pageRefs.current[pg.pageNumber] = el; }}
                  className="bg-white shadow-sm rounded overflow-hidden relative"
                >
                  <img src={getPageUrl(pg.pageNumber)} alt={`Page ${pg.pageNumber}`} className="w-full h-auto block" />
                  {(measuresByPage[pg.pageNumber] ?? [])
                    .filter((m) => m.boundingBox != null)
                    .map((msr) => renderBarOverlay(msr))}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1 max-w-2xl mx-auto" style={{ userSelect: "none" }}>
              {measures.map((msr) => {
                const mNum = msr.measureNumber;
                const sec = sectionForBar(mNum);
                const isSelStart = selStart === mNum;
                const inRange = selPreviewRange && mNum >= selPreviewRange.lo && mNum <= selPreviewRange.hi;
                const isIgnoredSec = !!sec && ignoredIdSet.has(sec.tempId);
                const col = sec && !isIgnoredSec ? colorForZoneLevel(getZoneLevel(sec.tempId)) : null;
                const dimmed = sec && hoveredSectionId !== null && sec.tempId !== hoveredSectionId;
                return (
                  <div
                    key={msr.id}
                    onPointerDown={(e) => { e.preventDefault(); handleBarPointerDown(mNum); }}
                    onPointerEnter={() => handleBarPointerEnter(mNum, sec)}
                    onPointerLeave={handleBarPointerLeave}
                    onPointerUp={(e) => { e.stopPropagation(); handleBarPointerUp(mNum); }}
                    style={
                      isIgnoredSec && !dimmed
                        ? { background: "rgba(100,116,139,0.12)", borderLeftColor: "rgba(100,116,139,0.7)", borderLeftStyle: "dashed", touchAction: "none" }
                        : col && !dimmed
                        ? { background: col.bg, borderLeftColor: col.border, touchAction: "none" }
                        : { touchAction: "none" }
                    }
                    className={cn(
                      "relative w-full h-10 rounded border text-left overflow-hidden transition-colors cursor-crosshair",
                      isSelStart && "ring-2 ring-amber-400",
                      inRange && !sec && "bg-amber-50 border-l-2 border-amber-400",
                      (col || isIgnoredSec) && !dimmed && "border-l-4",
                      !col && !isIgnoredSec && !isSelStart && !inRange && "bg-white/50",
                      dimmed && "opacity-30",
                    )}
                  >
                    {msr.imageUrl && <img src={msr.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover object-left opacity-80 pointer-events-none" />}
                    <span className="absolute top-0.5 left-1 text-[10px] text-muted-foreground/70 tabular-nums pointer-events-none">{mNum}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: rank panel */}
        <div className="w-64 shrink-0 border-l bg-background overflow-y-auto p-3 flex flex-col gap-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Step 2 · Rank difficulty</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Drag sections into the <span className="font-semibold text-rose-600">Hard</span>, <span className="font-semibold text-blue-600">Easy</span>, or <span className="font-semibold text-slate-600">Ignore</span> zone. Click the lines on the left of each card to set the level (1–3).
            </p>
          </div>

          {localSections.length === 0 ? (
            <div className="text-xs text-muted-foreground leading-relaxed border-t pt-3">
              No sections yet. Click a bar on the score to start a section.
            </div>
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <div className="space-y-2">
                <DropZone id="hard" className="border-rose-300/60 bg-rose-50/50 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-rose-600 font-semibold flex items-center gap-1 mb-1.5">
                    <span>↑ Harder than average</span>
                    <span className="h-px flex-1 bg-rose-200" />
                  </div>
                  <div className="space-y-1.5 min-h-[24px]">
                    {hardSections.length === 0 ? (
                      <div className="text-[10px] text-muted-foreground/60 italic text-center py-1">
                        (drop sections here)
                      </div>
                    ) : (
                      <AnimatePresence initial={false}>
                        {hardSections.map(renderCard)}
                      </AnimatePresence>
                    )}
                  </div>
                </DropZone>

                <div className="rounded border border-dashed border-muted-foreground/40 bg-muted/40 px-3 py-1.5 text-center select-none">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">— Everything else —</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">Average difficulty</div>
                </div>

                <DropZone id="easy" className="border-blue-300/60 bg-blue-50/50 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-blue-600 font-semibold flex items-center gap-1 mb-1.5">
                    <span className="h-px flex-1 bg-blue-200" />
                    <span>↓ Easier than average</span>
                  </div>
                  <div className="space-y-1.5 min-h-[24px]">
                    {easySections.length === 0 ? (
                      <div className="text-[10px] text-muted-foreground/60 italic text-center py-1">
                        (drop sections here)
                      </div>
                    ) : (
                      <AnimatePresence initial={false}>
                        {easySections.map(renderCard)}
                      </AnimatePresence>
                    )}
                  </div>
                </DropZone>

                <DropZone id="ignore" className="border-slate-300/60 bg-slate-100/60 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold flex items-center gap-1 mb-1.5">
                    <span>↓ Ignore from learning plan ↓</span>
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                  <div className="space-y-1.5 min-h-[24px]">
                    {ignoredSections.length === 0 ? (
                      <div className="text-[10px] text-muted-foreground/60 italic text-center py-1">
                        (drop to skip from plan)
                      </div>
                    ) : (
                      <AnimatePresence initial={false}>
                        {ignoredSections.map(renderCard)}
                      </AnimatePresence>
                    )}
                  </div>
                </DropZone>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed border-t pt-2 mt-2">
                To remove a section entirely, hover it on the score and click <span className="font-semibold">Delete</span>.
              </p>
            </DndContext>
          )}
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
    const linkPhase = phases.find((p) => p.phaseType === "connect");
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
      allWeights.push({ sectionIdx: ls.sectionIdx, weight: PHASE_BASE_EFFORT.connect });
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

  // Shape + perform
  const stabPhase = getPhasesFor(sections[0].localId, sections[0].difficulty).find((p) => p.phaseType === "shape");
  const shapePhase = getPhasesFor(sections[0].localId, sections[0].difficulty).find((p) => p.phaseType === "perform");
  for (let r = 0; r < (stabPhase?.repetitions ?? 2); r++) {
    days.push({ dayIndex: dayIdx, blocks: [{ sectionIdx: -1, sectionName: "Full piece", phaseLabel: "Shape", fraction: 1 }] });
    dayIdx++;
  }
  for (let r = 0; r < (shapePhase?.repetitions ?? 2); r++) {
    days.push({ dayIndex: dayIdx, blocks: [{ sectionIdx: -1, sectionName: "Full piece", phaseLabel: "Perform", fraction: 1 }] });
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
  pageCount, tempo, setTempo,
  onConfirm, isLoading, onBack,
}: {
  pieceTitle: string; dailyMinutes: number; targetDate: string;
  totalMeasures: number;
  pageCount: number;
  tempo: Tempo; setTempo: (t: Tempo) => void;
  onConfirm: () => void; isLoading: boolean; onBack: () => void;
}) {
  const target = new Date(targetDate);
  const today = new Date();
  const days = Math.max(1, Math.round((target.getTime() - today.getTime()) / 86400000));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Pace</p>
        <div className="grid grid-cols-2 gap-2">
          {(["slow", "medium", "fast", "aggressive"] as Tempo[]).map((t) => {
            const active = tempo === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTempo(t)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-all",
                  active
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border bg-muted/20 hover:bg-muted/40",
                )}
              >
                <div className="text-sm font-semibold">{TEMPO_LABELS[t].title}</div>
                <div className="text-xs text-muted-foreground">{TEMPO_LABELS[t].blurb}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border bg-muted/20 divide-y divide-border overflow-hidden">
        {[
          { label: "Piece", value: pieceTitle },
          { label: "Daily practice", value: `${dailyMinutes} min` },
          { label: "Pages", value: pageCount > 0 ? pageCount.toString() : "—" },
          { label: "Estimated duration", value: `${days} days` },
          { label: "Target date", value: target.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) },
          ...(totalMeasures > 0 ? [{ label: "Total measures", value: totalMeasures.toString() }] : []),
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between items-center px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{value}</span>
          </div>
        ))}
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
  const [tempo, setTempo] = useState<Tempo>("medium");
  const [sheetMusicId, setSheetMusicId] = useState<number | null>(null);
  /** Full PDF page count from upload / pdf-meta (unchanged after excerpt processing). */
  const [pdfSourcePageCount, setPdfSourcePageCount] = useState<number | null>(null);
  const [totalMeasures, setTotalMeasures] = useState(0);
  const [sections, setSections] = useState<DraftSection[]>([]);
  const [sectionPhases, setSectionPhases] = useState<Record<string, DraftPhase[]>>({});
  const [cameViaCommunityScore, setCameViaCommunityScore] = useState(false);

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

  const pagesUrl = sheetMusicId
    ? `/api/sheet-music/${sheetMusicId}/pages${movementId != null ? `?movementId=${movementId}` : ""}`
    : null;
  const { data: pagesList } = useQuery<{ pageNumber: number }[]>({
    queryKey: [pagesUrl],
    queryFn: async () => {
      if (!pagesUrl) return [];
      const res = await fetch(pagesUrl, { headers: getAuthHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!pagesUrl,
  });
  const pageCount = pagesList?.length ?? 0;

  const targetDate = useMemo(() => {
    const pages = Math.max(1, pageCount);
    const timeFactor = 30 / Math.max(1, dailyMinutes);
    const days = Math.max(1, Math.ceil(pages * TEMPO_DAYS_PER_PAGE[tempo] * timeFactor));
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }, [tempo, pageCount, dailyMinutes]);

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
            ignored: !!sec.ignored,
            displayOrder: i,
          });
          const createdSection = (await secRes.json()) as { id: number };
          if (!sec.ignored) {
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
      }

      // Scheduler v2: passage-state-machine model with spaced repetition +
      // modality library + dynamic replanning. Opt-in via schedulerVersion=2.
      await apiRequest("POST", `/api/learning-plans/${planId}/generate-lessons?v=2`, { schedulerVersion: 2 });
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
      setTempo("medium");
      setCameViaCommunityScore(false);
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
        planMovementId={movementId}
        onNext={(drafts) => {
          setSections(drafts);
          setSectionPhases({});
          setStep("confirm");
        }}
        onSkip={() => { setSections([]); setSectionPhases({}); setStep("confirm"); }}
        onBack={() => cameViaCommunityScore ? setStep("upload") : setStep("review")}
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
              setCameViaCommunityScore(true);
              setStep("sectionMark");
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
            pageCount={pageCount}
            tempo={tempo} setTempo={setTempo}
            onConfirm={() => confirmPlan.mutate()}
            isLoading={confirmPlan.isPending}
            onBack={() => setStep("sectionMark")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
