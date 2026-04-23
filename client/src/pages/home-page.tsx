import { Layout } from "@/components/layout";
import { AddPieceDialog, type NewPieceData } from "@/components/add-piece-dialog";
import { AddBlockDialog } from "@/components/add-block-dialog";
import {
  ScorePickerDialog, BarDetectionFlow, MarkSectionsFlow, GeneratePlanDialog,
  ContributeExistingScoreDialog,
  type PieceSetupState, type PieceSetupContext,
} from "@/components/piece-setup-flows";
import { PieceSetupChecklist, type ChecklistStep } from "@/components/piece-setup-checklist";
import { SessionHero } from "@/components/session-hero";
import { Link, useLocation } from "wouter";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Plus, GripVertical, Music, Dumbbell, Shuffle, Trash2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Design tokens ────────────────────────────────────────────────────────────
const CREAM = "#f5f1ea";
const CREAM_DEEP = "#ede8df";
const CREAM_WARM = "#fffbf2";
const BORDER = "#ddd8cc";
const NAVY = "#0f2036";
const GOLD = "#c9a86a";
const GOLD_DARK = "#96793a";
const GOLD_SOFT = "rgba(201,168,106,0.65)";
const MUTED = "#7a7166";

// ─── Types ────────────────────────────────────────────────────────────────────
type Stats = {
  streak: number;
  longestStreak: number;
  weekMinutes: number;
  weekGoal: number;
  sessionsThisWeek: number;
  sessionsGoal: number;
  piecesInProgress: number;
  composers: number;
  phasesCleared: number;
  practiceHistory: { date: string; minutes: number }[];
};

type HomeSummary = { stats: Stats };

type ActiveMeasure = {
  measureNumber: number;
  pageNumber: number;
  boundingBox: { x: number; y: number; w: number; h: number } | null;
};

type Block = {
  planId: number;
  blockType: "piece" | "exercise" | "sight_reading";
  blockName: string;
  composerName: string | null;
  composerImageUrl: string | null;
  pieceTitle: string | null;
  movementName: string | null;
  cadence: "daily" | "weekdays" | "weekends" | "custom";
  cadenceDays: number[] | null;
  sortOrder: number;
  timeMin: number;
  sheetMusicId: number | null;
  setupState: PieceSetupState;
  sectionsSkipped: boolean;
  totalMeasures: number | null;
  pieceId: number | null;
  movementId: number | null;
  dayNumber: number | null;
  totalDays: number | null;
  progressPercent: number | null;
  daysRemaining: number | null;
  todayPageNumbers: number[];
  totalPages: number | null;
  todayMeasureRange: string | null;
  todayActiveMeasures: ActiveMeasure[];
  isScheduledToday: boolean;
  todayFocus: string | null;
  lessonDayStatus: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatFullDate(): string {
  const d = new Date();
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const CADENCE_LABELS: Record<string, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekends: "Weekends",
  custom: "Custom",
};

// ─── Small UI primitives ──────────────────────────────────────────────────────
function Eyebrow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: "Inter, sans-serif",
        fontSize: 11,
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.15em",
        color: MUTED,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function Flame({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 3 C16 3 11 8 11 13 C11 15.5 12 17 12 17 C10.5 17 8 16 8 13 C6.5 15 6 17.5 6 20 C6 25.5 10.5 29 16 29 C21.5 29 26 25.5 26 20 C26 14 20 12 20 8 C20 6 19 4.5 16 3 Z"
        fill={GOLD}
        stroke={GOLD_DARK}
        strokeWidth="0.8"
      />
      <path
        d="M16 13 C14 15 13 17 13 19 C13 22 14.5 24 16 24 C17.5 24 19 22 19 19 C19 17 17.5 15 16 13 Z"
        fill="#fdf1cf"
      />
    </svg>
  );
}

function BarChart({ data, w, h, goal }: { data: { date: string; minutes: number }[]; w: number; h: number; goal: number }) {
  const max = Math.max(goal, ...data.map((d) => d.minutes), 10);
  const barGap = 2;
  const barWidth = (w - barGap * (data.length - 1)) / data.length;
  const goalY = h - (goal / max) * h;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <line x1={0} x2={w} y1={goalY} y2={goalY} stroke={GOLD} strokeWidth="0.6" strokeDasharray="2 2" opacity="0.6" />
      {data.map((d, i) => {
        const barH = (d.minutes / max) * h;
        const x = i * (barWidth + barGap);
        const y = h - barH;
        return (
          <rect
            key={d.date} x={x} y={y} width={barWidth} height={barH}
            fill={d.minutes >= goal ? GOLD_DARK : GOLD_SOFT} rx={0.8}
          />
        );
      })}
    </svg>
  );
}

