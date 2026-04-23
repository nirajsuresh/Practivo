import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, boolean, unique, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  firstName: true,
  lastName: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const composers = pgTable("composers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  bio: text("bio"),
  birthYear: integer("birth_year"),
  deathYear: integer("death_year"),
  nationality: text("nationality"),
  imageUrl: text("image_url"),
  period: text("period"),
});

export const insertComposerSchema = createInsertSchema(composers).omit({ id: true });
export type InsertComposer = z.infer<typeof insertComposerSchema>;
export type Composer = typeof composers.$inferSelect;

export const pieces = pgTable("pieces", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  composerId: integer("composer_id").notNull().references(() => composers.id),
  instrument: text("instrument").default("Solo Piano"),
  imslpUrl: text("imslp_url"),
  keySignature: text("key_signature"),
  yearComposed: integer("year_composed"),
  difficulty: text("difficulty"),
});

export const insertPieceSchema = createInsertSchema(pieces).omit({ id: true });
export type InsertPiece = z.infer<typeof insertPieceSchema>;
export type Piece = typeof pieces.$inferSelect;

export const movements = pgTable("movements", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  pieceId: integer("piece_id").notNull().references(() => pieces.id),
});

export const insertMovementSchema = createInsertSchema(movements).omit({ id: true });
export type InsertMovement = z.infer<typeof insertMovementSchema>;
export type Movement = typeof movements.$inferSelect;

export const repertoireEntries = pgTable("repertoire_entries", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  composerId: integer("composer_id").notNull().references(() => composers.id),
  pieceId: integer("piece_id").notNull().references(() => pieces.id),
  movementId: integer("movement_id").references(() => movements.id),
  status: text("status").notNull().default("In Progress"),
  startedDate: text("started_date"),
  displayOrder: integer("display_order").notNull().default(0),
  progress: integer("progress").notNull().default(0),
  splitView: boolean("split_view").notNull().default(false),
  currentCycle: integer("current_cycle").notNull().default(1),
});

export const insertRepertoireEntrySchema = createInsertSchema(repertoireEntries).omit({ id: true });
export type InsertRepertoireEntry = z.infer<typeof insertRepertoireEntrySchema>;
export type RepertoireEntry = typeof repertoireEntries.$inferSelect;

// Milestone types in learning order
export const MILESTONE_TYPES = [
  "started",
  "read_through",
  "notes_learned",
  "up_to_speed",
  "memorized",
  "completed",
  "performed",
] as const;
export type MilestoneType = (typeof MILESTONE_TYPES)[number];

// ── Learning phase types (in pedagogical order) ──────────────────────────────
export const PHASE_TYPES = [
  "decode",
  "build",
  "connect",
  "shape",
  "perform",
] as const;
export type PhaseType = (typeof PHASE_TYPES)[number];

// ── Playing levels ───────────────────────────────────────────────────────────
export const PLAYING_LEVELS = ["beginner", "intermediate", "advanced", "professional"] as const;
export type PlayingLevel = (typeof PLAYING_LEVELS)[number];

export const PLAYING_LEVEL_LABELS: Record<PlayingLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  professional: "Professional",
};

// ── Phase allocation constants ───────────────────────────────────────────────
export const PHASE_BASE_EFFORT: Record<PhaseType, number> = {
  decode: 3, build: 4, connect: 2, shape: 2, perform: 2,
};

export const CHUNK_LEVEL_PHASES: Set<PhaseType> = new Set<PhaseType>(["decode", "build"]);

export const CHUNK_SIZE_BY_LEVEL: Record<PlayingLevel, number> = {
  beginner: 3, intermediate: 4, advanced: 6, professional: 8,
};

export function computeChunkSizeShared(sectionBars: number, difficulty: number, playingLevel: PlayingLevel): number {
  const base = CHUNK_SIZE_BY_LEVEL[playingLevel] ?? 4;
  const diffAdj = difficulty >= 4 ? -1 : difficulty <= 2 ? 1 : 0;
  const target = Math.max(2, base + diffAdj);
  return Math.max(target, Math.ceil(sectionBars / 8));
}

