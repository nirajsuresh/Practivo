import type { PhaseType } from "@shared/schema";

export type WizardStep =
  | "upload" | "pageRange" | "processing" | "review"
  | "sectionMark" | "phases" | "confirm";

export type DraftSection = {
  localId: string;
  name: string;
  measureStart: number;
  measureEnd: number;
  difficulty: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  ignored?: boolean;
};

export type DraftPhase = {
  phaseType: PhaseType;
  enabled: boolean;
  repetitions: number;
  displayOrder: number;
};

export type LocalSection = {
  tempId: string;
  name: string;
  measureStart: number;
  measureEnd: number;
};

export type Zone = "hard" | "easy" | "ignore";
export type Level = 1 | 2 | 3;
export type ZoneLevel = { zone: Zone; level: Level };
export type Tempo = "slow" | "medium" | "fast" | "aggressive";

export type WizardDraft = {
  version: 2;
  repertoireEntryId: number;
  step: WizardStep;
  sheetMusicId: number | null;
  pdfSourcePageCount: number | null;
  totalMeasures: number;
  sections: DraftSection[];
  sectionPhases: Record<string, DraftPhase[]>;
  dailyMinutes: number;
  tempo: Tempo;
  cameViaCommunityScore: boolean;
  /**
   * In-progress section-mark editor state. Present while the user is in the
   * sectionMark step and may not have finalized (clicked Next) yet.
   */
  sectionMarkState?: {
    localSections: LocalSection[];
    difficulties: Record<string, ZoneLevel>;
  };
  savedAt: string;
};

function key(repertoireEntryId: number): string {
  return `practivo_wizard_draft_${repertoireEntryId}`;
}

export function loadDraft(repertoireEntryId: number): WizardDraft | null {
  try {
    const raw = localStorage.getItem(key(repertoireEntryId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardDraft;
    if (parsed.version !== 2 || parsed.repertoireEntryId !== repertoireEntryId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(
  repertoireEntryId: number,
  partial: Omit<WizardDraft, "version" | "repertoireEntryId" | "savedAt">,
): void {
  try {
    const full: WizardDraft = {
      ...partial,
      version: 2,
      repertoireEntryId,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(key(repertoireEntryId), JSON.stringify(full));
  } catch {
    // ignore quota / unavailable storage
  }
}

export function clearDraft(repertoireEntryId: number): void {
  try {
    localStorage.removeItem(key(repertoireEntryId));
  } catch {
    // ignore
  }
}

/** Only treat a draft as resumable if the user made progress past the first step. */
export function isResumable(draft: WizardDraft | null): boolean {
  if (!draft) return false;
  if (draft.step === "upload" && !draft.sheetMusicId) return false;
  return true;
}
