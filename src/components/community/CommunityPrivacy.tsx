import { useEffect, useState } from "react";
import { Eye, Loader2, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Switch } from "@/components/ui/switch";
import type { Lang } from "@/lib/i18n";

interface Props { lang: Lang; compact?: boolean }

export default function CommunityPrivacy({ lang, compact = false }: Props) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState({ leaderboard_opt_in: false, social_opt_in: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof typeof prefs | null>(null);
  const zh = lang === "zh";

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const cacheKey = `social_prefs:${user.id}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) { setPrefs(JSON.parse(cached)); setLoading(false); }
    } catch { /* ignore cache errors */ }
    supabase.from("social_prefs").select("leaderboard_opt_in, social_opt_in").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        const next = data ?? { leaderboard_opt_in: false, social_opt_in: false };
        setPrefs(next);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* ignore cache errors */ }
        setLoading(false);
      });
  }, [user]);

  const toggle = async (key: keyof typeof prefs, value: boolean) => {
    if (!user) return;
    const previous = prefs;
    setPrefs((current) => ({ ...current, [key]: value }));
    setSaving(key);
    const { error } = await supabase.from("social_prefs").upsert({ user_id: user.id, ...prefs, [key]: value });
    if (error) setPrefs(previous);
    setSaving(null);
  };

  if (!user) return null;

  return (
    <section className={compact ? "space-y-3" : "rounded-lg border border-border bg-card p-4 space-y-4"}>
      {!compact && <h3 className="font-semibold text-foreground">{zh ? "社群隱私" : "Community privacy"}</h3>}
      <div className="flex items-center gap-3">
        <Trophy className="text-primary" size={19} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{zh ? "顯示於排行榜" : "Show me on leaderboards"}</p>
          <p className="text-xs text-muted-foreground">{zh ? "公開每月總公里及跑步次數" : "Share monthly kilometres and run count"}</p>
        </div>
        {loading || saving === "leaderboard_opt_in" ? <Loader2 className="animate-spin text-muted-foreground" size={18} /> : <Switch checked={prefs.leaderboard_opt_in} onCheckedChange={(v) => toggle("leaderboard_opt_in", v)} aria-label={zh ? "顯示於排行榜" : "Show me on leaderboards"} />}
      </div>
      <div className="flex items-center gap-3">
        <Eye className="text-primary" size={19} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{zh ? "公開我的跑步" : "Share my runs publicly"}</p>
          <p className="text-xs text-muted-foreground">{zh ? "只分享基本活動數據，不含心率或健康資料" : "Only basic activity stats, never heart rate or health data"}</p>
        </div>
        {loading || saving === "social_opt_in" ? <Loader2 className="animate-spin text-muted-foreground" size={18} /> : <Switch checked={prefs.social_opt_in} onCheckedChange={(v) => toggle("social_opt_in", v)} aria-label={zh ? "公開我的跑步" : "Share my runs publicly"} />}
      </div>
    </section>
  );
}