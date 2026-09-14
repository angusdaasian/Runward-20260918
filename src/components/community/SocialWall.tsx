import { useEffect, useState } from "react";
import { CalendarDays, Clock, Mountain, Route } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import CommunityPrivacy from "./CommunityPrivacy";
import type { Lang } from "@/lib/i18n";

interface FeedRun { source: string; source_id: string; user_id: string; display_name: string | null; avatar_url: string | null; started_at: string; activity_name: string | null; activity_type: string | null; distance_km: number; duration_s: number | null; elevation_m: number | null }
const duration = (seconds: number | null) => { const s = Math.max(0, Number(seconds || 0)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };

export default function SocialWall({ lang }: { lang: Lang }) {
  const { user } = useAuth();
  const zh = lang === "zh";
  const cacheKey = user ? `social_feed:${user.id}` : "";
  const [runs, setRuns] = useState<FeedRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) { setRuns(JSON.parse(cached) as FeedRun[]); setLoading(false); }
    } catch { /* ignore cache errors */ }
    supabase.rpc("get_social_feed", { p_limit: 40, p_offset: 0 }).then(({ data, error }) => {
      if (!error) {
        const rows = (data || []) as FeedRun[];
        setRuns(rows);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(rows)); } catch { /* ignore cache errors */ }
      }
      setLoading(false);
    });
  }, [user, cacheKey]);

  if (!user) return <div className="py-12 text-center text-sm text-muted-foreground">{zh ? "請登入以查看跑步動態" : "Sign in to view the running feed"}</div>;

  return (
    <div className="space-y-4">
      <CommunityPrivacy lang={lang} />
      {loading && runs.length === 0 ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : runs.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{zh ? "暫時未有公開跑步動態" : "No public runs yet"}</div>
      ) : (
        runs.map((run) => (
          <article key={`${run.source}-${run.source_id}`} className={`rounded-lg border bg-card p-4 ${run.user_id === user.id ? "border-primary/60" : "border-border"}`}>
            <header className="flex items-center gap-3">
              <Avatar><AvatarImage src={run.avatar_url || undefined} /><AvatarFallback>{(run.display_name || "R")[0]}</AvatarFallback></Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {run.user_id === user.id ? (zh ? "你" : "You") : run.display_name || (zh ? "跑者" : "Runner")}
                </p>
                <p className="text-xs text-muted-foreground">{new Date(run.started_at).toLocaleDateString(zh ? "zh-HK" : "en-GB", { month: "short", day: "numeric" })}</p>
              </div>
            </header>
            <h3 className="mt-4 font-semibold">{run.activity_name || run.activity_type || (zh ? "跑步" : "Run")}</h3>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <span className="flex items-center gap-1.5"><Route size={14} className="text-primary" />{Number(run.distance_km).toFixed(2)} km</span>
              <span className="flex items-center gap-1.5"><Clock size={14} className="text-primary" />{duration(run.duration_s)}</span>
              <span className="flex items-center gap-1.5"><Mountain size={14} className="text-primary" />{Math.round(Number(run.elevation_m || 0))} m</span>
            </div>
            <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground"><CalendarDays size={12} />{zh ? "按你最近跑步地點及時間排序" : "Ordered by nearby running activity, then recency"}</p>
          </article>
        ))
      )}
    </div>
  );
}
