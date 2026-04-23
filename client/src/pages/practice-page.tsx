// Unified daily practice session — assembles tasks from all active blocks.
// Shares the same SegmentCard / scroll-snap layout as session-page.tsx.

import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUp, ArrowDown, ChevronLeft, Music2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type SessionSection, type PracticeSessionBlock } from "@shared/schema";
import {
  AnnotationPopover,
  type BarAnnotation,
} from "@/components/session-score-view";
import {
  SegmentCard,
  labelForSegment,
  type MeasureRow,
} from "@/components/session-rendering";

// ── Types ─────────────────────────────────────────────────────────────────────

type PracticeSession = {
  id: number;
  userId: string;
  sessionDate: string;
  status: string;
  blocks: PracticeSessionBlock[];
  tasks: SessionSection[];
  startedAt: string | null;
  completedAt: string | null;
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PracticePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const scrollerRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<(HTMLElement | null)[]>([]);
  const registerEl = useCallback((idx: number, el: HTMLElement | null) => {
    segmentRefs.current[idx] = el;
  }, []);

  const [activeIdx, setActiveIdx] = useState(0);
  const [annotationTarget, setAnnotationTarget] = useState<{
    measureStart: number;
    measureEnd: number;
    existing?: BarAnnotation;
  } | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: session, isLoading, isError } = useQuery<PracticeSession | null>({
    queryKey: ["/api/practice/today"],
    staleTime: 0,
  });

  const isDone = session?.status === "completed";
  const sections: SessionSection[] = session?.tasks ?? [];

  // Determine the active sheetMusicId from the current segment (piece blocks only).
  const activeSection = sections[activeIdx];
  const sheetId: number | null = activeSection?.sheetMusicId ?? null;

  // Collect all unique sheetMusicIds across piece blocks.
  const allSheetIds = Array.from(new Set(
    sections.map(s => s.sheetMusicId).filter((id): id is number => typeof id === "number")
  ));

  // Load measures for the active sheetId only (score panel switches on navigation).
  const { data: allMeasures = [] } = useQuery<MeasureRow[]>({
    queryKey: [`/api/sheet-music/${sheetId}/measures`],
    queryFn: async () => {
      if (!sheetId) return [];
      const res = await fetch(`/api/sheet-music/${sheetId}/measures`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sheetId,
  });

  // ── Local checklist state ─────────────────────────────────────────────────

  const [localSections, setLocalSections] = useState<SessionSection[] | null>(null);
  useEffect(() => {
    if (session?.tasks && session.tasks.length > 0) setLocalSections(session.tasks);
  }, [session?.tasks]);

  const activeSections = localSections ?? sections;

  const patchSections = useMutation({
    mutationFn: async (nextTasks: SessionSection[]) => {
      if (!session) return;
      await apiRequest("PATCH", `/api/practice/sessions/${session.id}`, { tasks: nextTasks });
    },
    onError: () => toast({ title: "Couldn't save task state", variant: "destructive" }),
  });

  const onToggleTask = useCallback(
    (sectionIdx: number, taskIdx: number) => {
      setLocalSections((prev) => {
        const base = prev ?? sections;
        const next = base.map((sec, si) =>
          si === sectionIdx
            ? {
                ...sec,
                tasks: sec.tasks.map((task, ti) =>
                  ti === taskIdx ? { ...task, completed: !task.completed } : task,
                ),
              }
            : sec,
        );
        patchSections.mutate(next);
        return next;
      });
    },
    [sections, patchSections],
  );

  // ── Session completion ────────────────────────────────────────────────────

  const completeSession = useMutation({
    mutationFn: async () => {
      if (!session) return;
      await apiRequest("PATCH", `/api/practice/sessions/${session.id}`, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/practice/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/home/summary"] });
      toast({ title: "Session complete", description: "Nice work — all blocks marked done." });
      navigate("/home");
    },
    onError: () => toast({ title: "Couldn't save", variant: "destructive" }),
  });

  // ── Mark session active when user starts scrolling ────────────────────────

  const markActive = useMutation({
    mutationFn: async () => {
      if (!session || session.status !== "upcoming") return;
      await apiRequest("PATCH", `/api/practice/sessions/${session.id}`, { status: "active" });
    },
  });

  // ── Scroll snap + active index ────────────────────────────────────────────

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || activeSections.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.55) {
            const idx = parseInt((entry.target as HTMLElement).dataset.segmentIdx ?? "0", 10);
            setActiveIdx(idx);
          }
        });
      },
      { root: scroller, threshold: [0.55, 0.75] },
    );
    segmentRefs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [activeSections.length]);

  // Mark active on first scroll interaction.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const handler = () => markActive.mutate();
    scroller.addEventListener("scroll", handler, { once: true });
    return () => scroller.removeEventListener("scroll", handler);
  }, [markActive]);

  const scrollTo = useCallback((idx: number) => {
    const target = Math.max(0, Math.min(activeSections.length - 1, idx));
    segmentRefs.current[target]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeSections.length]);

  // Keyboard navigation.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (e.key === "ArrowDown" || e.key === "j" || e.key === "PageDown") {
        e.preventDefault();
        scrollTo(activeIdx + 1);
      } else if (e.key === "ArrowUp" || e.key === "k" || e.key === "PageUp") {
        e.preventDefault();
        scrollTo(activeIdx - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIdx, scrollTo]);

  // ── Loading / error states ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ height: "100vh", background: "#f5f1ea", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ height: 48, background: "#0f2036" }} />
        <div style={{ flex: 1, padding: "32px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-64 w-full rounded-lg mt-4" />
        </div>
      </div>
    );
  }

  if (isError || session === undefined) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f1ea", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
        <div style={{ background: "#ede8df", border: "1px solid #ddd8cc", borderRadius: 12, padding: "24px 28px", maxWidth: 400, textAlign: "center" }}>
          <p style={{ color: "#7a7166", fontSize: 14, marginBottom: 16 }}>
            Couldn&apos;t load today&apos;s session. Please try again.
          </p>
          <Link href="/home"><button style={{ color: "#c9a86a", fontSize: 14 }}>← Go home</button></Link>
        </div>
      </div>
    );
  }

  if (session === null || activeSections.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f1ea", display: "flex", flexDirection: "column" }}>
        <PracticeTopBar isDone={false} completePending={false} onComplete={() => {}} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <p style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 28, color: "#0f2036", marginBottom: 12 }}>
              Nothing scheduled today.
            </p>
            <p style={{ fontFamily: '"EB Garamond", serif', fontSize: 15, color: "#7a7166", marginBottom: 24 }}>
              Add a learning block to start building your practice routine.
            </p>
            <Link href="/home">
              <button style={{ color: "#c9a86a", fontSize: 14, fontFamily: "Inter, sans-serif" }}>← Back to home</button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentSection = activeSections[activeIdx];
  const nextSection = activeSections[activeIdx + 1];
  const overallProgress = activeSections.length > 0 ? (activeIdx + 1) / activeSections.length : 0;

  return (
    <div style={{ height: "100vh", background: "#f5f1ea", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <PracticeTopBar
        isDone={isDone}
        completePending={completeSession.isPending}
        onComplete={() => completeSession.mutate()}
        blocks={session.blocks}
        activeSheetId={sheetId}
      />

      {/* ── Scroll snap container ─── */}
      <div
        ref={scrollerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          scrollSnapType: "y proximity",
          scrollBehavior: "smooth",
        }}
      >
        {activeSections.map((sec, idx) => {
          const prev = activeSections[idx - 1];
          const isBlockStart = idx === 0 || (sec.planId ?? null) !== (prev?.planId ?? null);
          return (
            <SegmentCard
              key={idx}
              index={idx}
              section={sec}
              registerEl={registerEl}
              effectivePhaseType={sec.phaseType ?? null}
              allMeasures={allMeasures}
              sheetId={sec.sheetMusicId ?? null}
              flaggedBars={new Map()}
              onToggleFlag={() => {}}
              annotations={[]}
              onAddAnnotation={(start, end) => setAnnotationTarget({ measureStart: start, measureEnd: end })}
              onAnnotationClick={(ann) => setAnnotationTarget({ measureStart: ann.measureStart, measureEnd: ann.measureEnd, existing: ann })}
              onToggleTask={onToggleTask}
              isLastSegment={idx === activeSections.length - 1}
              onComplete={() => completeSession.mutate()}
              completePending={completeSession.isPending}
              isDone={!!isDone}
              isBlockStart={isBlockStart}
            />
          );
        })}
        <div style={{ height: 20 }} />
      </div>

      {/* Annotation popover (piece sections only) */}
      <AnnotationPopover
        open={annotationTarget !== null}
        onOpenChange={(v) => { if (!v) setAnnotationTarget(null); }}
        measureStart={annotationTarget?.measureStart ?? 1}
        measureEnd={annotationTarget?.measureEnd ?? 1}
        initialText={annotationTarget?.existing?.text ?? ""}
        isSaving={false}
        onSave={() => setAnnotationTarget(null)}
        onDelete={undefined}
      />

      {/* ── Bottom HUD ─── */}
      <div
        style={{
          flexShrink: 0,
          height: 88,
          background: "#0f2036",
          borderTop: "1px solid rgba(201,168,106,0.25)",
          display: "flex",
          flexDirection: "column",
          zIndex: 40,
        }}
      >
        <div style={{ height: 2, background: "rgba(245,241,234,0.12)", position: "relative" }}>
          <div
            style={{
              height: "100%",
              background: "#c9a86a",
              width: `${overallProgress * 100}%`,
              transition: "width 0.25s ease",
            }}
          />
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 20px", gap: 20 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#c9a86a", marginBottom: 2 }}>
              {currentSection ? `${String(activeIdx + 1).padStart(2, "0")} · ${labelForSegment(currentSection)}` : "Session"}
            </div>
            <div
              style={{
                fontFamily: '"Cormorant Garamond", serif',
                fontSize: 17,
                color: "#f5f1ea",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {currentSection?.label ?? "—"}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {activeSections.map((sec, i) => {
              const done = sec.tasks.length > 0 && sec.tasks.every((t) => t.completed);
              const active = i === activeIdx;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => scrollTo(i)}
                  title={labelForSegment(sec)}
                  style={{
                    width: active ? 22 : 10,
                    height: 10,
                    borderRadius: 99,
                    border: "none",
                    cursor: "pointer",
                    background: active ? "#c9a86a" : done ? "rgba(114,158,143,0.9)" : "rgba(245,241,234,0.25)",
                    transition: "all 0.2s",
                    padding: 0,
                  }}
                />
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, justifyContent: "flex-end", minWidth: 0 }}>
            {nextSection ? (
              <div style={{ minWidth: 0, textAlign: "right" }}>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,241,234,0.55)", marginBottom: 2 }}>
                  Next
                </div>
                <div
                  style={{
                    fontFamily: '"Cormorant Garamond", serif',
                    fontStyle: "italic",
                    fontSize: 14,
                    color: "rgba(245,241,234,0.85)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 220,
                  }}
                >
                  {labelForSegment(nextSection)}
                </div>
              </div>
            ) : (
              <div style={{ fontFamily: '"EB Garamond", serif', fontStyle: "italic", fontSize: 13, color: "rgba(245,241,234,0.55)" }}>
                Last segment
              </div>
            )}
            <div style={{ display: "flex", gap: 4 }}>
              <button
                type="button"
                onClick={() => scrollTo(activeIdx - 1)}
                disabled={activeIdx === 0}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: "rgba(245,241,234,0.08)",
                  color: "#f5f1ea",
                  border: "1px solid rgba(245,241,234,0.18)",
                  cursor: activeIdx === 0 ? "default" : "pointer",
                  opacity: activeIdx === 0 ? 0.3 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Previous segment (↑ / k)"
              >
                <ArrowUp style={{ width: 14, height: 14 }} />
              </button>
              <button
                type="button"
                onClick={() => scrollTo(activeIdx + 1)}
                disabled={activeIdx === activeSections.length - 1}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: "rgba(201,168,106,0.18)",
                  color: "#c9a86a",
                  border: "1px solid rgba(201,168,106,0.35)",
                  cursor: activeIdx === activeSections.length - 1 ? "default" : "pointer",
                  opacity: activeIdx === activeSections.length - 1 ? 0.3 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Next segment (↓ / j)"
              >
                <ArrowDown style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Practice Top Bar ──────────────────────────────────────────────────────────

function PracticeTopBar({
  isDone,
  completePending,
  onComplete,
  blocks = [],
  activeSheetId = null,
}: {
  isDone: boolean;
  completePending: boolean;
  onComplete: () => void;
  blocks?: PracticeSessionBlock[];
  activeSheetId?: number | null;
}) {
  const totalMin = blocks.reduce((sum, b) => sum + b.timeMin, 0);
  return (
    <div
      style={{
        height: 48,
        minHeight: 48,
        background: "#0f2036",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 12,
        flexShrink: 0,
        zIndex: 50,
        borderBottom: "1px solid rgba(201,168,106,0.18)",
      }}
    >
      <Link href="/home">
        <button
          type="button"
          style={{
            color: "#f5f1ea",
            fontSize: 12,
            fontFamily: "Inter, sans-serif",
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 6px",
            borderRadius: 6,
            opacity: 0.8,
            whiteSpace: "nowrap",
          }}
        >
          <ChevronLeft style={{ width: 14, height: 14 }} /> Home
        </button>
      </Link>
      <div style={{ flex: 1, textAlign: "center", overflow: "hidden", padding: "0 8px" }}>
        <div
          style={{
            fontSize: 9,
            fontFamily: "Inter, sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "#c9a86a",
            lineHeight: 1,
            marginBottom: 3,
          }}
        >
          Today&apos;s practice
        </div>
        <div
          style={{
            fontSize: 13,
            fontFamily: '"Cormorant Garamond", serif',
            color: "#f5f1ea",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.2,
          }}
        >
          {blocks.length > 0
            ? blocks.map(b => b.blockName).join(" · ")
            : "Practice session"}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {totalMin > 0 && (
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              color: "#f5f1ea",
              background: "rgba(245,241,234,0.10)",
              borderRadius: 4,
              padding: "2px 8px",
              whiteSpace: "nowrap",
            }}
          >
            ~{totalMin} min
          </span>
        )}
        {activeSheetId != null && (
          <a
            href={`/score/${activeSheetId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "rgba(245,241,234,0.6)", display: "flex", alignItems: "center", gap: 4, fontSize: 11, textDecoration: "none" }}
            title="Open full score"
          >
            <Music2 style={{ width: 13, height: 13 }} />
          </a>
        )}
        <button
          type="button"
          onClick={() => !isDone && onComplete()}
          disabled={completePending || isDone}
          style={{
            color: isDone ? "#c9a86a" : "#f5f1ea",
            fontSize: 12,
            fontFamily: "Inter, sans-serif",
            background: "none",
            border: "none",
            cursor: isDone || completePending ? "default" : "pointer",
            padding: "4px 6px",
            borderRadius: 6,
            opacity: completePending ? 0.5 : 0.85,
            whiteSpace: "nowrap",
          }}
        >
          {isDone ? "Done ✓" : completePending ? "Saving…" : "End session"}
        </button>
      </div>
    </div>
  );
}
