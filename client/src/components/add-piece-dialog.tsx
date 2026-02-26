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

export interface NewPieceData {
  id: string;
  composer: string;
  piece: string;
  movements: string[];
  status: string;
  date: string;
  composerId: number;
  pieceId: number;
  movementIds: number[];
}

interface AddPieceDialogProps {
  onAdd?: (piece: NewPieceData) => void;
}

export function AddPieceDialog({ onAdd }: AddPieceDialogProps) {
  const [open, setOpen] = useState(false);
  const [dialogContainer, setDialogContainer] = useState<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (status === "Want to learn") {
      setStartedDate("");
    }
  }, [status]);

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
    const composerName = composers.find(c => c.id.toString() === selectedComposerId)?.name ?? "";
    const pieceTitle = pieces.find(p => p.id.toString() === selectedPieceId)?.title ?? "";
    const movementNames = selectedMovementIds.map(id => {
      const m = movements.find(m => m.id.toString() === id);
      return m?.name ?? "";
    }).filter(Boolean);

    const newPiece: NewPieceData = {
      id: selectedPieceId,
      composer: composerName,
      piece: pieceTitle,
      movements: movementNames,
      status,
      date: status === "Want to learn" ? "—" : (startedDate || new Date().toISOString().split("T")[0]),
      composerId: Number(selectedComposerId),
      pieceId: Number(selectedPieceId),
      movementIds: selectedMovementIds.map(Number),
    };

    onAdd?.(newPiece);
    handleReset();
    setOpen(false);
  };

  const composerOptions = composers.map(c => ({ value: c.id.toString(), label: c.name }));
  const pieceOptions = pieces.map(p => ({ value: p.id.toString(), label: p.title }));
  const movementOptions = movements.map(m => ({ value: m.id.toString(), label: m.name }));

  const isWantToLearn = status === "Want to learn";

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
      <DialogContent ref={setDialogContainer} className="sm:max-w-[425px] overflow-visible">
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
              portalContainer={dialogContainer}
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
              portalContainer={dialogContainer}
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
              portalContainer={dialogContainer}
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
            <Label className={isWantToLearn ? "text-muted-foreground" : ""}>Started</Label>
            <Input 
              type="date" 
              value={startedDate} 
              onChange={(e) => setStartedDate(e.target.value)}
              disabled={isWantToLearn}
              className={isWantToLearn ? "opacity-40" : ""}
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
