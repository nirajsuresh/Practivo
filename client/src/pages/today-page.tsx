import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Nav } from "@/components/nav";
import type { LessonTask } from "@shared/schema";

type TodayData = {
  activeEntry: any | null;
  activePlan: any | null;
  todayLesson: any | null;
  sheetMusicId: number | null;
  repertoire: any[];
};

export default function TodayPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<TodayData>({
    queryKey: ["/api/today"],
    queryFn: () => fetch("/api/today").then(r => r.json()),
  });

  const toggleTask = useMutation({
    mutationFn: async ({ lessonId, taskIndex }: { lessonId: number; taskIndex: number }) => {
      await fetch(`/api/lessons/${lessonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedTaskIndex: taskIndex }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/today"] }),
  });

  const switchActive = useMutation({
    mutationFn: async (entryId: number) => {
      await fetch(`/api/repertoire/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "In Progress" }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/today"] }),
  });

  if (isLoading) {
    return (
      <>
        <Nav />
        <div className="r-page" style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
          Loading…
        </div>
      </>
    );
  }

  const { activeEntry, activePlan, todayLesson, sheetMusicId, repertoire } = data ?? {};
  const tasks: LessonTask[] = todayLesson?.tasks ?? [];
  const completedCount = tasks.filter(t => t.completed).length;
  const totalTasks = tasks.length;

  // Progress: completed lesson days / total lesson days (rough)
  const progressPct = activePlan?.totalMeasures && todayLesson
    ? Math.round(((todayLesson.measureEnd ?? 0) / activePlan.totalMeasures) * 100)
    : 0;

  const dayNumber = todayLesson
    ? (() => {
        const start = new Date(activePlan?.createdAt ?? Date.now());
        const today = new Date();
        return Math.max(1, Math.round((today.getTime() - start.getTime()) / 86400000) + 1);
      })()
    : null;

  return (
    <>
      <Nav />
      <main className="r-page">

        {!activeEntry ? (
          /* ── Empty state ── */
          <div style={{ textAlign: "center", paddingTop: "4rem" }}>
            <p style={{ fontSize: "clamp(1.5rem,4vw,2rem)", fontFamily: "Cormorant, serif", fontStyle: "italic", color: "var(--text)", marginBottom: "0.75rem" }}>
              No active piece
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "2rem" }}>
              Add your first piece to get started.
            </p>
            <a href="/add" className="r-btn-primary" style={{ width: "auto", display: "inline-flex" }}>
              + Add piece
            </a>
          </div>
        ) : (
          <>
            {/* ── Piece header ── */}
            <header style={{ marginBottom: 0 }}>
              <p className="r-label" style={{ marginBottom: "0.5rem" }}>
                {activeEntry.composerName ?? ""}
              </p>
              <h1 className="r-piece-title" style={{ fontSize: "clamp(1.875rem,5vw,2.5rem)", margin: "0 0 1.125rem" }}>
                {activeEntry.pieceTitle}
              </h1>

              <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.5rem" }}>
                {dayNumber && (
                  <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", letterSpacing: "0.02em" }}>
                    Day {dayNumber}
                  </span>
                )}
                {activePlan?.dailyPracticeMinutes && (
                  <span style={{
                    padding: "0.175rem 0.6rem",
                    border: "1px solid var(--divider)",
                    borderRadius: "2px",
                    fontSize: "0.6875rem",
                    color: "var(--text-muted)",
                    letterSpacing: "0.04em",
                  }}>
                    ~{activePlan.dailyPracticeMinutes} min
                  </span>
                )}
              </div>

              {progressPct > 0 && (
                <div style={{ marginBottom: "3rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.625rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                    <span>Plan progress</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="r-progress-track">
                    <div className="r-progress-fill" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              )}
            </header>

            {/* ── Today's tasks ── */}
            {todayLesson ? (
              <>
                <p className="r-label" style={{ marginBottom: "1rem" }}>Today's training</p>
                <div className="r-task-card" style={{ marginBottom: "2.25rem" }} role="list">
                  {tasks.map((task, i) => (
                    <div
                      key={task.id}
                      className="r-task-row"
                      role="listitem"
                      style={{ cursor: "pointer" }}
                      onClick={() => !task.completed && toggleTask.mutate({ lessonId: todayLesson.id, taskIndex: i })}
                    >
                      <span className={`r-check${task.completed ? " done" : ""}`} aria-hidden="true" />
                      <span style={{
                        flex: 1,
                        fontSize: "0.9375rem",
                        color: task.completed ? "var(--text-muted)" : "var(--text)",
                        lineHeight: 1.45,
                      }}>
                        {task.description}
                      </span>
                    </div>
                  ))}
                  {tasks.length === 0 && (
                    <div className="r-task-row" style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                      No tasks for today — check your plan.
                    </div>
                  )}
                </div>

                <button
                  className="r-btn-primary"
                  style={{ marginBottom: "4rem" }}
                  onClick={() => navigate("/session")}
                >
                  {completedCount === totalTasks && totalTasks > 0 ? "Session complete ✓" : "Start Session →"}
                </button>
              </>
            ) : activePlan ? (
              <div style={{ marginBottom: "3rem", padding: "1.5rem 1.25rem", border: "1px solid var(--divider)", borderRadius: "2px", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                No lesson scheduled for today. View your <a href="/plan" style={{ color: "var(--accent)", textDecoration: "none" }}>plan</a>.
              </div>
            ) : (
              <div style={{ marginBottom: "3rem" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
                  Upload your score to generate a practice plan.
                </p>
                <a href="/add" className="r-btn-primary" style={{ width: "auto", display: "inline-flex" }}>
                  Set up learning plan →
                </a>
              </div>
            )}

            <hr className="r-divider" style={{ margin: "0 0 2.5rem" }} />

            {/* ── Repertoire (secondary) ── */}
            <section aria-label="Your repertoire">
              <p className="r-label" style={{ marginBottom: "1rem" }}>Repertoire</p>
              <div style={{ border: "1px solid var(--divider)", borderRadius: "2px", overflow: "hidden" }}>
                {(repertoire ?? []).map((entry: any) => {
                  const isActive = entry.id === activeEntry?.id;
                  const pct = entry.progress ?? 0;
                  return (
                    <div
                      key={entry.id}
                      onClick={() => !isActive && switchActive.mutate(entry.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "1rem",
                        padding: "0.875rem 1.125rem",
                        borderBottom: "1px solid var(--divider)",
                        cursor: isActive ? "default" : "pointer",
                        background: isActive ? "var(--elevated)" : "transparent",
                        boxShadow: isActive ? "inset 2px 0 0 var(--accent)" : "none",
                        transition: "background 0.12s",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: "0.875rem",
                          color: isActive ? "var(--text)" : "var(--text-secondary)",
                          marginBottom: "0.2rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {entry.composerName} — {entry.pieceTitle}
                          {entry.movementName ? ` (${entry.movementName})` : ""}
                        </div>
                        <div style={{ fontSize: "0.5625rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                          {entry.status}
                        </div>
                      </div>
                      <div style={{ width: "2.5rem", height: "1px", background: "var(--divider)", position: "relative", flexShrink: 0 }}>
                        <span style={{ display: "block", position: "absolute", top: 0, left: 0, height: "1px", width: `${pct}%`, background: "var(--accent-dark)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <a
                href="/add"
                style={{
                  display: "inline-block",
                  marginTop: "1rem",
                  padding: "0.25rem 0",
                  fontSize: "0.625rem",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  textDecoration: "none",
                  transition: "color 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                + Add piece
              </a>
            </section>
          </>
        )}
      </main>
    </>
  );
}
