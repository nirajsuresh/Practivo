/**
 * One-shot migration: drops the stale unique constraint on piece_milestones
 * that was created before movement_id was added to the table.
 *
 * Run with:  node drop-old-milestone-constraint.mjs
 */
import { readFileSync } from "fs";
import { createRequire } from "module";

// Load DATABASE_URL from .env
const env = readFileSync(".env", "utf8");
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!dbUrl) { console.error("DATABASE_URL not found in .env"); process.exit(1); }

const require = createRequire(import.meta.url);
const { Pool } = require("./node_modules/pg/lib/index.js");
const pool = new Pool({ connectionString: dbUrl });

const OLD_CONSTRAINT = "piece_milestones_user_id_piece_id_cycle_number_milestone_ty_key";

try {
  // Check if it still exists
  const { rows } = await pool.query(
    `SELECT 1 FROM pg_constraint WHERE conname = $1 AND conrelid = 'piece_milestones'::regclass`,
    [OLD_CONSTRAINT]
  );
  if (rows.length === 0) {
    console.log("✅ Old constraint already gone — nothing to do.");
  } else {
    await pool.query(`ALTER TABLE piece_milestones DROP CONSTRAINT "${OLD_CONSTRAINT}"`);
    console.log(`✅ Dropped constraint: ${OLD_CONSTRAINT}`);
    console.log("   Milestones can now be recorded independently per movement.");
  }
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
