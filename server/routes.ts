import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  MILESTONE_TYPES,
  PHASE_LABELS,
  PHASE_TYPES,
  PHASE_BASE_EFFORT,
  LEVEL_MULTIPLIER,
  DIFFICULTY_MULTIPLIER,
  CHUNK_LEVEL_PHASES,
  computeChunkSizeShared,
  type SessionSection,
  type PhaseType,
  type PlayingLevel,
  type InsertPlanSuggestion,
} from "@shared/schema";
import { toInsertMeasures } from "./adapters/scorebars-adapter.js";
import { generatePlanV2, applySessionOutcome, replanUpcomingSessions, checkPlanFeasibility, computePaceGap } from "./scheduler/index.js";
import type { SectionInput } from "./scheduler/index.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import express from "express";
import { uploadToR2, downloadFromR2 } from "./r2.js";

function getWarmupTasks(instr: string): string[] {
  if (instr.includes("piano")) {
    return ["Scales (2 octaves, hands separately)", "Arpeggios", "Hanon exercises (2–3)"];
  } else if (instr.includes("violin") || instr.includes("viola") || instr.includes("cello")) {
    return ["Long tones (open strings)", "Scales (1 octave, slow bow)", "Shifting exercises"];
  } else if (instr.includes("guitar")) {
    return ["Chromatic warm-up", "Major scale patterns", "Arpeggios (p-i-m-a)"];
  } else if (instr.includes("voice") || instr.includes("vocal")) {
    return ["Lip trills (5-note scale)", "Humming (descending 5ths)", "Vowel exercise on [a]"];
  } else {
    return ["Long tones or sustained notes", "Scales (slow, full range)", "Technical exercise of choice"];
  }
}

function getPracticeTasks(start: number, end: number): string[] {
  const tasks: string[] = [];
  const chunkSize = Math.max(2, Math.floor((end - start + 1) / 3));
  for (let s = start; s <= end; s += chunkSize) {
    const e = Math.min(s + chunkSize - 1, end);
    const label = s === e ? `m. ${s}` : `mm. ${s}–${e}`;
    tasks.push(`${label}, hands separately ♩=46`);
    tasks.push(`${label}, hands together ♩=52`);
  }
  tasks.push(`Play mm. ${start}–${end} through`);
  return tasks;
}

/** Build phase-specific practice tasks for a named section */
function buildPhaseTasks(
  phaseType: PhaseType,
  sectionName: string,
  measureStart: number,
  measureEnd: number,
  warmupMins: number,
  practiceSectionMins: number,
  instrument: string,
): SessionSection[] {
  const warmupTasks = getWarmupTasks(instrument);
  const chunkSize = Math.max(2, Math.floor((measureEnd - measureStart + 1) / 3));
  const label = `${sectionName} — ${PHASE_LABELS[phaseType].label}`;

  let practiceTasks: string[];

  switch (phaseType) {
    case "decode": {
      practiceTasks = [];
      for (let s = measureStart; s <= measureEnd; s += chunkSize) {
        const e = Math.min(s + chunkSize - 1, measureEnd);
        const range = s === e ? `m. ${s}` : `mm. ${s}–${e}`;
        practiceTasks.push(`${range} — right hand only ♩=40`);
        practiceTasks.push(`${range} — left hand only ♩=40`);
      }
      practiceTasks.push("Note fingering decisions throughout");
      break;
    }

    case "build": {
      practiceTasks = [];
      for (let s = measureStart; s <= measureEnd; s += chunkSize) {
        const e = Math.min(s + chunkSize - 1, measureEnd);
        const range = s === e ? `m. ${s}` : `mm. ${s}–${e}`;
        practiceTasks.push(`${range}, hands together ♩=46`);
        practiceTasks.push(`${range}, hands together ♩=56`);
      }
      practiceTasks.push("Drill any sequences or technically demanding passages until automatic");
      break;
    }

    case "connect":
      practiceTasks = [
        `Connect mm. ${measureStart}–${measureEnd} to adjacent material`,
        "Identify and drill the seam bars at each join",
        "Play through the full sequence without stopping",
        "Adjust balance and voicing at transitions",
      ];
      break;

    case "shape":
      practiceTasks = [
        `Three clean runs of mm. ${measureStart}–${measureEnd} from memory`,
        "Identify and drill any remaining weak bars",
        "Vary your starting point — begin mid-section",
        "Slow down passages that break and rebuild at tempo",
      ];
      break;

    case "perform":
      practiceTasks = [
        `mm. ${measureStart}–${measureEnd} at performance tempo with full dynamics`,
        "Shape phrasing, voicing, and character throughout",
        "Record yourself and review critically",
        "Make final interpretive notes",
      ];
      break;

    default:
      practiceTasks = getPracticeTasks(measureStart, measureEnd);
  }

  return [
    { type: "warmup", label: "Warmup", durationMin: warmupMins, tasks: warmupTasks.map((t) => ({ text: t })) },
    { type: "piece_practice", label, durationMin: practiceSectionMins, tasks: practiceTasks.map((t) => ({ text: t })) },
  ];
}

// ── Sub-bar progressive scheduling helpers ───────────────────────────────────

const computeChunkSize = computeChunkSizeShared;

function splitIntoChunks(measureStart: number, measureEnd: number, chunkSize: number) {
  const chunks: { start: number; end: number }[] = [];
  let cursor = measureStart;
  while (cursor <= measureEnd) {
    chunks.push({ start: cursor, end: Math.min(cursor + chunkSize - 1, measureEnd) });
    cursor += chunkSize;
  }
  return chunks;
}

function chunkPhaseTasks(phaseType: PhaseType, start: number, end: number, instrument: string): string[] {
  const range = start === end ? `m. ${start}` : `mm. ${start}–${end}`;
  const isPiano = instrument.includes("piano");
  switch (phaseType) {
    case "decode":
      return isPiano
        ? [`${range} — right hand only ♩=40`, `${range} — left hand only ♩=40`, "Mark fingering decisions"]
        : [`${range} — slowly, note by note ♩=40`, "Mark fingering and bowing", "Identify tricky intervals"];
    case "build":
      return isPiano
        ? [`${range} hands together ♩=46`, `${range} hands together ♩=52`, `${range} hands together ♩=60`]
        : [`${range} at ♩=46 with full technique`, `${range} at ♩=52`, `${range} at ♩=60`];
    default:
      return [`Practice ${range}`];
  }
}

