import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableCombobox, MultiSelectCombobox } from "@/components/searchable-combobox";
import { Plus } from "lucide-react";
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

export function AddPieceDialog() {
  const [open, setOpen] = useState(false);
  const [composerQuery, setComposerQuery] = useState("");
  const [pieceQuery, setPieceQuery] = useState("");
  
  const [selectedComposerId, setSelectedComposerId] = useState("");
  const [selectedPieceId, setSelectedPieceId] = useState("");
  const [selectedMovementIds, setSelectedMovementIds] = useState<string[]>([]);
  const [status, setStatus] = useState("Learning");
  const [startedDate, setStartedDate] = useState("");

  const { data: composers = [], isLoading: composersLoading } = useQuery<Composer[]>({
    queryKey: ["/api/composers/search", composerQuery],
    queryFn: async () => {
      const res = await fetch(`/api/composers/search?q=${encodeURIComponent(composerQuery)}`);
      if (!res.ok) throw new Error("Failed to fetch composers");
      return res.json();
    },
  });

  const { data: pieces = [], isLoading: piecesLoading } = useQuery<Piece[]>({
    queryKey: ["/api/pieces/search", pieceQuery, selectedComposerId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (pieceQuery) params.set("q", pieceQuery);
      if (selectedComposerId) params.set("composerId", selectedComposerId);
      const res = await fetch(`/api/pieces/search?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch pieces");
      return res.json();
    },
    enabled: !!selectedComposerId || pieceQuery.length > 0,
  });

  const { data: movements = [], isLoading: movementsLoading } = useQuery<Movement[]>({
    queryKey: ["/api/pieces", selectedPieceId, "movements"],
    queryFn: async () => {
      const res = await fetch(`/api/pieces/${selectedPieceId}/movements`);
      if (!res.ok) throw new Error("Failed to fetch movements");
      return res.json();
    },
    enabled: !!selectedPieceId,
  });

  useEffect(() => {
    if (selectedComposerId) {
      setSelectedPieceId("");
      setSelectedMovementIds([]);
    }
  }, [selectedComposerId]);

  useEffect(() => {
    if (selectedPieceId) {
      setSelectedMovementIds([]);
    }
  }, [selectedPieceId]);

  const handleReset = () => {
    setSelectedComposerId("");
    setSelectedPieceId("");
    setSelectedMovementIds([]);
    setStatus("Learning");
    setStartedDate("");
    setComposerQuery("");
    setPieceQuery("");
  };

  const handleSubmit = () => {
    console.log({
      composerId: selectedComposerId,
      pieceId: selectedPieceId,
      movementIds: selectedMovementIds.length > 0 ? selectedMovementIds : null,
      status,
      startedDate: startedDate || null,
    });
    handleReset();
    setOpen(false);
  };

  const composerOptions = composers.map(c => ({ value: c.id.toString(), label: c.name }));
  const pieceOptions = pieces.map(p => ({ value: p.id.toString(), label: p.title }));
  const movementOptions = movements.map(m => ({ value: m.id.toString(), label: m.name }));

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) handleReset();
    }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2" data-testid="button-add-piece">
          <Plus className="w-4 h-4" /> Add Piece
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Add New Piece</DialogTitle>
          <DialogDescription>
            Add a new work to your repertoire tracking.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Composer</Label>
            <SearchableCombobox
              options={composerOptions}
              value={selectedComposerId}
              onValueChange={setSelectedComposerId}
              onSearch={setComposerQuery}
              placeholder="Select composer..."
              searchPlaceholder="Search composers..."
              emptyMessage="No composers found."
              isLoading={composersLoading}
            />
          </div>
          <div className="grid gap-2">
            <Label>Piece</Label>
            <SearchableCombobox
              options={pieceOptions}
              value={selectedPieceId}
              onValueChange={setSelectedPieceId}
              onSearch={setPieceQuery}
              placeholder="Select piece..."
              searchPlaceholder="Search pieces..."
              emptyMessage={selectedComposerId ? "No pieces found for this composer." : "Select a composer first."}
              isLoading={piecesLoading}
              disabled={!selectedComposerId}
            />
          </div>
          <div className="grid gap-2">
            <Label>Movement(s)</Label>
            <MultiSelectCombobox
              options={movementOptions}
              values={selectedMovementIds}
              onValuesChange={setSelectedMovementIds}
              onSearch={() => {}}
              placeholder={movements.length === 0 ? "No movements available" : "Select movements (optional)..."}
              searchPlaceholder="Search movements..."
              emptyMessage="No movements for this piece."
              isLoading={movementsLoading}
              disabled={!selectedPieceId || movements.length === 0}
            />
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="select-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Want to learn">Want to learn</SelectItem>
                <SelectItem value="Learning">Learning</SelectItem>
                <SelectItem value="Polishing">Polishing</SelectItem>
                <SelectItem value="Performance-ready">Performance-ready</SelectItem>
                <SelectItem value="Shelved">Shelved</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Started</Label>
            <Input 
              type="date" 
              value={startedDate} 
              onChange={(e) => setStartedDate(e.target.value)}
              data-testid="input-started-date"
            />
          </div>
        </div>
        <DialogFooter>
          <Button 
            type="submit" 
            onClick={handleSubmit}
            disabled={!selectedComposerId || !selectedPieceId}
            data-testid="button-submit-piece"
          >
            Add to Repertoire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
