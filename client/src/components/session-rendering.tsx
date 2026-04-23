// Shared rendering primitives for session-page.tsx and practice-page.tsx.
// Contains SegmentCard, PlaceholderPanel, and all associated helpers.

import { useMemo, useState } from "react";
import {
  Check,
  Flag,
  Mic,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getPhaseColor } from "@/lib/palette";
import { PHASE_LABELS, type PhaseType, type SessionSection } from "@shared/schema";
import {
  ScoreStepView,
  parseLabelRange,
  type MeasureRow,
  type BarColorFn,
  type BarAnnotation,
} from "@/components/session-score-view";
import { useCountdown, useMetronome, formatClock } from "@/hooks/use-session-tools";

// Re-export types so callers don't need to import from two places.
export type { MeasureRow, BarColorFn, BarAnnotation };

// ── Helpers ───────────────────────────────────────────────────────────────────

const NEUTRAL = { border: "#8A877F", bg: "rgba(138,135,127,0.10)" };

export function buildBarColorFn(phaseType: string | null): BarColorFn {
  return () => (phaseType ? getPhaseColor(phaseType) : NEUTRAL);
}

export function segmentAccent(
  section: SessionSection | undefined,
  effectivePhase: string | null,
): { ink: string; chip: string; chipBg: string } {
  if (!section) return { ink: "#0f2036", chip: "#7a5f2b", chipBg: "rgba(201,168,106,0.22)" };
  const phase = section.phaseType ?? effectivePhase;
  if (phase) {
    const c = getPhaseColor(phase);
    return { ink: "#0f2036", chip: c.border, chipBg: c.bg };
  }
  if (section.type === "warmup") return { ink: "#0f2036", chip: "#96793a", chipBg: "rgba(201,168,106,0.18)" };
  if (section.type === "sight_reading") return { ink: "#0f2036", chip: "#7a5f2b", chipBg: "rgba(201,168,106,0.25)" };
  return { ink: "#0f2036", chip: "#7a5f2b", chipBg: "rgba(201,168,106,0.22)" };
}

export function segmentKind(type: string): "warmup" | "piece" | "sight" | "other" {
  if (type === "warmup") return "warmup";
  if (type === "sight_reading") return "sight";
  if (type === "piece_practice") return "piece";
  return "other";
}

export function labelForSegment(section: SessionSection): string {
  const kind = segmentKind(section.type);
  if (kind === "warmup") return "Warm-up";
  if (kind === "sight") return "Sight-reading";
  if (kind === "piece") return "Piece practice";
  return section.label?.split(" — ")[0] || "Practice";
}

export function formatSessionDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ── SegmentCard ───────────────────────────────────────────────────────────────

export type SegmentCardProps = {
  index: number;
  section: SessionSection;
  registerEl: (idx: number, el: HTMLElement | null) => void;
  effectivePhaseType: string | null;
  allMeasures: MeasureRow[];
  sheetId: number | null;
  flaggedBars: Map<number, number>;
  onToggleFlag: (measureId: number, flagId: number | undefined) => void;
  annotations: BarAnnotation[];
  onAddAnnotation: (measureStart: number, measureEnd: number) => void;
  onAnnotationClick: (annotation: BarAnnotation) => void;
  onToggleTask: (sectionIdx: number, taskIdx: number) => void;
  isLastSegment: boolean;
  onComplete: () => void;
  completePending: boolean;
  isDone: boolean;
  isBlockStart?: boolean;
};

