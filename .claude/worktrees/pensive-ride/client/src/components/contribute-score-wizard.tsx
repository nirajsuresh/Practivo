import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
    Upload,
    Loader2,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Music2,
    AlertCircle,
    Sparkles,
    Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScoreReviewModal } from "@/components/score-review-modal";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Measure {
    id: number;
    measureNumber: number;
    pageNumber: number;
    boundingBox: { x: number; y: number; w: number; h: number };
    imageUrl: string | null;
}

interface SheetMusicStatus {
    id: number;
    processingStatus: "pending" | "processing" | "ready" | "failed";
    pageCount: number | null;
    processingPage: number | null;
    processingTotal: number | null;
}

export interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    pieceId: number;
    /** null = whole piece; number = specific movement */
    movementId?: number | null;
    pieceTitle: string;
    userId: string;
    onContributed?: () => void;
}

type Step = "upload" | "pageRange" | "processing" | "review" | "share" | "done";

// ─── Progress dots ────────────────────────────────────────────────────────────

function stepToIdx(step: Step): number {
    switch (step) {
        case "upload":
            return 0;
        case "pageRange":
        case "processing":
            return 1;
        case "review":
            return 2;
        case "share":
            return 3;
        case "done":
            return 4;
    }
}

function StepDots({ current }: { current: Step }) {
    const keys = ["upload", "pages", "review", "share", "done"] as const;
    const currentIdx = stepToIdx(current);
    return (
        <div className="flex items-center gap-2 mb-6">
            {keys.map((key, dotIdx) => {
                const done = dotIdx < currentIdx;
                const active = dotIdx === currentIdx;
                return (
                    <div key={key} className="flex items-center gap-2">
                        <div
                            className={cn(
                                "w-2 h-2 rounded-full transition-all",
                                done && "bg-primary",
                                active && "w-3 h-3 bg-primary",
                                !done && !active && "bg-muted-foreground/30",
                            )}
                        />
                        {dotIdx < keys.length - 1 && (
                            <div
                                className={cn(
                                    "h-px w-8",
                                    dotIdx < currentIdx
                                        ? "bg-primary"
                                        : "bg-muted-foreground/20",
                                )}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Step: Upload ─────────────────────────────────────────────────────────────

function UploadStep({
    pieceTitle,
    userId,
    pieceId,
    onSheetMusicCreated,
    onCancel,
}: {
    pieceTitle: string;
    userId: string;
    pieceId: number;
    onSheetMusicCreated: (id: number, pageCount: number | null) => void;
    onCancel: () => void;
}) {
    const { toast } = useToast();
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [fileName, setFileName] = useState<string | null>(null);

    const upload = useMutation({
        mutationFn: async (file: File) => {
            const form = new FormData();
            form.append("pdf", file);
            form.append("userId", userId);
            form.append("pieceId", String(pieceId));
            const res = await fetch("/api/sheet-music/upload", {
                method: "POST",
                body: form,
                headers: getAuthHeaders(),
            });
            if (!res.ok) throw new Error("Upload failed");
            const data = (await res.json()) as {
                sheetMusicId: number;
                pageCount?: number | null;
            };
            return { id: data.sheetMusicId, pageCount: data.pageCount ?? null };
        },
        onSuccess: ({ id, pageCount }) => onSheetMusicCreated(id, pageCount),
        onError: () => {
            toast({
                title: "Upload failed",
                description: "Please try again.",
                variant: "destructive",
            });
        },
    });

    const handleFile = useCallback(
        (file: File) => {
            if (!file.name.endsWith(".pdf")) {
                toast({
                    title: "PDF only",
                    description: "Please upload a PDF file.",
                    variant: "destructive",
                });
                return;
            }
            setFileName(file.name);
            upload.mutate(file);
        },
        [upload, toast],
    );

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        },
        [handleFile],
    );

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-2 text-sm text-muted-foreground bg-[#F4F1EA] rounded-lg px-3 py-2.5">
                <Users className="w-4 h-4 shrink-0 mt-0.5 text-[#729E8F]" />
                <span>
                    Your bar analysis will be shared with the community so
                    others can skip setup for{" "}
                    <span className="text-foreground font-medium">
                        {pieceTitle}
                    </span>
                    .
                </span>
            </div>

            <div
                className={cn(
                    "border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 transition-colors cursor-pointer",
                    dragOver
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
                    upload.isPending && "pointer-events-none opacity-60",
                )}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                    }}
                />
                {upload.isPending ? (
                    <>
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                        <p className="text-sm font-medium">
                            Uploading {fileName}…
                        </p>
                    </>
                ) : (
                    <>
                        <Upload className="w-8 h-8 text-muted-foreground" />
                        <div className="text-center">
                            <p className="text-sm font-medium">
                                Drop your PDF here or click to browse
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {pieceTitle} sheet music
                            </p>
                        </div>
                    </>
                )}
            </div>

            <Button
                variant="ghost"
                onClick={onCancel}
                className="w-full text-muted-foreground"
            >
                Cancel
            </Button>
        </div>
    );
}

// ─── Step: Page range ─────────────────────────────────────────────────────────

function PageRangeStep({
    sheetMusicId,
    initialPageCount,
    onStarted,
    onBack,
}: {
    sheetMusicId: number;
    initialPageCount: number | null;
    onStarted: () => void;
    onBack: () => void;
}) {
    const { toast } = useToast();
    const {
        data: meta,
        isLoading: metaLoading,
        isError: metaError,
    } = useQuery<{ pageCount: number }>({
        queryKey: [`/api/sheet-music/${sheetMusicId}/pdf-meta`],
        enabled: initialPageCount == null || initialPageCount < 1,
        retry: 1,
    });

    const pdfPageCount =
        initialPageCount != null && initialPageCount > 0
            ? initialPageCount
            : (meta?.pageCount ?? 0);

    const [fromPage, setFromPage] = useState(1);
    const [toPage, setToPage] = useState(1);

    useEffect(() => {
        if (pdfPageCount > 0) {
            setFromPage(1);
            setToPage(pdfPageCount);
        }
    }, [pdfPageCount]);

    const startProcess = useMutation({
        mutationFn: async ({
            firstPage,
            lastPage,
        }: {
            firstPage: number;
            lastPage: number;
        }) => {
            await apiRequest(
                "POST",
                `/api/sheet-music/${sheetMusicId}/process`,
                { firstPage, lastPage },
            );
        },
        onSuccess: () => onStarted(),
        onError: () => {
            toast({
                title: "Couldn't start analysis",
                description: "Try again.",
                variant: "destructive",
            });
        },
    });

    const invalidRange =
        pdfPageCount > 0 &&
        (fromPage < 1 ||
            toPage < 1 ||
            fromPage > pdfPageCount ||
            toPage > pdfPageCount);
    const loading =
        (initialPageCount == null || initialPageCount < 1) && metaLoading;

    return (
        <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
                Choose which pages contain{" "}
                <span className="text-foreground font-medium">this piece</span>{" "}
                only — skip title pages, preludes, or other scores.
            </p>

            {loading && (
                <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            )}

            {!loading && metaError && pdfPageCount <= 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-muted-foreground">
                    Could not read the PDF. Try re-uploading or a different
                    file.
                </div>
            )}

            {!loading && pdfPageCount > 0 && (
                <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        This file has {pdfPageCount} page
                        {pdfPageCount === 1 ? "" : "s"}
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="contrib-page-from">
                                First page
                            </Label>
                            <Input
                                id="contrib-page-from"
                                type="number"
                                min={1}
                                max={pdfPageCount}
                                value={fromPage}
                                onChange={(e) =>
                                    setFromPage(
                                        Math.max(
                                            1,
                                            Math.min(
                                                pdfPageCount,
                                                parseInt(e.target.value, 10) ||
                                                    1,
                                            ),
                                        ),
                                    )
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="contrib-page-to">Last page</Label>
                            <Input
                                id="contrib-page-to"
                                type="number"
                                min={1}
                                max={pdfPageCount}
                                value={toPage}
                                onChange={(e) =>
                                    setToPage(
                                        Math.max(
                                            1,
                                            Math.min(
                                                pdfPageCount,
                                                parseInt(e.target.value, 10) ||
                                                    1,
                                            ),
                                        ),
                                    )
                                }
                            />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Bars will be detected on pages{" "}
                        {Math.min(fromPage, toPage)}–
                        {Math.max(fromPage, toPage)} (
                        {Math.abs(toPage - fromPage) + 1} page
                        {Math.abs(toPage - fromPage) === 0 ? "" : "s"}).
                    </p>
                </div>
            )}

            <div className="flex gap-3">
                <Button
                    variant="outline"
                    onClick={onBack}
                    className="flex-1"
                    disabled={startProcess.isPending}
                >
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button
                    className="flex-1"
                    disabled={
                        loading ||
                        pdfPageCount <= 0 ||
                        invalidRange ||
                        startProcess.isPending
                    }
                    onClick={() => {
                        const lo = Math.min(fromPage, toPage);
                        const hi = Math.max(fromPage, toPage);
                        setFromPage(lo);
                        setToPage(hi);
                        startProcess.mutate({ firstPage: lo, lastPage: hi });
                    }}
                >
                    {startProcess.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <>
                            Analyse pages{" "}
                            <ChevronRight className="w-4 h-4 ml-1" />
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}

// ─── Step: Processing ─────────────────────────────────────────────────────────

function ProcessingStep({
    sheetMusicId,
    onDone,
}: {
    sheetMusicId: number;
    onDone: () => void;
}) {
    const doneCalledRef = useRef(false);
    const { data } = useQuery<SheetMusicStatus>({
        queryKey: [`/api/sheet-music/${sheetMusicId}/status`],
        refetchInterval: (query) => {
            const s = query.state.data?.processingStatus;
            if (s === "ready" || s === "failed") return false;
            return 1500;
        },
        staleTime: 0,
    });

    useEffect(() => {
        if (data?.processingStatus === "ready" && !doneCalledRef.current) {
            doneCalledRef.current = true;
            setTimeout(onDone, 300);
        }
    }, [data?.processingStatus, onDone]);

    const page = data?.processingPage ?? 0;
    const total = data?.processingTotal ?? 0;
    const failed = data?.processingStatus === "failed";
    const pct = total > 0 ? Math.round((page / total) * 100) : 0;

    return (
        <div className="flex flex-col items-center gap-6 py-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                {failed ? (
                    <AlertCircle className="w-8 h-8 text-destructive" />
                ) : (
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                )}
            </div>
            <div className="text-center space-y-1 w-full">
                {failed ? (
                    <>
                        <p className="font-semibold text-destructive">
                            Processing failed
                        </p>
                        <p className="text-sm text-muted-foreground">
                            The PDF could not be analysed. Try a different file.
                        </p>
                    </>
                ) : total > 0 ? (
                    <>
                        <p className="font-semibold">
                            Processing page {page} of {total}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Detecting barlines…
                        </p>
                        <div className="mt-3 w-full bg-muted rounded-full overflow-hidden h-2">
                            <div
                                className="h-full bg-primary rounded-full transition-all duration-500"
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground tabular-nums">
                            {pct}%
                        </p>
                    </>
                ) : (
                    <>
                        <p className="font-semibold">Analysing score…</p>
                        <p className="text-sm text-muted-foreground">
                            Rendering pages...
                        </p>
                        <div className="w-full space-y-2 mt-2">
                            {[...Array(3)].map((_, i) => (
                                <Skeleton
                                    key={i}
                                    className="h-2 w-full"
                                    style={{ opacity: 1 - i * 0.3 }}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ─── Step: Share ──────────────────────────────────────────────────────────────

function ShareStep({
    pieceTitle,
    totalMeasures,
    sheetMusicId,
    movementId,
    userId,
    onShared,
    onSkip,
}: {
    pieceTitle: string;
    totalMeasures: number;
    sheetMusicId: number;
    movementId: number | null;
    userId: string;
    onShared: () => void;
    onSkip: () => void;
}) {
    const { toast } = useToast();
    const [description, setDescription] = useState("");

    const submit = useMutation({
        mutationFn: async () => {
            // The server auto-confirms bars (processingStatus "ready" → "done") as part
            // of this request, so no separate /confirm call is needed here.
            const res = await apiRequest("POST", "/api/community-scores", {
                sheetMusicId,
                movementId: movementId ?? undefined,
                description: description.trim() || undefined,
            });
            return res.json().catch(() => ({}));
        },
        onSuccess: () => onShared(),
        onError: (err: Error) => {
            toast({
                title: "Could not share",
                description: err.message,
                variant: "destructive",
            });
        },
    });

    return (
        <div className="space-y-5">
            <div className="rounded-xl bg-[#F4F1EA] border border-[#D6D1C7] p-4 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-[#DCCAA6] shrink-0 mt-0.5" />
                <div>
                    <p className="font-semibold text-sm">
                        Your analysis is ready
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {totalMeasures} bars detected for{" "}
                        <span className="text-foreground">{pieceTitle}</span>.
                        Contributing it lets every Réperto user skip the setup
                        step for this piece.
                    </p>
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="contrib-desc">
                    Edition notes{" "}
                    <span className="text-muted-foreground font-normal">
                        (optional)
                    </span>
                </Label>
                <Textarea
                    id="contrib-desc"
                    placeholder="e.g. Henle Urtext, movements I–III only, Dover edition…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                    Helps others know which edition was used.
                </p>
            </div>

            <div className="flex gap-3">
                <Button
                    variant="outline"
                    className="flex-1 text-muted-foreground"
                    onClick={onSkip}
                    disabled={submit.isPending}
                >
                    Skip
                </Button>
                <Button
                    className="flex-1"
                    onClick={() => submit.mutate()}
                    disabled={submit.isPending}
                >
                    {submit.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <>
                            <Users className="w-4 h-4 mr-1.5" />
                            Share with community
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}

// ─── Step: Done ───────────────────────────────────────────────────────────────

function DoneStep({
    pieceTitle,
    onClose,
}: {
    pieceTitle: string;
    onClose: () => void;
}) {
    // Capture callback in a ref so the timer isn't reset if the parent re-renders
    // (onClose is a new arrow function on every render of ContributeScoreWizard).
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        const t = setTimeout(() => onCloseRef.current(), 2500);
        return () => clearTimeout(t);
    }, []); // empty — fires once on mount

    return (
        <div className="flex flex-col items-center gap-5 py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[#729E8F]/15 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-[#729E8F]" />
            </div>
            <div>
                <p className="font-semibold text-lg">Contribution submitted!</p>
                <p className="text-sm text-muted-foreground mt-1">
                    Your bar analysis for{" "}
                    <span className="text-foreground">{pieceTitle}</span> is now
                    available to the community. Thank you.
                </p>
            </div>
        </div>
    );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function ContributeScoreWizard({
    open,
    onOpenChange,
    pieceId,
    movementId = null,
    pieceTitle,
    userId,
    onContributed,
}: Props) {
    const [step, setStep] = useState<Step>("upload");
    const [sheetMusicId, setSheetMusicId] = useState<number | null>(null);
    const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
    const [totalMeasures, setTotalMeasures] = useState(0);

    // Reset when dialog closes
    const handleOpenChange = (v: boolean) => {
        if (!v) {
            setStep("upload");
            setSheetMusicId(null);
            setPdfPageCount(null);
            setTotalMeasures(0);
        }
        onOpenChange(v);
    };

    const stepTitles: Record<Step, string> = {
        upload: "Upload sheet music",
        pageRange: "Select page range",
        processing: "Detecting bars",
        review: "Review barlines",
        share: "Contribute to community",
        done: "Done!",
    };

    const stepDescriptions: Record<Step, string> = {
        upload: `Upload a PDF of ${pieceTitle}`,
        pageRange: "Choose which pages to analyse",
        processing: "Analysing your score…",
        review: "Verify and adjust the detected barlines",
        share: "Help other musicians skip this setup",
        done: "",
    };

    // The review step is full-screen — render outside Dialog content limits
    if (open && step === "review" && sheetMusicId != null) {
        return (
            <ScoreReviewModal
                sheetMusicId={sheetMusicId}
                totalMeasures={totalMeasures}
                pieceTitle={pieceTitle}
                onConfirm={(n) => {
                    setTotalMeasures(n);
                    setStep("share");
                }}
                onBack={() => setStep("pageRange")}
            />
        );
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="font-serif text-xl">
                        {stepTitles[step]}
                    </DialogTitle>
                    {step !== "done" && (
                        <DialogDescription>
                            {stepDescriptions[step]}
                        </DialogDescription>
                    )}
                </DialogHeader>

                {step !== "done" && <StepDots current={step} />}

                {step === "upload" && (
                    <UploadStep
                        pieceTitle={pieceTitle}
                        userId={userId}
                        pieceId={pieceId}
                        onSheetMusicCreated={(id, pc) => {
                            setSheetMusicId(id);
                            setPdfPageCount(pc);
                            setStep("pageRange");
                        }}
                        onCancel={() => handleOpenChange(false)}
                    />
                )}

                {step === "pageRange" && sheetMusicId != null && (
                    <PageRangeStep
                        sheetMusicId={sheetMusicId}
                        initialPageCount={pdfPageCount}
                        onStarted={() => setStep("processing")}
                        onBack={() => setStep("upload")}
                    />
                )}

                {step === "processing" && sheetMusicId != null && (
                    <ProcessingStep
                        sheetMusicId={sheetMusicId}
                        onDone={() => setStep("review")}
                    />
                )}

                {/* "review" step handled above (full-screen) */}

                {step === "share" && sheetMusicId != null && (
                    <ShareStep
                        pieceTitle={pieceTitle}
                        totalMeasures={totalMeasures}
                        sheetMusicId={sheetMusicId}
                        movementId={movementId}
                        userId={userId}
                        onShared={() => setStep("done")}
                        onSkip={() => handleOpenChange(false)}
                    />
                )}

                {step === "done" && (
                    <DoneStep
                        pieceTitle={pieceTitle}
                        onClose={() => {
                            onContributed?.();
                            handleOpenChange(false);
                        }}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
