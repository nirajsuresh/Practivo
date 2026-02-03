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

  return httpServer;
}
