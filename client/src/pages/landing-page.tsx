import { useState, useEffect } from "react";
import { Link } from "wouter";

// ─── Design tokens ──────────────────────────────────────────────────────────
const C = {
  cream: "#f5f1ea",
  parchment: "#ede8df",
  border: "#ddd8cc",
  navy: "#0f2036",
  gold: "#c9a86a",
  goldDark: "#96793a",
  muted: "#7a7166",
} as const;

// ─── Ornament SVG ────────────────────────────────────────────────────────────
function Ornament() {
  return (
    <svg
      width="120"
      height="14"
      viewBox="0 0 120 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <line x1="0" y1="7" x2="50" y2="7" stroke={C.gold} strokeWidth="0.75" />
      <polygon points="60,2 64,7 60,12 56,7" fill={C.gold} />
      <line x1="70" y1="7" x2="120" y2="7" stroke={C.gold} strokeWidth="0.75" />
    </svg>
  );
}

// ─── DayMockHero ─────────────────────────────────────────────────────────────
function DayMockHero() {
  const days = Array.from({ length: 36 }, (_, i) => i + 1);
  const flagged = new Set([11, 15, 20]);

  function dayStyle(d: number): React.CSSProperties {
    if (d <= 6)
      return {
        background: C.navy,
        color: "#fff",
        fontWeight: 600,
      };
    if (d === 7)
      return {
        background: C.gold,
        color: C.navy,
        fontWeight: 700,
      };
    if (flagged.has(d))
      return {
        background: "#fbb6b6",
        color: "#7f1d1d",
        fontWeight: 500,
      };
    return {
      background: C.cream,
      color: C.muted,
      border: `1px solid ${C.border}`,
    };
  }

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        borderRadius: 12,
        overflow: "hidden",
        border: `1.5px solid ${C.border}`,
        boxShadow: "0 20px 60px rgba(15,32,54,0.13)",
        display: "flex",
        background: C.cream,
      }}
    >
      {/* Left panel */}
      <div style={{ flex: 1, padding: "36px 36px 32px" }}>
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <span
            style={{
              background: C.gold,
              color: C.navy,
              fontSize: 11,
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "3px 10px",
              borderRadius: 999,
            }}
          >
            Today · 30 min
          </span>
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              color: C.muted,
              letterSpacing: "0.05em",
            }}
          >
            DAY 7 OF 28
          </span>
        </div>

        {/* Composer */}
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: C.muted,
            marginBottom: 6,
          }}
        >
          Ludwig van Beethoven
        </p>

        {/* Piece title */}
        <h3
          className="serif"
          style={{
            fontSize: 28,
            fontWeight: 400,
            color: C.navy,
            lineHeight: 1.15,
            marginBottom: 4,
          }}
        >
          Sonata no. 26 in E♭ major, Op. 81a
        </h3>
        <p
          style={{
            fontFamily: "EB Garamond, serif",
            fontStyle: "italic",
            fontSize: 16,
            color: C.muted,
            marginBottom: 24,
          }}
        >
          i. Adagio — Das Lebewohl
        </p>

        {/* Tasks */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
          {/* Task 1 — done */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderRadius: 6,
              background: "transparent",
              border: `1px solid ${C.border}`,
              opacity: 0.6,
            }}
          >
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                color: C.navy,
              }}
            >
              <span style={{ color: C.muted, marginRight: 6, fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>0 – 8 min</span>
              Hands separate · ms. 13–20, left hand only · ♩ = 60
            </span>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                border: `2px solid ${C.gold}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginLeft: 12,
                background: C.gold,
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              ✓
            </span>
          </div>

          {/* Task 2 — NOW (active) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderRadius: 6,
              background: "rgba(201,168,106,0.12)",
              borderLeft: `4px solid ${C.gold}`,
              border: `1px solid ${C.gold}`,
              borderLeftWidth: 4,
            }}
          >
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                color: C.navy,
                fontWeight: 500,
              }}
            >
              <span style={{ color: C.muted, marginRight: 6, fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>8 – 18 min</span>
              Hands together · ms. 13–20 · slow tempo ♩ = 52
            </span>
            <span
              style={{
                background: C.gold,
                color: C.navy,
                fontSize: 10,
                fontFamily: "Inter, sans-serif",
                fontWeight: 700,
                letterSpacing: "0.12em",
                padding: "2px 8px",
                borderRadius: 999,
                marginLeft: 12,
                flexShrink: 0,
              }}
            >
              NOW
            </span>
          </div>

          {/* Task 3 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 14px",
              borderRadius: 6,
              border: `1px solid ${C.border}`,
            }}
          >
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                color: C.navy,
              }}
            >
              <span style={{ color: C.muted, marginRight: 6, fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>18 – 24 min</span>
              Tempo ramp · ms. 9–12 · gradual 52 → 66
            </span>
          </div>

          {/* Task 4 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 14px",
              borderRadius: 6,
              border: `1px solid ${C.border}`,
            }}
          >
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                color: C.navy,
              }}
            >
              <span style={{ color: C.muted, marginRight: 6, fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>24 – 30 min</span>
              Review · last session's flagged passages (ms. 5–8)
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/auth?tab=register">
            <button
              style={{
                background: C.navy,
                color: C.cream,
                border: "none",
                borderRadius: 4,
                padding: "10px 20px",
                fontSize: 14,
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Continue session →
            </button>
          </Link>
          <button
            style={{
              background: "transparent",
              color: C.navy,
              border: `1.5px solid ${C.border}`,
              borderRadius: 4,
              padding: "10px 20px",
              fontSize: 14,
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            View full plan
          </button>
        </div>
      </div>

      {/* Right panel */}
      <div
        style={{
          width: 280,
          borderLeft: `1.5px solid ${C.border}`,
          padding: "28px 22px",
          background: C.parchment,
          flexShrink: 0,
        }}
      >
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: C.muted,
            marginBottom: 4,
          }}
        >
          Movement Map
        </p>
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 11,
            color: C.muted,
            marginBottom: 18,
          }}
        >
          27 segments · 3 phases complete
        </p>

        {/* Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 4,
            marginBottom: 20,
          }}
        >
          {days.map((d) => (
            <div
              key={d}
              style={{
                aspectRatio: "1",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontFamily: "JetBrains Mono, monospace",
                ...dayStyle(d),
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {[
            { color: C.navy, label: "Completed" },
            { color: C.gold, label: "Today" },
            { color: "#fbb6b6", label: "Flagged by you" },
            { color: C.cream, label: "Upcoming", outline: true },
          ].map(({ color, label, outline }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: color,
                  border: outline ? `1.5px solid ${C.border}` : undefined,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 11,
                  color: C.muted,
                }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Feature figures ─────────────────────────────────────────────────────────
function FigCommunity() {
  return (
    <div
      style={{
        background: C.parchment,
        border: `1.5px solid ${C.border}`,
        borderRadius: 10,
        padding: 24,
        height: 200,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        justifyContent: "center",
      }}
    >
      <p style={{ fontFamily: "Inter", fontSize: 10, color: C.muted, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>
        Measure annotations
      </p>
      {/* Mock score line with colored spans */}
      <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
        {[
          { w: 60, color: C.gold, label: "ms. 1–4" },
          { w: 48, color: "#6baed6", label: "ms. 5–7" },
          { w: 56, color: "#fc8d8d", label: "ms. 8–11" },
          { w: 52, color: C.gold, label: "ms. 12–15" },
        ].map(({ w, color, label }) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: w,
                height: 32,
                background: color,
                opacity: 0.72,
                borderRadius: 4,
              }}
            />
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: C.muted }}>{label}</span>
          </div>
        ))}
      </div>
      <div style={{ height: 2, background: C.border, borderRadius: 1, marginTop: 4 }} />
      <p style={{ fontFamily: "EB Garamond", fontStyle: "italic", fontSize: 13, color: C.muted }}>
        "Stretch the LH here — don't rush the triplet"
      </p>
    </div>
  );
}

function FigPhases() {
  const phases = [
    { name: "Orient", color: "#a0b4d6" },
    { name: "Decode", color: "#7aaed4" },
    { name: "Chunk", color: "#5fa8b0" },
    { name: "Coordinate", color: "#6aaa8a" },
    { name: "Link", color: "#c9a86a" },
    { name: "Stabilize", color: "#c08050" },
    { name: "Shape", color: "#a0503a" },
  ];
  return (
    <div
      style={{
        background: C.parchment,
        border: `1.5px solid ${C.border}`,
        borderRadius: 10,
        padding: 24,
        height: 200,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 6,
      }}
    >
      <p style={{ fontFamily: "Inter", fontSize: 10, color: C.muted, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>
        Learning phases
      </p>
      {phases.map(({ name, color }, i) => (
        <div key={name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              height: 10,
              borderRadius: 999,
              background: color,
              width: `${30 + i * 10}px`,
              opacity: 0.85,
            }}
          />
          <span style={{ fontFamily: "Inter", fontSize: 11, color: C.muted }}>{name}</span>
        </div>
      ))}
    </div>
  );
}

function FigAdapt() {
  return (
    <div
      style={{
        background: C.parchment,
        border: `1.5px solid ${C.border}`,
        borderRadius: 10,
        padding: 24,
        height: 200,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          background: "#fff0f0",
          border: "1.5px solid #f87171",
          borderRadius: 6,
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 18 }}>🚩</span>
        <div>
          <p style={{ fontFamily: "Inter", fontSize: 12, fontWeight: 600, color: "#7f1d1d" }}>ms. 13–17 flagged</p>
          <p style={{ fontFamily: "Inter", fontSize: 11, color: "#b91c1c" }}>Coordination issue — both hands</p>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "rgba(201,168,106,0.15)",
          borderRadius: 6,
          border: `1px solid ${C.border}`,
        }}
      >
        <span style={{ color: C.gold, fontWeight: 700 }}>→</span>
        <span style={{ fontFamily: "Inter", fontSize: 12, color: C.navy }}>Added to next session</span>
      </div>
    </div>
  );
}

function FigTeacher() {
  return (
    <div
      style={{
        background: C.parchment,
        border: `1.5px solid ${C.border}`,
        borderRadius: 10,
        padding: 24,
        height: 200,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 12,
        position: "relative",
      }}
    >
      {/* Mock score bar */}
      <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 40,
              background: i === 3 ? "rgba(253,224,71,0.4)" : C.cream,
              border: `1px solid ${C.border}`,
              borderRadius: 2,
            }}
          />
        ))}
      </div>
      {/* Sticky note */}
      <div
        style={{
          background: "#fde047",
          padding: "10px 14px",
          borderRadius: 4,
          boxShadow: "2px 3px 8px rgba(0,0,0,0.12)",
          transform: "rotate(-1.5deg)",
          maxWidth: 200,
          marginLeft: 16,
        }}
      >
        <p style={{ fontFamily: "EB Garamond", fontStyle: "italic", fontSize: 13, color: "#1a1a1a" }}>
          "Watch the pedaling here — ms. 4"
        </p>
        <p style={{ fontFamily: "Inter", fontSize: 10, color: "#555", marginTop: 4 }}>— Prof. Martinez</p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{ fontFamily: "Inter, sans-serif", color: C.navy }}>
      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: scrolled ? C.cream : "transparent",
          borderBottom: scrolled ? `1px solid ${C.border}` : "none",
          transition: "background 0.25s, border-color 0.25s",
          padding: "0 40px",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Wordmark */}
        <Link href="/">
          <img src="/images/practivo-wordmark.png" alt="Practivo" style={{ height: 34, width: "auto", cursor: "pointer" }} />
        </Link>

        {/* Center links — hidden on mobile */}
        <div
          style={{ display: "flex", gap: 36, alignItems: "center" }}
          className="hidden md:flex"
        >
          {[
            { label: "Library", href: "/" },
            { label: "Method", href: "#method" },
            { label: "For Teachers", href: "#teachers" },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 12,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: C.navy,
                textDecoration: "none",
                opacity: 0.75,
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.opacity = "1")}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.opacity = "0.75")}
            >
              {label}
            </a>
          ))}
        </div>

        {/* Right CTAs */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/auth">
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 14,
                color: C.navy,
                cursor: "pointer",
                opacity: 0.7,
                textDecoration: "none",
              }}
            >
              Sign in
            </span>
          </Link>
          <Link href="/auth?tab=register">
            <button
              style={{
                background: C.navy,
                color: C.cream,
                border: "none",
                borderRadius: 4,
                padding: "8px 20px",
                fontSize: 14,
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: "0.01em",
              }}
            >
              Start learning →
            </button>
          </Link>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section
        style={{
          background: C.cream,
          paddingTop: 80,
          paddingBottom: 80,
          textAlign: "center",
          paddingLeft: 24,
          paddingRight: 24,
        }}
      >
        {/* Eyebrow + ornaments */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
            marginBottom: 32,
          }}
        >
          <Ornament />
          <span
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 11,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: C.goldDark,
            }}
          >
            a method for classical musicians
          </span>
          <Ornament />
        </div>

        {/* Hero heading */}
        <h1
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: "clamp(64px, 10vw, 110px)",
            fontWeight: 400,
            color: C.navy,
            lineHeight: 1.0,
            marginBottom: 0,
          }}
        >
          practice,
        </h1>
        <h1
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: "clamp(64px, 10vw, 110px)",
            fontWeight: 400,
            fontStyle: "italic",
            color: C.goldDark,
            lineHeight: 1.05,
            marginBottom: 32,
          }}
        >
          plotted.
        </h1>

        {/* Subhead */}
        <p
          style={{
            fontFamily: "EB Garamond, serif",
            fontStyle: "italic",
            fontSize: 20,
            color: C.muted,
            maxWidth: 580,
            margin: "0 auto 36px",
            lineHeight: 1.6,
          }}
        >
          Learning plans for classical musicians — adaptive, structured, and built
          around the pieces you actually want to play.
        </p>

        {/* CTAs */}
        <div
          style={{
            display: "flex",
            gap: 14,
            justifyContent: "center",
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <Link href="/auth?tab=register">
            <button
              style={{
                background: C.navy,
                color: C.cream,
                border: "none",
                borderRadius: 6,
                padding: "14px 28px",
                fontSize: 16,
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: "0.01em",
              }}
            >
              Start learning now →
            </button>
          </Link>
          <button
            style={{
              background: "transparent",
              color: C.navy,
              border: `1.5px solid ${C.border}`,
              borderRadius: 6,
              padding: "14px 28px",
              fontSize: 16,
              fontFamily: "Inter, sans-serif",
              fontWeight: 400,
              cursor: "pointer",
            }}
          >
            Watch a 90-sec demo
          </button>
        </div>

        {/* Fine print */}
        <p
          style={{
            fontFamily: "EB Garamond, serif",
            fontStyle: "italic",
            fontSize: 14,
            color: C.muted,
            marginBottom: 56,
          }}
        >
          Free for your first piece · No card needed
        </p>

        {/* Hero mock */}
        <DayMockHero />
      </section>

      {/* ── PHILOSOPHY ──────────────────────────────────────────────────── */}
      <section
        style={{
          background: C.parchment,
          padding: "100px 24px",
          textAlign: "center",
          borderTop: `1px solid ${C.border}`,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <Ornament />
        </div>
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 11,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: C.muted,
            marginBottom: 32,
          }}
        >
          The Thesis
        </p>
        <blockquote
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: "clamp(28px, 4vw, 44px)",
            fontWeight: 400,
            color: C.navy,
            maxWidth: 780,
            margin: "0 auto 32px",
            lineHeight: 1.45,
          }}
        >
          "Other practice apps are{" "}
          <em style={{ color: C.goldDark }}>too hand-holdy</em>.{" "}
          <br />
          Notion is <em style={{ color: C.goldDark }}>too hands-off</em>.{" "}
          <br />
          Practivo is the{" "}
          <span
            style={{
              position: "relative",
              display: "inline-block",
            }}
          >
            <span
              style={{
                position: "absolute",
                bottom: 2,
                left: 0,
                right: 0,
                height: 6,
                background: "rgba(253,224,71,0.5)",
                zIndex: 0,
                borderRadius: 2,
              }}
            />
            <span style={{ position: "relative", zIndex: 1 }}>sweet spot</span>
          </span>
          ."
        </blockquote>
        <p
          style={{
            fontFamily: "EB Garamond, serif",
            fontStyle: "italic",
            fontSize: 18,
            color: C.muted,
            maxWidth: 600,
            margin: "0 auto",
            lineHeight: 1.65,
          }}
        >
          The structure of a conservatory method. The adaptivity of a good
          teacher. The convenience of an app that lives on your music stand.
        </p>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────── */}
      <section
        id="features"
        style={{
          background: C.cream,
          padding: "100px 24px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          {/* Section header */}
          <div style={{ textAlign: "center", marginBottom: 72 }}>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: C.muted,
                marginBottom: 16,
              }}
            >
              What makes it different
            </p>
            <h2
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: "clamp(36px, 5vw, 54px)",
                fontWeight: 400,
                color: C.navy,
                lineHeight: 1.15,
              }}
            >
              A method,{" "}
              <em style={{ color: C.goldDark }}>not just an app.</em>
            </h2>
          </div>

          {/* Feature rows */}
          {[
            {
              num: "I",
              eyebrow: "Community-annotated scores",
              title: "Broken down by musicians who've played it.",
              body: "Every piece in the library is annotated, measure by measure, by real performers.",
              fig: <FigCommunity />,
              flip: false,
            },
            {
              num: "II",
              eyebrow: "Seven pedagogical phases",
              title: "The path from reading to polished — named.",
              body: "Read-through → hands separate → hands together → tempo ramps → dynamics → stringing sections → polish.",
              fig: <FigPhases />,
              flip: true,
            },
            {
              num: "III",
              eyebrow: "Adaptive scheduling",
              title: "The plan bends around passages you're struggling with.",
              body: "Mark what didn't feel right. Practivo weights those measures into tomorrow's session, and the next, until they land.",
              fig: <FigAdapt />,
              flip: false,
            },
            {
              num: "IV",
              eyebrow: "Teacher–student sync",
              title: "The shared notebook between lessons.",
              body: "Teachers build and assign plans per student, leave annotations on specific measures, and see exactly what happened in practice.",
              fig: <FigTeacher />,
              flip: true,
            },
          ].map(({ num, eyebrow, title, body, fig, flip }) => (
            <div
              key={num}
              style={{
                display: "flex",
                flexDirection: flip ? "row-reverse" : "row",
                alignItems: "center",
                gap: 64,
                marginBottom: 80,
              }}
            >
              {/* Text side */}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 12 }}>
                  <span
                    style={{
                      fontFamily: "Cormorant Garamond, serif",
                      fontStyle: "italic",
                      fontSize: 28,
                      color: C.gold,
                      lineHeight: 1,
                    }}
                  >
                    {num}
                  </span>
                  <span
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: 11,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      color: C.muted,
                    }}
                  >
                    {eyebrow}
                  </span>
                </div>
                <h2
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: "clamp(28px, 3.5vw, 44px)",
                    fontWeight: 400,
                    color: C.navy,
                    lineHeight: 1.2,
                    marginBottom: 16,
                  }}
                >
                  {title}
                </h2>
                <p
                  style={{
                    fontFamily: "EB Garamond, serif",
                    fontSize: 18,
                    color: C.muted,
                    lineHeight: 1.7,
                  }}
                >
                  {body}
                </p>
              </div>

              {/* Figure side */}
              <div style={{ flex: 1 }}>{fig}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── DAY SECTION ─────────────────────────────────────────────────── */}
      <section
        style={{
          background: C.parchment,
          padding: "100px 24px",
          borderBottom: `1px solid ${C.border}`,
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 11,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: C.muted,
            marginBottom: 20,
          }}
        >
          A day in Practivo
        </p>
        <h2
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: "clamp(36px, 5vw, 56px)",
            fontWeight: 400,
            color: C.navy,
            lineHeight: 1.15,
            marginBottom: 16,
          }}
        >
          Thirty minutes,{" "}
          <em style={{ color: C.goldDark }}>planned for you.</em>
        </h2>
        <p
          style={{
            fontFamily: "EB Garamond, serif",
            fontStyle: "italic",
            fontSize: 18,
            color: C.muted,
            marginBottom: 56,
          }}
        >
          You don't have to decide what to work on — only whether to show up.
        </p>
        <DayMockHero />
      </section>

      {/* ── METHOD ──────────────────────────────────────────────────────── */}
      <section
        id="method"
        style={{
          background: C.cream,
          padding: "100px 24px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: C.muted,
                marginBottom: 16,
              }}
            >
              The Method · In Full
            </p>
            <h2
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: "clamp(32px, 4.5vw, 48px)",
                fontWeight: 400,
                color: C.navy,
                lineHeight: 1.2,
              }}
            >
              Seven <em style={{ color: C.goldDark }}>phases</em>.
              <br />
              One <em style={{ color: C.goldDark }}>piece</em>.
            </h2>
          </div>

          {/* Phase table */}
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            {[
              {
                roman: "I",
                phase: "Orient",
                desc: "Sight-read the whole piece at comfort tempo.",
                dur: "2–4 sessions",
              },
              {
                roman: "II",
                phase: "Decode",
                desc: "Left hand, then right — to confidence at half-tempo.",
                dur: "6–10 sessions",
              },
              {
                roman: "III",
                phase: "Chunk",
                desc: "Tempo is not a goal yet; coordination is.",
                dur: "8–14 sessions",
              },
              {
                roman: "IV",
                phase: "Coordinate",
                desc: "Incremental BPM increases — only when the last step is solid.",
                dur: "5–8 sessions",
              },
              {
                roman: "V",
                phase: "Link",
                desc: "The piece starts sounding like music, not notes.",
                dur: "4–7 sessions",
              },
              {
                roman: "VI",
                phase: "Stabilize",
                desc: "Chunks connect. The first sixteen bars memorized together.",
                dur: "3–6 sessions",
              },
              {
                roman: "VII",
                phase: "Shape",
                desc: "Recording reviews, passage audits, performance readiness.",
                dur: "4–8 sessions",
              },
            ].map(({ roman, phase, desc, dur }) => (
              <div
                key={roman}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 180px 1fr 120px",
                  alignItems: "center",
                  gap: 24,
                  padding: "22px 0",
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <span
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontStyle: "italic",
                    fontSize: 30,
                    color: C.gold,
                    lineHeight: 1,
                  }}
                >
                  {roman}
                </span>
                <span
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: 24,
                    color: C.navy,
                    fontWeight: 400,
                  }}
                >
                  {phase}
                </span>
                <span
                  style={{
                    fontFamily: "EB Garamond, serif",
                    fontStyle: "italic",
                    fontSize: 16,
                    color: C.muted,
                    lineHeight: 1.5,
                  }}
                >
                  {desc}
                </span>
                <span
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 11,
                    color: C.muted,
                    textAlign: "right",
                  }}
                >
                  {dur}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TEACHER / STUDENT ────────────────────────────────────────────── */}
      <section
        id="teachers"
        style={{
          background: C.navy,
          padding: "100px 24px",
          borderBottom: `1px solid rgba(255,255,255,0.07)`,
        }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: C.gold,
                marginBottom: 16,
              }}
            >
              Two ways in
            </p>
            <h2
              style={{
                fontFamily: "Cormorant Garamond, serif",
                fontSize: "clamp(36px, 5vw, 52px)",
                fontWeight: 400,
                color: C.cream,
                lineHeight: 1.15,
              }}
            >
              Alone, or <em style={{ color: C.gold }}>together.</em>
            </h2>
          </div>

          {/* Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 24,
            }}
          >
            {/* Student card */}
            <div
              style={{
                border: `1.5px solid rgba(255,255,255,0.15)`,
                borderRadius: 10,
                padding: "40px 36px",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  fontFamily: "Inter, sans-serif",
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: C.gold,
                  border: `1px solid ${C.gold}`,
                  borderRadius: 999,
                  padding: "3px 10px",
                  marginBottom: 20,
                }}
              >
                For Students
              </span>
              <h3
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 30,
                  fontWeight: 400,
                  color: C.cream,
                  marginBottom: 24,
                  lineHeight: 1.2,
                }}
              >
                A method in your pocket.
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  "Upload your score — we detect every bar",
                  "Structured learning plans built on your timeline",
                  "Flag hard passages; the plan adapts",
                  "Track milestones from sight-read to performance",
                ].map((item) => (
                  <li
                    key={item}
                    style={{
                      display: "flex",
                      gap: 12,
                      fontFamily: "EB Garamond, serif",
                      fontSize: 16,
                      color: "rgba(245,241,234,0.8)",
                      lineHeight: 1.55,
                    }}
                  >
                    <span style={{ color: C.gold, flexShrink: 0 }}>→</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/auth?tab=register">
                <button
                  style={{
                    background: "transparent",
                    color: C.gold,
                    border: `1.5px solid ${C.gold}`,
                    borderRadius: 6,
                    padding: "11px 24px",
                    fontSize: 14,
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Start as a student →
                </button>
              </Link>
            </div>

            {/* Teacher card */}
            <div
              style={{
                border: `1.5px solid ${C.border}`,
                borderRadius: 10,
                padding: "40px 36px",
                background: C.cream,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  fontFamily: "Inter, sans-serif",
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: C.goldDark,
                  border: `1px solid ${C.goldDark}`,
                  borderRadius: 999,
                  padding: "3px 10px",
                  marginBottom: 20,
                }}
              >
                For Teachers
              </span>
              <h3
                style={{
                  fontFamily: "Cormorant Garamond, serif",
                  fontSize: 30,
                  fontWeight: 400,
                  color: C.navy,
                  marginBottom: 24,
                  lineHeight: 1.2,
                }}
              >
                Your studio, running on its own.
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  "Build and assign plans to any student",
                  "Leave measure-level annotations before lessons",
                  "See exactly what was practiced and for how long",
                  "Track progress across your entire studio",
                ].map((item) => (
                  <li
                    key={item}
                    style={{
                      display: "flex",
                      gap: 12,
                      fontFamily: "EB Garamond, serif",
                      fontSize: 16,
                      color: C.muted,
                      lineHeight: 1.55,
                    }}
                  >
                    <span style={{ color: C.goldDark, flexShrink: 0 }}>→</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/auth?tab=register">
                <button
                  style={{
                    background: C.navy,
                    color: C.cream,
                    border: "none",
                    borderRadius: 6,
                    padding: "11px 24px",
                    fontSize: 14,
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Start as a teacher →
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── CLOSING CTA ─────────────────────────────────────────────────── */}
      <section
        style={{
          background: C.cream,
          padding: "100px 24px",
          textAlign: "center",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <Ornament />
        </div>
        <h2
          style={{
            fontFamily: "Cormorant Garamond, serif",
            fontSize: "clamp(48px, 7vw, 80px)",
            fontWeight: 400,
            color: C.navy,
            lineHeight: 1.1,
            marginBottom: 24,
          }}
        >
          Open the score.
          <br />
          <em style={{ color: C.goldDark }}>We'll take it from here.</em>
        </h2>
        <p
          style={{
            fontFamily: "EB Garamond, serif",
            fontStyle: "italic",
            fontSize: 18,
            color: C.muted,
            marginBottom: 40,
          }}
        >
          Your first piece is free. No card, no trial timer.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/auth?tab=register">
            <button
              style={{
                background: C.navy,
                color: C.cream,
                border: "none",
                borderRadius: 6,
                padding: "14px 28px",
                fontSize: 16,
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Start learning now →
            </button>
          </Link>
          <Link href="/">
            <button
              style={{
                background: "transparent",
                color: C.navy,
                border: `1.5px solid ${C.border}`,
                borderRadius: 6,
                padding: "14px 28px",
                fontSize: 16,
                fontFamily: "Inter, sans-serif",
                fontWeight: 400,
                cursor: "pointer",
              }}
            >
              Browse the library
            </button>
          </Link>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer
        style={{
          background: C.cream,
          borderTop: `1px solid ${C.border}`,
          padding: "40px 40px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          {/* Wordmark + tagline */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <img src="/images/practivo-wordmark.png" alt="Practivo" style={{ height: 28, width: "auto" }} />
            <span
              style={{
                fontFamily: "EB Garamond, serif",
                fontStyle: "italic",
                fontSize: 13,
                color: C.muted,
              }}
            >
              The practice method for classical musicians.
            </span>
          </div>

          {/* Nav links */}
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            {[
              { label: "Library", href: "/" },
              { label: "Method", href: "#method" },
              { label: "For Teachers", href: "#teachers" },
              { label: "About", href: "#" },
              { label: "Contact", href: "#" },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 13,
                  color: C.muted,
                  textDecoration: "none",
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.color = C.navy)}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.color = C.muted)}
              >
                {label}
              </a>
            ))}
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              color: C.muted,
              opacity: 0.7,
            }}
          >
            © 2025 Practivo. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
