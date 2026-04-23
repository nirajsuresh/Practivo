// Sanity-check that the v2 scheduler tables exist and are queryable.
// Run: npx tsx --env-file=.env server/scripts/verify-scheduler-v2.ts

import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Verifying scheduler v2 schema...");

  const cols = await db.execute(sql`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'learning_plans'
      AND column_name IN ('scheduler_version', 'last_replan_at')
    ORDER BY column_name
  `);
  console.log("  learning_plans new columns:", cols.rows);

  const passagesCol = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'passages'
    ORDER BY ordinal_position
  `);
  console.log(`  passages columns (${passagesCol.rows.length}):`,
    passagesCol.rows.map((r: any) => r.column_name).join(", "));

  const ppCol = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'passage_progress'
    ORDER BY ordinal_position
  `);
  console.log(`  passage_progress columns (${ppCol.rows.length}):`,
    ppCol.rows.map((r: any) => r.column_name).join(", "));

  const rowCounts = await db.execute(sql`
    SELECT 'passages' AS tbl, COUNT(*) AS n FROM passages
    UNION ALL SELECT 'passage_progress', COUNT(*) FROM passage_progress
  `);
  console.log("  row counts:", rowCounts.rows);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
