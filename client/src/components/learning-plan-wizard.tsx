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
import {
  Upload, Loader2, CheckCircle2, ChevronLeft, ChevronRight,
  CalendarDays, Clock, Music2, AlertCircle, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScoreReviewModal } from "@/components/score-review-modal";

// ─── Types ──────────────────────────────────────────────────────────────────

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

type Step = "setup" | "upload" | "pageRange" | "processing" | "review" | "confirm";

const STEP_ORDER: Step[] = ["setup", "upload", "pageRange", "processing", "review", "confirm"];

// ─── Step indicators ─────────────────────────────────────────────────────────

const STEP_LABELS: Record<Step, string> = {
  setup: "Practice setup",
  upload: "Sheet music",
  pageRange: "Page range",
  processing: "Detecting bars",
  review: "Review bars",
  confirm: "Generate plan",
};

/** Map wizard step to progress dot index (upload + pageRange + processing share the “pages” segment). */
function stepToProgressIndex(step: Step): number {
  switch (step) {
    case "setup": return 0;
    case "upload": return 1;
    case "pageRange":
    case "processing": return 2;
    case "review": return 3;
    case "confirm": return 4;
    default: return 0;
  }
}

function StepDots({ current }: { current: Step }) {
  const keys = ["setup", "upload", "pages", "review", "confirm"] as const;
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
              <div className={cn("h-px w-8", dotIdx < currentIdx ? "bg-primary" : "bg-muted-foreground/20")} />
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
  onNext,
}: {
  dailyMinutes: number; setDailyMinutes: (v: number) => void;
  targetDate: string; setTargetDate: (v: string) => void;
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
      toast({ title: "Couldn’t start analysis", description: "Try again.", variant: "destructive" });
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
            We’ll only detect bars on pages {Math.min(fromPage, toPage)}–{Math.max(fromPage, toPage)} ({Math.abs(toPage - fromPage) + 1} page{Math.abs(toPage - fromPage) === 0 ? "" : "s"}).
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
      onConfirm={() => onConfirm(measures.length)}
      onBack={onBack}
    />
  );
}

// ─── Step: Confirm ─────────────────────────────────────────────────────────────

function ConfirmStep({
  pieceTitle, dailyMinutes, targetDate, totalMeasures,
  onConfirm, isLoading, onBack,
}: {
  pieceTitle: string; dailyMinutes: number; targetDate: string;
  totalMeasures: number; onConfirm: () => void; isLoading: boolean; onBack: () => void;
}) {
  const target = new Date(targetDate);
  const today = new Date();
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  const measuresPerDay = totalMeasures > 0 ? Math.ceil(totalMeasures / days) : null;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-muted/20 divide-y divide-border overflow-hidden">
        {[
          { label: "Piece", value: pieceTitle },
          { label: "Daily practice", value: `${dailyMinutes} min` },
          { label: "Target date", value: new Date(targetDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) },
          { label: "Days to learn", value: `${days} days` },
          ...(totalMeasures > 0 ? [
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
          We'll create a lesson for each day, assigning measures in order so you always know exactly what to practice.
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

  // Re-fetch whenever the dialog opens so the card reflects a recent contribution.
  useEffect(() => {
    if (open && communityScoreUrl) {
      refetchCommunityScore();
    }
    // intentionally omitting refetchCommunityScore from deps to avoid re-triggering
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
    }, 300);
  };

  const stepTitles: Record<Step, string> = {
    setup: "Start a learning plan",
    upload: "Upload sheet music",
    pageRange: "Which pages to analyse",
    processing: "Analysing score",
    review: "Review detected bars",
    confirm: "Confirm plan",
  };

  // Review step renders full-screen — bypass the Dialog entirely
  if (step === "review" && sheetMusicId) {
    return (
      <ReviewStep
        sheetMusicId={sheetMusicId}
        pieceTitle={pieceTitle}
        onConfirm={(n) => { setTotalMeasures(n); setStep("confirm"); }}
        onBack={() => setStep("pageRange")}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">{stepTitles[step]}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground truncate">{pieceTitle}</DialogDescription>
        </DialogHeader>

        <StepDots current={step} />

        {step === "setup" && (
          <SetupStep
            dailyMinutes={dailyMinutes} setDailyMinutes={setDailyMinutes}
            targetDate={targetDate} setTargetDate={setTargetDate}
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

        {step === "confirm" && (
          <ConfirmStep
            pieceTitle={pieceTitle} dailyMinutes={dailyMinutes}
            targetDate={targetDate} totalMeasures={totalMeasures}
            onConfirm={() => confirmPlan.mutate()}
            isLoading={confirmPlan.isPending}
            onBack={() => setStep("review")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
