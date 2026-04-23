import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { getPhaseColor } from "@/lib/palette";
import { PHASE_LABELS } from "@shared/schema";
import type { SessionSection } from "@shared/schema";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ComfortRating = "easier" | "expected" | "harder";
type CompletionRating = "done" | "partial" | "skipped";
type FlagKey =
  | "needs-daily"
  | "ready-larger-chunk"
  | "transition-issue"
  | "memory-weak"
  | "tempo-weak";

const FLAG_LABELS: Record<FlagKey, string> = {
  "needs-daily": "Needs daily reps",
  "ready-larger-chunk": "Ready for bigger chunk",
  "transition-issue": "Transition is the issue",
  "memory-weak": "Memory is weak",
  "tempo-weak": "Tempo is weak",
};

const COMFORT_OPTIONS: { value: ComfortRating; label: string }[] = [
  { value: "easier", label: "Easier" },
  { value: "expected", label: "About right" },
  { value: "harder", label: "Harder" },
];

type TaskFeedback = {
  comfort?: ComfortRating;
  flags: FlagKey[];
  flagsOpen: boolean;
};

export type Props = {
  open: boolean;
  onClose: () => void;
  lessonDayId: number;
  tasks: SessionSection[];
  onSubmitted?: () => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a task label like "Decode · bars 1–31" from a SessionSection */
function formatTaskLabel(task: SessionSection): string {
  const phase = task.phaseType
    ? (PHASE_LABELS[task.phaseType as keyof typeof PHASE_LABELS]?.label ?? task.phaseType)
    : null;

  let rangeStr: string | null = null;
  if (task.measureStart != null && task.measureEnd != null) {
    rangeStr =
      task.measureStart === task.measureEnd
        ? `bar ${task.measureStart}`
        : `bars ${task.measureStart}–${task.measureEnd}`;
  } else {
    // Try to parse from label
    const m = task.label.match(/mm\.\s*(\d+)[–\-–](\d+)/);
    if (m) rangeStr = `bars ${m[1]}–${m[2]}`;
  }

  if (phase && rangeStr) return `${phase} · ${rangeStr}`;
  if (phase) return phase;
  return task.label;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionFeedbackModal({
  open,
  onClose,
  lessonDayId,
  tasks,
  onSubmitted,
}: Props) {
  // Only show tasks that are piece_practice (not warmup) and have a phaseType
  const feedbackTasks = tasks.filter(
    (t) => t.type !== "warmup" && t.phaseType != null,
  );

  const [feedbackMap, setFeedbackMap] = useState<Record<number, TaskFeedback>>(
    () =>
      Object.fromEntries(
        feedbackTasks.map((_, i) => [
          i,
          { comfort: undefined, flags: [], flagsOpen: false },
        ]),
      ),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setComfort(idx: number, value: ComfortRating) {
    setFeedbackMap((prev) => ({
      ...prev,
      [idx]: { ...prev[idx], comfort: value },
    }));
  }

  function toggleFlag(idx: number, flag: FlagKey) {
    setFeedbackMap((prev) => {
      const current = prev[idx].flags;
      const next = current.includes(flag)
        ? current.filter((f) => f !== flag)
        : [...current, flag];
      return { ...prev, [idx]: { ...prev[idx], flags: next } };
    });
  }

  function toggleFlagsOpen(idx: number) {
    setFeedbackMap((prev) => ({
      ...prev,
      [idx]: { ...prev[idx], flagsOpen: !prev[idx].flagsOpen },
    }));
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      const taskFeedback = feedbackTasks.map((task, i) => {
        const fb = feedbackMap[i];
        return {
          passageId: task.sectionId,
          comfort: fb?.comfort,
          flags: fb?.flags.length ? fb.flags : undefined,
        };
      });

      await apiRequest("POST", `/api/lessons/${lessonDayId}/feedback`, {
        taskFeedback,
      });
    } catch {
      // Endpoint may not exist yet — still proceed
    } finally {
      setIsSubmitting(false);
      onSubmitted?.();
      onClose();
    }
  }

  function handleSkip() {
    onClose();
  }

  // Reset state when modal opens with new data
  // (controlled by parent — re-mount resets automatically, but if open flips
  //  true→false→true for the same lesson the state persists which is fine)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleSkip(); }}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              How did that go?
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">
              Quick check-in — helps us tune your next session.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Task list */}
        <div className="px-6 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {feedbackTasks.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No tasks to rate for this session.
            </p>
          )}

          {feedbackTasks.map((task, i) => {
            const fb = feedbackMap[i];
            const phaseType = task.phaseType!;
            const color = getPhaseColor(phaseType);
            const label = formatTaskLabel(task);

            return (
              <div key={i} className="space-y-2.5">
                {/* Task pill */}
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border"
                    style={{
                      borderColor: color.border,
                      backgroundColor: color.bg,
                      color: color.border,
                    }}
                  >
                    {label}
                  </span>
                </div>

                {/* Comfort chips */}
                <div className="flex items-center gap-2">
                  {COMFORT_OPTIONS.map(({ value, label: chipLabel }) => {
                    const selected = fb?.comfort === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setComfort(i, value)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                          selected
                            ? "text-white border-transparent shadow-sm"
                            : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground bg-transparent",
                        )}
                        style={
                          selected
                            ? { backgroundColor: color.border, borderColor: color.border }
                            : undefined
                        }
                      >
                        {chipLabel}
                      </button>
                    );
                  })}
                </div>

                {/* Flags — collapsed by default */}
                <div>
                  <button
                    type="button"
                    onClick={() => toggleFlagsOpen(i)}
                    className="flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                  >
                    <ChevronDown
                      className={cn(
                        "w-3 h-3 transition-transform",
                        fb?.flagsOpen && "rotate-180",
                      )}
                    />
                    {fb?.flags.length
                      ? `${fb.flags.length} flag${fb.flags.length > 1 ? "s" : ""} selected`
                      : "Add flags"}
                  </button>

                  {fb?.flagsOpen && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(Object.keys(FLAG_LABELS) as FlagKey[]).map((flag) => {
                        const active = fb.flags.includes(flag);
                        return (
                          <button
                            key={flag}
                            type="button"
                            onClick={() => toggleFlag(i, flag)}
                            className={cn(
                              "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all",
                              active
                                ? "bg-foreground text-background border-foreground"
                                : "bg-transparent border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                            )}
                          >
                            {FLAG_LABELS[flag]}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="min-w-[80px]"
          >
            {isSubmitting ? "Saving…" : "Done"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