/** Pure function: derive suggestions from plan state after session completion. */
function computeSuggestions(
  planId: number,
  triggerLesson: { id: number; sectionId: number | null; phaseType: string | null },
  lessons: { id: number; sectionId: number | null; phaseType: string | null; status: string }[],
  sections: { id: number; name: string }[],
  flagSummary: { measureId: number; flagCount: number; resolvedCount: number }[],
): InsertPlanSuggestion[] {
  const suggestions: InsertPlanSuggestion[] = [];
  if (!triggerLesson.sectionId || !triggerLesson.phaseType) return suggestions;

  const sectionId = triggerLesson.sectionId;
  const phaseType = triggerLesson.phaseType;
  const sectionName = sections.find((s) => s.id === sectionId)?.name ?? "this section";

  // Lessons in the same section+phase
  const phaseLessons = lessons.filter((l) => l.sectionId === sectionId && l.phaseType === phaseType);
  const completedInPhase = phaseLessons.filter((l) => l.status === "completed").length;
  const totalInPhase = phaseLessons.length;
  const phaseCompletionRate = totalInPhase > 0 ? completedInPhase / totalInPhase : 0;

  // Count unresolved flags in this section (any phase, any lesson)
  const sectionLessonIds = new Set(lessons.filter((l) => l.sectionId === sectionId).map((l) => l.id));
  // flagSummary is plan-wide; count flags from lessons in this section
  // Note: flagSummary is grouped by measureId, not lessonId — use total flagCount heuristic
  const totalFlags = flagSummary.reduce((sum, f) => sum + f.flagCount, 0);
  const resolvedFlags = flagSummary.reduce((sum, f) => sum + f.resolvedCount, 0);
  const unresolvedFlags = totalFlags - resolvedFlags;

  // Rule 1: Many flags + phase is well underway → suggest extra sessions
  if (unresolvedFlags >= 3 && phaseCompletionRate >= 0.5) {
    const extraSessions = Math.ceil(unresolvedFlags / 2);
    suggestions.push({
      learningPlanId: planId,
      triggeredByLessonId: triggerLesson.id,
      type: "extra_sessions",
      sectionId,
      status: "pending",
      payload: {
        message: `You flagged ${unresolvedFlags} bars in "${sectionName}" — consider ${extraSessions} extra ${PHASE_LABELS[phaseType as PhaseType]?.label ?? phaseType} session(s) before moving on.`,
        extraSessions,
        fromPhase: phaseType as PhaseType,
      },
    });
  }

  // Rule 2: End of Build phase with flags → suggest revisiting Decode
  if (phaseType === "build" && phaseCompletionRate === 1 && unresolvedFlags > 0) {
    suggestions.push({
      learningPlanId: planId,
      triggeredByLessonId: triggerLesson.id,
      type: "revisit_phase",
      sectionId,
      status: "pending",
      payload: {
        message: `"${sectionName}" still has unresolved bars after Build — consider revisiting Decode before moving to Connect.`,
        fromPhase: "build" as PhaseType,
        targetPhase: "decode" as PhaseType,
      },
    });
  }

  return suggestions;
}

// ── Auto-allocation algorithm ────────────────────────────────────────────────

export type AllocationSection = {
  sectionId: number;
  sectionName: string;
  measureStart: number;
  measureEnd: number;
  difficulty: number;
  numChunks: number;
  phases: { phaseType: PhaseType; repetitions: number }[];
};

export type AllocationResult = {
  sections: AllocationSection[];
  totalSessions: number;
  totalDays: number;
};

/**
 * Pure function: compute how many lesson-day slots each (section, phase) pair
 * needs based on playing level, section difficulty, section length, and
 * available calendar days.
 */
export function computeAllocation(
  sections: { id: number; name: string; measureStart: number; measureEnd: number; difficulty: number }[],
  enabledPhases: PhaseType[],
  playingLevel: PlayingLevel,
  totalDays: number,
): AllocationResult {
  if (sections.length === 0 || enabledPhases.length === 0) {
    return { sections: [], totalSessions: 0, totalDays };
  }

  const levelMult = LEVEL_MULTIPLIER[playingLevel] ?? 1.0;

  const rawAllocations: AllocationSection[] = sections.map((section) => {
    const diffMult = DIFFICULTY_MULTIPLIER[section.difficulty] ?? 1.0;
    const sectionBars = section.measureEnd - section.measureStart + 1;
    const chSize = computeChunkSize(sectionBars, section.difficulty, playingLevel);
    const numChunks = Math.ceil(sectionBars / chSize);

    const phases = enabledPhases.map((pt) => {
      const raw = PHASE_BASE_EFFORT[pt] * levelMult * diffMult;
      return { phaseType: pt, repetitions: Math.max(1, Math.round(raw)) };
    });

    return {
      sectionId: section.id,
      sectionName: section.name,
      measureStart: section.measureStart,
      measureEnd: section.measureEnd,
      difficulty: section.difficulty,
      numChunks,
      phases,
    };
  });

  // Estimate total calendar days using the chunk-aware simulation approximation.
  // For chunk-level phases, per-chunk reps are staggered so calendar days ≈
  // total_phase_reps + (numChunks-1) * decode_reps per section.
  let estimatedDays = 0;
  let sectionStagger = 0;
  for (const sec of rawAllocations) {
    const chunkPhases = sec.phases.filter((p) => CHUNK_LEVEL_PHASES.has(p.phaseType as PhaseType));
    const totalChunkReps = chunkPhases.reduce((s, p) => s + p.repetitions, 0);
    const decodeReps = chunkPhases.find((p) => p.phaseType === "decode")?.repetitions ?? 1;
    const sectionChunkDays = totalChunkReps + (sec.numChunks - 1) * decodeReps;
    const connectPhase = sec.phases.find((p) => p.phaseType === "connect");
    const connectDays = (connectPhase?.repetitions ?? 1) * Math.max(0, sec.numChunks - 1);
    const sectionTotal = sectionChunkDays + connectDays;
    estimatedDays = Math.max(estimatedDays, sectionStagger + sectionTotal);
    const introReps = chunkPhases.slice(0, 2).reduce((s, p) => s + p.repetitions, 0);
    sectionStagger += introReps;
  }
  const interConnectDays = Math.max(0, sections.length - 1);
  const shapeReps = rawAllocations[0]?.phases.find((p) => p.phaseType === "shape")?.repetitions ?? 2;
  const performReps = rawAllocations[0]?.phases.find((p) => p.phaseType === "perform")?.repetitions ?? 2;
  estimatedDays += interConnectDays + shapeReps + performReps;

  if (estimatedDays > 0 && estimatedDays !== totalDays) {
    const scale = totalDays / estimatedDays;
    for (const section of rawAllocations) {
      for (const phase of section.phases) {
        phase.repetitions = Math.max(1, Math.round(phase.repetitions * scale));
      }
    }
  }

  const totalSessions = rawAllocations.reduce(
    (sum, s) => sum + s.phases.reduce((ps, p) => ps + p.repetitions, 0),
    0,
  );

  return { sections: rawAllocations, totalSessions, totalDays };
}