// ─── StatsRail ────────────────────────────────────────────────────────────────
function StatsRail({ stats }: { stats: Stats }) {
  const cell = (label: string, value: React.ReactNode, sub?: string) => (
    <div style={{ flex: 1, padding: "16px 20px", borderRight: `1px solid rgba(15,32,54,0.08)` }}>
      <Eyebrow style={{ fontSize: 9, display: "block", marginBottom: 6 }}>{label}</Eyebrow>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, lineHeight: 1, color: NAVY, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 6, fontStyle: "italic", fontFamily: "'Cormorant Garamond', serif" }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ background: CREAM_WARM, border: `1px solid ${BORDER}`, borderRadius: 12, display: "flex", alignItems: "stretch", overflow: "hidden" }}>
      <div style={{ flex: 1, padding: "16px 20px", borderRight: `1px solid rgba(15,32,54,0.08)`, background: CREAM_DEEP, display: "flex", alignItems: "center", gap: 12 }}>
        <Flame size={32} />
        <div>
          <Eyebrow style={{ fontSize: 9, display: "block", marginBottom: 2 }}>Current streak</Eyebrow>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, lineHeight: 1, color: NAVY, letterSpacing: "-0.02em" }}>
            {stats.streak}{" "}
            <span style={{ fontSize: 13, fontStyle: "italic", color: MUTED }}>{stats.streak === 1 ? "day" : "days"}</span>
          </div>
          <div style={{ fontSize: 10, color: MUTED, marginTop: 3, letterSpacing: "0.05em" }}>Longest · {stats.longestStreak}d</div>
        </div>
      </div>
      {cell("This week", `${stats.weekMinutes}m`, `of ${stats.weekGoal}m goal`)}
      {cell("Sessions", `${stats.sessionsThisWeek}/${stats.sessionsGoal}`, "this week")}
      {cell("In progress", stats.piecesInProgress, `across ${stats.composers} composer${stats.composers === 1 ? "" : "s"}`)}
      {cell("Phases cleared", stats.phasesCleared, "all-time")}
      <div style={{ flex: 1.4, padding: "10px 20px 8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 2 }}>
          <Eyebrow style={{ fontSize: 9 }}>Last 14 days</Eyebrow>
          <span style={{ fontSize: 10, color: MUTED }}>min/day</span>
        </div>
        <BarChart data={stats.practiceHistory} w={260} h={48} goal={35} />
      </div>
    </div>
  );
}

// ─── Block icon ───────────────────────────────────────────────────────────────
function BlockIcon({ blockType }: { blockType: Block["blockType"] }) {
  const icons = {
    piece: <Music size={16} />,
    exercise: <Dumbbell size={16} />,
    sight_reading: <Shuffle size={16} />,
  };
  return icons[blockType] ?? <Music size={16} />;
}

