import { STATUS_BADGE, STATUS_DOT } from "@/lib/palette";

export const statusBadgeColors = STATUS_BADGE;
export const statusDotColors = STATUS_DOT;

export const STATUSES = [
  "Want to learn",
  "Up next",
  "In Progress",
  "Maintaining",
  "Resting",
] as const;

export type RepertoireStatus = (typeof STATUSES)[number];

export const VALID_TRANSITIONS: Record<RepertoireStatus, RepertoireStatus[]> = {
  "Want to learn": ["Up next"],
  "Up next": ["In Progress", "Want to learn"],
  "In Progress": ["Maintaining", "Resting"],
  "Maintaining": ["In Progress", "Resting"],
  "Resting": ["In Progress", "Want to learn"],
};

// Progress bar % for non-"In Progress" statuses.
// For "In Progress", use entry.progress directly (0–100).
export const STATUS_PROGRESS: Record<RepertoireStatus, number | null> = {
  "Want to learn": 0,
  "Up next": 0,
  "In Progress": null,   // use entry.progress
  "Maintaining": 100,
  "Resting": 0,
};

export const MILESTONE_TYPES = [
  "started",
  "read_through",
  "notes_learned",
  "up_to_speed",
  "memorized",
  "completed",
  "performed",
] as const;

export type MilestoneType = (typeof MILESTONE_TYPES)[number];

export const MILESTONE_LABELS: Record<MilestoneType, string> = {
  started: "Started",
  read_through: "Read-through",
  notes_learned: "Notes Learned",
  up_to_speed: "Up to Speed",
  memorized: "Memorized",
  completed: "Completed",
  performed: "Performed",
};

// Which milestones are "Hall of Fame" caliber
export const HALL_OF_FAME_MILESTONES: Set<MilestoneType> = new Set<MilestoneType>(["completed", "performed"]);

export function getStatusColor(status: string): string {
  return statusBadgeColors[status] ?? "bg-muted text-muted-foreground";
}

export function getStatusDotColor(status: string): string {
  return statusDotColors[status] ?? "#629084";
}
