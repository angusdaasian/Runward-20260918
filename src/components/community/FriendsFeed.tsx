import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import FeedRunCard, { type FeedRun } from "./FeedRunCard";
import FeedActivityDetail, { type FeedActivityRef } from "./FeedActivityDetail";
import { useFeedSocial } from "@/hooks/use-feed-social";
import type { Lang } from "@/lib/i18n";

export default function FriendsFeed({ lang }: { lang: Lang }) {
  const { user } = useAuth();
  const zh = lang === "zh";
  const cacheKey = user ? `group_feed:${user.id}` : "";
  const [runs, setRuns] = useState<FeedRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<FeedActivityRef | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) { setRuns(JSON.parse(cached) as FeedRun[]); setLoading(false); }
    } catch { /* ignore cache errors */ }
    (supabase.rpc as any)("get_group_feed", { p_limit: 40, p_offset: 0 }).then(({ data, error }: { data: FeedRun[] | null; error: unknown }) => {
      if (!error) {
        const rows = (data || []) as FeedRun[];
        setRuns(rows);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(rows)); } catch { /* ignore cache errors */ }
      }
      setLoading(false);
    });
  }, [user, cacheKey]);

  if (!user) return <div className="py-12 text-center text-sm text-muted-foreground">{zh ? "請登入以查看好友動態" : "Sign in to view your friends' runs"}</div>;

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
        {zh ? "只有你私人群組的成員可以在此互相查看跑步數據，不需開啟公開分享。" : "Only members of your private groups appear here — no public sharing needed."}
      </p>
      {loading && runs.length === 0 ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : runs.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {zh ? "加入或建立群組後，就能看到好友的跑步" : "Join or create a group to see your friends' runs"}
        </div>
      ) : (
        runs.map((run) => (
          <FeedRunCard
            key={`${run.source}-${run.source_id}`}
            run={run}
            lang={lang}
            isSelf={run.user_id === user.id}
            footer={zh ? "群組動態 · 點擊查看詳細數據" : "Group run · tap to see full stats"}
            onOpen={() => setOpen({ source: run.source, source_id: run.source_id })}
          />
        ))
      )}
      {open && <FeedActivityDetail activity={open} lang={lang} onClose={() => setOpen(null)} />}
    </div>
  );
}
