import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink, Music2, BookOpen, Plus, ChevronRight } from "lucide-react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getStatusColor } from "@/lib/status-colors";

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

const DIFFICULTY_COLORS: Record<string, string> = {
  Beginner:     "bg-green-100 text-green-800",
  Intermediate: "bg-yellow-100 text-yellow-800",
  Advanced:     "bg-orange-100 text-orange-800",
  Expert:       "bg-red-100 text-red-800",
};

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

  const { data: repertoireData } = useQuery<{ entries: RepertoireEntry[] }>({
    queryKey: [`/api/repertoire/${userId}`],
    enabled: !!userId,
  });

  const existingEntry = repertoireData?.entries?.find(e => e.pieceId === pieceId);

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
    },
  });

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
        <div className="max-w-3xl mx-auto px-4 py-20 text-center text-muted-foreground">
          Piece not found.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

        {/* Back link */}
        <Link href="/profile">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to repertoire
          </Button>
        </Link>

        {/* Piece header */}
        <div className="space-y-3">
          {composer && (
            <Link href={`/composer/${composer.id}`}>
              <span className="text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                {composer.name}
                {composer.birthYear && (
                  <span className="opacity-60 ml-1">
                    ({composer.birthYear}–{composer.deathYear ?? "present"})
                  </span>
                )}
              </span>
            </Link>
          )}

          <h1 className="font-serif text-4xl font-bold text-foreground leading-tight">
            {piece.title}
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            {piece.keySignature && (
              <Badge variant="outline" className="text-xs font-medium">
                {piece.keySignature}
              </Badge>
            )}
            {piece.yearComposed && (
              <Badge variant="outline" className="text-xs font-medium">
                {piece.yearComposed}
              </Badge>
            )}
            {piece.difficulty && (
              <Badge className={`text-xs font-medium border-none ${DIFFICULTY_COLORS[piece.difficulty] ?? "bg-muted text-muted-foreground"}`}>
                {piece.difficulty}
              </Badge>
            )}
            {piece.instrument && piece.instrument !== "Solo Piano" && (
              <Badge variant="outline" className="text-xs font-medium">
                {piece.instrument}
              </Badge>
            )}
          </div>
        </div>

        {/* Action row */}
        <div className="flex items-center gap-3">
          {existingEntry ? (
            <Button variant="outline" className="gap-2" onClick={() => setLocation("/profile")}>
              <Music2 className="w-4 h-4" />
              <span className={`text-xs font-medium ${getStatusColor(existingEntry.status)}`}>
                {existingEntry.status}
              </span>
              <ChevronRight className="w-3 h-3" />
            </Button>
          ) : (
            <Button
              className="gap-2"
              onClick={() => addToRepertoire.mutate()}
              disabled={addToRepertoire.isPending || !userId}
            >
              <Plus className="w-4 h-4" />
              Add to Repertoire
            </Button>
          )}

          {piece.imslpUrl && (
            <a href={piece.imslpUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="w-4 h-4" />
                IMSLP
              </Button>
            </a>
          )}
        </div>

        {/* Movements */}
        {movements.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              Movements
            </h2>
            <div className="divide-y divide-border rounded-lg border overflow-hidden">
              {movements.map((mvt, i) => (
                <div key={mvt.id} className="flex items-center gap-3 px-4 py-2.5 bg-background hover:bg-muted/30 transition-colors">
                  <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}.</span>
                  <span className="text-sm font-medium">{mvt.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analysis */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
              About this piece
            </h2>
          </div>

          {analysis ? (
            <div className="space-y-3">
              <p className="text-base leading-relaxed text-foreground/80">
                {analysis.analysis}
              </p>
              {analysis.wikiUrl && (
                <a
                  href={analysis.wikiUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
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
    </Layout>
  );
}
