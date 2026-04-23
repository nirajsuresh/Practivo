import { useParams, Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  Music2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type SessionSection } from "@shared/schema";
import { SessionFeedbackModal } from "@/components/session-feedback-modal";
import { AnnotationPopover, type BarAnnotation } from "@/components/session-score-view";
import {
  SegmentCard,
  labelForSegment,
  type MeasureRow,
} from "@/components/session-rendering";

// ── Types ────────────────────────────────────────────────────────────────────

type LessonDay = {
  id: number;
  learningPlanId: number;
  scheduledDate: string;
  measureStart: number;
  measureEnd: number;
  status: string;
  userNotes: string | null;
  completedAt: string | null;
  tasks: SessionSection[] | null;
  sectionId: number | null;
  phaseType: string | null;
  sectionName: string | null;
};

type BarFlag = { id: number; measureId: number; note: string | null; resolved: boolean };

type LearningPlan = {
  id: number;
  dailyPracticeMinutes: number;
  targetCompletionDate: string | null;
  sheetMusicId: number | null;
};

type SessionBundle = {
  lesson: LessonDay;
  plan: LearningPlan;
  pieceTitle: string;
  composerName: string;
  dayIndex: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSessionDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ── Main Page ────────────────────────────────────────────────────────────────
// SegmentCard + PlaceholderPanel live in @/components/session-rendering

export default function SessionPage() {
  const params = useParams<{ lessonId: string }>();
  const lessonId = parseInt(params.lessonId ?? "", 10);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const scrollerRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<(HTMLElement | null)[]>([]);
  const registerEl = useCallback((idx: number, el: HTMLElement | null) => {
    segmentRefs.current[idx] = el;
  }, []);

  const [activeIdx, setActiveIdx] = useState(0);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [flaggedBars, setFlaggedBars] = useState<Map<number, number>>(new Map());
  const [annotationTarget, setAnnotationTarget] = useState<{
    measureStart: number;
    measureEnd: number;
    existing?: BarAnnotation;
  } | null>(null);

  // ── Queries ─────────────────────────────────────────────
  const { data: bundle, isLoading, isError } = useQuery<SessionBundle>({
    queryKey: [`/api/lessons/${lessonId}/session`],
    enabled: Number.isFinite(lessonId) && lessonId > 0,
  });

  const sheetId = bundle?.plan.sheetMusicId ?? null;
  const planId = bundle?.plan.id;
  const isDone = bundle?.lesson.status === "completed";
  const sections = bundle?.lesson.tasks ?? [];

  const { data: allMeasures = [] } = useQuery<MeasureRow[]>({
    queryKey: [`/api/sheet-music/${sheetId}/measures`],
    queryFn: async () => {
      if (!sheetId) return [];
      const res = await fetch(`/api/sheet-music/${sheetId}/measures`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sheetId && !!bundle,
  });

  const { data: existingFlags = [] } = useQuery<BarFlag[]>({
    queryKey: [`/api/lessons/${lessonId}/flags`],
    enabled: Number.isFinite(lessonId) && lessonId > 0 && !!bundle,
  });

  useEffect(() => {
    if (existingFlags.length > 0) {
      setFlaggedBars(new Map(existingFlags.map((f) => [f.measureId, f.id])));
    }
  }, [existingFlags]);

  const { data: annotations = [] } = useQuery<BarAnnotation[]>({
    queryKey: [`/api/lessons/${lessonId}/annotations`],
    enabled: Number.isFinite(lessonId) && lessonId > 0 && !!bundle,
  });

  // ── Local checklist state (mirrors lesson.tasks; synced on change via PATCH) ──
  const [localSections, setLocalSections] = useState<SessionSection[] | null>(null);
  useEffect(() => {
    if (bundle?.lesson.tasks) setLocalSections(bundle.lesson.tasks);
  }, [bundle?.lesson.tasks]);

  const effectivePhaseType =
    bundle?.lesson.phaseType ??
    bundle?.lesson.tasks?.find((t) => t.type === "piece_practice" && t.phaseType)?.phaseType ??
    null;

  const activeSections = localSections ?? sections;

  // ── Mutations ──────────────────────────────────────────
  const patchTasks = useMutation({
    mutationFn: async (nextTasks: SessionSection[]) => {
      await apiRequest("PATCH", `/api/lessons/${lessonId}`, { tasks: nextTasks });
    },
    onError: () => toast({ title: "Couldn't save task state", variant: "destructive" }),
  });

  const onToggleTask = useCallback(
    (sectionIdx: number, taskIdx: number) => {
      setLocalSections((prev) => {
        const base = prev ?? bundle?.lesson.tasks ?? [];
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
        patchTasks.mutate(next);
        return next;
      });
    },
    [bundle?.lesson.tasks, patchTasks],
  );

  const toggleFlag = useCallback(
    async (measureId: number, flagId: number | undefined) => {
      if (!bundle) return;
      if (flagId != null) {
        await apiRequest("DELETE", `/api/lessons/${bundle.lesson.id}/flags/${flagId}`);
        setFlaggedBars((prev) => {
          const n = new Map(prev);
          n.delete(measureId);
          return n;
        });
      } else {
        const created = await apiRequest("POST", `/api/lessons/${bundle.lesson.id}/flags`, { measureId });
        const flag = (await created.json()) as BarFlag;
        setFlaggedBars((prev) => new Map(prev).set(measureId, flag.id));
      }
      queryClient.invalidateQueries({ queryKey: [`/api/lessons/${lessonId}/flags`] });
      if (bundle.plan.id != null) {
        queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${bundle.plan.id}/flags/summary`] });
      }
    },
    [bundle, lessonId, queryClient],
  );

  const createAnnotation = useMutation({
    mutationFn: (vars: { measureStart: number; measureEnd: number; text: string }) =>
      apiRequest("POST", `/api/lessons/${lessonId}/annotations`, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/lessons/${lessonId}/annotations`] });
      if (planId != null) queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/annotations`] });
      setAnnotationTarget(null);
    },
    onError: () => toast({ title: "Couldn't save note", variant: "destructive" }),
  });

  const updateAnnotation = useMutation({
    mutationFn: (vars: { id: number; text: string }) =>
      apiRequest("PATCH", `/api/lessons/${lessonId}/annotations/${vars.id}`, { text: vars.text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/lessons/${lessonId}/annotations`] });
      if (planId != null) queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/annotations`] });
      setAnnotationTarget(null);
    },
    onError: () => toast({ title: "Couldn't update note", variant: "destructive" }),
  });

  const deleteAnnotation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/lessons/${lessonId}/annotations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/lessons/${lessonId}/annotations`] });
      if (planId != null) queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/annotations`] });
      setAnnotationTarget(null);
    },
    onError: () => toast({ title: "Couldn't delete note", variant: "destructive" }),
  });

  const completeSession = useMutation({
    mutationFn: async () => {
      if (!bundle) return;
      await apiRequest("PATCH", `/api/lessons/${bundle.lesson.id}`, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      const { plan, lesson } = bundle;
      if (plan.sheetMusicId != null) {
        try {
          for (let n = lesson.measureStart; n <= lesson.measureEnd; n++) {
            await apiRequest("PUT", `/api/learning-plans/${plan.id}/progress/${n}`, { status: "learned" });
          }
        } catch {
          /* non-critical */
        }
      }
      apiRequest("POST", `/api/learning-plans/${plan.id}/suggestions/compute`, {
        triggerLessonId: lesson.id,
      }).catch(() => {});
    },
    onSuccess: () => {
      if (planId != null) {
        queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/lessons`] });
        queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/today`] });
        queryClient.invalidateQueries({ queryKey: [`/api/learning-plans/${planId}/progress`] });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/lessons/${lessonId}/session`] });
      toast({ title: "Session complete", description: "Nice work — this day is marked complete." });
      setFeedbackModalOpen(true);
    },
    onError: () => toast({ title: "Couldn't save", variant: "destructive" }),
  });

  // ── Scroll snap + active index ─────────────────────────────
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

  // Restore / persist active segment
  useEffect(() => {
    if (!Number.isFinite(lessonId) || activeSections.length === 0) return;
    const key = `practivo_session_idx_${lessonId}`;
    const raw = localStorage.getItem(key);
    const saved = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(saved) && saved > 0 && saved < activeSections.length) {
      requestAnimationFrame(() => {
        segmentRefs.current[saved]?.scrollIntoView({ behavior: "auto", block: "start" });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, activeSections.length > 0]);

  useEffect(() => {
    if (!Number.isFinite(lessonId)) return;
    localStorage.setItem(`practivo_session_idx_${lessonId}`, String(activeIdx));
  }, [lessonId, activeIdx]);

  const scrollTo = useCallback((idx: number) => {
    const target = Math.max(0, Math.min(activeSections.length - 1, idx));
    segmentRefs.current[target]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeSections.length]);

  // Keyboard nav
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

  // ── Guards ──────────────────────────────────────────────
  if (!Number.isFinite(lessonId) || lessonId <= 0) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f1ea", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#7a7166", marginBottom: 12 }}>Invalid session link.</p>
          <Link href="/home"><button style={{ color: "#c9a86a", fontSize: 14 }}>← Go home</button></Link>
        </div>
      </div>
    );
  }

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

  if (isError || !bundle) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f1ea", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
        <div style={{ background: "#ede8df", border: "1px solid #ddd8cc", borderRadius: 12, padding: "24px 28px", maxWidth: 400, textAlign: "center" }}>
          <p style={{ color: "#7a7166", fontSize: 14, marginBottom: 16 }}>
            We couldn&apos;t open this session. It may have been removed or you may need to sign in again.
          </p>
          <Link href="/home"><button style={{ color: "#c9a86a", fontSize: 14 }}>← Go home</button></Link>
        </div>
      </div>
    );
  }

  const currentSection = activeSections[activeIdx];
  const nextSection = activeSections[activeIdx + 1];
  const overallProgress = activeSections.length > 0 ? (activeIdx + 1) / activeSections.length : 0;

  // ── Empty-sections fallback: single-card "complete" UI ─────
  if (activeSections.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f1ea", display: "flex", flexDirection: "column" }}>
        <SessionTopBar bundle={bundle} sheetId={sheetId} isDone={isDone} completePending={completeSession.isPending} onComplete={() => completeSession.mutate()} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
          <div style={{ maxWidth: 560, width: "100%" }}>
            <div style={{ background: "#fffbf2", border: "1px solid #ddd8cc", borderRadius: 14, padding: "28px 32px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: "#7a7166", marginBottom: 8, fontFamily: "Inter, sans-serif" }}>
                Today's bars
              </p>
              <p style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 32, color: "#0f2036", marginBottom: 8 }}>
                Measures {bundle.lesson.measureStart}
                {bundle.lesson.measureEnd !== bundle.lesson.measureStart ? `–${bundle.lesson.measureEnd}` : ""}
              </p>
              <p style={{ fontFamily: '"EB Garamond", serif', fontSize: 15, color: "#7a7166", marginBottom: 4 }}>
                About {bundle.plan.dailyPracticeMinutes} minutes · work slowly and cleanly through each bar.
              </p>
              <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "#7a7166" }}>
                {formatSessionDate(bundle.lesson.scheduledDate)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => completeSession.mutate()}
              disabled={completeSession.isPending || isDone}
              style={{
                marginTop: 20,
                width: "100%",
                padding: "14px 0",
                borderRadius: 8,
                background: "#0f2036",
                color: "#c9a86a",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.05em",
                border: "none",
                cursor: completeSession.isPending || isDone ? "default" : "pointer",
                opacity: completeSession.isPending || isDone ? 0.5 : 1,
              }}
            >
              {completeSession.isPending ? "Saving…" : "Mark session complete →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", background: "#f5f1ea", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <SessionTopBar bundle={bundle} sheetId={sheetId} isDone={isDone} completePending={completeSession.isPending} onComplete={() => completeSession.mutate()} />

      {/* ── Scroll snap container ─── */}
      <div
        ref={scrollerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          scrollSnapType: "y mandatory",
          scrollBehavior: "smooth",
        }}
      >
        {activeSections.map((sec, idx) => (
          <SegmentCard
            key={idx}
            index={idx}
            section={sec}
            registerEl={registerEl}
            effectivePhaseType={effectivePhaseType}
            allMeasures={allMeasures}
            sheetId={sheetId}
            flaggedBars={flaggedBars}
            onToggleFlag={toggleFlag}
            annotations={annotations}
            onAddAnnotation={(start, end) => setAnnotationTarget({ measureStart: start, measureEnd: end })}
            onAnnotationClick={(ann) => setAnnotationTarget({ measureStart: ann.measureStart, measureEnd: ann.measureEnd, existing: ann })}
            onToggleTask={onToggleTask}
            isLastSegment={idx === activeSections.length - 1}
            onComplete={() => completeSession.mutate()}
            completePending={completeSession.isPending}
            isDone={!!isDone}
          />
        ))}
        <div style={{ height: 20 }} />
      </div>

      {/* Annotation popover — one at page level */}
      <AnnotationPopover
        open={annotationTarget !== null}
        onOpenChange={(v) => { if (!v) setAnnotationTarget(null); }}
        measureStart={annotationTarget?.measureStart ?? 1}
        measureEnd={annotationTarget?.measureEnd ?? 1}
        initialText={annotationTarget?.existing?.text ?? ""}
        isSaving={createAnnotation.isPending || updateAnnotation.isPending}
        onSave={(text) => {
          if (annotationTarget?.existing) {
            updateAnnotation.mutate({ id: annotationTarget.existing.id, text });
          } else if (annotationTarget) {
            createAnnotation.mutate({ measureStart: annotationTarget.measureStart, measureEnd: annotationTarget.measureEnd, text });
          }
        }}
        onDelete={annotationTarget?.existing ? () => deleteAnnotation.mutate(annotationTarget!.existing!.id) : undefined}
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
        {/* Progress line */}
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
          {/* Left: current segment label */}
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

          {/* Center: dot row */}
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

          {/* Right: peek next + nav */}
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

      <SessionFeedbackModal
        open={feedbackModalOpen}
        onClose={() => {
          setFeedbackModalOpen(false);
          if (planId != null) navigate(`/plan/${planId}`);
        }}
        lessonDayId={bundle.lesson.id}
        tasks={activeSections}
        onSubmitted={() => {
          setFeedbackModalOpen(false);
          if (planId != null) navigate(`/plan/${planId}`);
        }}
      />
    </div>
  );
}

// ── Session Top Bar ──────────────────────────────────────────────────────────

function SessionTopBar({
  bundle,
  sheetId,
  isDone,
  completePending,
  onComplete,
}: {
  bundle: SessionBundle;
  sheetId: number | null;
  isDone: boolean;
  completePending: boolean;
  onComplete: () => void;
}) {
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
      <Link href={bundle.plan.id != null ? `/plan/${bundle.plan.id}` : "/"}>
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
          <ChevronLeft style={{ width: 14, height: 14 }} /> Back
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
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {bundle.composerName}
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
          {bundle.pieceTitle}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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
          Day {bundle.dayIndex + 1}
        </span>
        {sheetId != null && (
          <a
            href={`/score/${sheetId}`}
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
