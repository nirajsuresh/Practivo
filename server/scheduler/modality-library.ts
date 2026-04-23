// Modality library for the v2 lesson scheduler.
//
// A "modality" is a variant of practice applied to a passage: tempo, rhythm,
// hand split, focus dimension. The same passage practiced at 60% tempo
// hands-separate with dotted rhythms is a different practice item than the
// same passage at 90% tempo hands-together with dynamics focus — both belong
// in the same learning journey, and good practice rotates among them.
//
// Each phase has a weighted palette of modalities appropriate to it. Passages
// with specific outstanding challenges bias the palette (e.g. a passage with
// "coordination" challenge gets more hands-separate modalities).

import type {
  ChallengeTag,
  ModalityKind,
  PhaseType,
  SessionTask,
  TaskFocus,
  TaskRole,
} from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Phase × Modality palette
// ─────────────────────────────────────────────────────────────────────────────
// Each phase has an ordered list of modality "slots". When composing multiple
// tasks for the same passage in a session, we draw from this list in order so
// the session has varied practice (e.g. slow-HS, then slow-HT, then medium-HT).

type ModalitySpec = {
  kind: ModalityKind;
  focus: TaskFocus;
  hands: "left" | "right" | "both";
  tempoPct: number; // % of target tempo
  /** Priority weight within phase — higher = more likely to be selected. */
  weight: number;
  /** Challenge tags this modality is well-suited to address. */
  addresses?: ChallengeTag[];
};

