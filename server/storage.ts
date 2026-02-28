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
  type PieceAnalysis, type InsertPieceAnalysis,
  type Connection, type InsertConnection,
  users, composers, pieces, movements, repertoireEntries, posts, challenges, userProfiles, follows,
  pieceRatings, pieceComments, pieceAnalyses, connections
} from "@shared/schema";
import { db } from "./db";
import { eq, ilike, and, desc, inArray, sql, count, avg, or, ne } from "drizzle-orm";

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
  updateRepertoireByPiece(userId: string, pieceId: number, updates: Partial<InsertRepertoireEntry>): Promise<RepertoireEntry[]>;
  deleteRepertoireEntry(id: number): Promise<boolean>;
  updateRepertoireOrder(userId: string, order: { pieceId: number; displayOrder: number }[]): Promise<void>;
  
  getFeedPosts(userId: string, limit?: number): Promise<any[]>;
  getActiveChallenges(): Promise<Challenge[]>;
  getRecordingPosts(limit?: number): Promise<any[]>;
  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  getFollowing(userId: string): Promise<string[]>;
  getSuggestedUsers(userId: string, limit?: number): Promise<any[]>;
  
  getPieceRatingSummary(pieceId: number): Promise<{ averageRating: number; totalRatings: number }>;
  getPieceComments(pieceId: number): Promise<any[]>;
  getPieceStatusDistribution(pieceId: number): Promise<{ status: string; count: number }[]>;
  
  getPieceAnalysis(pieceId: number): Promise<PieceAnalysis | undefined>;
  savePieceAnalysis(data: InsertPieceAnalysis): Promise<PieceAnalysis>;

  unifiedSearch(query: string): Promise<{
    type: "piece" | "movement";
    composerId: number;
    composerName: string;
    pieceId: number;
    pieceTitle: string;
    movementId: number | null;
    movementName: string | null;
    score: number;
  }[]>;
  searchUsers(query: string, currentUserId: string): Promise<any[]>;
  sendConnectionRequest(requesterId: string, recipientId: string): Promise<Connection>;
  getConnectionBetween(userA: string, userB: string): Promise<Connection | undefined>;
  getConnectionById(id: number): Promise<Connection | undefined>;
  getPendingRequestsReceived(userId: string): Promise<any[]>;
  getPendingRequestsSent(userId: string): Promise<any[]>;
  updateConnectionStatus(connectionId: number, status: "accepted" | "denied"): Promise<Connection>;
  getAcceptedConnections(userId: string): Promise<any[]>;
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
      return db.select().from(composers).orderBy(lastNameOrder);
    }
    return db.select().from(composers)
      .where(sql`unaccent(${composers.name}) ILIKE unaccent(${'%' + query + '%'}) OR word_similarity(unaccent(${query}), unaccent(${composers.name})) > 0.3`)
      .orderBy(sql`word_similarity(unaccent(${query}), unaccent(${composers.name})) DESC`, lastNameOrder);
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
    const selectFields = {
      id: pieces.id,
      title: pieces.title,
      composerId: pieces.composerId,
      composerName: composers.name,
    };

    if (composerId && query.trim()) {
      return db.select(selectFields).from(pieces)
        .innerJoin(composers, eq(pieces.composerId, composers.id))
        .where(sql`${pieces.composerId} = ${composerId} AND (unaccent(${pieces.title}) ILIKE unaccent(${'%' + query + '%'}) OR word_similarity(unaccent(${query}), unaccent(${pieces.title})) > 0.3)`)
        .orderBy(sql`word_similarity(unaccent(${query}), unaccent(${pieces.title})) DESC`, pieces.title);
    } else if (composerId) {
      return db.select(selectFields).from(pieces)
        .innerJoin(composers, eq(pieces.composerId, composers.id))
        .where(eq(pieces.composerId, composerId));
    } else if (query.trim()) {
      const combined = sql`(${pieces.title} || ' ' || ${composers.name})`;
      return db.select(selectFields).from(pieces)
        .innerJoin(composers, eq(pieces.composerId, composers.id))
        .where(
          sql`unaccent(${pieces.title}) ILIKE unaccent(${'%' + query + '%'}) OR unaccent(${composers.name}) ILIKE unaccent(${'%' + query + '%'}) OR word_similarity(unaccent(${query}), unaccent(${combined})) > 0.3`
        )
        .orderBy(sql`word_similarity(unaccent(${query}), unaccent(${combined})) DESC`, pieces.title)
        .limit(50);
    }
    return db.select(selectFields).from(pieces)
      .innerJoin(composers, eq(pieces.composerId, composers.id))
      .limit(50);
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
        displayOrder: repertoireEntries.displayOrder,
        progress: repertoireEntries.progress,
        splitView: repertoireEntries.splitView,
        composerName: composers.name,
        pieceTitle: pieces.title,
        movementName: movements.name,
      })
      .from(repertoireEntries)
      .innerJoin(composers, eq(repertoireEntries.composerId, composers.id))
      .innerJoin(pieces, eq(repertoireEntries.pieceId, pieces.id))
      .leftJoin(movements, eq(repertoireEntries.movementId, movements.id))
      .where(eq(repertoireEntries.userId, userId))
      .orderBy(repertoireEntries.displayOrder, repertoireEntries.id);
    
    return results;
  }

  async updateRepertoireOrder(userId: string, order: { pieceId: number; displayOrder: number }[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (const item of order) {
        await tx
          .update(repertoireEntries)
          .set({ displayOrder: item.displayOrder })
          .where(
            and(
              eq(repertoireEntries.userId, userId),
              eq(repertoireEntries.pieceId, item.pieceId)
            )
          );
      }
    });
  }

  async createRepertoireEntry(entry: InsertRepertoireEntry): Promise<RepertoireEntry> {
    if (entry.displayOrder === undefined || entry.displayOrder === null) {
      const [maxResult] = await db
        .select({ maxOrder: sql<number>`COALESCE(MAX(${repertoireEntries.displayOrder}), -1)` })
        .from(repertoireEntries)
        .where(eq(repertoireEntries.userId, entry.userId));
      entry = { ...entry, displayOrder: (maxResult?.maxOrder ?? -1) + 1 };
    }
    const [newEntry] = await db.insert(repertoireEntries).values(entry).returning();
    return newEntry;
  }

  async updateRepertoireEntry(id: number, updates: Partial<InsertRepertoireEntry>): Promise<RepertoireEntry | undefined> {
    const [updated] = await db.update(repertoireEntries).set(updates).where(eq(repertoireEntries.id, id)).returning();
    return updated;
  }

  async updateRepertoireByPiece(userId: string, pieceId: number, updates: Partial<InsertRepertoireEntry>): Promise<RepertoireEntry[]> {
    const updated = await db.update(repertoireEntries)
      .set(updates)
      .where(and(eq(repertoireEntries.userId, userId), eq(repertoireEntries.pieceId, pieceId)))
      .returning();
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

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const [newProfile] = await db.insert(userProfiles).values(profile).returning();
    return newProfile;
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
  async getPieceAnalysis(pieceId: number): Promise<PieceAnalysis | undefined> {
    const [analysis] = await db.select().from(pieceAnalyses).where(eq(pieceAnalyses.pieceId, pieceId));
    return analysis;
  }

  async savePieceAnalysis(data: InsertPieceAnalysis): Promise<PieceAnalysis> {
    const [analysis] = await db
      .insert(pieceAnalyses)
      .values(data)
      .onConflictDoUpdate({
        target: pieceAnalyses.pieceId,
        set: { analysis: data.analysis, wikiUrl: data.wikiUrl },
      })
      .returning();
    return analysis;
  }

  async unifiedSearch(query: string): Promise<{
    type: "piece" | "movement";
    composerId: number;
    composerName: string;
    pieceId: number;
    pieceTitle: string;
    movementId: number | null;
    movementName: string | null;
    score: number;
  }[]> {
    if (!query.trim()) return [];

    const pieceResults = await db.select({
      composerId: pieces.composerId,
      composerName: composers.name,
      pieceId: pieces.id,
      pieceTitle: pieces.title,
      score: sql<number>`word_similarity(unaccent(${query}), unaccent(${pieces.title} || ' ' || ${composers.name}))`,
    })
      .from(pieces)
      .innerJoin(composers, eq(pieces.composerId, composers.id))
      .where(sql`unaccent(${pieces.title} || ' ' || ${composers.name}) ILIKE unaccent(${'%' + query + '%'}) OR word_similarity(unaccent(${query}), unaccent(${pieces.title} || ' ' || ${composers.name})) > 0.3`)
      .orderBy(sql`word_similarity(unaccent(${query}), unaccent(${pieces.title} || ' ' || ${composers.name})) DESC`)
      .limit(15);

    const movementResults = await db.select({
      composerId: pieces.composerId,
      composerName: composers.name,
      pieceId: pieces.id,
      pieceTitle: pieces.title,
      movementId: movements.id,
      movementName: movements.name,
      score: sql<number>`word_similarity(unaccent(${query}), unaccent(${movements.name} || ' ' || ${pieces.title} || ' ' || ${composers.name}))`,
    })
      .from(movements)
      .innerJoin(pieces, eq(movements.pieceId, pieces.id))
      .innerJoin(composers, eq(pieces.composerId, composers.id))
      .where(sql`unaccent(${movements.name} || ' ' || ${pieces.title}) ILIKE unaccent(${'%' + query + '%'}) OR word_similarity(unaccent(${query}), unaccent(${movements.name} || ' ' || ${pieces.title} || ' ' || ${composers.name})) > 0.3`)
      .orderBy(sql`word_similarity(unaccent(${query}), unaccent(${movements.name} || ' ' || ${pieces.title} || ' ' || ${composers.name})) DESC`)
      .limit(15);

    const combined = [
      ...pieceResults.map(r => ({ type: "piece" as const, ...r, movementId: null, movementName: null })),
      ...movementResults.map(r => ({ type: "movement" as const, ...r })),
    ];

    combined.sort((a, b) => b.score - a.score);
    return combined.slice(0, 30);
  }

  async searchUsers(query: string, currentUserId: string): Promise<any[]> {
    if (!query.trim()) return [];
    return db
      .select({
        userId: userProfiles.userId,
        displayName: userProfiles.displayName,
        instrument: userProfiles.instrument,
        level: userProfiles.level,
        avatarUrl: userProfiles.avatarUrl,
        location: userProfiles.location,
      })
      .from(userProfiles)
      .where(and(
        sql`unaccent(${userProfiles.displayName}) ILIKE unaccent(${'%' + query + '%'}) OR word_similarity(unaccent(${query}), unaccent(${userProfiles.displayName})) > 0.3`,
        ne(userProfiles.userId, currentUserId)
      ))
      .limit(20);
  }

  async sendConnectionRequest(requesterId: string, recipientId: string): Promise<Connection> {
    const existing = await this.getConnectionBetween(requesterId, recipientId);
    if (existing) {
      throw new Error("Connection already exists between these users");
    }
    const [conn] = await db.insert(connections).values({
      requesterId,
      recipientId,
      status: "pending",
    }).returning();
    return conn;
  }

  async getConnectionById(id: number): Promise<Connection | undefined> {
    const [conn] = await db.select().from(connections).where(eq(connections.id, id));
    return conn;
  }

  async getConnectionBetween(userA: string, userB: string): Promise<Connection | undefined> {
    const [conn] = await db.select().from(connections).where(
      or(
        and(eq(connections.requesterId, userA), eq(connections.recipientId, userB)),
        and(eq(connections.requesterId, userB), eq(connections.recipientId, userA))
      )
    );
    return conn;
  }

  async getPendingRequestsReceived(userId: string): Promise<any[]> {
    return db
      .select({
        id: connections.id,
        requesterId: connections.requesterId,
        status: connections.status,
        createdAt: connections.createdAt,
        displayName: userProfiles.displayName,
        instrument: userProfiles.instrument,
        level: userProfiles.level,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(connections)
      .leftJoin(userProfiles, eq(connections.requesterId, userProfiles.userId))
      .where(and(eq(connections.recipientId, userId), eq(connections.status, "pending")));
  }

  async getPendingRequestsSent(userId: string): Promise<any[]> {
    return db
      .select({
        id: connections.id,
        recipientId: connections.recipientId,
        status: connections.status,
        createdAt: connections.createdAt,
        displayName: userProfiles.displayName,
        instrument: userProfiles.instrument,
        level: userProfiles.level,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(connections)
      .leftJoin(userProfiles, eq(connections.recipientId, userProfiles.userId))
      .where(and(eq(connections.requesterId, userId), eq(connections.status, "pending")));
  }

  async updateConnectionStatus(connectionId: number, status: "accepted" | "denied"): Promise<Connection> {
    const [conn] = await db
      .update(connections)
      .set({ status, updatedAt: new Date() })
      .where(eq(connections.id, connectionId))
      .returning();
    return conn;
  }

  async getAcceptedConnections(userId: string): Promise<any[]> {
    const sent = await db
      .select({
        connectionId: connections.id,
        userId: userProfiles.userId,
        displayName: userProfiles.displayName,
        instrument: userProfiles.instrument,
        level: userProfiles.level,
        avatarUrl: userProfiles.avatarUrl,
        location: userProfiles.location,
      })
      .from(connections)
      .leftJoin(userProfiles, eq(connections.recipientId, userProfiles.userId))
      .where(and(eq(connections.requesterId, userId), eq(connections.status, "accepted")));

    const received = await db
      .select({
        connectionId: connections.id,
        userId: userProfiles.userId,
        displayName: userProfiles.displayName,
        instrument: userProfiles.instrument,
        level: userProfiles.level,
        avatarUrl: userProfiles.avatarUrl,
        location: userProfiles.location,
      })
      .from(connections)
      .leftJoin(userProfiles, eq(connections.requesterId, userProfiles.userId))
      .where(and(eq(connections.recipientId, userId), eq(connections.status, "accepted")));

    return [...sent, ...received];
  }
}

export const storage = new DatabaseStorage();
