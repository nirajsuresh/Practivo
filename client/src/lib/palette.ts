/**
 * Feature palette — light ivory surfaces (#F4F1EA, #E9E5DC) + soft gold & sage.
 * Golds: #EADDC8 / #DCCAA6 / #C8B388 · Greens: #729E8F / #9BBBAD
 */

// ── Status (piece learning) — contrast on ivory / secondary surface ───────────
export const STATUS_DOT: Record<string, string> = {
  "Want to learn": "#8A877F",
  "Up next": "#C8B388",
  "In Progress": "#729E8F",
  "Maintaining": "#DCCAA6",
  "Resting": "#5C5A54",
};

export const STATUS_BADGE: Record<string, string> = {
  "Want to learn": "bg-[#E9E5DC] text-[#1C1C1A] border-[#D6D1C7]",
  "Up next": "bg-[#EADDC8]/50 text-[#1C1C1A] border-[#DCCAA6]",
  "In Progress": "bg-[#729E8F]/14 text-[#1C1C1A] border-[#729E8F]",
  "Maintaining": "bg-[#DCCAA6]/45 text-[#1C1C1A] border-[#C8B388]",
  "Resting": "bg-[#D6D1C7]/60 text-[#5C5A54] border-[#8A877F]/50",
};

// ── Milestones ───────────────────────────────────────────────────────────────
export const MILESTONE_DOT: Record<string, string> = {
  started: "#729E8F",
  read_through: "#729E8F",
  notes_learned: "#729E8F",
  up_to_speed: "#729E8F",
  memorized: "#729E8F",
  completed: "#C8B388",
  performed: "#9BBBAD",
};

export const MILESTONE_BG: Record<string, string> = {
  started: "bg-[#729E8F]/10",
  read_through: "bg-[#729E8F]/10",
  notes_learned: "bg-[#729E8F]/10",
  up_to_speed: "bg-[#729E8F]/10",
  memorized: "bg-[#729E8F]/10",
  completed: "bg-[#DCCAA6]/18",
  performed: "bg-[#9BBBAD]/18",
};

export const MILESTONE_BORDER: Record<string, string> = {
  started: "border-[#729E8F]",
  read_through: "border-[#729E8F]",
  notes_learned: "border-[#729E8F]",
  up_to_speed: "border-[#729E8F]",
  memorized: "border-[#729E8F]",
  completed: "border-[#C8B388]",
  performed: "border-[#9BBBAD]",
};

// ── Brand / accent ───────────────────────────────────────────────────────────
export const BRAND = {
  primary: "#1C1C1A",
  primaryHover: "#629084",
  primaryMuted: "rgba(220, 202, 166, 0.28)",
  primaryMutedBorder: "rgba(200, 179, 136, 0.42)",
  logo: "#C8B388",
  accent: "#DCCAA6",
  cyan: "#729E8F",
  red: "#B54A4A",
} as const;

export const PROGRESS = {
  completed: STATUS_DOT["Maintaining"],
  high: STATUS_DOT["In Progress"],
  low: STATUS_DOT["Up next"],
} as const;

export function getProgressColor(pct: number): string {
  if (pct >= 100) return PROGRESS.completed;
  if (pct >= 60) return PROGRESS.high;
  return PROGRESS.low;
}

// ── Activity feed ───────────────────────────────────────────────────────────
export const ACTIVITY = {
  status: { border: "border-l-[#729E8F]", iconBg: "bg-[#729E8F]/10", iconColor: "text-[#629084]" },
  added: { border: "border-l-[#C8B388]", iconBg: "bg-[#DCCAA6]/18", iconColor: "text-[#8B7D5C]" },
  milestone: { border: "border-l-[#DCCAA6]", iconBg: "bg-[#EADDC8]/28", iconColor: "text-[#5C5A54]" },
  recording: { border: "border-l-[#B54A4A]", iconBg: "bg-[#B54A4A]/12", iconColor: "text-[#8f2f2f]" },
} as const;

// ── Era distribution ──────────────────────────────────────────────────────────
export const ERA_DOT: Record<string, string> = {
  Renaissance: "#EADDC8",
  Baroque: "#DCCAA6",
  Classical: "#729E8F",
  Romantic: "#B54A4A",
  Impressionist: "#9BBBAD",
  Modern: "#7b5ea7",
  Contemporary: "#A8C4BC",
  Other: "#8A877F",
};

export const ERA_BADGE: Record<string, string> = {
  Renaissance: "bg-[#EADDC8]/45 text-[#1C1C1A]",
  Baroque: "bg-[#DCCAA6]/35 text-[#1C1C1A]",
  Classical: "bg-[#729E8F]/12 text-[#1C1C1A]",
  Romantic: "bg-[#B54A4A]/15 text-[#5c2222]",
  Impressionist: "bg-[#9BBBAD]/22 text-[#1C1C1A]",
  Modern: "bg-[#7b5ea7]/18 text-[#3d2f5c]",
  Contemporary: "bg-[#A8C4BC]/28 text-[#1C1C1A]",
  Other: "bg-[#E9E5DC] text-[#5C5A54]",
};

