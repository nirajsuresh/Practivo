import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Nav } from "@/components/nav";
import type { LessonTask } from "@shared/schema";

type LessonDay = {
  id: number;
  scheduledDate: string;
  measureStart: number | null;
  measureEnd: number | null;
  status: string;
  tasks: LessonTask[];
};

type Measure = {
  measureNumber: number;
  imageUrl: string;
};

function BarThumbnails({ sheetMusicId, measureStart, measureEnd }: {
  sheetMusicId: number;
  measureStart: number;
  measureEnd: number;
}) {
  const { data: measures = [], isLoading } = useQuery<Measure[]>({
    queryKey: ["/api/sheet-music/measures", sheetMusicId, measureStart, measureEnd],
    queryFn: () =>
      fetch(`/api/sheet-music/${sheetMusicId}/measures?start=${measureStart}&end=${measureEnd}`)
        .then(r => r.json()),
  });

  if (isLoading) {
    return (
      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginTop: "0.625rem" }}>
        {Array.from({ length: measureEnd - measureStart + 1 }).map((_, i) => (
          <div key={i} style={{
            height: "3.5rem", width: "5rem",
            background: "var(--elevated)", borderRadius: "1px",
            flexShrink: 0,
          }} />
        ))}
      </div>
    );
  }

  if (!measures.length) return null;

  return (
    <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginTop: "0.625rem" }}>
      {measures.map(m => (
        <img
          key={m.measureNumber}
          src={m.imageUrl}
          alt={`Bar ${m.measureNumber}`}
          style={{
            height: "3.5rem",
            width: "auto",
            objectFit: "contain",
            background: "#fff",
            borderRadius: "1px",
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

export default function PlanPage() {
  const [, navigate] = useLocation();
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  // First get today data to find active plan + sheetMusicId
  const { data: today } = useQuery({
    queryKey: ["/api/today"],
    queryFn: () => fetch("/api/today").then(r => r.json()),
  });

  const planId = today?.activePlan?.id;
  const sheetMusicId = today?.sheetMusicId;

  const { data: lessons = [], isLoading } = useQuery<LessonDay[]>({
    queryKey: ["/api/learning-plans/lessons", planId],
    queryFn: () => fetch(`/api/learning-plans/${planId}/lessons`).then(r => r.json()),
    enabled: !!planId,
  });

  const todayStr = new Date().toISOString().split("T")[0];

  if (!today?.activePlan) {
    return (
      <>
        <Nav />
        <main className="r-page" style={{ textAlign: "center", paddingTop: "4rem" }}>
          <p style={{ fontFamily: "Cormorant, serif", fontStyle: "italic", fontSize: "clamp(1.5rem,4vw,2rem)", color: "var(--text)", marginBottom: "0.75rem" }}>
            No active plan
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "2rem" }}>
            Add a piece and generate a learning plan to get started.
          </p>
          <a href="/add" className="r-btn-primary" style={{ width: "auto", display: "inline-flex" }}>
            + Add piece
          </a>
        </main>
      </>
    );
  }

  const activePlan = today.activePlan;
  const activeEntry = today.activeEntry;

  return (
    <>
      <Nav />
      <main className="r-page">
        <p className="r-label" style={{ marginBottom: "0.5rem" }}>
          {activeEntry?.composerName ?? ""}
        </p>
        <h1 className="r-piece-title" style={{ fontSize: "clamp(1.625rem,4vw,2.125rem)", marginBottom: "0.5rem" }}>
          {activeEntry?.pieceTitle}
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "2.5rem" }}>
          {activePlan.totalMeasures} bars · {activePlan.dailyPracticeMinutes} min/day
        </p>

        {isLoading ? (
          <div style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Loading plan…</div>
        ) : (
          <div style={{ border: "1px solid var(--divider)", borderRadius: "2px", overflow: "hidden" }}>
            {lessons.map((lesson, i) => {
              const isToday = lesson.scheduledDate === todayStr;
              const isPast = lesson.scheduledDate < todayStr;
              const isExpanded = expandedDay === lesson.id;
              const completedTasks = lesson.tasks.filter(t => t.completed).length;
              const totalTasks = lesson.tasks.length;
              const isDone = lesson.status === "completed" || (totalTasks > 0 && completedTasks === totalTasks);

              return (
                <div
                  key={lesson.id}
                  style={{
                    borderBottom: i < lessons.length - 1 ? "1px solid var(--divider)" : "none",
                    opacity: !isToday && !isPast && !isExpanded ? 0.6 : 1,
                  }}
                >
                  {/* Day header row */}
                  <div
                    onClick={() => setExpandedDay(isExpanded ? null : lesson.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.875rem 1.125rem",
                      cursor: "pointer",
                      background: isToday ? "var(--elevated)" : "transparent",
                      boxShadow: isToday ? "inset 2px 0 0 var(--accent)" : "none",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={e => { if (!isToday) e.currentTarget.style.background = "var(--surface)"; }}
                    onMouseLeave={e => { if (!isToday) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{
                      fontSize: "0.5625rem",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      color: isToday ? "var(--accent)" : isPast ? "var(--text-muted)" : "var(--text-muted)",
                      minWidth: "3rem",
                      fontWeight: isToday ? 600 : 400,
                    }}>
                      {isToday ? "Today" : `Day ${i + 1}`}
                    </span>

                    <span style={{
                      flex: 1,
                      fontSize: "0.8125rem",
                      color: isDone ? "var(--text-muted)" : isToday ? "var(--text)" : "var(--text-secondary)",
                      textDecoration: isDone ? "line-through" : "none",
                    }}>
                      {lesson.measureStart !== null && lesson.measureEnd !== null
                        ? `mm. ${lesson.measureStart}–${lesson.measureEnd}`
                        : "Review day"}
                    </span>

                    {totalTasks > 0 && (
                      <span style={{
                        fontSize: "0.5625rem",
                        letterSpacing: "0.1em",
                        color: isDone ? "var(--accent)" : "var(--text-muted)",
                        fontWeight: isDone ? 600 : 400,
                      }}>
                        {isDone ? "✓" : `${completedTasks}/${totalTasks}`}
                      </span>
                    )}

                    <span style={{
                      fontSize: "0.625rem",
                      color: "var(--text-muted)",
                      transform: isExpanded ? "rotate(90deg)" : "none",
                      transition: "transform 0.15s",
                    }}>›</span>
                  </div>

                  {/* Expanded: tasks with bar thumbnails */}
                  {isExpanded && (
                    <div style={{
                      padding: "0.75rem 1.125rem 1rem",
                      background: "var(--surface)",
                      borderTop: "1px solid var(--divider)",
                    }}>
                      {lesson.tasks.length === 0 ? (
                        <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>No tasks.</p>
                      ) : (
                        lesson.tasks.map(task => (
                          <div key={task.id} style={{ marginBottom: "1.25rem" }}>
                            <p style={{
                              fontSize: "0.8125rem",
                              color: task.completed ? "var(--text-muted)" : "var(--text-secondary)",
                              textDecoration: task.completed ? "line-through" : "none",
                              marginBottom: 0,
                            }}>
                              {task.description}
                            </p>
                            {sheetMusicId && (
                              <BarThumbnails
                                sheetMusicId={sheetMusicId}
                                measureStart={task.measureStart}
                                measureEnd={task.measureEnd}
                              />
                            )}
                          </div>
                        ))
                      )}

                      {isToday && (
                        <button
                          className="r-btn-primary"
                          style={{ marginTop: "0.5rem" }}
                          onClick={() => navigate("/session")}
                        >
                          Start Session →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
