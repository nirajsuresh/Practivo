import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink, Music2 } from "lucide-react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/palette";

interface Composer {
  id: number;
  name: string;
  bio: string | null;
  birthYear: number | null;
  deathYear: number | null;
  nationality: string | null;
  period: string | null;
  imageUrl: string | null;
}

interface Piece {
  id: number;
  title: string;
  keySignature: string | null;
  yearComposed: number | null;
  difficulty: string | null;
  instrument: string | null;
}

const PERIOD_COLORS: Record<string, string> = {
  Baroque:        "bg-amber-50 text-amber-800 border-amber-200",
  Classical:      "bg-blue-50 text-blue-800 border-blue-200",
  Romantic:       "bg-rose-50 text-rose-800 border-rose-200",
  Impressionist:  "bg-teal-50 text-teal-800 border-teal-200",
  Modern:         "bg-violet-50 text-violet-800 border-violet-200",
};

const DIFFICULTY_COLORS: Record<string, string> = {
  Beginner:     "text-green-600",
  Intermediate: "text-yellow-600",
  Advanced:     "text-orange-600",
  Expert:       "text-red-600",
};

export default function ComposerPage() {
  const { id } = useParams();
  const composerId = parseInt(id || "0");

  const { data: composer, isLoading } = useQuery<Composer>({
    queryKey: [`/api/composers/${composerId}`],
    enabled: !!composerId,
  });

  const { data: pieces = [] } = useQuery<Piece[]>({
    queryKey: [`/api/composers/${composerId}/pieces`],
    enabled: !!composerId,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      </Layout>
    );
  }

  if (!composer) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center text-muted-foreground">
          Composer not found.
        </div>
      </Layout>
    );
  }

  const periodClass = composer.period ? PERIOD_COLORS[composer.period] : undefined;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

        {/* Back */}
        <Link href="/home">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </Link>

        {/* Header */}
        <div className="flex gap-6 items-start">
          {composer.imageUrl && (
            <img
              src={composer.imageUrl}
              alt={composer.name}
              className="w-24 h-24 rounded-full object-cover border border-border shadow-sm shrink-0"
            />
          )}
          <div className="space-y-2">
            <h1 className="font-serif text-4xl font-bold">{composer.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {composer.birthYear && (
                <span>
                  {composer.birthYear}–{composer.deathYear ?? "present"}
                </span>
              )}
              {composer.nationality && (
                <>
                  <span>·</span>
                  <span>{composer.nationality}</span>
                </>
              )}
              {composer.period && (
                <Badge
                  variant="outline"
                  className={cn("text-xs font-medium", periodClass)}
                >
                  {composer.period}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Bio */}
        {composer.bio && (
          <p className="text-base leading-relaxed text-foreground/80">
            {composer.bio}
          </p>
        )}

        {/* Piece catalog */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music2 className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Works ({pieces.length})
              </h2>
            </div>
          </div>

          {pieces.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No pieces in catalog.</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border overflow-hidden">
              {pieces.map((piece) => (
                <Link key={piece.id} href={`/piece/${piece.id}`}>
                  <div className="flex items-center justify-between px-4 py-3 bg-background hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-medium text-sm truncate">{piece.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {piece.keySignature && <span>{piece.keySignature}</span>}
                        {piece.yearComposed && <span>({piece.yearComposed})</span>}
                        {piece.difficulty && (
                          <span className={DIFFICULTY_COLORS[piece.difficulty] ?? ""}>
                            {piece.difficulty}
                          </span>
                        )}
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-3" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}
