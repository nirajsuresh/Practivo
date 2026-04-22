/**
 * One-time cleanup: delete orphaned sheet_music rows (not referenced by any
 * learning_plan or community_score) along with their R2 objects.
 *
 * Run with:
 *   npx tsx --env-file=.env server/scripts/cleanup-orphan-sheet-music.ts
 */

import { db } from "../db.js";
import { sheetMusic, sheetMusicPages, measures, measureProgress, learningPlans, communityScores } from "../../shared/schema.js";
import { deleteFromR2 } from "../r2.js";
import { inArray, eq } from "drizzle-orm";

async function main() {
  // IDs still referenced by a learning plan or community score
  const lpRows = await db.select({ id: learningPlans.sheetMusicId }).from(learningPlans);
  const csRows = await db.select({ id: communityScores.sheetMusicId }).from(communityScores);
  const keepIds = new Set(
    [...lpRows, ...csRows].map((r) => r.id).filter((id): id is number => id != null),
  );
  console.log("Keeping sheet_music ids:", [...keepIds].sort((a, b) => a - b).join(", "));

  const allRows = await db.select({ id: sheetMusic.id, fileUrl: sheetMusic.fileUrl }).from(sheetMusic);
  const toDelete = allRows.filter((r) => !keepIds.has(r.id));
  console.log(`Deleting ${toDelete.length} orphaned rows (out of ${allRows.length} total).\n`);

  let r2Deleted = 0;
  let r2Errors = 0;

  for (const row of toDelete) {
    // Delete PDF from R2 (only if it's an R2 key, not a stale local path)
    if (row.fileUrl.startsWith("sheet-music/")) {
      try {
        await deleteFromR2(row.fileUrl);
        r2Deleted++;
      } catch (e) {
        console.warn(`  [${row.id}] R2 delete PDF failed:`, e instanceof Error ? e.message : e);
        r2Errors++;
      }
    }

    // Delete page images from R2
    const pages = await db
      .select({ imageUrl: sheetMusicPages.imageUrl })
      .from(sheetMusicPages)
      .where(eq(sheetMusicPages.sheetMusicId, row.id));

    for (const page of pages) {
      // imageUrl is a full public URL like https://pub-xxx.r2.dev/pages/74/page-1.png
      // Extract the key (everything after the host)
      try {
        const key = new URL(page.imageUrl).pathname.replace(/^\//, "");
        await deleteFromR2(key);
        r2Deleted++;
      } catch (e) {
        console.warn(`  [${row.id}] R2 delete page failed:`, e instanceof Error ? e.message : e);
        r2Errors++;
      }
    }

    console.log(`  [${row.id}] deleted (${pages.length} pages)`);
  }

  // Delete DB rows in dependency order
  const deleteIds = toDelete.map((r) => r.id);
  if (deleteIds.length > 0) {
    // 1. measure_progress → measures → sheet_music_pages → sheet_music
    const measureRows = await db
      .select({ id: measures.id })
      .from(measures)
      .where(inArray(measures.sheetMusicId, deleteIds));
    const measureIds = measureRows.map((r) => r.id);
    if (measureIds.length > 0) {
      await db.delete(measureProgress).where(inArray(measureProgress.measureId, measureIds));
      await db.delete(measures).where(inArray(measures.id, measureIds));
    }
    await db.delete(sheetMusicPages).where(inArray(sheetMusicPages.sheetMusicId, deleteIds));
    await db.delete(sheetMusic).where(inArray(sheetMusic.id, deleteIds));
  }

  console.log(`\nDone. R2 objects deleted: ${r2Deleted}, errors: ${r2Errors}. DB rows deleted: ${deleteIds.length}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
