import { 
  type User, type InsertUser,
  type Composer, type InsertComposer,
  type Piece, type InsertPiece,
  type Movement, type InsertMovement,
  type RepertoireEntry, type InsertRepertoireEntry,
  type Post, type InsertPost,
  type Challenge, type InsertChallenge,
  type UserProfile, type InsertUserProfile,
  type Follow, type InsertFollow,
  type PieceRating, type InsertPieceRating,
  type PieceComment, type InsertPieceComment,
  users, composers, pieces, movements, repertoireEntries, posts, challenges, userProfiles, follows,
  pieceRatings, pieceComments
} from "@shared/schema";
import { db } from "./db";
import { eq, ilike, and, desc, inArray, sql, count, avg } from "drizzle-orm";

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
  
  getFeedPosts(userId: string, limit?: number): Promise<any[]>;
  getActiveChallenges(): Promise<Challenge[]>;
  getRecordingPosts(limit?: number): Promise<any[]>;
  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  getFollowing(userId: string): Promise<string[]>;
  getSuggestedUsers(userId: string, limit?: number): Promise<any[]>;
  
  getPieceRatingSummary(pieceId: number): Promise<{ averageRating: number; totalRatings: number }>;
  getPieceComments(pieceId: number): Promise<any[]>;
  getPieceStatusDistribution(pieceId: number): Promise<{ status: string; count: number }[]>;
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
    const lastNameOrder = sql`split_part(${composers.name}, ' ', array_length(string_to_array(${composers.name}, ' '), 1))`;
    if (!query.trim()) {
      return db.select().from(composers).orderBy(lastNameOrder).limit(20);
    }
    return db.select().from(composers).where(ilike(composers.name, `%${query}%`)).orderBy(lastNameOrder).limit(20);
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

  async getFeedPosts(userId: string, limit: number = 20): Promise<any[]> {
    const followingIds = await this.getFollowing(userId);
    const allUserIds = [userId, ...followingIds];
    
    const results = await db
      .select({
        id: posts.id,
        userId: posts.userId,
        type: posts.type,
        content: posts.content,
        pieceId: posts.pieceId,
        recordingUrl: posts.recordingUrl,
        practiceHours: posts.practiceHours,
        createdAt: posts.createdAt,
        displayName: userProfiles.displayName,
        avatarUrl: userProfiles.avatarUrl,
        pieceTitle: pieces.title,
        composerName: composers.name,
      })
      .from(posts)
      .leftJoin(userProfiles, eq(posts.userId, userProfiles.userId))
      .leftJoin(pieces, eq(posts.pieceId, pieces.id))
      .leftJoin(composers, eq(pieces.composerId, composers.id))
      .where(inArray(posts.userId, allUserIds))
      .orderBy(desc(posts.createdAt))
      .limit(limit);
    
    return results;
  }

  async getActiveChallenges(): Promise<Challenge[]> {
    return db.select().from(challenges).where(eq(challenges.isActive, true)).orderBy(desc(challenges.createdAt));
  }

  async getRecordingPosts(limit: number = 10): Promise<any[]> {
    const results = await db
      .select({
        id: posts.id,
        userId: posts.userId,
        content: posts.content,
        pieceId: posts.pieceId,
        recordingUrl: posts.recordingUrl,
        createdAt: posts.createdAt,
        displayName: userProfiles.displayName,
        avatarUrl: userProfiles.avatarUrl,
        pieceTitle: pieces.title,
        composerName: composers.name,
      })
      .from(posts)
      .leftJoin(userProfiles, eq(posts.userId, userProfiles.userId))
      .leftJoin(pieces, eq(posts.pieceId, pieces.id))
      .leftJoin(composers, eq(pieces.composerId, composers.id))
      .where(eq(posts.type, "recording"))
      .orderBy(desc(posts.createdAt))
      .limit(limit);
    
    return results;
  }

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile;
  }

  async getFollowing(userId: string): Promise<string[]> {
    const result = await db.select({ followingId: follows.followingId }).from(follows).where(eq(follows.followerId, userId));
    return result.map(r => r.followingId);
  }

  async getSuggestedUsers(userId: string, limit: number = 5): Promise<any[]> {
    const followingIds = await this.getFollowing(userId);
    const excludeIds = [userId, ...followingIds];
    
    const results = await db
      .select({
        userId: userProfiles.userId,
        displayName: userProfiles.displayName,
        instrument: userProfiles.instrument,
        level: userProfiles.level,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(userProfiles)
      .limit(limit + excludeIds.length);
    
    return results.filter(r => !excludeIds.includes(r.userId)).slice(0, limit);
  }

  async getPieceRatingSummary(pieceId: number): Promise<{ averageRating: number; totalRatings: number }> {
    const result = await db
      .select({
        averageRating: avg(pieceRatings.rating),
        totalRatings: count(pieceRatings.id),
      })
      .from(pieceRatings)
      .where(eq(pieceRatings.pieceId, pieceId));
    
    return {
      averageRating: result[0]?.averageRating ? parseFloat(result[0].averageRating) : 0,
      totalRatings: result[0]?.totalRatings ?? 0,
    };
  }

  async getPieceComments(pieceId: number): Promise<any[]> {
    const results = await db
      .select({
        id: pieceComments.id,
        content: pieceComments.content,
        createdAt: pieceComments.createdAt,
        displayName: userProfiles.displayName,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(pieceComments)
      .leftJoin(userProfiles, eq(pieceComments.userId, userProfiles.userId))
      .where(eq(pieceComments.pieceId, pieceId))
      .orderBy(desc(pieceComments.createdAt));
    
    return results;
  }

  async getPieceStatusDistribution(pieceId: number): Promise<{ status: string; count: number }[]> {
    const results = await db
      .select({
        status: repertoireEntries.status,
        count: count(repertoireEntries.id),
      })
      .from(repertoireEntries)
      .where(eq(repertoireEntries.pieceId, pieceId))
      .groupBy(repertoireEntries.status);
    
    return results;
  }
}

export const storage = new DatabaseStorage();
