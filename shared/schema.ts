import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, boolean, unique, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
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
  "orient",
  "decode",
  "chunk",
  "coordinate",
  "link",
  "stabilize",
  "shape",
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
  orient: 1, decode: 3, chunk: 2, coordinate: 3, link: 2, stabilize: 2, shape: 2,
};

export const CHUNK_LEVEL_PHASES: Set<PhaseType> = new Set<PhaseType>(["orient", "decode", "chunk", "coordinate"]);

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
  1: 0.6, 2: 0.8, 3: 1.0, 4: 1.3, 5: 1.6,
};

export const PHASE_LABELS: Record<PhaseType, { label: string; description: string }> = {
  orient:     { label: "Sight & Map",      description: "Listen and map the structure — note keys, repeats, shapes" },
  decode:     { label: "Note by Note",     description: "Read notes and rhythm hands separate, slow tempo" },
  chunk:      { label: "Bar Work",         description: "Drill short segments until each feels automatic" },
  coordinate: { label: "Both Hands",       description: "Combine hands slowly — focus on clean alignment" },
  link:       { label: "String Together",  description: "Join segments into longer, unbroken phrases" },
  stabilize:  { label: "Consolidate",      description: "Fix weak spots, build memory and consistency" },
  shape:      { label: "Bring to Life",    description: "Add tempo, dynamics, phrasing — full run-throughs" },
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
  repertoireEntryId: integer("repertoire_entry_id").notNull().references(() => repertoireEntries.id),
  /** Sheet music used for this plan (bars, thumbnails); set when plan is created from the wizard */
  sheetMusicId: integer("sheet_music_id").references(() => sheetMusic.id),
  dailyPracticeMinutes: integer("daily_practice_minutes").notNull().default(30),
  targetCompletionDate: text("target_completion_date"), // YYYY-MM-DD
  totalMeasures: integer("total_measures"), // populated after sheet music processed
  status: text("status").notNull().default("setup"), // setup | active | paused | completed
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
  difficulty: integer("difficulty").notNull().default(3), // 1 (easiest) … 5 (hardest)
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

export type SessionTask = { text: string; tag?: string };
export type SessionSection = {
  type: string;        // e.g. "warmup" | "piece_practice" | "sight_reading"
  label: string;       // display label
  durationMin?: number;
  tasks: SessionTask[];
  sectionId?: number;  // plan_sections.id when generated by waterfall scheduler
  phaseType?: string;  // one of PHASE_TYPES when generated by waterfall scheduler
  measureStart?: number; // explicit measure range; when absent, parsed from label string
  measureEnd?: number;   // explicit measure range; when absent, parsed from label string
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