// ─── Shared bits ──────────────────────────────────────────────────────────────
// ─── Sortable block card (simple horizontal row) ─────────────────────────────
function SortableBlockCard({
  block,
  isDragging,
  onChecklistStep,
  onDelete,
  onContribute,
}: {
  block: Block;
  isDragging: boolean;
  onChecklistStep: (block: Block, step: ChecklistStep) => void;
  onDelete: (block: Block) => void;
  onContribute: (block: Block) => void;
}) {
  const [, navigate] = useLocation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSelf,
  } = useSortable({ id: block.planId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSelf ? 0.4 : 1,
    zIndex: isSelf ? 999 : undefined,
  };

  const inSetup = block.blockType === "piece" && block.setupState !== "complete";

  return (
    <div ref={setNodeRef} style={style}>
      <div
        style={{
          background: CREAM_WARM,
          border: `1px solid ${block.isScheduledToday ? BORDER : "rgba(221,216,204,0.6)"}`,
          borderRadius: 10,
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 0,
          opacity: block.isScheduledToday || inSetup ? 1 : 0.65,
          transition: "box-shadow 0.15s",
          boxShadow: isDragging && isSelf ? "0 8px 24px rgba(0,0,0,0.12)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Drag handle */}
          <div
            {...attributes}
            {...(listeners ?? {})}
            style={{
              cursor: "grab",
              color: MUTED,
              display: "flex",
              alignItems: "center",
              padding: "4px 2px",
              touchAction: "none",
              flexShrink: 0,
            }}
          >
            <GripVertical size={16} style={{ opacity: 0.5 }} />
          </div>

          {/* Icon */}
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: CREAM_DEEP,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: GOLD_DARK,
            flexShrink: 0,
          }}>
            <BlockIcon blockType={block.blockType} />
          </div>

          {/* Name + focus */}
          <div
            style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
            onClick={() => navigate(`/plan/${block.planId}`)}
          >
            {block.blockType === "piece" && block.composerName && !inSetup ? (
              <>
                <div style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 9,
                  fontWeight: 500,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: MUTED,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  marginBottom: 2,
                }}>
                  {block.composerName}
                </div>
                <div style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 17,
                  color: NAVY,
                  fontWeight: 400,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  lineHeight: 1.15,
                }}>
                  {block.pieceTitle}
                </div>
                {block.movementName && (
                  <div style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: 12,
                    fontStyle: "italic",
                    color: MUTED,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    marginTop: 1,
                  }}>
                    {block.movementName}
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 17,
                  color: NAVY,
                  fontWeight: 400,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {block.blockName}
                </div>
                {block.todayFocus && (
                  <div style={{
                    fontSize: 11,
                    color: MUTED,
                    fontFamily: "'Cormorant Garamond', serif",
                    fontStyle: "italic",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    marginTop: 1,
                  }}>
                    {block.todayFocus}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {inSetup ? (
              <span style={{
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 999,
                background: "rgba(201,168,106,0.15)",
                color: GOLD_DARK,
                fontWeight: 500,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}>
                In setup
              </span>
            ) : (
              <>
                {!block.isScheduledToday && (
                  <span style={{
                    fontSize: 10,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "rgba(15,32,54,0.06)",
                    color: MUTED,
                    fontWeight: 500,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}>
                    Optional today
                  </span>
                )}
                <span style={{
                  fontSize: 10,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: CREAM_DEEP,
                  color: MUTED,
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}>
                  {CADENCE_LABELS[block.cadence] ?? block.cadence}
                </span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: GOLD_DARK,
                  background: "rgba(201,168,106,0.1)",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}>
                  {block.timeMin}m
                </span>
              </>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(block);
              }}
              title="Delete block"
              aria-label="Delete block"
              style={{
                marginLeft: 2,
                background: "transparent",
                border: "none",
                padding: 4,
                borderRadius: 6,
                cursor: "pointer",
                color: MUTED,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.6,
                transition: "opacity 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "1";
                e.currentTarget.style.color = "#b0413e";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "0.6";
                e.currentTarget.style.color = MUTED;
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {inSetup && (
          <PieceSetupChecklist
            setupState={block.setupState}
            sectionsSkipped={block.sectionsSkipped}
            onStepClick={(step) => onChecklistStep(block, step)}
          />
        )}
        {block.blockType === "piece"
          && block.pieceId != null
          && block.sheetMusicId != null
          && block.setupState !== "needs_score"
          && block.setupState !== "needs_bars" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onContribute(block);
            }}
            style={{
              marginTop: inSetup ? 8 : 10,
              alignSelf: "flex-start",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              color: GOLD_DARK,
              border: `1px dashed ${GOLD_SOFT}`,
              borderRadius: 999,
              padding: "4px 10px",
              fontFamily: "Inter, sans-serif",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.02em",
              cursor: "pointer",
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,168,106,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <Users size={12} /> Contribute to community
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main HomePage ────────────────────────────────────────────────────────────
export default function HomePage() {
  const [, navigate] = useLocation();
  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: summary } = useQuery<HomeSummary>({
    queryKey: ["/api/home/summary"],
    enabled: !!userId,
    staleTime: 30_000,
  });

  const { data: rawBlocks = [], isLoading: blocksLoading } = useQuery<Block[]>({
    queryKey: ["/api/blocks"],
    enabled: !!userId,
    staleTime: 0,
  });

  // Local order maintained for optimistic drag-and-drop updates
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);

  const blocks = useMemo(() => {
    if (localOrder) {
      const map = new Map(rawBlocks.map((b) => [b.planId, b]));
      return localOrder.map((id) => map.get(id)).filter(Boolean) as Block[];
    }
    return [...rawBlocks].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [rawBlocks, localOrder]);

  const reorder = useMutation({
    mutationFn: async (updates: { id: number; sortOrder: number }[]) => {
      await apiRequest("PATCH", "/api/learning-plans/reorder", updates);
    },
    onError: () => {
      toast({ title: "Couldn't save order", variant: "destructive" });
      setLocalOrder(null); // revert
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
    },
  });

  const deleteBlock = useMutation({
    mutationFn: async (planId: number) => {
      await apiRequest("DELETE", `/api/learning-plans/${planId}`);
    },
    onSuccess: () => {
      setLocalOrder(null);
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/home/summary"] });
      toast({ title: "Block deleted" });
    },
    onError: () => {
      toast({ title: "Couldn't delete block", variant: "destructive" });
    },
  });

  const handleDeleteBlock = (block: Block) => {
    const label = block.blockType === "piece"
      ? (block.pieceTitle ?? block.blockName)
      : block.blockName;
    if (!window.confirm(`Delete "${label}"? This removes the learning plan and all its lessons.`)) return;
    deleteBlock.mutate(block.planId);
  };

  const [contributeBlock, setContributeBlock] = useState<Block | null>(null);
  const handleContributeBlock = (block: Block) => setContributeBlock(block);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeDragId, setActiveDragId] = useState<number | null>(null);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldOrder = blocks.map((b) => b.planId);
    const oldIdx = oldOrder.indexOf(active.id as number);
    const newIdx = oldOrder.indexOf(over.id as number);
    const newOrder = arrayMove(oldOrder, oldIdx, newIdx);
    setLocalOrder(newOrder);

    reorder.mutate(newOrder.map((id, i) => ({ id, sortOrder: i })));
  };

  const [addPieceOpen, setAddPieceOpen] = useState(false);
  const [addBlockOpen, setAddBlockOpen] = useState(false);

  // Active piece-setup flow state
  const [activeFlow, setActiveFlow] = useState<
    | { kind: "score"; context: PieceSetupContext }
    | { kind: "bars"; context: PieceSetupContext }
    | { kind: "sections"; context: PieceSetupContext }
    | { kind: "generate"; context: PieceSetupContext }
    | null
  >(null);

  const buildContext = (
    block: Block,
    extras?: Partial<PieceSetupContext>,
  ): PieceSetupContext => ({
    planId: block.planId,
    pieceId: block.pieceId,
    movementId: block.movementId,
    pieceTitle: block.blockName,
    sheetMusicId: block.sheetMusicId,
    totalMeasures: block.totalMeasures,
    userId: userId ?? "",
    ...extras,
  });

  const handleChecklistStep = (block: Block, step: ChecklistStep) => {
    const ctx = buildContext(block);
    if (step === "score") setActiveFlow({ kind: "score", context: ctx });
    else if (step === "bars") setActiveFlow({ kind: "bars", context: ctx });
    else if (step === "sections") setActiveFlow({ kind: "sections", context: ctx });
    else if (step === "generate") setActiveFlow({ kind: "generate", context: ctx });
  };

  const handleAddPiece = async (piece: NewPieceData) => {
    const startedDate = piece.date === "—" ? null : piece.date;
    try {
      const createDraftPlan = async (repertoireEntryId: number) => {
        await apiRequest("POST", "/api/learning-plans", {
          repertoireEntryId,
          dailyPracticeMinutes: 30,
          status: "setup",
          setupState: "needs_score",
          blockType: "piece",
          cadence: "daily",
          schedulerVersion: 1,
        });
      };

      if (piece.movementIds.length > 0) {
        const responses = await Promise.all(
          piece.movementIds.map((movementId) =>
            apiRequest("POST", "/api/repertoire", {
              userId, composerId: piece.composerId, pieceId: piece.pieceId,
              movementId, status: piece.status, startedDate,
            }),
          ),
        );
        const entries = await Promise.all(
          responses.map((r) => r.json() as Promise<{ id?: number }>),
        );
        for (const e of entries) {
          if (e?.id) await createDraftPlan(e.id);
        }
      } else {
        const res = await apiRequest("POST", "/api/repertoire", {
          userId, composerId: piece.composerId, pieceId: piece.pieceId,
          status: piece.status, startedDate,
        });
        const result = await res.json() as { id?: number };
        if (result?.id) await createDraftPlan(result.id);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/home/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
    } catch (err) {
      console.error("Failed to add piece:", err);
    }
  };

  const firstName = localStorage.getItem("firstName") || localStorage.getItem("username") || "";
  const isNewUser = localStorage.getItem("isNewUser") === "true";
  if (isNewUser) localStorage.removeItem("isNewUser");
  const greeting = getGreeting();
  const weekday = WEEKDAY_LONG[new Date().getDay()];
  const stats = summary?.stats;

  if (!userId) return null;

  return (
    <Layout>
      <div style={{ minHeight: "100vh", background: CREAM, paddingBottom: 80, fontFamily: "Inter, sans-serif" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 40px 0" }}>

          {/* HEADER */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24, marginBottom: 28, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Eyebrow style={{ marginBottom: 6, display: "block" }}>{greeting}</Eyebrow>
              <h1 style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 44, margin: 0, fontWeight: 400,
                color: NAVY, letterSpacing: "-0.02em", lineHeight: 1.05,
              }}>
                {firstName ? `${firstName}, ` : ""}
                <span style={{ fontStyle: "italic", color: GOLD_DARK }}>
                  {isNewUser ? "welcome." : "welcome back."}
                </span>
              </h1>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <Eyebrow>{weekday}</Eyebrow>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: NAVY, marginTop: 2, whiteSpace: "nowrap" }}>
                {formatFullDate()}
              </div>
            </div>
          </div>

          {/* STATS RAIL */}
          {stats && (
            <div style={{ marginBottom: 32 }}>
              <StatsRail stats={stats} />
            </div>
          )}

          {/* SESSION HERO */}
          {blocks.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <SessionHero
                blocks={blocks.map((b) => ({
                  planId: b.planId,
                  blockType: b.blockType,
                  blockName: b.blockName,
                  composerName: b.composerName,
                  composerImageUrl: b.composerImageUrl,
                  pieceTitle: b.pieceTitle,
                  movementName: b.movementName,
                  timeMin: b.timeMin,
                  sheetMusicId: b.sheetMusicId,
                  dayNumber: b.dayNumber,
                  totalDays: b.totalDays,
                  progressPercent: b.progressPercent,
                  daysRemaining: b.daysRemaining,
                  todayPageNumbers: b.todayPageNumbers,
                  totalPages: b.totalPages,
                  todayMeasureRange: b.todayMeasureRange,
                  todayActiveMeasures: b.todayActiveMeasures,
                  todayFocus: b.todayFocus,
                  isScheduledToday: b.isScheduledToday,
                  inSetup: b.blockType === "piece" && b.setupState !== "complete",
                }))}
                onStart={() => navigate("/practice")}
              />
            </div>
          )}

          {/* BLOCK LIST */}
          {blocksLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1, 2].map((i) => (
                <div key={i} style={{ height: 64, background: CREAM_WARM, borderRadius: 10, border: `1px solid ${BORDER}`, opacity: 0.5 }} />
              ))}
            </div>
          ) : blocks.length === 0 ? (
            <div style={{
              background: CREAM_WARM,
              border: `1px dashed ${BORDER}`,
              borderRadius: 12,
              padding: "40px 32px",
              textAlign: "center",
            }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: NAVY, marginBottom: 6, fontStyle: "italic" }}>
                Add your first learning block
              </div>
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 20 }}>
                Blocks are practice containers — a piece, exercises, or sight-reading — each with their own schedule.
              </div>
              <button
                type="button"
                onClick={() => setAddBlockOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: NAVY,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 22px",
                  fontFamily: "Inter, sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <Plus size={15} strokeWidth={2.5} /> Add learning block
              </button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              onDragStart={(e) => setActiveDragId(e.active.id as number)}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={blocks.map((b) => b.planId)} strategy={verticalListSortingStrategy}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {blocks.map((block) => (
                    <SortableBlockCard
                      key={block.planId}
                      block={block}
                      isDragging={activeDragId !== null}
                      onChecklistStep={handleChecklistStep}
                      onDelete={handleDeleteBlock}
                      onContribute={handleContributeBlock}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* ADD BLOCK BUTTON (when blocks exist) */}
          {blocks.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setAddBlockOpen(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "transparent",
                  color: MUTED,
                  border: `1px dashed ${BORDER}`,
                  borderRadius: 8,
                  padding: "10px 18px",
                  fontFamily: "Inter, sans-serif",
                  fontSize: 13,
                  cursor: "pointer",
                  width: "100%",
                  justifyContent: "center",
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = GOLD;
                  e.currentTarget.style.color = GOLD_DARK;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = BORDER;
                  e.currentTarget.style.color = MUTED;
                }}
              >
                <Plus size={14} strokeWidth={2.5} /> Add learning block
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Dialogs */}
      <AddBlockDialog
        open={addBlockOpen}
        onOpenChange={setAddBlockOpen}
        onPieceSelected={() => setAddPieceOpen(true)}
      />

      <AddPieceDialog
        open={addPieceOpen}
        onOpenChange={setAddPieceOpen}
        onAdd={handleAddPiece}
      />

      {activeFlow?.kind === "score" && (
        <ScorePickerDialog
          open
          onOpenChange={(v) => !v && setActiveFlow(null)}
          context={activeFlow.context}
          onComplete={() => {
            setActiveFlow(null);
            queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
          }}
        />
      )}
      {activeFlow?.kind === "bars" && (
        <BarDetectionFlow
          context={activeFlow.context}
          onComplete={() => {
            setActiveFlow(null);
            queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
          }}
          onCancel={() => setActiveFlow(null)}
        />
      )}
      {activeFlow?.kind === "sections" && (
        <MarkSectionsFlow
          context={activeFlow.context}
          onComplete={() => {
            setActiveFlow(null);
            queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
          }}
          onCancel={() => setActiveFlow(null)}
        />
      )}
      {activeFlow?.kind === "generate" && (
        <GeneratePlanDialog
          open
          onOpenChange={(v) => !v && setActiveFlow(null)}
          context={activeFlow.context}
          onComplete={(pid) => {
            setActiveFlow(null);
            queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
            queryClient.invalidateQueries({ queryKey: ["/api/home/summary"] });
            if (pid) navigate(`/plan/${pid}`);
          }}
        />
      )}
      {contributeBlock && (
        <ContributeExistingScoreDialog
          open
          onOpenChange={(v) => !v && setContributeBlock(null)}
          context={buildContext(contributeBlock)}
        />
      )}
    </Layout>
  );
}
