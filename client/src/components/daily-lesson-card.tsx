import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, ChevronRight, Music2, Flame, CalendarDays,
  BookOpen, ChevronDown, ChevronUp, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getStatusColor } from "@/lib/status-colors";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LessonDay {
  id: number;
  learningPlanId: number;
  scheduledDate: string;
  measureStart: number;
  measureEnd: number;
  status: "pending" | "completed" | "skipped";
  userNotes: string | null;
  completedAt: string | null;
}

interface LearningPlan {
  id: number;
  repertoireEntryId: number;
  dailyPracticeMinutes: number;
  targetCompletionDate: string;
  totalMeasures: number;
  status: "active" | "completed" | "paused";
}

interface PlanProgress {
  learnedMeasures: number;
  totalMeasures: number;
  completedLessons: number;
  totalLessons: number;
  streakDays: number;
}

// ─── Today's lesson card ──────────────────────────────────────────────────────

interface DailyLessonCardProps {
  planId: number;
  pieceTitle: string;
  composerName: string;
  pieceId: number;
  userId: string;
  /** Called when user marks lesson done — parent can re-query milestones etc */
  onLessonComplete?: () => void;
}

export function DailyLessonCard({
  planId, pieceTitle, composerName, pieceId, userId, onLessonComplete,
}: DailyLessonCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState("");

  const { data: today, isLoading: loadingToday } = useQuery<LessonDay | null>({
    queryKey: [`/api/learning-plans/${planId}/today`],
    staleTime: 30_000,
  });

  const { data: plan } = useQuery<LearningPlan>({
    queryKey: [`/api/learning-plans/${planId}`],
    staleTime: 60_000,
  });

  const { data: progress } = useQuery<PlanProgress>({
    queryKey: [`/api/learning-plans/${planId}/progress`],
    staleTime: 30_000,
  });

  const completeLesson = useMutation({
    mutationFn: async () => {
      if (!today) return;
      await apiRequest("PATCH", `/api/lessons/${today.id}`, {
        status: "completed",
        userNotes: notes || undefined,
      });
      // Mark each measure in range as learned
      if (plan && today.measureStart && today.measureEnd) {
        const ids: number[] = [];
        for (let n = today.measureStart; n <= today.measureEnd; n++) ids.push(n);
        await Promise.all(ids.map(measureNumber =>
          apiRequest("PUT", `/api/learning-plans/${planId}/progress/${measureNumber}`, {
            status: "learned",
          })
        ));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/today`] });
      queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/progress`] });
      toast({ title: "Lesson complete!", description: "Great practice session." });
      onLessonComplete?.();
    },
    onError: () => {
      toast({ title: "Couldn't save progress", variant: "destructive" });
    },
  });

  if (loadingToday) {
    return (
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-8 w-24" />
      </div>
    );
  }

  const pct = progress && progress.totalMeasures > 0
    ? Math.round((progress.learnedMeasures / progress.totalMeasures) * 100)
    : 0;

  const targetStr = plan?.targetCompletionDate
    ? new Date(plan.targetCompletionDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const measureCount = today ? today.measureEnd - today.measureStart + 1 : 0;

  return (
    <div className={cn(
      "rounded-xl border bg-card overflow-hidden transition-shadow",
      today?.status === "completed" ? "opacity-75" : "shadow-sm",
    )}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
              Today's lesson
            </p>
            <p className="font-semibold text-sm truncate">{pieceTitle}</p>
            <p className="text-xs text-muted-foreground">{composerName}</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {(progress?.streakDays ?? 0) > 0 && (
              <div className="flex items-center gap-1 text-orange-500">
                <Flame className="w-4 h-4" />
                <span className="text-xs font-bold">{progress!.streakDays}</span>
              </div>
            )}
            {today?.status === "completed" && (
              <CheckCircle2 className="w-4 h-4 text-primary" />
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-3 space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{progress?.learnedMeasures ?? 0} / {progress?.totalMeasures ?? "—"} measures learned</span>
          <span>{pct}%</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>

      {/* Today's assignment */}
      {today && today.status !== "completed" ? (
        <div className="px-4 pb-4 space-y-3">
          <div className="rounded-lg bg-muted/40 px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">
                {today.measureStart === today.measureEnd
                  ? `Bar ${today.measureStart}`
                  : `Bars ${today.measureStart}–${today.measureEnd}`}
              </span>
              <span className="text-xs text-muted-foreground">({measureCount} bar{measureCount !== 1 ? "s" : ""})</span>
            </div>
            {plan && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Music2 className="w-3 h-3" />
                {plan.dailyPracticeMinutes} min
              </span>
            )}
          </div>

          {/* Notes toggle */}
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded(e => !e)}
          >
            Add notes
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {expanded && (
            <textarea
              className="w-full text-sm rounded-md border bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              rows={2}
              placeholder="How did practice go? Which bars need more work?"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          )}

          <Button
            className="w-full gap-2"
            onClick={() => completeLesson.mutate()}
            disabled={completeLesson.isPending}
          >
            {completeLesson.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
              : <><CheckCircle2 className="w-4 h-4" />Mark as done</>
            }
          </Button>
        </div>
      ) : today?.status === "completed" ? (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 text-sm text-primary font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Done for today — come back tomorrow!
          </div>
        </div>
      ) : (
        <div className="px-4 pb-4 text-sm text-muted-foreground">
          No lesson scheduled today.
        </div>
      )}

      {/* Footer: target date */}
      {targetStr && (
        <div className="border-t px-4 py-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="w-3.5 h-3.5" />
          Target: {targetStr}
          {progress && progress.completedLessons > 0 && (
            <span className="ml-auto">{progress.completedLessons}/{progress.totalLessons} lessons done</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Compact button to start a plan (used in piece cards) ──────────────────

interface StartPlanButtonProps {
  repertoireEntryId: number;
  pieceTitle: string;
  userId: string;
  onClick: () => void;
}

export function StartPlanButton({ repertoireEntryId, pieceTitle, userId, onClick }: StartPlanButtonProps) {
  const { data: plan } = useQuery<LearningPlan | null>({
    queryKey: [`/api/learning-plans/entry/${repertoireEntryId}`],
    staleTime: 60_000,
  });

  if (plan) {
    return (
      <Badge
        variant="outline"
        className="cursor-pointer hover:bg-primary/5 transition-colors text-xs font-medium gap-1"
        onClick={onClick}
      >
        <BookOpen className="w-3 h-3" />
        View plan
        <ChevronRight className="w-3 h-3" />
      </Badge>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
      onClick={onClick}
    >
      <CalendarDays className="w-3.5 h-3.5" />
      Start learning plan
    </Button>
  );
}