export const LEVEL_MULTIPLIER: Record<PlayingLevel, number> = {
  beginner: 1.5, intermediate: 1.0, advanced: 0.7, professional: 0.5,
};

export const DIFFICULTY_MULTIPLIER: Record<number, number> = {
  1: 0.5, 2: 0.7, 3: 0.85, 4: 1.0, 5: 1.2, 6: 1.45, 7: 1.7,
};

export const PHASE_LABELS: Record<PhaseType, { label: string; description: string }> = {
  decode:  { label: "Note by Note",    description: "Read notes and rhythm hands separate, slow tempo — map the score" },
  build:   { label: "Bar Work",        description: "Drill short segments until each feels automatic and stable" },
  connect: { label: "String Together", description: "Join segments into longer phrases; work transitions between chunks" },
  shape:   { label: "Consolidate",     description: "Build memory and consistency; fix weak spots at tempo" },
  perform: { label: "Bring to Life",   description: "Full musical expression — dynamics, phrasing, full run-throughs" },
};

export const pieceMilestones = pgTable("piece_milestones", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  pieceId: integer("piece_id").notNull().references(() => pieces.id),
  movementId: integer("movement_id").references(() => movements.id),
  cycleNumber: integer("cycle_number").notNull().default(1),
  milestoneType: text("milestone_type").notNull(),
  achievedAt: text("achieved_at").notNull(), // ISO date string "YYYY-MM-DD"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [unique("piece_milestones_unique").on(table.userId, table.pieceId, table.movementId, table.cycleNumber, table.milestoneType)]);

export const insertPieceMilestoneSchema = createInsertSchema(pieceMilestones).omit({ id: true, createdAt: true });
export type InsertPieceMilestone = z.infer<typeof insertPieceMilestoneSchema>;
export type PieceMilestone = typeof pieceMilestones.$inferSelect;

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  displayName: text("display_name").notNull(),
  instrument: text("instrument"),
  level: text("level"),
  playingLevel: text("playing_level"), // "beginner" | "intermediate" | "advanced" | "professional"
  location: text("location"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({ id: true });
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;

export const pieceAnalyses = pgTable("piece_analyses", {
  id: serial("id").primaryKey(),
  pieceId: integer("piece_id").notNull().references(() => pieces.id).unique(),
  analysis: text("analysis").notNull(),
  wikiUrl: text("wiki_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPieceAnalysisSchema = createInsertSchema(pieceAnalyses).omit({ id: true, createdAt: true });
export type InsertPieceAnalysis = z.infer<typeof insertPieceAnalysisSchema>;
export type PieceAnalysis = typeof pieceAnalyses.$inferSelect;

// ── Sheet music (declared before learning_plans FK) ─────────────────────────

export const sheetMusic = pgTable("sheet_music", {
  id: serial("id").primaryKey(),
  pieceId: integer("piece_id").references(() => pieces.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  fileUrl: text("file_url").notNull(), // path to stored PDF
  source: text("source").notNull().default("upload"), // upload | database
  processingStatus: text("processing_status").notNull().default("pending"), // pending | processing | done | failed
  pageCount: integer("page_count"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const insertSheetMusicSchema = createInsertSchema(sheetMusic).omit({ id: true, uploadedAt: true });
export type InsertSheetMusic = z.infer<typeof insertSheetMusicSchema>;
export type SheetMusic = typeof sheetMusic.$inferSelect;

// ── Learning Plan Tables ────────────────────────────────────────────────────

export const learningPlans = pgTable("learning_plans", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  /** Null for exercise and sight_reading blocks (no repertoire entry required). */
  repertoireEntryId: integer("repertoire_entry_id").references(() => repertoireEntries.id),
  /** Sheet music used for this plan (bars, thumbnails); set when plan is created from the wizard */
  sheetMusicId: integer("sheet_music_id").references(() => sheetMusic.id),
  dailyPracticeMinutes: integer("daily_practice_minutes").notNull().default(30),
  targetCompletionDate: text("target_completion_date"), // YYYY-MM-DD
  totalMeasures: integer("total_measures"), // populated after sheet music processed
  status: text("status").notNull().default("setup"), // setup | active | paused | completed
  /** Piece-block checklist progression. Advances as user completes each setup step.
   * 'needs_score' | 'needs_bars' | 'needs_sections' | 'needs_generation' | 'complete'
   * Non-piece blocks (exercise/sight_reading) skip straight to 'complete'. */
  setupState: text("setup_state").notNull().default("complete"),
  /** True when the user explicitly skipped section marking rather than completing it. */
  sectionsSkipped: boolean("sections_skipped").notNull().default(false),
  /** Scheduler version: 1 = legacy waterfall, 2 = passage-state-machine scheduler. */
  schedulerVersion: integer("scheduler_version").notNull().default(1),
  /** Timestamp of most recent dynamic replan (v2 only). */
  lastReplanAt: timestamp("last_replan_at"),
  /** Block type determines how this plan participates in the unified daily session. */
  blockType: text("block_type").notNull().default("piece"), // 'piece' | 'exercise' | 'sight_reading'
  /** How often this block is scheduled. */
  cadence: text("cadence").notNull().default("daily"), // 'daily' | 'weekdays' | 'weekends' | 'custom'
  /** Weekday numbers [0–6] for custom cadence; null for non-custom. */
  cadenceDays: jsonb("cadence_days").$type<number[]>(),
  /** Position in the home page drag-and-drop order. Lower = earlier in session. */
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLearningPlanSchema = createInsertSchema(learningPlans).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLearningPlan = z.infer<typeof insertLearningPlanSchema>;
export type LearningPlan = typeof learningPlans.$inferSelect;

export const measures = pgTable("measures", {
  id: serial("id").primaryKey(),
  sheetMusicId: integer("sheet_music_id").notNull().references(() => sheetMusic.id),
  measureNumber: integer("measure_number").notNull(),
  pageNumber: integer("page_number").notNull(),
  boundingBox: jsonb("bounding_box"), // { x, y, w, h } as fraction of page dimensions
  imageUrl: text("image_url"), // path to cropped bar image
  movementNumber: integer("movement_number").notNull().default(1), // 1-indexed; bar numbers reset per movement
  userCorrected: boolean("user_corrected").notNull().default(false),
  confirmedAt: timestamp("confirmed_at"),
  displayLabel: text("display_label"),
  ignored: boolean("ignored").notNull().default(false),
  movementId: integer("movement_id").references(() => movements.id),
});

export const insertMeasureSchema = createInsertSchema(measures).omit({ id: true });
export type InsertMeasure = z.infer<typeof insertMeasureSchema>;
export type Measure = typeof measures.$inferSelect;

// ── Sheet music page images (stored in R2; one row per rendered page) ─────────

export const sheetMusicPages = pgTable("sheet_music_pages", {
  id: serial("id").primaryKey(),
  sheetMusicId: integer("sheet_music_id").notNull().references(() => sheetMusic.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  imageUrl: text("image_url").notNull(), // full R2 public URL
  width: integer("width").notNull(),
  height: integer("height").notNull(),
});

export type SheetMusicPage = typeof sheetMusicPages.$inferSelect;

// ── Plan Sections (user-defined named regions within a plan) ─────────────────

export const planSections = pgTable("plan_sections", {
  id: serial("id").primaryKey(),
  learningPlanId: integer("learning_plan_id").notNull().references(() => learningPlans.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g. "Exposition", "Development"
  measureStart: integer("measure_start").notNull(),
  measureEnd: integer("measure_end").notNull(),
  difficulty: integer("difficulty").notNull().default(4), // 1 (easiest) … 7 (hardest); 4 = baseline/unmarked
  ignored: boolean("ignored").notNull().default(false), // excluded from the schedule; kept for UI display
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlanSectionSchema = createInsertSchema(planSections).omit({ id: true, createdAt: true });
export type InsertPlanSection = z.infer<typeof insertPlanSectionSchema>;
export type PlanSection = typeof planSections.$inferSelect;

// ── Plan Section Phases (ordered phase list per section) ─────────────────────

export const planSectionPhases = pgTable("plan_section_phases", {
  id: serial("id").primaryKey(),
  sectionId: integer("section_id").notNull().references(() => planSections.id, { onDelete: "cascade" }),
  phaseType: text("phase_type").notNull(), // one of PHASE_TYPES
  displayOrder: integer("display_order").notNull().default(0),
  /** Number of lesson-days allocated to this phase for this section */
  repetitions: integer("repetitions").notNull().default(1),
}, (table) => [unique("plan_section_phase_unique").on(table.sectionId, table.phaseType)]);

export const insertPlanSectionPhaseSchema = createInsertSchema(planSectionPhases).omit({ id: true });
export type InsertPlanSectionPhase = z.infer<typeof insertPlanSectionPhaseSchema>;
export type PlanSectionPhase = typeof planSectionPhases.$inferSelect;

export const lessonDays = pgTable("lesson_days", {
  id: serial("id").primaryKey(),
  learningPlanId: integer("learning_plan_id").notNull().references(() => learningPlans.id),
  scheduledDate: text("scheduled_date").notNull(), // YYYY-MM-DD
  measureStart: integer("measure_start").notNull(),
  measureEnd: integer("measure_end").notNull(),
  status: text("status").notNull().default("upcoming"), // upcoming | active | completed | skipped
  userNotes: text("user_notes"),
  completedAt: timestamp("completed_at"),
  /** Structured session plan: array of sections each with tasks */
  tasks: jsonb("tasks").$type<SessionSection[]>(),
  /** Set when generated via per-section-phase algorithm; null for flat-distribution lessons */
  sectionId: integer("section_id").references(() => planSections.id),
  /** One of PHASE_TYPES; null for flat-distribution lessons */
  phaseType: text("phase_type"),
});

export type SessionTask = {
  /** Human-readable task line. Always present (legacy + v2). */
  text: string;
  /** Legacy free-form tag. */
  tag?: string;

  // ── v2 fields (scheduler v2; all optional for back-compat with legacy rows) ──
  /** The passage this task targets (null for generic warmup/misc). */
  passageId?: number;
  /** Phase this task operates in — drives UI coloring + rationale. */
  phase?: PhaseType;
  /** Session-structural role: where this task sits in the session arc. */
  role?: TaskRole;
  /** Primary focus dimension for this task. */
  focus?: TaskFocus;
  /** Modality (practice variant) applied to the passage. */
  modality?: ModalityKind;
  /** Which hands are engaged. */
  hands?: "left" | "right" | "both";
  /** Target tempo as percent of performance tempo (e.g. 60 = 60%). */
  tempoPct?: number;
  /** Absolute target BPM, if known. */
  tempoBpm?: number;
  /** Allocated minutes for this task. */
  durationMin?: number;
  /** Explicit measure range this task covers (redundant with passage but useful for UI). */
  measureStart?: number;
  measureEnd?: number;
  /** Explicit rep count (e.g. "3 clean run-throughs"). */
  repetitions?: number;
  /** User-visible success criterion (e.g. "3 clean at 80 BPM"). */
  successCriteria?: string;
  /** Short rationale ("why this task") for UI transparency. */
  rationale?: string;
  /** Utility priority score from M2 scorer — higher = more urgently needed. */
  priorityScore?: number;
  /** Reason codes explaining why this task was selected (M2). */
  reasonCodes?: string[];
  /** Mark-done tracking for the in-session checklist. */
  completed?: boolean;
};

export type SessionSection = {
  type: string;        // e.g. "warmup" | "piece_practice" | "sight_reading" | "deep_work" | "new_material" | "consolidation" | "review" | "runthrough"
  label: string;       // display label
  durationMin?: number;
  tasks: SessionTask[];
  sectionId?: number;  // plan_sections.id when generated by waterfall scheduler
  phaseType?: string;  // one of PHASE_TYPES when generated by waterfall scheduler
  measureStart?: number; // explicit measure range; when absent, parsed from label string
  measureEnd?: number;   // explicit measure range; when absent, parsed from label string
  /** v2: structural role of this block within the session arc. */
  role?: TaskRole;
  // ── Unified session fields — set when assembled across multiple blocks ───────
  /** learningPlans.id this section came from; used to route completion. */
  planId?: number;
  /** lessonDays.id this section came from; marked complete at session end. */
  lessonDayId?: number;
  /** Block type for UI rendering decisions (score panel, placeholders). */
  blockType?: string;
  /** Sheet music id for the score panel; null for exercise/sight-reading sections. */
  sheetMusicId?: number;
};

export const insertLessonDaySchema = createInsertSchema(lessonDays).omit({ id: true });
export type InsertLessonDay = z.infer<typeof insertLessonDaySchema>;
export type LessonDay = typeof lessonDays.$inferSelect;

// ── Community Scores ─────────────────────────────────────────────────────────
// One canonical community-contributed bar analysis per (piece, movement) scope.
// movementId = null means "whole piece"; movementId set means a specific movement.

export const communityScores = pgTable("community_scores", {
  id: serial("id").primaryKey(),
  pieceId: integer("piece_id").notNull().references(() => pieces.id),
  movementId: integer("movement_id").references(() => movements.id),
  sheetMusicId: integer("sheet_music_id").notNull().references(() => sheetMusic.id),
  submittedByUserId: varchar("submitted_by_user_id", { length: 100 })
    .notNull()
    .references(() => users.id),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  description: text("description"),
  downloadCount: integer("download_count").default(0).notNull(),
});

export const insertCommunityScoreSchema = createInsertSchema(communityScores).omit({ id: true, submittedAt: true });
export type InsertCommunityScore = z.infer<typeof insertCommunityScoreSchema>;
export type CommunityScore = typeof communityScores.$inferSelect;

export const measureProgress = pgTable("measure_progress", {
  id: serial("id").primaryKey(),
  learningPlanId: integer("learning_plan_id").notNull().references(() => learningPlans.id),
  measureId: integer("measure_id").notNull().references(() => measures.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("not_started"), // not_started | learning | learned | mastered
  notes: text("notes"),
  lastPracticedAt: text("last_practiced_at"), // YYYY-MM-DD
}, (table) => [unique("measure_progress_unique").on(table.learningPlanId, table.measureId)]);

export const insertMeasureProgressSchema = createInsertSchema(measureProgress).omit({ id: true });
export type InsertMeasureProgress = z.infer<typeof insertMeasureProgressSchema>;
export type MeasureProgress = typeof measureProgress.$inferSelect;

// ── Bar Flags (per-session flags on individual bars) ─────────────────────────
// Event-scoped: one flag per bar per lesson day; tracks difficult bars during practice.

export const barFlags = pgTable("bar_flags", {
  id: serial("id").primaryKey(),
  learningPlanId: integer("learning_plan_id").notNull().references(() => learningPlans.id),
  lessonDayId: integer("lesson_day_id").notNull().references(() => lessonDays.id),
  measureId: integer("measure_id").notNull().references(() => measures.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  note: text("note"),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [unique("bar_flag_lesson_measure_unique").on(table.lessonDayId, table.measureId)]);

export const insertBarFlagSchema = createInsertSchema(barFlags).omit({ id: true, createdAt: true });
export type InsertBarFlag = z.infer<typeof insertBarFlagSchema>;
export type BarFlag = typeof barFlags.$inferSelect;

// ── Session Task Feedback (end-of-session modal; one row per task per session) ─

export const sessionTaskFeedback = pgTable("session_task_feedback", {
  id: serial("id").primaryKey(),
  lessonDayId: integer("lesson_day_id").notNull().references(() => lessonDays.id, { onDelete: "cascade" }),
  passageId: integer("passage_id").references(() => passages.id, { onDelete: "set null" }),
  learningPlanId: integer("learning_plan_id").notNull().references(() => learningPlans.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  comfort: text("comfort"),            // 'easier' | 'expected' | 'harder'
  completion: text("completion"),      // 'done' | 'partial' | 'skipped'
  flags: jsonb("flags").$type<string[]>(),  // ['needs-daily','ready-larger-chunk','transition-issue','memory-weak','tempo-weak']
  minutesSpent: integer("minutes_spent"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSessionTaskFeedbackSchema = createInsertSchema(sessionTaskFeedback).omit({ id: true, createdAt: true });
export type InsertSessionTaskFeedback = z.infer<typeof insertSessionTaskFeedbackSchema>;
export type SessionTaskFeedback = typeof sessionTaskFeedback.$inferSelect;

/** Aggregated flag data per measure across all lessons in a plan */
export type BarFlagSummary = {
  measureId: number;
  measureNumber: number;
  imageUrl: string | null;
  flagCount: number;
  resolvedCount: number;
};

// ── Plan Suggestions (server-generated, user-actionable) ─────────────────────

export const planSuggestions = pgTable("plan_suggestions", {
  id: serial("id").primaryKey(),
  learningPlanId: integer("learning_plan_id").notNull().references(() => learningPlans.id),
  triggeredByLessonId: integer("triggered_by_lesson_id").references(() => lessonDays.id),
  /** 'extra_sessions' | 'revisit_phase' */
  type: text("type").notNull(),
  sectionId: integer("section_id").references(() => planSections.id),
  /** { message, extraSessions?, fromPhase?, targetPhase? } */
  payload: jsonb("payload").notNull().$type<SuggestionPayload>(),
  /** pending | accepted | dismissed */
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SuggestionPayload = {
  message: string;
  extraSessions?: number;
  fromPhase?: PhaseType;
  targetPhase?: PhaseType;
};

export const insertPlanSuggestionSchema = createInsertSchema(planSuggestions).omit({ id: true, createdAt: true });
export type InsertPlanSuggestion = z.infer<typeof insertPlanSuggestionSchema>;
export type PlanSuggestion = typeof planSuggestions.$inferSelect;

// ── Bar Annotations (durable user notes on bar ranges, across sessions) ───────

export const barAnnotations = pgTable("bar_annotations", {
  id: serial("id").primaryKey(),
  learningPlanId: integer("learning_plan_id").notNull().references(() => learningPlans.id, { onDelete: "cascade" }),
  lessonDayId: integer("lesson_day_id").references(() => lessonDays.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  measureStart: integer("measure_start").notNull(),
  measureEnd: integer("measure_end").notNull(),
  text: text("text").notNull(),
  sessionNumber: integer("session_number"),
  sessionDate: text("session_date"), // YYYY-MM-DD
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBarAnnotationSchema = createInsertSchema(barAnnotations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBarAnnotation = z.infer<typeof insertBarAnnotationSchema>;
export type BarAnnotation = typeof barAnnotations.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler v2 — passage-state-machine model
// ─────────────────────────────────────────────────────────────────────────────
// A passage is a fine-grained unit of practice (typically 4–16 bars) that has
// its own independent learning state (phase, maturity, spaced-repetition
// parameters, outstanding challenges). Sessions are composed from the pool of
// active passages based on their current state rather than marching all bars
// through phases in lockstep.

export const PASSAGE_KINDS = ["primary", "transition", "linking", "runthrough"] as const;
export type PassageKind = (typeof PASSAGE_KINDS)[number];

export const TASK_ROLES = [
  "warmup",
  "deep_work",
  "new_material",
  "consolidation",
  "review",
  "transition",
  "runthrough",
] as const;
export type TaskRole = (typeof TASK_ROLES)[number];

export const TASK_FOCUSES = [
  "notes",
  "rhythm",
  "dynamics",
  "articulation",
  "fingering",
  "memory",
  "voicing",
  "transitions",
  "runthrough",
  "tempo",
] as const;
export type TaskFocus = (typeof TASK_FOCUSES)[number];

export const MODALITY_KINDS = [
  "straight",
  "slow",
  "tempo_ramp",
  "dotted",
  "reverse_dotted",
  "triplets",
  "polyrhythm_3_2",
  "polyrhythm_4_3",
  "accent_shift",
  "hands_separate_left",
  "hands_separate_right",
  "hands_together",
  "mental",
  "score_study",
  "contrast_dynamics",
  "articulation_drill",
  "with_lead_in",
  "with_tail",
  "bridging",
  "runthrough",
] as const;
export type ModalityKind = (typeof MODALITY_KINDS)[number];

export const CHALLENGE_TAGS = [
  "coordination",
  "tempo",
  "rhythm",
  "dynamics",
  "fingering",
  "memory",
  "voicing",
  "endurance",
  "leaps",
  "polyphony",
] as const;
export type ChallengeTag = (typeof CHALLENGE_TAGS)[number];

// Default review interval per phase (days) — used to seed FSRS stability when a
// passage enters a phase and as a fallback when no review history exists.
export const PHASE_REVIEW_INTERVAL_DAYS: Record<PhaseType, number> = {
  decode: 1,
  build: 2,
  connect: 3,
  shape: 5,
  perform: 7,
};

// Initial FSRS stability (days) when a passage is first introduced.
export const INITIAL_SR_STABILITY = 1.0;

// Passage: a fine-grained practice unit within a plan. May be derived
// automatically from a section (auto-subdivided by difficulty) or created
// explicitly by the user. Each passage has its own state machine.
export const passages = pgTable("passages", {
  id: serial("id").primaryKey(),
  learningPlanId: integer("learning_plan_id").notNull().references(() => learningPlans.id, { onDelete: "cascade" }),
  sectionId: integer("section_id").references(() => planSections.id, { onDelete: "set null" }),
  kind: text("kind").notNull().default("primary"), // one of PASSAGE_KINDS
  label: text("label"), // optional display name, e.g. "Opening theme"
  measureStart: integer("measure_start").notNull(),
  measureEnd: integer("measure_end").notNull(),
  /** Current estimated difficulty on a 1–10 scale (finer than section's 1–7).
   * Updated over time based on observed struggle (flags, tempo achieved, user rating). */
  difficulty: integer("difficulty").notNull().default(5),
  /** Challenge profile — which dimensions make this passage hard. Drives modality selection. */
  challenges: jsonb("challenges").$type<ChallengeTag[]>().default(sql`'[]'::jsonb`),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPassageSchema = createInsertSchema(passages).omit({ id: true, createdAt: true });
export type InsertPassage = z.infer<typeof insertPassageSchema>;
export type Passage = typeof passages.$inferSelect;

// Per-passage learning state. One row per (passage, plan). Updated after every
// session that touches the passage.
export const passageProgress = pgTable("passage_progress", {
  id: serial("id").primaryKey(),
  passageId: integer("passage_id").notNull().references(() => passages.id, { onDelete: "cascade" }),
  learningPlanId: integer("learning_plan_id").notNull().references(() => learningPlans.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  /** One of PHASE_TYPES. Starts at "orient", advances (or regresses) based on performance. */
  currentPhase: text("current_phase").notNull().default("orient"),
  /** ISO date "YYYY-MM-DD" when the passage entered its current phase. */
  phaseStartedAt: text("phase_started_at"),
  /** Number of sessions the passage has been touched while in the current phase. */
  phaseTouchCount: integer("phase_touch_count").notNull().default(0),
  /** Overall mastery estimate 0–1. Aggregates phase progress + flag rate + user ratings. */
  maturity: integer("maturity").notNull().default(0), // stored as integer 0–100 (percent) for simplicity
  /** FSRS-style stability: how many days can elapse before retention begins to degrade. */
  srStability: integer("sr_stability").notNull().default(1), // days
  /** FSRS-style inherent difficulty for this musician (1–10). Updates from user ratings + flags. */
  srDifficulty: integer("sr_difficulty").notNull().default(5),
  /** ISO date of most recent review (session that touched this passage). */
  lastReviewedAt: text("last_reviewed_at"),
  /** ISO date when the passage is next due for review (lastReviewedAt + srStability). */
  nextDueAt: text("next_due_at"),
  /** Total times the passage has been reviewed. */
  reviewCount: integer("review_count").notNull().default(0),
  /** Times the passage regressed a phase or had >threshold flags. */
  lapseCount: integer("lapse_count").notNull().default(0),
  /** Outstanding challenge tags — dynamically updated. Drives modality selection. */
  outstandingChallenges: jsonb("outstanding_challenges").$type<ChallengeTag[]>().default(sql`'[]'::jsonb`),
  /** Flag count from most recent session (for quick lookups). */
  lastFlagCount: integer("last_flag_count").notNull().default(0),
  /** ISO date when this passage was first introduced in the plan. */
  introducedAt: text("introduced_at"),
  /** ISO date when this passage reached full mastery and no longer needs active practice. */
  retiredAt: text("retired_at"),
  /** When true, this passage appears in every session until 3+ consecutive clean sessions
   * AND maturity ≥ 80 auto-clears it. Set on regression (rating ≤ 2 or lapse). */
  dailyMaintenanceFlag: boolean("daily_maintenance_flag").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [unique("passage_progress_unique").on(table.passageId, table.learningPlanId)]);

export const insertPassageProgressSchema = createInsertSchema(passageProgress).omit({ id: true, updatedAt: true });
export type InsertPassageProgress = z.infer<typeof insertPassageProgressSchema>;
export type PassageProgress = typeof passageProgress.$inferSelect;

// ── Practice Sessions (unified daily sessions across all blocks) ─────────────
// One row per user per calendar day. Assembles tasks from all active blocks
// scheduled for that day. The session page renders this as a single scroll-snap flow.

export type PracticeSessionBlock = {
  planId: number;
  lessonDayId: number;
  blockType: string;      // 'piece' | 'exercise' | 'sight_reading'
  blockName: string;      // display name (piece title or "Exercises" etc.)
  timeMin: number;        // allocated minutes for this block
  isOptional: boolean;    // true when block's cadence doesn't include today
  sheetMusicId?: number;  // piece blocks only
};

export const practiceSessions = pgTable("practice_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  sessionDate: text("session_date").notNull(), // YYYY-MM-DD
  status: text("status").notNull().default("upcoming"), // upcoming | active | completed
  /** Snapshot of block order and metadata at session creation time. */
  blocks: jsonb("blocks").notNull().$type<PracticeSessionBlock[]>().default(sql`'[]'::jsonb`),
  /** Assembled SessionSection[] from all blocks (in block order). */
  tasks: jsonb("tasks").notNull().$type<SessionSection[]>().default(sql`'[]'::jsonb`),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [unique("practice_sessions_user_date_unique").on(table.userId, table.sessionDate)]);

export const insertPracticeSessionSchema = createInsertSchema(practiceSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPracticeSession = z.infer<typeof insertPracticeSessionSchema>;
export type PracticeSession = typeof practiceSessions.$inferSelect;
