import type { PieceSetupState } from "@/components/piece-setup-flows";
import { Check, ChevronRight, Circle } from "lucide-react";

const NAVY = "#0f2036";
const GOLD_DARK = "#96793a";
const MUTED = "#7a7166";
const CREAM_DEEP = "#ede8df";

export type ChecklistStep = "score" | "bars" | "sections" | "generate";

const STEP_LABELS: Record<ChecklistStep, string> = {
  score: "Select score",
  bars: "Detect bars",
  sections: "Mark sections",
  generate: "Generate learning plan",
};

const STEP_ORDER: ChecklistStep[] = ["score", "bars", "sections", "generate"];

/** Derive per-step status from setupState + sectionsSkipped. */
function stepStatus(
  step: ChecklistStep,
  setupState: PieceSetupState,
  sectionsSkipped: boolean,
): "done" | "current" | "locked" {
  switch (setupState) {
    case "needs_score":
      return step === "score" ? "current" : "locked";
    case "needs_bars":
      if (step === "score") return "done";
      if (step === "bars") return "current";
      return "locked";
    case "needs_sections":
      if (step === "score" || step === "bars") return "done";
      if (step === "sections") return "current";
      return "locked";
    case "needs_generation":
      if (step === "generate") return "current";
      return "done";
    case "complete":
      if (step === "sections" && sectionsSkipped) return "done"; // still marked done if skipped
      return "done";
  }
}

export function PieceSetupChecklist({
  setupState,
  sectionsSkipped,
  onStepClick,
}: {
  setupState: PieceSetupState;
  sectionsSkipped: boolean;
  onStepClick: (step: ChecklistStep) => void;
}) {
  const doneCount = STEP_ORDER.filter(
    (s) => stepStatus(s, setupState, sectionsSkipped) === "done",
  ).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
      <div style={{
        fontSize: 10,
        color: MUTED,
        fontWeight: 500,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        marginBottom: 4,
      }}>
        Setup · {doneCount} of {STEP_ORDER.length}
      </div>
      {STEP_ORDER.map((step) => {
        const status = stepStatus(step, setupState, sectionsSkipped);
        const isCurrent = status === "current";
        const isDone = status === "done";
        const isLocked = status === "locked";
        return (
          <button
            key={step}
            type="button"
            disabled={isLocked}
            onClick={() => onStepClick(step)}
            title={isDone ? "Redo this step" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 6,
              border: isCurrent ? `1px solid ${GOLD_DARK}` : "1px solid transparent",
              background: isCurrent ? "rgba(201,168,106,0.08)" : isDone ? CREAM_DEEP : "transparent",
              cursor: isLocked ? "default" : "pointer",
              textAlign: "left",
              opacity: isLocked ? 0.45 : 1,
              transition: "background 0.12s",
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              color: isDone ? MUTED : NAVY,
            }}
          >
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: isDone ? GOLD_DARK : isCurrent ? "#fff" : "transparent",
              border: isCurrent ? `1.5px solid ${GOLD_DARK}` : isDone ? "none" : `1.5px solid ${MUTED}`,
              color: isDone ? "#fff" : GOLD_DARK,
              flexShrink: 0,
            }}>
              {isDone ? <Check size={11} strokeWidth={3} /> : <Circle size={6} fill="currentColor" />}
            </span>
            <span style={{ flex: 1 }}>{STEP_LABELS[step]}</span>
            {!isLocked && (
              <ChevronRight size={14} style={{ color: MUTED, flexShrink: 0, opacity: isDone ? 0.5 : 1 }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
