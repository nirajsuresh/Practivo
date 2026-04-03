/**
 * Crops a single measure bounding box from a page image and writes
 * it to disk as a PNG.
 *
 * No imports from Reperto application code.
 */

import type { BoundingBox } from "./types.js";
import { createCanvas, loadImage } from "canvas";
import path from "path";
import fs from "fs";

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

    const px = Math.floor(box.x * pageWidth);
    const py = Math.floor(box.y * pageHeight);
    const pw = Math.ceil(box.w * pageWidth);
    const ph = Math.ceil(box.h * pageHeight);

    const canvas = createCanvas(pw, ph);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, px, py, pw, ph, 0, 0, pw, ph);

    const filename = `measure_${String(measureNumber).padStart(4, "0")}.png`;
    const outPath = path.join(this.outputDir, filename);
    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(outPath, buffer);

    return outPath;
  }
}
