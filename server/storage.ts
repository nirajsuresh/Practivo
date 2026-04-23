import {
  type User, type InsertUser,
  type Composer, type InsertComposer,
  type Piece, type InsertPiece,
  type Movement, type InsertMovement,
  type RepertoireEntry, type InsertRepertoireEntry,
  type UserProfile, type InsertUserProfile,
  type PieceAnalysis, type InsertPieceAnalysis,
  type PieceMilestone,
  type LearningPlan, type InsertLearningPlan,
  type SheetMusic, type InsertSheetMusic,
  type Measure, type InsertMeasure,
  type LessonDay, type InsertLessonDay,
  type MeasureProgress, type InsertMeasureProgress,
  type CommunityScore, type InsertCommunityScore,
  type SheetMusicPage,
  type PlanSection, type InsertPlanSection,
  type PlanSectionPhase, type InsertPlanSectionPhase,
  type BarFlag, type InsertBarFlag, type BarFlagSummary,
  type PlanSuggestion, type InsertPlanSuggestion,
  type BarAnnotation, type InsertBarAnnotation,
  type Passage, type InsertPassage,
  type PassageProgress, type InsertPassageProgress,
  type SessionTaskFeedback, type InsertSessionTaskFeedback,
  users, composers, pieces, movements, repertoireEntries, userProfiles,
  pieceAnalyses, pieceMilestones,
  learningPlans, sheetMusic, measures, lessonDays, measureProgress, communityScores,
  sheetMusicPages, planSections, planSectionPhases, barFlags, planSuggestions, barAnnotations,
  passages, passageProgress, sessionTaskFeedback,
} from "@shared/schema";
import { db } from "./db";
import { eq, ilike, and, desc, sql, ne, inArray, isNull, count, gte } from "drizzle-orm";

const CANONICAL_REPERTOIRE_STATUSES = [
  "Want to learn",
  "Up next",
  "In Progress",
  "Maintaining",
  "Resting",
] as const;

