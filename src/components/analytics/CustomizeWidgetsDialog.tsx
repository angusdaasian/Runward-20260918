import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";
import { Lang } from "@/lib/i18n";
import {
  AnalyticsWidgetPrefs,
  WidgetId,
  ALL_WIDGETS,
} from "@/lib/analyticsWidgets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: AnalyticsWidgetPrefs;
  onSave: (prefs: AnalyticsWidgetPrefs) => void;
  lang: Lang;
  labels: Record<WidgetId, string>;
}

const CustomizeWidgetsDialog = ({ open, onOpenChange, prefs, onSave, lang, labels }: Props) => {
  const [order, setOrder] = useState<WidgetId[]>(prefs.order);
  const [hidden, setHidden] = useState<Set<WidgetId>>(new Set(prefs.hidden));

  // Sync when re-opened
  const handleOpen = (o: boolean) => {
    if (o) {
      setOrder(prefs.order);
      setHidden(new Set(prefs.hidden));
    }
    onOpenChange(o);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...order];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setOrder(next);
  };
  const toggle = (id: WidgetId) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHidden(next);
  };

  // include any missing widgets at the end
  const fullOrder = [...order, ...ALL_WIDGETS.filter((w) => !order.includes(w))];

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md p-0 max-h-[85vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="font-display text-lg font-bold">
            {lang === "zh" ? "自訂Dashboard" : "Customize dashboard"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {lang === "zh" ? "重新排序與顯示/隱藏小工具" : "Reorder and show/hide widgets"}
          </p>
        </div>
        <div className="overflow-y-auto p-3 flex-1">
          <ul className="space-y-1.5">
            {fullOrder.map((id, idx) => {
              const isHidden = hidden.has(id);
              return (
                <li
                  key={id}
                  className={`flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 ${isHidden ? "opacity-50" : ""}`}
                >
                  <div className="flex flex-col">
                    <button
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-muted disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      onClick={() => move(idx, 1)}
                      disabled={idx === fullOrder.length - 1}
                      className="p-1 rounded hover:bg-muted disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ArrowDown size={12} />
                    </button>
                  </div>
                  <div className="flex-1 text-sm font-medium">{labels[id]}</div>
                  <button
                    onClick={() => toggle(id)}
                    className="p-2 rounded hover:bg-muted"
                    aria-label={isHidden ? "Show" : "Hide"}
                  >
                    {isHidden ? <EyeOff size={16} /> : <Eye size={16} className="text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {lang === "zh" ? "取消" : "Cancel"}
          </Button>
          <Button
            onClick={() => {
              onSave({ order: fullOrder, hidden: Array.from(hidden) });
              onOpenChange(false);
            }}
          >
            {lang === "zh" ? "儲存" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CustomizeWidgetsDialog;
