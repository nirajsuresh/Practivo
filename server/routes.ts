import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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

  app.get("/api/search/unified", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      const results = await storage.unifiedSearch(query);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to search" });
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

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: "AI service not configured" });
      }

      const prompt = wikiExtract
        ? `Write a single short paragraph (3-5 sentences) describing "${piece.title}" by ${composerName}. Cover when it was composed, its musical character, and what makes it notable. Write as a factual encyclopedia-style description, not as a response to someone. Do not use headers, bullet points, or address the reader.\n\nReference material:\n${wikiExtract}`
        : `Write a single short paragraph (3-5 sentences) describing "${piece.title}" by ${composerName}. Cover its musical character, style period, and what makes it notable for pianists. Write as a factual encyclopedia-style description, not as a response to someone. Do not use headers, bullet points, or address the reader.`;

      let analysis: string;
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
          const errBody = await geminiRes.text();
          console.error("Gemini API error:", geminiRes.status, errBody);
          return res.status(502).json({ error: "AI service temporarily unavailable. Please try again later." });
        }
        const geminiData = await geminiRes.json() as any;
        const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        console.log("Gemini completion: content_length=", text.length);
        analysis = text.trim() || "Analysis not available.";
      } catch (aiError) {
        console.error("Gemini API error:", aiError);
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

      if (req.body.pieceId && req.body.userId) {
        const tenSecondsAgo = new Date(Date.now() - 10000);
        const recentActivity = await storage.getUserActivityLog(req.body.userId, 5);
        const alreadyLogged = recentActivity.some(
          (a: any) => a.type === "added_piece" && a.pieceId === req.body.pieceId && a.createdAt && new Date(a.createdAt) > tenSecondsAgo
        );
        if (!alreadyLogged) {
          await storage.createPost({
            userId: req.body.userId,
            type: "added_piece",
            content: "Added to repertoire",
            pieceId: req.body.pieceId,
          });
        }
      }

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

  app.patch("/api/repertoire/piece/:pieceId", async (req, res) => {
    try {
      const pieceId = parseInt(req.params.pieceId);
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const updated = await storage.updateRepertoireByPiece(userId, pieceId, req.body);

      if (req.body.status && req.body.status !== "Shelved") {
        try {
          const recent = await storage.getUserActivityLog(userId, 5);
          const alreadyLogged = recent.some(
            (a: any) => a.type === "status_change" && a.pieceId === pieceId && a.content === req.body.status && a.createdAt && new Date(a.createdAt) > new Date(Date.now() - 10000)
          );
          if (!alreadyLogged) {
            await storage.createPost({
              userId,
              type: "status_change",
              content: req.body.status,
              pieceId,
            });
          }
        } catch (e) {}
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update repertoire entries" });
    }
  });

  app.patch("/api/repertoire/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateRepertoireEntry(id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Repertoire entry not found" });
      }

      if (req.body.status && req.body.status !== "Shelved" && updated) {
        const userId = req.headers["x-user-id"] as string;
        if (userId) {
          try {
            const recent = await storage.getUserActivityLog(userId, 5);
            const alreadyLogged = recent.some(
              (a: any) => a.type === "status_change" && a.pieceId === updated.pieceId && a.content === req.body.status && a.createdAt && new Date(a.createdAt) > new Date(Date.now() - 10000)
            );
            if (!alreadyLogged) {
              await storage.createPost({
                userId,
                type: "status_change",
                content: req.body.status,
                pieceId: updated.pieceId,
              });
            }
          } catch (e) {}
        }
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update repertoire entry" });
    }
  });

  app.delete("/api/repertoire/piece/:pieceId", async (req, res) => {
    try {
      const pieceId = parseInt(req.params.pieceId);
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const deleted = await storage.deleteRepertoireByPiece(userId, pieceId);
      if (!deleted) {
        return res.status(404).json({ error: "No repertoire entries found for this piece" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete repertoire entries" });
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

  app.get("/api/activity/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      const requestingUser = req.headers["x-user-id"] as string;
      if (!requestingUser || requestingUser !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 30;
      const activity = await storage.getUserActivityLog(userId, limit);
      res.json(activity);
    } catch (error) {
      res.status(500).json({ error: "Failed to get activity log" });
    }
  });

  app.delete("/api/activity/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const activity = await storage.getUserActivityLog(userId, 100);
      const owns = activity.some((a: any) => a.id === id);
      if (!owns) {
        return res.status(403).json({ error: "Not authorized to delete this entry" });
      }
      const deleted = await storage.deletePost(id);
      if (!deleted) {
        return res.status(404).json({ error: "Activity entry not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete activity entry" });
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

  app.get("/api/users/search", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      const currentUserId = req.headers["x-user-id"] as string;
      if (!currentUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const users = await storage.searchUsers(query, currentUserId);
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to search users" });
    }
  });

  app.post("/api/connections", async (req, res) => {
    try {
      const currentUserId = req.headers["x-user-id"] as string;
      if (!currentUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { recipientId } = req.body;
      if (!recipientId) {
        return res.status(400).json({ error: "recipientId is required" });
      }
      if (currentUserId === recipientId) {
        return res.status(400).json({ error: "Cannot connect with yourself" });
      }
      const connection = await storage.sendConnectionRequest(currentUserId, recipientId);
      res.status(201).json(connection);
    } catch (error: any) {
      if (error.message?.includes("already exists")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to send connection request" });
    }
  });

  app.get("/api/connections/received", async (req, res) => {
    try {
      const currentUserId = req.headers["x-user-id"] as string;
      if (!currentUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const requests = await storage.getPendingRequestsReceived(currentUserId);
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to get received requests" });
    }
  });

  app.get("/api/connections/sent", async (req, res) => {
    try {
      const currentUserId = req.headers["x-user-id"] as string;
      if (!currentUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const requests = await storage.getPendingRequestsSent(currentUserId);
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to get sent requests" });
    }
  });

  app.get("/api/connections", async (req, res) => {
    try {
      const currentUserId = req.headers["x-user-id"] as string;
      if (!currentUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const connections = await storage.getAcceptedConnections(currentUserId);
      res.json(connections);
    } catch (error) {
      res.status(500).json({ error: "Failed to get connections" });
    }
  });

  app.patch("/api/connections/:id", async (req, res) => {
    try {
      const currentUserId = req.headers["x-user-id"] as string;
      if (!currentUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const connectionId = parseInt(req.params.id);
      const { status } = req.body;
      if (!status || !["accepted", "denied"].includes(status)) {
        return res.status(400).json({ error: "Status must be 'accepted' or 'denied'" });
      }
      const conn = await storage.getConnectionById(connectionId);
      if (!conn) {
        return res.status(404).json({ error: "Connection not found" });
      }
      if (conn.recipientId !== currentUserId) {
        return res.status(403).json({ error: "Only the recipient can accept or deny a request" });
      }
      const updated = await storage.updateConnectionStatus(connectionId, status);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update connection" });
    }
  });

  app.get("/api/connections/status/:userId", async (req, res) => {
    try {
      const currentUserId = req.headers["x-user-id"] as string;
      if (!currentUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const targetUserId = req.params.userId;
      const connection = await storage.getConnectionBetween(currentUserId, targetUserId);
      if (!connection) {
        return res.json({ status: "none" });
      }
      if (connection.status === "accepted") {
        return res.json({ status: "accepted", connectionId: connection.id });
      }
      if (connection.status === "denied") {
        return res.json({ status: "denied", connectionId: connection.id });
      }
      if (connection.requesterId === currentUserId) {
        return res.json({ status: "pending_sent", connectionId: connection.id });
      }
      return res.json({ status: "pending_received", connectionId: connection.id });
    } catch (error) {
      res.status(500).json({ error: "Failed to get connection status" });
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
