/**
 * ScoreBars – PDF sheet music bar detection module.
 *
 * ISOLATION BOUNDARY: This module has no imports from the Practivo
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

export { type ProcessResult, type DetectedMeasure, type BoundingBox, type ScorebarOptions } from "./types.js";

export class ScorebarService {
  private pagesDir?: string;
  private renderDpi: number;
  private onProgress?: (page: number, total: number) => void;
  private pdfRenderConcurrency?: number;

  constructor(opts: ScorebarOptions = {}) {
    this.pagesDir = opts.pagesDir;
    this.renderDpi = opts.renderDpi ?? 220;
    this.onProgress = opts.onProgress;
    this.pdfRenderConcurrency = opts.pdfRenderConcurrency;
  }

  /**
   * Process a PDF file and return detected measures.
   * @param pageRange Inclusive 1-based pages in the **source PDF**; omit to use the whole file.
   *        Internal page numbers in results are always 1…K for the selected excerpt.
   */
  async processFile(
    pdfPath: string,
    pageRange?: { firstPdfPage: number; lastPdfPage: number },
  ): Promise<ProcessResult> {
    const processor = new PdfProcessor({
      dpi: this.renderDpi,
      pagesDir: this.pagesDir,
      onProgress: this.onProgress,
      renderConcurrency: this.pdfRenderConcurrency,
    });
    const pages = await processor.renderPages(pdfPath, pageRange);

    const detector = new BarDetector();

    const allMeasures = [];
    let measureNumber = 1;
    const boxesByPage = await detector.detectBarsForPages(pages);

    for (const page of pages) {
      const boxes = boxesByPage.get(page.pageNumber) ?? [];
      if (boxes.length === 0) {
        this.onProgress?.(page.pageNumber, pages.length);
        continue;
      }

      const startMn = measureNumber;
      for (let j = 0; j < boxes.length; j++) {
        const box = boxes[j]!;
        allMeasures.push({
          measureNumber: startMn + j,
          pageNumber: page.pageNumber,
          boundingBox: box,
          imageUrl: null,
        });
      }
      measureNumber += boxes.length;
      this.onProgress?.(page.pageNumber, pages.length);
    }

    return {
      pageCount: pages.length,
      measures: allMeasures,
      pageImages: pages
        .filter(p => p.savedPath !== null)
        .map(p => ({ pageNumber: p.pageNumber, imagePath: p.savedPath! })),
    };
  }
}
