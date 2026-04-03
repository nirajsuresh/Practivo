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

// ── Learning Plan Tables ────────────────────────────────────────────────────

export const learningPlans = pgTable("learning_plans", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  repertoireEntryId: integer("repertoire_entry_id").notNull().references(() => repertoireEntries.id),
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

export const lessonDays = pgTable("lesson_days", {
  id: serial("id").primaryKey(),
  learningPlanId: integer("learning_plan_id").notNull().references(() => learningPlans.id),
  scheduledDate: text("scheduled_date").notNull(), // YYYY-MM-DD
  measureStart: integer("measure_start").notNull(),
  measureEnd: integer("measure_end").notNull(),
  status: text("status").notNull().default("upcoming"), // upcoming | active | completed | skipped
  userNotes: text("user_notes"),
  completedAt: timestamp("completed_at"),
});

export const insertLessonDaySchema = createInsertSchema(lessonDays).omit({ id: true });
export type InsertLessonDay = z.infer<typeof insertLessonDaySchema>;
export type LessonDay = typeof lessonDays.$inferSelect;

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
