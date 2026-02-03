import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Check, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { useQuery } from "@tanstack/react-query";

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
  movementId: string;
  status: string;
  dateStarted: string;
}

function RepertoireSetupRow({ 
  row, 
  onUpdate, 
  onRemove, 
  canRemove 
}: { 
  row: RepertoireRow; 
  onUpdate: (field: keyof RepertoireRow, value: string) => void; 
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [composerQuery, setComposerQuery] = useState("");
  const [pieceQuery, setPieceQuery] = useState("");

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
    if (row.composerId) {
      onUpdate("pieceId", "");
      onUpdate("movementId", "");
    }
  }, [row.composerId]);

  useEffect(() => {
    if (row.pieceId) {
      onUpdate("movementId", "");
    }
  }, [row.pieceId]);

  const composerOptions = composers.map(c => ({ value: c.id.toString(), label: c.name }));
  const pieceOptions = pieces.map(p => ({ value: p.id.toString(), label: p.title }));
  const movementOptions = movements.map(m => ({ value: m.id.toString(), label: m.name }));

  return (
    <TableRow>
      <TableCell>
        <SearchableCombobox
          options={composerOptions}
          value={row.composerId}
          onValueChange={(val) => onUpdate("composerId", val)}
          onSearch={setComposerQuery}
          placeholder="Select composer..."
          searchPlaceholder="Search..."
          emptyMessage="No composers found."
          isLoading={composersLoading}
        />
      </TableCell>
      <TableCell>
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
        />
      </TableCell>
      <TableCell>
        <SearchableCombobox
          options={movementOptions}
          value={row.movementId}
          onValueChange={(val) => onUpdate("movementId", val)}
          onSearch={() => {}}
          placeholder={movements.length === 0 ? "N/A" : "Select..."}
          searchPlaceholder="Search..."
          emptyMessage="No movements."
          isLoading={movementsLoading}
          disabled={!row.pieceId || movements.length === 0}
        />
      </TableCell>
      <TableCell>
        <Select 
          value={row.status} 
          onValueChange={(val) => onUpdate("status", val)}
        >
          <SelectTrigger className="h-10 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Wishlist">Wishlist</SelectItem>
            <SelectItem value="In Progress">In Progress</SelectItem>
            <SelectItem value="Learned">Learned</SelectItem>
            <SelectItem value="Performance-ready">Performance-ready</SelectItem>
            <SelectItem value="Re-learning">Re-learning</SelectItem>
            <SelectItem value="Stopped learning">Stopped learning</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input 
          type="date" 
          disabled={row.status === "Wishlist"}
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
  const totalSteps = 3;

  const [repertoire, setRepertoire] = useState<RepertoireRow[]>([
    { id: "1", composerId: "", pieceId: "", movementId: "", status: "In Progress", dateStarted: "" }
  ]);

  const addRow = () => {
    setRepertoire([...repertoire, { id: Math.random().toString(36).substr(2, 9), composerId: "", pieceId: "", movementId: "", status: "In Progress", dateStarted: "" }]);
  };

  const removeRow = (id: string) => {
    if (repertoire.length > 1) {
      setRepertoire(repertoire.filter(row => row.id !== id));
    }
  };

  const updateRow = (id: string, field: keyof RepertoireRow, value: string) => {
    setRepertoire(repertoire.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      setLocation("/profile");
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
                    <Label htmlFor="display-name">Display Name</Label>
                    <Input id="display-name" placeholder="e.g. Elena Corvin" className="h-12 bg-background" />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="instrument">Primary Instrument</Label>
                    <Select>
                      <SelectTrigger className="h-12 bg-background">
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
                    <Select>
                      <SelectTrigger className="h-12 bg-background">
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
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="location">Based In</Label>
                    <Input id="location" placeholder="e.g. New York, NY" className="h-12 bg-background" />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Composer</TableHead>
                        <TableHead className="w-[200px]">Piece</TableHead>
                        <TableHead className="w-[150px]">Movement(s)</TableHead>
                        <TableHead className="w-[180px]">Status</TableHead>
                        <TableHead className="w-[150px]">Started</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
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
                <Button onClick={handleNext} size="lg" className="min-w-[140px]">
                  {step === totalSteps ? "Complete Setup" : "Next"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
