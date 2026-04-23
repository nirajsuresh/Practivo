import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { getSectionColor } from "@/lib/palette";

type PlanSection = {
  id: number;
  name: string;
  measureStart: number;
  measureEnd: number;
  difficulty: number;
  displayOrder: number;
};

type DifficultyAdjustment = "easier" | "right" | "harder";

const ADJUSTMENT_LABELS: Record<DifficultyAdjustment, string> = {
  easier: "Easier",
  right: "About right",
  harder: "Harder",
};

function applyAdjustment(current: number, adj: DifficultyAdjustment): number {
  if (adj === "easier") return Math.max(1, current - 1);
  if (adj === "harder") return Math.min(7, current + 1);
  return current;
}

export type RecalibratePromptProps = {
  planId: number;
  sections: PlanSection[];
  onDismiss: () => void;
};

export function RecalibratePrompt({ planId, sections, onDismiss }: RecalibratePromptProps) {
  const queryClient = useQueryClient();
  const visibleSections = [...sections]
    .filter((s) => s.id > 0)
    .sort((a, b) => a.measureStart - b.measureStart)
    .slice(0, 6); // cap at 6 to keep the card compact

  const [adjustments, setAdjustments] = useState<Record<number, DifficultyAdjustment>>(
    () => Object.fromEntries(visibleSections.map((s) => [s.id, "right" as DifficultyAdjustment])),
  );

  const recalibrate = useMutation({
    mutationFn: async () => {
      const payload = visibleSections
        .filter((s) => adjustments[s.id] !== "right")
        .map((s) => ({
          sectionId: s.id,
          newDifficulty: applyAdjustment(s.difficulty, adjustments[s.id]),
        }));
      if (payload.length === 0) {
        onDismiss();
        return;
      }
      return apiRequest("POST", `/api/learning-plans/${planId}/recalibrate`, { adjustments: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/lessons`] });
      queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/today`] });
      onDismiss();
    },
  });

  if (visibleSections.length === 0) return null;

  const hasChanges = visibleSections.some((s) => adjustments[s.id] !== "right");

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">How's the difficulty feeling?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              We'll adjust the plan to match. You can always change this later.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Per-section rows */}
      <div className="space-y-3">
        {visibleSections.map((section, i) => {
          const color = getSectionColor(i);
          const current = adjustments[section.id];
          return (
            <div key={section.id} className="flex items-center gap-3">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: color.border }}
              />
              <span className="text-xs text-foreground/80 flex-1 truncate min-w-0">
                {section.name}
                <span className="text-muted-foreground/60 ml-1">
                  mm.{section.measureStart}–{section.measureEnd}
                </span>
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {(["easier", "right", "harder"] as DifficultyAdjustment[]).map((adj) => (
                  <button
                    key={adj}
                    type="button"
                    onClick={() => setAdjustments((prev) => ({ ...prev, [section.id]: adj }))}
                    className={cn(
                      "px-2 py-1 rounded text-[11px] font-medium border transition-all",
                      current === adj
                        ? "bg-foreground text-background border-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground bg-transparent",
                    )}
                  >
                    {ADJUSTMENT_LABELS[adj]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
        <Button
          size="sm"
          onClick={() => recalibrate.mutate()}
          disabled={recalibrate.isPending}
          className={cn(!hasChanges && "opacity-50")}
        >
          {recalibrate.isPending ? "Updating…" : hasChanges ? "Recalibrate" : "Looks good"}
        </Button>
      </div>
    </div>
  );
}
