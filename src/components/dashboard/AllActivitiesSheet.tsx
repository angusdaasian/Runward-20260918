import { useState } from "react";
import { Calendar as CalendarIcon, MapPin } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/lib/i18n";
import { type StravaActivity } from "@/hooks/use-activities";

interface Props {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  activities: StravaActivity[];
  onSelect: (a: StravaActivity) => void;
}

function fmtDistance(meters: number) {
  return (meters / 1000).toFixed(2);
}
function fmtPace(metersPerSec: number) {
  if (!metersPerSec) return "—";
  const sec = 1000 / metersPerSec;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function AllActivitiesSheet({ open, onClose, lang, activities, onSelect }: Props) {
  const zh = lang === "zh";
  const [pageSize, setPageSize] = useState(30);
  const visible = activities.slice(0, pageSize);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            {zh ? "全部活動" : "All activities"}
          </SheetTitle>
          <SheetDescription>
            {zh
              ? `共 ${activities.length} 筆 · 點擊查看詳情`
              : `${activities.length} sessions · click to view details`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {activities.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {zh ? "尚無活動" : "No activities yet"}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left font-semibold py-2 pr-3">{zh ? "活動" : "Activity"}</th>
                      <th className="text-left font-semibold py-2 pr-3">{zh ? "日期" : "Date"}</th>
                      <th className="text-right font-semibold py-2 pr-3">{zh ? "距離" : "Distance"}</th>
                      <th className="text-right font-semibold py-2 pr-3">{zh ? "時間" : "Time"}</th>
                      <th className="text-right font-semibold py-2">{zh ? "配速" : "Pace"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((a) => (
                      <tr
                        key={a.id}
                        onClick={() => onSelect(a)}
                        className="border-b border-border/40 hover:bg-muted/40 transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 pr-3 max-w-xs">
                          <div className="font-medium truncate">{a.name}</div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3" />
                            {a.sport_type}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground text-xs">
                          {new Date(a.start_date).toLocaleDateString(zh ? "zh-TW" : "en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums font-medium">
                          {fmtDistance(a.distance)}{" "}
                          <span className="text-muted-foreground text-xs">km</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {fmtDuration(a.moving_time)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {fmtPace(a.average_speed)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {visible.length < activities.length && (
                <div className="flex justify-center pt-4">
                  <Button variant="outline" size="sm" onClick={() => setPageSize((p) => p + 30)}>
                    {zh ? "載入更多" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
