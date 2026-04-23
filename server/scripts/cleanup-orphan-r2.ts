/**
 * Find and delete R2 objects that have no corresponding reference in the database.
 *
 * Checks all three places DB keys are stored:
 *   sheet_music.fileUrl          — "sheet-music/{id}.pdf"
 *   sheet_music_pages.imageUrl   — full public URL → extracted to key
 *   measures.imageUrl            — full public URL → extracted to key
 *
 * Usage:
 *   npx tsx --env-file=.env server/scripts/cleanup-orphan-r2.ts           # dry run
 *   npx tsx --env-file=.env server/scripts/cleanup-orphan-r2.ts --delete  # actually delete
 */

import { db } from "../db.js";
import { sheetMusic, sheetMusicPages, measures } from "../../shared/schema.js";
import { listR2Objects, deleteFromR2, r2PublicUrl } from "../r2.js";

function urlToKey(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    // Already a bare key
    return url.replace(/^\//, "");
  }
}

async function main() {
  const dryRun = !process.argv.includes("--delete");
  if (dryRun) {
    console.log("DRY RUN — pass --delete to actually remove objects.\n");
  }

  // 1. Collect all R2 keys referenced in the DB
  const [smRows, pageRows, measureRows] = await Promise.all([
    db.select({ fileUrl: sheetMusic.fileUrl }).from(sheetMusic),
    db.select({ imageUrl: sheetMusicPages.imageUrl }).from(sheetMusicPages),
    db.select({ imageUrl: measures.imageUrl }).from(measures),
  ]);

  const knownKeys = new Set<string>();

  for (const r of smRows) {
    if (r.fileUrl) knownKeys.add(urlToKey(r.fileUrl));
  }
  for (const r of pageRows) {
    if (r.imageUrl) knownKeys.add(urlToKey(r.imageUrl));
  }
  for (const r of measureRows) {
    if (r.imageUrl) knownKeys.add(urlToKey(r.imageUrl));
  }

  console.log(`DB references: ${knownKeys.size} unique R2 keys.`);

  // 2. List everything actually in R2
  console.log("Listing R2 objects...");
  const r2Keys = await listR2Objects();
  console.log(`R2 objects found: ${r2Keys.length}\n`);

  // 3. Find orphans
  const orphans = r2Keys.filter((k) => !knownKeys.has(k));
  console.log(`Orphaned objects: ${orphans.length}`);

  if (orphans.length === 0) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  for (const key of orphans) {
    if (dryRun) {
      console.log(`  [dry-run] would delete: ${key}`);
    } else {
      try {
        await deleteFromR2(key);
        console.log(`  deleted: ${key}`);
      } catch (e) {
        console.warn(`  FAILED: ${key} —`, e instanceof Error ? e.message : e);
      }
    }
  }

  if (!dryRun) {
    console.log(`\nDone. ${orphans.length} object(s) deleted.`);
  } else {
    console.log(`\nDry run complete. Re-run with --delete to remove the above.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
