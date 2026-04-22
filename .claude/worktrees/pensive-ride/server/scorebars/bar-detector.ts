import type { BoundingBox } from "./types.js";
import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

export class BarDetector {
  private readonly pythonCmd: string;
  private readonly pythonScript: string;

  constructor() {
    this.pythonScript = path.join(process.cwd(), "server", "scorebars", "detect_bars.py");
    this.pythonCmd = this.resolvePythonCmd();
  }

  async detectBars(imageBuffer: Buffer, _width: number, _height: number): Promise<BoundingBox[]> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scorebars-"));
    try {
      const imagePath = path.join(tmpDir, "page.png");
      fs.writeFileSync(imagePath, imageBuffer);
      const raw = this.runPython([imagePath]);
      const parsed = this.parseSingle(raw);
      return this.normalizeBoxes(parsed);
    } catch (error) {
      console.warn("[scorebars] Python detector failed, using fallback grid:", error);
      return this.fallbackGrid(4);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  async detectBarsForPages(
    pages: Array<{ pageNumber: number; imageBuffer: Buffer; width: number; height: number }>,
  ): Promise<Map<number, BoundingBox[]>> {
    if (pages.length === 0) {
      return new Map();
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scorebars-"));
    try {
      const imagePaths: string[] = [];
      const pathToPage = new Map<string, number>();
      for (const page of pages) {
        const imagePath = path.join(tmpDir, `page-${page.pageNumber}.png`);
        fs.writeFileSync(imagePath, page.imageBuffer);
        imagePaths.push(imagePath);
        pathToPage.set(imagePath, page.pageNumber);
      }

      const raw = this.runPython(imagePaths);
      const parsed = this.parseBatch(raw);
      const out = new Map<number, BoundingBox[]>();
      for (const page of pages) {
        out.set(page.pageNumber, this.fallbackGrid(4));
      }

      for (const [imagePath, value] of Object.entries(parsed)) {
        const pageNumber = pathToPage.get(imagePath);
        if (pageNumber === undefined) continue;
        out.set(pageNumber, this.normalizeBoxes(value));
      }
      return out;
    } catch (error) {
      console.warn("[scorebars] Python batch detector failed, using fallback grid:", error);
      const out = new Map<number, BoundingBox[]>();
      for (const page of pages) {
        out.set(page.pageNumber, this.fallbackGrid(4));
      }
      return out;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  async detectBarsInRegion(
    imageBuffer: Buffer,
    pageWidth: number,
    pageHeight: number,
    region: BoundingBox,
  ): Promise<BoundingBox[]> {
    const image = await loadImage(imageBuffer);
    const rx = Math.floor(region.x * pageWidth);
    const ry = Math.floor(region.y * pageHeight);
    const rw = Math.ceil(region.w * pageWidth);
    const rh = Math.ceil(region.h * pageHeight);

    const cropCanvas = createCanvas(rw, rh);
    const cropCtx = cropCanvas.getContext("2d");
    cropCtx.drawImage(image, rx, ry, rw, rh, 0, 0, rw, rh);
    const cropBuffer = cropCanvas.toBuffer("image/png");

    const localBoxes = await this.detectBars(cropBuffer, rw, rh);

    return localBoxes.map(b => ({
      x: region.x + b.x * region.w,
      y: region.y + b.y * region.h,
      w: b.w * region.w,
      h: b.h * region.h,
    }));
  }

  private resolvePythonCmd(): string {
    const fromEnv = process.env.SCOREBARS_PYTHON?.trim();
    if (fromEnv) return fromEnv;
    const localVenv = path.join(process.cwd(), "server", "scorebars", ".venv", "bin", "python");
    if (fs.existsSync(localVenv)) return localVenv;
    return "python3";
  }

  private runPython(imagePaths: string[]): string {
    if (!fs.existsSync(this.pythonScript)) {
      throw new Error(`Detector script not found: ${this.pythonScript}`);
    }
    const proc = spawnSync(this.pythonCmd, [this.pythonScript, ...imagePaths], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 60_000,
      env: { ...process.env },
    });
    if (proc.error) throw proc.error;
    if (proc.status !== 0) {
      const stderr = (proc.stderr || "").trim();
      const stdout = (proc.stdout || "").trim();
      throw new Error(stderr || stdout || `Python exited with code ${proc.status}`);
    }
    return (proc.stdout || "").trim();
  }

  private parseSingle(raw: string): unknown[] {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      throw new Error(String((parsed as { error: unknown }).error));
    }
    throw new Error("Unexpected Python output for single image");
  }

  private parseBatch(raw: string): Record<string, unknown[]> {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Unexpected Python output for batch images");
    }
    if ("error" in parsed) {
      throw new Error(String((parsed as { error: unknown }).error));
    }
    return parsed as Record<string, unknown[]>;
  }

  private normalizeBoxes(raw: unknown[]): BoundingBox[] {
    const boxes: BoundingBox[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const box = item as { x?: unknown; y?: unknown; w?: unknown; h?: unknown };
      if (
        typeof box.x !== "number" ||
        typeof box.y !== "number" ||
        typeof box.w !== "number" ||
        typeof box.h !== "number"
      ) {
        continue;
      }
      const normalized = this.normalizeBox({ x: box.x, y: box.y, w: box.w, h: box.h });
      if (normalized.w > 0.003 && normalized.h > 0.02) {
        boxes.push(normalized);
      }
    }
    if (boxes.length === 0) {
      return this.fallbackGrid(4);
    }
    boxes.sort((a, b) => (Math.abs(a.y - b.y) > 0.01 ? a.y - b.y : a.x - b.x));
    return boxes;
  }

  private normalizeBox(box: BoundingBox): BoundingBox {
    const x = Number.isFinite(box.x) ? box.x : 0;
    const y = Number.isFinite(box.y) ? box.y : 0;
    const w = Number.isFinite(box.w) ? box.w : 0;
    const h = Number.isFinite(box.h) ? box.h : 0;
    const x0 = Math.min(1, Math.max(0, x));
    const y0 = Math.min(1, Math.max(0, y));
    const x1 = Math.min(1, Math.max(0, x0 + Math.max(0, w)));
    const y1 = Math.min(1, Math.max(0, y0 + Math.max(0, h)));
    return {
      x: x0,
      y: y0,
      w: Math.max(0, x1 - x0),
      h: Math.max(0, y1 - y0),
    };
  }

  private fallbackGrid(cols: number): BoundingBox[] {
    const boxes: BoundingBox[] = [];
    const cellWidth = 1 / cols;
    for (let i = 0; i < cols; i++) {
      boxes.push({ x: i * cellWidth, y: 0.1, w: cellWidth, h: 0.8 });
    }
    return boxes;
  }
}
