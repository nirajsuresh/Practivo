/**
 * ScoreBars module types.
 *
 * This file has NO imports from the rest of the Reperto codebase.
 * All types here are self-contained so the module can be extracted independently.
 */

/** Bounding box expressed as fractions of the page dimensions (0–1). */
export interface BoundingBox {
  x: number; // left edge
  y: number; // top edge
  w: number; // width
  h: number; // height
}

/** A single detected measure (bar) from a sheet music page. */
export interface DetectedMeasure {
  measureNumber: number; // sequential 1..N across the entire score
  pageNumber: number;    // 1-indexed
  boundingBox: BoundingBox;
  imageUrl: string;      // path to cropped bar image written to disk
}

/** A saved full-page image produced during processing. */
export interface PageImage {
  pageNumber: number;
  imagePath: string; // absolute path on disk
}

/** Result returned by ScorebarService.processFile() */
export interface ProcessResult {
  pageCount: number;
  measures: DetectedMeasure[];
  pageImages: PageImage[]; // full-page PNGs, one per PDF page
}

/** Options accepted by ScorebarService constructor */
export interface ScorebarOptions {
  /** Directory to write cropped bar images. Defaults to uploads/measures/. */
  outputDir?: string;
  /** Directory to write full-page PNG images (for the review UI). */
  pagesDir?: string;
  /** DPI to render PDF pages at. Higher = more accurate detection. Default 150. */
  renderDpi?: number;
  /** Called after each page finishes processing. */
  onProgress?: (page: number, total: number) => void;
}
