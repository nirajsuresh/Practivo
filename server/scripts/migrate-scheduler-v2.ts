// One-off migration to introduce scheduler v2 schema:
//   - learning_plans: add scheduler_version, last_replan_at
//   - passages: new table
//   - passage_progress: new table
//
// Idempotent: safe to run multiple times. Uses IF NOT EXISTS everywhere.
// Run with: npx tsx --env-file=.env server/scripts/migrate-scheduler-v2.ts

import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Applying scheduler v2 migration...");

  await db.execute(sql`
    ALTER TABLE learning_plans
    ADD COLUMN IF NOT EXISTS scheduler_version integer NOT NULL DEFAULT 1
  `);
  console.log("  ✓ learning_plans.scheduler_version");

  await db.execute(sql`
    ALTER TABLE learning_plans
    ADD COLUMN IF NOT EXISTS last_replan_at timestamp
  `);
  console.log("  ✓ learning_plans.last_replan_at");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS passages (
      id serial PRIMARY KEY,
      learning_plan_id integer NOT NULL REFERENCES learning_plans(id) ON DELETE CASCADE,
      section_id integer REFERENCES plan_sections(id) ON DELETE SET NULL,
      kind text NOT NULL DEFAULT 'primary',
      label text,
      measure_start integer NOT NULL,
      measure_end integer NOT NULL,
      difficulty integer NOT NULL DEFAULT 5,
      challenges jsonb DEFAULT '[]'::jsonb,
      display_order integer NOT NULL DEFAULT 0,
      created_at timestamp DEFAULT now()
    )
  `);
  console.log("  ✓ passages table");

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_passages_plan ON passages(learning_plan_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_passages_section ON passages(section_id)
  `);
  console.log("  ✓ passages indexes");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS passage_progress (
      id serial PRIMARY KEY,
      passage_id integer NOT NULL REFERENCES passages(id) ON DELETE CASCADE,
      learning_plan_id integer NOT NULL REFERENCES learning_plans(id) ON DELETE CASCADE,
      user_id varchar NOT NULL REFERENCES users(id),
      current_phase text NOT NULL DEFAULT 'orient',
      phase_started_at text,
      phase_touch_count integer NOT NULL DEFAULT 0,
      maturity integer NOT NULL DEFAULT 0,
      sr_stability integer NOT NULL DEFAULT 1,
      sr_difficulty integer NOT NULL DEFAULT 5,
      last_reviewed_at text,
      next_due_at text,
      review_count integer NOT NULL DEFAULT 0,
      lapse_count integer NOT NULL DEFAULT 0,
      outstanding_challenges jsonb DEFAULT '[]'::jsonb,
      last_flag_count integer NOT NULL DEFAULT 0,
      introduced_at text,
      retired_at text,
      updated_at timestamp DEFAULT now(),
      CONSTRAINT passage_progress_unique UNIQUE(passage_id, learning_plan_id)
    )
  `);
  console.log("  ✓ passage_progress table");

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_passage_progress_plan ON passage_progress(learning_plan_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_passage_progress_due ON passage_progress(learning_plan_id, next_due_at)
  `);
  console.log("  ✓ passage_progress indexes");

  console.log("Migration complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
