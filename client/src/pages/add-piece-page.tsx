import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Nav } from "@/components/nav";
import { ScoreReviewModal } from "@/components/score-review-modal";

type Step = "search" | "upload" | "processing" | "review" | "schedule";

type PieceResult = { id: number; title: string; composerId: number; composerName: string; movementId?: number | null };

export default function AddPiecePage() {
  const [, navigate] = useLocation();

  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PieceResult | null>(null);
  const [repertoireEntryId, setRepertoireEntryId] = useState<number | null>(null);
  const [sheetMusicId, setSheetMusicId] = useState<number | null>(null);
  const [totalMeasures, setTotalMeasures] = useState(0);
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 21);
    return d.toISOString().split("T")[0];
  });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Piece search
  const { data: searchResults = [] } = useQuery<PieceResult[]>({
    queryKey: ["/api/pieces/search", query],
    queryFn: () =>
      query.length > 1
        ? fetch(`/api/pieces/search?q=${encodeURIComponent(query)}`).then(r => r.json())
        : Promise.resolve([]),
    enabled: query.length > 1,
  });

  // Polling for processing status
  const { data: status } = useQuery({
    queryKey: ["/api/sheet-music/status", sheetMusicId],
    queryFn: () => fetch(`/api/sheet-music/${sheetMusicId}/status`).then(r => r.json()),
    enabled: step === "processing" && sheetMusicId !== null,
    refetchInterval: 1500,
  });

  // When processing finishes, advance to review
  if (step === "processing" && status?.processingStatus === "ready") {
    setTotalMeasures(status.measuresFound ?? 0);
    setStep("review");
  }

  const addToRepertoire = useMutation({
    mutationFn: async (piece: PieceResult) => {
      const res = await fetch("/api/repertoire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          composerId: piece.composerId,
          pieceId: piece.id,
          movementId: piece.movementId ?? null,
          status: "In Progress",
          startedDate: new Date().toISOString().split("T")[0],
        }),
      });
      return res.json();
    },
    onSuccess: (entry) => {
      setRepertoireEntryId(entry.id);
      setStep("upload");
    },
  });

  const uploadFile = useCallback(async (file: File) => {
    if (!file || !selected) return;
    const form = new FormData();
    form.append("pdf", file);
    form.append("pieceId", String(selected.id));

    const res = await fetch("/api/sheet-music/upload", { method: "POST", body: form });
    const data = await res.json();
    if (data.sheetMusicId) {
      setSheetMusicId(data.sheetMusicId);
      setStep("processing");
    }
  }, [selected]);

  const generatePlan = useMutation({
    mutationFn: async () => {
      // Create plan
      const planRes = await fetch("/api/learning-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repertoireEntryId,
          dailyPracticeMinutes: dailyMinutes,
          targetCompletionDate: targetDate,
          totalMeasures,
          status: "setup",
        }),
      });
      const plan = await planRes.json();

      // Update plan total measures
      await fetch(`/api/learning-plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalMeasures, status: "active" }),
      });

      // Generate lessons
      await fetch(`/api/learning-plans/${plan.id}/generate-lessons`, { method: "POST" });
      return plan;
    },
    onSuccess: () => navigate("/"),
  });

  // ── Render ──

  const sectionLabel: Record<Step, string> = {
    search: "Find your piece",
    upload: "Upload the score",
    processing: "Detecting bars…",
    review: "Review bar detection",
    schedule: "Set your schedule",
  };

  return (
    <>
      <Nav />
      <main className="r-page">
        <p className="r-label" style={{ marginBottom: "0.75rem" }}>Add piece</p>
        <h1 className="r-piece-title" style={{ fontSize: "clamp(1.625rem,4vw,2.125rem)", marginBottom: "2.5rem" }}>
          {sectionLabel[step]}
        </h1>

        {/* ── Step: search ── */}
        {step === "search" && (
          <div>
            <input
              type="text"
              placeholder="Search pieces or composers…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "0.875rem 1rem",
                background: "var(--surface)",
                border: "1px solid var(--divider)",
                borderRadius: "2px",
                color: "var(--text)",
                fontSize: "0.9375rem",
                fontFamily: "DM Sans, sans-serif",
                outline: "none",
                marginBottom: "0.75rem",
              }}
            />

            {searchResults.length > 0 && (
              <div style={{ border: "1px solid var(--divider)", borderRadius: "2px", overflow: "hidden" }}>
                {searchResults.slice(0, 12).map((r) => (
                  <div
                    key={`${r.id}-${r.movementId ?? 0}`}
                    onClick={() => { setSelected(r); addToRepertoire.mutate(r); }}
                    style={{
                      padding: "0.875rem 1.125rem",
                      borderBottom: "1px solid var(--divider)",
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--elevated)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ fontSize: "0.9375rem", color: "var(--text)", marginBottom: "0.15rem" }}>
                      {r.title}
                      {r.movementId ? <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}> (movement)</span> : ""}
                    </div>
                    <div style={{ fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                      {r.composerName}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {query.length > 1 && searchResults.length === 0 && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No results — try a different search.</p>
            )}
          </div>
        )}

        {/* ── Step: upload ── */}
        {step === "upload" && selected && (
          <div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "2rem" }}>
              <span style={{ fontFamily: "Cormorant, serif", fontStyle: "italic", fontSize: "1.0625rem" }}>
                {selected.title}
              </span>
              {" "}by {selected.composerName} added to your repertoire.
              Now upload the PDF score.
            </p>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) uploadFile(file);
              }}
              style={{
                border: `1px dashed ${dragOver ? "var(--accent)" : "var(--divider)"}`,
                borderRadius: "2px",
                padding: "4rem 2rem",
                textAlign: "center",
                cursor: "pointer",
                transition: "border-color 0.15s",
                background: dragOver ? "rgba(191,163,106,0.04)" : "transparent",
              }}
            >
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem", marginBottom: "0.5rem" }}>
                Drop PDF here, or click to browse
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                PDF only · up to 50 MB
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
            />
          </div>
        )}

        {/* ── Step: processing ── */}
        {step === "processing" && (
          <div style={{ textAlign: "center", paddingTop: "2rem" }}>
            <div style={{ marginBottom: "2rem" }}>
              <div style={{ width: "100%", height: "1px", background: "var(--divider)", position: "relative", overflow: "hidden", marginBottom: "1.5rem" }}>
                <div style={{
                  position: "absolute", top: 0, left: "-100%",
                  width: "40%", height: "1px",
                  background: "var(--accent)",
                  animation: "progress-slide 1.5s ease-in-out infinite",
                }} />
              </div>
              <style>{`@keyframes progress-slide { from { left: -40% } to { left: 100% } }`}</style>
            </div>
            <p className="r-label" style={{ marginBottom: "0.75rem" }}>
              {status?.processingPage && status?.processingTotal
                ? `Processing page ${status.processingPage} of ${status.processingTotal}`
                : "Analysing score…"}
            </p>
            {status?.measuresFound > 0 && (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.5rem" }}>
                {status.measuresFound} bars detected so far
              </p>
            )}
          </div>
        )}

        {/* ── Step: review (ScoreReviewModal inline) ── */}
        {step === "review" && sheetMusicId && (
          <ScoreReviewModal
            sheetMusicId={sheetMusicId}
            totalMeasures={totalMeasures}
            pieceTitle={selected?.title ?? ""}
            onConfirm={(n: number) => { setTotalMeasures(n); setStep("schedule"); }}
            onBack={() => setStep("upload")}
          />
        )}

        {/* ── Step: schedule ── */}
        {step === "schedule" && (
          <div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "2.5rem" }}>
              Bar detection found <strong style={{ color: "var(--text)" }}>{totalMeasures} bars</strong>.
              Set your daily session length and target completion date.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginBottom: "3rem" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <span className="r-label">Session length</span>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <input
                    type="range"
                    min={15} max={120} step={5}
                    value={dailyMinutes}
                    onChange={e => setDailyMinutes(Number(e.target.value))}
                    style={{ flex: 1, accentColor: "var(--accent)" }}
                  />
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.9375rem", minWidth: "4rem" }}>
                    {dailyMinutes} min
                  </span>
                </div>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <span className="r-label">Target completion date</span>
                <input
                  type="date"
                  value={targetDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={e => setTargetDate(e.target.value)}
                  style={{
                    padding: "0.75rem 1rem",
                    background: "var(--surface)",
                    border: "1px solid var(--divider)",
                    borderRadius: "2px",
                    color: "var(--text)",
                    fontSize: "0.9375rem",
                    fontFamily: "DM Sans, sans-serif",
                    outline: "none",
                  }}
                />
              </label>
            </div>

            {/* Preview */}
            {totalMeasures > 0 && targetDate && (
              <div style={{
                padding: "1rem 1.125rem",
                background: "var(--surface)",
                border: "1px solid var(--divider)",
                borderRadius: "2px",
                marginBottom: "2rem",
                fontSize: "0.875rem",
                color: "var(--text-muted)",
              }}>
                {(() => {
                  const days = Math.max(1, Math.round((new Date(targetDate).getTime() - Date.now()) / 86400000));
                  const mpd = Math.ceil(totalMeasures / days);
                  return `${days} days · ~${mpd} bars/day`;
                })()}
              </div>
            )}

            <button
              className="r-btn-primary"
              onClick={() => generatePlan.mutate()}
              disabled={generatePlan.isPending}
            >
              {generatePlan.isPending ? "Generating…" : "Generate Plan →"}
            </button>
          </div>
        )}
      </main>
    </>
  );
}
