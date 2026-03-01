import { useState, useCallback, useEffect, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  rectIntersection,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import {
  getStatusDotColor,
  STATUSES,
} from "@/lib/status-colors";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Slider } from "@/components/ui/slider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, SplitSquareHorizontal, Merge, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShareToFeedPrompt } from "@/components/share-to-feed-prompt";

type BoardItem = {
  id: string;
  pieceId: number;
  entryId?: number;
  composer: string;
  piece: string;
  movements: string[];
  status: string;
  progress: number;
  isSplit: boolean;
  movementCount: number;
};

type RepertoireBoardProps = {
  items: BoardItem[];
  onStatusChange: () => void;
  onToggleSplit?: (pieceId: number, split: boolean) => void;
  onEditMovements?: (pieceId: number) => void;
  onRemove?: (id: string, pieceId: number, isSplit: boolean) => void;
  userId?: string;
};

type SharePromptState = {
  pieceTitle: string;
  composerName: string;
  pieceId: number;
  newStatus: string;
} | null;

const MAIN_COLUMNS = ["Want to learn", "Up next", "Learning"] as const;
const STACKED_A = ["Refining", "Maintaining"] as const;
const STACKED_B = ["Performance Ready", "Shelved"] as const;

const ALL_COLUMN_IDS = new Set<string>([...MAIN_COLUMNS, ...STACKED_A, ...STACKED_B]);

const customCollisionDetection: CollisionDetection = (args) => {
  const rectCollisions = rectIntersection(args);
  const columnCollisions = rectCollisions.filter((c) => ALL_COLUMN_IDS.has(String(c.id)));
  if (columnCollisions.length > 0) {
    return columnCollisions;
  }
  return closestCenter(args);
};

