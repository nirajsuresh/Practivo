import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { MILESTONE_TYPES } from "@shared/schema";
import { toInsertMeasures } from "./adapters/scorebars-adapter.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";

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

  app.get("/api/pieces/:pieceId/analysis", async (req, res) => {
    try {
      const pieceId = parseInt(req.params.pieceId);

      const cached = await storage.getPieceAnalysis(pieceId);
      if (cached) {
        return res.json({ analysis: cached.analysis, wikiUrl: cached.wikiUrl });
      }

      const piece = await storage.getPieceById(pieceId);
      if (!piece) return res.status(404).json({ error: "Piece not found" });

      const composer = await storage.getComposerById(piece.composerId);
      const composerName = composer?.name ?? "Unknown";
      const searchQuery = `${composerName} ${piece.title} piano`;

      let wikiExtract = "";
      let wikiUrl: string | null = null;

      try {
        const searchRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&format=json&srlimit=1`
        );
        const searchData = await searchRes.json() as any;
        const topResult = searchData?.query?.search?.[0];

        if (topResult) {
          const pageTitle = topResult.title;
          wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`;
          const extractRes = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=true&titles=${encodeURIComponent(pageTitle)}&format=json&exlimit=1`
          );
          const extractData = await extractRes.json() as any;
          const pages = extractData?.query?.pages;
          if (pages) {
            const page = Object.values(pages)[0] as any;
            wikiExtract = (page?.extract ?? "").substring(0, 1500);
          }
        }
      } catch (wikiError) {
        console.error("Wikipedia fetch error:", wikiError);
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: "AI service not configured" });
      }

      const prompt = wikiExtract
        ? `Write a single short paragraph (3-5 sentences) describing "${piece.title}" by ${composerName}. Cover when it was composed, its musical character, and what makes it notable. Write as a factual encyclopedia-style description, not as a response to someone. Do not use headers, bullet points, or address the reader.\n\nReference material:\n${wikiExtract}`
        : `Write a single short paragraph (3-5 sentences) describing "${piece.title}" by ${composerName}. Cover its musical character, style period, and what makes it notable for pianists. Write as a factual encyclopedia-style description, not as a response to someone. Do not use headers, bullet points, or address the reader.`;

      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: {
                parts: [{ text: "You write brief, factual descriptions of classical music pieces in the style of a music encyclopedia entry." }],
              },
              contents: [{ parts: [{ text: prompt }] }],
            }),
          }
        );
        if (!geminiRes.ok) {
          return res.status(502).json({ error: "AI service temporarily unavailable." });
        }
        const geminiData = await geminiRes.json() as any;
        const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const analysis = text.trim() || "Analysis not available.";
        const saved = await storage.savePieceAnalysis({ pieceId, analysis, wikiUrl });
        res.json({ analysis: saved.analysis, wikiUrl: saved.wikiUrl });
      } catch {
        return res.status(502).json({ error: "AI service temporarily unavailable." });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to generate analysis" });
    }
  });

  // ── Repertoire ───────────────────────────────────────────────────────────

  app.get("/api/repertoire/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      const repertoire = await storage.getRepertoireByUser(userId);
      res.json(repertoire);
    } catch {
      res.status(500).json({ error: "Failed to get repertoire" });
    }
  });

  app.post("/api/repertoire", async (req, res) => {
    try {
      const entry = await storage.createRepertoireEntry(req.body);
      res.status(201).json(entry);
    } catch {
      res.status(500).json({ error: "Failed to create repertoire entry" });
    }
  });

  app.put("/api/repertoire/reorder", async (req, res) => {
    try {
      const { userId, order } = req.body;
      if (!userId || !Array.isArray(order)) {
        return res.status(400).json({ error: "userId and order array are required" });
      }
      await storage.updateRepertoireOrder(userId, order);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update repertoire order" });
    }
  });

  app.patch("/api/repertoire/piece/:pieceId", async (req, res) => {
    try {
      const pieceId = parseInt(req.params.pieceId);
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const updated = await storage.updateRepertoireByPiece(userId, pieceId, req.body);
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update repertoire entries" });
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

  app.delete("/api/repertoire/piece/:pieceId", async (req, res) => {
    try {
      const pieceId = parseInt(req.params.pieceId);
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const deleted = await storage.deleteRepertoireByPiece(userId, pieceId);
      if (!deleted) return res.status(404).json({ error: "No repertoire entries found for this piece" });
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "Failed to delete repertoire entries" });
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

  // ── Milestones ───────────────────────────────────────────────────────────

  app.get("/api/milestones/:userId/:pieceId", async (req, res) => {
    try {
      const { userId, pieceId } = req.params;
      const movementId = req.query.movementId != null ? parseInt(req.query.movementId as string) : undefined;
      const allMovements = req.query.allMovements === "true";
      const data = await storage.getMilestones(
        userId,
        parseInt(pieceId),
        Number.isInteger(movementId) ? movementId : undefined,
        allMovements,
      );
      res.json(data);
    } catch {
      res.status(500).json({ error: "Failed to get milestones" });
    }
  });

  app.post("/api/milestones", async (req, res) => {
    try {
      const { userId, pieceId, cycleNumber, milestoneType, achievedAt, movementId } = req.body;
      if (!userId || !pieceId || !milestoneType || !achievedAt) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const normalizedType = String(milestoneType).trim();
      if (!MILESTONE_TYPES.includes(normalizedType as (typeof MILESTONE_TYPES)[number])) {
        return res.status(400).json({ error: `Invalid milestone type: ${normalizedType}` });
      }
      const parsedCycle = Number(cycleNumber ?? 1);
      if (!Number.isInteger(parsedCycle) || parsedCycle < 1) {
        return res.status(400).json({ error: "cycleNumber must be a positive integer" });
      }
      const normalizedDate = String(achievedAt).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
        return res.status(400).json({ error: "achievedAt must be YYYY-MM-DD" });
      }
      const parsedMovementId = movementId != null && movementId !== "" ? parseInt(movementId) : undefined;
      const data = await storage.upsertMilestone(
        userId, parseInt(pieceId), parsedCycle, normalizedType, normalizedDate,
        Number.isInteger(parsedMovementId) ? parsedMovementId : undefined
      );
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to upsert milestone", detail: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch("/api/milestones/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const normalizedDate = String(req.body?.achievedAt ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
        return res.status(400).json({ error: "achievedAt must be YYYY-MM-DD" });
      }
      const updated = await storage.updateMilestoneDate(id, normalizedDate);
      if (!updated) return res.status(404).json({ error: "Milestone not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update milestone" });
    }
  });

  app.delete("/api/milestones/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ok = await storage.deleteMilestone(id);
      res.json({ success: ok });
    } catch {
      res.status(500).json({ error: "Failed to delete milestone" });
    }
  });

  app.post("/api/repertoire/:id/new-cycle", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const entry = await storage.startNewCycle(id);
      if (!entry) return res.status(404).json({ error: "Repertoire entry not found" });
      res.json(entry);
    } catch {
      res.status(500).json({ error: "Failed to start new cycle" });
    }
  });

  app.post("/api/repertoire/:id/remove-cycle", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const entry = await storage.removeCurrentCycle(id);
      if (!entry) return res.status(404).json({ error: "Repertoire entry not found" });
      res.json(entry);
    } catch {
      res.status(500).json({ error: "Failed to remove current cycle" });
    }
  });

  // ── Learning Plans ───────────────────────────────────────────────────────

  // Look up plan by repertoire entry ID
  app.get("/api/learning-plans/entry/:entryId", async (req, res) => {
    try {
      const entryId = parseInt(req.params.entryId);
      const plan = await storage.getLearningPlan(entryId);
      res.json(plan || null);
    } catch {
      res.status(500).json({ error: "Failed to get learning plan" });
    }
  });

  // Look up plan by its own ID
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
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const plan = await storage.createLearningPlan({ ...req.body, userId });
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
      const userId = (req.headers["x-user-id"] as string) || req.body.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const pieceId = req.body.pieceId ? parseInt(req.body.pieceId) : null;

      const record = await storage.createSheetMusic({
        pieceId,
        userId,
        fileUrl: req.file.path,
        source: "upload",
        processingStatus: "pending",
      });

      // Immediately kick off bar detection in the background
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

  app.post("/api/sheet-music/:id/process", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const record = await storage.getSheetMusic(id);
      if (!record) return res.status(404).json({ error: "Sheet music not found" });

      await storage.updateSheetMusicStatus(id, "processing");

      // Fire-and-forget: process asynchronously
      import("./scorebars/index.js").then(async ({ ScorebarService }) => {
        try {
          const service = new ScorebarService();
          const result = await service.processFile(record.fileUrl);
          const savedMeasures = await storage.saveMeasures(toInsertMeasures(id, result.measures));
          await storage.updateSheetMusicStatus(id, "done", result.pageCount);
          // Auto-update learning plan total measures if one exists
          const plan = await storage.getLearningPlanBySheetMusic(id);
          if (plan) {
            await storage.updateLearningPlan(plan.id, { totalMeasures: savedMeasures.length });
          }
        } catch (err) {
          console.error("ScoreBars processing failed:", err);
          await storage.updateSheetMusicStatus(id, "failed");
        }
      }).catch(console.error);

      res.json({ status: "processing" });
    } catch {
      res.status(500).json({ error: "Failed to start processing" });
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

  // Returns page images + bar bounding boxes for the score review UI
  app.get("/api/sheet-music/:id/pages", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const record = await storage.getSheetMusic(id);
      if (!record) return res.status(404).json({ error: "Sheet music not found" });

      const measures = await storage.getMeasures(id);
      const pagesDir = path.join(process.cwd(), "uploads", "pages", String(id));

      // Build page list from saved PNGs, sorted numerically (page-1, page-2 … page-10, not page-1, page-10)
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
        // Extract the real page number from the filename (page-N.png)
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

  app.get("/api/sheet-music/:id/measures", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const measureList = await storage.getMeasures(id);
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

  // Run bar detection on a user-drawn sub-region of a page image
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

  // Replace all measures for a sheet music with a user-edited set
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

      // Sort by page → y → x and assign sequential measureNumber
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

      // Keep sheet music status and page count in sync
      await storage.updateSheetMusicStatus(id, "ready", record.pageCount ?? undefined);

      // Update learning plan totalMeasures if one exists
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

      // How many measures to assign per day (at least 1)
      const measuresPerDay = totalMeasures > 0 ? Math.ceil(totalMeasures / totalDays) : 1;

      const days: Array<{
        learningPlanId: number;
        scheduledDate: string;
        measureStart: number;
        measureEnd: number;
        status: "pending";
      }> = [];

      let measureCursor = 1;
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split("T")[0];
        const start = measureCursor;
        const end = totalMeasures > 0 ? Math.min(measureCursor + measuresPerDay - 1, totalMeasures) : measuresPerDay;
        days.push({ learningPlanId: planId, scheduledDate: dateStr, measureStart: start, measureEnd: end, status: "pending" });
        if (totalMeasures > 0) {
          measureCursor = end + 1;
          if (measureCursor > totalMeasures) break;
        } else {
          measureCursor += measuresPerDay;
        }
      }

      const created = await storage.createLessonDays(days);
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
      const updated = await storage.updateLessonDay(id, req.body);
      if (!updated) return res.status(404).json({ error: "Lesson not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update lesson" });
    }
  });

  // ── Measure Progress ─────────────────────────────────────────────────────

  app.get("/api/learning-plans/:planId/progress", async (req, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const [plan, measureProgress, lessons] = await Promise.all([
        storage.getLearningPlanById(planId),
        storage.getMeasureProgress(planId),
        storage.getLessonDays(planId),
      ]);
      const learnedMeasures = measureProgress.filter((p: any) => p.status === "learned").length;
      const completedLessons = lessons.filter((l: any) => l.status === "completed").length;
      const totalLessons = lessons.length;

      // Simple streak: count consecutive completed days working backwards from today
      const today = new Date().toISOString().split("T")[0];
      const completedDates = new Set(
        lessons.filter((l: any) => l.status === "completed").map((l: any) => l.scheduledDate.toString().slice(0, 10))
      );
      let streakDays = 0;
      const d = new Date(today);
      while (completedDates.has(d.toISOString().split("T")[0])) {
        streakDays++;
        d.setDate(d.getDate() - 1);
      }

      res.json({
        learnedMeasures,
        totalMeasures: plan?.totalMeasures ?? 0,
        completedLessons,
        totalLessons,
        streakDays,
      });
    } catch {
      res.status(500).json({ error: "Failed to get measure progress" });
    }
  });

  app.put("/api/learning-plans/:planId/progress/:measureNumber", async (req, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const measureNumber = parseInt(req.params.measureNumber);
      const userId = (req.headers["x-user-id"] as string) || req.body.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const updated = await storage.upsertMeasureProgress({ planId, measureId: measureNumber, userId, ...req.body });

      // Auto-trigger milestones based on progress thresholds (fire-and-forget)
      storage.getLearningPlanById(planId).then(async (plan) => {
        const total = plan?.totalMeasures ?? 0;
        if (!plan || total <= 0) return;
        const allProgress = await storage.getMeasureProgress(planId);
        const learnedCount = allProgress.filter((p: any) => p.status === "learned").length;
        const pct = learnedCount / total;

        const { db } = await import("./db.js");
        const { learningPlans: lpTable, repertoireEntries: reTable } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const [lp] = await db.select().from(lpTable).where(eq(lpTable.id, planId));
        if (!lp) return;
        const [entry] = await db.select().from(reTable).where(eq(reTable.id, lp.repertoireEntryId));
        if (!entry) return;

        const now = new Date().toISOString().slice(0, 10);
        const cycle = entry.currentCycle ?? 1;
        if (learnedCount === 1) await storage.upsertMilestone(userId, entry.pieceId, cycle, "started", now);
        if (pct >= 0.30) await storage.upsertMilestone(userId, entry.pieceId, cycle, "read_through", now);
        if (pct >= 0.75) await storage.upsertMilestone(userId, entry.pieceId, cycle, "notes_learned", now);
        if (pct >= 1.0)  await storage.upsertMilestone(userId, entry.pieceId, cycle, "up_to_speed", now);
      }).catch(console.error);

      res.json(updated);
    } catch (err) {
      console.error("progress update error:", err);
      res.status(500).json({ error: "Failed to update measure progress" });
    }
  });

  // ── Auth ─────────────────────────────────────────────────────────────────

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing) return res.status(409).json({ error: "Username already taken" });
      const user = await storage.createUser({ username, password });
      res.status(201).json({ id: user.id, username: user.username });
    } catch {
      res.status(500).json({ error: "Failed to register" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      const user = await storage.getUserByUsername(username);
      if (!user || user.password !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      res.json({ id: user.id, username: user.username });
    } catch {
      res.status(500).json({ error: "Failed to login" });
    }
  });

  // ── Users ────────────────────────────────────────────────────────────────

  app.get("/api/users/search", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      const currentUserId = req.headers["x-user-id"] as string;
      if (!currentUserId) return res.status(401).json({ error: "Not authenticated" });
      const users = await storage.searchUsers(query, currentUserId);
      res.json(users);
    } catch {
      res.status(500).json({ error: "Failed to search users" });
    }
  });

  app.get("/api/users/lookup/:username", async (req, res) => {
    try {
      const user = await storage.getUserByUsername(req.params.username);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ id: user.id, username: user.username });
    } catch {
      res.status(500).json({ error: "Failed to lookup user" });
    }
  });

  app.get("/api/users/:userId/profile", async (req, res) => {
    try {
      const profile = await storage.getUserProfile(req.params.userId);
      if (!profile) return res.status(404).json({ error: "User profile not found" });
      res.json(profile);
    } catch {
      res.status(500).json({ error: "Failed to get user profile" });
    }
  });

  app.post("/api/users/:userId/profile", async (req, res) => {
    try {
      const profile = await storage.createUserProfile({ ...req.body, userId: req.params.userId });
      res.status(201).json(profile);
    } catch {
      res.status(500).json({ error: "Failed to create profile" });
    }
  });

  app.post("/api/users/:userId/repertoire", async (req, res) => {
    try {
      const userId = req.params.userId;
      const entries = req.body.entries as Array<{ composerId: number; pieceId: number; movementId?: number; status: string; startedDate?: string }>;
      if (!entries || !Array.isArray(entries)) {
        return res.status(400).json({ error: "entries array is required" });
      }
      const created = [];
      for (const entry of entries) {
        const result = await storage.createRepertoireEntry({ ...entry, userId });
        created.push(result);
      }
      res.status(201).json(created);
    } catch {
      res.status(500).json({ error: "Failed to create repertoire entries" });
    }
  });

  // ── Search ───────────────────────────────────────────────────────────────

  app.get("/api/search/unified", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      const results = await storage.unifiedSearch(query);
      res.json(results);
    } catch {
      res.status(500).json({ error: "Failed to search" });
    }
  });

  return httpServer;
}
