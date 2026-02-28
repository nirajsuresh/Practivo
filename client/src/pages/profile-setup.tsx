import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Check, Plus, Trash2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchableCombobox, MultiSelectCombobox } from "@/components/searchable-combobox";
import { AvatarPicker } from "@/components/piano-avatars";
import { useQuery } from "@tanstack/react-query";

interface UnifiedResult {
  type: "piece" | "movement";
  composerId: number;
  composerName: string;
  pieceId: number;
  pieceTitle: string;
  movementId: number | null;
  movementName: string | null;
  score: number;
}

interface Composer {
  id: number;
  name: string;
}

interface Piece {
  id: number;
  title: string;
  composerId: number;
  composerName: string;
}

interface Movement {
  id: number;
  name: string;
  pieceId: number;
}

interface RepertoireRow {
  id: string;
  composerId: string;
  pieceId: string;
  movementIds: string;
  status: string;
  dateStarted: string;
}

function QuickSearchFill({ onFill }: { onFill: (result: UnifiedResult) => void }) {
  const [query, setQuery] = useState("");
  const { data: results = [], isLoading } = useQuery<UnifiedResult[]>({
    queryKey: ["/api/search/unified", query],
    queryFn: async () => {
      const res = await fetch(`/api/search/unified?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("Failed to search");
      return res.json();
    },
    enabled: query.length > 1,
  });

  const options = results.map(r => {
    const key = r.movementId ? `m-${r.movementId}` : `p-${r.pieceId}`;
    const label = r.movementName
      ? `${r.composerName} — ${r.pieceTitle}: ${r.movementName}`
      : `${r.composerName} — ${r.pieceTitle}`;
    return { value: key, label };
  });

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-sm">
        <Search className="w-3.5 h-3.5" />
        Quick Search
      </Label>
      <SearchableCombobox
        options={options}
        value=""
        preserveOrder
        onValueChange={(value) => {
          const result = results.find(r => {
            const key = r.movementId ? `m-${r.movementId}` : `p-${r.pieceId}`;
            return key === value;
          });
          if (result) onFill(result);
        }}
        onSearch={setQuery}
        placeholder="Describe your piece (e.g. Moonlight Sonata)..."
        searchPlaceholder="Type a piece, movement, or composer..."
        emptyMessage={query.length > 1 ? "No matches found." : "Start typing to search..."}
        isLoading={isLoading}
      />
    </div>
  );
}

function RepertoireSetupRow({ 
  row, 
  onUpdate, 
  onRemove, 
  canRemove,
  autoFilled,
  onAutoFillConsumed
}: { 
  row: RepertoireRow; 
  onUpdate: (field: keyof RepertoireRow, value: string) => void; 
  onRemove: () => void;
  canRemove: boolean;
  autoFilled?: boolean;
  onAutoFillConsumed?: () => void;
}) {
  const [composerQuery, setComposerQuery] = useState("");
  const [pieceQuery, setPieceQuery] = useState("");
  const autoFillRef = useRef(0);

  useEffect(() => {
    if (autoFilled) {
      autoFillRef.current = 2;
      onAutoFillConsumed?.();
    }
  }, [autoFilled]);

  const { data: composers = [], isLoading: composersLoading } = useQuery<Composer[]>({
    queryKey: ["/api/composers/search", composerQuery],
    queryFn: async () => {
      const res = await fetch(`/api/composers/search?q=${encodeURIComponent(composerQuery)}`);
      if (!res.ok) throw new Error("Failed to fetch composers");
      return res.json();
    },
  });

  const { data: pieces = [], isLoading: piecesLoading } = useQuery<Piece[]>({
    queryKey: ["/api/pieces/search", pieceQuery, row.composerId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (pieceQuery) params.set("q", pieceQuery);
      if (row.composerId) params.set("composerId", row.composerId);
      const res = await fetch(`/api/pieces/search?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch pieces");
      return res.json();
    },
    enabled: !!row.composerId || pieceQuery.length > 0,
  });

  const { data: movements = [], isLoading: movementsLoading } = useQuery<Movement[]>({
    queryKey: ["/api/pieces", row.pieceId, "movements"],
    queryFn: async () => {
      const res = await fetch(`/api/pieces/${row.pieceId}/movements`);
      if (!res.ok) throw new Error("Failed to fetch movements");
      return res.json();
    },
    enabled: !!row.pieceId,
  });

  useEffect(() => {
    if (autoFillRef.current > 0) {
      autoFillRef.current--;
      return;
    }
    if (row.composerId) {
      onUpdate("pieceId", "");
      onUpdate("movementIds", "");
    }
  }, [row.composerId]);

  useEffect(() => {
    if (autoFillRef.current > 0) {
      autoFillRef.current--;
      return;
    }
    if (row.pieceId) {
      onUpdate("movementIds", "");
    }
  }, [row.pieceId]);

  const composerOptions = composers.map(c => ({ value: c.id.toString(), label: c.name, sortKey: c.name.split(" ").pop() || c.name }));
  const pieceOptions = pieces.map(p => ({ value: p.id.toString(), label: p.title }));
  const movementOptions = movements.map(m => ({ value: m.id.toString(), label: m.name }));

  return (
    <TableRow>
      <TableCell className="overflow-hidden">
        <SearchableCombobox
          options={composerOptions}
          value={row.composerId}
          onValueChange={(val) => onUpdate("composerId", val)}
          onSearch={setComposerQuery}
          placeholder="Select composer..."
          searchPlaceholder="Search..."
          emptyMessage="No composers found."
          isLoading={composersLoading}
          preserveOrder
        />
      </TableCell>
      <TableCell className="overflow-hidden">
        <SearchableCombobox
          options={pieceOptions}
          value={row.pieceId}
          onValueChange={(val) => onUpdate("pieceId", val)}
          onSearch={setPieceQuery}
          placeholder="Select piece..."
          searchPlaceholder="Search..."
          emptyMessage={row.composerId ? "No pieces found." : "Select composer first."}
          isLoading={piecesLoading}
          disabled={!row.composerId}
          preserveOrder
        />
      </TableCell>
      <TableCell className="overflow-hidden">
        <MultiSelectCombobox
          options={movementOptions}
          values={row.movementIds ? row.movementIds.split(",") : []}
          onValuesChange={(vals) => onUpdate("movementIds", vals.join(","))}
          onSearch={() => {}}
          placeholder={movements.length === 0 ? "N/A" : "Select..."}
          searchPlaceholder="Search..."
          emptyMessage="No movements."
          isLoading={movementsLoading}
          disabled={!row.pieceId || movements.length === 0}
        />
      </TableCell>
      <TableCell className="overflow-hidden">
        <Select 
          value={row.status} 
          onValueChange={(val) => onUpdate("status", val)}
        >
          <SelectTrigger className="h-10 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Want to learn">Want to learn</SelectItem>
            <SelectItem value="Up next">Up next</SelectItem>
            <SelectItem value="Learning">Learning</SelectItem>
            <SelectItem value="Refining">Refining</SelectItem>
            <SelectItem value="Maintaining">Maintaining</SelectItem>
            <SelectItem value="Performance Ready">Performance Ready</SelectItem>
            <SelectItem value="Shelved">Shelved</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="overflow-hidden">
        <Input 
          type="date" 
          disabled={row.status === "Want to learn"}
          value={row.dateStarted}
          onChange={(e) => onUpdate("dateStarted", e.target.value)}
          className="h-10 bg-background disabled:opacity-30"
        />
      </TableCell>
      <TableCell>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onRemove}
          disabled={!canRemove}
          className="text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-30"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function ProfileSetup() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [avatarId, setAvatarId] = useState("avatar-1");
  const [displayName, setDisplayName] = useState("");
  const [instrument, setInstrument] = useState("");
  const [level, setLevel] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocationField] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const totalSteps = 3;

  const [repertoire, setRepertoire] = useState<RepertoireRow[]>([
    { id: "1", composerId: "", pieceId: "", movementIds: "", status: "Learning", dateStarted: "" }
  ]);
  const [autoFilledRows, setAutoFilledRows] = useState<Set<string>>(new Set());

  const addRow = () => {
    setRepertoire([...repertoire, { id: Math.random().toString(36).substr(2, 9), composerId: "", pieceId: "", movementIds: "", status: "Learning", dateStarted: "" }]);
  };

  const removeRow = (id: string) => {
    if (repertoire.length > 1) {
      setRepertoire(repertoire.filter(row => row.id !== id));
    }
  };

  const updateRow = (id: string, field: keyof RepertoireRow, value: string) => {
    setRepertoire(repertoire.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const handleCompleteSetup = async () => {
    const userId = localStorage.getItem("userId");
    if (!userId) {
      setLocation("/auth");
      return;
    }

    setSubmitting(true);
    try {
      await fetch(`/api/users/${userId}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName || "Anonymous",
          instrument: instrument || null,
          level: level || null,
          bio: bio || null,
          location: location || null,
          avatarUrl: avatarId || null,
        }),
      });

      const validEntries = repertoire
        .filter(row => row.composerId && row.pieceId)
        .flatMap(row => {
          const movementIds = row.movementIds ? row.movementIds.split(",").filter(Boolean) : [];
          if (movementIds.length > 0) {
            return movementIds.map(mId => ({
              composerId: parseInt(row.composerId),
              pieceId: parseInt(row.pieceId),
              movementId: parseInt(mId),
              status: row.status,
              startedDate: row.dateStarted || undefined,
            }));
          }
          return [{
            composerId: parseInt(row.composerId),
            pieceId: parseInt(row.pieceId),
            status: row.status,
            startedDate: row.dateStarted || undefined,
          }];
        });

      if (validEntries.length > 0) {
        await fetch(`/api/users/${userId}/repertoire`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: validEntries }),
        });
      }

      setLocation("/profile");
    } catch (error) {
      console.error("Failed to save profile:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      handleCompleteSetup();
    }
  };

  return (
    <Layout>
      <div className="min-h-[80vh] py-16 px-4 bg-secondary/30 flex items-center justify-center">
        <div className={cn("w-full transition-all duration-500", step === 3 ? "max-w-6xl" : "max-w-2xl")}>
          <div className="mb-8 flex items-center justify-center gap-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-serif font-bold border-2 transition-all",
                  step >= s 
                    ? "bg-primary border-primary text-white" 
                    : "bg-transparent border-muted-foreground/30 text-muted-foreground"
                )}>
                  {step > s ? <Check className="w-5 h-5" /> : s}
                </div>
                {s < totalSteps && (
                  <div className={cn(
                    "w-16 h-0.5 mx-2",
                    step > s ? "bg-primary" : "bg-muted-foreground/30"
                  )} />
                )}
              </div>
            ))}
          </div>

          <Card className="border-none shadow-xl">
            <CardHeader className="text-center pb-8 pt-8">
              <CardTitle className="font-serif text-3xl">
                {step === 1 ? "Basic Info" : step === 2 ? "Artist Profile" : "Build Your Repertoire"}
              </CardTitle>
              <CardDescription className="text-lg">
                {step === 1 ? "Start with the essentials." : step === 2 ? "Tell the community about yourself." : "Add the pieces you're working on or have learned."}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-8 pb-8 space-y-6">
              {step === 1 && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label className="text-sm font-medium tracking-wide uppercase opacity-60">Choose Your Pianist</Label>
                    <AvatarPicker selectedId={avatarId} onSelect={setAvatarId} />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="display-name">Display Name</Label>
                    <Input id="display-name" placeholder="e.g. Elena Corvin" className="h-12 bg-background" value={displayName} onChange={(e) => setDisplayName(e.target.value)} data-testid="input-display-name" />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="instrument">Primary Instrument</Label>
                    <Select value={instrument} onValueChange={setInstrument}>
                      <SelectTrigger className="h-12 bg-background" data-testid="select-instrument">
                        <SelectValue placeholder="Select instrument" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="piano">Piano</SelectItem>
                        <SelectItem value="violin">Violin</SelectItem>
                        <SelectItem value="cello">Cello</SelectItem>
                        <SelectItem value="flute">Flute</SelectItem>
                        <SelectItem value="voice-soprano">Voice (Soprano)</SelectItem>
                        <SelectItem value="voice-tenor">Voice (Tenor)</SelectItem>
                        <SelectItem value="conductor">Conductor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="level">Experience Level</Label>
                    <Select value={level} onValueChange={setLevel}>
                      <SelectTrigger className="h-12 bg-background" data-testid="select-level">
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="conservatory">Conservatory Student</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="amateur">Serious Amateur</SelectItem>
                        <SelectItem value="educator">Educator</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea 
                      id="bio" 
                      placeholder="Share your musical background, education, and current focus..." 
                      className="min-h-[150px] bg-background resize-none leading-relaxed"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      data-testid="input-bio"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="location">Based In</Label>
                    <Input id="location" placeholder="e.g. New York, NY" className="h-12 bg-background" value={location} onChange={(e) => setLocationField(e.target.value)} data-testid="input-location" />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6 overflow-x-auto">
                  <QuickSearchFill
                    onFill={(result) => {
                      const emptyRow = repertoire.find(r => !r.composerId && !r.pieceId);
                      const targetId = emptyRow?.id ?? Math.random().toString(36).substr(2, 9);
                      setAutoFilledRows(prev => new Set(prev).add(targetId));
                      if (!emptyRow) {
                        setRepertoire(prev => [...prev, { id: targetId, composerId: result.composerId.toString(), pieceId: result.pieceId.toString(), movementIds: result.movementId ? result.movementId.toString() : "", status: "Learning", dateStarted: "" }]);
                      } else {
                        setRepertoire(prev => prev.map(r => r.id === targetId ? { ...r, composerId: result.composerId.toString(), pieceId: result.pieceId.toString(), movementIds: result.movementId ? result.movementId.toString() : "" } : r));
                      }
                    }}
                  />
                  <Table className="table-fixed w-full">
                    <colgroup>
                      <col className="w-[22%]" />
                      <col className="w-[25%]" />
                      <col className="w-[18%]" />
                      <col className="w-[16%]" />
                      <col className="w-[13%]" />
                      <col className="w-[6%]" />
                    </colgroup>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Composer</TableHead>
                        <TableHead>Piece</TableHead>
                        <TableHead>Movement(s)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Started</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {repertoire.map((row) => (
                        <RepertoireSetupRow
                          key={row.id}
                          row={row}
                          onUpdate={(field, value) => updateRow(row.id, field, value)}
                          onRemove={() => removeRow(row.id)}
                          canRemove={repertoire.length > 1}
                          autoFilled={autoFilledRows.has(row.id)}
                          onAutoFillConsumed={() => setAutoFilledRows(prev => {
                            const next = new Set(prev);
                            next.delete(row.id);
                            return next;
                          })}
                        />
                      ))}
                    </TableBody>
                  </Table>
                  <Button variant="outline" onClick={addRow} className="w-full border-dashed">
                    <Plus className="w-4 h-4 mr-2" /> Add Piece
                  </Button>
                </div>
              )}

              <div className="pt-6 flex justify-between">
                <Button 
                  variant="ghost" 
                  onClick={() => setStep(step - 1)} 
                  disabled={step === 1}
                >
                  Back
                </Button>
                <Button onClick={handleNext} size="lg" className="min-w-[140px]" disabled={submitting} data-testid="button-next">
                  {submitting ? "Saving..." : step === totalSteps ? "Complete Setup" : "Next"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