const PHASE_MODALITY_PALETTE: Record<PhaseType, ModalitySpec[]> = {
  decode: [
    { kind: "score_study", focus: "notes", hands: "both", tempoPct: 0, weight: 3 },
    { kind: "slow", focus: "notes", hands: "right", tempoPct: 50, weight: 4, addresses: ["coordination", "fingering"] },
    { kind: "slow", focus: "notes", hands: "left", tempoPct: 50, weight: 4, addresses: ["coordination", "fingering"] },
    { kind: "slow", focus: "fingering", hands: "right", tempoPct: 60, weight: 2, addresses: ["fingering"] },
    { kind: "slow", focus: "rhythm", hands: "both", tempoPct: 55, weight: 2, addresses: ["rhythm"] },
    { kind: "mental", focus: "memory", hands: "both", tempoPct: 0, weight: 1 },
  ],
  build: [
    { kind: "slow", focus: "notes", hands: "right", tempoPct: 60, weight: 3, addresses: ["coordination"] },
    { kind: "slow", focus: "notes", hands: "left", tempoPct: 60, weight: 3, addresses: ["coordination"] },
    { kind: "dotted", focus: "rhythm", hands: "right", tempoPct: 70, weight: 3, addresses: ["rhythm", "coordination"] },
    { kind: "dotted", focus: "rhythm", hands: "left", tempoPct: 70, weight: 3, addresses: ["rhythm", "coordination"] },
    { kind: "slow", focus: "notes", hands: "both", tempoPct: 60, weight: 4, addresses: ["coordination"] },
    { kind: "tempo_ramp", focus: "tempo", hands: "both", tempoPct: 75, weight: 3, addresses: ["tempo"] },
    { kind: "accent_shift", focus: "rhythm", hands: "both", tempoPct: 65, weight: 2, addresses: ["rhythm"] },
    { kind: "slow", focus: "fingering", hands: "right", tempoPct: 70, weight: 2, addresses: ["fingering"] },
  ],
  connect: [
    { kind: "bridging", focus: "transitions", hands: "both", tempoPct: 70, weight: 4, addresses: ["coordination"] },
    { kind: "with_lead_in", focus: "transitions", hands: "both", tempoPct: 75, weight: 3 },
    { kind: "with_tail", focus: "transitions", hands: "both", tempoPct: 75, weight: 3 },
    { kind: "straight", focus: "tempo", hands: "both", tempoPct: 80, weight: 2, addresses: ["tempo"] },
  ],
  shape: [
    { kind: "straight", focus: "memory", hands: "both", tempoPct: 85, weight: 4, addresses: ["memory"] },
    { kind: "runthrough", focus: "runthrough", hands: "both", tempoPct: 90, weight: 3, addresses: ["endurance"] },
    { kind: "tempo_ramp", focus: "tempo", hands: "both", tempoPct: 95, weight: 3, addresses: ["tempo"] },
    { kind: "mental", focus: "memory", hands: "both", tempoPct: 0, weight: 1, addresses: ["memory"] },
  ],
  perform: [
    { kind: "contrast_dynamics", focus: "dynamics", hands: "both", tempoPct: 95, weight: 4, addresses: ["dynamics"] },
    { kind: "articulation_drill", focus: "articulation", hands: "both", tempoPct: 90, weight: 3, addresses: ["voicing"] },
    { kind: "runthrough", focus: "runthrough", hands: "both", tempoPct: 100, weight: 4, addresses: ["endurance"] },
    { kind: "straight", focus: "voicing", hands: "both", tempoPct: 95, weight: 2, addresses: ["voicing"] },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Modality selection
// ─────────────────────────────────────────────────────────────────────────────

/** Pick N modalities for a passage given its phase and outstanding challenges.
 * Challenges bias the palette — modalities whose `addresses` overlap with the
 * passage's challenges get a priority boost. The returned list is ordered by
 * final weight (highest first) and contains distinct modalities. */
export function selectModalitiesForPassage(
  phase: PhaseType,
  challenges: ChallengeTag[],
  count: number,
): ModalitySpec[] {
  const palette = PHASE_MODALITY_PALETTE[phase] ?? [];
  const challengeSet = new Set(challenges);
  const scored = palette.map((spec) => {
    const overlap = (spec.addresses ?? []).filter((t) => challengeSet.has(t)).length;
    const boost = overlap * 2; // each matching challenge adds 2 to weight
    return { spec, score: spec.weight + boost };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((s) => s.spec);
}

// ─────────────────────────────────────────────────────────────────────────────
// Task generation
// ─────────────────────────────────────────────────────────────────────────────

/** Build a single practice task for a passage in a given modality. The label
 * and rationale are crafted to be musician-readable. */
export function buildPassageTask(args: {
  passageId: number;
  label: string;
  measureStart: number;
  measureEnd: number;
  phase: PhaseType;
  role: TaskRole;
  modality: ModalitySpec;
  durationMin: number;
  rationale?: string;
  priorityScore?: number;
  reasonCodes?: string[];
}): SessionTask {
  const { passageId, label, measureStart, measureEnd, phase, role, modality, durationMin, rationale, priorityScore, reasonCodes } = args;
  const handsLabel =
    modality.hands === "left" ? "Left hand" : modality.hands === "right" ? "Right hand" : "Hands together";
  const tempoLabel = modality.tempoPct > 0 ? ` @ ${modality.tempoPct}% tempo` : "";
  const modalityLabel = humanModality(modality.kind);
  const text = `${label} · ${handsLabel}${tempoLabel} · ${modalityLabel}`;
  return {
    text,
    passageId,
    phase,
    role,
    focus: modality.focus,
    modality: modality.kind,
    hands: modality.hands,
    tempoPct: modality.tempoPct > 0 ? modality.tempoPct : undefined,
    durationMin,
    measureStart,
    measureEnd,
    rationale,
    priorityScore,
    reasonCodes,
    completed: false,
  };
}

/** Build a warmup task (not passage-specific). */
export function buildWarmupTask(text: string, durationMin: number): SessionTask {
  return {
    text,
    role: "warmup",
    focus: "tempo",
    durationMin,
    completed: false,
  };
}

/** Build a run-through task spanning one or more passages. */
export function buildRunthroughTask(args: {
  label: string;
  measureStart: number;
  measureEnd: number;
  tempoPct: number;
  durationMin: number;
  rationale?: string;
  priorityScore?: number;
  reasonCodes?: string[];
}): SessionTask {
  return {
    text: `Run-through · bars ${args.measureStart}–${args.measureEnd} @ ${args.tempoPct}% tempo`,
    role: "runthrough",
    focus: "runthrough",
    modality: "runthrough",
    hands: "both",
    tempoPct: args.tempoPct,
    durationMin: args.durationMin,
    measureStart: args.measureStart,
    measureEnd: args.measureEnd,
    rationale: args.rationale,
    priorityScore: args.priorityScore,
    reasonCodes: args.reasonCodes,
    completed: false,
  };
}

/** Build a transition (bridging) task between two adjacent passages. */
export function buildTransitionTask(args: {
  fromPassageId: number;
  toPassageId: number;
  junctionStart: number; // last bar of from-passage - 1
  junctionEnd: number;   // first bar of to-passage + 1
  durationMin: number;
}): SessionTask {
  return {
    text: `Transition · bars ${args.junctionStart}–${args.junctionEnd} · link cleanly`,
    role: "transition",
    focus: "transitions",
    modality: "bridging",
    hands: "both",
    durationMin: args.durationMin,
    measureStart: args.junctionStart,
    measureEnd: args.junctionEnd,
    rationale: "Practice the junction between two learned passages so the transition becomes seamless.",
    completed: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Warmup library (instrument-aware)
// ─────────────────────────────────────────────────────────────────────────────

export function defaultWarmupsForInstrument(instrument: string | null | undefined): SessionTask[] {
  const norm = (instrument || "piano").toLowerCase();
  if (norm.includes("piano")) {
    return [
      buildWarmupTask("Slow scales in key of piece (2 octaves, hands together)", 3),
      buildWarmupTask("Hanon-style 5-finger patterns, both hands", 2),
    ];
  }
  if (norm.includes("violin") || norm.includes("viola") || norm.includes("cello")) {
    return [
      buildWarmupTask("Open-string bow tone, long notes at mf", 2),
      buildWarmupTask("Scales in key of piece — slow, listen for intonation", 3),
    ];
  }
  return [buildWarmupTask("Warm-up: 5 minutes in key of piece, slow and even", 5)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function humanModality(kind: ModalityKind): string {
  switch (kind) {
    case "straight": return "steady";
    case "slow": return "slow & deliberate";
    case "tempo_ramp": return "tempo ramp (slow → target)";
    case "dotted": return "dotted rhythm";
    case "reverse_dotted": return "reverse-dotted rhythm";
    case "triplets": return "triplet grouping";
    case "polyrhythm_3_2": return "polyrhythm 3:2";
    case "polyrhythm_4_3": return "polyrhythm 4:3";
    case "accent_shift": return "shifted accents";
    case "hands_separate_left": return "LH alone";
    case "hands_separate_right": return "RH alone";
    case "hands_together": return "hands together";
    case "mental": return "mental (away from instrument)";
    case "score_study": return "score study";
    case "contrast_dynamics": return "dynamic contrast";
    case "articulation_drill": return "articulation drill";
    case "with_lead_in": return "with lead-in bars";
    case "with_tail": return "with tail bars";
    case "bridging": return "bridging";
    case "runthrough": return "run-through";
    default: return kind;
  }
}

export { PHASE_MODALITY_PALETTE };
export type { ModalitySpec };
