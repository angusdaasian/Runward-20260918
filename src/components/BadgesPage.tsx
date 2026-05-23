import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, Lock } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { useActivities } from "@/hooks/use-activities";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { BADGES, BadgeDef, computeBadgeProgress } from "@/lib/badges";
import type { BadgeProgress } from "@/lib/badges";

const EMPTY_BADGE_PROGRESS = BADGES.reduce<Record<string, BadgeProgress>>((acc, badge) => {
  acc[badge.id] = { id: badge.id, value: 0, target: badge.target, unlocked: false };
  return acc;
}, {});

let cachedBadgeUserId: string | null = null;
let cachedBadgeProgress: Record<string, BadgeProgress> | null = null;

interface Props {
  lang: Lang;
  onBack: () => void;
}

const CATEGORY_LABELS: Record<string, { en: string; zh: string }> = {
  distance:     { en: "Distance Milestones",   zh: "里程里程碑" },
  single_run:   { en: "Single-Run Challenges", zh: "單次跑步挑戰" },
  performance:  { en: "Performance & PRs",     zh: "表現與個人最佳" },
  streak:       { en: "Streaks",               zh: "連續紀錄" },
  pace:         { en: "Pace Achievements",     zh: "配速成就" },
  volume:       { en: "Volume Goals",          zh: "里程目標" },
  elevation:    { en: "Elevation",             zh: "爬升" },
  time:         { en: "Time of Day",           zh: "時段成就" },
  weather:      { en: "Weather Warrior",       zh: "天候戰士" },
  seasonal:     { en: "Seasonal Challenges",   zh: "季節挑戰" },
  anniversary:  { en: "Anniversary",           zh: "週年慶" },
  holiday:      { en: "Holidays",              zh: "節日特輯" },
  meta:         { en: "Collector",             zh: "收藏進度" },
  special:      { en: "Special",               zh: "特別徽章" },
};

const BadgesPage = ({ lang, onBack }: Props) => {
  const isZh = lang === "zh";
  const { user } = useAuth();
  const { activities, activitiesReady } = useActivities();
  const [premiumActivatedAt, setPremiumActivatedAt] = useState<string | null>(null);
  const [isEarlyAdopter, setIsEarlyAdopter] = useState(false);
  const [premiumReady, setPremiumReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setPremiumReady(false);
    if (!user) {
      setPremiumActivatedAt(null);
      setIsEarlyAdopter(false);
      setPremiumReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("premium_subscriptions")
        .select("activated_at")
        .eq("user_id", user.id)
        .order("activated_at", { ascending: true })
        .limit(1);
      if (cancelled) return;
      const activatedAt = data?.[0]?.activated_at ?? null;
      setPremiumActivatedAt(activatedAt);
      if (activatedAt) {
        const { count } = await supabase
          .from("premium_subscriptions")
          .select("id", { count: "exact", head: true })
          .lt("activated_at", activatedAt);
        if (cancelled) return;
        setIsEarlyAdopter((count ?? 999) < 100);
      } else {
        setIsEarlyAdopter(false);
      }
      setPremiumReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const ready = activitiesReady && premiumReady;

  const liveProgress = useMemo(
    () => ready ? computeBadgeProgress({ activities, isEarlyAdopter, premiumActivatedAt }) : EMPTY_BADGE_PROGRESS,
    [activities, isEarlyAdopter, premiumActivatedAt, ready]
  );

  // Keep highest-ever progress to avoid flicker as cached queries refetch
  // and activities briefly arrive as a smaller subset.
  const [progress, setProgress] = useState(liveProgress);
  useEffect(() => {
    if (!ready) return;
    setProgress((prev) => {
      const merged: typeof prev = { ...prev };
      for (const id in liveProgress) {
        const next = liveProgress[id];
        const old = prev[id];
        if (!old || next.value > old.value || next.unlocked) merged[id] = next;
        else merged[id] = old;
      }
      return merged;
    });
  }, [liveProgress, ready]);

  const unlockedCount = Object.values(progress).filter((p) => p.unlocked).length;

  const grouped = useMemo(() => {
    const g: Record<string, BadgeDef[]> = {};
    for (const b of BADGES) (g[b.category] ||= []).push(b);
    return g;
  }, []);

  const selected = selectedId ? BADGES.find((b) => b.id === selectedId) : null;

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft size={16} />
        {isZh ? "返回" : "Back"}
      </button>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-5 text-white">
        <div className="absolute -right-4 -bottom-6 text-8xl opacity-20 select-none">🏅</div>
        <div className="relative">
          <div className="text-[10px] uppercase tracking-wider opacity-90 font-medium">
            {isZh ? "成就" : "Achievements"}
          </div>
          <div className="font-display text-3xl font-bold mt-1">
            {unlockedCount}<span className="text-xl opacity-80"> / {BADGES.length}</span>
          </div>
          <div className="text-xs opacity-90 mt-0.5">
            {isZh ? "已解鎖徽章" : "badges unlocked"}
          </div>
        </div>
      </div>

      {Object.entries(grouped).map(([cat, badges]) => (
        <div key={cat}>
          <h3 className="font-display font-bold text-sm text-foreground mb-2 px-1">
            {isZh ? CATEGORY_LABELS[cat].zh : CATEGORY_LABELS[cat].en}
          </h3>
          <div className="grid grid-cols-3 gap-2.5">
            {badges.map((b) => {
              const p = progress[b.id];
              const unlocked = p?.unlocked ?? false;
              const c = isZh ? b.zh : b.en;
              return (
                <button
                  key={b.id}
                  onClick={() => setSelectedId(b.id)}
                  className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center p-2 transition-all ${
                    unlocked ? "" : "opacity-50 grayscale"
                  }`}
                >
                  <img
                    src={b.image}
                    alt={c.name}
                    loading="lazy"
                    className="w-full h-auto max-h-[72%] object-contain drop-shadow-sm"
                  />
                  <div className={`mt-1 text-[10px] font-semibold text-center leading-tight ${unlocked ? "text-foreground" : "text-muted-foreground"}`}>
                    {c.name}
                  </div>
                  {!unlocked && (
                    <Lock size={10} className="absolute top-1.5 right-1.5 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Detail modal (lightweight) */}
      {selected && (() => {
        const p = progress[selected.id];
        const c = isZh ? selected.zh : selected.en;
        const pct = Math.min(100, Math.round((p.value / p.target) * 100));
        return (
          <div
            onClick={() => setSelectedId(null)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full text-center"
            >
              <img
                src={selected.image}
                alt={c.name}
                className={`w-32 h-32 mx-auto mb-3 object-contain ${p.unlocked ? "" : "grayscale opacity-60"}`}
              />
              <h3 className="font-display text-xl font-bold mb-1">{c.name}</h3>
              <p className="text-xs text-muted-foreground mb-4">{c.desc}</p>



              {selected.target > 1 ? (
                <>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${p.unlocked ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-primary"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground tabular-nums">
                    {Math.round(p.value).toLocaleString()} / {p.target.toLocaleString()} {selected.unit ?? ""}
                  </div>
                </>
              ) : (
                <div className={`text-xs font-semibold ${p.unlocked ? "text-success" : "text-muted-foreground"}`}>
                  {p.unlocked ? (isZh ? "已解鎖" : "Unlocked") : (isZh ? "尚未解鎖" : "Locked")}
                </div>
              )}
              <button
                onClick={() => setSelectedId(null)}
                className="mt-5 w-full bg-foreground text-background font-semibold text-xs uppercase tracking-wider rounded-full py-2.5"
              >
                {isZh ? "關閉" : "Close"}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default BadgesPage;
