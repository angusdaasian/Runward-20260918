import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import CommunityPrivacy from "./CommunityPrivacy";
import FeedRunCard, { type FeedRun } from "./FeedRunCard";
import FeedActivityDetail, { type FeedActivityRef } from "./FeedActivityDetail";
import { useFeedSocial } from "@/hooks/use-feed-social";
import type { Lang } from "@/lib/i18n";

export default function SocialWall({ lang }: { lang: Lang }) {
  const { user } = useAuth();
  const zh = lang === "zh";
  const cacheKey = user ? `social_feed:${user.id}` : "";
  const [runs, setRuns] = useState<FeedRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState<FeedActivityRef | null>(null);

  useEffect(() => {
    const onChanged = () => setReloadKey((k) => k + 1);
    window.addEventListener("social-prefs-changed", onChanged);
    return () => window.removeEventListener("social-prefs-changed", onChanged);
  }, []);

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
  }, [user, cacheKey, reloadKey]);

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
          <FeedRunCard
            key={`${run.source}-${run.source_id}`}
            run={run}
            lang={lang}
            isSelf={run.user_id === user.id}
            onOpen={() => setOpen({ source: run.source, source_id: run.source_id })}
          />
        ))
      )}
      {open && <FeedActivityDetail activity={open} lang={lang} onClose={() => setOpen(null)} />}
    </div>
  );
}
