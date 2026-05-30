import { lazy, Suspense, useMemo } from "react";
import { Dumbbell, CalendarDays } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import DesktopPageHeader from "./DesktopPageHeader";
import { TabPageSkeleton } from "@/components/ui/PageSkeleton";
import { useActivities } from "@/hooks/use-activities";

const TrainingTab = lazy(() => import("@/components/TrainingTab"));

interface Props {
  lang: Lang;
  score: number | null;
  setScore: (s: number | null) => void;
  onLoginRequest: () => void;
}

export default function DashboardTraining({ lang, score, setScore, onLoginRequest }: Props) {
  const zh = lang === "zh";
  const { plannedWorkouts } = useActivities();

  const upcoming = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (plannedWorkouts || [])
      .filter((w) => new Date(w.date) >= today)
      .slice(0, 8);
  }, [plannedWorkouts]);

  return (
    <div>
      <DesktopPageHeader
        title={zh ? "訓練計畫" : "Training plan"}
        subtitle={zh ? "管理你的週訓練與比賽備戰" : "Plan your week and gear up for your goal race"}
        icon={<Dumbbell className="h-5 w-5" />}
      />

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <Card className="xl:col-span-3 p-0 overflow-hidden">
          <Suspense fallback={<TabPageSkeleton />}>
            <TrainingTab
              score={score}
              setScore={setScore}
              lang={lang}
              onLoginRequest={onLoginRequest}
            />
          </Suspense>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="h-4 w-4 text-primary" />
              <h3 className="font-display font-semibold text-sm uppercase tracking-wider">
                {zh ? "即將到來" : "Upcoming"}
              </h3>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                {zh ? "尚無計劃訓練" : "No planned workouts"}
              </p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((w, i) => (
                  <div
                    key={`${w.date}-${i}`}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/40 transition-colors"
                  >
                    <div
                      className="h-10 w-10 rounded-md flex flex-col items-center justify-center text-[10px] font-bold shrink-0"
                      style={{ backgroundColor: `${w.color}20`, color: w.color }}
                    >
                      <span className="leading-none">
                        {new Date(w.date).toLocaleDateString(zh ? "zh-TW" : "en-US", { day: "numeric" })}
                      </span>
                      <span className="leading-none mt-0.5 opacity-70">
                        {new Date(w.date).toLocaleDateString(zh ? "zh-TW" : "en-US", { month: "short" })}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{w.title || w.type}</div>
                      <div className="text-xs text-muted-foreground">
                        {w.distance_km ? `${w.distance_km} km` : w.pace || ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