// ── Difficulty badges ──────────────────────────────────────────────────────
export const DIFFICULTY_BADGE: Record<string, string> = {
  Beginner: "bg-[#E9E5DC] text-[#1C1C1A]",
  Intermediate: "bg-[#729E8F]/10 text-[#1C1C1A]",
  Advanced: "bg-[#DCCAA6]/30 text-[#1C1C1A]",
  Expert: "bg-[#B54A4A]/15 text-[#5c2222]",
};

// ── Discussion/tag badges ────────────────────────────────────────────────────
export const TAG_BADGE: Record<string, string> = {
  General: "bg-[#E9E5DC] text-[#5C5A54]",
  "Tips & Technique": "bg-[#729E8F]/10 text-[#1C1C1A]",
  Interpretation: "bg-[#DCCAA6]/22 text-[#1C1C1A]",
  Help: "bg-[#B54A4A]/12 text-[#6b2828]",
};

// ── Video type badges ─────────────────────────────────────────────────────────
export const VIDEO_TYPE_BADGE: Record<string, string> = {
  Performance: "bg-[#B54A4A]/14 text-[#6b2828]",
  Analysis: "bg-[#729E8F]/10 text-[#1C1C1A]",
  Masterclass: "bg-[#DCCAA6]/22 text-[#1C1C1A]",
};

// ── Section colors (learning plan sections) ──────────────────────────────────
export const SECTION_COLORS = [
  { bg: "rgba(99,102,241,0.15)",  border: "#6366f1" },   // indigo
  { bg: "rgba(34,197,94,0.15)",   border: "#22c55e" },   // green
  { bg: "rgba(249,115,22,0.15)",  border: "#f97316" },   // orange
  { bg: "rgba(168,85,247,0.15)",  border: "#a855f7" },   // purple
  { bg: "rgba(20,184,166,0.15)",  border: "#14b8a6" },   // teal
  { bg: "rgba(234,179,8,0.15)",   border: "#eab308" },   // yellow
] as const;

export function getSectionColor(index: number) {
  return SECTION_COLORS[index % SECTION_COLORS.length];
}


/**
 * Fixed per-phase colors — temperature ramp from cool (early learning) to warm (mastery).
 * Cornflower → Teal → Forest → Amber → Brick.
 * Each step reads as "further along" so a glance at the score shows where in the journey
 * a passage sits.
 */
export const PHASE_COLORS: Record<string, { border: string; bg: string }> = {
  decode:  { border: "#4a80d2", bg: "rgba(74,128,210,0.13)"  }, // cornflower — analytical, first encounter
  build:   { border: "#2e9e8e", bg: "rgba(46,158,142,0.13)"  }, // teal — methodical drilling
  connect: { border: "#5e9f65", bg: "rgba(94,159,101,0.13)"  }, // forest — bridging, flourishing
  shape:   { border: "#c8953a", bg: "rgba(200,149,58,0.13)"  }, // amber — warmth, expression forming
  perform: { border: "#b84545", bg: "rgba(184,69,69,0.13)"   }, // brick — full voice, performance
};

/** Return the fixed color for a given phase type. */
export function getPhaseColor(phaseType: string): { border: string; bg: string } {
  return PHASE_COLORS[phaseType] ?? { border: "#94a3b8", bg: "rgba(148,163,184,0.15)" };
}

// ── Surfaces ────────────────────────────────────────────────────────────────
export const SURFACE = {
  card: "#F4F1EA",
  cardBorder: "border-[#D6D1C7]",
} as const;

// ── Semantic ────────────────────────────────────────────────────────────────
export const SEMANTIC = {
  success: "#729E8F",
  destructive: "#B54A4A",
} as const;

// ── Star rating ───────────────────────────────────────────────────────────
export const RATING = {
  filled: "#DCCAA6",
  filledHalf: "rgba(220, 202, 166, 0.55)",
  empty: "currentColor",
} as const;

// ── Learned (gold) vs performed (sage) — repertoire table / panes ─────────────
export const HIGHLIGHT = {
  learnedRow: "bg-gradient-to-r from-[#fdfbf7] to-[#f5ecda] hover:from-[#faf6ef] hover:to-[#efe4cf]",
  performedRow: "bg-gradient-to-r from-[#f4faf8] via-[#eaf4f1] to-[#dfece7] hover:from-[#eef6f3] hover:to-[#d3e5de]",
  learnedBorder: "border-l-[#DCCAA6]",
  performedBorder: "border-l-[#729E8F]",
  learnedEdge: "bg-[#DCCAA6]",
  performedEdge: "bg-[#729E8F]",
  learnedPill: "bg-[#DCCAA6] text-[#1C1C1A]",
  performedPill: "bg-[#C5DDD4] text-[#1C1C1A]",
  /** Music note next to performed pieces in table */
  performedMusicIcon: "text-[#629084]",
  performedIcon: "#629084",
} as const;
