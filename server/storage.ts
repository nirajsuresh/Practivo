import { 
  type User, type InsertUser,
  type Composer, type InsertComposer,
  type Piece, type InsertPiece,
  type Movement, type InsertMovement,
  type RepertoireEntry, type InsertRepertoireEntry,
  users, composers, pieces, movements, repertoireEntries
} from "@shared/schema";
import { db } from "./db";
import { eq, ilike, and } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  searchComposers(query: string): Promise<Composer[]>;
  getComposerById(id: number): Promise<Composer | undefined>;
  createComposer(composer: InsertComposer): Promise<Composer>;
  
  searchPieces(query: string, composerId?: number): Promise<(Piece & { composerName: string })[]>;
  getPieceById(id: number): Promise<Piece | undefined>;
  getPiecesByComposer(composerId: number): Promise<Piece[]>;
  createPiece(piece: InsertPiece): Promise<Piece>;
  
  getMovementsByPiece(pieceId: number): Promise<Movement[]>;
  getMovementById(id: number): Promise<Movement | undefined>;
  createMovement(movement: InsertMovement): Promise<Movement>;
  
  getRepertoireByUser(userId: string): Promise<(RepertoireEntry & { 
    composerName: string; 
    pieceTitle: string; 
    movementName: string | null 
  })[]>;
  createRepertoireEntry(entry: InsertRepertoireEntry): Promise<RepertoireEntry>;
  updateRepertoireEntry(id: number, updates: Partial<InsertRepertoireEntry>): Promise<RepertoireEntry | undefined>;
  deleteRepertoireEntry(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async searchComposers(query: string): Promise<Composer[]> {
    if (!query.trim()) {
      return db.select().from(composers).limit(20);
    }
    return db.select().from(composers).where(ilike(composers.name, `%${query}%`)).limit(20);
  }

  async getComposerById(id: number): Promise<Composer | undefined> {
    const [composer] = await db.select().from(composers).where(eq(composers.id, id));
    return composer;
  }

  async createComposer(composer: InsertComposer): Promise<Composer> {
    const [newComposer] = await db.insert(composers).values(composer).returning();
    return newComposer;
  }

  async searchPieces(query: string, composerId?: number): Promise<(Piece & { composerName: string })[]> {
    const baseQuery = db
      .select({
        id: pieces.id,
        title: pieces.title,
        composerId: pieces.composerId,
        composerName: composers.name,
      })
      .from(pieces)
      .innerJoin(composers, eq(pieces.composerId, composers.id))
      .limit(20);

    if (composerId && query.trim()) {
      return baseQuery.where(and(eq(pieces.composerId, composerId), ilike(pieces.title, `%${query}%`)));
    } else if (composerId) {
      return baseQuery.where(eq(pieces.composerId, composerId));
    } else if (query.trim()) {
      return baseQuery.where(ilike(pieces.title, `%${query}%`));
    }
    return baseQuery;
  }

  async getPieceById(id: number): Promise<Piece | undefined> {
    const [piece] = await db.select().from(pieces).where(eq(pieces.id, id));
    return piece;
  }

  async getPiecesByComposer(composerId: number): Promise<Piece[]> {
    return db.select().from(pieces).where(eq(pieces.composerId, composerId));
  }

  async createPiece(piece: InsertPiece): Promise<Piece> {
    const [newPiece] = await db.insert(pieces).values(piece).returning();
    return newPiece;
  }

  async getMovementsByPiece(pieceId: number): Promise<Movement[]> {
    return db.select().from(movements).where(eq(movements.pieceId, pieceId));
  }

  async getMovementById(id: number): Promise<Movement | undefined> {
    const [movement] = await db.select().from(movements).where(eq(movements.id, id));
    return movement;
  }

  async createMovement(movement: InsertMovement): Promise<Movement> {
    const [newMovement] = await db.insert(movements).values(movement).returning();
    return newMovement;
  }

  async getRepertoireByUser(userId: string): Promise<(RepertoireEntry & { 
    composerName: string; 
    pieceTitle: string; 
    movementName: string | null 
  })[]> {
    const results = await db
      .select({
        id: repertoireEntries.id,
        userId: repertoireEntries.userId,
        composerId: repertoireEntries.composerId,
        pieceId: repertoireEntries.pieceId,
        movementId: repertoireEntries.movementId,
        status: repertoireEntries.status,
        startedDate: repertoireEntries.startedDate,
        composerName: composers.name,
        pieceTitle: pieces.title,
        movementName: movements.name,
      })
      .from(repertoireEntries)
      .innerJoin(composers, eq(repertoireEntries.composerId, composers.id))
      .innerJoin(pieces, eq(repertoireEntries.pieceId, pieces.id))
      .leftJoin(movements, eq(repertoireEntries.movementId, movements.id))
      .where(eq(repertoireEntries.userId, userId));
    
    return results;
  }

  async createRepertoireEntry(entry: InsertRepertoireEntry): Promise<RepertoireEntry> {
    const [newEntry] = await db.insert(repertoireEntries).values(entry).returning();
    return newEntry;
  }

  async updateRepertoireEntry(id: number, updates: Partial<InsertRepertoireEntry>): Promise<RepertoireEntry | undefined> {
    const [updated] = await db.update(repertoireEntries).set(updates).where(eq(repertoireEntries.id, id)).returning();
    return updated;
  }

  async deleteRepertoireEntry(id: number): Promise<boolean> {
    const result = await db.delete(repertoireEntries).where(eq(repertoireEntries.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