export function SegmentCard({
  index,
  section,
  registerEl,
  effectivePhaseType,
  allMeasures,
  sheetId,
  flaggedBars,
  onToggleFlag,
  annotations,
  onAddAnnotation,
  onAnnotationClick,
  onToggleTask,
  isLastSegment,
  onComplete,
  completePending,
  isDone,
  isBlockStart = true,
}: SegmentCardProps) {
  const { toast } = useToast();
  const phaseType = section.phaseType ?? effectivePhaseType;
  const accent = segmentAccent(section, effectivePhaseType);
  const kind = segmentKind(section.type);
  const phaseInfo = phaseType ? PHASE_LABELS[phaseType as PhaseType] : null;

  const durationSec = Math.max(60, Math.round((section.durationMin ?? 5) * 60));
  const countdown = useCountdown(durationSec);
  const metronome = useMetronome(60);

  const [focusedBarIdx, setFocusedBarIdx] = useState<number | null>(null);

  const range = useMemo(() => {
    if (section.measureStart != null && section.measureEnd != null) {
      return { start: section.measureStart, end: section.measureEnd };
    }
    return parseLabelRange(section.label);
  }, [section]);

  const hasScore = (kind === "piece" || kind === "sight" || phaseType != null) && range != null;

  const bars = useMemo(() => {
    if (!hasScore || !range) return [];
    return allMeasures.filter(
      (m) =>
        m.measureNumber >= range.start &&
        m.measureNumber <= range.end &&
        m.boundingBox != null &&
        m.pageNumber != null,
    );
  }, [allMeasures, hasScore, range]);

  const contextBars = useMemo(() => {
    if (!hasScore || !range) return [];
    const pageNums = new Set(bars.map((b) => b.pageNumber!));
    return allMeasures.filter(
      (m) =>
        m.pageNumber != null &&
        m.boundingBox != null &&
        pageNums.has(m.pageNumber!) &&
        (m.measureNumber < range.start || m.measureNumber > range.end),
    );
  }, [allMeasures, bars, hasScore, range]);

  const getBarColor = buildBarColorFn(phaseType);
  const barTooltip = phaseInfo ? `${phaseInfo.label} — ${phaseInfo.description}` : null;

  const totalTasks = section.tasks.length;
  const doneTasks = section.tasks.filter((t) => t.completed).length;
  const progressPct = durationSec > 0 ? (1 - countdown.remaining / durationSec) * 100 : 0;

  return (
    <section
      ref={(el) => registerEl(index, el)}
      data-segment-idx={index}
      className={isBlockStart ? "snap-start relative" : "relative"}
      style={{
        minHeight: "calc(100dvh - 48px - 88px)",
        scrollSnapAlign: isBlockStart ? "start" : "none",
        scrollSnapStop: isBlockStart ? "always" : "normal",
        background: "#f5f1ea",
        borderBottom: "1px solid #ddd8cc",
        padding: "28px 24px 40px",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        {/* ── Header row ─── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: accent.chip,
                  background: accent.chipBg,
                  padding: "4px 10px",
                  borderRadius: 999,
                }}
              >
                {`${String(index + 1).padStart(2, "0")} · ${labelForSegment(section)}`}
              </span>
              {section.durationMin != null && (
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#7a7166" }}>
                  {section.durationMin} min
                </span>
              )}
              {phaseInfo && (
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    color: "#7a7166",
                    border: "1px solid #ddd8cc",
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                  title={phaseInfo.description}
                >
                  {phaseInfo.label}
                </span>
              )}
            </div>
            <h2
              style={{
                fontFamily: '"Cormorant Garamond", serif',
                fontWeight: 400,
                fontSize: "clamp(28px, 3.6vw, 40px)",
                lineHeight: 1.1,
                color: "#0f2036",
                letterSpacing: "-0.01em",
                marginBottom: 4,
              }}
            >
              {section.label}
            </h2>
            {range && hasScore && (
              <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "#7a7166" }}>
                mm. {range.start}–{range.end}
              </p>
            )}
          </div>

          {/* Right cluster: timer */}
          <div
            style={{
              flexShrink: 0,
              background: "#fffbf2",
              border: "1px solid #ddd8cc",
              borderRadius: 14,
              padding: "12px 16px",
              minWidth: 180,
              textAlign: "center",
            }}
          >
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#7a7166", marginBottom: 4 }}>
              Countdown
            </div>
            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 34,
                fontWeight: 500,
                color: countdown.finished ? "#96793a" : "#0f2036",
                lineHeight: 1,
                letterSpacing: "-0.02em",
              }}
            >
              {formatClock(countdown.remaining)}
            </div>
            <div style={{ marginTop: 8, height: 3, background: "#ddd8cc", borderRadius: 99, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  background: accent.chip,
                  width: `${Math.min(100, progressPct)}%`,
                  transition: "width 1s linear",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 10 }}>
              {!countdown.running ? (
                <button
                  type="button"
                  onClick={countdown.start}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "#f5f1ea", background: "#0f2036", borderRadius: 6, padding: "6px 12px", border: "none", cursor: "pointer" }}
                >
                  <Play style={{ width: 10, height: 10 }} />
                  {countdown.remaining === durationSec ? "Start" : countdown.finished ? "Restart" : "Resume"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={countdown.pause}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "#0f2036", background: "#ede8df", borderRadius: 6, padding: "6px 12px", border: "1px solid #ddd8cc", cursor: "pointer" }}
                >
                  <Pause style={{ width: 10, height: 10 }} />
                  Pause
                </button>
              )}
              <button
                type="button"
                onClick={countdown.reset}
                title="Reset timer"
                style={{ color: "#7a7166", background: "transparent", borderRadius: 6, padding: "6px 8px", border: "1px solid #ddd8cc", cursor: "pointer", display: "inline-flex", alignItems: "center" }}
              >
                <RotateCcw style={{ width: 12, height: 12 }} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ─── */}
        <div style={{ display: "grid", gridTemplateColumns: hasScore ? "minmax(0, 1.7fr) minmax(280px, 1fr)" : "minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
          {/* Left: score or placeholder */}
          <div style={{ minWidth: 0 }}>
            {hasScore && bars.length > 0 ? (
              <>
                <ScoreStepView
                  bars={bars}
                  allBarsForIndex={bars}
                  contextBars={contextBars}
                  sheetId={sheetId}
                  focusedBarIdx={focusedBarIdx}
                  onFocusBar={setFocusedBarIdx}
                  flaggedBars={flaggedBars}
                  onToggleFlag={onToggleFlag}
                  getBarColor={getBarColor}
                  barTooltip={barTooltip}
                  annotations={annotations}
                  onAddAnnotation={onAddAnnotation}
                  onAnnotationClick={onAnnotationClick}
                />
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "rgba(122,113,102,0.8)", marginTop: 8 }}>
                  Click-drag a range to annotate · double-click a bar to zoom · drag the corner to resize.
                </p>
              </>
            ) : hasScore ? (
              <div
                style={{
                  background: "#fffbf2",
                  border: "1px dashed #ddd8cc",
                  borderRadius: 12,
                  padding: "40px 24px",
                  textAlign: "center",
                  color: "#7a7166",
                  fontFamily: "Inter, sans-serif",
                  fontSize: 13,
                }}
              >
                Score not yet processed for this section.
              </div>
            ) : (
              <PlaceholderPanel kind={kind} section={section} accent={accent.chip} />
            )}
          </div>

          {/* Right: checklist + tools */}
          <div
            style={{
              background: "#fffbf2",
              border: "1px solid #ddd8cc",
              borderRadius: 14,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {/* Metronome */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#7a7166" }}>
                  Metronome
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: metronome.running && metronome.beat === i ? (i === 0 ? accent.chip : "#0f2036") : "#ddd8cc",
                        transition: "background 0.05s",
                      }}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => metronome.setBpm(Math.max(30, metronome.bpm - 5))}
                  style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #ddd8cc", background: "#f5f1ea", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                  title="−5 BPM"
                >
                  <Minus style={{ width: 12, height: 12, color: "#7a7166" }} />
                </button>
                <input
                  type="number"
                  min={30}
                  max={240}
                  value={metronome.bpm}
                  onChange={(e) => metronome.setBpm(Math.max(30, Math.min(240, parseInt(e.target.value || "60", 10))))}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 22,
                    fontWeight: 500,
                    color: "#0f2036",
                    background: "#f5f1ea",
                    border: "1px solid #ddd8cc",
                    borderRadius: 6,
                    padding: "4px 0",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => metronome.setBpm(Math.min(240, metronome.bpm + 5))}
                  style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #ddd8cc", background: "#f5f1ea", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                  title="+5 BPM"
                >
                  <Plus style={{ width: 12, height: 12, color: "#7a7166" }} />
                </button>
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
                <button
                  type="button"
                  onClick={metronome.running ? metronome.stop : metronome.start}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{
                    color: metronome.running ? "#0f2036" : "#f5f1ea",
                    background: metronome.running ? "#ede8df" : "#0f2036",
                    border: metronome.running ? "1px solid #ddd8cc" : "none",
                    borderRadius: 6,
                    padding: "7px 16px",
                    cursor: "pointer",
                  }}
                >
                  {metronome.running ? <Pause style={{ width: 10, height: 10 }} /> : <Play style={{ width: 10, height: 10 }} />}
                  {metronome.running ? "Stop" : "Tick"}
                </button>
              </div>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 10, color: "rgba(122,113,102,0.7)", textAlign: "center", marginTop: 6 }}>
                4/4 · accent on beat 1
              </p>
            </div>

            <div style={{ height: 1, background: "#ddd8cc" }} />

            {/* Checklist */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#7a7166" }}>
                  Checklist
                </span>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#7a7166" }}>
                  {doneTasks}/{totalTasks}
                </span>
              </div>
              <ul style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
                {section.tasks.map((task, tIdx) => {
                  const checked = !!task.completed;
                  return (
                    <li key={tIdx}>
                      <button
                        type="button"
                        onClick={() => { if (!isDone) onToggleTask(index, tIdx); }}
                        disabled={isDone}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid " + (checked ? "rgba(114,158,143,0.35)" : "#ddd8cc"),
                          background: checked ? "rgba(114,158,143,0.10)" : "#f5f1ea",
                          cursor: isDone ? "default" : "pointer",
                          transition: "all 0.1s",
                        }}
                      >
                        <div
                          style={{
                            flexShrink: 0,
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            border: checked ? "none" : "1.5px solid #ddd8cc",
                            background: checked ? "#729E8F" : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginTop: 2,
                          }}
                        >
                          {checked && <Check style={{ width: 11, height: 11, color: "#fff" }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontFamily: "Inter, sans-serif",
                              fontSize: 13,
                              lineHeight: 1.4,
                              color: checked ? "#7a7166" : "#0f2036",
                              textDecoration: checked ? "line-through" : "none",
                            }}
                          >
                            {task.text}
                          </div>
                          {(task.tempoBpm || task.durationMin || task.measureStart != null) && (
                            <div style={{ marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {task.durationMin != null && (
                                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#7a7166" }}>
                                  {task.durationMin}m
                                </span>
                              )}
                              {task.tempoBpm != null && (
                                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#7a7166" }}>
                                  ♩ {task.tempoBpm}
                                </span>
                              )}
                              {task.measureStart != null && task.measureEnd != null && (
                                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "#7a7166" }}>
                                  mm.{task.measureStart}–{task.measureEnd}
                                </span>
                              )}
                            </div>
                          )}
                          {task.rationale && (
                            <div style={{ fontFamily: '"EB Garamond", serif', fontStyle: "italic", fontSize: 12, color: "#7a7166", marginTop: 3 }}>
                              {task.rationale}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
                {section.tasks.length === 0 && (
                  <li style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#7a7166", fontStyle: "italic", padding: "8px 4px" }}>
                    No tasks assigned for this segment.
                  </li>
                )}
              </ul>
            </div>

            <div style={{ height: 1, background: "#ddd8cc" }} />

            {/* Flag + record */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => toast({ title: "Flag tricky bars on the score", description: "Hover a bar and click the flag icon to mark it." })}
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  fontFamily: "Inter, sans-serif",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#7a7166",
                  background: "#f5f1ea",
                  border: "1px solid #ddd8cc",
                  borderRadius: 6,
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                <Flag style={{ width: 12, height: 12 }} />
                Flag
              </button>
              <button
                type="button"
                onClick={() => toast({ title: "Recording coming soon", description: "Practice recordings are in the works." })}
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  fontFamily: "Inter, sans-serif",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#7a7166",
                  background: "#f5f1ea",
                  border: "1px solid #ddd8cc",
                  borderRadius: 6,
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                <Mic style={{ width: 12, height: 12 }} />
                Record
              </button>
            </div>

            {isLastSegment && (
              <button
                type="button"
                onClick={onComplete}
                disabled={completePending || isDone}
                style={{
                  width: "100%",
                  padding: "12px 0",
                  borderRadius: 8,
                  background: isDone ? "#ede8df" : "#0f2036",
                  color: isDone ? "#7a7166" : "#c9a86a",
                  fontFamily: "Inter, sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  border: "none",
                  cursor: (completePending || isDone) ? "default" : "pointer",
                  opacity: completePending ? 0.6 : 1,
                }}
              >
                {isDone ? "Session complete ✓" : completePending ? "Saving…" : "Mark session complete →"}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── PlaceholderPanel ──────────────────────────────────────────────────────────

export function PlaceholderPanel({
  kind,
  section,
  accent,
}: {
  kind: "warmup" | "piece" | "sight" | "other";
  section: SessionSection;
  accent: string;
}) {
  const copy =
    kind === "warmup"
      ? "Loosen the hands, settle the breath. Scales, Hanon, or anything that brings the body back online."
      : kind === "sight"
        ? "Read something new at a comfortable tempo. Eyes ahead, don't stop for mistakes."
        : "Focus block. Work steady and slow.";
  return (
    <div
      style={{
        background: "#fffbf2",
        border: "1px solid #ddd8cc",
        borderRadius: 14,
        padding: "40px 32px",
        minHeight: 320,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: accent, marginBottom: 10 }}>
        {kind === "warmup" ? "Warm-up" : kind === "sight" ? "Sight-reading" : "Practice"}
      </div>
      <h3
        style={{
          fontFamily: '"Cormorant Garamond", serif',
          fontWeight: 400,
          fontStyle: "italic",
          fontSize: "clamp(22px, 2.6vw, 30px)",
          color: "#0f2036",
          lineHeight: 1.2,
          marginBottom: 12,
          maxWidth: 560,
        }}
      >
        {copy}
      </h3>
      <p style={{ fontFamily: '"EB Garamond", serif', fontSize: 15, color: "#7a7166", lineHeight: 1.5, maxWidth: 560 }}>
        Check off each task on the right as you work through this segment. The countdown keeps you honest about time.
      </p>
      {/* Keep section in scope to suppress lint warning */}
      <span style={{ display: "none" }}>{section.label}</span>
    </div>
  );
}
