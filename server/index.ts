import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { autoSeedIfEmpty } from "./auto-seed";
import { seedExtraUsers } from "./seed-extra-users";
import { db } from "./db";
import { sql } from "drizzle-orm";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Run schema migrations
  try {
    await db.execute(sql`ALTER TABLE repertoire_entries ADD COLUMN IF NOT EXISTS current_cycle integer NOT NULL DEFAULT 1`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS piece_milestones (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id),
      piece_id integer NOT NULL REFERENCES pieces(id),
      movement_id integer REFERENCES movements(id),
      cycle_number integer NOT NULL DEFAULT 1,
      milestone_type text NOT NULL,
      achieved_at text NOT NULL,
      created_at timestamp DEFAULT now(),
      UNIQUE(user_id, piece_id, movement_id, cycle_number, milestone_type)
    )`);
    await db.execute(sql`ALTER TABLE piece_milestones ADD COLUMN IF NOT EXISTS movement_id integer REFERENCES movements(id)`);
    try {
      await db.execute(sql`ALTER TABLE piece_milestones DROP CONSTRAINT IF EXISTS piece_milestones_user_id_piece_id_cycle_number_milestone_type_key`);
      await db.execute(sql`ALTER TABLE piece_milestones DROP CONSTRAINT IF EXISTS piece_milestones_unique`);
    } catch (_) { /* ignore if missing */ }
    await db.execute(sql`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'piece_milestones_unique') THEN
        ALTER TABLE piece_milestones ADD CONSTRAINT piece_milestones_unique UNIQUE (user_id, piece_id, movement_id, cycle_number, milestone_type);
      END IF; END $$`);

    // Learning plan tables
    await db.execute(sql`CREATE TABLE IF NOT EXISTS learning_plans (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL REFERENCES users(id),
      repertoire_entry_id integer NOT NULL REFERENCES repertoire_entries(id),
      daily_practice_minutes integer NOT NULL DEFAULT 30,
      target_completion_date text,
      total_measures integer,
      status text NOT NULL DEFAULT 'setup',
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    )`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS sheet_music (
      id serial PRIMARY KEY,
      piece_id integer REFERENCES pieces(id),
      user_id varchar NOT NULL REFERENCES users(id),
      file_url text NOT NULL,
      source text NOT NULL DEFAULT 'upload',
      processing_status text NOT NULL DEFAULT 'pending',
      page_count integer,
      uploaded_at timestamp DEFAULT now()
    )`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS measures (
      id serial PRIMARY KEY,
      sheet_music_id integer NOT NULL REFERENCES sheet_music(id),
      measure_number integer NOT NULL,
      page_number integer NOT NULL,
      bounding_box jsonb,
      image_url text,
      user_corrected boolean NOT NULL DEFAULT false,
      confirmed_at timestamp
    )`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS lesson_days (
      id serial PRIMARY KEY,
      learning_plan_id integer NOT NULL REFERENCES learning_plans(id),
      scheduled_date text NOT NULL,
      measure_start integer NOT NULL,
      measure_end integer NOT NULL,
      status text NOT NULL DEFAULT 'upcoming',
      user_notes text,
      completed_at timestamp
    )`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS measure_progress (
      id serial PRIMARY KEY,
      learning_plan_id integer NOT NULL REFERENCES learning_plans(id),
      measure_id integer NOT NULL REFERENCES measures(id),
      user_id varchar NOT NULL REFERENCES users(id),
      status text NOT NULL DEFAULT 'not_started',
      notes text,
      last_practiced_at text,
      UNIQUE(learning_plan_id, measure_id)
    )`);

    console.log("Schema migrations applied");
  } catch (err) {
    console.error("Migration error (non-fatal):", err);
  }

  try { await autoSeedIfEmpty(); } catch (err) { console.error("Auto-seed failed (non-fatal):", err); }
  try { await seedExtraUsers(); } catch (err) { console.error("Extra-users seed failed (non-fatal):", err); }
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, () => {
    log(`serving on port ${port}`);
  });
})();
