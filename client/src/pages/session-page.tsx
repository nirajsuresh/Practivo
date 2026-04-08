import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Nav } from "@/components/nav";
import type { LessonTask } from "@shared/schema";

type Measure = {
  measureNumber: number;
  imageUrl: string;
};

function BarGrid({ sheetMusicId, measureStart, measureEnd }: {
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

  const count = measureEnd - measureStart + 1;

  if (isLoading) {
    return (
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(8rem, 1fr))",
        gap: "0.5rem",
        marginTop: "1.5rem",
      }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{
            height: "5rem",
            background: "var(--elevated)",
            borderRadius: "2px",
            animation: "pulse 1.5s ease-in-out infinite",
          }} />
        ))}
        <style>{`@keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.7} }`}</style>
      </div>
    );
  }

  if (!measures.length) {
    return (
      <div style={{
        marginTop: "2rem",
        padding: "3rem 2rem",
        border: "1px solid var(--divider)",
        borderRadius: "2px",
        textAlign: "center",
        color: "var(--text-muted)",
        fontSize: "0.8125rem",
      }}>
        Bar images not available for mm. {measureStart}–{measureEnd}
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(8rem, 1fr))",
      gap: "0.5rem",
      marginTop: "1.5rem",
    }}>
      {measures.map(m => (
        <div key={m.measureNumber} style={{ position: "relative" }}>
          <img
            src={m.imageUrl}
            alt={`Bar ${m.measureNumber}`}
            style={{
              width: "100%",
              height: "auto",
              objectFit: "contain",
              background: "#fff",
              borderRadius: "2px",
              display: "block",
            }}
          />
          <span style={{
            position: "absolute",
            bottom: "0.25rem",
            right: "0.375rem",
            fontSize: "0.5rem",
            letterSpacing: "0.08em",
            color: "rgba(0,0,0,0.4)",
            fontFamily: "DM Sans, sans-serif",
          }}>
            {m.measureNumber}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function SessionPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [taskIndex, setTaskIndex] = useState(0);

  const { data: today, isLoading } = useQuery({
    queryKey: ["/api/today"],
    queryFn: () => fetch("/api/today").then(r => r.json()),
  });

  const todayLesson = today?.todayLesson;
  const sheetMusicId = today?.sheetMusicId;
  const tasks: LessonTask[] = todayLesson?.tasks ?? [];

  // Jump to first incomplete task on load
  useEffect(() => {
    if (tasks.length > 0) {
      const firstIncomplete = tasks.findIndex(t => !t.completed);
      if (firstIncomplete >= 0) setTaskIndex(firstIncomplete);
    }
  }, [todayLesson?.id]);

  const completeTask = useMutation({
    mutationFn: async (index: number) => {
      await fetch(`/api/lessons/${todayLesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedTaskIndex: index }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/today"] }),
  });

  const completeLesson = useMutation({
    mutationFn: async () => {
      await fetch(`/api/lessons/${todayLesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
    },
    onSuccess: () => navigate("/"),
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

  if (!todayLesson || tasks.length === 0) {
    return (
      <>
        <Nav />
        <main className="r-page" style={{ textAlign: "center", paddingTop: "4rem" }}>
          <p style={{ fontFamily: "Cormorant, serif", fontStyle: "italic", fontSize: "clamp(1.5rem,4vw,2rem)", color: "var(--text)", marginBottom: "0.75rem" }}>
            No session today
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "2rem" }}>
            There are no tasks scheduled for today.
          </p>
          <a href="/" className="r-btn-primary" style={{ width: "auto", display: "inline-flex" }}>
            ← Back to Today
          </a>
        </main>
      </>
    );
  }

  const currentTask = tasks[taskIndex];
  const completedCount = tasks.filter(t => t.completed).length;
  const progressPct = Math.round((completedCount / tasks.length) * 100);
  const isLastTask = taskIndex === tasks.length - 1;
  const allDone = tasks.every(t => t.completed);

  const handleNext = async () => {
    if (!currentTask.completed) {
      await completeTask.mutateAsync(taskIndex);
    }
    if (isLastTask) {
      completeLesson.mutate();
    } else {
      setTaskIndex(i => i + 1);
    }
  };

  return (
    <>
      {/* Fixed top progress bar */}
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "2px",
        background: "var(--divider)",
        zIndex: 100,
      }}>
        <div style={{
          height: "100%",
          width: `${progressPct}%`,
          background: "var(--accent)",
          transition: "width 0.4s ease",
        }} />
      </div>

      <Nav />

      <main className="r-page" style={{ paddingTop: "2.5rem" }}>
        {/* Piece + task header */}
        <div style={{ marginBottom: "2rem" }}>
          <p className="r-label" style={{ marginBottom: "0.5rem" }}>
            {today.activeEntry?.composerName ?? ""} · {today.activeEntry?.pieceTitle ?? ""}
          </p>

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem" }}>
            <h1 className="r-piece-title" style={{ fontSize: "clamp(1.5rem,4vw,2rem)", margin: 0 }}>
              {currentTask.description}
            </h1>
            <span style={{
              flexShrink: 0,
              fontSize: "0.5625rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
            }}>
              {taskIndex + 1} / {tasks.length}
            </span>
          </div>
        </div>

        {/* Bar images */}
        {sheetMusicId && (
          <BarGrid
            sheetMusicId={sheetMusicId}
            measureStart={currentTask.measureStart}
            measureEnd={currentTask.measureEnd}
          />
        )}

        {/* Progress dots */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: "0.5rem",
          margin: "2.5rem 0",
        }}>
          {tasks.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setTaskIndex(i)}
              style={{
                width: i === taskIndex ? "1.5rem" : "0.375rem",
                height: "0.375rem",
                borderRadius: "3px",
                background: t.completed
                  ? "var(--accent)"
                  : i === taskIndex
                  ? "var(--text-secondary)"
                  : "var(--divider)",
                border: "none",
                padding: 0,
                cursor: "pointer",
                transition: "width 0.2s ease, background 0.2s ease",
              }}
              aria-label={`Task ${i + 1}`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {taskIndex > 0 && (
            <button
              className="r-btn-ghost"
              onClick={() => setTaskIndex(i => i - 1)}
              style={{ flexShrink: 0 }}
            >
              ← Prev
            </button>
          )}

          <button
            className="r-btn-primary"
            style={{ flex: 1 }}
            onClick={handleNext}
            disabled={completeTask.isPending || completeLesson.isPending}
          >
            {completeTask.isPending || completeLesson.isPending
              ? "Saving…"
              : isLastTask
              ? allDone ? "Finish →" : "Complete & Finish →"
              : currentTask.completed
              ? "Next →"
              : "Done →"}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
          <button
            className="r-btn-ghost"
            onClick={() => navigate("/")}
          >
            End session
          </button>
        </div>
      </main>
    </>
  );
}
