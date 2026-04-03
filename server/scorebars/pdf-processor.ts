/**
 * PDF → page image renderer.
 * Uses pdftoppm (poppler) via child_process — reliable, no pdfjs Node.js compatibility issues.
 * No imports from Reperto application code.
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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scorebars-"));
    const prefix = path.join(tmpDir, "page");

    try {
      // pdftoppm -r <dpi> -png <input> <prefix>
      // Outputs: <prefix>-1.png, <prefix>-2.png, ... (zero-padded for multi-page)
      await execFileAsync("pdftoppm", [
        "-r", String(this.dpi),
        "-png",
        pdfPath,
        prefix,
      ]);

      const files = fs.readdirSync(tmpDir)
        .filter(f => f.endsWith(".png"))
        .sort();

      const total = files.length;
      const pages: PageImage[] = [];

      if (this.pagesDir && !fs.existsSync(this.pagesDir)) {
        fs.mkdirSync(this.pagesDir, { recursive: true });
      }

      for (let i = 0; i < files.length; i++) {
        const filePath = path.join(tmpDir, files[i]);
        const imageBuffer = fs.readFileSync(filePath);
        const width  = imageBuffer.readUInt32BE(16);
        const height = imageBuffer.readUInt32BE(20);

        let savedPath: string | null = null;
        if (this.pagesDir) {
          savedPath = path.join(this.pagesDir, `page-${i + 1}.png`);
          fs.copyFileSync(filePath, savedPath);
        }

        pages.push({ pageNumber: i + 1, imageBuffer, savedPath, width, height });
        this.onProgress?.(i + 1, total);
      }

      return pages;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}
