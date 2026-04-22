/**
 * Bounded parallelism for I/O + CPU-heavy work (canvas, subprocess).
 * Avoids unbounded Promise.all that can exhaust memory or thrash the event loop.
 */

import os from "os";

export function defaultCropConcurrency(): number {
  const n = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  return Math.max(2, Math.min(8, n || 4));
}

/** Concurrency for pdftoppm — each process is heavy; stay conservative. */
export function defaultPdfRenderConcurrency(): number {
  const n = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  return Math.max(2, Math.min(4, n || 2));
}

/**
 * Map items to results with at most `concurrency` in-flight async operations.
 * Preserves order of results to match `items`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const limit = Math.max(1, Math.min(concurrency, items.length));

  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i]!, i);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
