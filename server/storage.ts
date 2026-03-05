import {
  type User, type InsertUser,
  type Composer, type InsertComposer,
  type Piece, type InsertPiece,
  type Movement, type InsertMovement,
  type RepertoireEntry, type InsertRepertoireEntry,
  type Post, type InsertPost,
  type PostLike, type PostComment,
  type Challenge, type InsertChallenge,
  type UserProfile, type InsertUserProfile,
  type Follow, type InsertFollow,
  type PieceRating, type InsertPieceRating,
  type PieceComment, type InsertPieceComment,
  type PieceAnalysis, type InsertPieceAnalysis,
  type Connection, type InsertConnection,
  type ComposerFollow,
  users, composers, pieces, movements, repertoireEntries, posts, postLikes, postComments, challenges, userProfiles, follows,
  pieceRatings, pieceComments, pieceAnalyses, connections, composerFollows
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
  deleteRepertoireByPiece(userId: string, pieceId: number): Promise<boolean>;
  updateRepertoireOrder(userId: string, order: { pieceId: number; displayOrder: number }[]): Promise<void>;
  
  createPost(post: InsertPost): Promise<Post>;
  getUserActivityLog(userId: string, limit?: number): Promise<any[]>;
  deletePost(id: number): Promise<boolean>;
  getPostById(id: number): Promise<Post | undefined>;
  getFeedPosts(userId: string, limit?: number, viewerUserId?: string): Promise<any[]>;
  likePost(postId: number, userId: string): Promise<void>;
  unlikePost(postId: number, userId: string): Promise<void>;
  getPostLikeCount(postId: number): Promise<number>;
  hasUserLikedPost(postId: number, userId: string): Promise<boolean>;
  addPostComment(postId: number, userId: string, content: string): Promise<PostComment>;
  getPostComments(postId: number): Promise<any[]>;
  deletePostComment(id: number): Promise<boolean>;
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

  // Composer follows
  followComposer(userId: string, composerId: number): Promise<ComposerFollow>;
  unfollowComposer(userId: string, composerId: number): Promise<boolean>;
  isFollowingComposer(userId: string, composerId: number): Promise<boolean>;
  getComposerFollowerCount(composerId: number): Promise<number>;
  getComposerCommunityStats(composerId: number): Promise<{
    followerCount: number;
    activeLearners: number;
    mostPopularPiece: { id: number; title: string; learnerCount: number } | null;
  }>;
  getComposerPiecesWithCounts(composerId: number): Promise<(Piece & { learnerCount: number })[]>;
  getPieceActivity(pieceId: number, limit?: number): Promise<any[]>;
  getPieceLearners(pieceId: number, limit?: number): Promise<{ userId: string; displayName: string | null; avatarUrl: string | null; status: string }[]>;
  getRelatedPieces(pieceId: number, limit?: number): Promise<{ id: number; title: string; composerName: string; coCount: number }[]>;
  getComposerMembers(composerId: number, limit?: number): Promise<{
    userId: string; displayName: string | null; avatarUrl: string | null; instrument: string | null;
  }[]>;
  getComposerActivity(composerId: number, limit?: number): Promise<any[]>;
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
    const tokens = query.trim().split(/\s+/).filter(Boolean);
    const tokenConditions = tokens.map(t => sql`unaccent(${composers.name}) ILIKE unaccent(${'%' + t + '%'})`);
    const allTokensMatch = sql.join(tokenConditions, sql` AND `);
    const tokenHits = tokens.map(t => sql`CASE WHEN unaccent(${composers.name}) ILIKE unaccent(${'%' + t + '%'}) THEN 1 ELSE 0 END`);
    const tokenScore = sql`(${sql.join(tokenHits, sql` + `)})::float / ${tokens.length}`;
    return db.select().from(composers)
      .where(sql`(${allTokensMatch}) OR word_similarity(unaccent(${query}), unaccent(${composers.name})) > 0.3`)
      .orderBy(sql`GREATEST(word_similarity(unaccent(${query}), unaccent(${composers.name})), ${tokenScore}) DESC`, lastNameOrder);
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
      const tokens = query.trim().split(/\s+/).filter(Boolean);
      const tokenConditions = tokens.map(t => sql`unaccent(${pieces.title}) ILIKE unaccent(${'%' + t + '%'})`);
      const allTokensMatch = sql.join(tokenConditions, sql` AND `);
      const tokenHits = tokens.map(t => sql`CASE WHEN unaccent(${pieces.title}) ILIKE unaccent(${'%' + t + '%'}) THEN 1 ELSE 0 END`);
      const tokenScore = sql`(${sql.join(tokenHits, sql` + `)})::float / ${tokens.length}`;
      return db.select(selectFields).from(pieces)
        .innerJoin(composers, eq(pieces.composerId, composers.id))
        .where(sql`${pieces.composerId} = ${composerId} AND ((${allTokensMatch}) OR word_similarity(unaccent(${query}), unaccent(${pieces.title})) > 0.3)`)
        .orderBy(sql`GREATEST(word_similarity(unaccent(${query}), unaccent(${pieces.title})), ${tokenScore}) DESC`, pieces.title);
    } else if (composerId) {
      return db.select(selectFields).from(pieces)
        .innerJoin(composers, eq(pieces.composerId, composers.id))
        .where(eq(pieces.composerId, composerId));
    } else if (query.trim()) {
      const combined = sql`(${pieces.title} || ' ' || ${composers.name})`;
      const tokens = query.trim().split(/\s+/).filter(Boolean);
      const tokenConditions = tokens.map(t => sql`unaccent(${combined}) ILIKE unaccent(${'%' + t + '%'})`);
      const allTokensMatch = sql.join(tokenConditions, sql` AND `);
      const tokenHits = tokens.map(t => sql`CASE WHEN unaccent(${combined}) ILIKE unaccent(${'%' + t + '%'}) THEN 1 ELSE 0 END`);
      const tokenScore = sql`(${sql.join(tokenHits, sql` + `)})::float / ${tokens.length}`;
      return db.select(selectFields).from(pieces)
        .innerJoin(composers, eq(pieces.composerId, composers.id))
        .where(
          sql`(${allTokensMatch}) OR word_similarity(unaccent(${query}), unaccent(${combined})) > 0.3`
        )
        .orderBy(sql`GREATEST(word_similarity(unaccent(${query}), unaccent(${combined})), ${tokenScore}) DESC`, pieces.title)
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

  async deleteRepertoireByPiece(userId: string, pieceId: number): Promise<boolean> {
    const result = await db.delete(repertoireEntries)
      .where(and(eq(repertoireEntries.userId, userId), eq(repertoireEntries.pieceId, pieceId)))
      .returning();
    return result.length > 0;
  }

  async createPost(post: InsertPost): Promise<Post> {
    const [created] = await db.insert(posts).values(post).returning();
    return created;
  }

  async getUserActivityLog(userId: string, limit: number = 30): Promise<any[]> {
    const results = await db
      .select({
        id: posts.id,
        userId: posts.userId,
        type: posts.type,
        content: posts.content,
        pieceId: posts.pieceId,
        createdAt: posts.createdAt,
        pieceTitle: pieces.title,
        composerName: composers.name,
        likeCount: sql<number>`(SELECT COUNT(*) FROM post_likes WHERE post_id = ${posts.id})::int`,
      })
      .from(posts)
      .leftJoin(pieces, eq(posts.pieceId, pieces.id))
      .leftJoin(composers, eq(pieces.composerId, composers.id))
      .where(eq(posts.userId, userId))
      .orderBy(desc(posts.createdAt))
      .limit(limit);
    return results;
  }

  async getPostById(id: number): Promise<Post | undefined> {
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    return post;
  }

  async deletePost(id: number): Promise<boolean> {
    const result = await db.delete(posts).where(eq(posts.id, id)).returning();
    return result.length > 0;
  }

  async getFeedPosts(userId: string, limit: number = 20, viewerUserId?: string): Promise<any[]> {
    const followingIds = await this.getFollowing(userId);
    const allUserIds = [userId, ...followingIds];
    const viewer = viewerUserId || userId;

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
        likeCount: sql<number>`(SELECT COUNT(*) FROM post_likes WHERE post_id = ${posts.id})::int`,
        userLiked: sql<boolean>`EXISTS(SELECT 1 FROM post_likes WHERE post_id = ${posts.id} AND user_id = ${viewer})`,
        commentCount: sql<number>`(SELECT COUNT(*) FROM post_comments WHERE post_id = ${posts.id})::int`,
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

  async likePost(postId: number, userId: string): Promise<void> {
    await db.insert(postLikes).values({ postId, userId }).onConflictDoNothing();
  }

  async unlikePost(postId: number, userId: string): Promise<void> {
    await db.delete(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
  }

  async getPostLikeCount(postId: number): Promise<number> {
    const [result] = await db.select({ count: count(postLikes.id) }).from(postLikes).where(eq(postLikes.postId, postId));
    return result?.count ?? 0;
  }

  async hasUserLikedPost(postId: number, userId: string): Promise<boolean> {
    const [result] = await db.select().from(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
    return !!result;
  }

  async addPostComment(postId: number, userId: string, content: string): Promise<PostComment> {
    const [comment] = await db.insert(postComments).values({ postId, userId, content }).returning();
    return comment;
  }

  async getPostComments(postId: number): Promise<any[]> {
    return db
      .select({
        id: postComments.id,
        postId: postComments.postId,
        userId: postComments.userId,
        content: postComments.content,
        createdAt: postComments.createdAt,
        displayName: userProfiles.displayName,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(postComments)
      .leftJoin(userProfiles, eq(postComments.userId, userProfiles.userId))
      .where(eq(postComments.postId, postId))
      .orderBy(postComments.createdAt);
  }

  async deletePostComment(id: number): Promise<boolean> {
    const result = await db.delete(postComments).where(eq(postComments.id, id)).returning();
    return result.length > 0;
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

    const tokens = query.trim().split(/\s+/).filter(Boolean);
    const pieceCombined = sql`(${pieces.title} || ' ' || ${composers.name})`;
    const pieceTokenConditions = tokens.map(t => sql`unaccent(${pieceCombined}) ILIKE unaccent(${'%' + t + '%'})`);
    const pieceAllTokensMatch = sql.join(pieceTokenConditions, sql` AND `);
    const pieceTokenHits = tokens.map(t => sql`CASE WHEN unaccent(${pieceCombined}) ILIKE unaccent(${'%' + t + '%'}) THEN 1 ELSE 0 END`);
    const pieceTokenScore = sql`(${sql.join(pieceTokenHits, sql` + `)})::float / ${tokens.length}`;

    const pieceResults = await db.select({
      composerId: pieces.composerId,
      composerName: composers.name,
      pieceId: pieces.id,
      pieceTitle: pieces.title,
      score: sql<number>`GREATEST(word_similarity(unaccent(${query}), unaccent(${pieceCombined})), ${pieceTokenScore})`,
    })
      .from(pieces)
      .innerJoin(composers, eq(pieces.composerId, composers.id))
      .where(sql`(${pieceAllTokensMatch}) OR word_similarity(unaccent(${query}), unaccent(${pieceCombined})) > 0.3`)
      .orderBy(sql`GREATEST(word_similarity(unaccent(${query}), unaccent(${pieceCombined})), ${pieceTokenScore}) DESC`)
      .limit(15);

    const mvtCombined = sql`(${movements.name} || ' ' || ${pieces.title} || ' ' || ${composers.name})`;
    const mvtTokenConditions = tokens.map(t => sql`unaccent(${mvtCombined}) ILIKE unaccent(${'%' + t + '%'})`);
    const mvtAllTokensMatch = sql.join(mvtTokenConditions, sql` AND `);
    const mvtTokenHits = tokens.map(t => sql`CASE WHEN unaccent(${mvtCombined}) ILIKE unaccent(${'%' + t + '%'}) THEN 1 ELSE 0 END`);
    const mvtTokenScore = sql`(${sql.join(mvtTokenHits, sql` + `)})::float / ${tokens.length}`;

    const movementResults = await db.select({
      composerId: pieces.composerId,
      composerName: composers.name,
      pieceId: pieces.id,
      pieceTitle: pieces.title,
      movementId: movements.id,
      movementName: movements.name,
      score: sql<number>`GREATEST(word_similarity(unaccent(${query}), unaccent(${mvtCombined})), ${mvtTokenScore})`,
    })
      .from(movements)
      .innerJoin(pieces, eq(movements.pieceId, pieces.id))
      .innerJoin(composers, eq(pieces.composerId, composers.id))
      .where(sql`(${mvtAllTokensMatch}) OR word_similarity(unaccent(${query}), unaccent(${mvtCombined})) > 0.3`)
      .orderBy(sql`GREATEST(word_similarity(unaccent(${query}), unaccent(${mvtCombined})), ${mvtTokenScore}) DESC`)
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

  // Composer follows
  async followComposer(userId: string, composerId: number): Promise<ComposerFollow> {
    const [follow] = await db
      .insert(composerFollows)
      .values({ userId, composerId })
      .onConflictDoNothing()
      .returning();
    return follow;
  }

  async unfollowComposer(userId: string, composerId: number): Promise<boolean> {
    const result = await db
      .delete(composerFollows)
      .where(and(eq(composerFollows.userId, userId), eq(composerFollows.composerId, composerId)));
    return (result.rowCount ?? 0) > 0;
  }

  async isFollowingComposer(userId: string, composerId: number): Promise<boolean> {
    const [row] = await db
      .select()
      .from(composerFollows)
      .where(and(eq(composerFollows.userId, userId), eq(composerFollows.composerId, composerId)));
    return !!row;
  }

  async getComposerFollowerCount(composerId: number): Promise<number> {
    const [row] = await db
      .select({ count: count() })
      .from(composerFollows)
      .where(eq(composerFollows.composerId, composerId));
    return row?.count ?? 0;
  }

  async getComposerCommunityStats(composerId: number): Promise<{
    followerCount: number;
    activeLearners: number;
    mostPopularPiece: { id: number; title: string; learnerCount: number } | null;
  }> {
    const [followerRow] = await db
      .select({ count: count() })
      .from(composerFollows)
      .where(eq(composerFollows.composerId, composerId));

    const [learnersRow] = await db
      .select({ count: sql<number>`count(distinct ${repertoireEntries.userId})` })
      .from(repertoireEntries)
      .innerJoin(pieces, eq(repertoireEntries.pieceId, pieces.id))
      .where(eq(pieces.composerId, composerId));

    const pieceRows = await db
      .select({
        id: pieces.id,
        title: pieces.title,
        learnerCount: sql<number>`count(${repertoireEntries.id})`,
      })
      .from(pieces)
      .leftJoin(repertoireEntries, eq(pieces.id, repertoireEntries.pieceId))
      .where(eq(pieces.composerId, composerId))
      .groupBy(pieces.id, pieces.title)
      .orderBy(desc(sql`count(${repertoireEntries.id})`))
      .limit(1);

    const topPiece = pieceRows[0] ?? null;

    return {
      followerCount: followerRow?.count ?? 0,
      activeLearners: Number(learnersRow?.count ?? 0),
      mostPopularPiece: topPiece ? { id: topPiece.id, title: topPiece.title, learnerCount: Number(topPiece.learnerCount) } : null,
    };
  }

  async getPieceActivity(pieceId: number, limit = 8): Promise<any[]> {
    return db
      .select({
        id: posts.id,
        userId: posts.userId,
        content: posts.content,
        postType: posts.postType,
        createdAt: posts.createdAt,
        displayName: userProfiles.displayName,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(posts)
      .leftJoin(userProfiles, eq(posts.userId, userProfiles.userId))
      .where(eq(posts.pieceId, pieceId))
      .orderBy(desc(posts.createdAt))
      .limit(limit);
  }

  async getPieceLearners(pieceId: number, limit = 8): Promise<{ userId: string; displayName: string | null; avatarUrl: string | null; status: string }[]> {
    return db
      .select({
        userId: userProfiles.userId,
        displayName: userProfiles.displayName,
        avatarUrl: userProfiles.avatarUrl,
        status: repertoireEntries.status,
      })
      .from(repertoireEntries)
      .innerJoin(userProfiles, eq(repertoireEntries.userId, userProfiles.userId))
      .where(eq(repertoireEntries.pieceId, pieceId))
      .limit(limit);
  }

  async getRelatedPieces(pieceId: number, limit = 5): Promise<{ id: number; title: string; composerName: string; coCount: number }[]> {
    const usersWithPiece = db
      .selectDistinct({ userId: repertoireEntries.userId })
      .from(repertoireEntries)
      .where(eq(repertoireEntries.pieceId, pieceId));

    const rows = await db
      .select({
        id: pieces.id,
        title: pieces.title,
        composerName: composers.name,
        coCount: sql<number>`count(distinct ${repertoireEntries.userId})`,
      })
      .from(repertoireEntries)
      .innerJoin(pieces, eq(repertoireEntries.pieceId, pieces.id))
      .innerJoin(composers, eq(pieces.composerId, composers.id))
      .where(and(
        ne(repertoireEntries.pieceId, pieceId),
        inArray(repertoireEntries.userId, usersWithPiece)
      ))
      .groupBy(pieces.id, pieces.title, composers.name)
      .orderBy(desc(sql`count(distinct ${repertoireEntries.userId})`))
      .limit(limit);
    return rows.map(r => ({ ...r, coCount: Number(r.coCount) }));
  }

  async getComposerMembers(composerId: number, limit = 12): Promise<{ userId: string; displayName: string | null; avatarUrl: string | null; instrument: string | null; }[]> {
    const rows = await db
      .selectDistinct({
        userId: userProfiles.userId,
        displayName: userProfiles.displayName,
        avatarUrl: userProfiles.avatarUrl,
        instrument: userProfiles.instrument,
      })
      .from(repertoireEntries)
      .innerJoin(pieces, eq(repertoireEntries.pieceId, pieces.id))
      .innerJoin(userProfiles, eq(repertoireEntries.userId, userProfiles.userId))
      .where(eq(pieces.composerId, composerId))
      .limit(limit);
    return rows;
  }

  async getComposerActivity(composerId: number, limit = 10): Promise<any[]> {
    const rows = await db
      .select({
        id: posts.id,
        userId: posts.userId,
        content: posts.content,
        postType: posts.postType,
        pieceId: posts.pieceId,
        pieceTitle: pieces.title,
        createdAt: posts.createdAt,
        displayName: userProfiles.displayName,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(posts)
      .innerJoin(pieces, eq(posts.pieceId, pieces.id))
      .leftJoin(userProfiles, eq(posts.userId, userProfiles.userId))
      .where(and(eq(pieces.composerId, composerId), ne(posts.postType, "recording")))
      .orderBy(desc(posts.createdAt))
      .limit(limit);
    return rows;
  }

  async getComposerPiecesWithCounts(composerId: number): Promise<(Piece & { learnerCount: number })[]> {
    const rows = await db
      .select({
        id: pieces.id,
        title: pieces.title,
        composerId: pieces.composerId,
        instrument: pieces.instrument,
        imslpUrl: pieces.imslpUrl,
        keySignature: pieces.keySignature,
        yearComposed: pieces.yearComposed,
        difficulty: pieces.difficulty,
        learnerCount: sql<number>`count(${repertoireEntries.id})`,
      })
      .from(pieces)
      .leftJoin(repertoireEntries, eq(pieces.id, repertoireEntries.pieceId))
      .where(eq(pieces.composerId, composerId))
      .groupBy(pieces.id)
      .orderBy(pieces.title);

    return rows.map(r => ({ ...r, learnerCount: Number(r.learnerCount) }));
  }
}

export const storage = new DatabaseStorage();
