// Lesson scheduler v2 — passage-state-machine model.
//
// Instead of marching all bars through phases in lockstep, this scheduler
// treats each passage (a fine-grained 4–16 bar unit) as an independent state
// machine with its own phase, maturity, and spaced-repetition schedule. Each
// daily session is composed from the pool of active passages based on their
// current state: new material to introduce, struggling material to grind on,
// due-for-review material to touch briefly, and run-throughs to consolidate.
//
// This file is organized in sections:
//   1. Types + constants
//   2. FSRS-style spaced repetition math (pure)
//   3. Passage segmentation (sections → passages, pure)
//   4. Session composition (state → tasks, pure)
//   5. Feasibility check (pure — no DB I/O)
//   6. Orchestration (DB I/O — generatePlanV2, replanUpcomingSessions)

import type {
  ChallengeTag,
  InsertLessonDay,
  InsertPassage,
  InsertPassageProgress,
  LearningPlan,
  LessonDay,
  Passage,
  PassageProgress,
  PhaseType,
  PlanSection,
  PlayingLevel,
  SessionSection,
  SessionTask,
  TaskRole,
} from "@shared/schema";
import {
  CHUNK_SIZE_BY_LEVEL,
  DIFFICULTY_MULTIPLIER,
  INITIAL_SR_STABILITY,
  LEVEL_MULTIPLIER,
  PHASE_REVIEW_INTERVAL_DAYS,
  PHASE_TYPES,
} from "@shared/schema";
import {
  buildPassageTask,
  buildRunthroughTask,
  buildTransitionTask,
  defaultWarmupsForInstrument,
  selectModalitiesForPassage,
} from "./modality-library";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Types + constants
// ─────────────────────────────────────────────────────────────────────────────

/** Self-rating bucket, 1 = again, 2 = hard, 3 = good, 4 = easy. FSRS tradition. */
export type ReviewRating = 1 | 2 | 3 | 4;

/** Default target passage size in bars, by difficulty × playingLevel.
 * Harder passages get smaller chunks. Gap sections (sectionId <= 0 sentinel,
 * meaning "unmarked bars") get much larger chunks — they're bridge material,
 * not deep-work zones, and fragmenting them balloons the required workload
 * past what a month-horizon plan can actually deliver. */
function targetPassageBarCount(difficulty: number, sectionId: number, level: PlayingLevel): number {
  if (sectionId <= 0) {
    return level === "advanced" ? 16 : level === "intermediate" ? 12 : 10;
  }
  const base = CHUNK_SIZE_BY_LEVEL[level] ?? 4;
  // Map section difficulty (1–7) to a multiplier. Harder → smaller passages.
  const diffAdj = difficulty >= 6 ? -2 : difficulty >= 4 ? -1 : difficulty <= 2 ? 2 : 0;
  return Math.max(3, base + diffAdj);
}

// Fraction of daily practice spent on warmups.
const WARMUP_ALLOCATION = 0.15;

/** Relative time each phase deserves in a passage's pipeline.
 *
 * Pedagogy: brief orient to read, longer decode to learn the notes,
 * substantial chunk/coordinate time for deep work on hard passages, link time
 * to connect sections, then stabilize + shape for full-piece polish. Each
 * passage ages through its required phases at a rate proportional to these
 * weights × its required-touches for that phase (per PHASE_TOUCHES_BY_BUCKET).
 */
const CURRICULUM_WEIGHTS: Record<PhaseType, number> = {
  decode: 2,
  build: 3,
  connect: 1.5,
  shape: 1.5,
  perform: 1.5,
};

// Minimum minutes per task block — keep chunks meaningful, not 2-minute slivers.
const MIN_TASK_MINUTES = 5;

// Minimum minutes per session section. Below this, skip the section entirely
// rather than force a tiny block into the plan.
const MIN_SECTION_MINUTES = 5;

// Flag threshold — above this many flags in a single session, the passage is
// considered to have regressed and its phase may be demoted.
const REGRESSION_FLAG_THRESHOLD = 3;

// Phase advancement — a passage advances after this many clean touches in a phase
// when in REACTIVE mode (applySessionOutcome). For projected simulation we use
// PHASE_TOUCHES_BY_BUCKET to vary required touches per difficulty.
const PHASE_TOUCHES_TO_ADVANCE = 3;

// Default plan horizon if the plan has no targetCompletionDate.
const DEFAULT_HORIZON_DAYS = 30;
const MAX_HORIZON_DAYS = 180;

// ─────────────────────────────────────────────────────────────────────────────
// Phase allocation per difficulty bucket.
// Easy passages skip some pedagogical phases; hard passages get extra touches
// where deep work is most valuable (chunk/coordinate/link).
// ─────────────────────────────────────────────────────────────────────────────

type DifficultyBucket = "gap" | "easy" | "medium" | "hard";

/** Bucket a passage by difficulty AND origin. Passages from synthesized "gap"
 * sections (unmarked bars, sectionId=null) get the lightweight "gap" workflow
 * regardless of their numeric difficulty — they're bridge/sight-readable
 * material, not deep-work zones. */
function difficultyBucket(difficulty: number, sectionId: number | null): DifficultyBucket {
  if (sectionId === null) return "gap";
  if (difficulty <= 3) return "easy";
  if (difficulty <= 7) return "medium";
  return "hard";
}

/** Required phase touches per bucket. Sum per row = sessions to retire a passage.
 *  - Gap (unmarked bars): 3 sessions — skim, get up to tempo, polish.
 *  - Easy (marked 1-3):   4 sessions — skip orient/coordinate/link.
 *  - Medium (marked 4-5): 7 sessions — one per phase.
 *  - Hard (marked 6-7):   9 sessions — extra chunk/coordinate.
 */
const PHASE_TOUCHES_BY_BUCKET: Record<DifficultyBucket, Record<PhaseType, number>> = {
  gap:    { decode: 1, build: 0, connect: 0, shape: 1, perform: 1 },
  easy:   { decode: 1, build: 1, connect: 0, shape: 1, perform: 1 },
  medium: { decode: 2, build: 2, connect: 1, shape: 1, perform: 1 },
  hard:   { decode: 2, build: 4, connect: 1, shape: 1, perform: 1 },
};

function requiredTouchesForPhase(difficulty: number, sectionId: number | null, phase: PhaseType): number {
  return PHASE_TOUCHES_BY_BUCKET[difficultyBucket(difficulty, sectionId)][phase];
}

function totalRequiredTouches(difficulty: number, sectionId: number | null): number {
  const bucket = PHASE_TOUCHES_BY_BUCKET[difficultyBucket(difficulty, sectionId)];
  return Object.values(bucket).reduce((sum, n) => sum + n, 0);
}

