/**
 * PDF → page image renderer.
 * Uses pdftoppm (poppler) via child_process — reliable, no pdfjs Node.js compatibility issues.
 * No imports from Reperto application code.
 *
 * Renders pages with bounded parallelism; onProgress reports completed count.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { defaultPdfRenderConcurrency, mapWithConcurrency } from "./concurrency.js";

const execFileAsync = promisify(execFile);

/**
 * GUI-launched Node (Cursor, VS Code, macOS app) often has a minimal PATH without Homebrew.
 * Resolve pdfinfo / pdftoppm from env overrides and common install locations before relying on PATH.
 */
function resolvePopplerBinary(tool: "pdfinfo" | "pdftoppm"): string {
  const file = process.platform === "win32" ? `${tool}.exe` : tool;
  const candidates: string[] = [];

  if (tool === "pdfinfo") {
    if (process.env.REPERTO_PDFINFO_PATH) candidates.push(process.env.REPERTO_PDFINFO_PATH);
    if (process.env.PDFINFO_PATH) candidates.push(process.env.PDFINFO_PATH);
  } else {
    if (process.env.REPERTO_PDFTOPPM_PATH) candidates.push(process.env.REPERTO_PDFTOPPM_PATH);
    if (process.env.PDFTOPPM_PATH) candidates.push(process.env.PDFTOPPM_PATH);
  }

  const popplerDir = process.env.POPPLER_PATH || process.env.POPPLER_BIN;
  if (popplerDir) candidates.push(path.join(popplerDir, file));

  if (process.platform === "darwin") {
    candidates.push(path.join("/opt/homebrew/bin", file));
    candidates.push(path.join("/opt/homebrew/opt/poppler/bin", file));
    candidates.push(path.join("/usr/local/bin", file));
  }
  if (process.platform === "linux") {
    candidates.push(path.join("/usr/bin", file));
    candidates.push(path.join("/usr/local/bin", file));
  }
  if (process.platform === "win32") {
    const pf = process.env.ProgramFiles || "C:\\Program Files";
    candidates.push(path.join(pf, "poppler", "Library", "bin", file));
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* continue */
    }
  }
  return file;
}

function absolutePdfPath(pdfPath: string): string {
  return path.isAbsolute(pdfPath) ? pdfPath : path.join(process.cwd(), pdfPath);
}

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
  /** Max parallel pdftoppm invocations (default 2–4). */
  renderConcurrency?: number;
}

/** Total pages in the PDF (pdfinfo, or low-DPI render fallback). Exported for upload UI. */
export async function getPdfPageCountForPath(pdfPath: string): Promise<number> {
  const abs = absolutePdfPath(pdfPath);
  if (!fs.existsSync(abs)) {
    console.warn("[pdf-processor] PDF file not found:", abs);
    return 0;
  }

  const pdfinfoBin = resolvePopplerBinary("pdfinfo");
  try {
    const { stdout } = await execFileAsync(pdfinfoBin, [abs]);
    const match = stdout.match(/Pages:\s*(\d+)/im);
    if (match) return parseInt(match[1], 10);
  } catch (e) {
    console.warn(
      `[pdf-processor] pdfinfo (${pdfinfoBin}) failed for ${abs}:`,
      e instanceof Error ? e.message : e,
    );
  }

  const countDir = fs.mkdtempSync(path.join(os.tmpdir(), "scorebars-count-"));
  const pdftoppmBin = resolvePopplerBinary("pdftoppm");
  try {
    await execFileAsync(pdftoppmBin, ["-r", "20", "-png", abs, path.join(countDir, "p")]);
    return fs.readdirSync(countDir).filter(f => f.endsWith(".png")).length;
  } catch (e) {
    console.warn(
      `[pdf-processor] pdftoppm (${pdftoppmBin}) page-count fallback failed for ${abs}:`,
      e instanceof Error ? e.message : e,
    );
    return 0;
  } finally {
    fs.rmSync(countDir, { recursive: true, force: true });
  }
}

export class PdfProcessor {
  private dpi: number;
  private pagesDir?: string;
  private onProgress?: (page: number, total: number) => void;
  private renderConcurrency: number;

  constructor(opts: PdfProcessorOptions) {
    this.dpi = opts.dpi;
    this.pagesDir = opts.pagesDir;
    this.onProgress = opts.onProgress;
    this.renderConcurrency = opts.renderConcurrency ?? defaultPdfRenderConcurrency();
  }

  /**
   * @param pdfPageNumber 1-based page index in the source PDF (passed to pdftoppm -f/-l).
   * @param logicalPageNumber 1-based index within the excerpt; used for `page-N.png` and measure page refs.
   */
  private async renderOnePage(
    pdfPath: string,
    pdfPageNumber: number,
    logicalPageNumber: number,
  ): Promise<PageImage | null> {
    const abs = absolutePdfPath(pdfPath);
    const pdftoppmBin = resolvePopplerBinary("pdftoppm");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scorebars-pg-"));
    const prefix = path.join(tmpDir, "p");
    try {
      await execFileAsync(pdftoppmBin, [
        "-r", String(this.dpi),
        "-png",
        "-f", String(pdfPageNumber),
        "-l", String(pdfPageNumber),
        abs,
        prefix,
      ]);

      const files = fs.readdirSync(tmpDir).filter(f => f.endsWith(".png"));
      if (files.length === 0) return null;

      const filePath = path.join(tmpDir, files[0]!);
      const imageBuffer = fs.readFileSync(filePath);

      const width = imageBuffer.readUInt32BE(16);
      const height = imageBuffer.readUInt32BE(20);

      let savedPath: string | null = null;
      if (this.pagesDir) {
        savedPath = path.join(this.pagesDir, `page-${logicalPageNumber}.png`);
        fs.copyFileSync(filePath, savedPath);
      }

      return { pageNumber: logicalPageNumber, imageBuffer, savedPath, width, height };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * @param range Optional inclusive 1-based page range in the **source PDF**. Omitted = all pages.
   *        Saved PNGs and `pageNumber` in results are renumbered 1…K for the excerpt.
   */
  async renderPages(
    pdfPath: string,
    range?: { firstPdfPage: number; lastPdfPage: number },
  ): Promise<PageImage[]> {
    if (this.pagesDir && !fs.existsSync(this.pagesDir)) {
      fs.mkdirSync(this.pagesDir, { recursive: true });
    }

    let total = await getPdfPageCountForPath(pdfPath);
    if (total === 0) throw new Error("Could not determine page count for PDF");

    let first = range?.firstPdfPage ?? 1;
    let last = range?.lastPdfPage ?? total;
    first = Math.max(1, Math.min(first, total));
    last = Math.max(first, Math.min(last, total));

    const pdfIndices = Array.from({ length: last - first + 1 }, (_, k) => first + k);
    const sliceTotal = pdfIndices.length;
    let completed = 0;
    const rendered = await mapWithConcurrency(pdfIndices, this.renderConcurrency, async (pdfPageNum, idx) => {
      const logical = idx + 1;
      const page = await this.renderOnePage(pdfPath, pdfPageNum, logical);
      this.onProgress?.(++completed, sliceTotal);
      return page;
    });

    return rendered
      .filter((p): p is PageImage => p != null)
      .sort((a, b) => a.pageNumber - b.pageNumber);
  }
}
