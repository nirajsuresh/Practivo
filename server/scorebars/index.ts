/**
 * ScoreBars – PDF sheet music bar detection module.
 *
 * ISOLATION BOUNDARY: This module has no imports from the Reperto
 * application (no Drizzle, no shared/schema, no Express).
 * It takes a file path, returns typed plain objects.
 *
 * To extract as a standalone service: copy this directory, wrap
 * ScorebarService in an Express router, and update the adapter in
 * server/adapters/scorebars-adapter.ts to make HTTP calls instead
 * of direct imports.
 */

import type { ProcessResult, ScorebarOptions } from "./types.js";
import { PdfProcessor } from "./pdf-processor.js";
import { BarDetector } from "./bar-detector.js";
import { ImageCrop } from "./image-crop.js";
import path from "path";
import fs from "fs";

export { type ProcessResult, type DetectedMeasure, type BoundingBox, type ScorebarOptions } from "./types.js";

export class ScorebarService {
  private outputDir: string;
  private renderDpi: number;

  constructor(opts: ScorebarOptions = {}) {
    this.outputDir = opts.outputDir ?? path.join(process.cwd(), "uploads", "measures");
    this.renderDpi = opts.renderDpi ?? 150;
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Process a PDF file and return detected measures.
   * This is the only public method — the sole integration surface.
   */
  async processFile(pdfPath: string): Promise<ProcessResult> {
    const processor = new PdfProcessor({ dpi: this.renderDpi });
    const pages = await processor.renderPages(pdfPath);

    const detector = new BarDetector();
    const cropper = new ImageCrop(this.outputDir);

    const allMeasures = [];
    let measureNumber = 1;

    for (const page of pages) {
      const boxes = await detector.detectBars(page.imageBuffer, page.width, page.height);
      for (const box of boxes) {
        const imageUrl = await cropper.crop(page.imageBuffer, page.width, page.height, box, measureNumber);
        allMeasures.push({
          measureNumber,
          pageNumber: page.pageNumber,
          boundingBox: box,
          imageUrl,
        });
        measureNumber++;
      }
    }

    return {
      pageCount: pages.length,
      measures: allMeasures,
    };
  }
}
