import { useState, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
  CalendarDays, Clock, Music2, AlertCircle, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The repertoire entry this plan is attached to */
  repertoireEntryId: number;
  pieceTitle: string;
  userId: string;
  onCreated?: () => void;
}

type Step = "setup" | "upload" | "processing" | "review" | "confirm";

const STEP_ORDER: Step[] = ["setup", "upload", "processing", "review", "confirm"];

// ─── Step indicators ─────────────────────────────────────────────────────────

const STEP_LABELS: Record<Step, string> = {
  setup: "Practice setup",
  upload: "Sheet music",
  processing: "Detecting bars",
  review: "Review bars",
  confirm: "Generate plan",
};

function StepDots({ current }: { current: Step }) {
  const visible: Step[] = ["setup", "upload", "review", "confirm"];
  const currentIdx = STEP_ORDER.indexOf(current);
  return (
    <div className="flex items-center gap-2 mb-6">
      {visible.map((s) => {
        const sIdx = STEP_ORDER.indexOf(s);
        const done = sIdx < currentIdx;
        const active = s === current || (current === "processing" && s === "upload");
        return (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full transition-all",
              done && "bg-primary",
              active && "w-3 h-3 bg-primary",
              !done && !active && "bg-muted-foreground/30",
            )} />
            {s !== visible[visible.length - 1] && (
              <div className={cn("h-px w-8", done ? "bg-primary" : "bg-muted-foreground/20")} />
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

function UploadStep({
  pieceTitle, userId,
  onSheetMusicCreated, onBack,
}: {
  pieceTitle: string; userId: string;
  onSheetMusicCreated: (id: number) => void;
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
      const res = await fetch("/api/sheet-music/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      return data.sheetMusicId as number;
    },
    onSuccess: (id) => {
      onSheetMusicCreated(id);
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
              <p className="text-sm font-medium">Drop your PDF here or click to browse</p>
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

// ─── Step: Processing ─────────────────────────────────────────────────────────

function ProcessingStep({ sheetMusicId, onDone }: { sheetMusicId: number; onDone: () => void }) {
  useQuery<SheetMusicStatus>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/status`],
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      if (data.processingStatus === "ready" || data.processingStatus === "failed") return false;
      return 2000;
    },
    select: (data) => {
      if (data.processingStatus === "ready") {
        // Trigger onDone on next tick so query state settles
        setTimeout(onDone, 300);
      }
      return data;
    },
    staleTime: 0,
  });

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="relative">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </div>
      <div className="text-center space-y-1">
        <p className="font-semibold">Analysing score…</p>
        <p className="text-sm text-muted-foreground">
          Detecting barlines page by page. This usually takes 10–30 seconds.
        </p>
      </div>
      <div className="w-full space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-3 w-full" style={{ opacity: 1 - i * 0.25 }} />
        ))}
      </div>
    </div>
  );
}

// ─── Step: Review ─────────────────────────────────────────────────────────────

function ReviewStep({
  sheetMusicId, onConfirm, onBack,
}: {
  sheetMusicId: number; onConfirm: (totalMeasures: number) => void; onBack: () => void;
}) {
  const { data: measures = [], isLoading } = useQuery<Measure[]>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/measures`],
  });

  const [page, setPage] = useState(1);

  const pages = Array.from(new Set(measures.map(m => m.pageNumber))).sort((a, b) => a - b);
  const pageMeasures = measures.filter(m => m.pageNumber === page);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  if (measures.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-sm text-muted-foreground">
          No bars were detected. The PDF may be a scan or use non-standard notation. You can still create a plan and enter measures manually.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4 mr-1" />Back</Button>
          <Button onClick={() => onConfirm(0)}>Continue anyway</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{measures.length}</span> measures detected across{" "}
          <span className="font-semibold text-foreground">{pages.length}</span> pages
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon" className="w-7 h-7"
            disabled={page <= pages[0]}
            onClick={() => setPage(p => Math.max(pages[0], p - 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs font-medium px-1">p.{page}</span>
          <Button
            variant="ghost" size="icon" className="w-7 h-7"
            disabled={page >= pages[pages.length - 1]}
            onClick={() => setPage(p => Math.min(pages[pages.length - 1], p + 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Measure grid */}
      <div className="grid grid-cols-8 gap-1.5 max-h-60 overflow-y-auto pr-1">
        {pageMeasures.map((m) => (
          <div
            key={m.id}
            className="aspect-[3/2] rounded border border-border bg-muted/30 flex items-center justify-center overflow-hidden"
            title={`Bar ${m.measureNumber}`}
          >
            {m.imageUrl ? (
              <img
                src={m.imageUrl}
                alt={`Bar ${m.measureNumber}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[9px] text-muted-foreground font-medium">{m.measureNumber}</span>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Showing page {page} · {pageMeasures.length} bars. Detection looks wrong? You can adjust later.
      </p>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ChevronLeft className="w-4 h-4 mr-1" />Back
        </Button>
        <Button onClick={() => onConfirm(measures.length)} className="flex-1">
          Looks good
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
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

export function LearningPlanWizard({ open, onOpenChange, repertoireEntryId, pieceTitle, userId, onCreated }: Props) {
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
  const [totalMeasures, setTotalMeasures] = useState(0);

  const confirmPlan = useMutation({
    mutationFn: async () => {
      // 1. Confirm measures (mark sheet music as confirmed)
      if (sheetMusicId) {
        await apiRequest("POST", `/api/sheet-music/${sheetMusicId}/confirm`, {});
      }
      // 2. Create / update learning plan
      const plan = await apiRequest("POST", "/api/learning-plans", {
        repertoireEntryId,
        dailyPracticeMinutes: dailyMinutes,
        targetCompletionDate: targetDate,
        totalMeasures,
      });
      const planId = (plan as any).id;
      // 3. Generate lesson days
      await apiRequest("POST", `/api/learning-plans/${planId}/generate-lessons`, {});
      return planId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/learning-plans`] });
      queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
      toast({ title: "Plan created!", description: "Your daily lessons are ready." });
      onOpenChange(false);
      onCreated?.();
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
      setTotalMeasures(0);
    }, 300);
  };

  const stepTitles: Record<Step, string> = {
    setup: "Start a learning plan",
    upload: "Upload sheet music",
    processing: "Analysing score",
    review: "Review detected bars",
    confirm: "Confirm plan",
  };

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
            pieceTitle={pieceTitle} userId={userId}
            onSheetMusicCreated={(id) => {
              setSheetMusicId(id);
              setStep("processing");
            }}
            onBack={() => setStep("setup")}
          />
        )}

        {step === "processing" && sheetMusicId && (
          <ProcessingStep sheetMusicId={sheetMusicId} onDone={() => setStep("review")} />
        )}

        {step === "review" && sheetMusicId && (
          <ReviewStep
            sheetMusicId={sheetMusicId}
            onConfirm={(n) => { setTotalMeasures(n); setStep("confirm"); }}
            onBack={() => setStep("upload")}
          />
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
