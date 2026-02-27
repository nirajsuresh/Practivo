import { useState, useCallback, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
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

type BoardItem = {
  id: string;
  composer: string;
  piece: string;
  movements: string[];
  status: string;
  progress: number;
};

type RepertoireBoardProps = {
  items: BoardItem[];
  onStatusChange: () => void;
};

const MAIN_COLUMNS = ["Want to learn", "Up next", "Learning"] as const;
const STACKED_COLUMNS = ["Refining", "Maintaining", "Shelved", "Performance Ready"] as const;

function DroppableColumn({
  status,
  children,
  count,
  compact,
}: {
  status: string;
  children: React.ReactNode;
  count: number;
  compact?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const dotColor = getStatusDotColor(status);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-lg transition-colors",
        compact ? "min-h-0" : "flex-1 min-w-0",
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
      <div className={cn(
        "flex-1 p-2 space-y-2 overflow-y-auto",
        compact ? "min-h-[60px] max-h-[180px]" : "min-h-[100px] max-h-[calc(100vh-280px)]"
      )}>
        {children}
      </div>
    </div>
  );
}

function DraggableCard({
  item,
  onProgressChange,
}: {
  item: BoardItem;
  onProgressChange: (id: string, progress: number) => void;
}) {
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
        "bg-[#faf9f5] rounded-md p-3 shadow-sm border border-border/30 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow",
        isDragging && "shadow-lg ring-2 ring-primary/30"
      )}
      data-testid={`board-card-${item.id}`}
    >
      <Link href={`/piece/${item.id}`}>
        <p className="text-xs font-semibold text-primary tracking-wide uppercase leading-tight">
          {item.composer}
        </p>
        <p className="font-serif italic text-sm mt-0.5 leading-snug">
          {item.piece}
        </p>
      </Link>
      {item.movements.length > 1 && (
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
  compact,
}: {
  status: string;
  items: BoardItem[];
  onProgressChange: (id: string, progress: number) => void;
  compact?: boolean;
}) {
  const colItems = items.filter((i) => i.status === status);
  return (
    <DroppableColumn status={status} count={colItems.length} compact={compact}>
      <SortableContext
        items={colItems.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        {colItems.map((item) => (
          <DraggableCard
            key={item.id}
            item={item}
            onProgressChange={onProgressChange}
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

export function RepertoireBoard({ items, onStatusChange }: RepertoireBoardProps) {
  const [boardItems, setBoardItems] = useState<BoardItem[]>(items);
  const [activeItem, setActiveItem] = useState<BoardItem | null>(null);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const updateStatus = useCallback(
    async (pieceId: string, newStatus: string) => {
      try {
        const body: Record<string, any> = { status: newStatus };
        if (newStatus !== "Learning") body.progress = 0;

        await apiRequest("PATCH", `/api/repertoire/piece/${pieceId}`, body);
        onStatusChange();
      } catch {
        toast({ title: "Failed to update status", variant: "destructive" });
      }
    },
    [onStatusChange, toast]
  );

  const handleProgressChange = useCallback(
    (itemId: string, progress: number) => {
      setBoardItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, progress } : i))
      );
      const debounceKey = `progress-${itemId}`;
      if ((window as any)[debounceKey]) clearTimeout((window as any)[debounceKey]);
      (window as any)[debounceKey] = setTimeout(() => {
        apiRequest("PATCH", `/api/repertoire/piece/${itemId}`, { progress }).catch(() => {});
      }, 500);
    },
    []
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
          ? { ...i, status: targetStatus, progress: targetStatus === "Learning" ? i.progress : 0 }
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
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="flex gap-3 pb-4"
        data-testid="repertoire-board"
      >
        {MAIN_COLUMNS.map((status) => (
          <ColumnWithCards
            key={status}
            status={status}
            items={boardItems}
            onProgressChange={handleProgressChange}
          />
        ))}

        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {STACKED_COLUMNS.map((status) => (
            <ColumnWithCards
              key={status}
              status={status}
              items={boardItems}
              onProgressChange={handleProgressChange}
              compact
            />
          ))}
        </div>
      </div>
      <DragOverlay>
        {activeItem ? <OverlayCard item={activeItem} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
