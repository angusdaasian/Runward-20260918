import { useEffect, useState } from "react";
import { Lang } from "@/lib/i18n";
import { WidgetId } from "@/lib/analyticsWidgets";
import WidgetTilePreview from "./widgets/WidgetTilePreview";
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors,
  closestCenter, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";

interface Props {
  order: WidgetId[];
  lang: Lang;
  onOpen: (id: WidgetId) => void;
  onReorder: (next: WidgetId[]) => void;
}

const DraggableWidget = ({
  id, lang, onOpen, anyDragging,
}: {
  id: WidgetId; lang: Lang; onOpen: (id: WidgetId) => void; anyDragging: boolean;
}) => {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging, transform } = useDraggable({ id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });

  const setRefs = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    touchAction: "none",
  };

  return (
    <div
      ref={setRefs}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-2xl ${isOver && !isDragging ? "ring-2 ring-primary" : ""} ${
        anyDragging && !isDragging ? "animate-[wiggle_0.4s_ease-in-out_infinite]" : ""
      }`}
    >
      <WidgetTilePreview id={id} lang={lang} onOpen={() => onOpen(id)} />
    </div>
  );
};

const ReorderableWidgetGrid = ({ order, lang, onOpen, onReorder }: Props) => {
  const [activeId, setActiveId] = useState<WidgetId | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  useEffect(() => {
    if (activeId && !order.includes(activeId)) setActiveId(null);
  }, [order, activeId]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e: DragStartEvent) => {
        setActiveId(e.active.id as WidgetId);
        if (typeof navigator !== "undefined" && (navigator as any).vibrate) {
          try { (navigator as any).vibrate(25); } catch {}
        }
      }}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={(e: DragEndEvent) => {
        setActiveId(null);
        if (!e.over) return;
        const fromId = e.active.id as WidgetId;
        const toId = e.over.id as WidgetId;
        if (fromId === toId) return;
        const from = order.indexOf(fromId);
        const to = order.indexOf(toId);
        if (from === -1 || to === -1) return;
        const next = [...order];
        next.splice(from, 1);
        next.splice(to, 0, fromId);
        onReorder(next);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        {order.map((id) => (
          <DraggableWidget
            key={id}
            id={id}
            lang={lang}
            onOpen={onOpen}
            anyDragging={activeId != null}
          />
        ))}
      </div>
    </DndContext>
  );
};

export default ReorderableWidgetGrid;
