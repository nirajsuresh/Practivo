import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Check, Star, Music, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MILESTONE_TYPES, MILESTONE_LABELS, HALL_OF_FAME_MILESTONES } from "@/lib/status-colors";
import { MILESTONE_DOT, MILESTONE_BG, MILESTONE_BORDER } from "@/lib/palette";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { MilestoneType } from "@/lib/status-colors";

export interface PieceMilestone {
  id: number;
  userId: string;
  pieceId: number;
  movementId?: number | null;
  cycleNumber: number;
  milestoneType: string;
  achievedAt: string;
  createdAt?: string;
}

interface MovementInfo {
  name: string;
  entryId: number;
  movementId?: number | null;
  everMilestone?: "completed" | "performed" | null;
  performedCount?: number;
}

interface MilestoneTimelineProps {
  milestones: PieceMilestone[];
  movements?: MovementInfo[];
  currentCycle: number;
  pieceId: number;
  userId: string;
  repertoireEntryId?: number;
  movementId?: number;
  editable?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared utilities
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function toDateInputValue(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function getCycleDateRange(milestones: PieceMilestone[]): string {
  if (!milestones.length) return "";
  const sorted = [...milestones].sort((a, b) => a.achievedAt.localeCompare(b.achievedAt));
  const first = new Date(sorted[0].achievedAt).getFullYear();
  const last = new Date(sorted[sorted.length - 1].achievedAt).getFullYear();
  return first === last ? String(first) : `${first}–${last}`;
}

function MilestoneIcon({ type }: { type: string }) {
  if (type === "performed") return <Music className="h-3 w-3" />;
  if (type === "completed") return <Star className="h-3 w-3" />;
  return <Check className="h-3 w-3" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// MilestoneRows — renders the 7 milestone slots for one movement in one cycle
// ─────────────────────────────────────────────────────────────────────────────

interface MilestoneRowsProps {
  milestones: PieceMilestone[];
  cycleNumber: number;
  isCurrent: boolean;
  editable: boolean;
  pieceId: number;
  userId: string;
  movementId?: number | null;
  milestoneQueryKey: unknown[];
  onMutationSuccess: () => void;
}

function MilestoneRows({
  milestones, cycleNumber, isCurrent, editable,
  pieceId, userId, movementId, milestoneQueryKey, onMutationSuccess,
}: MilestoneRowsProps) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: milestoneQueryKey as any[] });
    queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/repertoire"] });
    onMutationSuccess();
  };

  const upsertMutation = useMutation({
    mutationFn: (vars: { milestoneType: string; achievedAt: string }) =>
      apiRequest("POST", "/api/milestones", {
        userId, pieceId, cycleNumber,
        milestoneType: vars.milestoneType,
        achievedAt: vars.achievedAt,
        ...(movementId != null && { movementId }),
      }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/milestones/${id}`),
    onSuccess: invalidate,
  });

  const updateDateMutation = useMutation({
    mutationFn: (vars: { id: number; achievedAt: string }) =>
      apiRequest("PATCH", `/api/milestones/${vars.id}`, { achievedAt: vars.achievedAt }),
    onSuccess: invalidate,
  });

  const performedMilestones = milestones
    .filter((m) => m.milestoneType === "performed")
    .sort((a, b) => a.achievedAt.localeCompare(b.achievedAt));
  const achievedMap = new Map(milestones.filter((m) => m.milestoneType !== "performed").map(m => [m.milestoneType, m]));

  return (
    <div className="space-y-1.5">
      {MILESTONE_TYPES.map((type) => {
        const achieved = type === "performed" ? performedMilestones[0] : achievedMap.get(type);
        const isHof = HALL_OF_FAME_MILESTONES.has(type);
        const dot = MILESTONE_DOT[type];
        const bg = MILESTONE_BG[type];

        if (type === "performed") {
          const performanceCount = performedMilestones.length;
          return (
            <div
              key={type}
              className={cn(
                "px-2 py-1.5 rounded-md",
                performanceCount > 0 ? bg : "bg-transparent",
                "font-medium"
              )}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "flex-shrink-0 rounded-full flex items-center justify-center border h-6 w-6",
                    performanceCount > 0 ? "border-0 text-white" : "border-border bg-white text-muted-foreground"
                  )}
                  style={performanceCount > 0 ? { backgroundColor: dot } : {}}
                >
                  {performanceCount > 0 ? <MilestoneIcon type={type} /> : <Star className="h-3 w-3" />}
                </div>
                <span className={cn("flex-1 text-sm", performanceCount > 0 ? "text-destructive" : "text-muted-foreground")}>
                  {MILESTONE_LABELS[type]}
                </span>
                {editable ? (
                  <input
                    type="date"
                    max={new Date().toISOString().split("T")[0]}
                    className="text-xs border border-border/50 rounded px-1.5 py-0.5 bg-white text-foreground w-32"
                    onChange={(e) => {
                      if (e.target.value) {
                        upsertMutation.mutate({ milestoneType: type, achievedAt: e.target.value });
                        e.target.value = "";
                      }
                    }}
                    title="Add performed date"
                  />
                ) : performanceCount > 0 ? (
                  <span className="text-xs font-medium">{formatDate(performedMilestones[0].achievedAt)}</span>
                ) : (
                  <span className="text-xs text-muted-foreground/40">—</span>
                )}
              </div>
              {performanceCount > 0 && (
                <div className="mt-1.5 ml-8 space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Performed dates</p>
                  {performedMilestones.map((performance) => (
                    <div key={performance.id} className="flex items-center gap-1.5">
                      {editable ? (
                        <input
                          type="date"
                          max={new Date().toISOString().split("T")[0]}
                          defaultValue={toDateInputValue(performance.achievedAt)}
                          className="text-xs border border-border/50 rounded px-1.5 py-0.5 bg-white text-foreground w-32"
                          onChange={(e) => {
                            if (e.target.value) updateDateMutation.mutate({ id: performance.id, achievedAt: e.target.value });
                          }}
                          title="Update performed date"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">{formatDate(performance.achievedAt)}</span>
                      )}
                      {editable && (
                        <button
                          onClick={() => deleteMutation.mutate(performance.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors text-xs"
                          title="Remove performed date"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }

        return (
          <div key={type} className={cn(
            "flex items-center gap-2.5 px-2 py-1.5 rounded-md",
            achieved ? bg : "bg-transparent",
            isHof && "font-medium"
          )}>
            <div className={cn(
              "flex-shrink-0 rounded-full flex items-center justify-center border",
              achieved ? "border-0 text-white" : "border-border bg-white text-muted-foreground",
              isHof ? "h-6 w-6" : "h-5 w-5"
            )}
              style={achieved ? { backgroundColor: dot } : {}}
            >
              {achieved ? <MilestoneIcon type={type} /> : (
                isHof ? <Star className="h-3 w-3" /> : <span className="block w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
              )}
            </div>
            <span className={cn(
              "flex-1 text-sm",
              achieved ? "text-foreground" : "text-muted-foreground",
              isHof && achieved && (type === "completed" ? "text-accent-foreground" : "text-destructive")
            )}>
              {MILESTONE_LABELS[type]}
            </span>
            {achieved ? (
              <div className="flex items-center gap-1.5">
                {editable ? (
                  <input
                    type="date"
                    max={new Date().toISOString().split("T")[0]}
                    defaultValue={toDateInputValue(achieved.achievedAt)}
                    className="text-xs border border-border/50 rounded px-1.5 py-0.5 bg-white text-foreground w-32"
                    onChange={(e) => {
                      if (e.target.value) upsertMutation.mutate({ milestoneType: type, achievedAt: e.target.value });
                    }}
                    title={`Update ${MILESTONE_LABELS[type]} date`}
                  />
                ) : (
                  <span className={cn("text-xs", isHof ? "font-medium" : "text-muted-foreground")}>
                    {formatDate(achieved.achievedAt)}
                  </span>
                )}
                {editable && (
                  <button
                    onClick={() => deleteMutation.mutate(achieved.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors text-xs"
                    title="Remove milestone"
                  >Remove</button>
                )}
              </div>
            ) : editable ? (
              <input
                type="date"
                max={new Date().toISOString().split("T")[0]}
                className="text-xs border border-border/50 rounded px-1.5 py-0.5 bg-white text-foreground w-32"
                onChange={(e) => {
                  if (e.target.value) {
                    upsertMutation.mutate({ milestoneType: type, achievedAt: e.target.value });
                    e.target.value = "";
                  }
                }}
                title={`Mark ${MILESTONE_LABELS[type]} achieved`}
              />
            ) : (
              <span className="text-xs text-muted-foreground/40">—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CycleSection — single-movement mode: a collapsible cycle block
// ─────────────────────────────────────────────────────────────────────────────

interface CycleSectionProps {
  cycleNumber: number;
  displayNumber: number;
  milestones: PieceMilestone[];
  isCurrent: boolean;
  editable: boolean;
  pieceId: number;
  userId: string;
  movementId?: number;
  defaultOpen: boolean;
  milestoneQueryKey: unknown[];
}

function CycleSection({ cycleNumber, displayNumber, milestones, isCurrent, editable, pieceId, userId, movementId, defaultOpen, milestoneQueryKey }: CycleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const dateRange = getCycleDateRange(milestones);
  const achievedMilestoneCount = new Set(milestones.map((m) => m.milestoneType)).size;
  const isHofCycle = milestones.some(m => HALL_OF_FAME_MILESTONES.has(m.milestoneType as MilestoneType));

  return (
    <div className={cn("rounded-lg border", isHofCycle ? "border-accent/40" : "border-border/50")}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          open ? "rounded-b-none" : "",
          isHofCycle ? "bg-accent/10 hover:bg-accent/15" : "bg-muted/40 hover:bg-muted/60"
        )}
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <span>Cycle {displayNumber}</span>
          {dateRange && <span className="text-muted-foreground font-normal">({dateRange})</span>}
          {isCurrent && <span className="text-xs text-muted-foreground font-normal">current</span>}
          {isHofCycle && <Star className="h-3 w-3 text-accent fill-accent/80" />}
        </span>
        <span className="text-xs text-muted-foreground font-normal">{achievedMilestoneCount}/7 milestones</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-2 border-t border-border/30">
          <MilestoneRows
            milestones={milestones}
            cycleNumber={cycleNumber}
            isCurrent={isCurrent}
            editable={editable}
            pieceId={pieceId}
            userId={userId}
            movementId={movementId}
            milestoneQueryKey={milestoneQueryKey}
            onMutationSuccess={() => {}}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MovementSection — multi-movement mode: collapsible block for one movement
// within a cycle
// ─────────────────────────────────────────────────────────────────────────────

interface MovementSectionProps {
  movement: MovementInfo;
  cycleNumber: number;
  milestones: PieceMilestone[];
  isCurrent: boolean;
  editable: boolean;
  pieceId: number;
  userId: string;
  defaultOpen: boolean;
  milestoneQueryKey: unknown[];
}

function MovementSection({
  movement, cycleNumber, milestones, isCurrent, editable,
  pieceId, userId, defaultOpen, milestoneQueryKey,
}: MovementSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const achievedCount = new Set(milestones.map(m => m.milestoneType)).size;
  const isHof = milestones.some(m => HALL_OF_FAME_MILESTONES.has(m.milestoneType as MilestoneType));

  return (
    <div className={cn("rounded-md border", isHof ? "border-accent/30" : "border-border/40")}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
          open ? "rounded-b-none" : "",
          isHof ? "bg-accent/8 hover:bg-accent/12" : "bg-muted/30 hover:bg-muted/50"
        )}
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          <span className="text-muted-foreground font-normal">{movement.name}</span>
          {isHof && <Star className="h-2.5 w-2.5 text-accent fill-accent/80" />}
        </span>
        <span className="text-[10px] text-muted-foreground/60">{achievedCount}/7</span>
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 pt-1.5 border-t border-border/20">
          <MilestoneRows
            milestones={milestones}
            cycleNumber={cycleNumber}
            isCurrent={isCurrent}
            editable={editable}
            pieceId={pieceId}
            userId={userId}
            movementId={movement.movementId ?? undefined}
            milestoneQueryKey={milestoneQueryKey}
            onMutationSuccess={() => {}}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PieceLevelPerformed — renders just the "Performed" row for the whole piece
// (movement_id IS NULL) at the bottom of each cycle in multi-movement mode.
// Mirrors the performed section inside MilestoneRows but scoped to piece-level.
// ─────────────────────────────────────────────────────────────────────────────

interface PieceLevelPerformedProps {
  cycleNumber: number;
  milestones: PieceMilestone[]; // already filtered to pieceLevelMilestones for this cycle
  editable: boolean;
  pieceId: number;
  userId: string;
  milestoneQueryKey: unknown[];
}

function PieceLevelPerformed({
  cycleNumber, milestones, editable, pieceId, userId, milestoneQueryKey,
}: PieceLevelPerformedProps) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: milestoneQueryKey as any[] });
    queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/repertoire"] });
  };

  const addMutation = useMutation({
    mutationFn: (achievedAt: string) =>
      apiRequest("POST", "/api/milestones", { userId, pieceId, cycleNumber, milestoneType: "performed", achievedAt }),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/milestones/${id}`),
    onSuccess: invalidate,
  });
  const updateDateMutation = useMutation({
    mutationFn: (vars: { id: number; achievedAt: string }) =>
      apiRequest("PATCH", `/api/milestones/${vars.id}`, { achievedAt: vars.achievedAt }),
    onSuccess: invalidate,
  });

  const performances = milestones
    .filter(m => m.milestoneType === "performed")
    .sort((a, b) => a.achievedAt.localeCompare(b.achievedAt));
  const count = performances.length;
  const dot = MILESTONE_DOT["performed"];
  const bg = MILESTONE_BG["performed"];

  if (!editable && count === 0) return null;

  return (
    <div className={cn("px-2.5 py-1.5 rounded-md border-t border-border/20 mt-0.5", count > 0 ? bg : "bg-transparent")}>
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            "flex-shrink-0 rounded-full flex items-center justify-center border h-6 w-6",
            count > 0 ? "border-0 text-white" : "border-border bg-white text-muted-foreground"
          )}
          style={count > 0 ? { backgroundColor: dot } : {}}
        >
          {count > 0 ? <MilestoneIcon type="performed" /> : <Star className="h-3 w-3" />}
        </div>
        <span className={cn("flex-1 text-sm", count > 0 ? "text-destructive" : "text-muted-foreground")}>
          Performed <span className="italic font-normal text-xs">(whole piece)</span>
        </span>
        {editable ? (
          <input
            type="date"
            max={new Date().toISOString().split("T")[0]}
            className="text-xs border border-border/50 rounded px-1.5 py-0.5 bg-white text-foreground w-32"
            onChange={(e) => { if (e.target.value) { addMutation.mutate(e.target.value); e.target.value = ""; } }}
            title="Add whole-piece performance date"
          />
        ) : count > 0 ? (
          <span className="text-xs font-medium">{formatDate(performances[0].achievedAt)}</span>
        ) : null}
      </div>
      {count > 0 && (
        <div className="mt-1.5 ml-8 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Performance dates</p>
          {performances.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5">
              {editable ? (
                <input
                  type="date"
                  max={new Date().toISOString().split("T")[0]}
                  defaultValue={toDateInputValue(p.achievedAt)}
                  className="text-xs border border-border/50 rounded px-1.5 py-0.5 bg-white text-foreground w-32"
                  onChange={(e) => { if (e.target.value) updateDateMutation.mutate({ id: p.id, achievedAt: e.target.value }); }}
                />
              ) : (
                <span className="text-xs text-muted-foreground">{formatDate(p.achievedAt)}</span>
              )}
              {editable && (
                <button onClick={() => deleteMutation.mutate(p.id)} className="text-muted-foreground hover:text-destructive transition-colors text-xs">
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MultiMovementCycleSection — one cycle containing all movements
// ─────────────────────────────────────────────────────────────────────────────

interface MultiMovementCycleSectionProps {
  cycleNumber: number;
  displayNumber: number;
  isCurrent: boolean;
  editable: boolean;
  pieceId: number;
  userId: string;
  movements: MovementInfo[];
  milestonesByMovement: Record<string, PieceMilestone[]>;
  pieceLevelMilestones: PieceMilestone[];
  defaultOpen: boolean;
  milestoneQueryKey: unknown[];
}

function MultiMovementCycleSection({
  cycleNumber, displayNumber, isCurrent, editable, pieceId, userId,
  movements, milestonesByMovement, pieceLevelMilestones, defaultOpen, milestoneQueryKey,
}: MultiMovementCycleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  // All milestones in this cycle across all movements
  const allCycleMilestones = [
    ...pieceLevelMilestones,
    ...movements.flatMap(m => milestonesByMovement[String(m.movementId)] ?? []),
  ];
  const dateRange = getCycleDateRange(allCycleMilestones);
  const isHofCycle = allCycleMilestones.some(m => HALL_OF_FAME_MILESTONES.has(m.milestoneType as MilestoneType));

  return (
    <div className={cn("rounded-lg border", isHofCycle ? "border-accent/40" : "border-border/50")}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          open ? "rounded-b-none" : "",
          isHofCycle ? "bg-accent/10 hover:bg-accent/15" : "bg-muted/40 hover:bg-muted/60"
        )}
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <span>Cycle {displayNumber}</span>
          {dateRange && <span className="text-muted-foreground font-normal">({dateRange})</span>}
          {isCurrent && <span className="text-xs text-muted-foreground font-normal">current</span>}
          {isHofCycle && <Star className="h-3 w-3 text-accent fill-accent/80" />}
        </span>
        <span className="text-xs text-muted-foreground font-normal">{movements.length} movements</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-2 border-t border-border/30 space-y-1.5">
          {movements.map((movement, idx) => {
            const movMilestones = (milestonesByMovement[String(movement.movementId)] ?? [])
              .filter(m => m.cycleNumber === cycleNumber);
            return (
              <MovementSection
                key={movement.movementId ?? movement.entryId}
                movement={movement}
                cycleNumber={cycleNumber}
                milestones={movMilestones}
                isCurrent={isCurrent}
                editable={editable}
                pieceId={pieceId}
                userId={userId}
                defaultOpen={false}
                milestoneQueryKey={milestoneQueryKey}
              />
            );
          })}
          {/* Piece-level performed row (movement_id IS NULL) */}
          <PieceLevelPerformed
            cycleNumber={cycleNumber}
            milestones={pieceLevelMilestones}
            editable={editable}
            pieceId={pieceId}
            userId={userId}
            milestoneQueryKey={milestoneQueryKey}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MilestoneTimeline — main exported component, dual-mode
// ─────────────────────────────────────────────────────────────────────────────

export function MilestoneTimeline({
  milestones,
  movements,
  currentCycle,
  pieceId,
  userId,
  repertoireEntryId,
  movementId,
  editable = false,
}: MilestoneTimelineProps) {
  const queryClient = useQueryClient();
  const isMultiMovement = movements && movements.length > 0 && movements.some(m => m.movementId != null);

  // Build the query key based on mode
  const milestoneQueryKey = isMultiMovement
    ? [`/api/milestones/${userId}/${pieceId}`, "all-movements"]
    : [`/api/milestones/${userId}/${pieceId}`, movementId ?? "whole"];

  // ── Cycle management mutations ──────────────────────────────────────────────
  const newCycleMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/repertoire/${repertoireEntryId}/new-cycle`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: milestoneQueryKey });
      queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/repertoire"] });
    },
  });
  const removeCycleMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/repertoire/${repertoireEntryId}/remove-cycle`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: milestoneQueryKey });
      queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/repertoire"] });
    },
  });

  // ── MULTI-MOVEMENT MODE ─────────────────────────────────────────────────────
  if (isMultiMovement && movements) {
    // Separate piece-level milestones from movement-specific ones
    const pieceLevelMilestones = milestones.filter(m => m.movementId == null);

    // Group movement milestones by movementId string key, then by cycle
    const milestonesByMovement: Record<string, PieceMilestone[]> = {};
    for (const m of milestones) {
      if (m.movementId != null) {
        const key = String(m.movementId);
        if (!milestonesByMovement[key]) milestonesByMovement[key] = [];
        milestonesByMovement[key].push(m);
      }
    }

    // Find all cycle numbers across all milestones
    const cycleSet = new Set<number>([currentCycle]);
    for (const m of milestones) cycleSet.add(m.cycleNumber);
    const sortedCycles = Array.from(cycleSet).sort((a, b) => a - b);

    // Check if current cycle has any terminal milestone across any movement
    const currentMovementMilestones = milestones.filter(m => m.cycleNumber === currentCycle);
    const hasTerminalMilestone = currentMovementMilestones.some(
      m => m.milestoneType === "completed" || m.milestoneType === "performed"
    );
    const canStartNewCycle = editable && hasTerminalMilestone && !!repertoireEntryId;
    const canRemoveCurrentCycle = editable && currentCycle > 1 && !!repertoireEntryId;

    if (sortedCycles.length === 0 && !editable) {
      return <p className="text-sm text-muted-foreground">No milestones recorded yet.</p>;
    }

    return (
      <div className="space-y-2">
        {sortedCycles.map((cycle, idx) => (
          <MultiMovementCycleSection
            key={cycle}
            cycleNumber={cycle}
            displayNumber={idx + 1}
            isCurrent={cycle === currentCycle}
            editable={editable}
            pieceId={pieceId}
            userId={userId}
            movements={movements.filter(m => m.movementId != null)}
            milestonesByMovement={milestonesByMovement}
            pieceLevelMilestones={pieceLevelMilestones.filter(m => m.cycleNumber === cycle)}
            defaultOpen={cycle === currentCycle}
            milestoneQueryKey={milestoneQueryKey}
          />
        ))}

        {canStartNewCycle && (
          <Button
            variant="outline" size="sm"
            className="w-full text-muted-foreground border-dashed hover:border-solid"
            onClick={() => newCycleMutation.mutate()}
            disabled={newCycleMutation.isPending}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Start New Learning Cycle
          </Button>
        )}
        {canRemoveCurrentCycle && (
          <Button
            variant="outline" size="sm"
            className="w-full text-muted-foreground border-dashed hover:border-solid"
            onClick={() => removeCycleMutation.mutate()}
            disabled={removeCycleMutation.isPending}
          >
            Remove Current Cycle
          </Button>
        )}
        {editable && !canStartNewCycle && currentMovementMilestones.length > 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-1">
            Add a Completed or Performed milestone to any movement to unlock a new learning cycle.
          </p>
        )}
        {editable && sortedCycles.length === 1 && currentMovementMilestones.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-1">
            Expand a movement to start tracking its learning journey
          </p>
        )}
      </div>
    );
  }

  // ── SINGLE-MOVEMENT MODE (original logic) ──────────────────────────────────
  const byCycle = new Map<number, PieceMilestone[]>();
  for (const m of milestones) {
    if (!byCycle.has(m.cycleNumber)) byCycle.set(m.cycleNumber, []);
    byCycle.get(m.cycleNumber)!.push(m);
  }
  if (!byCycle.has(currentCycle)) byCycle.set(currentCycle, []);
  const sortedCycles = Array.from(byCycle.keys()).sort((a, b) => a - b);

  const currentCycleMilestones = byCycle.get(currentCycle) ?? [];
  const hasTerminalMilestone = currentCycleMilestones.some(
    m => m.milestoneType === "completed" || m.milestoneType === "performed"
  );
  const canStartNewCycle = editable && hasTerminalMilestone && !!repertoireEntryId;
  const canRemoveCurrentCycle = editable && currentCycle > 1 && !!repertoireEntryId;

  if (sortedCycles.length === 0 && !editable) {
    return <p className="text-sm text-muted-foreground">No milestones recorded yet.</p>;
  }

  return (
    <div className="space-y-2">
      {sortedCycles.map((cycle, idx) => (
        <CycleSection
          key={cycle}
          cycleNumber={cycle}
          displayNumber={idx + 1}
          milestones={byCycle.get(cycle) ?? []}
          isCurrent={cycle === currentCycle}
          editable={editable}
          pieceId={pieceId}
          userId={userId}
          movementId={movementId}
          defaultOpen={cycle === currentCycle}
          milestoneQueryKey={milestoneQueryKey}
        />
      ))}

      {canStartNewCycle && (
        <Button
          variant="outline" size="sm"
          className="w-full text-muted-foreground border-dashed hover:border-solid"
          onClick={() => newCycleMutation.mutate()}
          disabled={newCycleMutation.isPending}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-2" />
          Start New Learning Cycle
        </Button>
      )}
      {canRemoveCurrentCycle && (
        <Button
          variant="outline" size="sm"
          className="w-full text-muted-foreground border-dashed hover:border-solid"
          onClick={() => removeCycleMutation.mutate()}
          disabled={removeCycleMutation.isPending}
        >
          Remove Current Cycle
        </Button>
      )}
      {editable && !canStartNewCycle && currentCycleMilestones.length > 0 && (
        <p className="text-[11px] text-muted-foreground text-center py-1">
          Add a Completed or Performed milestone in this cycle to unlock a new learning cycle.
        </p>
      )}
      {editable && sortedCycles.length === 1 && currentCycleMilestones.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-1">
          Mark dates to track your learning journey
        </p>
      )}
    </div>
  );
}
