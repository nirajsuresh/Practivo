import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Music, Dumbbell, Shuffle, ChevronLeft, Loader2 } from "lucide-react";

// ─── Design tokens (match home-page) ────────────────────────────────────────
const CREAM = "#f5f1ea";
const CREAM_WARM = "#fffbf2";
const CREAM_DEEP = "#ede8df";
const BORDER = "#ddd8cc";
const NAVY = "#0f2036";
const GOLD = "#c9a86a";
const GOLD_DARK = "#96793a";
const MUTED = "#7a7166";

// ─── Types ───────────────────────────────────────────────────────────────────

type BlockType = "piece" | "exercise" | "sight_reading";
type Cadence = "daily" | "weekdays" | "weekends" | "custom";

const CADENCE_LABELS: Record<Cadence, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekends: "Weekends",
  custom: "Custom",
};

const WEEKDAYS = [
  { label: "Su", full: "Sunday",    dow: 0 },
  { label: "Mo", full: "Monday",    dow: 1 },
  { label: "Tu", full: "Tuesday",   dow: 2 },
  { label: "We", full: "Wednesday", dow: 3 },
  { label: "Th", full: "Thursday",  dow: 4 },
  { label: "Fr", full: "Friday",    dow: 5 },
  { label: "Sa", full: "Saturday",  dow: 6 },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface AddBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPieceSelected: () => void; // caller opens AddPieceDialog + wizard
}

// ─── Block type card ─────────────────────────────────────────────────────────

function TypeCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        background: hovered ? "#fff" : CREAM_WARM,
        border: `1.5px solid ${hovered ? GOLD : BORDER}`,
        borderRadius: 12,
        padding: "24px 20px",
        textAlign: "center",
        cursor: "pointer",
        transition: "border-color 0.15s, transform 0.15s, box-shadow 0.15s",
        transform: hovered ? "translateY(-2px)" : "none",
        boxShadow: hovered ? "0 6px 20px rgba(0,0,0,0.07)" : "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: hovered ? GOLD : CREAM_DEEP,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.15s",
        color: hovered ? NAVY : GOLD_DARK,
      }}>
        {icon}
      </div>
      <div>
        <div style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 18,
          color: NAVY,
          fontWeight: 400,
          marginBottom: 4,
        }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.4 }}>
          {description}
        </div>
      </div>
    </button>
  );
}

// ─── Cadence + time form (shared by Exercise and Sight-reading) ───────────────