function normalizeStatusKey(status: string): string {
  return status.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function normalizeRepertoireStatus(status: string | null | undefined): string {
  if (!status || typeof status !== "string") return "In Progress";
  const key = normalizeStatusKey(status);
  if (key === "want to learn" || key === "wishlist") return "Want to learn";
  if (key === "up next") return "Up next";
  if (key === "in progress" || key === "learning" || key === "refining" || key === "polishing") return "In Progress";
  if (key === "maintaining" || key === "performance ready" || key === "learned") return "Maintaining";
  if (key === "resting" || key === "shelved" || key === "stopped learning" || key === "paused") return "Resting";
  const canonical = CANONICAL_REPERTOIRE_STATUSES.find((s) => normalizeStatusKey(s) === key);
  return canonical ?? "In Progress";
}

export interface IStorage {
  // ── Users ────────────────────────────────────────────────────────────────
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // ── Composers ────────────────────────────────────────────────────────────
  searchComposers(query: string): Promise<Composer[]>;
  getComposerById(id: number): Promise<Composer | undefined>;
  createComposer(composer: InsertComposer): Promise<Composer>;

  // ── Pieces ───────────────────────────────────────────────────────────────
  searchPieces(query: string, composerId?: number): Promise<(Piece & { composerName: string })[]>;
  getPieceById(id: number): Promise<Piece | undefined>;
  getPiecesByComposer(composerId: number): Promise<Piece[]>;
  getComposerPieces(composerId: number): Promise<Piece[]>;
  createPiece(piece: InsertPiece): Promise<Piece>;
  getPieceAnalysis(pieceId: number): Promise<PieceAnalysis | undefined>;
  savePieceAnalysis(data: InsertPieceAnalysis): Promise<PieceAnalysis>;

  // ── Movements ────────────────────────────────────────────────────────────
  getMovementsByPiece(pieceId: number): Promise<Movement[]>;
  getMovementById(id: number): Promise<Movement | undefined>;
  createMovement(movement: InsertMovement): Promise<Movement>;

  // ── Repertoire ───────────────────────────────────────────────────────────
  getRepertoireByUser(userId: string): Promise<{
    entries: (RepertoireEntry & {
      composerName: string;
      pieceTitle: string;
      movementName: string | null;
      composer_image_url: string | null;
      composer_period: string | null;
      composer_birth_year?: number | null;
      composer_death_year?: number | null;
      hasStartedMilestone: boolean;
      everMilestone: "completed" | "performed" | null;
      performedCount: number;
      movementEverMilestone: "completed" | "performed" | null;
      movementPerformedCount: number;
    })[];
    movementOrderByPiece: Record<number, number[]>;
  }>;
  createRepertoireEntry(entry: InsertRepertoireEntry): Promise<RepertoireEntry>;
  getRepertoireEntryById(id: number): Promise<RepertoireEntry | undefined>;
  updateRepertoireEntry(id: number, updates: Partial<InsertRepertoireEntry>): Promise<RepertoireEntry | undefined>;
  updateRepertoireByPiece(userId: string, pieceId: number, updates: Partial<InsertRepertoireEntry>): Promise<RepertoireEntry[]>;
  deleteRepertoireEntry(id: number): Promise<boolean>;
  deleteRepertoireByPiece(userId: string, pieceId: number): Promise<boolean>;
  updateRepertoireOrder(userId: string, order: { pieceId: number; displayOrder: number }[]): Promise<void>;

  // ── User Profiles ────────────────────────────────────────────────────────
  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(userId: string, updates: Partial<InsertUserProfile>): Promise<UserProfile | undefined>;
  searchUsers(query: string, currentUserId: string): Promise<any[]>;

  // ── Search ───────────────────────────────────────────────────────────────
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

  // ── Milestones ───────────────────────────────────────────────────────────
  getMilestones(userId: string, pieceId: number, movementId?: number | null, allMovements?: boolean): Promise<PieceMilestone[]>;
  upsertMilestone(userId: string, pieceId: number, cycleNumber: number, milestoneType: string, achievedAt: string, movementId?: number | null): Promise<PieceMilestone>;
  updateMilestoneDate(id: number, achievedAt: string): Promise<PieceMilestone | undefined>;
  deleteMilestone(id: number): Promise<boolean>;
  startNewCycle(repertoireEntryId: number): Promise<RepertoireEntry | undefined>;
  removeCurrentCycle(repertoireEntryId: number): Promise<RepertoireEntry | undefined>;

  // ── Learning Plans ───────────────────────────────────────────────────────
  getLearningPlan(repertoireEntryId: number): Promise<LearningPlan | undefined>;
  getLearningPlanById(id: number): Promise<LearningPlan | undefined>;
  getLearningPlanBySheetMusic(sheetMusicId: number): Promise<LearningPlan | undefined>;
  getLearningPlanBySheetAndUser(sheetMusicId: number, userId: string): Promise<LearningPlan | undefined>;
  createLearningPlan(plan: InsertLearningPlan): Promise<LearningPlan>;
  updateLearningPlan(id: number, updates: Partial<InsertLearningPlan>): Promise<LearningPlan | undefined>;
  deleteLearningPlan(id: number, userId: string): Promise<boolean>;

  // ── Sheet Music ──────────────────────────────────────────────────────────
  createSheetMusic(data: InsertSheetMusic): Promise<SheetMusic>;
  getSheetMusic(id: number): Promise<SheetMusic | undefined>;
  updateSheetMusicStatus(id: number, status: string, pageCount?: number): Promise<void>;
  updateSheetMusicFileUrl(id: number, fileUrl: string): Promise<void>;
  saveSheetMusicPages(pages: Array<{ sheetMusicId: number; pageNumber: number; imageUrl: string; width: number; height: number }>): Promise<void>;
  getSheetMusicPages(sheetMusicId: number): Promise<SheetMusicPage[]>;
  saveMeasures(measureList: InsertMeasure[]): Promise<Measure[]>;
  replaceMeasures(sheetMusicId: number, measureList: InsertMeasure[]): Promise<Measure[]>;
  getMeasures(sheetMusicId: number, movementId?: number | null): Promise<Measure[]>;
  getMeasureCount(sheetMusicId: number, movementId?: number | null): Promise<number>;
  batchGetMeasureCounts(sheetMusicIds: number[]): Promise<Map<number, number>>;
  clearMeasuresForSheetMusic(sheetMusicId: number): Promise<void>;
  updateMeasure(id: number, updates: Partial<InsertMeasure>): Promise<Measure | undefined>;
  confirmMeasures(sheetMusicId: number): Promise<void>;

  // ── Lesson Days ──────────────────────────────────────────────────────────
  getLessonDays(learningPlanId: number): Promise<LessonDay[]>;
  getLessonDay(learningPlanId: number, date: string): Promise<LessonDay | undefined>;
  getLessonDayById(id: number): Promise<LessonDay | undefined>;
  getLessonSessionBundle(
    lessonId: number,
    userId: string,
  ): Promise<{
    lesson: LessonDay;
    plan: LearningPlan;
    pieceTitle: string;
    composerName: string;
    dayIndex: number;
    sectionName: string | null;
  } | null>;
  createLessonDays(days: InsertLessonDay[]): Promise<LessonDay[]>;
  deleteLessonDaysForPlan(learningPlanId: number): Promise<void>;
  /** v2 scheduler: delete upcoming (non-completed) lessons on/after fromDateISO. */
  deleteUpcomingLessonsFromDate(learningPlanId: number, fromDateISO: string): Promise<void>;
  updateLessonDay(id: number, updates: Partial<InsertLessonDay>): Promise<LessonDay | undefined>;

  // ── Passages (v2 scheduler) ──────────────────────────────────────────────
  getPassagesForPlan(learningPlanId: number): Promise<Passage[]>;
  getPassageById(id: number): Promise<Passage | undefined>;
  createPassage(data: InsertPassage): Promise<Passage>;
  deletePassagesForPlan(learningPlanId: number): Promise<void>;

  // ── Passage Progress (v2 scheduler) ──────────────────────────────────────
  getPassageProgressForPlan(learningPlanId: number): Promise<PassageProgress[]>;
  getPassageProgress(passageId: number, learningPlanId: number): Promise<PassageProgress | undefined>;
  createPassageProgress(data: InsertPassageProgress): Promise<PassageProgress>;
  updatePassageProgress(id: number, updates: Partial<InsertPassageProgress>): Promise<PassageProgress | undefined>;
  recalibratePassageDifficulties(planId: number, adjustments: Array<{ sectionId: number; newDifficulty: number }>): Promise<void>;

  // ── Measure Progress ─────────────────────────────────────────────────────
  getMeasureProgress(learningPlanId: number): Promise<MeasureProgress[]>;
  upsertMeasureProgress(data: { planId: number; measureId: number; userId: string } & Partial<InsertMeasureProgress>): Promise<MeasureProgress>;

  // ── Community Scores ─────────────────────────────────────────────────────
  getCommunityScoreById(id: number): Promise<CommunityScore | undefined>;
  getCommunityScoreByPiece(pieceId: number, movementId?: number | null): Promise<CommunityScore | undefined>;
  getAllCommunityScoresForPiece(pieceId: number): Promise<CommunityScore[]>;
  createCommunityScore(data: InsertCommunityScore): Promise<CommunityScore>;
  incrementCommunityScoreDownloads(id: number): Promise<void>;
  deleteCommunityScore(id: number): Promise<void>;

  // ── Plan Sections ─────────────────────────────────────────────────────────
  getSectionsForPlan(planId: number): Promise<PlanSection[]>;
  createSection(data: InsertPlanSection): Promise<PlanSection>;
  updateSection(id: number, updates: Partial<InsertPlanSection>): Promise<PlanSection | undefined>;
  deleteSection(id: number): Promise<boolean>;
  reorderSections(updates: { id: number; displayOrder: number }[]): Promise<void>;

  // ── Plan Section Phases ───────────────────────────────────────────────────
  getPhasesForSection(sectionId: number): Promise<PlanSectionPhase[]>;
  replacePhasesForSection(sectionId: number, phases: InsertPlanSectionPhase[]): Promise<PlanSectionPhase[]>;

  // ── Bar Flags ─────────────────────────────────────────────────────────────
  getFlagsForLesson(lessonId: number): Promise<BarFlag[]>;
  createBarFlag(data: InsertBarFlag): Promise<BarFlag>;
  updateBarFlag(id: number, updates: Partial<InsertBarFlag>): Promise<BarFlag | undefined>;
  deleteBarFlag(id: number): Promise<boolean>;
  getFlagSummaryForPlan(planId: number): Promise<BarFlagSummary[]>;

  // ── Session Task Feedback ─────────────────────────────────────────────────
  createSessionTaskFeedback(data: InsertSessionTaskFeedback): Promise<SessionTaskFeedback>;
  getSessionTaskFeedbackForLesson(lessonDayId: number): Promise<SessionTaskFeedback[]>;
  getSessionTaskFeedbackForPassage(passageId: number, planId: number): Promise<SessionTaskFeedback[]>;

  // ── Bar Annotations ───────────────────────────────────────────────────────
  getAnnotationsForLesson(lessonId: number): Promise<BarAnnotation[]>;
  getAnnotationsForPlan(planId: number): Promise<BarAnnotation[]>;
  createBarAnnotation(data: InsertBarAnnotation): Promise<BarAnnotation>;
  updateBarAnnotation(id: number, text: string): Promise<BarAnnotation | undefined>;
  deleteBarAnnotation(id: number): Promise<boolean>;

  // ── Plan Suggestions ──────────────────────────────────────────────────────
  getPendingSuggestions(planId: number): Promise<PlanSuggestion[]>;
  createSuggestion(data: InsertPlanSuggestion): Promise<PlanSuggestion>;
  updateSuggestion(id: number, updates: { status: "accepted" | "dismissed" }): Promise<PlanSuggestion | undefined>;
}

export class DatabaseStorage implements IStorage {

  // ── Users ────────────────────────────────────────────────────────────────

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

  // ── Composers ────────────────────────────────────────────────────────────

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

  // ── Pieces ───────────────────────────────────────────────────────────────

  async searchPieces(query: string, composerId?: number): Promise<(Piece & { composerName: string })[]> {
    const selectFields = {
      id: pieces.id,
      title: pieces.title,
      composerId: pieces.composerId,
      instrument: pieces.instrument,
      imslpUrl: pieces.imslpUrl,
      keySignature: pieces.keySignature,
      yearComposed: pieces.yearComposed,
      difficulty: pieces.difficulty,
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
        .where(sql`(${allTokensMatch}) OR word_similarity(unaccent(${query}), unaccent(${combined})) > 0.3`)
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

  async getComposerPieces(composerId: number): Promise<Piece[]> {
    return db.select().from(pieces).where(eq(pieces.composerId, composerId)).orderBy(pieces.title);
  }

  async createPiece(piece: InsertPiece): Promise<Piece> {
    const [newPiece] = await db.insert(pieces).values(piece).returning();
    return newPiece;
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

  // ── Movements ────────────────────────────────────────────────────────────

  async getMovementsByPiece(pieceId: number): Promise<Movement[]> {
    return db.select().from(movements).where(eq(movements.pieceId, pieceId)).orderBy(movements.id);
  }

  async getMovementById(id: number): Promise<Movement | undefined> {
    const [movement] = await db.select().from(movements).where(eq(movements.id, id));
    return movement;
  }

  async createMovement(movement: InsertMovement): Promise<Movement> {
    const [newMovement] = await db.insert(movements).values(movement).returning();
    return newMovement;
  }

  // ── Repertoire ───────────────────────────────────────────────────────────

  async getRepertoireByUser(userId: string): Promise<{
    entries: (RepertoireEntry & {
      composerName: string;
      pieceTitle: string;
      movementName: string | null;
      composer_image_url: string | null;
      composer_period: string | null;
      composer_birth_year?: number | null;
      composer_death_year?: number | null;
      hasStartedMilestone: boolean;
      everMilestone: "completed" | "performed" | null;
      performedCount: number;
      movementEverMilestone: "completed" | "performed" | null;
      movementPerformedCount: number;
    })[];
    movementOrderByPiece: Record<number, number[]>;
  }> {
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
        currentCycle: repertoireEntries.currentCycle,
        composerName: composers.name,
        pieceTitle: pieces.title,
        movementName: movements.name,
        composer_image_url: composers.imageUrl,
        composer_period: composers.period,
        composer_birth_year: composers.birthYear,
        composer_death_year: composers.deathYear,
        hasStartedMilestone: sql<boolean>`EXISTS (
          SELECT 1 FROM ${pieceMilestones} pm
          WHERE pm.user_id = ${userId}
            AND pm.piece_id = ${repertoireEntries.pieceId}
            AND pm.milestone_type = 'started'
        )`,
        everMilestone: sql<"completed" | "performed" | null>`CASE
          WHEN EXISTS (
            SELECT 1 FROM ${pieceMilestones} pm
            WHERE pm.user_id = ${userId}
              AND pm.piece_id = ${repertoireEntries.pieceId}
              AND pm.movement_id IS NULL
              AND pm.milestone_type LIKE 'performed%'
          ) THEN 'performed'
          WHEN EXISTS (
            SELECT 1 FROM ${pieceMilestones} pm
            WHERE pm.user_id = ${userId}
              AND pm.piece_id = ${repertoireEntries.pieceId}
              AND pm.movement_id IS NULL
              AND pm.milestone_type = 'completed'
          ) THEN 'completed'
          ELSE NULL
        END`,
        performedCount: sql<number>`(
          SELECT COUNT(*) FROM ${pieceMilestones} pm
          WHERE pm.user_id = ${userId}
            AND pm.piece_id = ${repertoireEntries.pieceId}
            AND pm.movement_id IS NULL
            AND pm.milestone_type LIKE 'performed%'
        )::int`,
        movementEverMilestone: sql<"completed" | "performed" | null>`CASE
          WHEN ${repertoireEntries.movementId} IS NULL THEN NULL
          WHEN EXISTS (
            SELECT 1 FROM ${pieceMilestones} pm
            WHERE pm.user_id = ${userId}
              AND pm.piece_id = ${repertoireEntries.pieceId}
              AND pm.movement_id = ${repertoireEntries.movementId}
              AND pm.milestone_type LIKE 'performed%'
          ) THEN 'performed'
          WHEN EXISTS (
            SELECT 1 FROM ${pieceMilestones} pm
            WHERE pm.user_id = ${userId}
              AND pm.piece_id = ${repertoireEntries.pieceId}
              AND pm.movement_id = ${repertoireEntries.movementId}
              AND pm.milestone_type = 'completed'
          ) THEN 'completed'
          ELSE NULL
        END`,
        movementPerformedCount: sql<number>`CASE
          WHEN ${repertoireEntries.movementId} IS NULL THEN 0
          ELSE (
            SELECT COUNT(*) FROM ${pieceMilestones} pm
            WHERE pm.user_id = ${userId}
              AND pm.piece_id = ${repertoireEntries.pieceId}
              AND pm.movement_id = ${repertoireEntries.movementId}
              AND pm.milestone_type LIKE 'performed%'
          )::int
        END`,
      })
      .from(repertoireEntries)
      .innerJoin(composers, eq(repertoireEntries.composerId, composers.id))
      .innerJoin(pieces, eq(repertoireEntries.pieceId, pieces.id))
      .leftJoin(movements, eq(repertoireEntries.movementId, movements.id))
      .where(eq(repertoireEntries.userId, userId))
      .orderBy(repertoireEntries.displayOrder, repertoireEntries.id);

    const entries = results.map((row) => ({
      ...row,
      status: normalizeRepertoireStatus(row.status),
    }));

    const pieceIds = Array.from(new Set(results.map((r) => r.pieceId)));
    const movementOrderByPiece: Record<number, number[]> = {};
    for (const pieceId of pieceIds) {
      const list = await this.getMovementsByPiece(pieceId);
      movementOrderByPiece[pieceId] = list.map((m) => m.id);
    }

    return { entries, movementOrderByPiece };
  }

  async updateRepertoireOrder(userId: string, order: { pieceId: number; displayOrder: number }[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (const item of order) {
        await tx
          .update(repertoireEntries)
          .set({ displayOrder: item.displayOrder })
          .where(and(eq(repertoireEntries.userId, userId), eq(repertoireEntries.pieceId, item.pieceId)));
      }
    });
  }

  async createRepertoireEntry(entry: InsertRepertoireEntry): Promise<RepertoireEntry> {
    entry = { ...entry, status: normalizeRepertoireStatus(entry.status) };
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

  async getRepertoireEntryById(id: number): Promise<RepertoireEntry | undefined> {
    const [row] = await db.select().from(repertoireEntries).where(eq(repertoireEntries.id, id));
    return row;
  }

  async updateRepertoireEntry(id: number, updates: Partial<InsertRepertoireEntry>): Promise<RepertoireEntry | undefined> {
    if (updates.status !== undefined) {
      updates = { ...updates, status: normalizeRepertoireStatus(updates.status) };
    }
    const [updated] = await db.update(repertoireEntries).set(updates).where(eq(repertoireEntries.id, id)).returning();
    return updated;
  }

  async updateRepertoireByPiece(userId: string, pieceId: number, updates: Partial<InsertRepertoireEntry>): Promise<RepertoireEntry[]> {
    if (updates.status !== undefined) {
      updates = { ...updates, status: normalizeRepertoireStatus(updates.status) };
    }
    if (updates.splitView === true) {
      const entries = await db.select().from(repertoireEntries).where(and(eq(repertoireEntries.userId, userId), eq(repertoireEntries.pieceId, pieceId)));
      const wholePieceEntry = entries.find(e => e.movementId === null);
      if (wholePieceEntry && entries.length === 1) {
        const movementList = await this.getMovementsByPiece(pieceId);
        if (movementList.length > 0) {
          const baseOrder = wholePieceEntry.displayOrder;
          for (let i = 0; i < movementList.length; i++) {
            await this.createRepertoireEntry({
              userId,
              composerId: wholePieceEntry.composerId,
              pieceId,
              movementId: movementList[i].id,
              status: wholePieceEntry.status,
              startedDate: wholePieceEntry.startedDate,
              displayOrder: baseOrder + i,
              progress: wholePieceEntry.progress,
              splitView: true,
              currentCycle: wholePieceEntry.currentCycle,
            });
          }
          await this.deleteRepertoireEntry(wholePieceEntry.id);
          return db.select().from(repertoireEntries).where(and(eq(repertoireEntries.userId, userId), eq(repertoireEntries.pieceId, pieceId)));
        }
      }
    }
    return db.update(repertoireEntries)
      .set(updates)
      .where(and(eq(repertoireEntries.userId, userId), eq(repertoireEntries.pieceId, pieceId)))
      .returning();
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

  // ── User Profiles ────────────────────────────────────────────────────────

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile;
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const [newProfile] = await db.insert(userProfiles).values(profile).returning();
    return newProfile;
  }

  async updateUserProfile(userId: string, updates: Partial<InsertUserProfile>): Promise<UserProfile | undefined> {
    const [updated] = await db
      .update(userProfiles)
      .set(updates)
      .where(eq(userProfiles.userId, userId))
      .returning();
    return updated;
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

  // ── Search ───────────────────────────────────────────────────────────────

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

    const mvtCombined = sql`(${movements.name} || ' ' || ${pieces.title} || ' ' || ${composers.name})`;
    const mvtTokenConditions = tokens.map(t => sql`unaccent(${mvtCombined}) ILIKE unaccent(${'%' + t + '%'})`);
    const mvtAllTokensMatch = sql.join(mvtTokenConditions, sql` AND `);
    const mvtTokenHits = tokens.map(t => sql`CASE WHEN unaccent(${mvtCombined}) ILIKE unaccent(${'%' + t + '%'}) THEN 1 ELSE 0 END`);
    const mvtTokenScore = sql`(${sql.join(mvtTokenHits, sql` + `)})::float / ${tokens.length}`;

    const [pieceResults, movementResults] = await Promise.all([
      db.select({
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
        .limit(15),
      db.select({
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
        .limit(15),
    ]);

    const combined = [
      ...pieceResults.map(r => ({ type: "piece" as const, ...r, movementId: null, movementName: null })),
      ...movementResults.map(r => ({ type: "movement" as const, ...r })),
    ];
    combined.sort((a, b) => b.score - a.score);
    return combined.slice(0, 30);
  }

  // ── Milestones ───────────────────────────────────────────────────────────

  async getMilestones(userId: string, pieceId: number, movementId?: number | null, allMovements?: boolean): Promise<PieceMilestone[]> {
    const conditions = [eq(pieceMilestones.userId, userId), eq(pieceMilestones.pieceId, pieceId)];
    if (movementId != null) {
      conditions.push(eq(pieceMilestones.movementId, movementId));
    } else if (!allMovements) {
      conditions.push(sql`${pieceMilestones.movementId} IS NULL`);
    }
    const rows = await db
      .select()
      .from(pieceMilestones)
      .where(and(...conditions))
      .orderBy(pieceMilestones.cycleNumber, pieceMilestones.achievedAt, pieceMilestones.createdAt);

    return rows.map((row) => ({
      ...row,
      milestoneType: row.milestoneType.startsWith("performed") ? "performed" : row.milestoneType,
    }));
  }

  async upsertMilestone(
    userId: string,
    pieceId: number,
    cycleNumber: number,
    milestoneType: string,
    achievedAt: string,
    movementId?: number | null,
  ): Promise<PieceMilestone> {
    const movementVal = movementId ?? null;
    if (milestoneType === "performed") {
      const performedType = `performed#${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
      const [row] = await db
        .insert(pieceMilestones)
        .values({ userId, pieceId, movementId: movementVal, cycleNumber, milestoneType: performedType, achievedAt })
        .returning();
      return { ...row, milestoneType: "performed" };
    }

    const whereCondition = and(
      eq(pieceMilestones.userId, userId),
      eq(pieceMilestones.pieceId, pieceId),
      eq(pieceMilestones.cycleNumber, cycleNumber),
      eq(pieceMilestones.milestoneType, milestoneType),
      movementVal !== null
        ? eq(pieceMilestones.movementId, movementVal)
        : sql`${pieceMilestones.movementId} IS NULL`,
    );
    const [updated] = await db
      .update(pieceMilestones)
      .set({ achievedAt })
      .where(whereCondition)
      .returning();
    if (updated) return updated;
    const [inserted] = await db
      .insert(pieceMilestones)
      .values({ userId, pieceId, movementId: movementVal, cycleNumber, milestoneType, achievedAt })
      .returning();
    return inserted;
  }

  async updateMilestoneDate(id: number, achievedAt: string): Promise<PieceMilestone | undefined> {
    const [row] = await db
      .update(pieceMilestones)
      .set({ achievedAt })
      .where(eq(pieceMilestones.id, id))
      .returning();
    if (!row) return undefined;
    return { ...row, milestoneType: row.milestoneType.startsWith("performed") ? "performed" : row.milestoneType };
  }

  async deleteMilestone(id: number): Promise<boolean> {
    const result = await db.delete(pieceMilestones).where(eq(pieceMilestones.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async startNewCycle(repertoireEntryId: number): Promise<RepertoireEntry | undefined> {
    const [entry] = await db.select().from(repertoireEntries).where(eq(repertoireEntries.id, repertoireEntryId));
    if (!entry) return undefined;
    const entryWhere = entry.movementId != null
      ? and(eq(repertoireEntries.userId, entry.userId), eq(repertoireEntries.pieceId, entry.pieceId), eq(repertoireEntries.movementId, entry.movementId))
      : and(eq(repertoireEntries.userId, entry.userId), eq(repertoireEntries.pieceId, entry.pieceId));
    const [maxCycleRow] = await db
      .select({ maxCycle: sql<number>`MAX(${repertoireEntries.currentCycle})::int` })
      .from(repertoireEntries)
      .where(entryWhere);
    const nextCycle = (maxCycleRow?.maxCycle ?? entry.currentCycle ?? 1) + 1;
    const [updated] = await db
      .update(repertoireEntries)
      .set({ currentCycle: nextCycle })
      .where(eq(repertoireEntries.id, repertoireEntryId))
      .returning();
    return updated;
  }

  async removeCurrentCycle(repertoireEntryId: number): Promise<RepertoireEntry | undefined> {
    const [entry] = await db.select().from(repertoireEntries).where(eq(repertoireEntries.id, repertoireEntryId));
    if (!entry) return undefined;
    const entryWhere = entry.movementId != null
      ? and(eq(repertoireEntries.userId, entry.userId), eq(repertoireEntries.pieceId, entry.pieceId), eq(repertoireEntries.movementId, entry.movementId))
      : and(eq(repertoireEntries.userId, entry.userId), eq(repertoireEntries.pieceId, entry.pieceId));
    const [maxCycleRow] = await db
      .select({ maxCycle: sql<number>`MAX(${repertoireEntries.currentCycle})::int` })
      .from(repertoireEntries)
      .where(entryWhere);
    const activeCycle = maxCycleRow?.maxCycle ?? entry.currentCycle ?? 1;
    if (activeCycle <= 1) return entry;
    const milestoneWhere = entry.movementId != null
      ? and(eq(pieceMilestones.userId, entry.userId), eq(pieceMilestones.pieceId, entry.pieceId), eq(pieceMilestones.movementId, entry.movementId), eq(pieceMilestones.cycleNumber, activeCycle))
      : and(eq(pieceMilestones.userId, entry.userId), eq(pieceMilestones.pieceId, entry.pieceId), sql`${pieceMilestones.movementId} IS NULL`, eq(pieceMilestones.cycleNumber, activeCycle));
    const updatedRows = await db.transaction(async (tx) => {
      await tx.delete(pieceMilestones).where(milestoneWhere);
      return tx.update(repertoireEntries).set({ currentCycle: activeCycle - 1 }).where(eq(repertoireEntries.id, repertoireEntryId)).returning();
    });
    return updatedRows[0];
  }

  // ── Learning Plans ───────────────────────────────────────────────────────

  async getLearningPlan(repertoireEntryId: number): Promise<LearningPlan | undefined> {
    const [plan] = await db.select().from(learningPlans).where(eq(learningPlans.repertoireEntryId, repertoireEntryId));
    return plan;
  }

  async getLearningPlanById(id: number): Promise<LearningPlan | undefined> {
    const [plan] = await db.select().from(learningPlans).where(eq(learningPlans.id, id));
    return plan;
  }

  async getLearningPlanBySheetMusic(sheetMusicId: number): Promise<LearningPlan | undefined> {
    const [sm] = await db.select().from(sheetMusic).where(eq(sheetMusic.id, sheetMusicId));
    if (!sm || sm.pieceId == null) return undefined;
    const pieceId = sm.pieceId;
    const [plan] = await db
      .select()
      .from(learningPlans)
      .innerJoin(repertoireEntries, eq(learningPlans.repertoireEntryId, repertoireEntries.id))
      .where(and(eq(learningPlans.userId, sm.userId), eq(repertoireEntries.pieceId, pieceId)))
      .limit(1)
      .then(rows => rows.map(r => r.learning_plans));
    return plan;
  }

  async getLearningPlanBySheetAndUser(sheetMusicId: number, userId: string): Promise<LearningPlan | undefined> {
    const [sm] = await db.select().from(sheetMusic).where(eq(sheetMusic.id, sheetMusicId));
    if (!sm || sm.pieceId == null) return undefined;
    const pieceId = sm.pieceId;
    const [plan] = await db
      .select()
      .from(learningPlans)
      .innerJoin(repertoireEntries, eq(learningPlans.repertoireEntryId, repertoireEntries.id))
      .where(and(eq(learningPlans.userId, userId), eq(repertoireEntries.pieceId, pieceId)))
      .limit(1)
      .then(rows => rows.map(r => r.learning_plans));
    return plan;
  }

  async createLearningPlan(plan: InsertLearningPlan): Promise<LearningPlan> {
    const [created] = await db.insert(learningPlans).values(plan).returning();
    return created;
  }

  async updateLearningPlan(id: number, updates: Partial<InsertLearningPlan>): Promise<LearningPlan | undefined> {
    const [updated] = await db.update(learningPlans).set({ ...updates, updatedAt: new Date() }).where(eq(learningPlans.id, id)).returning();
    return updated;
  }

  async deleteLearningPlan(id: number, userId: string): Promise<boolean> {
    const plan = await this.getLearningPlanById(id);
    if (!plan || plan.userId !== userId) return false;
    await db.transaction(async (tx) => {
      await tx.delete(measureProgress).where(eq(measureProgress.learningPlanId, id));
      await tx.delete(lessonDays).where(eq(lessonDays.learningPlanId, id));
      await tx.delete(learningPlans).where(eq(learningPlans.id, id));
    });
    return true;
  }

  // ── Sheet Music ──────────────────────────────────────────────────────────

  async createSheetMusic(data: InsertSheetMusic): Promise<SheetMusic> {
    const [created] = await db.insert(sheetMusic).values(data).returning();
    return created;
  }

  async getSheetMusic(id: number): Promise<SheetMusic | undefined> {
    const [record] = await db.select().from(sheetMusic).where(eq(sheetMusic.id, id));
    return record;
  }

  async updateSheetMusicStatus(id: number, status: string, pageCount?: number): Promise<void> {
    const updates: Record<string, any> = { processingStatus: status };
    if (pageCount !== undefined) updates.pageCount = pageCount;
    await db.update(sheetMusic).set(updates).where(eq(sheetMusic.id, id));
  }

  async updateSheetMusicFileUrl(id: number, fileUrl: string): Promise<void> {
    await db.update(sheetMusic).set({ fileUrl }).where(eq(sheetMusic.id, id));
  }

  async saveSheetMusicPages(pages: Array<{ sheetMusicId: number; pageNumber: number; imageUrl: string; width: number; height: number }>): Promise<void> {
    if (!pages.length) return;
    await db.insert(sheetMusicPages).values(pages);
  }

  async getSheetMusicPages(sheetMusicId: number): Promise<SheetMusicPage[]> {
    return db.select().from(sheetMusicPages)
      .where(eq(sheetMusicPages.sheetMusicId, sheetMusicId))
      .orderBy(sheetMusicPages.pageNumber);
  }

  async saveMeasures(measureList: InsertMeasure[]): Promise<Measure[]> {
    if (measureList.length === 0) return [];
    const rows = await db.insert(measures).values(measureList).returning();
    return rows;
  }

  /** Delete all measures for a sheet music and replace with the new set. */
  async replaceMeasures(sheetMusicId: number, measureList: InsertMeasure[]): Promise<Measure[]> {
    await db.delete(measures).where(eq(measures.sheetMusicId, sheetMusicId));
    if (measureList.length === 0) return [];
    const rows = await db.insert(measures).values(measureList).returning();
    return rows;
  }

  async getMeasures(sheetMusicId: number, movementId?: number | null): Promise<Measure[]> {
    const cond = movementId != null
      ? and(eq(measures.sheetMusicId, sheetMusicId), eq(measures.movementId, movementId))
      : eq(measures.sheetMusicId, sheetMusicId);
    return db.select().from(measures).where(cond).orderBy(measures.measureNumber);
  }

  async getMeasureCount(sheetMusicId: number, movementId?: number | null): Promise<number> {
    const cond = movementId != null
      ? and(eq(measures.sheetMusicId, sheetMusicId), eq(measures.movementId, movementId))
      : eq(measures.sheetMusicId, sheetMusicId);
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(measures)
      .where(cond);
    return result?.count ?? 0;
  }

  async batchGetMeasureCounts(sheetMusicIds: number[]): Promise<Map<number, number>> {
    if (sheetMusicIds.length === 0) return new Map();
    const rows = await db
      .select({ sheetMusicId: measures.sheetMusicId, count: sql<number>`count(*)::int` })
      .from(measures)
      .where(inArray(measures.sheetMusicId, sheetMusicIds))
      .groupBy(measures.sheetMusicId);
    return new Map(rows.map((r) => [r.sheetMusicId, r.count]));
  }

  async clearMeasuresForSheetMusic(sheetMusicId: number): Promise<void> {
    const rows = await db.select({ id: measures.id }).from(measures).where(eq(measures.sheetMusicId, sheetMusicId));
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return;
    await db.delete(measureProgress).where(inArray(measureProgress.measureId, ids));
    await db.delete(measures).where(eq(measures.sheetMusicId, sheetMusicId));
  }

  async updateMeasure(id: number, updates: Partial<InsertMeasure>): Promise<Measure | undefined> {
    const [updated] = await db.update(measures).set(updates).where(eq(measures.id, id)).returning();
    return updated;
  }

  async confirmMeasures(sheetMusicId: number): Promise<void> {
    await db.update(measures)
      .set({ confirmedAt: new Date() })
      .where(and(eq(measures.sheetMusicId, sheetMusicId), sql`${measures.confirmedAt} IS NULL`));
    await db.update(sheetMusic).set({ processingStatus: "done" }).where(eq(sheetMusic.id, sheetMusicId));
  }

  // ── Lesson Days ──────────────────────────────────────────────────────────

  async getLessonDays(learningPlanId: number): Promise<LessonDay[]> {
    return db.select().from(lessonDays).where(eq(lessonDays.learningPlanId, learningPlanId)).orderBy(lessonDays.scheduledDate);
  }

  async getLessonDay(learningPlanId: number, date: string): Promise<LessonDay | undefined> {
    const [lesson] = await db.select().from(lessonDays)
      .where(and(eq(lessonDays.learningPlanId, learningPlanId), eq(lessonDays.scheduledDate, date)));
    return lesson;
  }

  async getLessonDayById(id: number): Promise<LessonDay | undefined> {
    const [lesson] = await db.select().from(lessonDays).where(eq(lessonDays.id, id));
    return lesson;
  }

  async getLessonSessionBundle(
    lessonId: number,
    userId: string,
  ): Promise<{
    lesson: LessonDay;
    plan: LearningPlan;
    pieceTitle: string;
    composerName: string;
    dayIndex: number;
    sectionName: string | null;
  } | null> {
    const [lesson] = await db.select().from(lessonDays).where(eq(lessonDays.id, lessonId));
    if (!lesson) return null;
    const plan = await this.getLearningPlanById(lesson.learningPlanId);
    if (!plan || plan.userId !== userId) return null;
    const [ctx] = await db
      .select({ pieceTitle: pieces.title, composerName: composers.name })
      .from(repertoireEntries)
      .innerJoin(pieces, eq(repertoireEntries.pieceId, pieces.id))
      .innerJoin(composers, eq(repertoireEntries.composerId, composers.id))
      .where(eq(repertoireEntries.id, plan.repertoireEntryId))
      .limit(1);
    if (!ctx) return null;
    // Compute 1-based day index by counting lessons scheduled before this one
    const allLessons = await db
      .select({ id: lessonDays.id, scheduledDate: lessonDays.scheduledDate })
      .from(lessonDays)
      .where(eq(lessonDays.learningPlanId, lesson.learningPlanId))
      .orderBy(lessonDays.scheduledDate);
    const dayIndex = allLessons.findIndex((l) => l.id === lessonId) + 1;
    // Resolve section name if this lesson belongs to a section
    let sectionName: string | null = null;
    if (lesson.sectionId != null) {
      const [sec] = await db.select({ name: planSections.name }).from(planSections).where(eq(planSections.id, lesson.sectionId));
      sectionName = sec?.name ?? null;
    }
    return { lesson, plan, pieceTitle: ctx.pieceTitle, composerName: ctx.composerName, dayIndex, sectionName };
  }

  async createLessonDays(days: InsertLessonDay[]): Promise<LessonDay[]> {
    if (days.length === 0) return [];
    return db.insert(lessonDays).values(days).returning();
  }

  async deleteLessonDaysForPlan(learningPlanId: number): Promise<void> {
    await db.delete(lessonDays).where(eq(lessonDays.learningPlanId, learningPlanId));
  }

  async deleteUpcomingLessonsFromDate(learningPlanId: number, fromDateISO: string): Promise<void> {
    // Only wipe lessons that are not yet completed (status != 'completed'),
    // scheduled on/after the given date. Completed sessions are immutable.
    await db.delete(lessonDays).where(and(
      eq(lessonDays.learningPlanId, learningPlanId),
      gte(lessonDays.scheduledDate, fromDateISO),
      ne(lessonDays.status, "completed"),
    ));
  }

  async updateLessonDay(id: number, updates: Partial<InsertLessonDay>): Promise<LessonDay | undefined> {
    const [updated] = await db.update(lessonDays).set(updates).where(eq(lessonDays.id, id)).returning();
    return updated;
  }

  // ── Passages (v2 scheduler) ──────────────────────────────────────────────

  async getPassagesForPlan(learningPlanId: number): Promise<Passage[]> {
    return db.select().from(passages)
      .where(eq(passages.learningPlanId, learningPlanId))
      .orderBy(passages.displayOrder, passages.measureStart);
  }

  async getPassageById(id: number): Promise<Passage | undefined> {
    const [row] = await db.select().from(passages).where(eq(passages.id, id));
    return row;
  }

  async createPassage(data: InsertPassage): Promise<Passage> {
    const [row] = await db.insert(passages).values(data).returning();
    return row;
  }

  async deletePassagesForPlan(learningPlanId: number): Promise<void> {
    // ON DELETE CASCADE on passageProgress handles the progress rows.
    await db.delete(passages).where(eq(passages.learningPlanId, learningPlanId));
  }

  // ── Passage Progress (v2 scheduler) ──────────────────────────────────────

  async getPassageProgressForPlan(learningPlanId: number): Promise<PassageProgress[]> {
    return db.select().from(passageProgress)
      .where(eq(passageProgress.learningPlanId, learningPlanId));
  }

  async getPassageProgress(passageId: number, learningPlanId: number): Promise<PassageProgress | undefined> {
    const [row] = await db.select().from(passageProgress)
      .where(and(eq(passageProgress.passageId, passageId), eq(passageProgress.learningPlanId, learningPlanId)));
    return row;
  }

  async createPassageProgress(data: InsertPassageProgress): Promise<PassageProgress> {
    const [row] = await db.insert(passageProgress).values(data).returning();
    return row;
  }

  async updatePassageProgress(id: number, updates: Partial<InsertPassageProgress>): Promise<PassageProgress | undefined> {
    const [row] = await db.update(passageProgress)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(passageProgress.id, id))
      .returning();
    return row;
  }

  async recalibratePassageDifficulties(planId: number, adjustments: Array<{ sectionId: number; newDifficulty: number }>): Promise<void> {
    for (const { sectionId, newDifficulty } of adjustments) {
      await db.update(passages)
        .set({ difficulty: newDifficulty })
        .where(and(eq(passages.learningPlanId, planId), eq(passages.sectionId, sectionId)));
      const affected = await db.select({ id: passages.id })
        .from(passages)
        .where(and(eq(passages.learningPlanId, planId), eq(passages.sectionId, sectionId)));
      const ids = affected.map((r) => r.id);
      if (ids.length > 0) {
        await db.update(passageProgress)
          .set({ srDifficulty: newDifficulty, updatedAt: new Date() })
          .where(and(eq(passageProgress.learningPlanId, planId), inArray(passageProgress.passageId, ids)));
      }
    }
  }

  // ── Measure Progress ─────────────────────────────────────────────────────

  async getMeasureProgress(learningPlanId: number): Promise<MeasureProgress[]> {
    return db.select().from(measureProgress).where(eq(measureProgress.learningPlanId, learningPlanId));
  }

  async upsertMeasureProgress(data: { planId: number; measureId: number; userId: string } & Partial<InsertMeasureProgress>): Promise<MeasureProgress> {
    const { planId, measureId, userId, ...rest } = data;
    const [existing] = await db.select().from(measureProgress)
      .where(and(eq(measureProgress.learningPlanId, planId), eq(measureProgress.measureId, measureId)));
    if (existing) {
      const [updated] = await db.update(measureProgress).set(rest).where(eq(measureProgress.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(measureProgress)
      .values({ learningPlanId: planId, measureId, userId, ...rest })
      .returning();
    return created;
  }

  // ── Community Scores ─────────────────────────────────────────────────────

  async getCommunityScoreById(id: number): Promise<CommunityScore | undefined> {
    const [row] = await db.select().from(communityScores).where(eq(communityScores.id, id));
    return row;
  }

  async getCommunityScoreByPiece(pieceId: number, movementId?: number | null): Promise<CommunityScore | undefined> {
    const conditions = movementId != null
      ? and(eq(communityScores.pieceId, pieceId), eq(communityScores.movementId, movementId))
      : and(eq(communityScores.pieceId, pieceId), isNull(communityScores.movementId));
    const [row] = await db.select().from(communityScores).where(conditions);
    return row;
  }

  async getAllCommunityScoresForPiece(pieceId: number): Promise<CommunityScore[]> {
    return db.select().from(communityScores).where(eq(communityScores.pieceId, pieceId));
  }

  async createCommunityScore(data: InsertCommunityScore): Promise<CommunityScore> {
    const [row] = await db.insert(communityScores).values(data).returning();
    return row;
  }

  async incrementCommunityScoreDownloads(id: number): Promise<void> {
    await db.update(communityScores)
      .set({ downloadCount: sql`${communityScores.downloadCount} + 1` })
      .where(eq(communityScores.id, id));
  }

  async deleteCommunityScore(id: number): Promise<void> {
    await db.delete(communityScores).where(eq(communityScores.id, id));
  }

  // ── Plan Sections ─────────────────────────────────────────────────────────

  async getSectionsForPlan(planId: number): Promise<PlanSection[]> {
    return db.select().from(planSections)
      .where(eq(planSections.learningPlanId, planId))
      .orderBy(planSections.displayOrder);
  }

  async createSection(data: InsertPlanSection): Promise<PlanSection> {
    const [row] = await db.insert(planSections).values(data).returning();
    return row;
  }

  async updateSection(id: number, updates: Partial<InsertPlanSection>): Promise<PlanSection | undefined> {
    const [row] = await db.update(planSections).set(updates).where(eq(planSections.id, id)).returning();
    return row;
  }

  async deleteSection(id: number): Promise<boolean> {
    const result = await db.delete(planSections).where(eq(planSections.id, id)).returning({ id: planSections.id });
    return result.length > 0;
  }

  async reorderSections(updates: { id: number; displayOrder: number }[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (const { id, displayOrder } of updates) {
        await tx.update(planSections).set({ displayOrder }).where(eq(planSections.id, id));
      }
    });
  }

  // ── Plan Section Phases ───────────────────────────────────────────────────

  async getPhasesForSection(sectionId: number): Promise<PlanSectionPhase[]> {
    return db.select().from(planSectionPhases)
      .where(eq(planSectionPhases.sectionId, sectionId))
      .orderBy(planSectionPhases.displayOrder);
  }

  async replacePhasesForSection(sectionId: number, phases: InsertPlanSectionPhase[]): Promise<PlanSectionPhase[]> {
    return db.transaction(async (tx) => {
      await tx.delete(planSectionPhases).where(eq(planSectionPhases.sectionId, sectionId));
      if (phases.length === 0) return [];
      return tx.insert(planSectionPhases).values(phases).returning();
    });
  }

  // ── Bar Flags ─────────────────────────────────────────────────────────────

  async getFlagsForLesson(lessonId: number): Promise<BarFlag[]> {
    return db.select().from(barFlags).where(eq(barFlags.lessonDayId, lessonId));
  }

  async createBarFlag(data: InsertBarFlag): Promise<BarFlag> {
    const [row] = await db.insert(barFlags).values(data).returning();
    return row;
  }

  async updateBarFlag(id: number, updates: Partial<InsertBarFlag>): Promise<BarFlag | undefined> {
    const [row] = await db.update(barFlags).set(updates).where(eq(barFlags.id, id)).returning();
    return row;
  }

  async deleteBarFlag(id: number): Promise<boolean> {
    const result = await db.delete(barFlags).where(eq(barFlags.id, id)).returning({ id: barFlags.id });
    return result.length > 0;
  }

  async getFlagSummaryForPlan(planId: number): Promise<BarFlagSummary[]> {
    const rows = await db
      .select({
        measureId: barFlags.measureId,
        measureNumber: measures.measureNumber,
        imageUrl: measures.imageUrl,
        flagCount: sql<number>`count(*)::int`,
        resolvedCount: sql<number>`sum(case when ${barFlags.resolved} then 1 else 0 end)::int`,
      })
      .from(barFlags)
      .innerJoin(measures, eq(measures.id, barFlags.measureId))
      .where(eq(barFlags.learningPlanId, planId))
      .groupBy(barFlags.measureId, measures.measureNumber, measures.imageUrl)
      .orderBy(measures.measureNumber);
    return rows;
  }

  // ── Session Task Feedback ─────────────────────────────────────────────────

  async createSessionTaskFeedback(data: InsertSessionTaskFeedback): Promise<SessionTaskFeedback> {
    const [row] = await db.insert(sessionTaskFeedback).values(data).returning();
    return row;
  }

  async getSessionTaskFeedbackForLesson(lessonDayId: number): Promise<SessionTaskFeedback[]> {
    return db.select().from(sessionTaskFeedback)
      .where(eq(sessionTaskFeedback.lessonDayId, lessonDayId))
      .orderBy(sessionTaskFeedback.createdAt);
  }

  async getSessionTaskFeedbackForPassage(passageId: number, planId: number): Promise<SessionTaskFeedback[]> {
    return db.select().from(sessionTaskFeedback)
      .where(and(
        eq(sessionTaskFeedback.passageId, passageId),
        eq(sessionTaskFeedback.learningPlanId, planId),
      ))
      .orderBy(desc(sessionTaskFeedback.createdAt));
  }

  // ── Bar Annotations ───────────────────────────────────────────────────────

  async getAnnotationsForLesson(lessonId: number): Promise<BarAnnotation[]> {
    return db.select().from(barAnnotations)
      .where(eq(barAnnotations.lessonDayId, lessonId))
      .orderBy(barAnnotations.createdAt);
  }

  async getAnnotationsForPlan(planId: number): Promise<BarAnnotation[]> {
    return db.select().from(barAnnotations)
      .where(eq(barAnnotations.learningPlanId, planId))
      .orderBy(desc(barAnnotations.createdAt));
  }

  async createBarAnnotation(data: InsertBarAnnotation): Promise<BarAnnotation> {
    const [row] = await db.insert(barAnnotations).values(data).returning();
    return row;
  }

  async updateBarAnnotation(id: number, text: string): Promise<BarAnnotation | undefined> {
    const [row] = await db.update(barAnnotations)
      .set({ text, updatedAt: new Date() })
      .where(eq(barAnnotations.id, id))
      .returning();
    return row;
  }

  async deleteBarAnnotation(id: number): Promise<boolean> {
    const result = await db.delete(barAnnotations).where(eq(barAnnotations.id, id)).returning({ id: barAnnotations.id });
    return result.length > 0;
  }

  // ── Plan Suggestions ──────────────────────────────────────────────────────

  async getPendingSuggestions(planId: number): Promise<PlanSuggestion[]> {
    return db.select().from(planSuggestions)
      .where(and(eq(planSuggestions.learningPlanId, planId), eq(planSuggestions.status, "pending")))
      .orderBy(desc(planSuggestions.createdAt));
  }

  async createSuggestion(data: InsertPlanSuggestion): Promise<PlanSuggestion> {
    const [row] = await db.insert(planSuggestions).values(data).returning();
    return row;
  }

  async updateSuggestion(id: number, updates: { status: "accepted" | "dismissed" }): Promise<PlanSuggestion | undefined> {
    const [row] = await db.update(planSuggestions).set(updates).where(eq(planSuggestions.id, id)).returning();
    return row;
  }
}

export const storage = new DatabaseStorage();