const upload = multer({
  storage: multer.memoryStorage(),
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
      const userId = req.headers["x-user-id"] as string | undefined;
      const planId = parseInt(req.params.planId, 10);
      const plan = await storage.getLearningPlanById(planId);
      if (!plan) return res.json(null);
      if (userId && plan.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      const entry = await storage.getRepertoireEntryById(plan.repertoireEntryId);
      res.json({ ...plan, movementId: entry?.movementId ?? null });
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

  app.delete("/api/learning-plans/:id", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const ok = await storage.deleteLearningPlan(id, userId);
      if (!ok) return res.status(404).json({ error: "Learning plan not found" });
      res.status(204).end();
    } catch {
      res.status(500).json({ error: "Failed to delete learning plan" });
    }
  });

  // ── Sheet Music ──────────────────────────────────────────────────────────

  app.post("/api/sheet-music/upload", upload.single("pdf"), async (req, res) => {
    try {
      const userId = (req.headers["x-user-id"] as string) || req.body.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const pieceId = req.body.pieceId ? parseInt(req.body.pieceId) : null;

      // Insert with placeholder fileUrl; update after we have the record id for the R2 key.
      const record = await storage.createSheetMusic({
        pieceId,
        userId,
        fileUrl: "",
        source: "upload",
        processingStatus: "pending",
      });

      const r2Key = `sheet-music/${record.id}.pdf`;
      await uploadToR2(r2Key, req.file.buffer, "application/pdf");
      await storage.updateSheetMusicFileUrl(record.id, r2Key);

      let pageCount: number | null = null;
      try {
        const { getPdfPageCountFromBuffer } = await import("./scorebars/pdf-processor.js");
        const n = await getPdfPageCountFromBuffer(req.file.buffer);
        if (n > 0) {
          pageCount = n;
          await storage.updateSheetMusicStatus(record.id, "pending", n);
        }
      } catch (e) {
        console.warn("Could not count PDF pages at upload:", e);
      }

      res.status(201).json({ sheetMusicId: record.id, pageCount });
    } catch (err) {
      console.error("Upload route error:", err);
      res.status(500).json({ error: "Failed to upload sheet music" });
    }
  });

  app.get("/api/sheet-music/:id/pdf-meta", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string | undefined;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const record = await storage.getSheetMusic(id);
      if (!record) return res.status(404).json({ error: "Sheet music not found" });
      if (record.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      // Return cached count if available; only download the PDF from R2 as a fallback.
      if (record.pageCount && record.pageCount > 0) {
        return res.json({ pageCount: record.pageCount });
      }
      const pdfBuffer = await downloadFromR2(record.fileUrl);
      const { getPdfPageCountFromBuffer } = await import("./scorebars/pdf-processor.js");
      const pageCount = await getPdfPageCountFromBuffer(pdfBuffer);
      if (pageCount <= 0) {
        return res.status(422).json({ error: "Could not read PDF page count" });
      }
      await storage.updateSheetMusicStatus(id, record.processingStatus, pageCount);
      res.json({ pageCount });
    } catch {
      res.status(500).json({ error: "Failed to read PDF" });
    }
  });

  app.post("/api/sheet-music/:id/process", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string | undefined;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const record = await storage.getSheetMusic(id);
      if (!record) return res.status(404).json({ error: "Sheet music not found" });
      if (record.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      const body = req.body as { firstPage?: number; lastPage?: number };
      const { getPdfPageCountFromBuffer } = await import("./scorebars/pdf-processor.js");

      // Download the PDF from R2 once; reuse the buffer for page-count and processing.
      const pdfBuffer = await downloadFromR2(record.fileUrl);
      let pdfTotal = record.pageCount ?? 0;
      if (pdfTotal <= 0) {
        pdfTotal = await getPdfPageCountFromBuffer(pdfBuffer);
      }
      if (pdfTotal <= 0) {
        return res.status(422).json({ error: "Could not determine PDF length" });
      }

      let firstPage = typeof body.firstPage === "number" && Number.isFinite(body.firstPage) ? Math.floor(body.firstPage) : 1;
      let lastPage =
        typeof body.lastPage === "number" && Number.isFinite(body.lastPage) ? Math.floor(body.lastPage) : pdfTotal;
      firstPage = Math.max(1, Math.min(firstPage, pdfTotal));
      lastPage = Math.max(firstPage, Math.min(lastPage, pdfTotal));

      await storage.updateSheetMusicStatus(id, "processing");
      await storage.clearMeasuresForSheetMusic(id);

      const pageRange = { firstPdfPage: firstPage, lastPdfPage: lastPage };

      import("./scorebars/index.js").then(async ({ ScorebarService }) => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reperto-proc-"));
        try {
          processingProgress.set(id, { page: 0, total: 0 });

          const tmpPdfPath = path.join(tmpDir, "input.pdf");
          const tmpPagesDir = path.join(tmpDir, "pages");
          fs.mkdirSync(tmpPagesDir);
          fs.writeFileSync(tmpPdfPath, pdfBuffer);

          const service = new ScorebarService({
            pagesDir: tmpPagesDir,
            renderDpi: 220,
            onProgress: (page, total) => {
              processingProgress.set(id, { page, total });
            },
          });
          const result = await service.processFile(tmpPdfPath, pageRange);

          // Upload rendered pages to R2 and record in DB.
          // Read width/height from the PNG IHDR chunk (bytes 16-23).
          const pageRecords: Array<{ sheetMusicId: number; pageNumber: number; imageUrl: string; width: number; height: number }> = [];
          for (const pi of result.pageImages) {
            const buf = fs.readFileSync(pi.imagePath);
            const width = buf.readUInt32BE(16);
            const height = buf.readUInt32BE(20);
            const key = `pages/${id}/page-${pi.pageNumber}.png`;
            const imageUrl = await uploadToR2(key, buf, "image/png");
            pageRecords.push({ sheetMusicId: id, pageNumber: pi.pageNumber, imageUrl, width, height });
          }
          await storage.saveSheetMusicPages(pageRecords);

          const savedMeasures = await storage.saveMeasures(toInsertMeasures(id, result.measures));
          await storage.updateSheetMusicStatus(id, "ready", result.pageCount);
          processingProgress.delete(id);
          const plan = await storage.getLearningPlanBySheetMusic(id);
          if (plan) {
            await storage.updateLearningPlan(plan.id, { totalMeasures: savedMeasures.length });
          }
        } catch (err) {
          console.error("ScoreBars processing failed:", err);
          await storage.updateSheetMusicStatus(id, "failed");
          processingProgress.delete(id);
        } finally {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      }).catch(console.error);

      res.json({ status: "processing", firstPage, lastPage });
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

      const movementIdRaw = req.query.movementId as string | undefined;
      const movementId = movementIdRaw ? parseInt(movementIdRaw, 10) : undefined;

      const [dbPages, measureList] = await Promise.all([
        storage.getSheetMusicPages(id),
        storage.getMeasures(id, movementId),
      ]);

      // When scoped to a movement, only return pages that have measures for that movement
      const pageNumbersWithMeasures = new Set(measureList.map((m) => m.pageNumber));
      const filteredPages = movementId != null
        ? dbPages.filter((p) => pageNumbersWithMeasures.has(p.pageNumber))
        : dbPages;

      const pages = filteredPages.map((p) => ({
        pageNumber: p.pageNumber,
        imageUrl: p.imageUrl,
        measures: measureList
          .filter((m) => m.pageNumber === p.pageNumber)
          .map((m) => ({
            id: m.id,
            measureNumber: m.measureNumber,
            movementNumber: m.movementNumber,
            boundingBox: m.boundingBox,
          })),
      }));

      res.json(pages);
    } catch {
      res.status(500).json({ error: "Failed to get pages" });
    }
  });

  app.get("/api/sheet-music/:id/measures", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const movementIdRaw = req.query.movementId as string | undefined;
      const movementId = movementIdRaw ? parseInt(movementIdRaw, 10) : undefined;
      const measureList = await storage.getMeasures(id, movementId);
      res.json(measureList.map((m) => ({ ...m, imageUrl: null })));
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

  // Return the public R2 URL for the original uploaded PDF
  app.get("/api/sheet-music/:id/pdf-url", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const record = await storage.getSheetMusic(id);
      if (!record) return res.status(404).json({ error: "Sheet music not found" });
      const r2PublicUrl = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
      const pdfUrl = `${r2PublicUrl}/${record.fileUrl}`;
      return res.json({ pdfUrl });
    } catch {
      return res.status(500).json({ error: "Failed to get PDF URL" });
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
      const dbPages = await storage.getSheetMusicPages(id);
      const pageInfo = dbPages.find((p) => p.pageNumber === pageNumber);
      if (!pageInfo) {
        return res.status(404).json({ error: "Page image not found" });
      }
      const imageBuffer = await downloadFromR2(`pages/${id}/page-${pageNumber}.png`);

      const { BarDetector } = await import("./scorebars/bar-detector.js");
      const detector = new BarDetector();
      const boxes = await detector.detectBarsInRegion(imageBuffer, pageInfo.width, pageInfo.height, region);
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

      // Validate that all referenced page numbers actually exist in the DB
      const dbPages = await storage.getSheetMusicPages(id);
      const dbPageNumbers = new Set(dbPages.map((p) => p.pageNumber));
      const uniquePages = Array.from(new Set(sorted.map((m) => m.pageNumber))).sort((a, b) => a - b);
      for (const p of uniquePages) {
        if (!dbPageNumbers.has(p)) {
          return res.status(400).json({ error: `Page ${p} not found for this sheet music` });
        }
      }

      const measuresLegacyDir = path.join(process.cwd(), "uploads", "measures", String(id));
      try {
        if (fs.existsSync(measuresLegacyDir)) fs.rmSync(measuresLegacyDir, { recursive: true });
      } catch (e) {
        console.warn("Could not remove legacy measure crops:", e);
      }

      const insertRows = sorted.map((m, index) => ({
        sheetMusicId: id,
        measureNumber: index + 1,
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
      const planId = parseInt(req.params.planId, 10);
      const plan = await storage.getLearningPlanById(planId);
      if (!plan) return res.status(404).json({ error: "Plan not found" });

      // v2 scheduler: passage-state-machine model with SR + modalities.
      // Opt-in via ?v=2 query param, body.schedulerVersion === 2, or the plan
      // itself is already v2 (e.g. regenerating from Adjust-pace — keep it v2).
      const wantV2 =
        req.query.v === "2" ||
        (req.body && (req.body as any).schedulerVersion === 2) ||
        plan.schedulerVersion === 2;
      if (wantV2) {
        try {
          // Only forward horizonDays if the caller explicitly set it — otherwise
          // let generatePlanV2 derive horizon from the plan's targetCompletionDate.
          const rawHorizon = (req.body as any)?.horizonDays;
          const horizonDays = typeof rawHorizon === "number" && rawHorizon > 0 ? rawHorizon : undefined;

          // M5: Feasibility pre-check — hard block before materializing a FRESH plan
          // if required passage touches exceed what the horizon can hold. Skip for
          // regeneration (plan.schedulerVersion already 2) so "Adjust pace" always works.
          const isFirstGeneration = plan.schedulerVersion !== 2;
          if (isFirstGeneration) {
            const profile = await storage.getUserProfile?.(plan.userId);
            const level = (profile?.playingLevel as import("@shared/schema").PlayingLevel | null) ?? "intermediate";
            const userSections = (await storage.getSectionsForPlan(planId)) as SectionInput[];
            const totalMeasures = plan.totalMeasures ?? 0;
            const effectiveHorizon =
              horizonDays ??
              (() => {
                if (plan.targetCompletionDate) {
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const target = new Date(plan.targetCompletionDate as unknown as string);
                  target.setHours(0, 0, 0, 0);
                  const d = Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
                  if (d >= 7) return Math.min(180, d);
                }
                return 30;
              })();
            const feasibility = checkPlanFeasibility(
              userSections, totalMeasures, level, effectiveHorizon, plan.dailyPracticeMinutes,
            );
            if (!feasibility.feasible) {
              return res.status(422).json({
                error: "plan_infeasible",
                message: `This plan needs ${feasibility.requiredTouches} practice slots but only ${feasibility.availableSessions} are available in ${effectiveHorizon} days. Extend your deadline by ${feasibility.shortfallDays} days, increase daily practice time, or remove some sections.`,
                requiredTouches: feasibility.requiredTouches,
                availableSessions: feasibility.availableSessions,
                daysNeeded: feasibility.daysNeeded,
                shortfallDays: feasibility.shortfallDays,
              });
            }
          }

          const result = await generatePlanV2({ planId, storage, horizonDays });
          await storage.updateLearningPlan(planId, { status: "active" });
          return res.status(201).json({
            lessonDays: result.lessonsCreated,
            passagesCreated: result.passagesCreated,
            schedulerVersion: 2,
          });
        } catch (err) {
          console.error("generate-lessons v2 error:", err);
          return res.status(500).json({ error: "v2 scheduler failed", detail: String(err) });
        }
      }

      const totalMeasures = plan.totalMeasures ?? 0;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await storage.deleteLessonDaysForPlan(planId);

      // Look up piece info for task generation
      const entry = await storage.getRepertoireEntryById(plan.repertoireEntryId);
      const piece = entry ? await storage.getPieceById(entry.pieceId) : undefined;
      const userProfile = await storage.getUserProfile(plan.userId);
      const instrument = (userProfile?.instrument ?? piece?.instrument ?? "Piano").toLowerCase();
      const practiceMins = plan.dailyPracticeMinutes ?? 30;
      const warmupMins = Math.min(5, Math.floor(practiceMins * 0.2));
      const practiceSectionMins = practiceMins - warmupMins;

      type DayRow = {
        learningPlanId: number;
        scheduledDate: string;
        measureStart: number;
        measureEnd: number;
        status: "upcoming";
        tasks: SessionSection[];
        sectionId?: number | null;
        phaseType?: string | null;
      };

      const rows: DayRow[] = [];

      // ── Full-coverage chunk-phase algorithm ──────────────────────────────
      // Covers every non-ignored bar [1..totalMeasures]:
      // - Bars inside a user-marked section inherit that section's difficulty
      // - Bars inside an "ignored" section are excluded entirely
      // - Bars outside every section get implicit difficulty 4 (baseline)
      // Every chunk runs the full CHUNK_LEVEL_PHASES sequence regardless of
      // whether it was explicitly marked.
      const allSections = await storage.getSectionsForPlan(planId);
      const activeSections = allSections.filter((s) => !(s as { ignored?: boolean }).ignored);
      const ignoredSections = allSections.filter((s) => (s as { ignored?: boolean }).ignored);
      // `sections` is referenced in the response metadata below.
      const sections = activeSections;

      if (totalMeasures > 0) {
        const playingLevel: PlayingLevel =
          ((userProfile as { playingLevel?: PlayingLevel })?.playingLevel as PlayingLevel) ?? "intermediate";

        // Build ignored mask + per-bar active-section assignment.
        const ignoredMask = new Uint8Array(totalMeasures + 2);
        for (const ig of ignoredSections) {
          const lo = Math.max(1, ig.measureStart);
          const hi = Math.min(totalMeasures, ig.measureEnd);
          for (let m = lo; m <= hi; m++) ignoredMask[m] = 1;
        }

        type ActiveSec = typeof allSections[0];
        const barSection: (ActiveSec | null)[] = new Array(totalMeasures + 2).fill(null);
        for (const sec of activeSections) {
          const lo = Math.max(1, sec.measureStart);
          const hi = Math.min(totalMeasures, sec.measureEnd);
          for (let m = lo; m <= hi; m++) {
            if (!ignoredMask[m]) barSection[m] = sec;
          }
        }

        // Walk bars, collapse into runs of the same assignment, then split into chunks.
        type Chunk = {
          start: number; end: number;
          difficulty: number;
          sectionId: number | null;
          sectionName: string;
        };
        const chunks: Chunk[] = [];
        let m = 1;
        while (m <= totalMeasures) {
          if (ignoredMask[m]) { m++; continue; }
          const sec = barSection[m];
          const runStart = m;
          while (m + 1 <= totalMeasures && !ignoredMask[m + 1] && barSection[m + 1] === sec) m++;
          const runEnd = m;
          const diff = sec?.difficulty ?? 4;
          const name = sec?.name ?? "Unmarked";
          const runBars = runEnd - runStart + 1;
          const chSize = computeChunkSize(runBars, diff, playingLevel);
          for (const c of splitIntoChunks(runStart, runEnd, chSize)) {
            chunks.push({
              start: c.start, end: c.end,
              difficulty: diff,
              sectionId: sec?.id ?? null,
              sectionName: name,
            });
          }
          m++;
        }

        // Reps per chunk/phase, difficulty-weighted.
        const repsFor = (difficulty: number, pt: PhaseType) =>
          Math.max(1, Math.round(PHASE_BASE_EFFORT[pt] * (DIFFICULTY_MULTIPLIER[difficulty] ?? 1)));

        // Linking: progressive merge from chunk[0] through chunk[i].
        type LinkStep = { start: number; end: number; seam: number };
        const linkSteps: LinkStep[] = [];
        for (let i = 1; i < chunks.length; i++) {
          linkSteps.push({ start: chunks[0].start, end: chunks[i].end, seam: chunks[i].start });
        }

        const allowedFirst = chunks.length > 0 ? chunks[0].start : 1;
        const allowedLast = chunks.length > 0 ? chunks[chunks.length - 1].end : totalMeasures;
        const stabReps = 2;
        const shapeReps = 2;

        // Flat, phase-interleaved work list. Phases sweep across all chunks before
        // moving to the next phase, keeping progress even across the whole piece.
        type WorkItem = {
          weight: number;
          mStart: number;
          mEnd: number;
          build: () => SessionSection;
        };
        const items: WorkItem[] = [];

        const chunkPhases = (PHASE_TYPES as readonly PhaseType[]).filter((pt) => CHUNK_LEVEL_PHASES.has(pt));
        for (const pt of chunkPhases) {
          for (const c of chunks) {
            const reps = repsFor(c.difficulty, pt);
            for (let r = 0; r < reps; r++) {
              items.push({
                weight: PHASE_BASE_EFFORT[pt] ?? 1,
                mStart: c.start, mEnd: c.end,
                build: () => {
                  const range = c.start === c.end ? `m. ${c.start}` : `mm. ${c.start}–${c.end}`;
                  return {
                    type: "piece_practice",
                    label: `${c.sectionName} ${range} — ${PHASE_LABELS[pt].label}`,
                    durationMin: 0,
                    tasks: chunkPhaseTasks(pt, c.start, c.end, instrument).map((t) => ({ text: t })),
                    sectionId: c.sectionId ?? undefined,
                    phaseType: pt,
                  };
                },
              });
            }
          }
        }

        for (const step of linkSteps) {
          items.push({
            weight: PHASE_BASE_EFFORT.connect,
            mStart: step.start, mEnd: step.end,
            build: () => ({
              type: "piece_practice",
              label: `Connect mm. ${step.start}–${step.end}`,
              durationMin: 0,
              tasks: [
                { text: `Play mm. ${step.start}–${step.end} without stopping` },
                { text: `Focus on the join at m. ${step.seam}` },
                { text: "Smooth out any hesitations at transitions" },
              ],
              phaseType: "connect" as const,
            }),
          });
        }

        const shapeTasks = [
          `Three clean runs mm. ${allowedFirst}–${allowedLast} from memory`,
          "Identify and drill any remaining weak bars",
          "Start from random points to test memory",
          "Slow down passages that break and rebuild at tempo",
        ];
        const performTasks = [
          "Full piece at performance tempo with dynamics",
          "Shape phrasing, voicing, and character throughout",
          "Record yourself and review critically",
          "Make final interpretive decisions",
        ];
        for (let r = 0; r < stabReps; r++) {
          items.push({
            weight: PHASE_BASE_EFFORT.shape,
            mStart: allowedFirst, mEnd: allowedLast,
            build: () => ({
              type: "piece_practice", label: "Shape: Full piece",
              durationMin: 0,
              tasks: shapeTasks.map((t) => ({ text: t })),
              phaseType: "shape" as const,
            }),
          });
        }
        for (let r = 0; r < shapeReps; r++) {
          items.push({
            weight: PHASE_BASE_EFFORT.perform,
            mStart: allowedFirst, mEnd: allowedLast,
            build: () => ({
              type: "piece_practice", label: "Perform: Full piece",
              durationMin: 0,
              tasks: performTasks.map((t) => ({ text: t })),
              phaseType: "perform" as const,
            }),
          });
        }

        // Pack items into targetDays sessions.
        const targetDate = plan.targetCompletionDate ? new Date(plan.targetCompletionDate) : null;
        const targetDays = targetDate
          ? Math.max(1, Math.ceil((targetDate.getTime() - today.getTime()) / 86400000))
          : Math.max(1, items.length);
        const itemsPerDay = Math.max(1, Math.ceil(items.length / targetDays));
        const totalDays = Math.ceil(items.length / itemsPerDay);

        for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
          const slice = items.slice(dayIndex * itemsPerDay, (dayIndex + 1) * itemsPerDay);
          if (slice.length === 0) break;

          const totalWeight = slice.reduce((s, it) => s + it.weight, 0);
          const taskSections: SessionSection[] = [{
            type: "warmup", label: "Warmup", durationMin: warmupMins,
            tasks: getWarmupTasks(instrument).map((t) => ({ text: t })),
          }];
          let minM = Infinity, maxM = 0;

          for (const item of slice) {
            const dur = Math.max(2, Math.round((item.weight / totalWeight) * practiceSectionMins));
            const block = item.build();
            block.durationMin = dur;
            taskSections.push(block);
            minM = Math.min(minM, item.mStart);
            maxM = Math.max(maxM, item.mEnd);
          }

          const d = new Date(today);
          d.setDate(d.getDate() + dayIndex);
          rows.push({
            learningPlanId: planId,
            scheduledDate: d.toISOString().split("T")[0],
            measureStart: minM, measureEnd: maxM,
            status: "upcoming", sectionId: null, phaseType: null,
            tasks: taskSections,
          });
        }
      } else {
        // No bars known yet — create a single placeholder day.
        const d = new Date(today);
        rows.push({
          learningPlanId: planId,
          scheduledDate: d.toISOString().split("T")[0],
          measureStart: 1, measureEnd: 1,
          status: "upcoming",
          tasks: [
            { type: "warmup", label: "Warmup", durationMin: warmupMins, tasks: getWarmupTasks(instrument).map((t) => ({ text: t })) },
            { type: "piece_practice", label: "Piece Practice", durationMin: practiceSectionMins, tasks: getPracticeTasks(1, 1).map((t) => ({ text: t })) },
          ],
        });
      }

      const created = await storage.createLessonDays(rows);
      await storage.updateLearningPlan(planId, { status: "active" });
      const usedSections = sections.length > 0;
      res.status(201).json({ lessonDays: created.length, usedSectionPhases: usedSections });
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
      const body = { ...req.body };
      // Pull out v2-only field (user rating) before persisting.
      const rawRating = body.userRating;
      delete body.userRating;
      if (typeof body.completedAt === "string") body.completedAt = new Date(body.completedAt);
      const updated = await storage.updateLessonDay(id, body);
      if (!updated) return res.status(404).json({ error: "Lesson not found" });

      // v2 feedback loop: if the lesson just got marked completed on a v2 plan,
      // update passage state and replan upcoming days.
      if (body.status === "completed") {
        const plan = await storage.getLearningPlanById(updated.learningPlanId);
        if (plan && plan.schedulerVersion === 2) {
          const userRating =
            typeof rawRating === "number" && rawRating >= 1 && rawRating <= 4
              ? (rawRating as 1 | 2 | 3 | 4)
              : undefined;
          // Fire-and-await: errors here shouldn't block the PATCH response.
          try {
            await applySessionOutcome({
              planId: updated.learningPlanId,
              lessonDayId: updated.id,
              userRating,
              storage,
            });
          } catch (e) {
            console.error("applySessionOutcome failed:", e);
          }
        }
      }
      res.json(updated);
    } catch (err) {
      console.error("update lesson error:", err);
      res.status(500).json({ error: "Failed to update lesson" });
    }
  });

  /** Lesson day + plan + piece context for the practice session screen (auth: plan owner). */
  app.get("/api/lessons/:id/session", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string | undefined;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid lesson id" });
      const bundle = await storage.getLessonSessionBundle(id, userId);
      if (!bundle) return res.status(404).json({ error: "Lesson not found" });
      res.json(bundle);
    } catch {
      res.status(500).json({ error: "Failed to load session" });
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
      const planId = parseInt(req.params.planId, 10);
      const measureNumber = parseInt(req.params.measureNumber, 10);
      const userId = (req.headers["x-user-id"] as string) || req.body.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const plan = await storage.getLearningPlanById(planId);
      if (!plan) return res.status(404).json({ error: "Plan not found" });
      const sheetId = plan.sheetMusicId;
      if (sheetId == null) {
        return res.status(400).json({ error: "Plan has no sheet music; cannot record bar progress" });
      }
      const measureList = await storage.getMeasures(sheetId);
      const measureRow = measureList.find((m) => m.measureNumber === measureNumber);
      if (!measureRow) {
        return res.status(404).json({ error: `No measure ${measureNumber} in this score` });
      }

      const updated = await storage.upsertMeasureProgress({
        planId,
        measureId: measureRow.id,
        userId,
        ...req.body,
      });

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

  app.patch("/api/users/:userId/profile", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId || userId !== req.params.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const updated = await storage.updateUserProfile(req.params.userId, req.body);
      if (!updated) return res.status(404).json({ error: "Profile not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update profile" });
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

  // ── Community Scores ───────────────────────────────────────────────────────

  /**
   * GET /api/community-scores?pieceId=:id[&movementId=:mid]
   * Returns the single community score for the given (piece, movement) scope.
   * Omitting movementId (or passing "null") matches whole-piece scores.
   */
  app.get("/api/community-scores", async (req, res) => {
    const pieceId = parseInt(req.query.pieceId as string, 10);
    if (!pieceId || isNaN(pieceId)) return res.status(400).json({ error: "pieceId required" });
    const movementIdRaw = req.query.movementId as string | undefined;
    const movementId = movementIdRaw && movementIdRaw !== "null"
      ? parseInt(movementIdRaw, 10)
      : null;
    try {
      const score = await storage.getCommunityScoreByPiece(pieceId, movementId);
      if (!score) return res.status(404).json(null);
      const totalMeasures = await storage.getMeasureCount(score.sheetMusicId, score.movementId);
      res.json({ ...score, totalMeasures });
    } catch {
      res.status(500).json({ error: "Failed to fetch community score" });
    }
  });

  /**
   * GET /api/community-scores/piece/:pieceId
   * Returns all community scores for a piece across all movement scopes,
   * with movementName joined in. Used by the piece detail page.
   */
  app.get("/api/community-scores/piece/:pieceId", async (req, res) => {
    const pieceId = parseInt(req.params.pieceId, 10);
    if (isNaN(pieceId)) return res.status(400).json({ error: "Invalid pieceId" });
    try {
      const scores = await storage.getAllCommunityScoresForPiece(pieceId);
      const countMap = await storage.batchGetMeasureCounts(scores.map((s) => s.sheetMusicId));
      const withCounts = scores.map((s) => ({ ...s, totalMeasures: countMap.get(s.sheetMusicId) ?? 0 }));
      res.json(withCounts);
    } catch {
      res.status(500).json({ error: "Failed to fetch community scores" });
    }
  });

  /** POST /api/community-scores — submit a completed score analysis to the community */
  app.post("/api/community-scores", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const { sheetMusicId, description, movementId } = req.body as {
      sheetMusicId: number;
      description?: string;
      movementId?: number | null;
    };
    if (!sheetMusicId) return res.status(400).json({ error: "sheetMusicId required" });
    try {
      const sm = await storage.getSheetMusic(sheetMusicId);
      if (!sm) return res.status(404).json({ error: "Sheet music not found" });
      if (sm.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      if (sm.processingStatus !== "done" && sm.processingStatus !== "ready") {
        return res.status(400).json({ error: "Bar analysis not complete" });
      }
      // If bars were detected but not yet finalised, confirm them now so the
      // sheet music doesn't need to go through the full learning-plan wizard first.
      if (sm.processingStatus === "ready") {
        await storage.confirmMeasures(sheetMusicId);
      }
      if (!sm.pieceId) return res.status(400).json({ error: "Sheet music has no associated piece" });
      const resolvedMovementId = movementId ?? null;
      const existing = await storage.getCommunityScoreByPiece(sm.pieceId, resolvedMovementId);
      if (existing) return res.status(409).json({ error: "A community score already exists for this scope" });
      const created = await storage.createCommunityScore({
        pieceId: sm.pieceId,
        movementId: resolvedMovementId,
        sheetMusicId,
        submittedByUserId: userId,
        description: description ?? null,
      });
      const totalMeasures = await storage.getMeasureCount(sheetMusicId);
      res.status(201).json({ ...created, totalMeasures });
    } catch {
      res.status(500).json({ error: "Failed to create community score" });
    }
  });

  /** POST /api/community-scores/:id/use — increment download count when a user adopts a community score */
  app.post("/api/community-scores/:id/use", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      await storage.incrementCommunityScoreDownloads(id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to record usage" });
    }
  });

  /** DELETE /api/community-scores/:id — only the submitter can delete */
  app.delete("/api/community-scores/:id", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      const score = await storage.getCommunityScoreById(id);
      if (!score) return res.status(404).json({ error: "Not found" });
      if (score.submittedByUserId !== userId) return res.status(403).json({ error: "Forbidden" });
      await storage.deleteCommunityScore(id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete community score" });
    }
  });

  // ── Plan Sections ─────────────────────────────────────────────────────────

  app.get("/api/learning-plans/:planId/sections", async (req, res) => {
    try {
      const planId = parseInt(req.params.planId, 10);
      const sections = await storage.getSectionsForPlan(planId);
      res.json(sections);
    } catch {
      res.status(500).json({ error: "Failed to get sections" });
    }
  });

  app.post("/api/learning-plans/:planId/sections", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const planId = parseInt(req.params.planId, 10);
      const plan = await storage.getLearningPlanById(planId);
      if (!plan) return res.status(404).json({ error: "Plan not found" });
      if (plan.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      const { name, measureStart, measureEnd, difficulty, ignored, displayOrder } = req.body;
      const section = await storage.createSection({ learningPlanId: planId, name, measureStart, measureEnd, difficulty: typeof difficulty === "number" ? difficulty : 4, ignored: !!ignored, displayOrder: displayOrder ?? 0 });
      res.status(201).json(section);
    } catch (err) {
      console.error("Failed to create section:", err);
      res.status(500).json({ error: "Failed to create section" });
    }
  });

  app.put("/api/learning-plans/:planId/sections/:sectionId", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const planId = parseInt(req.params.planId, 10);
      const sectionId = parseInt(req.params.sectionId, 10);
      const plan = await storage.getLearningPlanById(planId);
      if (!plan || plan.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      const updated = await storage.updateSection(sectionId, req.body);
      if (!updated) return res.status(404).json({ error: "Section not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update section" });
    }
  });

  app.delete("/api/learning-plans/:planId/sections/:sectionId", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const planId = parseInt(req.params.planId, 10);
      const sectionId = parseInt(req.params.sectionId, 10);
      const plan = await storage.getLearningPlanById(planId);
      if (!plan || plan.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      const ok = await storage.deleteSection(sectionId);
      if (!ok) return res.status(404).json({ error: "Section not found" });
      res.status(204).end();
    } catch {
      res.status(500).json({ error: "Failed to delete section" });
    }
  });

  /** Bulk reorder sections: PUT /api/learning-plans/:planId/sections/reorder */
  app.put("/api/learning-plans/:planId/sections/reorder", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const planId = parseInt(req.params.planId, 10);
      const plan = await storage.getLearningPlanById(planId);
      if (!plan || plan.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      const { order } = req.body as { order: { id: number; displayOrder: number }[] };
      if (!Array.isArray(order)) return res.status(400).json({ error: "order must be an array" });
      await storage.reorderSections(order);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to reorder sections" });
    }
  });

  // ── Section Phases ─────────────────────────────────────────────────────────

  app.get("/api/sections/:sectionId/phases", async (req, res) => {
    try {
      const sectionId = parseInt(req.params.sectionId, 10);
      const phases = await storage.getPhasesForSection(sectionId);
      res.json(phases);
    } catch {
      res.status(500).json({ error: "Failed to get phases" });
    }
  });

  /** Full replace: PUT /api/sections/:sectionId/phases */
  app.put("/api/sections/:sectionId/phases", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const sectionId = parseInt(req.params.sectionId, 10);
      const { phases } = req.body as {
        phases: { phaseType: string; displayOrder: number; repetitions: number }[];
      };
      if (!Array.isArray(phases)) return res.status(400).json({ error: "phases must be an array" });
      const result = await storage.replacePhasesForSection(
        sectionId,
        phases.map((p) => ({ sectionId, phaseType: p.phaseType, displayOrder: p.displayOrder, repetitions: p.repetitions })),
      );
      res.json(result);
    } catch {
      res.status(500).json({ error: "Failed to update phases" });
    }
  });

  // ── Compute Allocation ───────────────────────────────────────────────────

  app.post("/api/learning-plans/:planId/compute-allocation", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const planId = parseInt(req.params.planId, 10);
      const plan = await storage.getLearningPlanById(planId);
      if (!plan) return res.status(404).json({ error: "Plan not found" });
      if (plan.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      const { enabledPhases } = req.body as { enabledPhases?: string[] };
      if (!Array.isArray(enabledPhases) || enabledPhases.length === 0) {
        return res.status(400).json({ error: "enabledPhases must be a non-empty array" });
      }
      const validPhases = enabledPhases.filter((p): p is PhaseType =>
        PHASE_TYPES.includes(p as PhaseType),
      );
      if (validPhases.length === 0) {
        return res.status(400).json({ error: "No valid phase types provided" });
      }

      const sections = await storage.getSectionsForPlan(planId);
      if (sections.length === 0) {
        return res.status(400).json({ error: "Plan has no sections defined" });
      }

      const userProfile = await storage.getUserProfile(plan.userId);
      const playingLevel = (userProfile?.playingLevel ?? "intermediate") as PlayingLevel;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = plan.targetCompletionDate
        ? new Date(plan.targetCompletionDate)
        : new Date(today.getTime() + 30 * 86400000);
      const totalDays = Math.max(1, Math.ceil((target.getTime() - today.getTime()) / 86400000));

      const result = computeAllocation(sections, validPhases, playingLevel, totalDays);
      res.json(result);
    } catch (err) {
      console.error("compute-allocation error:", err);
      res.status(500).json({ error: "Failed to compute allocation" });
    }
  });

  // ── Bar Flags ─────────────────────────────────────────────────────────────

  app.get("/api/lessons/:lessonId/flags", async (req, res) => {
    try {
      const lessonId = parseInt(req.params.lessonId, 10);
      const flags = await storage.getFlagsForLesson(lessonId);
      res.json(flags);
    } catch {
      res.status(500).json({ error: "Failed to get flags" });
    }
  });

  app.post("/api/lessons/:lessonId/flags", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const lessonId = parseInt(req.params.lessonId, 10);
      const { measureId, note } = req.body;
      if (!measureId) return res.status(400).json({ error: "measureId required" });
      // getLessonSessionBundle resolves plan ownership and returns the plan for us
      const bundle = await storage.getLessonSessionBundle(lessonId, userId);
      if (!bundle) return res.status(404).json({ error: "Lesson not found" });
      const flag = await storage.createBarFlag({
        learningPlanId: bundle.plan.id,
        lessonDayId: lessonId,
        measureId,
        userId,
        note: note ?? null,
        resolved: false,
      });
      res.status(201).json(flag);
    } catch (err: any) {
      // Unique constraint violation = already flagged this bar this session
      if (err?.code === "23505") return res.status(409).json({ error: "Bar already flagged in this session" });
      res.status(500).json({ error: "Failed to create flag" });
    }
  });

  app.patch("/api/lessons/:lessonId/flags/:flagId", async (req, res) => {
    try {
      const flagId = parseInt(req.params.flagId, 10);
      const { resolved, note } = req.body;
      const updated = await storage.updateBarFlag(flagId, { resolved, note });
      if (!updated) return res.status(404).json({ error: "Flag not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update flag" });
    }
  });

  app.delete("/api/lessons/:lessonId/flags/:flagId", async (req, res) => {
    try {
      const flagId = parseInt(req.params.flagId, 10);
      const ok = await storage.deleteBarFlag(flagId);
      if (!ok) return res.status(404).json({ error: "Flag not found" });
      res.status(204).end();
    } catch {
      res.status(500).json({ error: "Failed to delete flag" });
    }
  });

  app.get("/api/learning-plans/:planId/flags/summary", async (req, res) => {
    try {
      const planId = parseInt(req.params.planId, 10);
      const summary = await storage.getFlagSummaryForPlan(planId);
      res.json(summary);
    } catch {
      res.status(500).json({ error: "Failed to get flag summary" });
    }
  });

  // ── Session Task Feedback ─────────────────────────────────────────────────

  app.post("/api/lessons/:lessonId/feedback", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const lessonId = parseInt(req.params.lessonId, 10);
      const { taskFeedback } = req.body as {
        taskFeedback?: Array<{
          passageId?: number;
          comfort?: string;
          completion?: string;
          flags?: string[];
          minutesSpent?: number;
          notes?: string;
        }>;
      };
      if (!Array.isArray(taskFeedback) || taskFeedback.length === 0) {
        return res.status(400).json({ error: "taskFeedback array required" });
      }
      const bundle = await storage.getLessonSessionBundle(lessonId, userId);
      if (!bundle) return res.status(404).json({ error: "Lesson not found" });
      const created = await Promise.all(
        taskFeedback.map((item) =>
          storage.createSessionTaskFeedback({
            lessonDayId: lessonId,
            learningPlanId: bundle.plan.id,
            userId,
            passageId: item.passageId ?? null,
            comfort: item.comfort ?? null,
            completion: item.completion ?? null,
            flags: item.flags ?? null,
            minutesSpent: item.minutesSpent ?? null,
            notes: item.notes ?? null,
          })
        )
      );
      res.status(201).json({ created: created.length });
    } catch (err) {
      console.error("create session feedback error:", err);
      res.status(500).json({ error: "Failed to create session feedback" });
    }
  });

  app.get("/api/lessons/:lessonId/feedback", async (req, res) => {
    try {
      const lessonId = parseInt(req.params.lessonId, 10);
      const rows = await storage.getSessionTaskFeedbackForLesson(lessonId);
      res.json(rows);
    } catch {
      res.status(500).json({ error: "Failed to get session feedback" });
    }
  });

  // ── Bar Annotations ───────────────────────────────────────────────────────

  app.get("/api/lessons/:lessonId/annotations", async (req, res) => {
    try {
      const lessonId = parseInt(req.params.lessonId, 10);
      const rows = await storage.getAnnotationsForLesson(lessonId);
      res.json(rows);
    } catch {
      res.status(500).json({ error: "Failed to get annotations" });
    }
  });

  app.post("/api/lessons/:lessonId/annotations", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const lessonId = parseInt(req.params.lessonId, 10);
      const { measureStart, measureEnd, text } = req.body;
      if (!text?.trim()) return res.status(400).json({ error: "text required" });
      if (measureStart == null || measureEnd == null) return res.status(400).json({ error: "measureStart and measureEnd required" });
      const bundle = await storage.getLessonSessionBundle(lessonId, userId);
      if (!bundle) return res.status(404).json({ error: "Lesson not found" });
      const row = await storage.createBarAnnotation({
        learningPlanId: bundle.plan.id,
        lessonDayId: lessonId,
        userId,
        measureStart,
        measureEnd,
        text: text.trim(),
        sessionNumber: bundle.dayIndex,
        sessionDate: bundle.lesson.scheduledDate,
      });
      res.status(201).json(row);
    } catch (err) {
      console.error("create annotation error:", err);
      res.status(500).json({ error: "Failed to create annotation" });
    }
  });

  app.patch("/api/lessons/:lessonId/annotations/:annotationId", async (req, res) => {
    try {
      const annotationId = parseInt(req.params.annotationId, 10);
      const { text } = req.body;
      if (!text?.trim()) return res.status(400).json({ error: "text required" });
      const updated = await storage.updateBarAnnotation(annotationId, text.trim());
      if (!updated) return res.status(404).json({ error: "Annotation not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update annotation" });
    }
  });

  app.delete("/api/lessons/:lessonId/annotations/:annotationId", async (req, res) => {
    try {
      const annotationId = parseInt(req.params.annotationId, 10);
      const ok = await storage.deleteBarAnnotation(annotationId);
      if (!ok) return res.status(404).json({ error: "Annotation not found" });
      res.status(204).end();
    } catch {
      res.status(500).json({ error: "Failed to delete annotation" });
    }
  });

  app.get("/api/learning-plans/:planId/annotations", async (req, res) => {
    try {
      const planId = parseInt(req.params.planId, 10);
      const rows = await storage.getAnnotationsForPlan(planId);
      res.json(rows);
    } catch {
      res.status(500).json({ error: "Failed to get annotations" });
    }
  });

  app.get("/api/sheet-music/:sheetMusicId/annotations", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const sheetMusicId = parseInt(req.params.sheetMusicId, 10);
      const plan = await storage.getLearningPlanBySheetAndUser(sheetMusicId, userId);
      if (!plan) return res.json([]);
      const rows = await storage.getAnnotationsForPlan(plan.id);
      res.json(rows);
    } catch (err) {
      console.error("get sheet annotations error:", err);
      res.status(500).json({ error: "Failed to get annotations" });
    }
  });

  app.post("/api/sheet-music/:sheetMusicId/annotations", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const sheetMusicId = parseInt(req.params.sheetMusicId, 10);
      const { measureStart, measureEnd, text } = req.body;
      if (!text?.trim()) return res.status(400).json({ error: "text required" });
      if (measureStart == null || measureEnd == null) return res.status(400).json({ error: "measureStart and measureEnd required" });
      const plan = await storage.getLearningPlanBySheetAndUser(sheetMusicId, userId);
      if (!plan) return res.status(404).json({ error: "No learning plan found for this sheet" });
      const row = await storage.createBarAnnotation({
        learningPlanId: plan.id,
        lessonDayId: null,
        userId,
        measureStart,
        measureEnd,
        text: text.trim(),
        sessionNumber: null,
        sessionDate: null,
      });
      res.status(201).json(row);
    } catch (err) {
      console.error("create sheet annotation error:", err);
      res.status(500).json({ error: "Failed to create annotation" });
    }
  });

  app.patch("/api/sheet-music/:sheetMusicId/annotations/:annotationId", async (req, res) => {
    try {
      const annotationId = parseInt(req.params.annotationId, 10);
      const { text } = req.body;
      if (!text?.trim()) return res.status(400).json({ error: "text required" });
      const updated = await storage.updateBarAnnotation(annotationId, text.trim());
      if (!updated) return res.status(404).json({ error: "Annotation not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update annotation" });
    }
  });

  app.delete("/api/sheet-music/:sheetMusicId/annotations/:annotationId", async (req, res) => {
    try {
      const annotationId = parseInt(req.params.annotationId, 10);
      const ok = await storage.deleteBarAnnotation(annotationId);
      if (!ok) return res.status(404).json({ error: "Annotation not found" });
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "Failed to delete annotation" });
    }
  });

  // ── Plan Suggestions ──────────────────────────────────────────────────────

  app.get("/api/learning-plans/:planId/suggestions", async (req, res) => {
    try {
      const planId = parseInt(req.params.planId, 10);
      const suggestions = await storage.getPendingSuggestions(planId);
      res.json(suggestions);
    } catch {
      res.status(500).json({ error: "Failed to get suggestions" });
    }
  });

  app.patch("/api/learning-plans/:planId/suggestions/:suggestionId", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const suggestionId = parseInt(req.params.suggestionId, 10);
      const { status } = req.body;
      if (status !== "accepted" && status !== "dismissed") {
        return res.status(400).json({ error: "status must be 'accepted' or 'dismissed'" });
      }
      const updated = await storage.updateSuggestion(suggestionId, { status });
      if (!updated) return res.status(404).json({ error: "Suggestion not found" });
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update suggestion" });
    }
  });

  /** Internal endpoint — compute and persist suggestions after a session completes. Fire-and-forget from client. */
  app.post("/api/learning-plans/:planId/suggestions/compute", async (req, res) => {
    // Respond immediately so client isn't blocked
    res.status(202).json({ ok: true });
    try {
      const planId = parseInt(req.params.planId, 10);
      const { triggerLessonId } = req.body as { triggerLessonId: number };
      if (!triggerLessonId) return;

      const [plan, lessons, sections, flagSummary] = await Promise.all([
        storage.getLearningPlanById(planId),
        storage.getLessonDays(planId),
        storage.getSectionsForPlan(planId),
        storage.getFlagSummaryForPlan(planId),
      ]);
      if (!plan) return;

      const triggerLesson = lessons.find((l) => l.id === triggerLessonId);
      if (!triggerLesson) return;

      const newSuggestions: InsertPlanSuggestion[] = [];

      // v2 plans: use passage-state catch-up detection instead of the v1 flag heuristic.
      if (plan.schedulerVersion === 2 && storage.getPassagesForPlan && storage.getPassageProgressForPlan) {
        const [passages, progresses] = await Promise.all([
          storage.getPassagesForPlan(planId),
          storage.getPassageProgressForPlan(planId),
        ]);
        const completedLessons = lessons.filter((l) => l.status === "completed");
        const dayIndex = completedLessons.length;
        const horizonDays = lessons.length;
        const { paceGap, touchesRemaining } = computePaceGap(passages ?? [], progresses ?? [], dayIndex, horizonDays);
        if (paceGap > 0.2) {
          const daysLeft = horizonDays - dayIndex;
          newSuggestions.push({
            learningPlanId: planId,
            triggeredByLessonId: triggerLessonId,
            type: "catch_up",
            sectionId: null,
            status: "pending",
            payload: {
              message: `You're ${Math.round(paceGap * 100)}% behind pace — ${touchesRemaining} practice slots remaining over ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Add a daily session or extend your deadline to stay on track.`,
            },
          });
        }
      } else if (triggerLesson.sectionId && triggerLesson.phaseType) {
        // v1 flag-based suggestions.
        newSuggestions.push(...computeSuggestions(planId, triggerLesson, lessons, sections, flagSummary));
      }

      for (const s of newSuggestions) {
        // Deduplicate: skip if identical pending suggestion already exists
        const existing = await storage.getPendingSuggestions(planId);
        const isDuplicate = existing.some(
          (e) => e.type === s.type && e.sectionId === s.sectionId,
        );
        if (!isDuplicate) {
          await storage.createSuggestion(s);
        }
      }
    } catch (err) {
      console.error("suggestions/compute error:", err);
    }
  });

  // ── Recalibrate passage difficulties + replan ───────────────────────────
  app.post("/api/learning-plans/:planId/recalibrate", async (req, res) => {
    try {
      const planId = parseInt(req.params.planId, 10);
      const { adjustments } = req.body as {
        adjustments: Array<{ sectionId: number; newDifficulty: number }>;
      };
      if (!Array.isArray(adjustments) || adjustments.length === 0) {
        return res.status(400).json({ error: "adjustments must be a non-empty array" });
      }
      const plan = await storage.getLearningPlanById(planId);
      if (!plan) return res.status(404).json({ error: "plan not found" });

      await storage.recalibratePassageDifficulties(planId, adjustments);

      const today = new Date().toISOString().slice(0, 10);
      const { lessonsCreated } = await replanUpcomingSessions({
        planId,
        storage,
        fromDateISO: today,
        horizonDays: 14,
      });

      return res.json({ ok: true, lessonsReplanned: lessonsCreated });
    } catch (err) {
      console.error("recalibrate error:", err);
      return res.status(500).json({ error: "recalibration failed" });
    }
  });

  return httpServer;
}
