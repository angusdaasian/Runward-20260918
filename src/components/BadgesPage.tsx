import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, Lock } from "lucide-react";
import { Lang } from "@/lib/i18n";
import { useActivities } from "@/hooks/use-activities";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { BADGES, BadgeDef, computeBadgeProgress, BadgeProgress } from "@/lib/badges";

interface Props {
  lang: Lang;
  onBack: () => void;
}

const CATEGORY_LABELS: Record<string, { en: string; zh: string }> = {
  distance:  { en: "Distance Milestones", zh: "里程里程碑" },
  streak:    { en: "Streaks",             zh: "連續紀錄" },
  pace:      { en: "Pace Achievements",   zh: "配速成就" },
  elevation: { en: "Elevation",           zh: "爬升" },
  special:   { en: "Special",             zh: "特別徽章" },
};

const BadgesPage = ({ lang, onBack }: Props) => {
  const isZh = lang === "zh";
  const { user } = useAuth();
  const { activities } = useActivities();
  const [premiumActivatedAt, setPremiumActivatedAt] = useState<string | null>(null);
  const [isEarlyAdopter, setIsEarlyAdopter] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("premium_subscriptions")
        .select("activated_at")
        .eq("user_id", user.id)
        .order("activated_at", { ascending: true })
        .limit(1);
      const activatedAt = data?.[0]?.activated_at ?? null;
      setPremiumActivatedAt(activatedAt);
      if (activatedAt) {
        const { count } = await supabase
          .from("premium_subscriptions")
          .select("id", { count: "exact", head: true })
          .lt("activated_at", activatedAt);
        setIsEarlyAdopter((count ?? 999) < 100);
      }
    })();
  }, [user]);

  const progress = useMemo(
    () => computeBadgeProgress({ activities, isEarlyAdopter, premiumActivatedAt }),
    [activities, isEarlyAdopter, premiumActivatedAt]
  );

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
            {isZh ? "成就徽章" : "Achievement Badges"}
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
                  className={`relative aspect-square rounded-2xl border flex flex-col items-center justify-center p-2 transition-all ${
                    unlocked
                      ? "bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-500/20 dark:to-orange-500/20 border-amber-300 dark:border-amber-500/40 shadow-sm"
                      : "bg-muted/40 border-border opacity-60 grayscale"
                  }`}
                >
                  <div className="text-3xl mb-1 leading-none">{b.emoji}</div>
                  <div className={`text-[10px] font-semibold text-center leading-tight ${unlocked ? "text-foreground" : "text-muted-foreground"}`}>
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
              <div className={`text-6xl mb-3 ${p.unlocked ? "" : "grayscale opacity-60"}`}>
                {selected.emoji}
              </div>
              <h3 className="font-display text-xl font-bold mb-1">{c.name}</h3>
              <p className="text-sm text-muted-foreground mb-4">{c.desc}</p>
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