function DroppableColumn({
  status,
  children,
  count,
}: {
  status: string;
  children: React.ReactNode;
  count: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const dotColor = getStatusDotColor(status);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const overflows = el.scrollHeight > el.clientHeight + 2;
    setHasOverflow(overflows);
    setIsScrolledToBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [checkOverflow, children]);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-lg transition-colors flex-1 min-w-0 min-h-0",
        isOver ? "bg-primary/5 ring-2 ring-primary/20" : "bg-muted/20"
      )}
      data-testid={`board-column-${status.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="px-3 py-2 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: dotColor }}
            />
            <h3 className="text-sm font-semibold tracking-tight">{status}</h3>
          </div>
          <span className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        </div>
      </div>
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={checkOverflow}
          className="p-2 space-y-2 overflow-y-auto h-full"
        >
          {children}
        </div>
        {hasOverflow && !isScrolledToBottom && (
          <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
            <div className="h-8 bg-gradient-to-t from-muted/40 to-transparent" />
            <div className="text-center -mt-1 pb-0.5">
              <span className="text-xs text-muted-foreground font-medium tracking-widest">···</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  item,
  onProgressChange,
  onToggleSplit,
  onEditMovements,
  onRemove,
}: {
  item: BoardItem;
  onProgressChange: (id: string, progress: number) => void;
  onToggleSplit?: (pieceId: number, split: boolean) => void;
  onEditMovements?: (pieceId: number) => void;
  onRemove?: (id: string, pieceId: number, isSplit: boolean) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, data: { status: item.status } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group bg-[#faf9f5] rounded-md p-3 shadow-sm border border-border/30 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow",
        isDragging && "shadow-lg ring-2 ring-primary/30"
      )}
      data-testid={`board-card-${item.id}`}
    >
      <div className="flex items-start justify-between gap-1">
        <Link href={`/piece/${item.pieceId}`} className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-primary tracking-wide uppercase leading-tight">
            {item.composer}
          </p>
          <p className="font-serif italic text-sm mt-0.5 leading-snug">
            {item.piece}
          </p>
        </Link>
        {(onToggleSplit || onEditMovements || onRemove) && (
          <div onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger className="p-0.5 rounded hover:bg-muted/50 -mt-0.5 -mr-1 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`card-actions-${item.id}`}>
                <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {onEditMovements && !item.isSplit && (
                  <DropdownMenuItem onClick={() => onEditMovements(item.pieceId)} data-testid={`edit-movements-${item.id}`}>
                    <Pencil className="w-3.5 h-3.5 mr-2" />
                    Edit movements
                  </DropdownMenuItem>
                )}
                {onToggleSplit && item.movementCount >= 2 && !item.isSplit && (
                  <DropdownMenuItem onClick={() => onToggleSplit(item.pieceId, true)} data-testid={`split-${item.id}`}>
                    <SplitSquareHorizontal className="w-3.5 h-3.5 mr-2" />
                    Split into movements
                  </DropdownMenuItem>
                )}
                {onToggleSplit && item.isSplit && (
                  <DropdownMenuItem onClick={() => onToggleSplit(item.pieceId, false)} data-testid={`rejoin-${item.id}`}>
                    <Merge className="w-3.5 h-3.5 mr-2" />
                    Rejoin movements
                  </DropdownMenuItem>
                )}
                {onRemove && (
                  <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-destructive focus:text-destructive" data-testid={`card-remove-${item.id}`}>
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Remove from repertoire
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove from repertoire?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove {item.isSplit ? `this movement of "${item.piece}"` : `"${item.piece}"`} from your repertoire. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onRemove(item.id, item.pieceId, item.isSplit)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
      {item.isSplit && item.movements.length === 1 && (
        <p className="text-[10px] text-muted-foreground mt-1">
          {item.movements[0]}
        </p>
      )}
      {!item.isSplit && item.movements.length > 1 && (
        <p className="text-[10px] text-muted-foreground mt-1">
          {item.movements.length} movements
        </p>
      )}
      {item.status === "Learning" && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">Progress</span>
            <span className="text-[10px] font-medium">{item.progress}%</span>
          </div>
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <Slider
              value={[item.progress]}
              onValueChange={([val]) => onProgressChange(item.id, val)}
              max={100}
              step={5}
              className="w-full"
              data-testid={`progress-slider-${item.id}`}
            />
          </div>
        </div>
      )}
      {item.status !== "Learning" && item.progress > 0 && item.status !== "Want to learn" && item.status !== "Up next" && (
        <div className="mt-1.5">
          <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/40"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function OverlayCard({ item }: { item: BoardItem }) {
  return (
    <div className="bg-[#faf9f5] rounded-md p-3 shadow-lg border border-primary/30 w-[200px] rotate-2">
      <p className="text-xs font-semibold text-primary tracking-wide uppercase leading-tight">
        {item.composer}
      </p>
      <p className="font-serif italic text-sm mt-0.5 leading-snug">
        {item.piece}
      </p>
    </div>
  );
}

function ColumnWithCards({
  status,
  items,
  onProgressChange,
  onToggleSplit,
  onEditMovements,
  onRemove,
}: {
  status: string;
  items: BoardItem[];
  onProgressChange: (id: string, progress: number) => void;
  onToggleSplit?: (pieceId: number, split: boolean) => void;
  onEditMovements?: (pieceId: number) => void;
  onRemove?: (id: string, pieceId: number, isSplit: boolean) => void;
}) {
  const colItems = items.filter((i) => i.status === status);
  return (
    <DroppableColumn status={status} count={colItems.length}>
      <SortableContext
        items={colItems.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        {colItems.map((item) => (
          <DraggableCard
            key={item.id}
            item={item}
            onProgressChange={onProgressChange}
            onToggleSplit={onToggleSplit}
            onEditMovements={onEditMovements}
            onRemove={onRemove}
          />
        ))}
      </SortableContext>
      {colItems.length === 0 && (
        <div className="flex items-center justify-center h-12 text-xs text-muted-foreground/50 italic">
          Drop here
        </div>
      )}
    </DroppableColumn>
  );
}

export function RepertoireBoard({ items, onStatusChange, onToggleSplit, onEditMovements, onRemove, userId }: RepertoireBoardProps) {
  const [boardItems, setBoardItems] = useState<BoardItem[]>(items);
  const [activeItem, setActiveItem] = useState<BoardItem | null>(null);
  const [sharePrompt, setSharePrompt] = useState<SharePromptState>(null);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const patchItem = useCallback(
    async (item: BoardItem, body: Record<string, any>) => {
      if (item.isSplit && item.entryId) {
        await apiRequest("PATCH", `/api/repertoire/${item.entryId}`, body);
      } else {
        await apiRequest("PATCH", `/api/repertoire/piece/${item.pieceId}`, body);
      }
    },
    []
  );

  const updateStatus = useCallback(
    async (itemId: string, newStatus: string) => {
      const item = boardItems.find((i) => i.id === itemId);
      if (!item) return;
      try {
        await patchItem(item, { status: newStatus });
        onStatusChange();
        // Only prompt if the user is logged in and it's a meaningful status move
        if (userId) {
          setSharePrompt({
            pieceTitle: item.piece,
            composerName: item.composer,
            pieceId: item.pieceId,
            newStatus,
          });
        }
      } catch {
        toast({ title: "Failed to update status", variant: "destructive" });
      }
    },
    [boardItems, onStatusChange, toast, patchItem, userId]
  );

  const handleProgressChange = useCallback(
    (itemId: string, progress: number) => {
      setBoardItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, progress } : i))
      );
      const debounceKey = `progress-${itemId}`;
      if ((window as any)[debounceKey]) clearTimeout((window as any)[debounceKey]);
      (window as any)[debounceKey] = setTimeout(async () => {
        try {
          const item = boardItems.find((i) => i.id === itemId);
          if (!item) return;
          await patchItem(item, { progress });
          onStatusChange();
        } catch {}
      }, 500);
    },
    [boardItems, onStatusChange, patchItem]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const item = boardItems.find((i) => i.id === String(event.active.id));
    if (item) setActiveItem(item);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveItem(null);
    const { active, over } = event;
    if (!over) return;

    const draggedId = String(active.id);
    const draggedItem = boardItems.find((i) => i.id === draggedId);
    if (!draggedItem) return;

    let targetStatus: string;
    const overItem = boardItems.find((i) => i.id === String(over.id));
    if (overItem) {
      targetStatus = overItem.status;
    } else {
      targetStatus = String(over.id);
    }

    if (targetStatus === draggedItem.status) return;

    if (!STATUSES.includes(targetStatus as any)) return;

    setBoardItems((prev) =>
      prev.map((i) =>
        i.id === draggedId
          ? { ...i, status: targetStatus }
          : i
      )
    );
    updateStatus(draggedId, targetStatus);
  };

  useEffect(() => {
    setBoardItems(items);
  }, [items]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="flex gap-3 pb-4 h-[600px]"
        data-testid="repertoire-board"
      >
        {MAIN_COLUMNS.map((status) => (
          <ColumnWithCards
            key={status}
            status={status}
            items={boardItems}
            onProgressChange={handleProgressChange}
            onToggleSplit={onToggleSplit}
            onEditMovements={onEditMovements}
            onRemove={onRemove}
          />
        ))}

        <div className="flex flex-col flex-1 min-w-0 h-full">
          {STACKED_A.map((status, idx) => (
            <div key={status} className={cn("flex flex-col flex-1 min-h-0", idx > 0 && "border-t border-border/30")}>
              <ColumnWithCards
                status={status}
                items={boardItems}
                onProgressChange={handleProgressChange}
                onToggleSplit={onToggleSplit}
                onEditMovements={onEditMovements}
                onRemove={onRemove}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-col flex-1 min-w-0 h-full">
          {STACKED_B.map((status, idx) => (
            <div key={status} className={cn("flex flex-col flex-1 min-h-0", idx > 0 && "border-t border-border/30")}>
              <ColumnWithCards
                status={status}
                items={boardItems}
                onProgressChange={handleProgressChange}
                onToggleSplit={onToggleSplit}
                onEditMovements={onEditMovements}
                onRemove={onRemove}
              />
            </div>
          ))}
        </div>
      </div>
      <DragOverlay>
        {activeItem ? <OverlayCard item={activeItem} /> : null}
      </DragOverlay>

      {sharePrompt && (
        <ShareToFeedPrompt
          open={!!sharePrompt}
          onClose={() => setSharePrompt(null)}
          actionText={`Moved to ${sharePrompt.newStatus}`}
          pieceTitle={sharePrompt.pieceTitle}
          composerName={sharePrompt.composerName}
          pieceId={sharePrompt.pieceId}
          postType="status_change"
        />
      )}
    </DndContext>
  );
}
