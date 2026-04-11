import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/queryClient";

/** Returns a function that maps pageNumber → R2 image URL for the given sheet music. */
export function useSheetPageUrl(sheetMusicId: number | null | undefined): (pageNumber: number) => string {
  const { data: pages = [] } = useQuery<{ pageNumber: number; imageUrl: string }[]>({
    queryKey: [`/api/sheet-music/${sheetMusicId}/pages`],
    queryFn: async () => {
      if (!sheetMusicId) return [];
      const res = await fetch(`/api/sheet-music/${sheetMusicId}/pages`, { headers: getAuthHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: sheetMusicId != null && sheetMusicId > 0,
  });
  const map = new Map(pages.map((p) => [p.pageNumber, p.imageUrl]));
  return (pageNumber: number) => map.get(pageNumber) ?? "";
}

export type NormBox = { x: number; y: number; w: number; h: number };

export function measuresUsePageGeometry(
  measures: { pageNumber?: number | null; boundingBox?: NormBox | null }[],
): boolean {
  if (measures.length === 0) return false;
  return measures.every((m) => m.pageNumber != null && m.boundingBox != null);
}
