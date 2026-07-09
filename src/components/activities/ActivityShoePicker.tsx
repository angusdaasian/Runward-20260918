import { useMemo } from "react";
import { Footprints, Check } from "lucide-react";
import { Lang } from "@/lib/i18n";
import {
  useUserShoes, useShoeAssignments, useShoeDefaults,
  shoeLabel, RunTypeKey,
} from "@/hooks/use-shoes";
import { classifyRun, RunType } from "@/lib/runClassifier";

type Props = {
  lang: Lang;
  activity: {
    id: string;
    source?: string;
    distance: number;
    moving_time?: number;
    sport_type?: string;
    average_heartrate?: number | null;
    max_heartrate?: number | null;
  };
};

// Map classifier's RunType -> our RunTypeKey enum (Race isn't produced by classifier; keep separate).
function toRunTypeKey(t: RunType): RunTypeKey {
  switch (t) {
    case "Recovery": return "Recovery";
    case "Easy": return "Easy";
    case "Long": return "Long";
    case "Tempo": return "Tempo";
    case "Interval": return "Interval";
    default: return "Easy";
  }
}

export default function ActivityShoePicker({ lang, activity }: Props) {
  const { shoes } = useUserShoes();
  const { assignments, assign, unassign } = useShoeAssignments();
  const { defaults } = useShoeDefaults();
  const t = (en: string, zh: string) => (lang === "zh" ? zh : en);

  const activeShoes = shoes.filter((s) => !s.retired);
  const source = activity.source || "strava";

  const existing = useMemo(
    () => assignments.find((a) => a.activity_source === source && a.activity_id === activity.id),
    [assignments, source, activity.id]
  );

  const inferredType = useMemo<RunTypeKey>(() => {
    const rt = classifyRun(
      {
        distance: activity.distance,
        moving_time: activity.moving_time,
        sport_type: activity.sport_type,
        average_heartrate: activity.average_heartrate,
        max_heartrate: activity.max_heartrate,
      },
      {},
      activity.distance / 1000,
    );
    return toRunTypeKey(rt);
  }, [activity]);

  const defaultShoeId = defaults[inferredType];

  const selectedId = existing?.user_shoe_id || defaultShoeId || "";
  const isAuto = !existing && !!defaultShoeId;

  const onChange = async (id: string) => {
    if (!id) {
      if (existing) await unassign(source, activity.id);
      return;
    }
    await assign(source, activity.id, id, activity.distance || 0, inferredType);
  };

  if (activeShoes.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Footprints size={16} />
        <span>{t("Add shoes in More → Shoes to track mileage.", "在「更多 → 跑鞋」新增鞋款以追蹤里數。")}</span>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <Footprints size={16} className="text-primary" />
        <span className="text-sm font-medium">{t("Shoe", "跑鞋")}</span>
        {isAuto && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {t("auto", "自動")}
          </span>
        )}
        {existing && !isAuto && (
          <span className="text-[10px] text-primary flex items-center gap-0.5">
            <Check size={10} /> {t("saved", "已儲存")}
          </span>
        )}
      </div>
      <select
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-muted rounded px-2 py-1.5 text-sm"
      >
        <option value="">{t("— none —", "— 無 —")}</option>
        {activeShoes.map((s) => (
          <option key={s.id} value={s.id}>{shoeLabel(s)}</option>
        ))}
      </select>
    </div>
  );
}
