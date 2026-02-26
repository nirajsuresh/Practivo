import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import OpenAI from "openai";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  registerObjectStorageRoutes(app);

  app.get("/api/composers/search", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      const composers = await storage.searchComposers(query);
      res.json(composers);
    } catch (error) {
      res.status(500).json({ error: "Failed to search composers" });
    }
  });

  app.get("/api/composers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const composer = await storage.getComposerById(id);
      if (!composer) {
        return res.status(404).json({ error: "Composer not found" });
      }
      res.json(composer);
    } catch (error) {
      res.status(500).json({ error: "Failed to get composer" });
    }
  });

  app.get("/api/pieces/search", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      const composerId = req.query.composerId ? parseInt(req.query.composerId as string) : undefined;
      const pieces = await storage.searchPieces(query, composerId);
      res.json(pieces);
    } catch (error) {
      res.status(500).json({ error: "Failed to search pieces" });
    }
  });

  app.get("/api/pieces/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const piece = await storage.getPieceById(id);
      if (!piece) {
        return res.status(404).json({ error: "Piece not found" });
      }
      res.json(piece);
    } catch (error) {
      res.status(500).json({ error: "Failed to get piece" });
    }
  });

  app.get("/api/pieces/:pieceId/movements", async (req, res) => {
    try {
      const pieceId = parseInt(req.params.pieceId);
      const movements = await storage.getMovementsByPiece(pieceId);
      res.json(movements);
    } catch (error) {
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
      if (!piece) {
        return res.status(404).json({ error: "Piece not found" });
      }

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

      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY || !process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
        return res.status(503).json({ error: "AI service not configured" });
      }

      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const prompt = wikiExtract
        ? `Write a single short paragraph (3-5 sentences) describing "${piece.title}" by ${composerName}. Cover when it was composed, its musical character, and what makes it notable. Write as a factual encyclopedia-style description, not as a response to someone. Do not use headers, bullet points, or address the reader.\n\nReference material:\n${wikiExtract}`
        : `Write a single short paragraph (3-5 sentences) describing "${piece.title}" by ${composerName}. Cover its musical character, style period, and what makes it notable for pianists. Write as a factual encyclopedia-style description, not as a response to someone. Do not use headers, bullet points, or address the reader.`;

      let analysis: string;
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-5-nano",
          messages: [
            { role: "system", content: "You write brief, factual descriptions of classical music pieces in the style of a music encyclopedia entry." },
            { role: "user", content: prompt },
          ],
          max_completion_tokens: 4096,
        });
        console.log("OpenAI completion:", JSON.stringify({
          finish_reason: completion.choices[0]?.finish_reason,
          content_length: completion.choices[0]?.message?.content?.length ?? 0,
          model: completion.model,
        }));
        analysis = completion.choices[0]?.message?.content?.trim() || "Analysis not available.";
      } catch (aiError) {
        console.error("OpenAI API error:", aiError);
        return res.status(502).json({ error: "AI service temporarily unavailable. Please try again later." });
      }

      const saved = await storage.savePieceAnalysis({ pieceId, analysis, wikiUrl });
      res.json({ analysis: saved.analysis, wikiUrl: saved.wikiUrl });
    } catch (error) {
      console.error("Error generating piece analysis:", error);
      res.status(500).json({ error: "Failed to generate analysis" });
    }
  });

  app.get("/api/repertoire/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      const repertoire = await storage.getRepertoireByUser(userId);
      res.json(repertoire);
    } catch (error) {
      res.status(500).json({ error: "Failed to get repertoire" });
    }
  });

  app.post("/api/repertoire", async (req, res) => {
    try {
      const entry = await storage.createRepertoireEntry(req.body);
      res.status(201).json(entry);
    } catch (error) {
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
    } catch (error) {
      res.status(500).json({ error: "Failed to update repertoire order" });
    }
  });

  app.patch("/api/repertoire/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateRepertoireEntry(id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Repertoire entry not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update repertoire entry" });
    }
  });

  app.delete("/api/repertoire/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteRepertoireEntry(id);
      if (!deleted) {
        return res.status(404).json({ error: "Repertoire entry not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete repertoire entry" });
    }
  });

  app.get("/api/feed/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const posts = await storage.getFeedPosts(userId, limit);
      res.json(posts);
    } catch (error) {
      res.status(500).json({ error: "Failed to get feed posts" });
    }
  });

  app.get("/api/challenges", async (req, res) => {
    try {
      const challenges = await storage.getActiveChallenges();
      res.json(challenges);
    } catch (error) {
      res.status(500).json({ error: "Failed to get challenges" });
    }
  });

  app.get("/api/recordings", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const recordings = await storage.getRecordingPosts(limit);
      res.json(recordings);
    } catch (error) {
      res.status(500).json({ error: "Failed to get recordings" });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ error: "Username already taken" });
      }
      const user = await storage.createUser({ username, password });
      res.status(201).json({ id: user.id, username: user.username });
    } catch (error) {
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
    } catch (error) {
      res.status(500).json({ error: "Failed to login" });
    }
  });

  app.post("/api/users/:userId/profile", async (req, res) => {
    try {
      const userId = req.params.userId;
      const profile = await storage.createUserProfile({ ...req.body, userId });
      res.status(201).json(profile);
    } catch (error) {
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
    } catch (error) {
      res.status(500).json({ error: "Failed to create repertoire entries" });
    }
  });

  app.get("/api/users/lookup/:username", async (req, res) => {
    try {
      const username = req.params.username;
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ id: user.id, username: user.username });
    } catch (error) {
      res.status(500).json({ error: "Failed to lookup user" });
    }
  });

  app.get("/api/users/:userId/profile", async (req, res) => {
    try {
      const userId = req.params.userId;
      const profile = await storage.getUserProfile(userId);
      if (!profile) {
        return res.status(404).json({ error: "User profile not found" });
      }
      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: "Failed to get user profile" });
    }
  });

  app.get("/api/users/:userId/suggested", async (req, res) => {
    try {
      const userId = req.params.userId;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const suggested = await storage.getSuggestedUsers(userId, limit);
      res.json(suggested);
    } catch (error) {
      res.status(500).json({ error: "Failed to get suggested users" });
    }
  });

  app.get("/api/pieces/:pieceId/ratings", async (req, res) => {
    try {
      const pieceId = parseInt(req.params.pieceId);
      const summary = await storage.getPieceRatingSummary(pieceId);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: "Failed to get piece ratings" });
    }
  });

  app.get("/api/pieces/:pieceId/comments", async (req, res) => {
    try {
      const pieceId = parseInt(req.params.pieceId);
      const comments = await storage.getPieceComments(pieceId);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ error: "Failed to get piece comments" });
    }
  });

  app.get("/api/pieces/:pieceId/status-distribution", async (req, res) => {
    try {
      const pieceId = parseInt(req.params.pieceId);
      const distribution = await storage.getPieceStatusDistribution(pieceId);
      res.json(distribution);
    } catch (error) {
      res.status(500).json({ error: "Failed to get status distribution" });
    }
  });

  return httpServer;
}
