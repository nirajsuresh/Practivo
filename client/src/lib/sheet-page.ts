/** Public URL for a rendered PDF page image (served from /uploads). */
export function sheetPageImageUrl(sheetMusicId: number, pageNumber: number): string {
  return `/uploads/pages/${sheetMusicId}/page-${pageNumber}.png`;
}

export type NormBox = { x: number; y: number; w: number; h: number };

export function measuresUsePageGeometry(
  measures: { pageNumber?: number | null; boundingBox?: NormBox | null }[],
): boolean {
  if (measures.length === 0) return false;
  return measures.every((m) => m.pageNumber != null && m.boundingBox != null);
}
