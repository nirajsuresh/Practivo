import { Play, Music, Dumbbell, Shuffle } from "lucide-react";
import { useLocation } from "wouter";
import { useSheetPageUrl } from "@/lib/sheet-page";

const NAVY = "#0f2036";
const NAVY_DEEP = "#081526";
const CREAM = "#f5f1ea";
const CREAM_WARM = "#fffbf2";
const CREAM_DEEP = "#ede8df";
const BORDER = "#ddd8cc";
const GOLD = "#c9a86a";
const GOLD_DARK = "#96793a";
const MUTED = "#7a7166";
const MUTED_ON_NAVY = "rgba(245,241,234,0.62)";
const BORDER_ON_NAVY = "rgba(245,241,234,0.14)";

export type SessionHeroActiveMeasure = {
  measureNumber: number;
  pageNumber: number;
  boundingBox: { x: number; y: number; w: number; h: number } | null;
};

export type SessionHeroBlock = {
  planId: number;
  blockType: "piece" | "exercise" | "sight_reading";
  blockName: string;
  composerName: string | null;
  composerImageUrl: string | null;
  pieceTitle: string | null;
  movementName: string | null;
  timeMin: number;
  sheetMusicId: number | null;
  dayNumber: number | null;
  totalDays: number | null;
  progressPercent: number | null;
  daysRemaining: number | null;
  todayPageNumbers: number[];
  totalPages: number | null;
  todayMeasureRange: string | null;
  todayActiveMeasures: SessionHeroActiveMeasure[];
  todayFocus: string | null;
  isScheduledToday: boolean;
  inSetup: boolean;
};

function BlockIcon({ blockType, size = 16 }: { blockType: SessionHeroBlock["blockType"]; size?: number }) {
  if (blockType === "exercise") return <Dumbbell size={size} />;
  if (blockType === "sight_reading") return <Shuffle size={size} />;
  return <Music size={size} />;
}

