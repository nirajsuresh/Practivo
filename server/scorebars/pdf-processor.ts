/**
 * PDF → page image renderer.
 * Uses pdftoppm (poppler) via child_process — reliable, no pdfjs Node.js compatibility issues.
 * No imports from Reperto application code.
 *
 * Renders one page at a time so onProgress fires after each page,
 * giving real-time feedback during the slow rendering step.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface PageImage {
  pageNumber: number;
  imageBuffer: Buffer;
  /** Absolute path if saved to pagesDir, otherwise null. */
  savedPath: string | null;
  width: number;
  height: number;
}

interface PdfProcessorOptions {
  dpi: number;
  /** If set, page PNGs are copied here and paths returned in savedPath. */
  pagesDir?: string;
  onProgress?: (page: number, total: number) => void;
}

/** Get total page count from a PDF using pdfinfo. */
async function getPdfPageCount(pdfPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [pdfPath]);
    const match = stdout.match(/^Pages:\s+(\d+)/m);
    if (match) return parseInt(match[1], 10);
  } catch {
    // pdfinfo not available — fall back to bulk render to discover page count
  }
  return 0;
}

export class PdfProcessor {
  private dpi: number;
  private pagesDir?: string;
  private onProgress?: (page: number, total: number) => void;

  constructor(opts: PdfProcessorOptions) {
    this.dpi = opts.dpi;
    this.pagesDir = opts.pagesDir;
    this.onProgress = opts.onProgress;
  }

  async renderPages(pdfPath: string): Promise<PageImage[]> {
    if (this.pagesDir && !fs.existsSync(this.pagesDir)) {
      fs.mkdirSync(this.pagesDir, { recursive: true });
    }

    // ── Step 1: Get page count ────────────────────────────────────────────────
    let total = await getPdfPageCount(pdfPath);

    if (total === 0) {
      // Fallback: do a bulk render first just to count pages, then we'll
      // re-render per-page below (rare — pdfinfo is almost always available).
      const countDir = fs.mkdtempSync(path.join(os.tmpdir(), "scorebars-count-"));
      try {
        await execFileAsync("pdftoppm", ["-r", "20", "-png", pdfPath, path.join(countDir, "p")]);
        total = fs.readdirSync(countDir).filter(f => f.endsWith(".png")).length;
      } finally {
        fs.rmSync(countDir, { recursive: true, force: true });
      }
    }

    if (total === 0) throw new Error("Could not determine page count for PDF");

    // ── Step 2: Render each page individually ─────────────────────────────────
    const pages: PageImage[] = [];

    for (let i = 1; i <= total; i++) {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scorebars-pg-"));
      const prefix = path.join(tmpDir, "p");
      try {
        await execFileAsync("pdftoppm", [
          "-r", String(this.dpi),
          "-png",
          "-f", String(i),
          "-l", String(i),
          pdfPath,
          prefix,
        ]);

        const files = fs.readdirSync(tmpDir).filter(f => f.endsWith(".png"));
        if (files.length === 0) continue; // blank/empty page

        const filePath = path.join(tmpDir, files[0]);
        const imageBuffer = fs.readFileSync(filePath);

        // Read PNG dimensions from IHDR chunk (bytes 16–23)
        const width  = imageBuffer.readUInt32BE(16);
        const height = imageBuffer.readUInt32BE(20);

        let savedPath: string | null = null;
        if (this.pagesDir) {
          savedPath = path.join(this.pagesDir, `page-${i}.png`);
          fs.copyFileSync(filePath, savedPath);
        }

        pages.push({ pageNumber: i, imageBuffer, savedPath, width, height });
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }

      // Fire progress AFTER each page — this happens during the slow render step
      this.onProgress?.(i, total);
    }

    return pages;
  }
}
