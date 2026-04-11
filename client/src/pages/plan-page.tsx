import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { measuresUsePageGeometry, sheetPageImageUrl } from "@/lib/sheet-page";

type LearningPlan = {
  id: number;
  repertoireEntryId: number;
  sheetMusicId: number | null;
  dailyPracticeMinutes: number;
  targetCompletionDate: string | null;
  totalMeasures: number | null;
  status: string;
};

type SessionTask = { text: string; tag?: string };
type SessionSection = {
  type: string;
  label: string;
  durationMin?: number;
  tasks: SessionTask[];
};

type LessonDay = {
  id: number;
  scheduledDate: string;
  measureStart: number;
  measureEnd: number;
  status: string;
  userNotes: string | null;
  completedAt: string | null;
  tasks: SessionSection[] | null;
};

type NormBox = { x: number; y: number; w: number; h: number };

type MeasureRow = {
  id: number;
  measureNumber: number;
  pageNumber: number | null;
  boundingBox: NormBox | null;
  imageUrl: string | null;
};

/** Full-page preview dialog (geometry-based scores). */
type PageReviewOpen = {
  mode: "page";
  sheetId: number;
  pageNumbers: number[];
  pageIndex: number;
  measures: MeasureRow[];
  dayLabel: string;
  rangeLabel: string;
};

/** Legacy cropped-bar carousel. */
type BarReviewOpen = {
  mode: "bar";
  thumbs: MeasureRow[];
  index: number;
  dayLabel: string;
  rangeLabel: string;
};

type ScoreReviewOpen = PageReviewOpen | BarReviewOpen;

