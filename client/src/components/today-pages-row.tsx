import { useSheetPageUrl } from "@/lib/sheet-page";

const CREAM_DEEP = "#ede8df";
const BORDER = "#ddd8cc";
const GOLD_DARK = "#96793a";
const MUTED = "#7a7166";

/**
 * Horizontal row of small page thumbnails.
 * Pages listed in todayPageNumbers render with a gold-bordered highlight;
 * the remaining pages up to totalPages render as dim placeholders so the
 * user sees where today's work sits in the context of the whole piece.
 */
export function TodayPagesRow({
  sheetMusicId,
  todayPageNumbers,
  totalPages,
  maxVisible = 6,
}: {
  sheetMusicId: number | null;
  todayPageNumbers: number[];
  totalPages: number | null;
  maxVisible?: number;
}) {
  const pageUrl = useSheetPageUrl(sheetMusicId);
  if (!sheetMusicId || !totalPages || todayPageNumbers.length === 0) return null;

  const activeSet = new Set(todayPageNumbers);
  const firstActive = todayPageNumbers[0];
  const lastActive = todayPageNumbers[todayPageNumbers.length - 1];

  // Build visible window: prefer a window that contains all active pages, padded.
  const windowStart = Math.max(1, firstActive - 1);
  const windowEnd = Math.min(totalPages, Math.max(lastActive + 1, windowStart + maxVisible - 1));
  const pages: number[] = [];
  for (let p = windowStart; p <= windowEnd && pages.length < maxVisible; p++) pages.push(p);

  return (
    <div style={{
      background: CREAM_DEEP,
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      padding: "10px 12px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
      }}>
        <span style={{
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: MUTED,
        }}>
          Today's pages
        </span>
        <span style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 11,
          fontStyle: "italic",
          color: MUTED,
        }}>
          p. {firstActive === lastActive ? firstActive : `${firstActive}\u2013${lastActive}`} of {totalPages}
        </span>
      </div>
      <div style={{
        display: "flex",
        gap: 6,
        alignItems: "stretch",
        height: 84,
      }}>
        {pages.map((pageNum) => {
          const isActive = activeSet.has(pageNum);
          const url = pageUrl(pageNum);
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
                boxShadow: isActive ? "0 2px 6px rgba(150,121,58,0.25)" : "none",
                background: "#fff",
                opacity: isActive ? 1 : 0.42,
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
              <span style={{
                position: "absolute",
                bottom: 2,
                right: 4,
                fontSize: 8,
                fontFamily: "'JetBrains Mono', monospace",
                color: isActive ? GOLD_DARK : MUTED,
                background: "rgba(255,255,255,0.85)",
                padding: "0 3px",
                borderRadius: 2,
              }}>
                {pageNum}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