/** Given a phase, skip forward past any phases this bucket doesn't need. */
function nextRequiredPhase(phase: PhaseType, difficulty: number, sectionId: number | null): PhaseType {
  let p = phase;
  while (requiredTouchesForPhase(difficulty, sectionId, p) === 0) {
    const nxt = advancePhase(p);
    if (nxt === p) return p;
    p = nxt;
  }
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. FSRS-style spaced repetition (pure)
// ─────────────────────────────────────────────────────────────────────────────
// A simplified FSRS model: we track stability (days until retention drops to
// ~0.9) and difficulty (1–10, how inherently hard this is for this musician).
// On each review, stability grows (good ratings grow it more) and difficulty
// drifts toward the observed struggle level.

export function updateStability(
  oldStability: number,
  oldDifficulty: number,
  rating: ReviewRating,
  elapsedDays: number,
): number {
  // Forgetting-curve retrievability at review time.
  const retrievability = Math.pow(0.9, elapsedDays / Math.max(0.5, oldStability));
  // Ratings map to stability-growth factors. Easier recall → stability grows more.
  const baseGrowth =
    rating === 4 ? 2.5 :
    rating === 3 ? 1.7 :
    rating === 2 ? 1.15 :
    0.5; // rating 1 (again) → stability shrinks
  // Harder cards grow slower; lower retrievability (= longer gap since last review) grows more.
  const difficultyPenalty = 1 - (oldDifficulty - 5) * 0.05; // D=5 neutral, D=10 → 0.75x, D=1 → 1.2x
  const recencyBoost = 1 + (1 - retrievability) * 0.5;
  let next = oldStability * baseGrowth * difficultyPenalty * recencyBoost;
  if (rating === 1) next = Math.max(0.5, oldStability * 0.5);
  return clamp(next, 0.5, 365);
}

export function updateDifficulty(oldDifficulty: number, rating: ReviewRating): number {
  // Pull difficulty toward observed struggle. Rating 1 = hard (raise D), 4 = easy (lower D).
  const target =
    rating === 4 ? 3 :
    rating === 3 ? 5 :
    rating === 2 ? 7 :
    9;
  const next = oldDifficulty + (target - oldDifficulty) * 0.2; // slow drift
  return clamp(next, 1, 10);
}

export function computeRetrievability(stability: number, elapsedDays: number): number {
  if (stability <= 0) return 0;
  return Math.pow(0.9, elapsedDays / stability);
}

/** Compute next-due date = lastReviewed + stability days. */
export function computeNextDueDate(lastReviewedISO: string, stabilityDays: number): string {
  const d = new Date(lastReviewedISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Math.round(stabilityDays));
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Passage segmentation (sections → passages)
// ─────────────────────────────────────────────────────────────────────────────

export type SectionInput = Pick<PlanSection, "id" | "name" | "measureStart" | "measureEnd" | "difficulty" | "ignored" | "displayOrder">;

/** Default difficulty for bars the user didn't explicitly mark. Mid-scale: the
 * user's marked sections modulate attention up or down from this baseline. */
const DEFAULT_UNMARKED_DIFFICULTY = 4;

/** Build a complete section list covering every bar of the piece. User-marked
 * sections (minus explicitly-ignored ones) are kept verbatim; gaps between or
 * around them are filled with synthesized "Sight & Map" sections at the default
 * difficulty so every non-ignored bar ends up in some passage.
 *
 * Synthesized sections use `id = -1` as a sentinel — callers persisting passages
 * should map that to a null sectionId (passages.sectionId is nullable).
 */
export function synthesizeFullCoverageSections(
  userSections: SectionInput[],
  totalMeasures: number,
): SectionInput[] {
  if (totalMeasures <= 0) return [];

  // Only keep bars the user explicitly wants practiced. Ignored sections are
  // holes that should NOT be filled by the gap synthesizer.
  const marked = userSections
    .filter((s) => !s.ignored && s.measureEnd >= s.measureStart)
    .slice()
    .sort((a, b) => a.measureStart - b.measureStart || a.measureEnd - b.measureEnd);
  const ignored = userSections
    .filter((s) => s.ignored && s.measureEnd >= s.measureStart)
    .slice()
    .sort((a, b) => a.measureStart - b.measureStart);

  // Walk [1..totalMeasures], skipping ignored ranges, and emit either a marked
  // section (if it starts here) or a synthesized gap section up to the next
  // marked/ignored boundary.
  const out: SectionInput[] = [];
  let order = 0;
  let cursor = 1;
  const end = totalMeasures;
  let markedIdx = 0;

  const isIgnored = (bar: number): boolean =>
    ignored.some((s) => bar >= s.measureStart && bar <= s.measureEnd);
  const nextBoundary = (from: number): number => {
    // Next bar where coverage semantics changes: start of a marked section,
    // start of an ignored section, or end-of-piece.
    let b = end + 1;
    for (const s of marked) if (s.measureStart >= from && s.measureStart < b) b = s.measureStart;
    for (const s of ignored) if (s.measureStart >= from && s.measureStart < b) b = s.measureStart;
    return b;
  };

  while (cursor <= end) {
    if (isIgnored(cursor)) {
      // Jump past this ignored range.
      const ig = ignored.find((s) => cursor >= s.measureStart && cursor <= s.measureEnd)!;
      cursor = ig.measureEnd + 1;
      continue;
    }
    const markedHere = marked[markedIdx];
    if (markedHere && markedHere.measureStart === cursor) {
      out.push({ ...markedHere, displayOrder: order++ });
      cursor = markedHere.measureEnd + 1;
      markedIdx++;
      continue;
    }
    // Synthesize a gap section from cursor up to the next boundary - 1.
    const boundary = nextBoundary(cursor);
    const gapEnd = Math.min(end, boundary - 1);
    if (gapEnd >= cursor) {
      out.push({
        id: -1,
        name: "Sight & Map",
        measureStart: cursor,
        measureEnd: gapEnd,
        difficulty: DEFAULT_UNMARKED_DIFFICULTY,
        ignored: false,
        displayOrder: order++,
      });
    }
    cursor = gapEnd + 1;
  }

  return out;
}

export type PassagePlan = {
  sectionId: number;
  label: string;
  measureStart: number;
  measureEnd: number;
  difficulty: number; // 1–10 scale (promoted from section's 1–7)
  kind: "primary";
  displayOrder: number;
  challenges: ChallengeTag[]; // inferred from difficulty for MVP; AI analysis could enrich later
};

/** Split each non-ignored section into passages sized by difficulty × playing level. */
export function segmentSectionsIntoPassages(
  sections: SectionInput[],
  level: PlayingLevel,
): PassagePlan[] {
  const passages: PassagePlan[] = [];
  let order = 0;
  const active = sections
    .filter((s) => !s.ignored)
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder || a.measureStart - b.measureStart);

  for (const section of active) {
    const bars = section.measureEnd - section.measureStart + 1;
    if (bars <= 0) continue;
    const target = targetPassageBarCount(section.difficulty, section.id, level);
    // Number of passages: prefer balanced sizes, round to nearest.
    const count = Math.max(1, Math.round(bars / target));
    const size = Math.ceil(bars / count);
    const difficultyScaled = promoteDifficultyScale(section.difficulty);
    const challenges = inferChallengesFromDifficulty(section.difficulty);
    for (let i = 0; i < count; i++) {
      const start = section.measureStart + i * size;
      const end = Math.min(section.measureEnd, start + size - 1);
      if (start > section.measureEnd) break;
      passages.push({
        sectionId: section.id,
        label: count === 1 ? section.name : `${section.name} · pt ${i + 1}/${count}`,
        measureStart: start,
        measureEnd: end,
        difficulty: difficultyScaled,
        kind: "primary",
        displayOrder: order++,
        challenges,
      });
    }
  }
  return passages;
}

function promoteDifficultyScale(sectionDifficulty: number): number {
  // Section difficulty is 1–7; passage is 1–10. Linear map.
  const d = clamp(sectionDifficulty, 1, 7);
  return Math.round(((d - 1) / 6) * 9 + 1);
}

function inferChallengesFromDifficulty(d: number): ChallengeTag[] {
  // Heuristic until AI analysis is wired in. Harder sections → more challenges.
  if (d >= 6) return ["coordination", "tempo", "rhythm", "fingering"];
  if (d >= 4) return ["coordination", "rhythm"];
  return ["tempo"];
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Session composition (pure — given state, produce a LessonDay)
// ─────────────────────────────────────────────────────────────────────────────

export type PassageWithState = {
  passage: Passage;
  progress: PassageProgress;
};

type DailyInputs = {
  plan: LearningPlan;
  instrument: string | null;
  dateISO: string;         // YYYY-MM-DD
  dayIndex: number;         // 0-based day number within plan
  budgetMinutes: number;
  pool: PassageWithState[]; // all passages for this plan (ordered by introducedAt / nextDueAt)
  horizonDays: number;      // total days in the planning horizon (for intro pacing)
};

type ComposedSession = {
  sections: SessionSection[];
  /** Passages touched today (for state updates post-composition). */
  touchedPassageIds: number[];
  /** Covered measure range for LessonDay.measureStart/End (widest span touched). */
  measureStart: number;
  measureEnd: number;
  /** Primary section/phase for LessonDay row (most-emphasized passage). */
  primarySectionId: number | null;
  primaryPhase: PhaseType | null;
  /** Per-passage phase assigned today. Keyed by passage.id. */
  passagePhaseById: Map<number, PhaseType>;
};

/** Fraction of the horizon used to introduce new passages. After this window,
 * every passage has been introduced and is aging through its phase pipeline. */
const INTRO_WINDOW_FRACTION = 0.3;

/** Compute the day (0-indexed) on which a passage enters `orient`. Passages are
 * introduced in piece-order across the first INTRO_WINDOW_FRACTION of the
 * horizon so the whole piece enters the pipeline quickly. */
function leadDayForPassage(orderIdx: number, totalPassages: number, horizonDays: number): number {
  const introDays = Math.max(1, Math.floor(horizonDays * INTRO_WINDOW_FRACTION));
  if (totalPassages <= 1) return 0;
  return Math.floor((orderIdx / (totalPassages - 1)) * (introDays - 1));
}

/** Which phase should this passage be at on `dayIndex`, given it was introduced
 * on `leadDay` and the total horizon is `horizonDays`? Returns null if the
 * passage hasn't been introduced yet.
 *
 * The passage's phase schedule spans [leadDay, horizonDays), with days
 * proportional to CURRICULUM_WEIGHTS × required-touches for its difficulty.
 * Phases with 0 required touches are skipped. */
function passagePhaseOnDay(
  difficulty: number,
  sectionId: number | null,
  dayIndex: number,
  leadDay: number,
  horizonDays: number,
): PhaseType | null {
  if (dayIndex < leadDay) return null;
  const required = PHASE_TYPES
    .map((p) => ({ phase: p, need: requiredTouchesForPhase(difficulty, sectionId, p) }))
    .filter((x) => x.need > 0);
  if (required.length === 0) return null;
  const workingDays = Math.max(1, horizonDays - leadDay);
  const weights = required.map((r) => CURRICULUM_WEIGHTS[r.phase] * r.need);
  const total = weights.reduce((a, b) => a + b, 0);
  const age = dayIndex - leadDay;
  let cum = 0;
  for (let i = 0; i < required.length; i++) {
    cum += (weights[i] / total) * workingDays;
    if (age < cum) return required[i].phase;
  }
  return required[required.length - 1].phase;
}

export type ReasonCode =
  | "new_material"
  | "overdue"
  | "due_soon"
  | "deadline_pressure"
  | "weak_passage"
  | "maintenance"
  | "recency_penalty";

function computeCompletedTouches(progress: PassageProgress, difficulty: number, sectionId: number | null): number {
  const phaseIdx = PHASE_TYPES.indexOf(progress.currentPhase as PhaseType);
  let completed = 0;
  for (let i = 0; i < phaseIdx; i++) {
    completed += requiredTouchesForPhase(difficulty, sectionId, PHASE_TYPES[i]);
  }
  const currentRequired = requiredTouchesForPhase(difficulty, sectionId, progress.currentPhase as PhaseType);
  completed += Math.min(progress.phaseTouchCount ?? 0, currentRequired);
  return completed;
}

function scorePassage(
  entry: PassageWithState,
  dayIndex: number,
  horizonDays: number,
  dateISO: string,
): { phase: PhaseType; score: number; reasonCodes: ReasonCode[] } {
  const { passage, progress } = entry;
  const reasonCodes: ReasonCode[] = [];
  let score = 0;
  const phase = nextRequiredPhase(progress.currentPhase as PhaseType, passage.difficulty, passage.sectionId);

  if (!progress.introducedAt) {
    const introWindowEnd = Math.max(1, horizonDays * INTRO_WINDOW_FRACTION);
    if (dayIndex <= introWindowEnd) score += 2.0;
    reasonCodes.push("new_material");
    return { phase, score: Math.max(0, score), reasonCodes };
  }

  const todayMs = new Date(dateISO + "T00:00:00Z").getTime();

  if (progress.nextDueAt) {
    const dueMs = new Date(progress.nextDueAt + "T00:00:00Z").getTime();
    const overdueDays = (todayMs - dueMs) / 86_400_000;
    if (overdueDays > 0) {
      score += Math.min(3.0, overdueDays * 0.4);
      reasonCodes.push("overdue");
    } else if (overdueDays >= -2) {
      score += 0.3;
      reasonCodes.push("due_soon");
    }
  }

  const totalRequired = totalRequiredTouches(passage.difficulty, passage.sectionId);
  if (totalRequired > 0) {
    const completed = computeCompletedTouches(progress, passage.difficulty, passage.sectionId);
    const gap = (dayIndex / Math.max(1, horizonDays)) - (completed / totalRequired);
    if (gap > 0.1) {
      score += gap * 2.5;
      reasonCodes.push("deadline_pressure");
    }
  }

  const weaknessScore =
    (passage.difficulty / 10) * 0.5 +
    Math.min(1, (progress.lapseCount ?? 0) / 5) * 0.5;
  if (weaknessScore > 0.25) {
    score += weaknessScore * 0.8;
    reasonCodes.push("weak_passage");
  }

  if ((progress.maturity ?? 0) >= 60) {
    score += 0.4;
    reasonCodes.push("maintenance");
  }

  if (progress.lastReviewedAt) {
    const lastMs = new Date(progress.lastReviewedAt + "T00:00:00Z").getTime();
    const daysSince = (todayMs - lastMs) / 86_400_000;
    if (daysSince < 1.0) {
      score -= 1.0;
      reasonCodes.push("recency_penalty");
    } else if (daysSince < 1.5) {
      score -= 0.4;
    }
  }

  // M6: daily-maintenance flag overrides recency penalty so struggling passages
  // always surface. The +2.0 boost ensures they rank ahead of routine review.
  if ((progress as any).dailyMaintenanceFlag) {
    score = Math.max(score, 0) + 2.0;
    if (!reasonCodes.includes("weak_passage")) reasonCodes.push("weak_passage");
  }

  return { phase, score: Math.max(0, score), reasonCodes };
}

/** Compose a single day's session as a MIX of phases across the piece.
 *
 * Each passage has its own lead day (when it enters orient) and ages through
 * its required phases at a rate proportional to CURRICULUM_WEIGHTS. On any
 * given day, passages near the front of the piece may already be at
 * stabilize/shape while passages near the back are still at orient/decode.
 *
 * This produces sessions like:
 *   - Orient: bars 200–256 (new territory, read through slowly)
 *   - Decode: bars 140–200 (yesterday's territory, work out the notes)
 *   - Chunk:  bars 80–120  (older material, drill tricky spots)
 *   - Stabilize: bars 1–80 (earliest material, run through at tempo)
 *
 * The mix evolves over the horizon as each passage graduates through its
 * pipeline; by the final days, most passages are at stabilize/shape.
 */
export function composeSession(input: DailyInputs): ComposedSession {
  const { instrument, dateISO, dayIndex, budgetMinutes, pool, horizonDays } = input;

  const byPassageId = new Map<number, PassageWithState>();
  for (const p of pool) byPassageId.set(p.passage.id, p);

  const sections: SessionSection[] = [];

  // Warmup block.
  const warmupMin = Math.max(MIN_SECTION_MINUTES, Math.round(budgetMinutes * WARMUP_ALLOCATION));
  sections.push({
    type: "warmup",
    role: "warmup",
    label: "Warmup",
    durationMin: warmupMin,
    tasks: defaultWarmupsForInstrument(instrument),
  });

  const practiceBudget = budgetMinutes - warmupMin;
  const active = pool.filter((p) => !p.progress.retiredAt);

  // Score passages and select those worth practicing today.
  const scored = active
    .map((entry) => ({ entry, ...scorePassage(entry, dayIndex, horizonDays, dateISO) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const maxPassages = Math.ceil(practiceBudget / MIN_TASK_MINUTES);
  const assignments: Array<{ entry: PassageWithState; phase: PhaseType; score: number; reasonCodes: ReasonCode[] }> =
    scored.slice(0, maxPassages).map((x) => ({
      entry: x.entry,
      phase: x.phase,
      score: x.score,
      reasonCodes: x.reasonCodes,
    }));

  // Group by phase (preserving piece-order within each group).
  const byPhase = new Map<PhaseType, PassageWithState[]>();
  const scoreMap = new Map<number, { score: number; reasonCodes: ReasonCode[] }>();
  for (const phase of PHASE_TYPES) byPhase.set(phase, []);
  for (const { entry, phase, score, reasonCodes } of assignments) {
    byPhase.get(phase)!.push(entry);
    scoreMap.set(entry.passage.id, { score, reasonCodes });
  }

  // Budget each phase group proportional to its "practice weight":
  //   sweep phases (orient/decode): ~8 min for a slice sweep regardless of count
  //   drill phases (chunk/coordinate): ~10 min × min(2, count) passages
  //   link: ~8 min × min(2, junctions)
  //   stabilize/shape: ~12 min per run-through slice
  const phaseWeightMin: Record<PhaseType, number> = {
    decode: 8, build: 10, connect: 8, shape: 12, perform: 12,
  };
  const activePhases = PHASE_TYPES.filter((p) => (byPhase.get(p)?.length ?? 0) > 0);
  if (activePhases.length === 0) {
    return {
      sections,
      touchedPassageIds: [],
      measureStart: 1,
      measureEnd: 1,
      primarySectionId: null,
      primaryPhase: null,
      passagePhaseById: new Map(),
    };
  }
  const rawWeights = activePhases.map((p) => phaseWeightMin[p]);
  const weightSum = rawWeights.reduce((a, b) => a + b, 0);
  const phaseBudgets = new Map<PhaseType, number>();
  let allocated = 0;
  activePhases.forEach((p, i) => {
    const b = Math.max(MIN_SECTION_MINUTES, Math.floor((rawWeights[i] / weightSum) * practiceBudget));
    phaseBudgets.set(p, b);
    allocated += b;
  });
  // If we over-allocated due to min-clamping, trim from the largest group.
  if (allocated > practiceBudget) {
    const sorted = Array.from(phaseBudgets.entries()).sort((a, b) => b[1] - a[1]);
    let excess = allocated - practiceBudget;
    for (const [p, b] of sorted) {
      const trimmable = Math.max(0, b - MIN_SECTION_MINUTES);
      const trim = Math.min(trimmable, excess);
      phaseBudgets.set(p, b - trim);
      excess -= trim;
      if (excess === 0) break;
    }
  }

  const touched = new Set<number>();
  const creditTouch = (sec: SessionSection) => {
    for (const t of sec.tasks ?? []) {
      if (typeof t.passageId === "number") touched.add(t.passageId);
    }
    if (typeof sec.measureStart === "number" && typeof sec.measureEnd === "number") {
      for (const p of active) {
        if (p.passage.measureStart >= sec.measureStart && p.passage.measureEnd <= sec.measureEnd) {
          touched.add(p.passage.id);
        }
      }
    }
  };

  // Build sections in pipeline order so the session reads front-to-back through
  // the piece's maturity: new material first, polished material last.
  for (const phase of activePhases) {
    const passages = byPhase.get(phase)!;
    const budget = phaseBudgets.get(phase)!;
    const built = buildPhaseGroup({ phase, passages, budgetMin: budget, scoreMap });
    for (const sec of built) {
      sections.push(sec);
      creditTouch(sec);
    }
  }

  // Integration ramp (M4): In the final 25% of the horizon, append a whole-piece
  // runthrough across all shape/perform passages to reinforce large-scale continuity.
  const planProgress = horizonDays > 0 ? dayIndex / horizonDays : 0;
  if (planProgress > 0.75) {
    const maturePassages = [
      ...(byPhase.get("shape") ?? []),
      ...(byPhase.get("perform") ?? []),
    ].sort((a, b) => a.passage.measureStart - b.passage.measureStart);
    if (maturePassages.length >= 2) {
      const integStart = maturePassages[0].passage.measureStart;
      const integEnd = maturePassages[maturePassages.length - 1].passage.measureEnd;
      const integBudget = Math.max(MIN_SECTION_MINUTES, Math.round(practiceBudget * 0.12));
      const scores = maturePassages.map((p) => scoreMap.get(p.passage.id)?.score ?? 0);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const allCodes = maturePassages.flatMap((p) => scoreMap.get(p.passage.id)?.reasonCodes ?? []);
      const integTask = buildRunthroughTask({
        label: `Integration · bars ${integStart}–${integEnd}`,
        measureStart: integStart,
        measureEnd: integEnd,
        tempoPct: 90,
        durationMin: integBudget,
        rationale: "Full-span runthrough to lock in large-scale continuity across mature sections.",
        priorityScore: avgScore,
        reasonCodes: Array.from(new Set(allCodes)) as ReasonCode[],
      });
      const integSection: SessionSection = {
        type: "perform",
        role: "runthrough" as TaskRole,
        label: `Integration · bars ${integStart}–${integEnd}`,
        durationMin: integBudget,
        tasks: [integTask],
        measureStart: integStart,
        measureEnd: integEnd,
        phaseType: "perform",
      };
      sections.push(integSection);
      creditTouch(integSection);
    }
  }

  const touchedList = Array.from(touched).map((id) => byPassageId.get(id)!).filter(Boolean);
  const measureStart = touchedList.length > 0 ? Math.min(...touchedList.map((p) => p.passage.measureStart)) : 1;
  const measureEnd = touchedList.length > 0 ? Math.max(...touchedList.map((p) => p.passage.measureEnd)) : 1;

  // Primary section/phase = the most "active" phase group's first passage. We
  // prefer drill phases (deep work) over sweep/runthrough for the LessonDay
  // header since they represent the day's focal effort.
  const phaseRank: Record<PhaseType, number> = {
    decode: 0, connect: 1, shape: 2, perform: 3, build: 4,
  };
  const rankedPhases = [...activePhases].sort((a, b) => phaseRank[b] - phaseRank[a]);
  const primaryPhase = rankedPhases[0] ?? null;
  const primaryEntry = primaryPhase ? byPhase.get(primaryPhase)![0] ?? null : null;
  const passagePhaseById = new Map<number, PhaseType>();
  for (const { entry, phase } of assignments) passagePhaseById.set(entry.passage.id, phase);
  return {
    sections,
    touchedPassageIds: Array.from(touched),
    measureStart,
    measureEnd,
    primarySectionId: primaryEntry?.passage.sectionId ?? null,
    primaryPhase,
    passagePhaseById,
  };
}

/** Build the session sections for all passages at a given phase today. The
 * group spans a contiguous slice of the piece (the passages' combined bar
 * range) at the phase's modality. Sweep/runthrough phases emit one task
 * covering the whole slice; drill phases emit per-passage drills. */
function buildPhaseGroup(opts: {
  phase: PhaseType;
  passages: PassageWithState[];
  budgetMin: number;
  scoreMap: Map<number, { score: number; reasonCodes: ReasonCode[] }>;
}): SessionSection[] {
  const { phase, passages, budgetMin, scoreMap } = opts;
  if (passages.length === 0) return [];
  const sorted = [...passages].sort((a, b) => a.passage.measureStart - b.passage.measureStart);

  switch (phase) {
    case "decode":
      return [buildSweepGroup({ sorted, budgetMin, scoreMap })];
    case "build":
      return buildDrillGroup({ sorted, budgetMin, scoreMap });
    case "connect":
      return buildLinkGroup({ sorted, budgetMin, scoreMap });
    case "shape":
    case "perform":
      return [buildRunthroughGroup({ phase, sorted, budgetMin, scoreMap })];
  }
}

/** Decode sweep across a contiguous slice — read through the notes carefully.
 * passageId is omitted since the task spans many passages; coverage credited
 * via bar-range overlap. */
function buildSweepGroup(opts: {
  sorted: PassageWithState[];
  budgetMin: number;
  scoreMap: Map<number, { score: number; reasonCodes: ReasonCode[] }>;
}): SessionSection {
  const { sorted, budgetMin, scoreMap } = opts;
  const rangeStart = sorted[0].passage.measureStart;
  const rangeEnd = sorted[sorted.length - 1].passage.measureEnd;
  const label = `Decode · bars ${rangeStart}–${rangeEnd}`;
  const rationale = "Work through the notes at slow tempo. Hands separate if needed — pitch, rhythm, fingering.";
  const scores = sorted.map((p) => scoreMap.get(p.passage.id)?.score ?? 0);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
  const allReasonCodes = sorted.flatMap((p) => scoreMap.get(p.passage.id)?.reasonCodes ?? []);
  const uniqueReasonCodes = allReasonCodes.length > 0 ? Array.from(new Set(allReasonCodes)) : undefined;
  const task = buildRunthroughTask({
    label,
    measureStart: rangeStart,
    measureEnd: rangeEnd,
    tempoPct: 65,
    durationMin: budgetMin,
    rationale,
    priorityScore: avgScore,
    reasonCodes: uniqueReasonCodes,
  });
  return {
    type: "decode",
    role: "new_material",
    label,
    durationMin: budgetMin,
    tasks: [task],
    measureStart: rangeStart,
    measureEnd: rangeEnd,
    phaseType: "decode",
  };
}

/** Compute the effective working range for a build drill on a passage.
 * Starts at ~40% of the passage span on the first touch and grows 20% per
 * additional touch until the full passage is covered. This lets players focus
 * on small chunks before expanding — progressive overload for motor learning. */
function effectiveDrillSpan(passage: Passage, progress: PassageProgress): { start: number; end: number } {
  const totalBars = passage.measureEnd - passage.measureStart + 1;
  if (totalBars <= 4) return { start: passage.measureStart, end: passage.measureEnd };
  const growthFactor = Math.min(1.0, 0.4 + (progress.phaseTouchCount ?? 0) * 0.2);
  const spanBars = Math.max(3, Math.ceil(totalBars * growthFactor));
  const end = Math.min(passage.measureEnd, passage.measureStart + spanBars - 1);
  return { start: passage.measureStart, end };
}

/** Build drill — a maintenance pass over the whole group plus 1–2 focused
 * drills on the hardest passages. The maintenance pass credits every passage
 * at this phase today; focused drills deliver the deep work. When the budget
 * is too small for both, drop drills before maintenance so coverage is
 * preserved. */
function buildDrillGroup(opts: {
  sorted: PassageWithState[];
  budgetMin: number;
  scoreMap: Map<number, { score: number; reasonCodes: ReasonCode[] }>;
}): SessionSection[] {
  const { sorted, budgetMin, scoreMap } = opts;
  const phase = "build" as PhaseType;
  const ranked = [...sorted].sort(
    (a, b) => b.passage.difficulty - a.passage.difficulty || a.passage.measureStart - b.passage.measureStart,
  );
  const rangeStart = sorted[0].passage.measureStart;
  const rangeEnd = sorted[sorted.length - 1].passage.measureEnd;

  // Decide how many individual drills fit alongside a MIN_SECTION_MINUTES
  // maintenance pass. If we can't afford any drills + maintenance, skip the
  // drills and spend the whole budget on maintenance.
  const canAffordMaintenance = budgetMin >= MIN_SECTION_MINUTES;
  const remainingAfterMaintenance = budgetMin - MIN_SECTION_MINUTES;
  const maxDrills = Math.min(
    2,
    ranked.length,
    Math.max(0, Math.floor(remainingAfterMaintenance / MIN_SECTION_MINUTES)),
  );
  const out: SessionSection[] = [];

  if (maxDrills > 0) {
    // Give drills ~70% of budget; maintenance gets the rest (>= MIN).
    const drillBudget = Math.max(maxDrills * MIN_SECTION_MINUTES, Math.floor(budgetMin * 0.7));
    const perDrillBudget = Math.max(MIN_SECTION_MINUTES, Math.floor(drillBudget / maxDrills));
    const todays = ranked.slice(0, maxDrills);
    for (const p of todays) {
      const span = effectiveDrillSpan(p.passage, p.progress);
      const passageLabel = p.passage.label ?? `bars ${p.passage.measureStart}–${p.passage.measureEnd}`;
      const spanSuffix =
        span.start === p.passage.measureStart && span.end === p.passage.measureEnd
          ? ""
          : ` (mm.${span.start}–${span.end})`;
      const label = `Build — ${passageLabel}${spanSuffix}`;
      const scoreEntry = scoreMap.get(p.passage.id);
      const tasks = buildPhaseTasks(
        p, phase, "deep_work", perDrillBudget,
        scoreEntry?.score, scoreEntry?.reasonCodes,
        span.start, span.end,
      );
      out.push({
        type: phase,
        role: "deep_work" as TaskRole,
        label,
        durationMin: perDrillBudget,
        tasks,
        sectionId: p.passage.sectionId ?? undefined,
        phaseType: phase,
        measureStart: span.start,
        measureEnd: span.end,
      });
    }
  }

  if (canAffordMaintenance) {
    const usedByDrills = out.reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
    const maintenanceBudget = Math.max(MIN_SECTION_MINUTES, budgetMin - usedByDrills);
    const label = ranked.length > 2
      ? `Build maintenance · bars ${rangeStart}–${rangeEnd}`
      : `Build run · bars ${rangeStart}–${rangeEnd}`;
    const task = buildRunthroughTask({
      label,
      measureStart: rangeStart,
      measureEnd: rangeEnd,
      tempoPct: 78,
      durationMin: maintenanceBudget,
      rationale: "Loop through at moderate tempo — keep passages warm and consolidate accuracy.",
    });
    out.push({
      type: phase,
      role: "review" as TaskRole,
      label,
      durationMin: maintenanceBudget,
      tasks: [task],
      phaseType: phase,
      measureStart: rangeStart,
      measureEnd: rangeEnd,
    });
  }
  return out;
}

/** Connect group: junction practice between adjacent passages in the group. */
function buildLinkGroup(opts: {
  sorted: PassageWithState[];
  budgetMin: number;
  scoreMap: Map<number, { score: number; reasonCodes: ReasonCode[] }>;
}): SessionSection[] {
  const { sorted, budgetMin, scoreMap } = opts;
  const junctions: Array<{ from: PassageWithState; to: PassageWithState }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (b.passage.measureStart - a.passage.measureEnd <= 1) {
      junctions.push({ from: a, to: b });
    }
  }
  if (junctions.length === 0) {
    // No adjacent junctions in this group — fall back to a run-through of the
    // group's combined range so we still credit these passages today.
    return [buildRunthroughGroup({ phase: "shape", sorted, budgetMin, scoreMap })];
  }
  const todays = junctions.slice(0, Math.min(2, junctions.length));
  const perJunctionBudget = Math.max(MIN_SECTION_MINUTES, Math.floor(budgetMin / todays.length));

  return todays.map(({ from, to }) => {
    const task = buildTransitionTask({
      fromPassageId: from.passage.id,
      toPassageId: to.passage.id,
      junctionStart: Math.max(from.passage.measureStart, from.passage.measureEnd - 1),
      junctionEnd: Math.min(to.passage.measureEnd, to.passage.measureStart + 1),
      durationMin: perJunctionBudget,
    });
    return {
      type: "connect",
      role: "transition" as TaskRole,
      label: `Connect — bars ${task.measureStart}–${task.measureEnd}`,
      durationMin: perJunctionBudget,
      tasks: [task],
      phaseType: "connect",
      measureStart: task.measureStart,
      measureEnd: task.measureEnd,
    };
  });
}

/** Shape/perform run-through of the group's combined range. */
function buildRunthroughGroup(opts: {
  phase: "shape" | "perform";
  sorted: PassageWithState[];
  budgetMin: number;
  scoreMap: Map<number, { score: number; reasonCodes: ReasonCode[] }>;
}): SessionSection {
  const { phase, sorted, budgetMin, scoreMap } = opts;
  const rangeStart = sorted[0].passage.measureStart;
  const rangeEnd = sorted[sorted.length - 1].passage.measureEnd;
  const label = phase === "shape"
    ? `Shape · bars ${rangeStart}–${rangeEnd}`
    : `Perform · bars ${rangeStart}–${rangeEnd}`;
  const rationale = phase === "shape"
    ? "Continuous play at ~85% tempo. Don't stop for mistakes — note them and keep going."
    : "Full musical expression — dynamics, phrasing, character. Record yourself if you can.";
  const scores = sorted.map((p) => scoreMap.get(p.passage.id)?.score ?? 0);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
  const allReasonCodes = sorted.flatMap((p) => scoreMap.get(p.passage.id)?.reasonCodes ?? []);
  const uniqueReasonCodes = allReasonCodes.length > 0 ? Array.from(new Set(allReasonCodes)) : undefined;
  const task = buildRunthroughTask({
    label,
    measureStart: rangeStart,
    measureEnd: rangeEnd,
    tempoPct: phase === "shape" ? 85 : 95,
    durationMin: budgetMin,
    rationale,
    priorityScore: avgScore,
    reasonCodes: uniqueReasonCodes,
  });
  return {
    type: phase,
    role: "runthrough" as TaskRole,
    label,
    durationMin: budgetMin,
    tasks: [task],
    measureStart: rangeStart,
    measureEnd: rangeEnd,
    phaseType: phase,
  };
}

/** Build one or more tasks for a passage at a specific curriculum phase.
 * `overrideStart`/`overrideEnd` narrow the working range (used by M4 progressive
 * span growth so early drill sessions focus on a sub-span of the passage). */
function buildPhaseTasks(
  p: PassageWithState,
  phase: PhaseType,
  role: TaskRole,
  budgetMin: number,
  priorityScore?: number,
  reasonCodes?: ReasonCode[],
  overrideStart?: number,
  overrideEnd?: number,
): SessionTask[] {
  const challenges = (p.progress.outstandingChallenges ?? p.passage.challenges ?? []) as ChallengeTag[];
  const taskCount = Math.min(2, Math.max(1, Math.floor(budgetMin / MIN_TASK_MINUTES)));
  const modalities = selectModalitiesForPassage(phase, challenges, taskCount);
  const perTaskMin = Math.max(MIN_TASK_MINUTES, Math.floor(budgetMin / modalities.length));
  const start = overrideStart ?? p.passage.measureStart;
  const end = overrideEnd ?? p.passage.measureEnd;
  const label = p.passage.label ?? `Bars ${start}–${end}`;
  return modalities.map((m) =>
    buildPassageTask({
      passageId: p.passage.id,
      label,
      measureStart: start,
      measureEnd: end,
      phase,
      role,
      modality: m,
      durationMin: perTaskMin,
      rationale: `${phase} work — ${m} at passage.`,
      priorityScore,
      reasonCodes,
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Feasibility check (pure — no DB I/O)
// ─────────────────────────────────────────────────────────────────────────────

export type FeasibilityResult =
  | { feasible: true }
  | {
      feasible: false;
      requiredTouches: number;
      availableSessions: number;
      daysNeeded: number;
      shortfallDays: number;
    };

/** Compute how far behind pace the student is as a fraction.
 * Returns paceGap = (dayFraction − completedFraction); positive means behind.
 * Also returns touchesRemaining so callers can include it in suggestion messages. */
export function computePaceGap(
  passages: Passage[],
  progresses: PassageProgress[],
  dayIndex: number,
  horizonDays: number,
): { paceGap: number; touchesRemaining: number } {
  if (horizonDays <= 0) return { paceGap: 0, touchesRemaining: 0 };
  const progressByPassageId = new Map(progresses.map((p) => [p.passageId, p]));
  let totalRequired = 0;
  let totalCompleted = 0;
  for (const passage of passages) {
    const progress = progressByPassageId.get(passage.id);
    if (!progress) continue;
    totalRequired += totalRequiredTouches(passage.difficulty, passage.sectionId);
    totalCompleted += computeCompletedTouches(progress, passage.difficulty, passage.sectionId);
  }
  if (totalRequired === 0) return { paceGap: 0, touchesRemaining: 0 };
  const completedFraction = totalCompleted / totalRequired;
  const dayFraction = dayIndex / horizonDays;
  return {
    paceGap: dayFraction - completedFraction,
    touchesRemaining: totalRequired - totalCompleted,
  };
}

/** Pre-flight check before materializing a plan. Returns whether the required
 * number of passage touches can fit within the horizon at the given daily budget.
 * Call this from generate-lessons and hard-block (422) if infeasible so users
 * are forced to either extend their deadline or reduce scope before the plan runs. */
export function checkPlanFeasibility(
  userSections: SectionInput[],
  totalMeasures: number,
  level: PlayingLevel,
  horizonDays: number,
  dailyPracticeMinutes: number,
): FeasibilityResult {
  const allSections = synthesizeFullCoverageSections(userSections, totalMeasures);
  const passages = segmentSectionsIntoPassages(allSections, level);

  const warmupMin = Math.max(MIN_SECTION_MINUTES, Math.round(dailyPracticeMinutes * WARMUP_ALLOCATION));
  const practiceBudget = Math.max(0, dailyPracticeMinutes - warmupMin);
  const passagesPerSession = Math.max(1, Math.floor(practiceBudget / MIN_TASK_MINUTES));
  const availableSessions = horizonDays * passagesPerSession;

  const requiredTouches = passages.reduce(
    (sum, p) => sum + totalRequiredTouches(p.difficulty, p.sectionId),
    0,
  );

  if (requiredTouches <= availableSessions) return { feasible: true };

  const daysNeeded = Math.ceil(requiredTouches / passagesPerSession);
  return {
    feasible: false,
    requiredTouches,
    availableSessions,
    daysNeeded,
    shortfallDays: daysNeeded - horizonDays,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Orchestration (DB I/O)
// ─────────────────────────────────────────────────────────────────────────────
// Entry points used by routes.ts.

import type { IStorage } from "../storage";

export type GenerateV2Options = {
  planId: number;
  storage: IStorage;
  /** Override the computed horizon. If omitted, derived from plan.targetCompletionDate
   * (capped at MAX_HORIZON_DAYS; fallback DEFAULT_HORIZON_DAYS). */
  horizonDays?: number;
};

/** Compute how many days of lessons to materialize, based on target completion
 * date. Floored at 7 days so plans always have a usable window. */
function computeHorizon(plan: LearningPlan, override?: number): number {
  if (override && override > 0) return Math.min(MAX_HORIZON_DAYS, override);
  if (plan.targetCompletionDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(plan.targetCompletionDate as unknown as string);
    target.setHours(0, 0, 0, 0);
    const days = Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
    if (days >= 7) return Math.min(MAX_HORIZON_DAYS, days);
  }
  return DEFAULT_HORIZON_DAYS;
}

/** Generate a fresh v2 plan: segment sections into passages, initialize state,
 * materialize the first horizon of lesson days. */
export async function generatePlanV2(opts: GenerateV2Options): Promise<{
  passagesCreated: number;
  lessonsCreated: number;
}> {
  const { planId, storage } = opts;
  const plan = await storage.getLearningPlanById(planId);
  if (!plan) throw new Error(`plan ${planId} not found`);
  const horizonDays = computeHorizon(plan, opts.horizonDays);

  // Determine playing level from user profile.
  const profile = await storage.getUserProfile?.(plan.userId);
  const level = (profile?.playingLevel as PlayingLevel | null) ?? "intermediate";

  // Load user-marked sections and fill in unmarked bars with default-difficulty
  // "Sight & Map" sections so every non-ignored bar is covered by a passage.
  const userSections = (await storage.getSectionsForPlan(planId)) as SectionInput[];
  const totalMeasures = plan.totalMeasures ?? 0;
  const input: SectionInput[] = synthesizeFullCoverageSections(userSections, totalMeasures);

  // Wipe any existing v1 lessons + v2 passages so re-generation is idempotent.
  await storage.deleteLessonDaysForPlan(planId);
  if (storage.deletePassagesForPlan) {
    await storage.deletePassagesForPlan(planId);
  }

  // 1. Segment into passages.
  const passagePlans = segmentSectionsIntoPassages(input, level);

  // 2. Insert passages. Synthesized gap passages (sectionId <= 0) persist with
  //    a null sectionId — the passages table allows that.
  const insertedPassages: Passage[] = [];
  for (const p of passagePlans) {
    const inserted = await storage.createPassage!({
      learningPlanId: planId,
      sectionId: p.sectionId > 0 ? p.sectionId : null,
      kind: p.kind,
      label: p.label,
      measureStart: p.measureStart,
      measureEnd: p.measureEnd,
      difficulty: p.difficulty,
      challenges: p.challenges,
      displayOrder: p.displayOrder,
    } as InsertPassage);
    insertedPassages.push(inserted);
  }

  // 3. Initialize progress rows. Start at the first phase this difficulty
  //    actually needs (e.g. easy passages skip "orient" and start at "decode").
  //    introducedAt=null so the scheduler introduces them over time.
  const progressRows: PassageProgress[] = [];
  for (const passage of insertedPassages) {
    const startPhase = nextRequiredPhase("decode", passage.difficulty, passage.sectionId);
    const progress = await storage.createPassageProgress!({
      passageId: passage.id,
      learningPlanId: planId,
      userId: plan.userId,
      currentPhase: startPhase,
      phaseStartedAt: null,
      phaseTouchCount: 0,
      maturity: 0,
      srStability: INITIAL_SR_STABILITY,
      srDifficulty: passage.difficulty,
      lastReviewedAt: null,
      nextDueAt: null,
      reviewCount: 0,
      lapseCount: 0,
      outstandingChallenges: passage.challenges ?? [],
      lastFlagCount: 0,
      introducedAt: null,
      retiredAt: null,
    } as InsertPassageProgress);
    progressRows.push(progress);
  }

  // 4. Get instrument (for warmup library).
  const instrument = await resolveInstrument(storage, plan);

  // 5. Materialize first `horizonDays` worth of lessons.
  const dayStates = await materializeUpcomingDays({
    storage,
    plan,
    instrument,
    passages: insertedPassages,
    progresses: progressRows,
    startDayIndex: 0,
    horizonDays,
  });

  // 6. Mark plan as v2.
  await storage.updateLearningPlan(planId, {
    schedulerVersion: 2,
    lastReplanAt: new Date(),
  });

  return {
    passagesCreated: insertedPassages.length,
    lessonsCreated: dayStates.lessonsCreated,
  };
}

/** After a completed session, update passage state and rewrite the upcoming
 * `horizonDays` of lessons based on the new state. */
export async function replanUpcomingSessions(opts: {
  planId: number;
  storage: IStorage;
  fromDateISO: string;     // YYYY-MM-DD: only rewrite lessons on/after this date
  horizonDays?: number;
}): Promise<{ lessonsCreated: number }> {
  const { planId, storage, fromDateISO, horizonDays = 14 } = opts;
  const plan = await storage.getLearningPlanById(planId);
  if (!plan) throw new Error(`plan ${planId} not found`);
  if (plan.schedulerVersion !== 2) return { lessonsCreated: 0 };

  const passages = (await storage.getPassagesForPlan!(planId)) ?? [];
  const progresses = (await storage.getPassageProgressForPlan!(planId)) ?? [];
  const instrument = await resolveInstrument(storage, plan);

  // Delete upcoming (non-completed) lessons on/after fromDateISO.
  await storage.deleteUpcomingLessonsFromDate!(planId, fromDateISO);

  // Recompute existing day index: count lessons before fromDateISO.
  const existing = await storage.getLessonDays(planId);
  const startDayIndex = existing.filter((l) => l.scheduledDate < fromDateISO).length;

  const { lessonsCreated } = await materializeUpcomingDays({
    storage,
    plan,
    instrument,
    passages,
    progresses,
    startDayIndex,
    horizonDays,
    startDateISO: fromDateISO,
  });

  await storage.updateLearningPlan(planId, { lastReplanAt: new Date() });
  return { lessonsCreated };
}

/** Per-session post-completion state update. Called after a lesson is marked
 * completed. Applies flag data + optional self-rating to each touched passage,
 * then triggers a replan of upcoming days. */
export async function applySessionOutcome(opts: {
  planId: number;
  lessonDayId: number;
  userRating?: ReviewRating; // optional — if not provided, inferred from flag count
  storage: IStorage;
}): Promise<void> {
  const { planId, lessonDayId, userRating, storage } = opts;
  const lesson = await storage.getLessonDayById!(lessonDayId);
  if (!lesson || lesson.learningPlanId !== planId) return;
  const plan = await storage.getLearningPlanById(planId);
  if (!plan || plan.schedulerVersion !== 2) return;

  const flags = await storage.getFlagsForLesson(lessonDayId);
  const unresolvedFlags = flags.filter((f) => !f.resolved);

  // Collect touched passages from lesson.tasks.
  const touchedIds = new Set<number>();
  for (const section of (lesson.tasks ?? []) as SessionSection[]) {
    for (const task of section.tasks ?? []) {
      if (typeof task.passageId === "number") touchedIds.add(task.passageId);
    }
  }

  const today = isoDate(new Date());

  for (const passageId of Array.from(touchedIds)) {
    const progress = await storage.getPassageProgress!(passageId, planId);
    if (!progress) continue;
    const passage = await storage.getPassageById!(passageId);
    if (!passage) continue;

    // Count flags on bars within this passage.
    const passageFlagCount = unresolvedFlags.filter((f) => {
      // We can't easily know measureNumber from measureId here without a join;
      // for MVP, attribute all session flags proportionally if they fall in range.
      return true;
    }).length;

    // Infer per-passage rating if caller didn't provide one.
    const rating: ReviewRating =
      userRating ??
      (passageFlagCount >= REGRESSION_FLAG_THRESHOLD
        ? 1
        : passageFlagCount >= 1
        ? 2
        : 3);

    const elapsed = progress.lastReviewedAt ? daysBetween(progress.lastReviewedAt, today) : Number(progress.srStability);
    const newStability = updateStability(progress.srStability, progress.srDifficulty, rating, elapsed);
    const newDifficulty = updateDifficulty(progress.srDifficulty, rating);

    // Phase state update.
    let newPhase = progress.currentPhase as PhaseType;
    let newTouchCount = progress.phaseTouchCount + 1;
    let newLapseCount = progress.lapseCount;
    const cleanTouch = rating >= 3;
    if (!cleanTouch && rating === 1) {
      // Heavy regression: demote phase one step.
      newPhase = demotePhase(newPhase);
      newLapseCount += 1;
      newTouchCount = 0;
    } else if (cleanTouch && newTouchCount >= PHASE_TOUCHES_TO_ADVANCE) {
      newPhase = advancePhase(newPhase);
      newTouchCount = 0;
    }

    // Maturity: blend phase progress + SR stability + flag absence.
    const phaseIdx = PHASE_TYPES.indexOf(newPhase);
    const phaseMaturity = ((phaseIdx + 1) / PHASE_TYPES.length) * 100;
    const stabilityBoost = Math.min(15, Math.log2(Math.max(1, newStability)) * 5);
    const flagPenalty = Math.min(20, passageFlagCount * 5);
    const newMaturity = clamp(Math.round(phaseMaturity + stabilityBoost - flagPenalty), 0, 100);

    const nextDue = computeNextDueDate(today, newStability);

    // M6: Set daily-maintenance flag when the player is struggling; auto-clear
    // when maturity is high and the passage has been touched cleanly 3+ times.
    const wasFlaged = !!(progress as any).dailyMaintenanceFlag;
    const shouldSetFlag = !cleanTouch || newLapseCount > progress.lapseCount;
    const shouldClearFlag =
      wasFlaged && newMaturity >= 80 && newTouchCount >= 3 && passageFlagCount === 0;
    const newDailyMaintenanceFlag = shouldClearFlag ? false : shouldSetFlag ? true : wasFlaged;

    await storage.updatePassageProgress!(progress.id, {
      currentPhase: newPhase,
      phaseStartedAt: newPhase !== progress.currentPhase ? today : progress.phaseStartedAt,
      phaseTouchCount: newTouchCount,
      maturity: newMaturity,
      srStability: Math.round(newStability),
      srDifficulty: Math.round(newDifficulty),
      lastReviewedAt: today,
      nextDueAt: nextDue,
      reviewCount: progress.reviewCount + 1,
      lapseCount: newLapseCount,
      lastFlagCount: passageFlagCount,
      retiredAt: newMaturity >= 95 && newPhase === "perform" ? today : null,
      dailyMaintenanceFlag: newDailyMaintenanceFlag,
    } as any);
  }

  // Replan upcoming days starting tomorrow.
  const tomorrow = isoDate(addDays(new Date(today + "T00:00:00Z"), 1));
  await replanUpcomingSessions({ planId, storage, fromDateISO: tomorrow });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

async function materializeUpcomingDays(args: {
  storage: IStorage;
  plan: LearningPlan;
  instrument: string | null;
  passages: Passage[];
  progresses: PassageProgress[];
  startDayIndex: number;
  horizonDays: number;
  startDateISO?: string;
}): Promise<{ lessonsCreated: number }> {
  const { storage, plan, instrument, passages, progresses, startDayIndex, horizonDays, startDateISO } = args;
  const progressByPassageId = new Map<number, PassageProgress>(progresses.map((p) => [p.passageId, p]));
  const pool: PassageWithState[] = passages
    .map((passage) => {
      const progress = progressByPassageId.get(passage.id);
      if (!progress) return null;
      return { passage, progress };
    })
    .filter((v): v is PassageWithState => v !== null);

  const startDate = startDateISO ? new Date(startDateISO + "T00:00:00Z") : new Date();
  startDate.setUTCHours(0, 0, 0, 0);
  const inserts: InsertLessonDay[] = [];

  // We simulate forward: for each day, compose session + update local pool state
  // as if the student practices what the plan says (optimistic projection).
  for (let i = 0; i < horizonDays; i++) {
    const dayDate = new Date(startDate);
    dayDate.setUTCDate(startDate.getUTCDate() + i);
    const dateISO = isoDate(dayDate);

    const composed = composeSession({
      plan,
      instrument,
      dateISO,
      dayIndex: startDayIndex + i,
      budgetMinutes: plan.dailyPracticeMinutes,
      pool,
      horizonDays,
    });

    inserts.push({
      learningPlanId: plan.id,
      scheduledDate: dateISO,
      measureStart: composed.measureStart,
      measureEnd: composed.measureEnd,
      status: "upcoming",
      tasks: composed.sections,
      sectionId: composed.primarySectionId,
      phaseType: composed.primaryPhase,
    } as InsertLessonDay);

    // Simulate optimistic state update. Advance a passage's phase once it
    // accumulates the required number of touches, then reset phaseTouchCount.
    // (The old assignedPhase approach never advanced because scorePassage always
    // returns currentPhase — phase must be driven by touch count here.)
    for (const pid of composed.touchedPassageIds) {
      const entry = pool.find((p) => p.passage.id === pid);
      if (!entry) continue;
      const difficulty = entry.passage.difficulty;
      const sectionId = entry.passage.sectionId;
      const prevPhase = entry.progress.currentPhase as PhaseType;

      const tentativeTouchCount = entry.progress.phaseTouchCount + 1;
      const requiredForCurrent = requiredTouchesForPhase(difficulty, sectionId, prevPhase);
      let newPhase: PhaseType = prevPhase;
      let nextTouchCount = tentativeTouchCount;
      if (requiredForCurrent > 0 && tentativeTouchCount >= requiredForCurrent) {
        const candidate = nextRequiredPhase(advancePhase(prevPhase), difficulty, sectionId);
        if (PHASE_TYPES.indexOf(candidate) > PHASE_TYPES.indexOf(prevPhase)) {
          newPhase = candidate;
          nextTouchCount = 0;
        }
      }
      const phaseAdvanced = newPhase !== prevPhase;

      // No early retirement under the mixed-phase model — every passage keeps
      // participating until the end of the horizon so the piece stays warm.
      // (A future "stuck" UI flag can force re-practice; for now, progress just
      // ages into shape and stays there.)
      const retired = entry.progress.retiredAt;

      const growthFactor = 1 + 1.2 / Math.max(1, Math.sqrt(difficulty));
      const newStability = Math.min(60, Number(entry.progress.srStability) * growthFactor);
      const nextDue = computeNextDueDate(dateISO, newStability);

      const phaseIdx = PHASE_TYPES.indexOf(newPhase);
      const maturityPct = retired
        ? 100
        : Math.min(100, Math.round(((phaseIdx + 1) / PHASE_TYPES.length) * 100));

      // M6 simulation: assume clean sessions clear the flag once maturity + touches qualify.
      const simWasFlagged = !!(entry.progress as any).dailyMaintenanceFlag;
      const simDailyFlag =
        simWasFlagged && !(maturityPct >= 80 && nextTouchCount >= 3) ? true : false;

      entry.progress = {
        ...entry.progress,
        introducedAt: entry.progress.introducedAt ?? dateISO,
        currentPhase: newPhase,
        phaseStartedAt: phaseAdvanced ? dateISO : entry.progress.phaseStartedAt ?? dateISO,
        phaseTouchCount: nextTouchCount,
        lastReviewedAt: dateISO,
        nextDueAt: nextDue,
        srStability: Math.round(newStability),
        maturity: maturityPct,
        retiredAt: retired,
        dailyMaintenanceFlag: simDailyFlag,
      } as any;
    }
  }

  if (inserts.length > 0) {
    await storage.createLessonDays(inserts);
  }
  return { lessonsCreated: inserts.length };
}

async function resolveInstrument(storage: IStorage, plan: LearningPlan): Promise<string | null> {
  try {
    const re = await storage.getRepertoireEntryById?.(plan.repertoireEntryId);
    if (!re) return null;
    const piece = await storage.getPieceById?.(re.pieceId);
    return piece?.instrument ?? null;
  } catch {
    return null;
  }
}

function advancePhase(p: PhaseType): PhaseType {
  const idx = PHASE_TYPES.indexOf(p);
  if (idx < 0 || idx >= PHASE_TYPES.length - 1) return p;
  return PHASE_TYPES[idx + 1];
}

function demotePhase(p: PhaseType): PhaseType {
  const idx = PHASE_TYPES.indexOf(p);
  if (idx <= 0) return p;
  return PHASE_TYPES[idx - 1];
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.floor((db - da) / (1000 * 60 * 60 * 24));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(d.getUTCDate() + n);
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
