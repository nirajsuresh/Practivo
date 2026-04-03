/**
 * Bar (measure) boundary detector.
 *
 * Detects horizontal staff systems and vertical barlines from a rendered
 * page image using a projection-based approach (no ML required).
 *
 * Algorithm:
 *   1. Convert image to grayscale
 *   2. Binarise (Otsu threshold approximation)
 *   3. Horizontal projection → locate staff systems (dense black rows)
 *   4. Within each system, vertical projection → locate barlines (dense black cols)
 *   5. Pairs of adjacent barlines define a measure bounding box
 *
 * No imports from Reperto application code.
 */

import type { BoundingBox } from "./types.js";
import { createCanvas, createImageData, loadImage } from "canvas";

export class BarDetector {
  /**
   * Detect measure bounding boxes from a rendered page image buffer (PNG).
   * Returns boxes as fractions of page dimensions.
   */
  async detectBars(imageBuffer: Buffer, width: number, height: number): Promise<BoundingBox[]> {
    const image = await loadImage(imageBuffer);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, width, height);

    // Grayscale + binarise
    const binary = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      binary[i] = gray < 128 ? 1 : 0; // 1 = black pixel
    }

    // Horizontal projection: count black pixels per row
    const hProj = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      let count = 0;
      for (let x = 0; x < width; x++) {
        count += binary[y * width + x];
      }
      hProj[y] = count / width;
    }

    // Find staff system row bands (rows with many black pixels)
    const STAFF_THRESH = 0.02;
    const systems = this.findBands(hProj, STAFF_THRESH, height * 0.05);

    const boxes: BoundingBox[] = [];

    for (const [sysTop, sysBottom] of systems) {
      // Vertical projection within this system band
      const vProj = new Float32Array(width);
      const bandH = sysBottom - sysTop;
      for (let x = 0; x < width; x++) {
        let count = 0;
        for (let y = sysTop; y < sysBottom; y++) {
          count += binary[y * width + x];
        }
        vProj[x] = count / bandH;
      }

      // Find barline columns (dense vertical black runs)
      const BARLINE_THRESH = 0.6;
      const barlines = this.findBarlinePositions(vProj, BARLINE_THRESH);

      // Pair adjacent barlines into measure boxes
      for (let i = 0; i < barlines.length - 1; i++) {
        const left = barlines[i] / width;
        const right = barlines[i + 1] / width;
        const top = sysTop / height;
        const bottom = sysBottom / height;
        const w = right - left;
        const h = bottom - top;
        // Filter out very thin slivers (likely double barlines)
        if (w > 0.02) {
          boxes.push({ x: left, y: top, w, h });
        }
      }
    }

    // Fallback: if no bars detected, return whole-page placeholder boxes
    if (boxes.length === 0) {
      return this.fallbackGrid(4);
    }

    return boxes;
  }

  /**
   * Find contiguous bands in a 1D projection where value > threshold,
   * returning [start, end] pairs, ignoring bands smaller than minSize.
   */
  private findBands(proj: Float32Array, threshold: number, minSize: number): [number, number][] {
    const bands: [number, number][] = [];
    let inBand = false;
    let start = 0;
    for (let i = 0; i < proj.length; i++) {
      if (!inBand && proj[i] > threshold) {
        inBand = true;
        start = i;
      } else if (inBand && proj[i] <= threshold) {
        inBand = false;
        if (i - start >= minSize) {
          // Add a small margin around the system
          bands.push([Math.max(0, start - 5), Math.min(proj.length - 1, i + 5)]);
        }
      }
    }
    return bands;
  }

  /**
   * Find x-positions of barlines from a vertical projection.
   * Returns pixel x-coordinates of detected barline centres.
   */
  private findBarlinePositions(vProj: Float32Array, threshold: number): number[] {
    const positions: number[] = [];
    let inBarline = false;
    let start = 0;
    for (let x = 0; x < vProj.length; x++) {
      if (!inBarline && vProj[x] > threshold) {
        inBarline = true;
        start = x;
      } else if (inBarline && vProj[x] <= threshold) {
        inBarline = false;
        positions.push(Math.floor((start + x) / 2));
      }
    }
    return positions;
  }

  /** Return a simple N-column grid as fallback when detection fails. */
  private fallbackGrid(cols: number): BoundingBox[] {
    const boxes: BoundingBox[] = [];
    const w = 1 / cols;
    for (let i = 0; i < cols; i++) {
      boxes.push({ x: i * w, y: 0.1, w, h: 0.8 });
    }
    return boxes;
  }
}
