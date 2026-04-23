import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, ExternalLink, Music2, BookOpen, Users, Trash2 } from "lucide-react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LearningPlanWizard } from "@/components/learning-plan-wizard";

interface Piece {
  id: number;
  title: string;
  composerId: number;
  instrument: string | null;
  imslpUrl: string | null;
  keySignature: string | null;
  yearComposed: number | null;
  difficulty: string | null;
}

interface Composer {
  id: number;
  name: string;
  bio: string | null;
  birthYear: number | null;
  deathYear: number | null;
  period: string | null;
  imageUrl: string | null;
}

interface Movement {
  id: number;
  name: string;
  pieceId: number;
}

interface RepertoireEntry {
  id: number;
  pieceId: number;
  status: string;
}

interface LearningPlan {
  id: number;
  repertoireEntryId: number;
  status: string;
}

interface CommunityScoreRow {
  id: number;
  pieceId: number;
  movementId: number | null;
  sheetMusicId: number;
  submittedByUserId: string;
  submittedAt: string;
  description: string | null;
  downloadCount: number;
  totalMeasures: number;
}

export default function PieceDetailPage() {
  const { id } = useParams();
  const pieceId = parseInt(id || "0");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const userId = localStorage.getItem("userId") || "";

  const { data: piece, isLoading: pieceLoading } = useQuery<Piece>({
    queryKey: [`/api/pieces/${pieceId}`],
    enabled: !!pieceId,
  });

  const { data: composer } = useQuery<Composer>({
    queryKey: [`/api/composers/${piece?.composerId}`],
    enabled: !!piece?.composerId,
  });

  const { data: movements = [] } = useQuery<Movement[]>({
    queryKey: [`/api/pieces/${pieceId}/movements`],
    enabled: !!pieceId,
  });

  const { data: analysis } = useQuery<{ analysis: string; wikiUrl: string | null }>({
    queryKey: [`/api/pieces/${pieceId}/analysis`],
    enabled: !!pieceId,
  });

  const { data: communityScores = [], isLoading: scoresLoading } = useQuery<CommunityScoreRow[]>({
    queryKey: [`/api/community-scores/piece/${pieceId}`],
    enabled: !!pieceId,
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [pendingWizard, setPendingWizard] = useState(false);

  const deleteScore = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/community-scores/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community-scores"], exact: false });
      setConfirmDeleteId(null);
      toast({ title: "Score removed", description: "The community score has been deleted." });
    },
    onError: (err: Error) => {
      toast({ title: "Could not delete", description: err.message, variant: "destructive" });
    },
  });

  const { data: repertoireData } = useQuery<{ entries: RepertoireEntry[] }>({
    queryKey: [`/api/repertoire/${userId}`],
    enabled: !!userId,
  });

  const existingEntry = repertoireData?.entries?.find(e => e.pieceId === pieceId);

  const { data: plans = [] } = useQuery<LearningPlan[]>({
    queryKey: [`/api/learning-plans`],
    enabled: !!userId,
  });

  const existingPlan = existingEntry
    ? plans.find(p => p.repertoireEntryId === existingEntry.id)
    : undefined;

  const addToRepertoire = useMutation({
    mutationFn: async () => {
      if (!piece || !composer) return;
      await apiRequest("POST", "/api/repertoire", {
        userId,
        composerId: piece.composerId,
        pieceId: piece.id,
        status: "In Progress",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] });
      toast({ title: "Added to repertoire" });
      if (pendingWizard) {
        setPendingWizard(false);
        // Wait for the query to refresh, then open wizard
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: [`/api/repertoire/${userId}`] }).then(() => {
            setShowWizard(true);
          });
        }, 300);
      }
    },
  });

  const handleStartLearning = () => {
    if (existingEntry) {
      setShowWizard(true);
    } else {
      setPendingWizard(true);
      addToRepertoire.mutate();
    }
  };

  if (pieceLoading) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </Layout>
    );
  }

  if (!piece) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center" style={{ color: "#7a7166" }}>
          Piece not found.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Navy hero header */}
      <div style={{ backgroundColor: "#0f2036", padding: "48px 48px 40px" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>
          {/* Back button */}
          <Link href="/home">
            <button
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "transparent",
                border: "none",
                color: "#f5f1ea",
                opacity: 0.7,
                cursor: "pointer",
                fontFamily: "Inter, sans-serif",
                fontSize: "13px",
                padding: "0",
                marginBottom: "32px",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; }}
            >
              <ArrowLeft style={{ width: "16px", height: "16px" }} />
              Back
            </button>
          </Link>

          {/* Composer eyebrow */}
          {composer && (
            <Link href={`/composer/${composer.id}`}>
              <p
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  color: "#c9a86a",
                  marginBottom: "12px",
                  cursor: "pointer",
                }}
              >
                {composer.name}
              </p>
            </Link>
          )}

          {/* Piece title */}
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "52px",
              fontWeight: 400,
              color: "#f5f1ea",
              lineHeight: 1.1,
              margin: "0 0 24px 0",
            }}
          >
            {piece.title}
          </h1>

          {/* Metadata badges */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {piece.keySignature && (
              <span
                style={{
                  backgroundColor: "rgba(245,241,234,0.12)",
                  color: "#f5f1ea",
                  border: "1px solid rgba(245,241,234,0.25)",
                  borderRadius: "9999px",
                  padding: "4px 12px",
                  fontFamily: "Inter, sans-serif",
                  fontSize: "12px",
                }}
              >
                {piece.keySignature}
              </span>
            )}
            {piece.yearComposed && (
              <span
                style={{
                  backgroundColor: "rgba(245,241,234,0.12)",
                  color: "#f5f1ea",
                  border: "1px solid rgba(245,241,234,0.25)",
                  borderRadius: "9999px",
                  padding: "4px 12px",
                  fontFamily: "Inter, sans-serif",
                  fontSize: "12px",
                }}
              >
                {piece.yearComposed}
              </span>
            )}
            {piece.difficulty && (
              <span
                style={{
                  backgroundColor: "rgba(245,241,234,0.12)",
                  color: "#f5f1ea",
                  border: "1px solid rgba(245,241,234,0.25)",
                  borderRadius: "9999px",
                  padding: "4px 12px",
                  fontFamily: "Inter, sans-serif",
                  fontSize: "12px",
                }}
              >
                {piece.difficulty}
              </span>
            )}
            {piece.instrument && piece.instrument !== "Solo Piano" && (
              <span
                style={{
                  backgroundColor: "rgba(245,241,234,0.12)",
                  color: "#f5f1ea",
                  border: "1px solid rgba(245,241,234,0.25)",
                  borderRadius: "9999px",
                  padding: "4px 12px",
                  fontFamily: "Inter, sans-serif",
                  fontSize: "12px",
                }}
              >
                {piece.instrument}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action row */}
      <div
        style={{
          padding: "20px 48px",
          borderBottom: "1px solid #ddd8cc",
          backgroundColor: "#ffffff",
        }}
      >
        <div
          style={{
            maxWidth: "720px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          {existingEntry && existingPlan ? (
            <>
              <button
                onClick={() => setLocation(`/plan/${existingPlan.id}`)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "#0f2036",
                  color: "#f5f1ea",
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 500,
                  fontSize: "14px",
                  padding: "10px 20px",
                  borderRadius: "2px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Continue plan →
              </button>
              <span
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: "12px",
                  color: "#7a7166",
                  backgroundColor: "#f5f1ea",
                  border: "1px solid #ddd8cc",
                  borderRadius: "9999px",
                  padding: "3px 10px",
                }}
              >
                {existingEntry.status}
              </span>
            </>
          ) : (
            <>
              <button
                onClick={handleStartLearning}
                disabled={addToRepertoire.isPending || !userId}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "#c9a86a",
                  color: "#0f2036",
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 500,
                  fontSize: "14px",
                  padding: "10px 20px",
                  borderRadius: "2px",
                  border: "none",
                  cursor: (addToRepertoire.isPending || !userId) ? "not-allowed" : "pointer",
                  opacity: (addToRepertoire.isPending || !userId) ? 0.6 : 1,
                }}
              >
                {addToRepertoire.isPending ? "Adding..." : "Start learning →"}
              </button>
              {existingEntry && (
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: "12px",
                    color: "#7a7166",
                    backgroundColor: "#f5f1ea",
                    border: "1px solid #ddd8cc",
                    borderRadius: "9999px",
                    padding: "3px 10px",
                  }}
                >
                  {existingEntry.status}
                </span>
              )}
            </>
          )}

          {piece.imslpUrl && (
            <a
              href={piece.imslpUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontFamily: "Inter, sans-serif",
                fontSize: "13px",
                color: "#7a7166",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#0f2036"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#7a7166"; }}
            >
              <ExternalLink style={{ width: "14px", height: "14px" }} />
              IMSLP
            </a>
          )}
        </div>
      </div>

      {/* Below the fold — cream bg */}
      <div style={{ backgroundColor: "#f5f1ea", minHeight: "100vh" }}>
        <div
          style={{
            maxWidth: "720px",
            margin: "0 auto",
            padding: "32px 48px",
          }}
        >
          <div className="space-y-10">

            {/* Movements */}
            {movements.length > 0 && (
              <div className="space-y-3">
                <p
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    color: "#7a7166",
                  }}
                >
                  Movements
                </p>
                <div
                  style={{
                    border: "1px solid #ddd8cc",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  {movements.map((mvt, i) => (
                    <div
                      key={mvt.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "10px 16px",
                        backgroundColor: "#ede8df",
                        borderBottom: i < movements.length - 1 ? "1px solid #ddd8cc" : "none",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontSize: "11px",
                          color: "#7a7166",
                          width: "20px",
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}.
                      </span>
                      <span
                        style={{
                          fontFamily: "'Cormorant Garamond', serif",
                          fontSize: "16px",
                          color: "#0f2036",
                        }}
                      >
                        {mvt.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Community Scores */}
            {(scoresLoading || communityScores.length > 0) && (
              <div className="space-y-3">
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Users style={{ width: "14px", height: "14px", color: "#7a7166" }} />
                  <p
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: "#7a7166",
                    }}
                  >
                    Community Scores
                  </p>
                </div>

                {scoresLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 w-full rounded-lg" />
                    <Skeleton className="h-14 w-full rounded-lg" />
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        border: "1px solid #ddd8cc",
                        borderRadius: "4px",
                        overflow: "hidden",
                      }}
                    >
                      {communityScores.map((score, i) => {
                        const movementName = score.movementId != null
                          ? movements.find((m) => m.id === score.movementId)?.name ?? `Movement ${score.movementId}`
                          : null;
                        const isOwner = score.submittedByUserId === userId;
                        return (
                          <div
                            key={score.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              padding: "12px 16px",
                              backgroundColor: "#ede8df",
                              borderBottom: i < communityScores.length - 1 ? "1px solid #ddd8cc" : "none",
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p
                                style={{
                                  fontFamily: "'Cormorant Garamond', serif",
                                  fontSize: "16px",
                                  color: "#0f2036",
                                  margin: 0,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {movementName ?? "Whole piece"}
                              </p>
                              <p
                                style={{
                                  fontFamily: "Inter, sans-serif",
                                  fontSize: "12px",
                                  color: "#7a7166",
                                  margin: "2px 0 0 0",
                                }}
                              >
                                {score.totalMeasures} bars
                                {score.description ? ` · "${score.description}"` : ""}
                                {" · "}{new Date(score.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                {score.downloadCount > 0 ? ` · used ${score.downloadCount}×` : ""}
                              </p>
                            </div>

                            {isOwner && (
                              <button
                                style={{
                                  height: "28px",
                                  width: "28px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "#7a7166",
                                  flexShrink: 0,
                                  borderRadius: "4px",
                                  padding: 0,
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = "#dc2626"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = "#7a7166"; }}
                                onClick={() => setConfirmDeleteId(score.id)}
                                title="Remove this community score"
                              >
                                <Trash2 style={{ width: "14px", height: "14px" }} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <AlertDialog open={confirmDeleteId != null} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove community score?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will delete your contributed bar analysis, allowing a new one to be submitted.
                            Other users will no longer be able to use it.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => confirmDeleteId != null && deleteScore.mutate(confirmDeleteId)}
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            )}

            {/* Analysis */}
            <div className="space-y-3">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <BookOpen style={{ width: "14px", height: "14px", color: "#7a7166" }} />
                <p
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    color: "#7a7166",
                  }}
                >
                  About this piece
                </p>
              </div>

              {analysis ? (
                <div className="space-y-3">
                  <p
                    style={{
                      fontFamily: "'EB Garamond', Georgia, serif",
                      fontSize: "17px",
                      lineHeight: "1.7",
                      color: "#0f2036",
                    }}
                  >
                    {analysis.analysis}
                  </p>
                  {analysis.wikiUrl && (
                    <a
                      href={analysis.wikiUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontFamily: "Inter, sans-serif",
                        fontSize: "12px",
                        color: "#7a7166",
                        textDecoration: "none",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#0f2036"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "#7a7166"; }}
                    >
                      <ExternalLink style={{ width: "12px", height: "12px" }} />
                      Wikipedia
                    </a>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Learning Plan Wizard */}
      {showWizard && existingEntry && (
        <LearningPlanWizard
          open={showWizard}
          onOpenChange={(v) => setShowWizard(v)}
          repertoireEntryId={existingEntry.id}
          pieceId={piece.id}
          pieceTitle={piece.title}
          userId={userId}
        />
      )}
    </Layout>
  );
}
