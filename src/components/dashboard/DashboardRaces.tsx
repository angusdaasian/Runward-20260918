import { lazy, Suspense, useMemo } from "react";
import { Trophy, Flag } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import DesktopPageHeader from "./DesktopPageHeader";
import { TabPageSkeleton } from "@/components/ui/PageSkeleton";
import { useActivities } from "@/hooks/use-activities";

const DesktopRaceTab = lazy(() => import("./DesktopRaceTab"));

interface Props {
  lang: Lang;
}

function daysUntil(dateStr: string) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export default function DashboardRaces({ lang }: Props) {
  const zh = lang === "zh";
  const { userRaces } = useActivities();

  const upcoming = useMemo(() => {
    return (userRaces || [])
      .filter((r) => daysUntil(r.race_date) >= 0)
      .sort((a, b) => new Date(a.race_date).getTime() - new Date(b.race_date).getTime())
      .slice(0, 5);
  }, [userRaces]);

  return (
    <div>
      <DesktopPageHeader
        title={zh ? "比賽" : "Races"}
        subtitle={zh ? "管理你的比賽與目標" : "Track your goal races and history"}
        icon={<Trophy className="h-5 w-5" />}
      />

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <Card className="xl:col-span-3 p-0 overflow-hidden">
          <Suspense fallback={<TabPageSkeleton />}>
            <RaceTab lang={lang} />
          </Suspense>
        </Card>

        <Card className="p-5 h-fit">
          <div className="flex items-center gap-2 mb-3">
            <Flag className="h-4 w-4 text-amber-500" />
            <h3 className="font-display font-semibold text-sm uppercase tracking-wider">
              {zh ? "倒數計時" : "Countdown"}
            </h3>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              {zh ? "尚未安排比賽" : "No upcoming race"}
            </p>
          ) : (
            <div className="space-y-3">
              {upcoming.map((r) => {
                const d = daysUntil(r.race_date);
                return (
                  <div key={r.id} className="border-l-2 border-primary/60 pl-3 py-1">
                    <div className="font-display font-semibold text-sm truncate">
                      {zh && r.race_name_zh ? r.race_name_zh : r.race_name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(r.race_date).toLocaleDateString(zh ? "zh-TW" : "en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {r.city ? ` · ${r.city}` : ""}
                    </div>
                    <div className="mt-1.5 inline-flex items-baseline gap-1">
                      <span className="text-xl font-display font-bold text-primary tabular-nums">{d}</span>
                      <span className="text-xs text-muted-foreground">{zh ? "天" : "days"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
