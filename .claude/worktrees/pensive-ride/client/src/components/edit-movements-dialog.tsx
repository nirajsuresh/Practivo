import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

type Movement = {
  id: number;
  name: string;
  pieceId: number;
};

type EditMovementsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pieceId: number;
  userId: string;
  currentEntries: { entryId: number; movementId: number | null }[];
  currentStatus: string;
  composerId: number;
  onSave: () => void;
};

export function EditMovementsDialog({
  open,
  onOpenChange,
  pieceId,
  userId,
  currentEntries,
  currentStatus,
  composerId,
  onSave,
}: EditMovementsDialogProps) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/pieces/${pieceId}/movements`)
      .then((r) => r.json())
      .then((data: Movement[]) => {
        setMovements(data);
        const currentMovIds = new Set(
          currentEntries.filter((e) => e.movementId !== null).map((e) => e.movementId!)
        );
        setSelected(currentMovIds);
      })
      .finally(() => setLoading(false));
  }, [open, pieceId, currentEntries]);

  const toggle = (movId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(movId)) {
        next.delete(movId);
      } else {
        next.add(movId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const currentMovIds = new Set(
        currentEntries.filter((e) => e.movementId !== null).map((e) => e.movementId!)
      );
      const wholePieceEntries = currentEntries.filter((e) => e.movementId === null);

      const toAdd = Array.from(selected).filter((id) => !currentMovIds.has(id));
      const toRemove = currentEntries.filter(
        (e) => e.movementId !== null && !selected.has(e.movementId!)
      );

      await Promise.all([
        ...toAdd.map((movementId) =>
          apiRequest("POST", "/api/repertoire", {
            userId,
            composerId,
            pieceId,
            movementId,
            status: currentStatus,
          })
        ),
        ...toRemove.map((e) =>
          apiRequest("DELETE", `/api/repertoire/${e.entryId}`)
        ),
        ...wholePieceEntries.map((e) =>
          apiRequest("DELETE", `/api/repertoire/${e.entryId}`)
        ),
      ]);

      onSave();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]" data-testid="edit-movements-dialog">
        <DialogHeader>
          <DialogTitle>Edit Movements</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : movements.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">This piece has no individual movements.</p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto py-2">
            <button
              type="button"
              onClick={() => {
                if (selected.size === movements.length) {
                  setSelected(new Set());
                } else {
                  setSelected(new Set(movements.map((m) => m.id)));
                }
              }}
              className="text-xs text-primary hover:underline px-3 py-1"
              data-testid="button-toggle-all-movements"
            >
              {selected.size === movements.length ? "Deselect all" : "Select all"}
            </button>
            {movements.map((mov) => (
              <label
                key={mov.id}
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/30 cursor-pointer transition-colors"
                data-testid={`movement-checkbox-${mov.id}`}
              >
                <Checkbox
                  checked={selected.has(mov.id)}
                  onCheckedChange={() => toggle(mov.id)}
                />
                <span className="text-sm">{mov.name}</span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-movements">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || selected.size === 0} data-testid="button-save-movements">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
