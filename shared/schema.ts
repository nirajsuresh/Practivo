import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, date, timestamp, boolean } from "drizzle-orm/pg-core";
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
});

export const insertComposerSchema = createInsertSchema(composers).omit({ id: true });
export type InsertComposer = z.infer<typeof insertComposerSchema>;
export type Composer = typeof composers.$inferSelect;

export const pieces = pgTable("pieces", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  composerId: integer("composer_id").notNull().references(() => composers.id),
  instrument: text("instrument").default("Solo Piano"),
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
});

export const insertRepertoireEntrySchema = createInsertSchema(repertoireEntries).omit({ id: true });
export type InsertRepertoireEntry = z.infer<typeof insertRepertoireEntrySchema>;
export type RepertoireEntry = typeof repertoireEntries.$inferSelect;

export const follows = pgTable("follows", {
  id: serial("id").primaryKey(),
  followerId: varchar("follower_id").notNull().references(() => users.id),
  followingId: varchar("following_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFollowSchema = createInsertSchema(follows).omit({ id: true, createdAt: true });
export type InsertFollow = z.infer<typeof insertFollowSchema>;
export type Follow = typeof follows.$inferSelect;

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'status_change', 'milestone', 'practice_log', 'recording', 'text'
  content: text("content"),
  pieceId: integer("piece_id").references(() => pieces.id),
  recordingUrl: text("recording_url"),
  practiceHours: integer("practice_hours"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPostSchema = createInsertSchema(posts).omit({ id: true, createdAt: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof posts.$inferSelect;

export const challenges = pgTable("challenges", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  pieceId: integer("piece_id").references(() => pieces.id),
  startMeasure: integer("start_measure"),
  endMeasure: integer("end_measure"),
  deadline: text("deadline"),
  createdAt: timestamp("created_at").defaultNow(),
  isActive: boolean("is_active").default(true),
});

export const insertChallengeSchema = createInsertSchema(challenges).omit({ id: true, createdAt: true });
export type InsertChallenge = z.infer<typeof insertChallengeSchema>;
export type Challenge = typeof challenges.$inferSelect;

export const challengeEntries = pgTable("challenge_entries", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").notNull().references(() => challenges.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  recordingUrl: text("recording_url"),
  submittedAt: timestamp("submitted_at").defaultNow(),
});

export const insertChallengeEntrySchema = createInsertSchema(challengeEntries).omit({ id: true, submittedAt: true });
export type InsertChallengeEntry = z.infer<typeof insertChallengeEntrySchema>;
export type ChallengeEntry = typeof challengeEntries.$inferSelect;

export const pieceRatings = pgTable("piece_ratings", {
  id: serial("id").primaryKey(),
  pieceId: integer("piece_id").notNull().references(() => pieces.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  rating: integer("rating").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPieceRatingSchema = createInsertSchema(pieceRatings).omit({ id: true, createdAt: true });
export type InsertPieceRating = z.infer<typeof insertPieceRatingSchema>;
export type PieceRating = typeof pieceRatings.$inferSelect;

export const pieceComments = pgTable("piece_comments", {
  id: serial("id").primaryKey(),
  pieceId: integer("piece_id").notNull().references(() => pieces.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPieceCommentSchema = createInsertSchema(pieceComments).omit({ id: true, createdAt: true });
export type InsertPieceComment = z.infer<typeof insertPieceCommentSchema>;
export type PieceComment = typeof pieceComments.$inferSelect;

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

export const connections = pgTable("connections", {
  id: serial("id").primaryKey(),
  requesterId: varchar("requester_id").notNull().references(() => users.id),
  recipientId: varchar("recipient_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertConnectionSchema = createInsertSchema(connections).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertConnection = z.infer<typeof insertConnectionSchema>;
export type Connection = typeof connections.$inferSelect;

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
