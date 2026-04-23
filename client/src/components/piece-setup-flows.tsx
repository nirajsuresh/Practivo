import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Clock, Loader2, CheckCircle2, Users, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  UploadStep, PageRangeStep, ProcessingStep, SectionMarkStep,
  type CommunityScoreInfo, type DraftSection,
} from "@/components/learning-plan-wizard";
import { ReviewBarsStep } from "@/components/score-markup/review-bars-step";

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

export type PieceSetupState =
  | "needs_score"
  | "needs_bars"
  | "needs_sections"
  | "needs_generation"
  | "complete";

export type PieceSetupContext = {
  planId: number;
  pieceId: number | null;
  movementId: number | null;
  pieceTitle: string;
  sheetMusicId: number | null;
  totalMeasures: number | null;
  userId: string;
};

// ─── Score picker dialog ────────────────────────────────────────────────────

export function ScorePickerDialog({
  open, onOpenChange, context, onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  context: PieceSetupContext;
  onComplete: () => void;
}) {
  const queryClient = useQueryClient();

  const communityScoreUrl = context.pieceId
    ? `/api/community-scores?pieceId=${context.pieceId}${context.movementId != null ? `&movementId=${context.movementId}` : ""}`
    : null;

  const { data: communityScore } = useQuery<CommunityScoreInfo | null>({
    queryKey: [communityScoreUrl],
    queryFn: async () => {
      if (!communityScoreUrl) return null;
      const res = await fetch(communityScoreUrl);
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json() as Promise<CommunityScoreInfo>;
    },
    enabled: !!communityScoreUrl && open,
    staleTime: 60_000,
  });

  const handleSheetUploaded = async (id: number, _pageCount: number | null) => {
    await apiRequest("PATCH", `/api/learning-plans/${context.planId}`, {
      sheetMusicId: id,
      setupState: "needs_bars",
    });
    queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
    onComplete();
  };

  const handleUseCommunity = async (score: CommunityScoreInfo) => {
    apiRequest("POST", `/api/community-scores/${score.id}/use`).catch(() => {});
    await apiRequest("PATCH", `/api/learning-plans/${context.planId}`, {
      sheetMusicId: score.sheetMusicId,
      totalMeasures: score.totalMeasures,
      setupState: "needs_sections",
    });
    queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Select score</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground truncate">
            {context.pieceTitle}
          </DialogDescription>
        </DialogHeader>
        <UploadStep
          pieceTitle={context.pieceTitle}
          userId={context.userId}
          pieceId={context.pieceId}
          communityScore={communityScore ?? null}
          onSheetMusicCreated={handleSheetUploaded}
          onUseCommunityScore={handleUseCommunity}
          onBack={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// ─── Bar detection flow (fullscreen) ────────────────────────────────────────

export function BarDetectionFlow({
  context, onComplete, onCancel,
}: {
  context: PieceSetupContext;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"pageRange" | "processing" | "review">("pageRange");

  if (context.sheetMusicId == null) {
    return null;
  }

  const finishReview = async (totalMeasures: number) => {
    await apiRequest("PATCH", `/api/learning-plans/${context.planId}`, {
      totalMeasures,
      setupState: "needs_sections",
    });
    queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
    onComplete();
  };

  if (step === "review") {
    return (
      <ReviewBarsStep
        sheetMusicId={context.sheetMusicId}
        pieceTitle={context.pieceTitle}
        onConfirm={finishReview}
        onBack={() => setStep("pageRange")}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {step === "pageRange" ? "Which pages to analyse" : "Analysing score"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground truncate">
            {context.pieceTitle}
          </DialogDescription>
        </DialogHeader>
        {step === "pageRange" && (
          <PageRangeStep
            sheetMusicId={context.sheetMusicId}
            initialPageCount={null}
            onStarted={() => setStep("processing")}
            onBack={onCancel}
          />
        )}
        {step === "processing" && (
          <ProcessingStep
            sheetMusicId={context.sheetMusicId}
            onDone={() => setStep("review")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Mark sections flow (fullscreen) ────────────────────────────────────────

export function MarkSectionsFlow({
  context, onComplete, onCancel,
}: {
  context: PieceSetupContext;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  if (context.sheetMusicId == null || context.totalMeasures == null) {
    return null;
  }

  const saveSections = async (drafts: DraftSection[], skipped: boolean) => {
    try {
      for (let i = 0; i < drafts.length; i++) {
        const d = drafts[i];
        await apiRequest("POST", `/api/learning-plans/${context.planId}/sections`, {
          name: d.name,
          measureStart: d.measureStart,
          measureEnd: d.measureEnd,
          difficulty: d.difficulty,
          ignored: d.ignored ?? false,
          displayOrder: i,
        });
      }
      await apiRequest("PATCH", `/api/learning-plans/${context.planId}`, {
        setupState: "needs_generation",
        sectionsSkipped: skipped,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      onComplete();
    } catch (err) {
      console.error("Failed to save sections:", err);
      toast({ title: "Couldn't save sections", variant: "destructive" });
    }
  };

  return (
    <SectionMarkStep
      sheetMusicId={context.sheetMusicId}
      totalMeasures={context.totalMeasures}
      planMovementId={context.movementId}
      initialLocalSections={null}
      initialDifficulties={null}
      onSaveAndExit={onCancel}
      onNext={(drafts) => { void saveSections(drafts, false); }}
      onSkip={() => { void saveSections([], true); }}
      onBack={onCancel}
    />
  );
}

// ─── Contribute-to-community dialog (uses existing sheet music) ────────────

export function ContributeExistingScoreDialog({
  open, onOpenChange, context,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  context: PieceSetupContext;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/community-scores", {
        sheetMusicId: context.sheetMusicId,
        movementId: context.movementId ?? undefined,
        description: description.trim() || undefined,
      });
      return res.json().catch(() => ({}));
    },
    onSuccess: () => {
      setDone(true);
      // Invalidate both shapes used elsewhere:
      //   /api/community-scores?pieceId=... (setup flows' existence check)
      //   /api/community-scores/piece/:pieceId (piece-detail page)
      // React Query treats each full string as a distinct key, so invalidate
      // across all queries with a predicate.
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey[0];
          return typeof k === "string" && k.startsWith("/api/community-scores");
        },
      });
    },
    onError: async (err: unknown) => {
      let msg = "Please try again.";
      if (err instanceof Response) {
        const body = await err.json().catch(() => ({} as { error?: string }));
        if (body?.error) msg = body.error;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      toast({ title: "Could not contribute score", description: msg, variant: "destructive" });
    },
  });

  const handleClose = (v: boolean) => {
    if (!v) {
      setDescription("");
      setDone(false);
    }
    onOpenChange(v);
  };

  const disabled = context.sheetMusicId == null || context.pieceId == null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Contribute to community</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground truncate">
            {context.pieceTitle}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-14 h-14 rounded-full bg-[#729E8F]/15 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-[#729E8F]" />
            </div>
            <div>
              <p className="font-semibold">Contribution submitted</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your bar analysis is now available to the community. Thank you.
              </p>
            </div>
            <Button className="mt-2" onClick={() => handleClose(false)}>Close</Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl bg-[#F4F1EA] border border-[#D6D1C7] p-4 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-[#DCCAA6] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Share your analysis</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your confirmed bars for <span className="text-foreground">{context.pieceTitle}</span>{" "}
                  will let every Réperto user skip the setup for this piece.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contrib-desc">
                Edition notes <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="contrib-desc"
                placeholder="e.g. Henle Urtext, Dover edition…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">Helps others know which edition was used.</p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleClose(false)}
                disabled={submit.isPending}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => submit.mutate()}
                disabled={submit.isPending || disabled}
              >
                {submit.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Users className="w-4 h-4 mr-1.5" />
                    Share with community
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Generate plan dialog ───────────────────────────────────────────────────

export function GeneratePlanDialog({
  open, onOpenChange, context, onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  context: PieceSetupContext;
  onComplete: (planId: number) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const [tempo, setTempo] = useState<Tempo>("medium");

  // Estimate pages via sheet-music pages list
  const { data: pagesList } = useQuery<{ pageNumber: number }[]>({
    queryKey: [`/api/sheet-music/${context.sheetMusicId}/pages${context.movementId != null ? `?movementId=${context.movementId}` : ""}`],
    enabled: context.sheetMusicId != null && open,
  });
  const pageCount = pagesList?.length ?? 0;

  const days = Math.max(1, Math.ceil(
    Math.max(1, pageCount) * TEMPO_DAYS_PER_PAGE[tempo] * (30 / Math.max(1, dailyMinutes)),
  ));
  const target = new Date();
  target.setDate(target.getDate() + days);
  const targetDate = target.toISOString().slice(0, 10);

  const generate = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/learning-plans/${context.planId}`, {
        dailyPracticeMinutes: dailyMinutes,
        targetCompletionDate: targetDate,
      });
      const res = await apiRequest("POST", `/api/learning-plans/${context.planId}/generate-lessons`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/home/summary"] });
      onComplete(context.planId);
    },
    onError: () => {
      toast({ title: "Couldn't generate plan", description: "Please try again.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Generate learning plan</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground truncate">
            {context.pieceTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
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
              { label: "Piece", value: context.pieceTitle },
              { label: "Pages", value: pageCount > 0 ? pageCount.toString() : "—" },
              { label: "Estimated duration", value: `${days} day${days === 1 ? "" : "s"}` },
              { label: "Target date", value: target.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) },
              ...(context.totalMeasures && context.totalMeasures > 0 ? [{ label: "Total measures", value: context.totalMeasures.toString() }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={generate.isPending}>
              Cancel
            </Button>
            <Button onClick={() => generate.mutate()} className="flex-1" disabled={generate.isPending}>
              {generate.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Generate plan
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
