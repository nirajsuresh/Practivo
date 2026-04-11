/**
 * One-time migration script: upload existing local files to Cloudflare R2
 * and backfill the sheet_music_pages table.
 *
 * Run after setting R2 env vars:
 *   npx tsx server/scripts/migrate-to-r2.ts
 *
 * Safe to re-run — skips rows already present in sheet_music_pages.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { db } from "../db.js";
import { sheetMusic, sheetMusicPages } from "../../shared/schema.js";
import { uploadToR2 } from "../r2.js";
import { eq } from "drizzle-orm";

// Read raw PNG width/height from the PNG IHDR chunk (bytes 16–24).
function pngDimensions(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24) throw new Error("Buffer too small for PNG header");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

async function main() {
  const rows = await db.select().from(sheetMusic);
  console.log(`Found ${rows.length} sheet_music rows.`);

  let pdfsMigrated = 0;
  let pdfsSkipped = 0;
  let pagesMigrated = 0;

  for (const row of rows) {
    const isR2Key = row.fileUrl.startsWith("sheet-music/");

    // ── Migrate PDF ──────────────────────────────────────────────────────────
    if (!isR2Key) {
      const localPath = path.isAbsolute(row.fileUrl)
        ? row.fileUrl
        : path.join(process.cwd(), row.fileUrl);

      if (!fs.existsSync(localPath)) {
        console.warn(`  [${row.id}] PDF not found locally at ${localPath}, skipping.`);
        pdfsSkipped++;
      } else {
        const buf = fs.readFileSync(localPath);
        const r2Key = `sheet-music/${row.id}.pdf`;
        await uploadToR2(r2Key, buf, "application/pdf");
        await db.update(sheetMusic).set({ fileUrl: r2Key }).where(eq(sheetMusic.id, row.id));
        console.log(`  [${row.id}] PDF → R2 ${r2Key}`);
        pdfsMigrated++;
      }
    } else {
      pdfsSkipped++;
    }

    // ── Migrate page PNGs ────────────────────────────────────────────────────
    const existingPages = await db
      .select({ pageNumber: sheetMusicPages.pageNumber })
      .from(sheetMusicPages)
      .where(eq(sheetMusicPages.sheetMusicId, row.id));
    const existingPageNums = new Set(existingPages.map((p) => p.pageNumber));

    const pagesDir = path.join(process.cwd(), "uploads", "pages", String(row.id));
    if (!fs.existsSync(pagesDir)) continue;

    const files = fs.readdirSync(pagesDir)
      .filter((f) => f.endsWith(".png"))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
        const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
        return na - nb;
      });

    for (const file of files) {
      const pageNumber = parseInt(file.match(/\d+/)?.[0] ?? "0", 10);
      if (existingPageNums.has(pageNumber)) continue;

      const buf = fs.readFileSync(path.join(pagesDir, file));
      const { width, height } = pngDimensions(buf);
      const key = `pages/${row.id}/page-${pageNumber}.png`;
      const imageUrl = await uploadToR2(key, buf, "image/png");
      await db.insert(sheetMusicPages).values({
        sheetMusicId: row.id,
        pageNumber,
        imageUrl,
        width,
        height,
      });
      console.log(`    [${row.id}] page ${pageNumber} → R2 ${key}`);
      pagesMigrated++;
    }
  }

  console.log(`\nDone. PDFs migrated: ${pdfsMigrated}, skipped: ${pdfsSkipped}. Pages migrated: ${pagesMigrated}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