export default function PlanPage() {
  const params = useParams<{ planId: string }>();
  const planId = parseInt(params.planId ?? "", 10);

  const { data: plan, isLoading: planLoading, isError: planError } = useQuery<LearningPlan | null>({
    queryKey: [`/api/learning-plans/${planId}`],
    enabled: Number.isFinite(planId) && planId > 0,
  });

  const { data: lessons = [], isLoading: lessonsLoading } = useQuery<LessonDay[]>({
    queryKey: [`/api/learning-plans/${planId}/lessons`],
    enabled: Number.isFinite(planId) && planId > 0 && !!plan,
  });

  const sheetId = plan?.sheetMusicId ?? null;

  const { data: measures = [] } = useQuery<MeasureRow[]>({
    queryKey: [`/api/sheet-music/${sheetId}/measures`],
    enabled: sheetId != null && sheetId > 0,
  });

  const byNumber = new Map(measures.map((m) => [m.measureNumber, m]));

  const [scoreReview, setScoreReview] = useState<ScoreReviewOpen | null>(null);

  useEffect(() => {
    if (!scoreReview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      setScoreReview((br) => {
        if (!br) return br;
        if (br.mode === "page") {
          if (br.pageNumbers.length <= 1) return br;
          const delta = e.key === "ArrowLeft" ? -1 : 1;
          const next = (br.pageIndex + delta + br.pageNumbers.length) % br.pageNumbers.length;
          return { ...br, pageIndex: next };
        }
        if (br.thumbs.length <= 1) return br;
        const delta = e.key === "ArrowLeft" ? -1 : 1;
        const next = (br.index + delta + br.thumbs.length) % br.thumbs.length;
        return { ...br, index: next };
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scoreReview]);

  const pageReviewCurrent =
    scoreReview?.mode === "page" ? scoreReview.pageNumbers[scoreReview.pageIndex] : undefined;
  const barReviewCurrent =
    scoreReview?.mode === "bar" ? scoreReview.thumbs[scoreReview.index] : undefined;

  if (!Number.isFinite(planId) || planId <= 0) {
    return (
      <Layout>
        <div className="container max-w-3xl mx-auto px-4 py-12">
          <p className="text-muted-foreground">Invalid plan.</p>
          <Button variant="link" asChild className="mt-2 px-0">
            <Link href="/profile">Back to profile</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const sortedLessons = [...lessons].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const nextLesson = sortedLessons.find((l) => l.status !== "completed");
  const todayIso = new Date().toISOString().slice(0, 10);

  const showMissing = !planLoading && (planError || plan === null);

  return (
    <Layout>
      <div className="container max-w-3xl mx-auto px-4 py-8 pb-20">
        <Button variant="ghost" size="sm" className="mb-6 gap-1 -ml-2" asChild>
          <Link href="/profile">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
        </Button>

        {showMissing && (
          <div className="mb-8 rounded-lg border border-border bg-card p-6">
            <p className="text-muted-foreground">We couldn&apos;t load this plan.</p>
            <Button variant="link" asChild className="mt-2 px-0">
              <Link href="/profile">Back to profile</Link>
            </Button>
          </div>
        )}

        {planLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : plan ? (
          <>
            <h1 className="font-serif text-2xl font-semibold tracking-tight">Learning plan</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {plan.targetCompletionDate && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Target {new Date(plan.targetCompletionDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              )}
              <span>{plan.dailyPracticeMinutes} min/day</span>
              {plan.totalMeasures != null && <span>{plan.totalMeasures} bars</span>}
            </div>
          </>
        ) : null}

        {plan && (
        <div className="mt-8 space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Days</h2>
          {lessonsLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          )}
          {!lessonsLoading && sortedLessons.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No lesson days yet. Finish creating your plan from the piece sidebar, or regenerate lessons from the wizard.
            </p>
          )}
          {sortedLessons.map((lesson, idx) => {
            const thumbs: MeasureRow[] = [];
            for (let n = lesson.measureStart; n <= lesson.measureEnd; n++) {
              const m = byNumber.get(n);
              if (m) thumbs.push(m);
            }
            const label = new Date(lesson.scheduledDate + "T12:00:00").toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
            const dayLabel = `Day ${idx + 1} · ${label}`;
            const rangeLabel =
              lesson.measureEnd !== lesson.measureStart
                ? `Bars ${lesson.measureStart}–${lesson.measureEnd}`
                : `Bar ${lesson.measureStart}`;
            const sortedPageNums =
              sheetId != null && measuresUsePageGeometry(thumbs)
                ? Array.from(new Set(thumbs.map((m) => m.pageNumber!))).sort((a, b) => a - b)
                : null;

            const isDone = lesson.status === "completed";
            const isNext = lesson.id === nextLesson?.id;
            const isToday = lesson.scheduledDate === todayIso;

            return (
              <Collapsible
                key={lesson.id}
                defaultOpen={isNext || idx === 0}
                className={cn(
                  "rounded-lg border bg-card overflow-hidden",
                  isDone && "border-l-2 border-l-[#729E8F]",
                  isNext && !isDone && "border-l-2 border-l-[#C8B388]",
                  !isDone && !isNext && "opacity-70",
                )}
              >
                <div className="flex items-stretch gap-2 sm:gap-3 p-2 sm:p-3">
                  <CollapsibleTrigger className="flex flex-1 min-w-0 items-center justify-between gap-3 px-2 sm:px-3 py-2 text-left hover:bg-muted/40 rounded-lg transition-colors [&[data-state=open]>svg:first-of-type]:rotate-180">
                    <div className="flex items-center gap-2 min-w-0">
                      <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground transition-transform" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm flex items-center gap-1.5 flex-wrap">
                          Day {idx + 1}
                          {isDone && (
                            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#729E8F]/12 text-[#3d7065] border border-[#729E8F]/35">
                              Done
                            </span>
                          )}
                          {isNext && !isDone && (
                            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#DCCAA6]/35 text-[#6b5732] border border-[#C8B388]/50">
                              {isToday ? "Today" : "Next"}
                            </span>
                          )}
                          <span className="text-muted-foreground font-normal">· {label}</span>
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          Bars {lesson.measureStart}
                          {lesson.measureEnd !== lesson.measureStart ? `–${lesson.measureEnd}` : ""}
                        </p>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <Button
                    size="lg"
                    className={cn(
                      "shrink-0 gap-2 px-4 sm:px-5 font-semibold",
                      isDone && "shadow-none bg-muted text-muted-foreground hover:bg-muted",
                      isNext && !isDone && "shadow-md",
                    )}
                    asChild
                  >
                    <Link href={`/session/${lesson.id}`} title="Open practice session for this day">
                      Session
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </Button>
                </div>

                <CollapsibleContent>
                  <div className="border-t border-border/60">
                    {/* Structured session sections */}
                    {lesson.tasks && lesson.tasks.length > 0 ? (
                      lesson.tasks.map((section, sIdx) => (
                        <div key={section.type} className={cn(sIdx > 0 && "border-t border-border/40")}>
                          {/* Section header */}
                          <div className="px-4 pt-3 pb-1 flex items-baseline gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{section.label}</p>
                            {section.durationMin && (
                              <span className="text-[10px] text-muted-foreground/60">{section.durationMin} min</span>
                            )}
                          </div>
                          {/* Task list */}
                          <div className="px-4 pb-3 space-y-1.5">
                            {section.tasks.map((task, tIdx) => (
                              <div key={tIdx} className="flex items-start gap-2.5">
                                <div className={cn(
                                  "mt-[3px] w-3.5 h-3.5 shrink-0 rounded-sm border flex items-center justify-center",
                                  isDone
                                    ? "border-[#729E8F] bg-[#729E8F]/15"
                                    : "border-border bg-transparent",
                                )}>
                                  {isDone && (
                                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                      <path d="M1.5 4L3 5.5L6.5 2" stroke="#729E8F" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  )}
                                </div>
                                <span className={cn(
                                  "text-xs leading-snug",
                                  isDone ? "text-muted-foreground line-through" : "text-foreground/85",
                                )}>{task.text}</span>
                                {task.tag && (
                                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60 italic">{task.tag}</span>
                                )}
                              </div>
                            ))}
                          </div>
                          {/* Bar thumbnails inside piece_practice section */}
                          {section.type === "piece_practice" && (
                            <div className="px-4 pb-4 pt-0">
                              {thumbs.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-1">
                                  {sheetId == null
                                    ? "No score linked — page preview unavailable."
                                    : "No measures in this range."}
                                </p>
                              ) : sortedPageNums != null ? (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {sortedPageNums.map((pageNum, pi) => (
                                    <button
                                      key={pageNum}
                                      type="button"
                                      className={cn(
                                        "w-[min(112px,28vw)] shrink-0 rounded-md border border-border overflow-hidden bg-muted/30 text-left",
                                        "cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                      )}
                                      title={`Page ${pageNum} — bars for this day outlined in preview`}
                                      onClick={() =>
                                        setScoreReview({
                                          mode: "page",
                                          sheetId: sheetId!,
                                          pageNumbers: sortedPageNums,
                                          pageIndex: pi,
                                          measures: thumbs,
                                          dayLabel,
                                          rangeLabel,
                                        })
                                      }
                                    >
                                      <img
                                        src={sheetPageImageUrl(sheetId!, pageNum)}
                                        alt={`Page ${pageNum}`}
                                        className="w-full h-32 object-cover object-top pointer-events-none bg-white"
                                      />
                                      <div className="text-[10px] text-center py-0.5 bg-muted/50 text-muted-foreground">
                                        p.{pageNum}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {thumbs.map((m, thumbIdx) => (
                                    <button
                                      key={m.id}
                                      type="button"
                                      className={cn(
                                        "w-[72px] shrink-0 rounded-md border border-border overflow-hidden bg-muted/30 text-left",
                                        "cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                      )}
                                      title={`Bar ${m.measureNumber} — click to view`}
                                      onClick={() =>
                                        setScoreReview({
                                          mode: "bar",
                                          thumbs,
                                          index: thumbIdx,
                                          dayLabel,
                                          rangeLabel,
                                        })
                                      }
                                    >
                                      {m.imageUrl ? (
                                        <img
                                          src={m.imageUrl}
                                          alt={`Bar ${m.measureNumber}`}
                                          className="w-full h-16 object-cover object-top pointer-events-none"
                                        />
                                      ) : (
                                        <div className="h-16 flex items-center justify-center text-[10px] text-muted-foreground px-1 text-center">
                                          Bar {m.measureNumber}
                                        </div>
                                      )}
                                      <div className="text-[10px] text-center py-0.5 bg-muted/50 text-muted-foreground">
                                        {m.measureNumber}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      /* Fallback when no structured tasks (old lessons or no tasks column) */
                      <>
                        <div className="px-4 pt-3 pb-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Warmup</p>
                        </div>
                        <div className="px-4 pb-2">
                          <p className="text-xs text-muted-foreground italic">Scales, arpeggios, or exercises of your choice</p>
                        </div>
                        <div className="px-4 pt-2 pb-1 border-t border-border/40">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Piece Practice</p>
                        </div>
                        <div className="px-4 pb-4 pt-1">
                          {thumbs.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2">
                              {sheetId == null ? "No score linked to this plan — page preview unavailable." : "No measures in this range."}
                            </p>
                          ) : sortedPageNums != null ? (
                            <div className="flex flex-wrap gap-2">
                              {sortedPageNums.map((pageNum, pi) => (
                                <button
                                  key={pageNum}
                                  type="button"
                                  className={cn(
                                    "w-[min(112px,28vw)] shrink-0 rounded-md border border-border overflow-hidden bg-muted/30 text-left",
                                    "cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  )}
                                  title={`Page ${pageNum}`}
                                  onClick={() =>
                                    setScoreReview({
                                      mode: "page",
                                      sheetId: sheetId!,
                                      pageNumbers: sortedPageNums,
                                      pageIndex: pi,
                                      measures: thumbs,
                                      dayLabel,
                                      rangeLabel,
                                    })
                                  }
                                >
                                  <img
                                    src={sheetPageImageUrl(sheetId!, pageNum)}
                                    alt={`Page ${pageNum}`}
                                    className="w-full h-32 object-cover object-top pointer-events-none bg-white"
                                  />
                                  <div className="text-[10px] text-center py-0.5 bg-muted/50 text-muted-foreground">p.{pageNum}</div>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {thumbs.map((m, thumbIdx) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  className={cn(
                                    "w-[72px] shrink-0 rounded-md border border-border overflow-hidden bg-muted/30 text-left",
                                    "cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  )}
                                  title={`Bar ${m.measureNumber}`}
                                  onClick={() =>
                                    setScoreReview({
                                      mode: "bar",
                                      thumbs,
                                      index: thumbIdx,
                                      dayLabel,
                                      rangeLabel,
                                    })
                                  }
                                >
                                  {m.imageUrl ? (
                                    <img src={m.imageUrl} alt={`Bar ${m.measureNumber}`} className="w-full h-16 object-cover object-top pointer-events-none" />
                                  ) : (
                                    <div className="h-16 flex items-center justify-center text-[10px] text-muted-foreground px-1 text-center">Bar {m.measureNumber}</div>
                                  )}
                                  <div className="text-[10px] text-center py-0.5 bg-muted/50 text-muted-foreground">{m.measureNumber}</div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* Completed footer */}
                    {isDone && (
                      <div className="mx-4 mb-4 rounded-md border border-[#729E8F]/35 bg-[#729E8F]/8 px-3 py-2.5 flex flex-wrap items-center gap-2">
                        <p className="text-xs text-[#3d7065] font-medium flex-1 min-w-0">
                          ✓ Completed{lesson.completedAt
                            ? " " + new Date(lesson.completedAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                              + " at " + new Date(lesson.completedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                            : ""}
                        </p>
                        <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 gap-1.5" asChild>
                          <Link href={`/session/${lesson.id}`}>
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="shrink-0"><path d="M1.5 9.5L4 9l5-5-1.5-1.5-5 5-.5 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                            {lesson.userNotes ? "View notes" : "Add notes"}
                          </Link>
                        </Button>
                      </div>
                    )}

                    {/* Notes preview */}
                    {isDone && lesson.userNotes && (
                      <div className="mx-4 mb-4 rounded-md border border-border bg-background/50 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Session notes</p>
                        <p className="text-xs text-muted-foreground italic leading-relaxed line-clamp-3">{lesson.userNotes}</p>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
        )}
      </div>

      <Dialog open={scoreReview != null} onOpenChange={(open) => !open && setScoreReview(null)}>
        <DialogContent className="max-w-4xl w-[min(96vw,56rem)] gap-0 p-0 overflow-hidden sm:rounded-lg">
          <DialogHeader className="px-6 pt-6 pb-2 space-y-1 pr-14">
            <DialogTitle className="font-serif">
              {scoreReview?.mode === "page"
                ? `Page ${pageReviewCurrent ?? "—"}`
                : `Bar ${barReviewCurrent?.measureNumber ?? "—"}`}
            </DialogTitle>
            {scoreReview && (
              <DialogDescription className="flex flex-col sm:flex-row sm:items-center sm:gap-2 text-left">
                <span>{scoreReview.dayLabel}</span>
                <span className="hidden sm:inline text-muted-foreground/50">·</span>
                <span>{scoreReview.rangeLabel}</span>
                {scoreReview.mode === "page" && scoreReview.pageNumbers.length > 1 && (
                  <span className="text-muted-foreground">
                    · {scoreReview.pageIndex + 1} of {scoreReview.pageNumbers.length} pages
                  </span>
                )}
                {scoreReview.mode === "bar" && scoreReview.thumbs.length > 1 && (
                  <span className="text-muted-foreground">
                    · {scoreReview.index + 1} of {scoreReview.thumbs.length} today
                  </span>
                )}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="relative px-6 pb-6 flex flex-col items-center gap-4 min-h-[200px]">
            {scoreReview?.mode === "page" && pageReviewCurrent != null && (
              <>
                <div className="w-full rounded-md border border-border bg-white overflow-hidden">
                  <div className="relative w-full">
                    <img
                      src={sheetPageImageUrl(scoreReview.sheetId, pageReviewCurrent)}
                      alt={`Page ${pageReviewCurrent}`}
                      className="w-full h-auto block"
                    />
                    <div className="absolute inset-0 pointer-events-none">
                      {scoreReview.measures
                        .filter((m) => m.pageNumber === pageReviewCurrent && m.boundingBox)
                        .map((m) => (
                          <div
                            key={m.id}
                            className="absolute rounded-sm border-2 border-primary/80 bg-primary/15 shadow-sm"
                            style={{
                              left: `${m.boundingBox!.x * 100}%`,
                              top: `${m.boundingBox!.y * 100}%`,
                              width: `${m.boundingBox!.w * 100}%`,
                              height: `${m.boundingBox!.h * 100}%`,
                            }}
                            title={`Bar ${m.measureNumber}`}
                          />
                        ))}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Highlighted regions are the bars assigned for this day.
                </p>
              </>
            )}
            {scoreReview?.mode === "bar" && (
              <>
                {barReviewCurrent?.imageUrl ? (
                  <div className="w-full flex justify-center rounded-md border border-border bg-muted/20 p-2">
                    <img
                      src={barReviewCurrent.imageUrl}
                      alt={`Full bar ${barReviewCurrent.measureNumber}`}
                      className="max-h-[min(75vh,900px)] w-full object-contain"
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-8">No image available for this bar.</p>
                )}
              </>
            )}
            {scoreReview?.mode === "page" && scoreReview.pageNumbers.length > 1 && (
              <div className="flex items-center gap-3 w-full justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Previous page"
                  onClick={() =>
                    setScoreReview((br) => {
                      if (!br || br.mode !== "page") return br;
                      const n = br.pageNumbers.length;
                      return { ...br, pageIndex: (br.pageIndex - 1 + n) % n };
                    })
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">← → keys</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Next page"
                  onClick={() =>
                    setScoreReview((br) => {
                      if (!br || br.mode !== "page") return br;
                      const n = br.pageNumbers.length;
                      return { ...br, pageIndex: (br.pageIndex + 1) % n };
                    })
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            {scoreReview?.mode === "bar" && scoreReview.thumbs.length > 1 && (
              <div className="flex items-center gap-3 w-full justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Previous bar"
                  onClick={() =>
                    setScoreReview((br) => {
                      if (!br || br.mode !== "bar") return br;
                      const n = br.thumbs.length;
                      return { ...br, index: (br.index - 1 + n) % n };
                    })
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">← → keys</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Next bar"
                  onClick={() =>
                    setScoreReview((br) => {
                      if (!br || br.mode !== "bar") return br;
                      const n = br.thumbs.length;
                      return { ...br, index: (br.index + 1) % n };
                    })
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
