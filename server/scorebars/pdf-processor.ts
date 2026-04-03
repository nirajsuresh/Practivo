/**
 * PDF → page image renderer.
 * Uses pdfjs-dist (pure JS, no native deps required).
 * No imports from Reperto application code.
 */

import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";

interface PageImage {
  pageNumber: number;
  imageBuffer: Buffer;
  width: number;
  height: number;
}

interface PdfProcessorOptions {
  dpi: number;
}

export class PdfProcessor {
  private dpi: number;

  constructor(opts: PdfProcessorOptions) {
    this.dpi = opts.dpi;
  }

  async renderPages(pdfPath: string): Promise<PageImage[]> {
    // Lazy import to avoid loading pdfjs at startup
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;

    const pages: PageImage[] = [];
    const scale = this.dpi / 72; // PDF points are 72 DPI

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });

      const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
      const context = canvas.getContext("2d") as any;

      await page.render({ canvasContext: context, viewport } as any).promise;

      pages.push({
        pageNumber: i,
        imageBuffer: canvas.toBuffer("image/png"),
        width: canvas.width,
        height: canvas.height,
      });
    }

    return pages;
  }
}