function StubBlockForm({
  blockType,
  onSubmit,
  isPending,
  onBack,
}: {
  blockType: "exercise" | "sight_reading";
  onSubmit: (minutes: number, cadence: Cadence, cadenceDays: number[]) => void;
  isPending: boolean;
  onBack: () => void;
}) {
  const [minutes, setMinutes] = useState(15);
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [customDays, setCustomDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const toggleDay = (dow: number) => {
    setCustomDays((prev) =>
      prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow].sort(),
    );
  };

  const handleSubmit = () => {
    const days = cadence === "custom" ? customDays : [];
    onSubmit(minutes, cadence, days);
  };

  const label = blockType === "exercise" ? "Exercises" : "Sight-reading";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Time allocation */}
      <div>
        <div style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 11,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: MUTED,
          marginBottom: 12,
        }}>
          Daily time allocation
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <Slider
              min={5}
              max={60}
              step={5}
              value={[minutes]}
              onValueChange={([v]) => setMinutes(v)}
            />
          </div>
          <div style={{
            minWidth: 54,
            textAlign: "right",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 18,
            color: NAVY,
          }}>
            {minutes}<span style={{ fontSize: 12, color: MUTED, marginLeft: 2 }}>min</span>
          </div>
        </div>
      </div>

      {/* Cadence */}
      <div>
        <div style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 11,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: MUTED,
          marginBottom: 12,
        }}>
          Schedule
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(Object.keys(CADENCE_LABELS) as Cadence[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCadence(c)}
              style={{
                padding: "6px 16px",
                borderRadius: 20,
                border: `1px solid ${cadence === c ? NAVY : BORDER}`,
                background: cadence === c ? NAVY : "transparent",
                color: cadence === c ? "#fff" : MUTED,
                fontFamily: "Inter, sans-serif",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {CADENCE_LABELS[c]}
            </button>
          ))}
        </div>

        {cadence === "custom" && (
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            {WEEKDAYS.map(({ label: dayLabel, full, dow }) => {
              const active = customDays.includes(dow);
              return (
                <button
                  key={dow}
                  type="button"
                  title={full}
                  onClick={() => toggleDay(dow)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    border: `1px solid ${active ? GOLD_DARK : BORDER}`,
                    background: active ? GOLD : "transparent",
                    color: active ? NAVY : MUTED,
                    fontFamily: "Inter, sans-serif",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {dayLabel}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button
          type="button"
          onClick={onBack}
          disabled={isPending}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "transparent",
            color: MUTED,
            border: `1px solid ${BORDER}`,
            fontFamily: "Inter, sans-serif",
            fontSize: 13,
            padding: "10px 18px",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          <ChevronLeft size={14} /> Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || (cadence === "custom" && customDays.length === 0)}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: NAVY,
            color: CREAM,
            border: "none",
            fontFamily: "Inter, sans-serif",
            fontSize: 13,
            fontWeight: 600,
            padding: "10px 18px",
            borderRadius: 8,
            cursor: isPending ? "default" : "pointer",
            opacity: isPending ? 0.7 : 1,
          }}
        >
          {isPending ? (
            <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Adding…</>
          ) : (
            `Add ${label} block`
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

export function AddBlockDialog({ open, onOpenChange, onPieceSelected }: AddBlockDialogProps) {
  const [step, setStep] = useState<"pick" | "exercise" | "sight_reading">("pick");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;

  const createBlock = useMutation({
    mutationFn: async (body: object) => {
      return apiRequest("POST", "/api/blocks", { ...body, userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/home/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/practice/today"] });
      onOpenChange(false);
      setStep("pick");
    },
    onError: () => {
      toast({ title: "Couldn't add block", variant: "destructive" });
    },
  });

  const handleClose = (v: boolean) => {
    if (!v) setStep("pick");
    onOpenChange(v);
  };

  const handleStubSubmit = (minutes: number, cadence: Cadence, cadenceDays: number[]) => {
    createBlock.mutate({
      blockType: step as "exercise" | "sight_reading",
      cadence,
      cadenceDays: cadenceDays.length > 0 ? cadenceDays : undefined,
      dailyPracticeMinutes: minutes,
    });
  };

  const titleMap: Record<typeof step, string> = {
    pick: "Add a learning block",
    exercise: "Exercises",
    sight_reading: "Sight-reading",
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent style={{ background: CREAM, border: `1px solid ${BORDER}`, maxWidth: 560 }}>
        <DialogHeader>
          <DialogTitle style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 22,
            fontWeight: 400,
            color: NAVY,
            letterSpacing: "-0.01em",
          }}>
            {titleMap[step]}
          </DialogTitle>
        </DialogHeader>

        <div style={{ padding: "4px 0 8px" }}>
          {step === "pick" && (
            <div style={{ display: "flex", gap: 12 }}>
              <TypeCard
                icon={<Dumbbell size={22} />}
                title="Exercises"
                description="Scales, arpeggios, Hanon, and technique work"
                onClick={() => setStep("exercise")}
              />
              <TypeCard
                icon={<Music size={22} />}
                title="Piece"
                description="Structured learning plan for a specific piece"
                onClick={() => {
                  onOpenChange(false);
                  setStep("pick");
                  onPieceSelected();
                }}
              />
              <TypeCard
                icon={<Shuffle size={22} />}
                title="Sight-reading"
                description="Daily sight-reading practice session"
                onClick={() => setStep("sight_reading")}
              />
            </div>
          )}

          {(step === "exercise" || step === "sight_reading") && (
            <StubBlockForm
              blockType={step}
              onSubmit={handleStubSubmit}
              isPending={createBlock.isPending}
              onBack={() => setStep("pick")}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
