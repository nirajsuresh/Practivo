import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, date } from "drizzle-orm/pg-core";
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
});

export const insertRepertoireEntrySchema = createInsertSchema(repertoireEntries).omit({ id: true });
export type InsertRepertoireEntry = z.infer<typeof insertRepertoireEntrySchema>;
export type RepertoireEntry = typeof repertoireEntries.$inferSelect;
