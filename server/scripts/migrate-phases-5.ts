// Data migration: rename 7-phase values → 5-phase values in all tables.
//
// Mapping:
//   orient      → decode
//   decode      → decode  (unchanged)
//   chunk       → build
//   coordinate  → build
//   link        → connect
//   stabilize   → shape
//   shape       → perform  (old "shape" becomes "perform")
//
// Run with: npx tsx --env-file=.env server/scripts/migrate-phases-5.ts

import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Migrating phase names 7 → 5...\n");

  // 1. passage_progress.current_phase
  const pp = await db.execute(sql`
    UPDATE passage_progress SET current_phase =
      CASE current_phase
        WHEN 'orient'     THEN 'decode'
        WHEN 'chunk'      THEN 'build'
        WHEN 'coordinate' THEN 'build'
        WHEN 'link'       THEN 'connect'
        WHEN 'stabilize'  THEN 'shape'
        WHEN 'shape'      THEN 'perform'
        ELSE current_phase
      END
    WHERE current_phase IN ('orient','chunk','coordinate','link','stabilize','shape')
  `);
  console.log(`passage_progress.current_phase: ${pp.rowCount} rows updated`);

  // 2. lesson_days.phase_type
  const ld = await db.execute(sql`
    UPDATE lesson_days SET phase_type =
      CASE phase_type
        WHEN 'orient'     THEN 'decode'
        WHEN 'chunk'      THEN 'build'
        WHEN 'coordinate' THEN 'build'
        WHEN 'link'       THEN 'connect'
        WHEN 'stabilize'  THEN 'shape'
        WHEN 'shape'      THEN 'perform'
        ELSE phase_type
      END
    WHERE phase_type IN ('orient','chunk','coordinate','link','stabilize','shape')
  `);
  console.log(`lesson_days.phase_type: ${ld.rowCount} rows updated`);

  // 3. plan_section_phases.phase_type — merge collisions before renaming.
  //    orient→decode: if both exist, add orient.repetitions to decode, then delete orient.
  //    chunk+coordinate→build: sum repetitions from both into build, delete originals.
  //    Similar for link→connect, stabilize→shape, shape→perform.
  const merges: [string, string][] = [
    ["orient", "decode"],
    ["chunk", "build"],
    ["coordinate", "build"],
    ["link", "connect"],
    ["stabilize", "shape"],
    ["shape", "perform"],
  ];
  let pspMerged = 0;
  let pspRenamed = 0;
  for (const [from, to] of merges) {
    // Merge where both old and new already exist for the same section.
    const merge = await db.execute(sql`
      UPDATE plan_section_phases dst
      SET repetitions = dst.repetitions + src.repetitions
      FROM plan_section_phases src
      WHERE dst.section_id = src.section_id
        AND dst.phase_type = ${to}
        AND src.phase_type = ${from}
    `);
    pspMerged += merge.rowCount ?? 0;
    // Delete the old rows that were just merged.
    await db.execute(sql`
      DELETE FROM plan_section_phases
      WHERE phase_type = ${from}
        AND section_id IN (
          SELECT section_id FROM plan_section_phases WHERE phase_type = ${to}
        )
    `);
    // Rename remaining old rows that had no matching new row.
    const rename = await db.execute(sql`
      UPDATE plan_section_phases SET phase_type = ${to}
      WHERE phase_type = ${from}
    `);
    pspRenamed += rename.rowCount ?? 0;
  }
  console.log(`plan_section_phases: ${pspMerged} merged, ${pspRenamed} renamed`);

  // 4. lesson_days.tasks JSONB — update phaseType and type fields inside each task.
  //    We cast tasks to text, replace, then cast back. Safe because old phase names
  //    don't appear as substrings of any other token in the JSON payload.
  // PostgreSQL normalizes JSONB to have a space after each colon: "key": "value"
  const replacements: [string, string][] = [
    ['"phaseType": "orient"',     '"phaseType": "decode"'],
    ['"phaseType": "chunk"',      '"phaseType": "build"'],
    ['"phaseType": "coordinate"', '"phaseType": "build"'],
    ['"phaseType": "link"',       '"phaseType": "connect"'],
    ['"phaseType": "stabilize"',  '"phaseType": "shape"'],
    ['"phaseType": "shape"',      '"phaseType": "perform"'],
    ['"type": "orient"',          '"type": "decode"'],
    ['"type": "chunk"',           '"type": "build"'],
    ['"type": "coordinate"',      '"type": "build"'],
    ['"type": "link"',            '"type": "connect"'],
    ['"type": "stabilize"',       '"type": "shape"'],
    ['"type": "shape"',           '"type": "perform"'],
    ['"phase": "orient"',         '"phase": "decode"'],
    ['"phase": "chunk"',          '"phase": "build"'],
    ['"phase": "coordinate"',     '"phase": "build"'],
    ['"phase": "link"',           '"phase": "connect"'],
    ['"phase": "stabilize"',      '"phase": "shape"'],
    ['"phase": "shape"',          '"phase": "perform"'],
  ];

  let tasksUpdated = 0;
  for (const [from, to] of replacements) {
    const r = await db.execute(sql`
      UPDATE lesson_days
      SET tasks = tasks::text::jsonb
      WHERE tasks::text LIKE ${"%" + from + "%"}
    `);
    // Re-run the actual replace
    await db.execute(sql`
      UPDATE lesson_days
      SET tasks = replace(tasks::text, ${from}, ${to})::jsonb
      WHERE tasks::text LIKE ${"%" + from + "%"}
    `);
    tasksUpdated += r.rowCount ?? 0;
  }
  console.log(`lesson_days.tasks JSONB: ~${tasksUpdated} replacement passes applied`);

  console.log("\nMigration complete.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