// ─── Today's Pages panel with bar-level overlays ─────────────────────────────
function TodayPagesPanel({ block }: { block: SessionHeroBlock }) {
  const pageUrl = useSheetPageUrl(block.sheetMusicId);
  if (!block.sheetMusicId || block.todayPageNumbers.length === 0) return null;

  const measuresByPage = new Map<number, SessionHeroActiveMeasure[]>();
  for (const m of block.todayActiveMeasures) {
    const arr = measuresByPage.get(m.pageNumber) ?? [];
    arr.push(m);
    measuresByPage.set(m.pageNumber, arr);
  }

  // Show a window of pages: today's pages + a bit of surrounding context
  const firstActive = block.todayPageNumbers[0];
  const lastActive = block.todayPageNumbers[block.todayPageNumbers.length - 1];
  const maxVisible = 4;
  const total = block.totalPages ?? lastActive;
  const windowStart = Math.max(1, firstActive - 1);
  const windowEnd = Math.min(total, Math.max(lastActive + 1, windowStart + maxVisible - 1));
  const pages: number[] = [];
  for (let p = windowStart; p <= windowEnd && pages.length < maxVisible; p++) pages.push(p);
  const activeSet = new Set(block.todayPageNumbers);

  return (
    <div style={{
      background: "#efe9dc",
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      padding: "12px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: MUTED,
        }}>
          Today's pages
        </span>
        {block.totalPages && (
          <span style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 12,
            fontStyle: "italic",
            color: MUTED,
          }}>
            p. {firstActive === lastActive ? firstActive : `${firstActive}\u2013${lastActive}`}
            {" of "}{block.totalPages}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "stretch", height: 130 }}>
        {pages.map((pageNum) => {
          const isActive = activeSet.has(pageNum);
          const url = pageUrl(pageNum);
          const pageMeasures = isActive ? (measuresByPage.get(pageNum) ?? []) : [];
          return (
            <div
              key={pageNum}
              style={{
                flex: 1,
                minWidth: 0,
                position: "relative",
                borderRadius: 3,
                overflow: "hidden",
                border: isActive ? `1.5px solid ${GOLD_DARK}` : `1px solid ${BORDER}`,
                boxShadow: isActive ? "0 2px 6px rgba(150,121,58,0.22)" : "none",
                background: "#fff",
                opacity: isActive ? 1 : 0.45,
                transition: "opacity 0.15s",
              }}
            >
              {url ? (
                <img
                  src={url}
                  alt={`Page ${pageNum}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "top center",
                    display: "block",
                  }}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", background: "#f5f1ea" }} />
              )}
              {pageMeasures.map((m) => {
                if (!m.boundingBox) return null;
                const { x, y, w, h } = m.boundingBox;
                return (
                  <div
                    key={m.measureNumber}
                    style={{
                      position: "absolute",
                      left: `${x * 100}%`,
                      top: `${y * 100}%`,
                      width: `${w * 100}%`,
                      height: `${h * 100}%`,
                      background: "rgba(201,168,106,0.28)",
                      border: `1px solid ${GOLD_DARK}`,
                      borderRadius: 1,
                      pointerEvents: "none",
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Piece queue card ────────────────────────────────────────────────────────
function PieceQueueCard({ block, queuePosition }: {
  block: SessionHeroBlock;
  queuePosition: number;
}) {
  const [, navigate] = useLocation();
  return (
    <div style={{
      background: CREAM_WARM,
      border: `1px solid ${BORDER}`,
      borderRadius: 10,
      padding: "18px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      {/* Eyebrow row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 10,
            padding: "4px 10px",
            borderRadius: 999,
            background: CREAM_DEEP,
            color: NAVY,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: "Inter, sans-serif",
          }}>
            Today's queue · {queuePosition}
          </span>
          {block.dayNumber != null && block.totalDays != null && (
            <span style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: MUTED,
              fontFamily: "Inter, sans-serif",
            }}>
              Day {block.dayNumber} of {block.totalDays}
            </span>
          )}
        </div>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          color: MUTED,
          flexShrink: 0,
        }}>
          {block.timeMin} min
        </span>
      </div>

      {/* Title block */}
      <div>
        {block.composerName && (
          <div style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: GOLD_DARK,
            marginBottom: 4,
          }}>
            {block.composerName}
          </div>
        )}
        <div style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 26,
          color: NAVY,
          fontWeight: 400,
          letterSpacing: "-0.01em",
          lineHeight: 1.15,
        }}>
          {block.pieceTitle ?? block.blockName}
        </div>
        {block.movementName && (
          <div style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 14,
            fontStyle: "italic",
            color: MUTED,
            marginTop: 3,
          }}>
            {block.movementName}
          </div>
        )}
      </div>

      {/* Today's pages */}
      {block.todayPageNumbers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <TodayPagesPanel block={block} />
          {(block.todayFocus || block.todayMeasureRange) && (
            <div style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
              padding: "0 2px",
            }}>
              {block.todayFocus && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, flex: 1 }}>
                  <span style={{
                    fontSize: 10,
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 500,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: MUTED,
                    flexShrink: 0,
                  }}>
                    Focus
                  </span>
                  <span style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontStyle: "italic",
                    fontSize: 14,
                    color: NAVY,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {block.todayFocus}
                  </span>
                </div>
              )}
              {block.todayMeasureRange && (
                <span style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontStyle: "italic",
                  fontSize: 13,
                  color: MUTED,
                  flexShrink: 0,
                }}>
                  {block.todayMeasureRange}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Plan progress */}
      {block.progressPercent != null && block.totalDays != null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              color: NAVY,
              fontFamily: "Inter, sans-serif",
            }}>
              Plan progress
            </span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: MUTED,
            }}>
              {block.progressPercent}% · {block.daysRemaining}d left
            </span>
          </div>
          <div style={{
            height: 4,
            borderRadius: 999,
            background: "rgba(15,32,54,0.08)",
            overflow: "hidden",
          }}>
            <div style={{
              width: `${block.progressPercent}%`,
              height: "100%",
              background: GOLD_DARK,
              transition: "width 0.3s",
            }} />
          </div>
        </div>
      )}

      {/* Plan button (anchored to bottom, full width) */}
      <button
        type="button"
        onClick={() => navigate(`/plan/${block.planId}`)}
        style={{
          marginTop: "auto",
          background: CREAM_WARM,
          color: NAVY,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: "12px 22px",
          fontFamily: "Inter, sans-serif",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          transition: "background 0.15s",
          width: "100%",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = CREAM_DEEP; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = CREAM_WARM; }}
      >
        View plan
      </button>
    </div>
  );
}

// ─── Drill queue card (exercise / sight-reading) ─────────────────────────────
function DrillQueueCard({ block, queuePosition }: {
  block: SessionHeroBlock;
  queuePosition: number;
}) {
  const [, navigate] = useLocation();
  return (
    <div style={{
      background: CREAM_WARM,
      border: `1px solid ${BORDER}`,
      borderRadius: 10,
      padding: "18px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
      alignItems: "center",
      textAlign: "center",
    }}>
      {/* Queue eyebrow */}
      <span style={{
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: MUTED,
        fontFamily: "Inter, sans-serif",
      }}>
        Queue · {queuePosition}
      </span>

      {/* Icon tile */}
      <div style={{
        width: 52,
        height: 52,
        borderRadius: 10,
        background: CREAM_DEEP,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: GOLD_DARK,
      }}>
        <BlockIcon blockType={block.blockType} size={22} />
      </div>

      {/* Title + focus (stacked, wrap allowed) */}
      <div style={{ minWidth: 0, width: "100%" }}>
        <div style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 20,
          color: NAVY,
          fontWeight: 400,
          lineHeight: 1.2,
          overflowWrap: "break-word",
        }}>
          {block.blockName}
        </div>
        {block.todayFocus && (
          <div style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: "italic",
            fontSize: 12,
            color: MUTED,
            marginTop: 4,
            overflowWrap: "break-word",
          }}>
            {block.todayFocus}
          </div>
        )}
      </div>

      {/* Time badge */}
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        color: GOLD_DARK,
        background: "rgba(201,168,106,0.12)",
        padding: "3px 10px",
        borderRadius: 999,
      }}>
        {block.timeMin} min
      </span>

      <button
        type="button"
        onClick={() => navigate(`/plan/${block.planId}`)}
        style={{
          marginTop: "auto",
          background: CREAM_WARM,
          color: NAVY,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: "10px 16px",
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          transition: "background 0.15s",
          width: "100%",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = CREAM_DEEP; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = CREAM_WARM; }}
      >
        View plan
      </button>
    </div>
  );
}

// ─── Main SessionHero ────────────────────────────────────────────────────────
export function SessionHero({
  blocks,
  onStart,
}: {
  blocks: SessionHeroBlock[];
  onStart: () => void;
}) {
  const scheduled = blocks.filter((b) => b.isScheduledToday && !b.inSetup);
  const totalMin = scheduled.reduce((s, b) => s + b.timeMin, 0);
  const empty = scheduled.length === 0;
  const optionalCount = blocks.filter((b) => !b.isScheduledToday && !b.inSetup).length;
  const setupCount = blocks.filter((b) => b.inSetup).length;

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
        borderRadius: 14,
        padding: "22px 24px",
        color: CREAM,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        boxShadow: "0 6px 20px rgba(15,32,54,0.18)",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: GOLD,
            marginBottom: 6,
          }}>
            Today's session
          </div>
          <div style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 30,
            fontWeight: 400,
            letterSpacing: "-0.01em",
            lineHeight: 1.1,
            color: CREAM_WARM,
          }}>
            {empty
              ? "Nothing scheduled today"
              : <>
                  {totalMin} <span style={{ fontStyle: "italic", color: MUTED_ON_NAVY, fontSize: 22 }}>minutes</span>
                  {" · "}
                  {scheduled.length} <span style={{ fontStyle: "italic", color: MUTED_ON_NAVY, fontSize: 22 }}>
                    block{scheduled.length === 1 ? "" : "s"}
                  </span>
                </>}
          </div>
        </div>
        <button
          type="button"
          disabled={empty}
          onClick={onStart}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: empty ? "rgba(201,168,106,0.25)" : GOLD,
            color: empty ? MUTED_ON_NAVY : NAVY,
            border: "none",
            borderRadius: 10,
            padding: "12px 24px",
            fontFamily: "Inter, sans-serif",
            fontSize: 14,
            fontWeight: 600,
            cursor: empty ? "not-allowed" : "pointer",
            letterSpacing: "0.01em",
            transition: "background 0.15s",
            boxShadow: empty ? "none" : "0 3px 10px rgba(201,168,106,0.28)",
          }}
          onMouseEnter={(e) => { if (!empty) e.currentTarget.style.background = "#d4b678"; }}
          onMouseLeave={(e) => { if (!empty) e.currentTarget.style.background = GOLD; }}
        >
          <Play size={14} fill="currentColor" /> Start practice
        </button>
      </div>

      {/* Queue cards — grid at ≤3 blocks, horizontal scroll beyond that */}
      {!empty && (
        scheduled.length <= 3 ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: scheduled
              .map((b) => (b.blockType === "piece" ? "minmax(0, 2.4fr)" : "minmax(0, 1fr)"))
              .join(" "),
            gap: 12,
            alignItems: "stretch",
          }}>
            {scheduled.map((block, idx) => (
              block.blockType === "piece" ? (
                <PieceQueueCard key={block.planId} block={block} queuePosition={idx + 1} />
              ) : (
                <DrillQueueCard key={block.planId} block={block} queuePosition={idx + 1} />
              )
            ))}
          </div>
        ) : (
          <div style={{
            display: "flex",
            gap: 12,
            alignItems: "stretch",
            overflowX: "auto",
            overflowY: "hidden",
            scrollSnapType: "x proximity",
            paddingBottom: 6,
            marginBottom: -6,
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "thin",
          }}>
            {scheduled.map((block, idx) => {
              const minWidth = block.blockType === "piece" ? 320 : 148;
              return (
                <div
                  key={block.planId}
                  style={{
                    flex: `0 0 ${minWidth}px`,
                    minWidth,
                    maxWidth: minWidth,
                    display: "flex",
                    scrollSnapAlign: "start",
                  }}
                >
                  {block.blockType === "piece" ? (
                    <PieceQueueCard block={block} queuePosition={idx + 1} />
                  ) : (
                    <DrillQueueCard block={block} queuePosition={idx + 1} />
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Footer hints */}
      {(optionalCount > 0 || setupCount > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {optionalCount > 0 && (
            <div style={{
              fontSize: 11,
              color: MUTED_ON_NAVY,
              fontStyle: "italic",
              fontFamily: "'Cormorant Garamond', serif",
            }}>
              + {optionalCount} optional block{optionalCount === 1 ? "" : "s"} below
            </div>
          )}
          {setupCount > 0 && (
            <div style={{
              fontSize: 11,
              color: MUTED_ON_NAVY,
              fontStyle: "italic",
              fontFamily: "'Cormorant Garamond', serif",
            }}>
              {setupCount} block{setupCount === 1 ? "" : "s"} still in setup
            </div>
          )}
        </div>
      )}
    </div>
  );
}
