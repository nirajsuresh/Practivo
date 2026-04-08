import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { toInsertMeasures } from "./adapters/scorebars-adapter.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";
import { db } from "./db";
import { eq, and, gte, lte } from "drizzle-orm";
import { composers, pieces, repertoireEntries, learningPlans, lessonDays, sheetMusic } from "@shared/schema";
import type { LessonTask } from "@shared/schema";

export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

const uploadsDir = path.join(process.cwd(), "uploads", "sheet-music");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed"));
  },
});

/** In-memory processing progress: sheetMusicId → { page, total } */
const processingProgress = new Map<number, { page: number; total: number }>();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Serve uploaded files (page images, cropped bars) as static assets
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // ── Today (aggregate endpoint for home screen) ───────────────────────────

  app.get("/api/today", async (_req, res) => {
    try {
      const userId = DEFAULT_USER_ID;

      // Get the user's full repertoire (with piece + composer info)
      const { entries } = await storage.getRepertoireByUser(userId);

      // Active entry = first "In Progress" entry
      const activeEntry = entries.find(e => e.status === "In Progress") ?? entries[0] ?? null;

      let todayLesson = null;
      let activePlan = null;
      let sheetMusicId = null;

      if (activeEntry) {
        // Find the learning plan for this entry
        activePlan = await storage.getLearningPlan(activeEntry.id);
        if (activePlan) {
          const today = new Date().toISOString().split("T")[0];
          todayLesson = await storage.getLessonDay(activePlan.id, today);

          // Get the sheet music ID for bar images
          const [sm] = await db.select({ id: sheetMusic.id })
            .from(sheetMusic)
            .where(and(
              eq(sheetMusic.pieceId, activeEntry.pieceId),
              eq(sheetMusic.userId, userId)
            ))
            .limit(1);
          sheetMusicId = sm?.id ?? null;
        }
      }

      res.json({
        activeEntry,
        activePlan,
        todayLesson,
        sheetMusicId,
        repertoire: entries,
      });
    } catch (err) {
      console.error("GET /api/today error:", err);
      res.status(500).json({ error: "Failed to load today's data" });
    }
  });

  // ── Composers ────────────────────────────────────────────────────────────

  app.get("/api/composers/search", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      const composers = await storage.searchComposers(query);
      res.json(composers);
    } catch {
      res.status(500).json({ error: "Failed to search composers" });
    }
  });

  app.get("/api/composers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const composer = await storage.getComposerById(id);
      if (!composer) return res.status(404).json({ error: "Composer not found" });
      res.json(composer);
    } catch {
      res.status(500).json({ error: "Failed to get composer" });
    }
  });

  app.get("/api/composers/:id/pieces", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const pieces = await storage.getComposerPieces(id);
      res.json(pieces);
    } catch {
      res.status(500).json({ error: "Failed to get composer pieces" });
    }
  });

  // ── Pieces ───────────────────────────────────────────────────────────────

  app.get("/api/pieces/search", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      const composerId = req.query.composerId ? parseInt(req.query.composerId as string) : undefined;
      const pieces = await storage.searchPieces(query, composerId);
      res.json(pieces);
    } catch {
      res.status(500).json({ error: "Failed to search pieces" });
    }
  });

  app.get("/api/pieces/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const piece = await storage.getPieceById(id);
      if (!piece) return res.status(404).json({ error: "Piece not found" });
      res.json(piece);
    } catch {
      res.status(500).json({ error: "Failed to get piece" });
    }
  });

  app.get("/api/pieces/:pieceId/movements", async (req, res) => {
    try {
      const pieceId = parseInt(req.params.pieceId);
      const movements = await storage.getMovementsByPiece(pieceId);
      res.json(movements);
    } catch {
      res.status(500).json({ error: "Failed to get movements" });
    }
  });

  // ── Repertoire ───────────────────────────────────────────────────────────

  app.get("/api/repertoire", async (_req, res) => {
    try {
      const repertoire = await storage.getRepertoireByUser(DEFAULT_USER_ID);
      res.json(repertoire);
    } catch {
      res.status(500).json({ error: "Failed to get repertoire" });
    }
  });

  // Legacy userId route kept for compatibility
  app.get("/api/repertoire/:userId", async (_req, res) => {
    try {
      const repertoire = await storage.getRepertoireByUser(DEFAULT_USER_ID);
      res.json(repertoire);
    } catch {
      res.status(500).json({ error: "Failed to get repertoire" });
    }
  });

  app.post("/api/repertoire", async (req, res) => {
    try {
      const entry = await storage.createRepertoireEntry({ ...req.body, userId: DEFAULT_USER_ID });
      res.status(201).json(entry);
    } catch {
      res.status(500).json({ error: "Failed to create repertoire entry" });
    }
  });

  app.patch("/api/repertoire/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateRepertoireEntry(id, req.body);
      if (!updated) return res.status(404).json({ error: "Repertoire entry not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update repertoire entry" });
    }
  });

  app.delete("/api/repertoire/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteRepertoireEntry(id);
      if (!deleted) return res.status(404).json({ error: "Repertoire entry not found" });
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "Failed to delete repertoire entry" });
    }
  });

  // ── Learning Plans ───────────────────────────────────────────────────────

  app.get("/api/learning-plans/entry/:entryId", async (req, res) => {
    try {
      const entryId = parseInt(req.params.entryId);
      const plan = await storage.getLearningPlan(entryId);
      res.json(plan || null);
    } catch {
      res.status(500).json({ error: "Failed to get learning plan" });
    }
  });

  app.get("/api/learning-plans/:planId", async (req, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getLearningPlanById(planId);
      res.json(plan || null);
    } catch {
      res.status(500).json({ error: "Failed to get learning plan" });
    }
  });

  app.post("/api/learning-plans", async (req, res) => {
    try {
      const plan = await storage.createLearningPlan({ ...req.body, userId: DEFAULT_USER_ID });
      res.status(201).json(plan);
    } catch {
      res.status(500).json({ error: "Failed to create learning plan" });
    }
  });

  app.patch("/api/learning-plans/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateLearningPlan(id, req.body);
      if (!updated) return res.status(404).json({ error: "Learning plan not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update learning plan" });
    }
  });

  // ── Sheet Music ──────────────────────────────────────────────────────────

  app.post("/api/sheet-music/upload", upload.single("pdf"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const pieceId = req.body.pieceId ? parseInt(req.body.pieceId) : null;

      const record = await storage.createSheetMusic({
        pieceId,
        userId: DEFAULT_USER_ID,
        fileUrl: req.file.path,
        source: "upload",
        processingStatus: "pending",
      });

      const smId = record.id;
      import("./scorebars/index.js").then(async ({ ScorebarService }) => {
        try {
          await storage.updateSheetMusicStatus(smId, "processing");
          processingProgress.set(smId, { page: 0, total: 0 });
          const pagesDir = path.join(process.cwd(), "uploads", "pages", String(smId));
          const service = new ScorebarService({
            pagesDir,
            onProgress: (page, total) => {
              processingProgress.set(smId, { page, total });
            },
          });
          const result = await service.processFile(record.fileUrl);
          await storage.saveMeasures(toInsertMeasures(smId, result.measures));
          await storage.updateSheetMusicStatus(smId, "ready", result.pageCount);
          processingProgress.delete(smId);
          const plan = await storage.getLearningPlanBySheetMusic(smId);
          if (plan) {
            await storage.updateLearningPlan(plan.id, { totalMeasures: result.measures.length });
          }
        } catch (err) {
          console.error("ScoreBars processing failed:", err);
          await storage.updateSheetMusicStatus(smId, "failed");
          processingProgress.delete(smId);
        }
      }).catch(console.error);

      res.status(201).json({ sheetMusicId: record.id });
    } catch (err) {
      console.error("Upload route error:", err);
      res.status(500).json({ error: "Failed to upload sheet music" });
    }
  });

  app.get("/api/sheet-music/:id/status", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const record = await storage.getSheetMusic(id);
      if (!record) return res.status(404).json({ error: "Sheet music not found" });
      const measureCount = await storage.getMeasureCount(id);
      const progress = processingProgress.get(id) ?? null;
      res.json({
        id: record.id,
        processingStatus: record.processingStatus,
        measuresFound: measureCount,
        pageCount: record.pageCount,
        processingPage: progress?.page ?? null,
        processingTotal: progress?.total ?? null,
      });
    } catch {
      res.status(500).json({ error: "Failed to get status" });
    }
  });

  app.get("/api/sheet-music/:id/pages", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const record = await storage.getSheetMusic(id);
      if (!record) return res.status(404).json({ error: "Sheet music not found" });

      const measures = await storage.getMeasures(id);
      const pagesDir = path.join(process.cwd(), "uploads", "pages", String(id));

      const pageFiles = fs.existsSync(pagesDir)
        ? fs.readdirSync(pagesDir)
            .filter(f => f.endsWith(".png"))
            .sort((a, b) => {
              const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
              const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
              return na - nb;
            })
        : [];

      const pages = pageFiles.map((file) => {
        const pageNumber = parseInt(file.match(/\d+/)?.[0] ?? "0", 10);
        const imageUrl = `/uploads/pages/${id}/${file}`;
        const pageMeasures = measures
          .filter(m => m.pageNumber === pageNumber)
          .map(m => ({
            id: m.id,
            measureNumber: m.measureNumber,
            movementNumber: m.movementNumber,
            boundingBox: m.boundingBox,
          }));
        return { pageNumber, imageUrl, measures: pageMeasures };
      });

      res.json(pages);
    } catch {
      res.status(500).json({ error: "Failed to get pages" });
    }
  });

  // Returns measures, optionally filtered by measure number range (for session/plan bar images)
  app.get("/api/sheet-music/:id/measures", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      let measureList = await storage.getMeasures(id);
      const start = req.query.start ? parseInt(req.query.start as string) : null;
      const end = req.query.end ? parseInt(req.query.end as string) : null;
      if (start !== null) measureList = measureList.filter(m => m.measureNumber >= start);
      if (end !== null) measureList = measureList.filter(m => m.measureNumber <= end);
      res.json(measureList);
    } catch {
      res.status(500).json({ error: "Failed to get measures" });
    }
  });

  app.patch("/api/measures/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateMeasure(id, req.body);
      if (!updated) return res.status(404).json({ error: "Measure not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update measure" });
    }
  });

  app.post("/api/sheet-music/:id/confirm", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.confirmMeasures(id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to confirm measures" });
    }
  });

  app.post("/api/sheet-music/:id/detect-region", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { pageNumber, region } = req.body as {
        pageNumber: number;
        region: { x: number; y: number; w: number; h: number };
      };
      if (!pageNumber || !region) {
        return res.status(400).json({ error: "pageNumber and region required" });
      }
      const pageImagePath = path.join(process.cwd(), "uploads", "pages", String(id), `page-${pageNumber}.png`);
      if (!fs.existsSync(pageImagePath)) {
        return res.status(404).json({ error: "Page image not found" });
      }
      const imageBuffer = fs.readFileSync(pageImagePath);
      const pageWidth  = imageBuffer.readUInt32BE(16);
      const pageHeight = imageBuffer.readUInt32BE(20);

      const { BarDetector } = await import("./scorebars/bar-detector.js");
      const detector = new BarDetector();
      const boxes = await detector.detectBarsInRegion(imageBuffer, pageWidth, pageHeight, region);
      res.json({ boxes });
    } catch (err) {
      console.error("detect-region failed:", err);
      res.status(500).json({ error: "Detection failed" });
    }
  });

  app.put("/api/sheet-music/:id/measures/replace", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const record = await storage.getSheetMusic(id);
      if (!record) return res.status(404).json({ error: "Sheet music not found" });

      const incoming = req.body.measures as Array<{
        pageNumber: number;
        boundingBox: { x: number; y: number; w: number; h: number };
        movementNumber: number;
      }>;
      if (!Array.isArray(incoming)) {
        return res.status(400).json({ error: "measures array required" });
      }

      const sorted = [...incoming].sort((a, b) => {
        if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
        if (a.boundingBox.y !== b.boundingBox.y) return a.boundingBox.y - b.boundingBox.y;
        return a.boundingBox.x - b.boundingBox.x;
      });

      const insertRows = sorted.map((m, i) => ({
        sheetMusicId: id,
        measureNumber: i + 1,
        pageNumber: m.pageNumber,
        boundingBox: m.boundingBox,
        movementNumber: m.movementNumber,
        userCorrected: true,
        confirmedAt: new Date(),
        imageUrl: null,
      }));

      const saved = await storage.replaceMeasures(id, insertRows);
      await storage.updateSheetMusicStatus(id, "ready", record.pageCount ?? undefined);
      const plan = await storage.getLearningPlanBySheetMusic(id);
      if (plan) {
        await storage.updateLearningPlan(plan.id, { totalMeasures: saved.length });
      }

      res.json({ saved: saved.length });
    } catch (err) {
      console.error("measures/replace failed:", err);
      res.status(500).json({ error: "Failed to replace measures" });
    }
  });

  // ── Lesson Days ──────────────────────────────────────────────────────────

  app.get("/api/learning-plans/:planId/lessons", async (req, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const lessons = await storage.getLessonDays(planId);
      res.json(lessons);
    } catch {
      res.status(500).json({ error: "Failed to get lessons" });
    }
  });

  app.post("/api/learning-plans/:planId/generate-lessons", async (req, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getLearningPlanById(planId);
      if (!plan) return res.status(404).json({ error: "Plan not found" });

      const totalMeasures = plan.totalMeasures ?? 0;
      const { targetCompletionDate } = plan;
      if (!targetCompletionDate) return res.status(400).json({ error: "No target date" });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(targetCompletionDate);
      const totalDays = Math.max(1, Math.round((target.getTime() - today.getTime()) / 86400000));
      const measuresPerDay = totalMeasures > 0 ? Math.ceil(totalMeasures / totalDays) : 1;

      const days: Array<{
        learningPlanId: number;
        scheduledDate: string;
        measureStart: number;
        measureEnd: number;
        tasks: LessonTask[];
        status: string;
      }> = [];

      let cursor = 1;
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];
        const start = cursor;
        const end = totalMeasures > 0 ? Math.min(cursor + measuresPerDay - 1, totalMeasures) : measuresPerDay;

        const tasks: LessonTask[] = [
          {
            id: `${i}_1`,
            description: `Practice mm. ${start}–${end}`,
            measureStart: start,
            measureEnd: end,
            completed: false,
          },
        ];

        // Add a cumulative run-through once there's a meaningful amount learned
        if (start > measuresPerDay && end > 1) {
          tasks.push({
            id: `${i}_2`,
            description: `Play mm. 1–${end}`,
            measureStart: 1,
            measureEnd: end,
            completed: false,
          });
        }

        days.push({ learningPlanId: planId, scheduledDate: dateStr, measureStart: start, measureEnd: end, tasks, status: "upcoming" });

        if (totalMeasures > 0) {
          cursor = end + 1;
          if (cursor > totalMeasures) break;
        } else {
          cursor += measuresPerDay;
        }
      }

      const created = await storage.createLessonDays(days as any);
      await storage.updateLearningPlan(planId, { status: "active" });
      res.status(201).json({ lessonDays: created.length });
    } catch (err) {
      console.error("generate-lessons error:", err);
      res.status(500).json({ error: "Failed to generate lessons" });
    }
  });

  app.get("/api/learning-plans/:planId/today", async (req, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const today = new Date().toISOString().split("T")[0];
      const lesson = await storage.getLessonDay(planId, today);
      res.json(lesson || null);
    } catch {
      res.status(500).json({ error: "Failed to get today's lesson" });
    }
  });

  app.patch("/api/lessons/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const body = req.body;
      // If completing a task, update the tasks JSONB
      if (typeof body.completedTaskIndex === "number") {
        const lesson = await storage.getLessonDay(0, ""); // get by id
        // Update via raw SQL for JSONB
        const { db } = await import("./db.js");
        const { lessonDays: ld } = await import("@shared/schema");
        const { eq: eqFn, sql: sqlFn } = await import("drizzle-orm");
        const [current] = await db.select().from(ld).where(eqFn(ld.id, id));
        if (!current) return res.status(404).json({ error: "Lesson not found" });
        const tasks = (current.tasks ?? []) as any[];
        const idx = body.completedTaskIndex;
        if (tasks[idx]) tasks[idx].completed = true;
        const [updated] = await db.update(ld).set({ tasks } as any).where(eqFn(ld.id, id)).returning();
        return res.json(updated);
      }
      const updated = await storage.updateLessonDay(id, body);
      if (!updated) return res.status(404).json({ error: "Lesson not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update lesson" });
    }
  });

  return httpServer;
}
