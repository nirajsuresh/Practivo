/**
 * Crops a single measure bounding box from a page image and writes
 * it to disk as a PNG.
 *
 * No imports from Reperto application code.
 */

import type { BoundingBox } from "./types.js";
import { createCanvas, loadImage, type Image } from "canvas";
import path from "path";
import fs from "fs";

/** Extra space above/below the bar, as a fraction of the bar’s pixel height. */
const VERTICAL_MARGIN_FRAC = 0.35;

export class ImageCrop {
  constructor(private outputDir: string) {}

  /**
   * Crop the region described by `box` from `imageBuffer` and save to disk.
   * Returns the absolute path to the saved file.
   */
  async crop(
    imageBuffer: Buffer,
    pageWidth: number,
    pageHeight: number,
    box: BoundingBox,
    measureNumber: number,
  ): Promise<string> {
    const image = await loadImage(imageBuffer);
    return this.cropLoaded(image, pageWidth, pageHeight, box, measureNumber);
  }

  /**
   * Same geometry as `crop`, but reuses a decoded page image (for parallel crops per page).
   */
  cropLoaded(
    image: Image,
    pageWidth: number,
    pageHeight: number,
    box: BoundingBox,
    measureNumber: number,
  ): string {
    const iw = image.width;
    const ih = image.height;

    const px = Math.floor(box.x * pageWidth);
    const py = Math.floor(box.y * pageHeight);
    const pw = Math.ceil(box.w * pageWidth);
    const ph = Math.ceil(box.h * pageHeight);

    const marginY = Math.round(ph * VERTICAL_MARGIN_FRAC);
    let srcX = px;
    let srcY = py - marginY;
    let srcW = pw;
    let srcH = ph + 2 * marginY;

    if (srcY < 0) {
      srcH += srcY;
      srcY = 0;
    }
    if (srcY + srcH > ih) {
      srcH = ih - srcY;
    }
    if (srcX < 0) {
      srcW += srcX;
      srcX = 0;
    }
    if (srcX + srcW > iw) {
      srcW = iw - srcX;
    }

    const outW = Math.max(1, srcW);
    const outH = Math.max(1, srcH);

    const canvas = createCanvas(outW, outH);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, srcX, srcY, outW, outH, 0, 0, outW, outH);

    const filename = `measure_${String(measureNumber).padStart(4, "0")}.png`;
    const outPath = path.join(this.outputDir, filename);
    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(outPath, buffer);

    return outPath;
  }
}

/**
 * Map an on-disk path under `uploads/` to the URL path served by express.static("/uploads").
 */
export function absolutePathToPublicUrl(absPath: string, cwd: string = process.cwd()): string {
  const normalized = path.resolve(absPath);
  const uploadsRoot = path.resolve(path.join(cwd, "uploads"));
  const rel = path.relative(uploadsRoot, normalized);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    return "/uploads/" + rel.split(path.sep).join("/");
  }
  const forward = normalized.replace(/\\/g, "/");
  const idx = forward.toLowerCase().indexOf("/uploads/");
  if (idx >= 0) return forward.slice(idx);
  throw new Error(`Could not map crop path to /uploads URL: ${absPath}`);
}
