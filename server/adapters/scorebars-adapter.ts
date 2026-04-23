/**
 * ScoreBars adapter — the only place in Practivo that imports from server/scorebars/.
 *
 * To switch to a remote ScoreBars microservice later, only this file changes:
 * replace the direct import with HTTP calls to the service URL.
 */

import { ScorebarService } from "../scorebars/index.js";
import type { DetectedMeasure } from "../scorebars/types.js";
import type { InsertMeasure } from "../../shared/schema.js";

export function toInsertMeasures(
  sheetMusicId: number,
  measures: DetectedMeasure[],
): InsertMeasure[] {
  return measures.map((m) => ({
    sheetMusicId,
    measureNumber: m.measureNumber,
    pageNumber: m.pageNumber,
    boundingBox: m.boundingBox as any,
    imageUrl: m.imageUrl ?? null,
    userCorrected: false,
    confirmedAt: null,
  }));
}

// Re-export the service so routes only need to import from the adapter
export { ScorebarService };
