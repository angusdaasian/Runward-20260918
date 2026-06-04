import { useEffect, useRef, useState } from "react";
import { Lang } from "@/lib/i18n";
import { WidgetId } from "@/lib/analyticsWidgets";
import WidgetTilePreview from "./widgets/WidgetTilePreview";

interface Props {
  order: WidgetId[];
  lang: Lang;
  onOpen: (id: WidgetId) => void;
  onReorder: (next: WidgetId[]) => void;
}

const LONG_PRESS_MS = 450;

const ReorderableWidgetGrid = ({ order, lang, onOpen, onReorder }: Props) => {
  const [localOrder, setLocalOrder] = useState<WidgetId[]>(order);
  const [draggingId, setDraggingId] = useState<WidgetId | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const orderRef = useRef<WidgetId[]>(order);

  useEffect(() => {
    if (!draggingId) {
      setLocalOrder(order);
      orderRef.current = order;
    }
  }, [order, draggingId]);

  useEffect(() => {
    orderRef.current = localOrder;
  }, [localOrder]);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = (id: WidgetId, e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startPos.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      setDraggingId(id);
      if (typeof navigator !== "undefined" && (navigator as any).vibrate) {
        try { (navigator as any).vibrate(25); } catch {}
      }
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId) {
      // Cancel long-press if user moved before threshold
      if (startPos.current) {
        const dx = e.clientX - startPos.current.x;
        const dy = e.clientY - startPos.current.y;
        if (Math.hypot(dx, dy) > 8) clearLongPress();
      }
      return;
    }
    movedRef.current = true;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const tile = el?.closest("[data-widget-id]") as HTMLElement | null;
    const overId = tile?.getAttribute("data-widget-id") as WidgetId | null;
    if (!overId || overId === draggingId) return;
    const cur = orderRef.current;
    const from = cur.indexOf(draggingId);
    const to = cur.indexOf(overId);
    if (from === -1 || to === -1) return;
    const next = [...cur];
    next.splice(from, 1);
    next.splice(to, 0, draggingId);
    setLocalOrder(next);
  };

  const handlePointerUp = () => {
    clearLongPress();
    if (draggingId) {
      const next = orderRef.current;
      setDraggingId(null);
      if (movedRef.current) onReorder(next);
    }
    startPos.current = null;
  };

  return (
    <div
      className="grid grid-cols-2 gap-3"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {localOrder.map((id) => {
        const isDragging = id === draggingId;
        const anyDragging = draggingId != null;
        return (
          <div
            key={id}
            data-widget-id={id}
            onPointerDown={(e) => handlePointerDown(id, e)}
            onClickCapture={(e) => {
              if (movedRef.current) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            style={{ touchAction: anyDragging ? "none" : "auto" }}
            className={`transition-transform ${isDragging ? "scale-105 opacity-80 z-10" : ""} ${
              anyDragging && !isDragging ? "animate-[wiggle_0.4s_ease-in-out_infinite]" : ""
            }`}
          >
            <WidgetTilePreview id={id} lang={lang} onOpen={() => { if (!movedRef.current && !draggingId) onOpen(id); }} />
          </div>
        );
      })}
    </div>
  );
};

export default ReorderableWidgetGrid;
